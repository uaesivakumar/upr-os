/**
 * Geo Granularity Resolver
 * Sprint 72: Geo Granularity & Reachability Layer
 *
 * Returns appropriate detail level based on region configuration:
 * - UAE -> country level
 * - India -> city level
 * - US -> state level
 */

import { regionRegistry } from './RegionRegistry.js';
import { territoryService } from './TerritoryService.js';
import { GRANULARITY_LEVELS } from './types.js';

class GeoGranularityResolver {
  /**
   * Resolve location to appropriate granularity for a region
   * @param {string|Object} location - Location to resolve
   * @param {string} regionCode - Region code (e.g., 'UAE', 'IND', 'USA')
   * @returns {Promise<Object>}
   */
  async resolve(location, regionCode) {
    const startTime = Date.now();

    // Get region configuration
    const region = await regionRegistry.getRegionByCode(regionCode);
    if (!region) {
      return {
        success: false,
        error: `Unknown region: ${regionCode}`,
        resolution_time_ms: Date.now() - startTime
      };
    }

    const granularity = region.granularity_level;
    const targetLevel = this._granularityToLevel(granularity);

    // Resolve territory
    const resolution = await territoryService.resolveTerritory(location, region.region_id);

    // Get display at appropriate level
    const displayInfo = this._getDisplayAtLevel(resolution, targetLevel, granularity);

    return {
      success: true,
      region_code: regionCode,
      region_name: region.region_name,
      granularity_level: granularity,
      target_level: targetLevel,

      // Resolved location
      resolved: {
        territory_code: displayInfo.territory_code,
        display_name: displayInfo.display_name,
        level: displayInfo.level,
        full_path: displayInfo.full_path
      },

      // Original resolution details
      raw_resolution: resolution,

      // Formatting helpers
      formatted: {
        short: displayInfo.short,
        medium: displayInfo.medium,
        long: displayInfo.long,
        for_display: displayInfo.for_display
      },

      // Metadata
      confidence: resolution.confidence,
      resolution_time_ms: Date.now() - startTime
    };
  }

  /**
   * Get display name at appropriate level for multiple locations
   * @param {Object[]} entities - Entities with location data
   * @param {string} regionCode - Region code
   * @returns {Promise<Object[]>}
   */
  async resolveMultiple(entities, regionCode) {
    const results = [];

    for (const entity of entities) {
      const location = entity.location || entity.company_location ||
                       entity.headquarter_location || entity.primary_location;

      const resolution = await this.resolve(location, regionCode);

      results.push({
        ...entity,
        resolved_location: resolution.success ? resolution.resolved : null,
        location_display: resolution.success ? resolution.formatted.for_display : 'Unknown'
      });
    }

    return results;
  }

  /**
   * Get appropriate granularity for a country
   * @param {string} countryCode - ISO country code
   * @returns {Promise<string>}
   */
  async getGranularityForCountry(countryCode) {
    const regions = await regionRegistry.getRegionsByCountry(countryCode);
    if (regions.length > 0) {
      return regions[0].granularity_level;
    }

    // Default granularities based on country
    const defaultGranularities = {
      'AE': GRANULARITY_LEVELS.COUNTRY, // UAE
      'IN': GRANULARITY_LEVELS.CITY,    // India
      'US': GRANULARITY_LEVELS.STATE,   // USA
      'GB': GRANULARITY_LEVELS.CITY,    // UK
      'DE': GRANULARITY_LEVELS.STATE,   // Germany
      'CA': GRANULARITY_LEVELS.STATE,   // Canada
      'AU': GRANULARITY_LEVELS.STATE    // Australia
    };

    return defaultGranularities[countryCode] || GRANULARITY_LEVELS.COUNTRY;
  }

  /**
   * Format location for display based on granularity
   * @param {Object} location - Location object
   * @param {string} granularity - Granularity level
   * @returns {string}
   */
  formatForDisplay(location, granularity) {
    if (!location) return 'Unknown';

    switch (granularity) {
      case GRANULARITY_LEVELS.COUNTRY:
        return location.country || location.country_name || 'Unknown';

      case GRANULARITY_LEVELS.STATE:
        if (location.state) {
          return `${location.state}, ${location.country || ''}`.trim();
        }
        return location.country || 'Unknown';

      case GRANULARITY_LEVELS.CITY:
        if (location.city) {
          return `${location.city}, ${location.country || ''}`.trim();
        }
        if (location.state) {
          return `${location.state}, ${location.country || ''}`.trim();
        }
        return location.country || 'Unknown';

      default:
        return location.display || location.city || location.state || location.country || 'Unknown';
    }
  }

