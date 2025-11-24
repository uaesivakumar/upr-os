/**
 * Tenant Region Service
 * Sprint 71: Region Engine Registry
 *
 * Manages tenant-to-region bindings and tenant-specific region customizations
 */

import { pool } from '../../../utils/db.js';
import { regionRegistry } from './RegionRegistry.js';

class TenantRegionService {
  /**
   * Get all regions bound to a tenant
   * @param {string} tenantId
   * @returns {Promise<Object[]>}
   */
  async getTenantRegions(tenantId) {
    const query = `
      SELECT
        trb.binding_id, trb.tenant_id, trb.region_id, trb.is_default,
        trb.coverage_territories, trb.custom_scoring_modifiers,
        trb.custom_sales_cycle_multiplier, trb.custom_preferred_channels,
        trb.active, trb.created_at, trb.updated_at,
        rp.region_code, rp.region_name, rp.country_code, rp.granularity_level,
        rp.timezone, rp.currency_code, rp.scoring_modifiers as base_scoring_modifiers,
        rp.sales_cycle_multiplier as base_sales_cycle_multiplier,
        rp.preferred_channels as base_preferred_channels
      FROM tenant_region_bindings trb
      JOIN region_profiles rp ON trb.region_id = rp.region_id
      WHERE trb.tenant_id = $1 AND trb.active = true AND rp.active = true
      ORDER BY trb.is_default DESC, rp.region_code
    `;

    const result = await pool.query(query, [tenantId]);
    return result.rows.map(row => this._mergeRegionWithBinding(row));
  }

  /**
   * Get tenant's default region
   * @param {string} tenantId
   * @returns {Promise<Object|null>}
   */
  async getDefaultRegion(tenantId) {
    const query = `
      SELECT
        trb.binding_id, trb.tenant_id, trb.region_id, trb.is_default,
        trb.coverage_territories, trb.custom_scoring_modifiers,
        trb.custom_sales_cycle_multiplier, trb.custom_preferred_channels,
        rp.region_code, rp.region_name, rp.country_code, rp.granularity_level,
        rp.timezone, rp.currency_code, rp.scoring_modifiers as base_scoring_modifiers,
        rp.sales_cycle_multiplier as base_sales_cycle_multiplier,
        rp.preferred_channels as base_preferred_channels
      FROM tenant_region_bindings trb
      JOIN region_profiles rp ON trb.region_id = rp.region_id
      WHERE trb.tenant_id = $1 AND trb.is_default = true
        AND trb.active = true AND rp.active = true
      LIMIT 1
    `;

    const result = await pool.query(query, [tenantId]);

    if (result.rows.length === 0) {
      // Fall back to system default
      return await regionRegistry.getDefaultRegion();
    }

    return this._mergeRegionWithBinding(result.rows[0]);
  }

  /**
   * Get specific region binding for tenant
   * @param {string} tenantId
   * @param {string} regionId
   * @returns {Promise<Object|null>}
   */
  async getTenantRegionBinding(tenantId, regionId) {
    const query = `
      SELECT
        trb.binding_id, trb.tenant_id, trb.region_id, trb.is_default,
        trb.coverage_territories, trb.custom_scoring_modifiers,
        trb.custom_sales_cycle_multiplier, trb.custom_preferred_channels,
        rp.region_code, rp.region_name, rp.country_code, rp.granularity_level,
        rp.timezone, rp.currency_code, rp.scoring_modifiers as base_scoring_modifiers,
        rp.sales_cycle_multiplier as base_sales_cycle_multiplier,
        rp.preferred_channels as base_preferred_channels
      FROM tenant_region_bindings trb
      JOIN region_profiles rp ON trb.region_id = rp.region_id
      WHERE trb.tenant_id = $1 AND trb.region_id = $2
        AND trb.active = true AND rp.active = true
      LIMIT 1
    `;

    const result = await pool.query(query, [tenantId, regionId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this._mergeRegionWithBinding(result.rows[0]);
  }

  /**
   * Bind a tenant to a region
   * @param {string} tenantId
   * @param {string} regionId
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async bindTenantToRegion(tenantId, regionId, options = {}) {
    const {
      isDefault = false,
      coverageTerritories = [],
      customScoringModifiers = null,
      customSalesCycleMultiplier = null,
      customPreferredChannels = null
    } = options;

    // If setting as default, unset existing default first
    if (isDefault) {
      await pool.query(
        `UPDATE tenant_region_bindings SET is_default = false WHERE tenant_id = $1`,
        [tenantId]
      );
    }

    const query = `
      INSERT INTO tenant_region_bindings (
        tenant_id, region_id, is_default, coverage_territories,
        custom_scoring_modifiers, custom_sales_cycle_multiplier,
        custom_preferred_channels, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      ON CONFLICT (tenant_id, region_id) DO UPDATE SET
        is_default = EXCLUDED.is_default,
        coverage_territories = EXCLUDED.coverage_territories,
        custom_scoring_modifiers = EXCLUDED.custom_scoring_modifiers,
        custom_sales_cycle_multiplier = EXCLUDED.custom_sales_cycle_multiplier,
        custom_preferred_channels = EXCLUDED.custom_preferred_channels,
        active = true,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenantId,
      regionId,
      isDefault,
      JSON.stringify(coverageTerritories),
      customScoringModifiers ? JSON.stringify(customScoringModifiers) : null,
      customSalesCycleMultiplier,
      customPreferredChannels ? JSON.stringify(customPreferredChannels) : null
    ]);

    return result.rows[0];
  }

  /**
   * Set default region for tenant
   * @param {string} tenantId
   * @param {string} regionId
   * @returns {Promise<Object>}
   */
  async setDefaultRegion(tenantId, regionId) {
    // Unset all defaults
    await pool.query(
      `UPDATE tenant_region_bindings SET is_default = false WHERE tenant_id = $1`,
      [tenantId]
    );

    // Set new default
    const query = `
      UPDATE tenant_region_bindings
      SET is_default = true, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND region_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [tenantId, regionId]);

    if (result.rows.length === 0) {
      // Create binding if doesn't exist
      return this.bindTenantToRegion(tenantId, regionId, { isDefault: true });
    }

    return result.rows[0];
  }

  /**
   * Unbind a tenant from a region
   * @param {string} tenantId
   * @param {string} regionId
   * @returns {Promise<boolean>}
   */
  async unbindTenantFromRegion(tenantId, regionId) {
    const query = `
      UPDATE tenant_region_bindings
      SET active = false, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND region_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [tenantId, regionId]);
    return result.rows.length > 0;
  }

  /**
   * Update tenant's coverage territories for a region
   * @param {string} tenantId
   * @param {string} regionId
   * @param {string[]} territoryCodes
   * @returns {Promise<Object>}
   */
  async updateCoverageTerritories(tenantId, regionId, territoryCodes) {
    const query = `
      UPDATE tenant_region_bindings
      SET coverage_territories = $3, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND region_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenantId,
      regionId,
      JSON.stringify(territoryCodes)
    ]);

    if (result.rows.length === 0) {
      throw new Error(`No binding found for tenant ${tenantId} and region ${regionId}`);
    }

    return result.rows[0];
  }

  /**
   * Update tenant's custom scoring modifiers for a region
   * @param {string} tenantId
   * @param {string} regionId
   * @param {Object} modifiers - {q_modifier, t_modifier, l_modifier, e_modifier}
   * @returns {Promise<Object>}
   */
  async updateCustomModifiers(tenantId, regionId, modifiers) {
    const query = `
      UPDATE tenant_region_bindings
      SET custom_scoring_modifiers = $3, updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $1 AND region_id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenantId,
      regionId,
      JSON.stringify(modifiers)
    ]);

