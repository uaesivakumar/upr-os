/**
 * Region Pipeline Context
 * Sprint 71: Region Engine Registry
 *
 * Integrates Region Engine with OS Pipeline, providing region-aware context
 * for all pipeline steps (Discovery, Enrichment, Scoring, Ranking, Outreach)
 */

import { regionRegistry } from './RegionRegistry.js';
import { tenantRegionService } from './TenantRegionService.js';
import {
  DEFAULT_SCORING_MODIFIERS,
  DEFAULT_TIMING_PACK,
  GRANULARITY_LEVELS
} from './types.js';

/**
 * Build region-aware pipeline context
 * @param {Object} options
 * @param {string} options.tenantId - Tenant ID
 * @param {string} options.regionCode - Region code (e.g., 'UAE', 'IND', 'USA')
 * @param {string} options.verticalId - Vertical ID (e.g., 'banking_employee')
 * @param {Object} options.location - Location info from input
 * @returns {Promise<RegionPipelineContext>}
 */
export async function buildRegionPipelineContext({
  tenantId,
  regionCode,
  verticalId,
  location
}) {
  // Initialize registry
  await regionRegistry.initialize();

  let region = null;
  let binding = null;
  let source = 'system_default';

  // Try to resolve region from explicit code first
  if (regionCode) {
    region = await regionRegistry.getRegionByCode(regionCode);
    if (region) source = 'explicit';
  }

  // Try to infer region from location
  if (!region && location) {
    region = await inferRegionFromLocation(location);
    if (region) source = 'inferred';
  }

  // Try tenant default
  if (!region && tenantId) {
    const tenantDefault = await tenantRegionService.getDefaultRegion(tenantId);
    if (tenantDefault) {
      region = tenantDefault;
      source = 'tenant_default';
    }
  }

  // Fall back to system default
  if (!region) {
    region = await regionRegistry.getDefaultRegion();
    source = 'system_default';
  }

  // Get tenant binding if available
  if (tenantId && region) {
    binding = await tenantRegionService.getTenantRegionBinding(tenantId, region.region_id);
  }

  // Get effective modifiers (region + tenant + vertical)
  const effectiveModifiers = await buildEffectiveModifiers(region, binding, verticalId);

  // Get timing pack
  const timingPack = await regionRegistry.getTimingPack(region.region_id, 'default') ||
    DEFAULT_TIMING_PACK;

  // Build context object
  return {
    region,
    binding,
    source,
    verticalId,
    tenantId,

    // Computed values
    effectiveModifiers,
    timingPack,
    salesCycleMultiplier: binding?.custom_sales_cycle_multiplier ||
      region?.sales_cycle_multiplier || 1.0,
    preferredChannels: binding?.custom_preferred_channels ||
      region?.preferred_channels || ['email'],
    timezone: region?.timezone || 'UTC',
    currency: region?.currency_code || 'USD',
    granularity: region?.granularity_level || GRANULARITY_LEVELS.COUNTRY,

    // Helper methods for pipeline steps
    applyScoreModifiers(scores) {
      return applyRegionModifiers(scores, effectiveModifiers);
    },

    adjustSalesCycle(baseDays) {
      const multiplier = this.salesCycleMultiplier;
      return Math.round(baseDays * multiplier);
    },

    getOptimalContactTiming() {
      return {
        days: timingPack.optimal_days,
        hoursStart: timingPack.optimal_hours_start,
        hoursEnd: timingPack.optimal_hours_end,
        frequency: timingPack.contact_frequency_days,
        followUpDelay: timingPack.follow_up_delay_days,
        maxAttempts: timingPack.max_attempts
      };
    },

    isReachable(entityLocation) {
      // Basic reachability check - will be enhanced in Sprint 72
      if (!entityLocation) return true;
      if (!binding?.coverage_territories || binding.coverage_territories.length === 0) {
        return true; // No restrictions
      }
      // Check if entity location matches any coverage territory
      const entityCountry = entityLocation.country || entityLocation.country_code;
      return binding.coverage_territories.some(t =>
        t.startsWith(entityCountry) || entityCountry?.startsWith(t.split('-')[0])
      );
    },

    // Serialization for logging
    toJSON() {
      return {
        region_id: region?.region_id,
        region_code: region?.region_code,
        region_name: region?.region_name,
        source,
        granularity: this.granularity,
        effective_modifiers: effectiveModifiers,
        sales_cycle_multiplier: this.salesCycleMultiplier,
        preferred_channels: this.preferredChannels,
        timezone: this.timezone,
        currency: this.currency,
        vertical_id: verticalId,
        has_binding: !!binding
      };
    }
  };
}