  /**
   * Group entities by location at appropriate granularity
   * @param {Object[]} entities - Entities with resolved locations
   * @param {string} regionCode - Region code
   * @returns {Promise<Map>}
   */
  async groupByGranularity(entities, regionCode) {
    const region = await regionRegistry.getRegionByCode(regionCode);
    const granularity = region?.granularity_level || GRANULARITY_LEVELS.COUNTRY;

    const groups = new Map();

    for (const entity of entities) {
      const locationKey = this._getLocationKey(entity, granularity);

      if (!groups.has(locationKey)) {
        groups.set(locationKey, {
          location: locationKey,
          granularity,
          entities: [],
          count: 0
        });
      }

      groups.get(locationKey).entities.push(entity);
      groups.get(locationKey).count++;
    }

    return groups;
  }

  /**
   * Convert granularity to territory level
   * @private
   */
  _granularityToLevel(granularity) {
    switch (granularity) {
      case GRANULARITY_LEVELS.COUNTRY: return 1;
      case GRANULARITY_LEVELS.STATE: return 2;
      case GRANULARITY_LEVELS.CITY: return 3;
      default: return 1;
    }
  }

  /**
   * Get display info at target level
   * @private
   */
  _getDisplayAtLevel(resolution, targetLevel, granularity) {
    const hierarchy = resolution.hierarchy || [];

    // Find territory at target level
    let targetTerritory = hierarchy.find(t => t.territory_level === targetLevel);

    // If not found, use closest available
    if (!targetTerritory && hierarchy.length > 0) {
      targetTerritory = hierarchy[hierarchy.length - 1];
    }

    if (!targetTerritory) {
      return {
        territory_code: null,
        display_name: 'Unknown',
        level: 0,
        full_path: [],
        short: 'Unknown',
        medium: 'Unknown',
        long: 'Unknown',
        for_display: 'Unknown'
      };
    }

    // Build full path names
    const fullPath = hierarchy.map(t => t.territory_name);

    return {
      territory_code: targetTerritory.territory_code,
      display_name: targetTerritory.territory_name,
      level: targetTerritory.territory_level,
      full_path: fullPath,

      // Different format lengths
      short: targetTerritory.territory_name,
      medium: fullPath.slice(-2).join(', '),
      long: fullPath.join(' > '),

      // Appropriate for granularity
      for_display: this._formatForGranularity(hierarchy, granularity)
    };
  }

  /**
   * Format path for specific granularity
   * @private
   */
  _formatForGranularity(hierarchy, granularity) {
    if (hierarchy.length === 0) return 'Unknown';

    switch (granularity) {
      case GRANULARITY_LEVELS.COUNTRY:
        return hierarchy[0]?.territory_name || 'Unknown';

      case GRANULARITY_LEVELS.STATE:
        if (hierarchy.length >= 2) {
          return `${hierarchy[1].territory_name}, ${hierarchy[0].territory_name}`;
        }
        return hierarchy[0]?.territory_name || 'Unknown';

      case GRANULARITY_LEVELS.CITY:
        if (hierarchy.length >= 3) {
          return `${hierarchy[2].territory_name}, ${hierarchy[0].territory_name}`;
        }
        if (hierarchy.length >= 2) {
          return `${hierarchy[1].territory_name}, ${hierarchy[0].territory_name}`;
        }
        return hierarchy[0]?.territory_name || 'Unknown';

      default:
        return hierarchy[hierarchy.length - 1]?.territory_name || 'Unknown';
    }
  }

  /**
   * Get location key for grouping
   * @private
   */
  _getLocationKey(entity, granularity) {
    const loc = entity.resolved_location || entity.location || {};

    switch (granularity) {
      case GRANULARITY_LEVELS.COUNTRY:
        return loc.country || loc.country_code || 'Unknown';
      case GRANULARITY_LEVELS.STATE:
        return `${loc.state || 'Unknown'}, ${loc.country || ''}`.trim();
      case GRANULARITY_LEVELS.CITY:
        return `${loc.city || loc.state || 'Unknown'}, ${loc.country || ''}`.trim();
      default:
        return loc.territory_code || loc.display_name || 'Unknown';
    }
  }
}

// Singleton instance
export const geoGranularityResolver = new GeoGranularityResolver();
export default geoGranularityResolver;
