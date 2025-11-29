/**
 * Vertical-Aware Provider Chain
 * Sprint 50: API Provider Management
 *
 * Service for executing provider chains with vertical-specific logic.
 * Different verticals (banking, insurance, real estate, etc.) have
 * different data requirements and provider preferences.
 *
 * Key Features:
 * - Vertical-specific provider selection
 * - Field priority by vertical
 * - Automatic data merging and conflict resolution
 * - Quality scoring per vertical
 */

import * as providerRegistry from './providerRegistry.js';
import * as mcpAdapter from './mcpProviderAdapter.js';

// ============================================================================
// VERTICAL CONFIGURATIONS
// ============================================================================

const VERTICAL_CONFIGS = {
  banking: {
    name: 'Banking & Financial Services',
    slug: 'banking',
    priorityFields: [
      'company_name', 'industry', 'employee_count', 'revenue',
      'headquarters', 'regulatory_status', 'founding_year'
    ],
    requiredFields: ['company_name', 'industry'],
    preferredProviders: ['zoominfo', 'clearbit', 'apollo'],
    excludedProviders: [],
    enrichmentDepth: 'full',
    complianceRequired: true,
    dataFreshnessMaxDays: 30
  },

  insurance: {
    name: 'Insurance',
    slug: 'insurance',
    priorityFields: [
      'company_name', 'industry', 'sub_industry', 'employee_count',
      'headquarters', 'licenses', 'founding_year'
    ],
    requiredFields: ['company_name', 'industry'],
    preferredProviders: ['zoominfo', 'apollo', 'clearbit'],
    excludedProviders: [],
    enrichmentDepth: 'full',
    complianceRequired: true,
    dataFreshnessMaxDays: 30
  },

  real_estate: {
    name: 'Real Estate',
    slug: 'real_estate',
    priorityFields: [
      'company_name', 'property_types', 'regions', 'portfolio_size',
      'headquarters', 'founding_year'
    ],
    requiredFields: ['company_name'],
    preferredProviders: ['apollo', 'clearbit', 'linkedin_scraper'],
    excludedProviders: [],
    enrichmentDepth: 'standard',
    complianceRequired: false,
    dataFreshnessMaxDays: 60
  },

  saas: {
    name: 'SaaS & Technology',
    slug: 'saas',
    priorityFields: [
      'company_name', 'product', 'tech_stack', 'funding_stage',
      'employee_count', 'growth_rate', 'founded'
    ],
    requiredFields: ['company_name', 'domain'],
    preferredProviders: ['clearbit', 'apollo', 'hunter'],
    excludedProviders: [],
    enrichmentDepth: 'full',
    complianceRequired: false,
    dataFreshnessMaxDays: 14
  },

  recruitment: {
    name: 'Recruitment & Staffing',
    slug: 'recruitment',
    priorityFields: [
      'full_name', 'current_title', 'current_company', 'skills',
      'experience', 'location', 'education'
    ],
    requiredFields: ['full_name'],
    preferredProviders: ['linkedin_scraper', 'salesnav_mcp', 'apollo'],
    excludedProviders: [],
    enrichmentDepth: 'full',
    complianceRequired: false,
    dataFreshnessMaxDays: 7
  },

  default: {
    name: 'General',
    slug: 'default',
    priorityFields: [
      'company_name', 'industry', 'employee_count', 'headquarters'
    ],
    requiredFields: ['company_name'],
    preferredProviders: ['apollo', 'clearbit', 'hunter'],
    excludedProviders: [],
    enrichmentDepth: 'standard',
    complianceRequired: false,
    dataFreshnessMaxDays: 30
  }
};

// ============================================================================
// VERTICAL PROVIDER CHAIN
// ============================================================================

/**
 * Execute a vertical-aware enrichment chain
 *
 * @param {string} vertical - Vertical slug
 * @param {Object} entity - Entity to enrich
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Enrichment result
 */
