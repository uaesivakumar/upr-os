/**
 * Territory Resolution Service
 * Sprint 72: Geo Granularity & Reachability Layer
 *
 * Handles territory resolution, hierarchy traversal, and pattern matching
 */

import { pool } from '../../../utils/db.js';
import { regionRegistry } from './RegionRegistry.js';
import { GRANULARITY_LEVELS } from './types.js';

class TerritoryService {
  /**
   * Resolve location to territory at appropriate granularity
   * @param {string|Object} location - Location string or object
   * @param {string} regionId - Region ID for granularity config
   * @returns {Promise<GeoResolution>}
   */
  async resolveTerritory(location, regionId = null) {
    const startTime = Date.now();

    // Normalize location input
    const normalizedLocation = this._normalizeLocation(location);

    if (!normalizedLocation) {
      return {
        resolved_territory_code: null,
        resolved_level: 0,
        display_name: 'Unknown',
        hierarchy: [],
        confidence: 0,
        resolution_time_ms: Date.now() - startTime
      };
    }

    // Get region to determine granularity
    let region = null;
    if (regionId) {
      region = await regionRegistry.getRegionById(regionId);
    }

    // Try to find matching territory
    const territory = await this._findMatchingTerritory(normalizedLocation);

    if (!territory) {
      return {
        resolved_territory_code: null,
        resolved_level: 0,
        display_name: normalizedLocation.display || 'Unknown',
        hierarchy: [],
        confidence: 0.2,
        resolution_time_ms: Date.now() - startTime
      };
    }

    // Get appropriate level based on region granularity
    const targetLevel = this._getTargetLevel(region?.granularity_level);
    const resolvedTerritory = await this._resolveToLevel(territory, targetLevel);

    // Build hierarchy
    const hierarchy = await regionRegistry.getTerritoryHierarchy(resolvedTerritory.territory_code);

    return {
      resolved_territory_code: resolvedTerritory.territory_code,
      resolved_level: resolvedTerritory.territory_level,
      display_name: resolvedTerritory.territory_name,
      hierarchy: hierarchy,
      territory: resolvedTerritory,
      confidence: this._calculateConfidence(normalizedLocation, resolvedTerritory),
      resolution_time_ms: Date.now() - startTime
    };
  }

  /**
   * Get parent territory
   * @param {string} territoryCode
   * @returns {Promise<Object|null>}
   */
  async getParentTerritory(territoryCode) {
    const territory = await regionRegistry.getTerritoryByCode(territoryCode);
    if (!territory || !territory.parent_territory_id) {
      return null;
    }
    return regionRegistry.territoriesCache.get(territory.parent_territory_id) || null;
  }

  /**
   * Get child territories
   * @param {string} territoryCode
   * @returns {Promise<Object[]>}
   */
  async getChildTerritories(territoryCode) {
    const territory = await regionRegistry.getTerritoryByCode(territoryCode);
    if (!territory) return [];
    return regionRegistry.getChildTerritories(territory.territory_id);
  }

