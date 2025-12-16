/**
 * TerritoryMappingService - S121.4
 *
 * Geographic distribution - Dubai South rep sees different leads than DIFC rep.
 * OS manages territory assignments and lead routing.
 *
 * ARCHITECTURE:
 * - OS-OWNED: Territory definitions, user assignments
 * - Fair distribution across reps
 * - No territory overlap conflicts
 */

import { getPool } from '../../db/index.js';

class TerritoryMappingService {
  constructor() {
    this.tableName = 'user_territories';
  }

  /**
   * Assign territory to user
   * @param {string} tenantId
   * @param {string} userId
   * @param {Object} territory - { type, value, priority }
   * @returns {Object} Assignment record
   */
  async assignTerritory(tenantId, userId, territory) {
    const pool = getPool();

    const result = await pool.query(`
      INSERT INTO user_territories (
        tenant_id, user_id, territory_type, territory_value, priority
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, user_id, territory_type, territory_value)
      DO UPDATE SET
        priority = EXCLUDED.priority,
        is_active = TRUE,
        updated_at = NOW()
      RETURNING *
    `, [tenantId, userId, territory.type, territory.value, territory.priority || 1]);

    return result.rows[0];
  }

  /**
   * Bulk assign territories to user
   * @param {string} tenantId
   * @param {string} userId
   * @param {Array} territories - [{ type, value, priority }]
   * @returns {Array} Assignment records
   */
  async bulkAssignTerritories(tenantId, userId, territories) {
    const results = [];
    for (const territory of territories) {
      const result = await this.assignTerritory(tenantId, userId, territory);
      results.push(result);
    }
    return results;
  }

  /**
   * Remove territory from user
   * @param {string} tenantId
   * @param {string} userId
   * @param {string} territoryType
   * @param {string} territoryValue
   * @returns {boolean} Success
   */
  async removeTerritory(tenantId, userId, territoryType, territoryValue) {
    const pool = getPool();

    const result = await pool.query(`
      UPDATE user_territories
      SET is_active = FALSE, updated_at = NOW()
      WHERE tenant_id = $1 AND user_id = $2
        AND territory_type = $3 AND territory_value = $4
      RETURNING *
    `, [tenantId, userId, territoryType, territoryValue]);

    return result.rowCount > 0;
  }

  /**
   * Get user's active territories
   * @param {string} tenantId
   * @param {string} userId
   * @returns {Array} Territories
   */
  async getUserTerritories(tenantId, userId) {
    const pool = getPool();

    const result = await pool.query(`
      SELECT * FROM user_territories
      WHERE tenant_id = $1 AND user_id = $2 AND is_active = TRUE
      ORDER BY priority ASC
    `, [tenantId, userId]);

    return result.rows;
  }

  /**
   * Get territory values for filtering discovery pool
   * @param {string} tenantId
   * @param {string} userId
   * @returns {Array} Territory values for SQL filtering
   */
  async getTerritoryValues(tenantId, userId) {
    const territories = await this.getUserTerritories(tenantId, userId);

    // Extract unique values for each type
    const values = {
      countries: [],
      cities: [],
      districts: [],
      freeZones: []
    };

    for (const t of territories) {
      switch (t.territory_type) {
        case 'country':
          values.countries.push(t.territory_value);
          break;
        case 'city':
          values.cities.push(t.territory_value);
          break;
        case 'district':
          values.districts.push(t.territory_value);
          break;
        case 'free_zone':
          values.freeZones.push(t.territory_value);
          break;
      }
    }

    // Flatten to single array for SQL ANY() filter
    return [
      ...values.countries,
      ...values.cities,
      ...values.districts,
      ...values.freeZones
    ];
  }

  /**
   * Get all users in a territory
   * @param {string} tenantId
   * @param {string} territoryType
   * @param {string} territoryValue
   * @returns {Array} Users
   */
  async getUsersInTerritory(tenantId, territoryType, territoryValue) {
    const pool = getPool();

    const result = await pool.query(`
      SELECT DISTINCT user_id, priority
      FROM user_territories
      WHERE tenant_id = $1
        AND territory_type = $2
        AND territory_value = $3
        AND is_active = TRUE
      ORDER BY priority ASC
    `, [tenantId, territoryType, territoryValue]);

    return result.rows;
  }

