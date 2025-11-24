/**
 * Reachability Filter Engine
 * Sprint 72: Geo Granularity & Reachability Layer
 *
 * Determines if a lead is within sales reach based on territory,
 * timezone offset, and coverage rules
 */

import { territoryService } from './TerritoryService.js';
import { regionRegistry } from './RegionRegistry.js';
import { tenantRegionService } from './TenantRegionService.js';

class ReachabilityFilter {
  /**
   * Check if an entity is reachable for a tenant
   * @param {Object} options
   * @param {string} options.tenantId - Tenant ID
   * @param {string} options.regionId - Region ID
   * @param {Object} options.entityLocation - Entity's location
   * @param {Object} options.coverageConfig - Optional coverage configuration
   * @returns {Promise<ReachabilityResult>}
   */
  async checkReachability({
    tenantId,
    regionId,
    entityLocation,
    coverageConfig = {}
  }) {
    const startTime = Date.now();

    // Default result for missing data
    if (!entityLocation) {
      return {
        reachable: true,
        reason: 'No location data - assuming reachable',
        distance_score: 0.5,
        matched_territories: [],
        coverage_details: { source: 'no_location' },
        check_time_ms: Date.now() - startTime
      };
    }

    // Get tenant's region binding
    let binding = null;
    if (tenantId && regionId) {
      binding = await tenantRegionService.getTenantRegionBinding(tenantId, regionId);
    }

    // Resolve entity's territory
    const resolution = await territoryService.resolveTerritory(entityLocation, regionId);

    // If no binding or no coverage territories, all is reachable
    if (!binding || !binding.coverage_territories || binding.coverage_territories.length === 0) {
      return {
        reachable: true,
        reason: 'No territory restrictions - full region coverage',
        distance_score: 0,
        matched_territories: resolution.hierarchy?.map(t => t.territory_code) || [],
        coverage_details: {
          source: 'no_restrictions',
          resolved_territory: resolution.resolved_territory_code,
          confidence: resolution.confidence
        },
        check_time_ms: Date.now() - startTime
      };
    }

    // Check if resolved territory or any ancestor is in coverage
    const coverageTerritories = binding.coverage_territories;
    const matchedTerritories = [];

    // Check direct match
    if (resolution.resolved_territory_code &&
        coverageTerritories.includes(resolution.resolved_territory_code)) {
      matchedTerritories.push(resolution.resolved_territory_code);
    }

    // Check hierarchy match (entity is within covered territory)
    for (const ancestor of (resolution.hierarchy || [])) {
      if (coverageTerritories.includes(ancestor.territory_code)) {
        matchedTerritories.push(ancestor.territory_code);
      }
    }

    // Check pattern match
    for (const pattern of coverageTerritories) {
      if (pattern.includes('*') && resolution.resolved_territory_code) {
        const isMatch = await territoryService.matchTerritoryPattern(
          resolution.resolved_territory_code,
          pattern
        );
        if (isMatch) {
          matchedTerritories.push(pattern);
        }
      }
    }

    const isReachable = matchedTerritories.length > 0;

    // Calculate distance score (how close to ideal coverage)
    let distanceScore = 1; // Default: far
    if (isReachable) {
      distanceScore = 0;
    } else if (resolution.resolved_territory_code) {
      // Calculate distance to nearest covered territory
      let minDistance = 1;
      for (const coveredCode of coverageTerritories) {
        if (!coveredCode.includes('*')) {
          const distance = await territoryService.calculateTerritoryDistance(
            resolution.resolved_territory_code,
            coveredCode
          );
          minDistance = Math.min(minDistance, distance);
        }
      }
      distanceScore = minDistance;
    }

    return {
      reachable: isReachable,
      reason: isReachable
        ? `Entity in covered territory: ${matchedTerritories.join(', ')}`
        : `Entity outside coverage. Resolved: ${resolution.resolved_territory_code || 'Unknown'}`,
      distance_score: distanceScore,
      matched_territories: matchedTerritories,
      coverage_details: {
        tenant_id: tenantId,
        region_id: regionId,
        coverage_territories: coverageTerritories,
        resolved_territory: resolution.resolved_territory_code,
        resolution_confidence: resolution.confidence,
        entity_hierarchy: resolution.hierarchy?.map(t => t.territory_code) || []
      },
      check_time_ms: Date.now() - startTime
    };
  }