  /**
   * Match territory against pattern
   * @param {string} territoryCode
   * @param {string} pattern - Pattern like 'US-*', 'IN-MH-*', etc.
   * @returns {Promise<boolean>}
   */
  async matchTerritoryPattern(territoryCode, pattern) {
    if (!territoryCode || !pattern) return false;

    const normalizedCode = territoryCode.toUpperCase();
    const normalizedPattern = pattern.toUpperCase();

    // Exact match
    if (normalizedPattern === normalizedCode) return true;

    // Wildcard match
    if (normalizedPattern.endsWith('*')) {
      const prefix = normalizedPattern.slice(0, -1);
      if (normalizedCode.startsWith(prefix)) return true;
    }

    // Check if pattern matches any ancestor
    const hierarchy = await regionRegistry.getTerritoryHierarchy(territoryCode);
    for (const ancestor of hierarchy) {
      if (normalizedPattern === ancestor.territory_code.toUpperCase()) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all territories at a specific level for a region
   * @param {string} regionId
   * @param {number} level - 1, 2, or 3
   * @returns {Promise<Object[]>}
   */
  async getTerritoriesAtLevel(regionId, level) {
    const territories = await regionRegistry.getTerritoriesByRegion(regionId);
    return territories.filter(t => t.territory_level === level);
  }

  /**
   * Calculate distance between territories (simple hierarchy-based)
   * @param {string} territoryCode1
   * @param {string} territoryCode2
   * @returns {Promise<number>} Distance score 0-1 (0 = same, 1 = far)
   */
  async calculateTerritoryDistance(territoryCode1, territoryCode2) {
    if (!territoryCode1 || !territoryCode2) return 1;
    if (territoryCode1.toUpperCase() === territoryCode2.toUpperCase()) return 0;

    const hierarchy1 = await regionRegistry.getTerritoryHierarchy(territoryCode1);
    const hierarchy2 = await regionRegistry.getTerritoryHierarchy(territoryCode2);

    if (hierarchy1.length === 0 || hierarchy2.length === 0) return 1;

    // Find common ancestor
    const codes1 = new Set(hierarchy1.map(t => t.territory_code.toUpperCase()));

    for (let i = hierarchy2.length - 1; i >= 0; i--) {
      if (codes1.has(hierarchy2[i].territory_code.toUpperCase())) {
        // Common ancestor found - distance based on how far from common ancestor
        const depth1 = hierarchy1.length - hierarchy1.findIndex(t =>
          t.territory_code.toUpperCase() === hierarchy2[i].territory_code.toUpperCase()
        );
        const depth2 = hierarchy2.length - i;
        return Math.min(1, (depth1 + depth2 - 2) / 4);
      }
    }

    // Different regions entirely
    return 1;
  }

  /**
   * Normalize location input to standard format
   * @private
   */
  _normalizeLocation(location) {
    if (!location) return null;

    if (typeof location === 'string') {
      return {
        raw: location,
        display: location,
        parts: location.split(/[,\s]+/).map(p => p.trim().toLowerCase()).filter(Boolean),
        country: this._extractCountry(location),
        city: this._extractCity(location),
        state: this._extractState(location)
      };
    }

    if (typeof location === 'object') {
      return {
        raw: JSON.stringify(location),
        display: location.display || location.city || location.state || location.country || 'Unknown',
        parts: [],
        country: location.country_code || location.country,
        city: location.city,
        state: location.state || location.region,
        latitude: location.latitude || location.lat,
        longitude: location.longitude || location.lng || location.lon
      };
    }

    return null;
  }

  /**
   * Extract country from location string
   * @private
   */
  _extractCountry(locationStr) {
    const lower = locationStr.toLowerCase();
    const countryMappings = {
      'uae': 'AE', 'united arab emirates': 'AE', 'dubai': 'AE', 'abu dhabi': 'AE',
      'india': 'IN', 'mumbai': 'IN', 'bangalore': 'IN', 'delhi': 'IN',
      'usa': 'US', 'united states': 'US', 'us': 'US', 'california': 'US', 'new york': 'US'
    };

    for (const [key, code] of Object.entries(countryMappings)) {
      if (lower.includes(key)) return code;
    }
    return null;
  }

  /**
   * Extract city from location string
   * @private
   */
  _extractCity(locationStr) {
    const lower = locationStr.toLowerCase();
    const cities = {
      'dubai': 'Dubai', 'abu dhabi': 'Abu Dhabi', 'sharjah': 'Sharjah',
      'mumbai': 'Mumbai', 'bangalore': 'Bangalore', 'delhi': 'Delhi',
      'hyderabad': 'Hyderabad', 'chennai': 'Chennai', 'pune': 'Pune',
      'new york': 'New York', 'san francisco': 'San Francisco', 'los angeles': 'Los Angeles',
      'chicago': 'Chicago', 'austin': 'Austin', 'seattle': 'Seattle'
    };

    for (const [key, name] of Object.entries(cities)) {
      if (lower.includes(key)) return name;
    }
    return null;
  }

  /**
   * Extract state from location string
   * @private
   */
  _extractState(locationStr) {
    const lower = locationStr.toLowerCase();
    const states = {
      'california': 'CA', 'new york': 'NY', 'texas': 'TX', 'florida': 'FL',
      'washington': 'WA', 'massachusetts': 'MA', 'illinois': 'IL',
      'maharashtra': 'MH', 'karnataka': 'KA', 'tamil nadu': 'TN',
      'delhi': 'DL', 'telangana': 'TG', 'gujarat': 'GJ'
    };

    for (const [key, code] of Object.entries(states)) {
      if (lower.includes(key)) return code;
    }
    return null;
  }

  /**
   * Find matching territory from normalized location
   * @private
   */
  async _findMatchingTerritory(normalizedLocation) {
    await regionRegistry.initialize();

    // Try exact territory code match
    if (normalizedLocation.country) {
      // Build possible codes
      const possibleCodes = [];

      // Country level
      possibleCodes.push(normalizedLocation.country);

      // State level
      if (normalizedLocation.state) {
        possibleCodes.push(`${normalizedLocation.country}-${normalizedLocation.state}`);
      }

      // City level - try various patterns
      if (normalizedLocation.city) {
        const cityCode = normalizedLocation.city.substring(0, 3).toUpperCase();
        if (normalizedLocation.state) {
          possibleCodes.push(`${normalizedLocation.country}-${normalizedLocation.state}-${cityCode}`);
        }
      }

      // Try to find match
      for (const code of possibleCodes.reverse()) { // Most specific first
        const territory = await regionRegistry.getTerritoryByCode(code);
        if (territory) return territory;
      }

      // Fallback to country level
      const countryTerritory = await regionRegistry.getTerritoryByCode(normalizedLocation.country);
      if (countryTerritory) return countryTerritory;
    }

    // Search by name in parts
    for (const part of normalizedLocation.parts) {
      for (const [code, territory] of regionRegistry.territoriesCache.entries()) {
        if (typeof code !== 'string') continue;
        if (territory.territory_name?.toLowerCase().includes(part)) {
          return territory;
        }
      }
    }

    return null;
  }

  /**
   * Get target level based on granularity setting
   * @private
   */
  _getTargetLevel(granularity) {
    switch (granularity) {
      case GRANULARITY_LEVELS.COUNTRY: return 1;
      case GRANULARITY_LEVELS.STATE: return 2;
      case GRANULARITY_LEVELS.CITY: return 3;
      default: return 2; // Default to state level
    }
  }

  /**
   * Resolve territory to appropriate level
   * @private
   */
  async _resolveToLevel(territory, targetLevel) {
    if (territory.territory_level === targetLevel) {
      return territory;
    }

    // If more specific than needed, go up
    if (territory.territory_level > targetLevel) {
      let current = territory;
      while (current && current.territory_level > targetLevel) {
        current = await this.getParentTerritory(current.territory_code);
      }
      return current || territory;
    }

    // If less specific, return as-is (can't go more specific without more data)
    return territory;
  }

  /**
   * Calculate confidence score for resolution
   * @private
   */
  _calculateConfidence(normalizedLocation, territory) {
    let confidence = 0.5;

    // Exact code match
    if (normalizedLocation.country &&
        territory.territory_code.startsWith(normalizedLocation.country)) {
      confidence += 0.2;
    }

    // Name match
    if (normalizedLocation.city &&
        territory.territory_name?.toLowerCase() === normalizedLocation.city.toLowerCase()) {
      confidence += 0.2;
    }

    // Has coordinates
    if (normalizedLocation.latitude && normalizedLocation.longitude) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }
}

// Singleton instance
export const territoryService = new TerritoryService();
export default territoryService;