  /**
   * Check if user has access to a location
   * @param {string} tenantId
   * @param {string} userId
   * @param {Object} location - { city, country, district }
   * @returns {boolean} Has access
   */
  async userHasAccess(tenantId, userId, location) {
    const territories = await this.getUserTerritories(tenantId, userId);

    // If user has no territories assigned, they have access to all (fallback)
    if (territories.length === 0) {
      return true;
    }

    // Check each territory type
    for (const t of territories) {
      if (t.territory_type === 'country' && t.territory_value === location.country) {
        return true;
      }
      if (t.territory_type === 'city' && t.territory_value === location.city) {
        return true;
      }
      if (t.territory_type === 'district' && t.territory_value === location.district) {
        return true;
      }
      if (t.territory_type === 'free_zone' && location.freeZone === t.territory_value) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find best user for a lead based on territory and load
   * @param {string} tenantId
   * @param {Object} lead - { locationCity, locationCountry }
   * @returns {Object} Best user { userId, reason }
   */
  async findBestUserForLead(tenantId, lead) {
    const pool = getPool();

    // Find users with matching territory, ordered by current load
    const result = await pool.query(`
      WITH user_loads AS (
        SELECT
          user_id,
          COUNT(*) FILTER (WHERE status IN ('assigned', 'viewed')) as active_leads
        FROM lead_assignments
        WHERE tenant_id = $1
        GROUP BY user_id
      ),
      matching_users AS (
        SELECT DISTINCT
          ut.user_id,
          ut.priority as territory_priority,
          COALESCE(ul.active_leads, 0) as active_leads
        FROM user_territories ut
        LEFT JOIN user_loads ul ON ut.user_id = ul.user_id
        WHERE ut.tenant_id = $1
          AND ut.is_active = TRUE
          AND (
            (ut.territory_type = 'city' AND ut.territory_value = $2)
            OR (ut.territory_type = 'country' AND ut.territory_value = $3)
            OR (ut.territory_type = 'district' AND ut.territory_value = $4)
          )
      )
      SELECT
        user_id,
        territory_priority,
        active_leads
      FROM matching_users
      ORDER BY
        territory_priority ASC,
        active_leads ASC
      LIMIT 1
    `, [tenantId, lead.locationCity, lead.locationCountry, lead.district || '']);

    if (result.rows.length === 0) {
      return null;
    }

    return {
      userId: result.rows[0].user_id,
      reason: 'territory_match',
      priority: result.rows[0].territory_priority,
      currentLoad: result.rows[0].active_leads
    };
  }

  /**
   * Get territory coverage stats for tenant
   * @param {string} tenantId
   * @returns {Object} Stats
   */
  async getTerritoryStats(tenantId) {
    const pool = getPool();

    const result = await pool.query(`
      SELECT
        territory_type,
        territory_value,
        COUNT(DISTINCT user_id) as user_count,
        ARRAY_AGG(DISTINCT user_id) as users
      FROM user_territories
      WHERE tenant_id = $1 AND is_active = TRUE
      GROUP BY territory_type, territory_value
      ORDER BY territory_type, territory_value
    `, [tenantId]);

    // Also get uncovered regions from discovery pool
    const uncovered = await pool.query(`
      SELECT DISTINCT location_city, location_country
      FROM discovery_pool dp
      WHERE dp.tenant_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM user_territories ut
          WHERE ut.tenant_id = $1
            AND ut.is_active = TRUE
            AND (
              (ut.territory_type = 'city' AND ut.territory_value = dp.location_city)
              OR (ut.territory_type = 'country' AND ut.territory_value = dp.location_country)
            )
        )
      LIMIT 20
    `, [tenantId]);

    return {
      coverage: result.rows,
      uncoveredLocations: uncovered.rows,
      totalTerritories: result.rows.length,
      usersWithTerritories: new Set(result.rows.flatMap(r => r.users)).size
    };
  }

  /**
   * Setup default territories for UAE
   * @param {string} tenantId
   * @returns {Object} Created territories
   */
  async setupDefaultUAETerritories(tenantId) {
    const pool = getPool();

    // Create country-level territory
    const countryResult = await pool.query(`
      INSERT INTO user_territories (tenant_id, user_id, territory_type, territory_value, priority)
      SELECT $1, '00000000-0000-0000-0000-000000000000', 'country', 'UAE', 1
      WHERE NOT EXISTS (
        SELECT 1 FROM user_territories
        WHERE tenant_id = $1 AND territory_type = 'country' AND territory_value = 'UAE'
      )
      RETURNING *
    `, [tenantId]);

    // Create city-level territories for major UAE cities
    const cities = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'RAK', 'Fujairah'];
    const cityResults = [];

    for (const city of cities) {
      const result = await pool.query(`
        INSERT INTO user_territories (tenant_id, user_id, territory_type, territory_value, priority)
        SELECT $1, '00000000-0000-0000-0000-000000000000', 'city', $2, 2
        WHERE NOT EXISTS (
          SELECT 1 FROM user_territories
          WHERE tenant_id = $1 AND territory_type = 'city' AND territory_value = $2
        )
        RETURNING *
      `, [tenantId, city]);

      if (result.rows.length > 0) {
        cityResults.push(result.rows[0]);
      }
    }

    // Create free zone territories
    const freeZones = ['DIFC', 'JAFZA', 'DAFZA', 'Dubai South', 'ADGM', 'Masdar City'];
    const freeZoneResults = [];

    for (const fz of freeZones) {
      const result = await pool.query(`
        INSERT INTO user_territories (tenant_id, user_id, territory_type, territory_value, priority)
        SELECT $1, '00000000-0000-0000-0000-000000000000', 'free_zone', $2, 3
        WHERE NOT EXISTS (
          SELECT 1 FROM user_territories
          WHERE tenant_id = $1 AND territory_type = 'free_zone' AND territory_value = $2
        )
        RETURNING *
      `, [tenantId, fz]);

      if (result.rows.length > 0) {
        freeZoneResults.push(result.rows[0]);
      }
    }

    return {
      country: countryResult.rows[0],
      cities: cityResults,
      freeZones: freeZoneResults
    };
  }
}

export default TerritoryMappingService;
export { TerritoryMappingService };