    if (result.rows.length === 0) {
      throw new Error(`No binding found for tenant ${tenantId} and region ${regionId}`);
    }

    return result.rows[0];
  }

  /**
   * Check if tenant has access to a region
   * @param {string} tenantId
   * @param {string} regionId
   * @returns {Promise<boolean>}
   */
  async hasRegionAccess(tenantId, regionId) {
    const query = `
      SELECT 1 FROM tenant_region_bindings
      WHERE tenant_id = $1 AND region_id = $2 AND active = true
      LIMIT 1
    `;

    const result = await pool.query(query, [tenantId, regionId]);
    return result.rows.length > 0;
  }

  /**
   * Check if a territory is within tenant's coverage
   * @param {string} tenantId
   * @param {string} regionId
   * @param {string} territoryCode
   * @returns {Promise<boolean>}
   */
  async isTerritoryCovered(tenantId, regionId, territoryCode) {
    const binding = await this.getTenantRegionBinding(tenantId, regionId);

    if (!binding) return false;

    // If no specific territories defined, entire region is covered
    if (!binding.coverage_territories || binding.coverage_territories.length === 0) {
      return true;
    }

    // Check if territory or any parent is in coverage
    const hierarchy = await regionRegistry.getTerritoryHierarchy(territoryCode);
    for (const territory of hierarchy) {
      if (binding.coverage_territories.includes(territory.territory_code)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Merge base region with tenant-specific customizations
   * @private
   */
  _mergeRegionWithBinding(row) {
    const baseModifiers = row.base_scoring_modifiers || {};
    const customModifiers = row.custom_scoring_modifiers || {};

    return {
      binding_id: row.binding_id,
      tenant_id: row.tenant_id,
      region_id: row.region_id,
      is_default: row.is_default,
      region_code: row.region_code,
      region_name: row.region_name,
      country_code: row.country_code,
      granularity_level: row.granularity_level,
      timezone: row.timezone,
      currency_code: row.currency_code,
      coverage_territories: row.coverage_territories || [],

      // Merge scoring modifiers (custom overrides base)
      scoring_modifiers: {
        q_modifier: customModifiers.q_modifier ?? baseModifiers.q_modifier ?? 1.0,
        t_modifier: customModifiers.t_modifier ?? baseModifiers.t_modifier ?? 1.0,
        l_modifier: customModifiers.l_modifier ?? baseModifiers.l_modifier ?? 1.0,
        e_modifier: customModifiers.e_modifier ?? baseModifiers.e_modifier ?? 1.0
      },

      // Use custom if set, otherwise base
      sales_cycle_multiplier:
        row.custom_sales_cycle_multiplier ?? row.base_sales_cycle_multiplier ?? 1.0,
      preferred_channels:
        row.custom_preferred_channels ?? row.base_preferred_channels ?? ['email'],

      // Original values for reference
      base_scoring_modifiers: baseModifiers,
      custom_scoring_modifiers: customModifiers,
      has_customizations: !!(
        row.custom_scoring_modifiers ||
        row.custom_sales_cycle_multiplier ||
        row.custom_preferred_channels
      )
    };
  }
}

// Singleton instance
export const tenantRegionService = new TenantRegionService();
export default tenantRegionService;
