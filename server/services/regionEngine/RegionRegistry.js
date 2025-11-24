/**
 * Region Registry Service
 * Sprint 71: Region Engine Registry
 *
 * Manages region profiles with in-memory caching and 1hr TTL refresh
 */

import { pool } from '../../../utils/db.js';
import { DEFAULT_REGION, DEFAULT_SCORING_MODIFIERS, DEFAULT_TIMING_PACK } from './types.js';

class RegionRegistry {
  constructor() {
    this.cache = new Map();
    this.territoriesCache = new Map();
    this.scoreModifiersCache = new Map();
    this.timingPacksCache = new Map();
    this.lastRefresh = null;
    this.TTL_MS = 60 * 60 * 1000; // 1 hour
    this.initialized = false;
  }

  /**
   * Initialize the registry by loading all regions into cache
   */
  async initialize() {
    if (this.initialized && !this._isCacheStale()) {
      return;
    }

    try {
      await this.loadRegions();
      await this.loadTerritories();
      await this.loadScoreModifiers();
      await this.loadTimingPacks();
      this.lastRefresh = Date.now();
      this.initialized = true;
      console.log(`[RegionRegistry] Initialized with ${this.cache.size} regions, ${this.territoriesCache.size} territories`);
    } catch (error) {
      console.error('[RegionRegistry] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load all active region profiles into cache
   */
  async loadRegions() {
    const query = `
      SELECT
        region_id, region_code, region_name, country_code, granularity_level,
        timezone, currency_code, work_week_start, work_week_end,
        business_hours_start, business_hours_end, regulations,
        scoring_modifiers, sales_cycle_multiplier, preferred_channels,
        active, created_at, updated_at
      FROM region_profiles
      WHERE active = true
      ORDER BY region_code
    `;

    const result = await pool.query(query);
    this.cache.clear();

    for (const row of result.rows) {
      // Index by both region_id and region_code
      this.cache.set(row.region_id, row);
      this.cache.set(row.region_code.toUpperCase(), row);
    }

    return result.rows;
  }

  /**
   * Load all active territories into cache
   */
  async loadTerritories() {
    const query = `
      SELECT
        territory_id, region_id, territory_code, territory_name, territory_level,
        parent_territory_id, latitude, longitude, population_estimate,
        timezone_override, metadata, active
      FROM territory_definitions
      WHERE active = true
      ORDER BY region_id, territory_level, territory_code
    `;

    const result = await pool.query(query);
    this.territoriesCache.clear();

    for (const row of result.rows) {
      // Index by territory_code
      this.territoriesCache.set(row.territory_code.toUpperCase(), row);
      // Also index by territory_id
      this.territoriesCache.set(row.territory_id, row);
    }

    return result.rows;
  }

  /**
   * Load all score modifiers into cache
   */
  async loadScoreModifiers() {
    const query = `
      SELECT
        modifier_id, region_id, vertical_id,
        q_modifier, t_modifier, l_modifier, e_modifier,
        stakeholder_depth_norm, notes, active
      FROM region_score_modifiers
      WHERE active = true
    `;

    const result = await pool.query(query);
    this.scoreModifiersCache.clear();

    for (const row of result.rows) {
      // Key: region_id:vertical_id (or region_id:default if null vertical)
      const key = `${row.region_id}:${row.vertical_id || 'default'}`;
      this.scoreModifiersCache.set(key, row);
    }

    return result.rows;
  }

  /**
   * Load all timing packs into cache
   */
  async loadTimingPacks() {
    const query = `
      SELECT
        pack_id, region_id, pack_name, optimal_days,
        optimal_hours_start, optimal_hours_end,
        contact_frequency_days, follow_up_delay_days, max_attempts,
        metadata, active
      FROM region_timing_packs
      WHERE active = true
    `;

    const result = await pool.query(query);
    this.timingPacksCache.clear();

    for (const row of result.rows) {
      // Key: region_id:pack_name
      const key = `${row.region_id}:${row.pack_name}`;
      this.timingPacksCache.set(key, row);
    }

    return result.rows;
  }

  /**
   * Check if cache is stale (older than TTL)
   */
  _isCacheStale() {
    if (!this.lastRefresh) return true;
    return Date.now() - this.lastRefresh > this.TTL_MS;
  }

  /**
   * Refresh cache if stale
   */
  async _ensureFresh() {
    if (this._isCacheStale()) {
      await this.initialize();
    }
  }

  /**
   * Get region by code (e.g., 'UAE', 'IND', 'USA')
   * @param {string} regionCode
   * @returns {Promise<Object|null>}
   */
  async getRegionByCode(regionCode) {
    await this._ensureFresh();
    const key = regionCode?.toUpperCase();
    return this.cache.get(key) || null;
  }

  /**
   * Get region by UUID
   * @param {string} regionId
   * @returns {Promise<Object|null>}
   */
  async getRegionById(regionId) {
    await this._ensureFresh();
    return this.cache.get(regionId) || null;
  }

  /**
   * Get all regions for a country
   * @param {string} countryCode - ISO country code (e.g., 'AE', 'IN', 'US')
   * @returns {Promise<Object[]>}
   */
  async getRegionsByCountry(countryCode) {
    await this._ensureFresh();
    const regions = [];
    for (const region of this.cache.values()) {
      if (region.country_code === countryCode.toUpperCase()) {
        regions.push(region);
      }
    }
    return regions;
  }

  /**
   * Get all active regions
   * @returns {Promise<Object[]>}
   */
  async getAllRegions() {
    await this._ensureFresh();
    const regions = [];
    const seen = new Set();
    for (const [key, region] of this.cache.entries()) {
      if (!seen.has(region.region_id)) {
        regions.push(region);
        seen.add(region.region_id);
      }
    }
    return regions;
  }

  /**
   * Get default region (fallback)
   * @returns {Promise<Object>}
   */
  async getDefaultRegion() {
    const region = await this.getRegionByCode(DEFAULT_REGION);
    if (!region) {
      // Return a synthetic default if no regions exist
      return {
        region_id: '00000000-0000-0000-0000-000000000000',
        region_code: DEFAULT_REGION,
        region_name: 'Default Region',
        country_code: 'AE',
        granularity_level: 'country',
        timezone: 'Asia/Dubai',
        currency_code: 'AED',
        work_week_start: 0,
        work_week_end: 4,
        business_hours_start: '09:00:00',
        business_hours_end: '18:00:00',
        regulations: {},
        scoring_modifiers: DEFAULT_SCORING_MODIFIERS,
        sales_cycle_multiplier: 1.0,
        preferred_channels: ['email'],
        active: true
      };
    }
    return region;
  }

  /**
   * Get territory by code
   * @param {string} territoryCode - e.g., 'US-CA', 'IN-MH-MUM'
   * @returns {Promise<Object|null>}
   */
  async getTerritoryByCode(territoryCode) {
    await this._ensureFresh();
    return this.territoriesCache.get(territoryCode?.toUpperCase()) || null;
  }

  /**
   * Get all territories for a region
   * @param {string} regionId
   * @returns {Promise<Object[]>}
   */
  async getTerritoriesByRegion(regionId) {
    await this._ensureFresh();
    const territories = [];
    for (const territory of this.territoriesCache.values()) {
      if (territory.region_id === regionId) {
        territories.push(territory);
      }
    }
    return territories;
  }

  /**
   * Get child territories of a parent
   * @param {string} parentTerritoryId
   * @returns {Promise<Object[]>}
   */
  async getChildTerritories(parentTerritoryId) {
    await this._ensureFresh();
    const children = [];
    for (const territory of this.territoriesCache.values()) {
      if (territory.parent_territory_id === parentTerritoryId) {
        children.push(territory);
      }
    }
    return children;
  }

  /**
   * Get territory hierarchy (path from root to territory)
   * @param {string} territoryCode
   * @returns {Promise<Object[]>}
   */
  async getTerritoryHierarchy(territoryCode) {
    await this._ensureFresh();
    const hierarchy = [];
    let current = await this.getTerritoryByCode(territoryCode);

    while (current) {
      hierarchy.unshift(current);
      if (current.parent_territory_id) {
        current = this.territoriesCache.get(current.parent_territory_id);
      } else {
        break;
      }
    }

    return hierarchy;
  }

  /**
   * Get score modifiers for a region and vertical
   * @param {string} regionId
   * @param {string} verticalId - Optional, uses 'default' if not provided
   * @returns {Promise<Object>}
   */
  async getScoreModifiers(regionId, verticalId = null) {
    await this._ensureFresh();

    // Try vertical-specific first
    if (verticalId) {
      const specificKey = `${regionId}:${verticalId}`;
      const specific = this.scoreModifiersCache.get(specificKey);
      if (specific) return specific;
    }

    // Fall back to region default
    const defaultKey = `${regionId}:default`;
    const defaultModifiers = this.scoreModifiersCache.get(defaultKey);
    if (defaultModifiers) return defaultModifiers;

    // Ultimate fallback
    return {
      q_modifier: 1.0,
      t_modifier: 1.0,
      l_modifier: 1.0,
      e_modifier: 1.0,
      stakeholder_depth_norm: 3
    };
  }

  /**
   * Get timing pack for a region
   * @param {string} regionId
   * @param {string} packName - Optional, defaults to 'default'
   * @returns {Promise<Object>}
   */
  async getTimingPack(regionId, packName = 'default') {
    await this._ensureFresh();

    const key = `${regionId}:${packName}`;
    const pack = this.timingPacksCache.get(key);

    if (pack) return pack;

    // Try default pack for region
    const defaultKey = `${regionId}:default`;
    const defaultPack = this.timingPacksCache.get(defaultKey);

    if (defaultPack) return defaultPack;

    // Ultimate fallback
    return DEFAULT_TIMING_PACK;
  }

  /**
   * Force refresh the cache
   */
  async refresh() {
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      regions: this.cache.size / 2, // Divided by 2 because we index by both id and code
      territories: this.territoriesCache.size / 2,
      scoreModifiers: this.scoreModifiersCache.size,
      timingPacks: this.timingPacksCache.size,
      lastRefresh: this.lastRefresh ? new Date(this.lastRefresh).toISOString() : null,
      cacheAge: this.lastRefresh ? Date.now() - this.lastRefresh : null,
      isStale: this._isCacheStale()
    };
  }
}

// Singleton instance
export const regionRegistry = new RegionRegistry();
export default regionRegistry;
