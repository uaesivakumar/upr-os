/**
 * Region Context Middleware
 * Sprint 71: Region Engine Registry
 *
 * Extracts region from request and attaches RegionContext to req
 * Priority: header > query > body > tenant default > system default
 */

import { regionRegistry } from '../services/regionEngine/RegionRegistry.js';
import { tenantRegionService } from '../services/regionEngine/TenantRegionService.js';
import { DEFAULT_SCORING_MODIFIERS, DEFAULT_TIMING_PACK } from '../services/regionEngine/types.js';

/**
 * Build effective scoring modifiers by merging region + tenant + vertical
 */
async function buildEffectiveModifiers(region, binding, verticalId) {
  // Start with region's base modifiers
  let modifiers = region.scoring_modifiers || DEFAULT_SCORING_MODIFIERS;

  // Apply tenant customizations if any
  if (binding?.custom_scoring_modifiers) {
    modifiers = {
      q_modifier: binding.custom_scoring_modifiers.q_modifier ?? modifiers.q_modifier,
      t_modifier: binding.custom_scoring_modifiers.t_modifier ?? modifiers.t_modifier,
      l_modifier: binding.custom_scoring_modifiers.l_modifier ?? modifiers.l_modifier,
      e_modifier: binding.custom_scoring_modifiers.e_modifier ?? modifiers.e_modifier
    };
  }

  // Get vertical-specific modifiers if applicable
  if (verticalId) {
    const verticalModifiers = await regionRegistry.getScoreModifiers(region.region_id, verticalId);
    if (verticalModifiers) {
      modifiers = {
        q_modifier: modifiers.q_modifier * (verticalModifiers.q_modifier || 1.0),
        t_modifier: modifiers.t_modifier * (verticalModifiers.t_modifier || 1.0),
        l_modifier: modifiers.l_modifier * (verticalModifiers.l_modifier || 1.0),
        e_modifier: modifiers.e_modifier * (verticalModifiers.e_modifier || 1.0)
      };
    }
  }

  return modifiers;
}

/**
 * Create RegionContext middleware
 * @param {Object} options
 * @param {boolean} options.required - If true, return 400 if no valid region found
 * @param {string} options.defaultRegion - Default region code if none provided
 * @returns {Function} Express middleware
 */
export function regionContextMiddleware(options = {}) {
  const { required = false, defaultRegion = 'UAE' } = options;

  return async function regionContext(req, res, next) {
    try {
      let regionCode = null;
      let regionSource = 'system_default';

      // Priority 1: X-Region-Code header
      if (req.headers['x-region-code']) {
        regionCode = req.headers['x-region-code'];
        regionSource = 'header';
      }
      // Priority 2: Query parameter
      else if (req.query.region || req.query.region_code) {
        regionCode = req.query.region || req.query.region_code;
        regionSource = 'query';
      }
      // Priority 3: Request body
      else if (req.body?.region || req.body?.region_code) {
        regionCode = req.body.region || req.body.region_code;
        regionSource = 'body';
      }

      // Get tenant ID from existing tenant context middleware
      const tenantId = req.tenantId || req.body?.tenant_id || req.query?.tenant_id;

      // Initialize registry if needed
      await regionRegistry.initialize();

      let region = null;
      let binding = null;

      // Try to resolve region
      if (regionCode) {
        region = await regionRegistry.getRegionByCode(regionCode);
        if (!region) {
          // Try by ID
          region = await regionRegistry.getRegionById(regionCode);
        }
      }

      // If no region from request, try tenant default
      if (!region && tenantId) {
        const tenantDefault = await tenantRegionService.getDefaultRegion(tenantId);
        if (tenantDefault) {
          region = tenantDefault;
          regionSource = 'tenant_default';
        }
      }

      // Fall back to system default
      if (!region) {
        region = await regionRegistry.getRegionByCode(defaultRegion);
        if (!region) {
          region = await regionRegistry.getDefaultRegion();
        }
        regionSource = 'system_default';
      }

      // Validate region found
      if (!region && required) {
        return res.status(400).json({
          success: false,
          error: 'Region required but not found',
          code: 'REGION_REQUIRED'
        });
      }

      // Get tenant binding if available
      if (tenantId && region) {
        binding = await tenantRegionService.getTenantRegionBinding(tenantId, region.region_id);
      }

      // Get vertical from request (if applicable)
      const verticalId = req.body?.vertical_id || req.query?.vertical_id || req.body?.vertical;

      // Build effective modifiers
      const effectiveModifiers = region
        ? await buildEffectiveModifiers(region, binding, verticalId)
        : DEFAULT_SCORING_MODIFIERS;

      // Get timing pack
      const timingPack = region
        ? await regionRegistry.getTimingPack(region.region_id, 'default')
        : DEFAULT_TIMING_PACK;

      // Build RegionContext
      const regionContext = {
        region: region,
        territory: null, // Will be resolved by GeoGranularity layer (Sprint 72)
        binding: binding,
        effectiveModifiers: effectiveModifiers,
        timingPack: timingPack,
        source: regionSource,
        tenantId: tenantId,
        verticalId: verticalId,

        // Helper methods
        getModifier: (type) => effectiveModifiers[`${type}_modifier`] || 1.0,
        getSalesCycleMultiplier: () => {
          if (binding?.custom_sales_cycle_multiplier) {
            return binding.custom_sales_cycle_multiplier;
          }
          return region?.sales_cycle_multiplier || 1.0;
        },
        getPreferredChannels: () => {
          if (binding?.custom_preferred_channels) {
            return binding.custom_preferred_channels;
          }
          return region?.preferred_channels || ['email'];
        },
        getTimezone: () => region?.timezone || 'UTC',
        getCurrency: () => region?.currency_code || 'USD',
        getGranularity: () => region?.granularity_level || 'country',
        isWorkDay: (date = new Date()) => {
          const day = date.getDay();
          if (!region) return day >= 1 && day <= 5;
          return day >= region.work_week_start && day <= region.work_week_end;
        },
        isBusinessHours: (date = new Date()) => {
          if (!region) return true;
          const timeStr = date.toTimeString().slice(0, 8);
          return timeStr >= region.business_hours_start &&
                 timeStr <= region.business_hours_end;
        }
      };

      // Attach to request
      req.regionContext = regionContext;

      // Also expose simpler helpers
      req.getRegion = () => region;
      req.getRegionCode = () => region?.region_code || defaultRegion;
      req.getRegionId = () => region?.region_id;

      next();
    } catch (error) {
      console.error('[regionContext] Error:', error);

      // On error, provide minimal context to avoid breaking downstream
      req.regionContext = {
        region: null,
        territory: null,
        binding: null,
        effectiveModifiers: DEFAULT_SCORING_MODIFIERS,
        timingPack: DEFAULT_TIMING_PACK,
        source: 'error_fallback',
        error: error.message,
        getModifier: () => 1.0,
        getSalesCycleMultiplier: () => 1.0,
        getPreferredChannels: () => ['email'],
        getTimezone: () => 'UTC',
        getCurrency: () => 'USD',
        getGranularity: () => 'country',
        isWorkDay: () => true,
        isBusinessHours: () => true
      };

      req.getRegion = () => null;
      req.getRegionCode = () => 'UAE';
      req.getRegionId = () => null;

      next();
    }
  };
}

/**
 * Require region middleware - returns 400 if no valid region
 */
export const requireRegion = regionContextMiddleware({ required: true });

/**
 * Optional region middleware - uses default if not provided
 */
export const optionalRegion = regionContextMiddleware({ required: false });

export default regionContextMiddleware;