async function executeVerticalChain(vertical, entity, options = {}) {
  const config = VERTICAL_CONFIGS[vertical] || VERTICAL_CONFIGS.default;
  const { tenantId, forceRefresh = false, maxProviders = 3 } = options;

  console.log(`[VerticalChain] Executing for vertical: ${config.name}`);

  // Get providers for this vertical
  const providers = await getVerticalProviders(config, tenantId);

  if (providers.length === 0) {
    return {
      success: false,
      error: `No providers available for vertical: ${vertical}`,
      vertical: config.slug
    };
  }

  // Execute providers in priority order
  const results = [];
  const errors = [];
  let mergedData = {};

  for (const provider of providers.slice(0, maxProviders)) {
    try {
      const result = await executeProviderForVertical(provider, entity, config);

      if (result.success && result.data) {
        results.push({
          provider: provider.provider_slug,
          data: result.data,
          responseTimeMs: result.responseTimeMs
        });

        // Merge data with conflict resolution
        mergedData = mergeEnrichmentData(mergedData, result.data, config);

        // Check if we have enough data
        if (hasRequiredFields(mergedData, config)) {
          console.log(`[VerticalChain] Required fields satisfied after ${provider.provider_slug}`);
          break;
        }
      }
    } catch (err) {
      console.error(`[VerticalChain] Provider ${provider.provider_slug} failed:`, err.message);
      errors.push({
        provider: provider.provider_slug,
        error: err.message
      });
    }
  }

  // Calculate quality score
  const qualityScore = calculateVerticalQualityScore(mergedData, config);

  return {
    success: Object.keys(mergedData).length > 0,
    vertical: config.slug,
    data: mergedData,
    qualityScore,
    sources: results.map(r => r.provider),
    fieldsEnriched: Object.keys(mergedData),
    missingFields: getMissingFields(mergedData, config),
    providers: results,
    errors
  };
}

/**
 * Get providers ordered for a specific vertical
 */
async function getVerticalProviders(config, tenantId = null) {
  // Get available providers for the main capability
  const capability = config.slug === 'recruitment' ? 'contact_lookup' : 'company_enrichment';

  const allProviders = await providerRegistry.getProvidersForCapability(capability, {
    vertical: config.slug,
    tenantId,
    includeFallbacks: true
  });

  // Filter and reorder based on vertical preferences
  const preferredSet = new Set(config.preferredProviders);
  const excludedSet = new Set(config.excludedProviders);

  return allProviders
    .filter(p => !excludedSet.has(p.provider_slug))
    .sort((a, b) => {
      const aPreferred = preferredSet.has(a.provider_slug);
      const bPreferred = preferredSet.has(b.provider_slug);

      if (aPreferred && !bPreferred) return -1;
      if (!aPreferred && bPreferred) return 1;

      // Fallback to priority
      return a.priority - b.priority;
    });
}

/**
 * Execute a single provider with vertical context
 */
async function executeProviderForVertical(providerInfo, entity, verticalConfig) {
  const provider = await providerRegistry.getProvider(providerInfo.provider_id);

  if (!provider) {
    throw new Error(`Provider not found: ${providerInfo.provider_id}`);
  }

  const startTime = Date.now();

  // Check rate limits
  const rateLimit = await providerRegistry.checkRateLimit(provider.id);
  if (rateLimit.isLimited) {
    throw new Error('Provider rate limited');
  }

  // Execute based on provider type
  let result;

  if (provider.provider_type === 'mcp') {
    result = await mcpAdapter.executeMCPProvider(provider, {
      entity,
      operation: verticalConfig.slug === 'recruitment' ? 'contact_lookup' : 'company_enrichment'
    });
  } else {
    // Execute REST API provider
    result = await executeRESTProvider(provider, entity, verticalConfig);
  }

  const responseTimeMs = Date.now() - startTime;

  // Record the request
  await providerRegistry.recordRequest(provider.id, true);
  await providerRegistry.recordHealthCheck(provider.id, {
    responseTimeMs,
    isSuccess: true
  });

  return {
    success: true,
    data: result.data || result,
    responseTimeMs
  };
}