/**
 * Infer region from location string or object
 * @private
 */
async function inferRegionFromLocation(location) {
  if (!location) return null;

  // Handle string location (e.g., "Dubai, UAE")
  if (typeof location === 'string') {
    const locationLower = location.toLowerCase();

    // UAE indicators
    if (locationLower.includes('uae') ||
        locationLower.includes('dubai') ||
        locationLower.includes('abu dhabi') ||
        locationLower.includes('sharjah') ||
        locationLower.includes('united arab emirates')) {
      return regionRegistry.getRegionByCode('UAE');
    }

    // India indicators
    if (locationLower.includes('india') ||
        locationLower.includes('mumbai') ||
        locationLower.includes('bangalore') ||
        locationLower.includes('delhi') ||
        locationLower.includes('hyderabad') ||
        locationLower.includes('chennai')) {
      return regionRegistry.getRegionByCode('IND');
    }

    // US indicators
    if (locationLower.includes('usa') ||
        locationLower.includes('united states') ||
        locationLower.includes('california') ||
        locationLower.includes('new york') ||
        locationLower.includes('texas')) {
      return regionRegistry.getRegionByCode('USA');
    }
  }

  // Handle object location with country_code
  if (typeof location === 'object') {
    const countryCode = location.country_code || location.country;
    if (countryCode) {
      const regions = await regionRegistry.getRegionsByCountry(countryCode);
      if (regions.length > 0) return regions[0];
    }
  }

  return null;
}

/**
 * Build effective modifiers by combining region, tenant, and vertical modifiers
 * @private
 */
async function buildEffectiveModifiers(region, binding, verticalId) {
  // Start with region defaults
  let modifiers = { ...(region?.scoring_modifiers || DEFAULT_SCORING_MODIFIERS) };

  // Apply tenant customizations
  if (binding?.custom_scoring_modifiers) {
    modifiers = {
      q_modifier: binding.custom_scoring_modifiers.q_modifier ?? modifiers.q_modifier,
      t_modifier: binding.custom_scoring_modifiers.t_modifier ?? modifiers.t_modifier,
      l_modifier: binding.custom_scoring_modifiers.l_modifier ?? modifiers.l_modifier,
      e_modifier: binding.custom_scoring_modifiers.e_modifier ?? modifiers.e_modifier
    };
  }

  // Apply vertical-specific modifiers (multiplicative)
  if (verticalId && region) {
    const verticalModifiers = await regionRegistry.getScoreModifiers(
      region.region_id,
      verticalId
    );

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
 * Apply region modifiers to scores
 * @param {Object} scores - {q_score, t_score, l_score, e_score, composite}
 * @param {Object} modifiers - {q_modifier, t_modifier, l_modifier, e_modifier}
 * @returns {Object} Modified scores with breakdown
 */
function applyRegionModifiers(scores, modifiers) {
  const baseScores = {
    q_score: scores.q_score || 0,
    t_score: scores.t_score || 0,
    l_score: scores.l_score || 0,
    e_score: scores.e_score || 0
  };

  const modifiedScores = {
    q_score: Math.min(100, Math.round(baseScores.q_score * modifiers.q_modifier)),
    t_score: Math.min(100, Math.round(baseScores.t_score * modifiers.t_modifier)),
    l_score: Math.min(100, Math.round(baseScores.l_score * modifiers.l_modifier)),
    e_score: Math.min(100, Math.round(baseScores.e_score * modifiers.e_modifier))
  };

  // Recalculate composite (simple average for now, weights come from vertical engine)
  modifiedScores.composite = Math.round(
    (modifiedScores.q_score +
     modifiedScores.t_score +
     modifiedScores.l_score +
     modifiedScores.e_score) / 4
  );

  return {
    ...modifiedScores,
    breakdown: {
      base_scores: baseScores,
      modifiers_applied: modifiers,
      modified_scores: modifiedScores,
      region_impact: {
        q_delta: modifiedScores.q_score - baseScores.q_score,
        t_delta: modifiedScores.t_score - baseScores.t_score,
        l_delta: modifiedScores.l_score - baseScores.l_score,
        e_delta: modifiedScores.e_score - baseScores.e_score
      }
    }
  };
}

export default buildRegionPipelineContext;