  /**
   * Filter a list of entities by reachability
   * @param {Object[]} entities - Entities with location data
   * @param {Object} options - Same as checkReachability options
   * @returns {Promise<Object>}
   */
  async filterEntities(entities, options) {
    const startTime = Date.now();
    const results = {
      reachable: [],
      unreachable: [],
      unknown: [],
      stats: {
        total: entities.length,
        reachable_count: 0,
        unreachable_count: 0,
        unknown_count: 0,
        avg_distance_score: 0
      }
    };

    let totalDistance = 0;

    for (const entity of entities) {
      const location = entity.location || entity.company_location ||
                       entity.headquarter_location || entity.primary_location;

      const result = await this.checkReachability({
        ...options,
        entityLocation: location
      });

      const enrichedEntity = {
        ...entity,
        reachability: {
          reachable: result.reachable,
          distance_score: result.distance_score,
          matched_territories: result.matched_territories,
          reason: result.reason
        }
      };

      if (result.reachable) {
        results.reachable.push(enrichedEntity);
        results.stats.reachable_count++;
      } else if (result.distance_score < 1) {
        results.unreachable.push(enrichedEntity);
        results.stats.unreachable_count++;
      } else {
        results.unknown.push(enrichedEntity);
        results.stats.unknown_count++;
      }

      totalDistance += result.distance_score;
    }

    results.stats.avg_distance_score = entities.length > 0
      ? totalDistance / entities.length
      : 0;
    results.stats.filter_time_ms = Date.now() - startTime;

    return results;
  }

  /**
   * Check timezone-based reachability
   * @param {string} entityTimezone - Entity's timezone (IANA)
   * @param {string} salesTimezone - Sales team's timezone (IANA)
   * @param {number} maxOffsetHours - Maximum acceptable offset
   * @returns {Object}
   */
  checkTimezoneReachability(entityTimezone, salesTimezone, maxOffsetHours = 6) {
    try {
      const now = new Date();

      // Get timezone offsets
      const entityOffset = this._getTimezoneOffset(entityTimezone);
      const salesOffset = this._getTimezoneOffset(salesTimezone);

      const offsetDiff = Math.abs(entityOffset - salesOffset) / 60; // Convert to hours

      return {
        reachable: offsetDiff <= maxOffsetHours,
        offset_hours: offsetDiff,
        max_allowed: maxOffsetHours,
        entity_timezone: entityTimezone,
        sales_timezone: salesTimezone,
        overlap_hours: Math.max(0, 8 - offsetDiff), // Assuming 8hr workday
        reason: offsetDiff <= maxOffsetHours
          ? `Timezone offset ${offsetDiff}h is within ${maxOffsetHours}h limit`
          : `Timezone offset ${offsetDiff}h exceeds ${maxOffsetHours}h limit`
      };
    } catch (error) {
      return {
        reachable: true,
        offset_hours: 0,
        max_allowed: maxOffsetHours,
        error: error.message,
        reason: 'Could not determine timezone - assuming reachable'
      };
    }
  }

  /**
   * Get timezone offset in minutes
   * @private
   */
  _getTimezoneOffset(timezone) {
    try {
      const now = new Date();
      const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
      const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      return (tzDate - utcDate) / (1000 * 60);
    } catch {
      return 0;
    }
  }

  /**
   * Build reachability filter for SQL queries
   * @param {string[]} coverageTerritories - List of territory codes/patterns
   * @returns {Object} SQL fragment and parameters
   */
  buildSQLFilter(coverageTerritories) {
    if (!coverageTerritories || coverageTerritories.length === 0) {
      return { sql: 'TRUE', params: [] };
    }

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    for (const territory of coverageTerritories) {
      if (territory.includes('*')) {
        // Wildcard pattern
        const prefix = territory.replace('*', '');
        conditions.push(`territory_code LIKE $${paramIndex}`);
        params.push(`${prefix}%`);
      } else {
        // Exact match or ancestor match
        conditions.push(`(territory_code = $${paramIndex} OR territory_code LIKE $${paramIndex + 1})`);
        params.push(territory);
        params.push(`${territory}-%`);
        paramIndex++;
      }
      paramIndex++;
    }

    return {
      sql: `(${conditions.join(' OR ')})`,
      params
    };
  }
}

// Singleton instance
export const reachabilityFilter = new ReachabilityFilter();
export default reachabilityFilter;