/**
 * Execute a REST API provider
 */
async function executeRESTProvider(provider, entity, verticalConfig) {
  // This would contain the actual API calls to providers like Apollo, Clearbit, etc.
  // For now, we return a placeholder that delegates to the existing enrichment service

  const { runEnrichmentChain } = await import('./enrichmentProviders.js');

  // If entity has email, use email-based enrichment
  if (entity.email) {
    return runEnrichmentChain(entity.email, entity.name);
  }

  // For company enrichment, use domain-based lookup
  if (entity.domain) {
    // Placeholder - would call actual provider API
    return {
      source: provider.slug,
      data: {
        domain: entity.domain,
        enriched: true
      }
    };
  }

  throw new Error('No enrichable identifier (email or domain)');
}

/**
 * Merge enrichment data with conflict resolution
 */
function mergeEnrichmentData(existing, newData, verticalConfig) {
  const merged = { ...existing };
  const priorityFields = new Set(verticalConfig.priorityFields);

  for (const [key, value] of Object.entries(newData)) {
    if (!value) continue;

    // If field doesn't exist, add it
    if (!merged[key]) {
      merged[key] = value;
      continue;
    }

    // If new value is higher priority, replace
    if (priorityFields.has(key)) {
      // Prefer more complete values
      if (isMoreComplete(value, merged[key])) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

/**
 * Check if a value is more complete than another
 */
function isMoreComplete(newValue, existingValue) {
  if (!existingValue) return true;
  if (!newValue) return false;

  // String length comparison
  if (typeof newValue === 'string' && typeof existingValue === 'string') {
    return newValue.length > existingValue.length;
  }

  // Array length comparison
  if (Array.isArray(newValue) && Array.isArray(existingValue)) {
    return newValue.length > existingValue.length;
  }

  // Object key count comparison
  if (typeof newValue === 'object' && typeof existingValue === 'object') {
    return Object.keys(newValue).length > Object.keys(existingValue).length;
  }

  return false;
}

/**
 * Check if all required fields are present
 */
function hasRequiredFields(data, verticalConfig) {
  return verticalConfig.requiredFields.every(field => {
    const value = data[field];
    return value !== undefined && value !== null && value !== '';
  });
}

/**
 * Get missing required and priority fields
 */
function getMissingFields(data, verticalConfig) {
  const missing = {
    required: [],
    priority: []
  };

  for (const field of verticalConfig.requiredFields) {
    if (!data[field]) {
      missing.required.push(field);
    }
  }

  for (const field of verticalConfig.priorityFields) {
    if (!data[field] && !missing.required.includes(field)) {
      missing.priority.push(field);
    }
  }

  return missing;
}

/**
 * Calculate quality score for vertical
 */
function calculateVerticalQualityScore(data, verticalConfig) {
  const requiredWeight = 0.6;
  const priorityWeight = 0.4;

  // Required fields score
  const requiredScore = verticalConfig.requiredFields.filter(f => data[f]).length /
    verticalConfig.requiredFields.length;

  // Priority fields score
  const priorityScore = verticalConfig.priorityFields.filter(f => data[f]).length /
    verticalConfig.priorityFields.length;

  // Weighted score
  const score = (requiredScore * requiredWeight) + (priorityScore * priorityWeight);

  return Math.round(score * 100);
}

/**
 * Get available verticals
 */
function getVerticals() {
  return Object.entries(VERTICAL_CONFIGS)
    .filter(([slug]) => slug !== 'default')
    .map(([slug, config]) => ({
      slug,
      name: config.name,
      requiredFields: config.requiredFields,
      priorityFields: config.priorityFields
    }));
}

/**
 * Get vertical configuration
 */
function getVerticalConfig(vertical) {
  return VERTICAL_CONFIGS[vertical] || VERTICAL_CONFIGS.default;
}

export {
  executeVerticalChain,
  getVerticalProviders,
  getVerticals,
  getVerticalConfig,
  VERTICAL_CONFIGS
};
