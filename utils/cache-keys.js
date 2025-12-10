/**
 * Cache Key Utilities
 * S151: Performance & Caching
 *
 * Standardized cache key generation for consistent caching across the OS.
 */

// Key prefixes for different resource types
export const KEY_PREFIXES = {
  VERTICAL: 'v',
  VERTICAL_CONFIG: 'vc',
  SIGNAL_TYPES: 'st',
  SCORING_TEMPLATE: 'sc',
  EVIDENCE_RULES: 'er',
  PERSONA_TEMPLATES: 'pt',
  JOURNEY_TEMPLATES: 'jt',
  PROVIDER: 'pr',
  PROVIDER_CONFIG: 'pc',
  ENTITY: 'en',
  ENRICHMENT: 'enr',
  SCORE: 'qs',
  RANK: 'rk',
};

/**
 * Generate cache key for vertical
 */
export function verticalKey(slug) {
  return `${KEY_PREFIXES.VERTICAL}:${slug}`;
}

/**
 * Generate cache key for vertical config
 */
export function verticalConfigKey(slug, subVertical = null, region = null) {
  const parts = [KEY_PREFIXES.VERTICAL_CONFIG, slug];
  if (subVertical) parts.push(subVertical);
  if (region) parts.push(region);
  return parts.join(':');
}

/**
 * Generate cache key for signal types
 */
export function signalTypesKey(verticalSlug) {
  return `${KEY_PREFIXES.SIGNAL_TYPES}:${verticalSlug}`;
}

/**
 * Generate cache key for scoring template
 */
export function scoringTemplateKey(verticalSlug, templateName = 'default') {
  return `${KEY_PREFIXES.SCORING_TEMPLATE}:${verticalSlug}:${templateName}`;
}

/**
 * Generate cache key for evidence rules
 */
export function evidenceRulesKey(verticalSlug) {
  return `${KEY_PREFIXES.EVIDENCE_RULES}:${verticalSlug}`;
}

/**
 * Generate cache key for persona templates
 */
export function personaTemplatesKey(verticalSlug) {
  return `${KEY_PREFIXES.PERSONA_TEMPLATES}:${verticalSlug}`;
}

/**
 * Generate cache key for journey templates
 */
export function journeyTemplatesKey(verticalSlug, type = null) {
  const parts = [KEY_PREFIXES.JOURNEY_TEMPLATES, verticalSlug];
  if (type) parts.push(type);
  return parts.join(':');
}

/**
 * Generate cache key for provider
 */
export function providerKey(providerId) {
  return `${KEY_PREFIXES.PROVIDER}:${providerId}`;
}

/**
 * Generate cache key for provider config
 */
export function providerConfigKey(providerId, configType = 'default') {
  return `${KEY_PREFIXES.PROVIDER_CONFIG}:${providerId}:${configType}`;
}

/**
 * Generate cache key for entity
 */
export function entityKey(entityType, entityId) {
  return `${KEY_PREFIXES.ENTITY}:${entityType}:${entityId}`;
}

/**
 * Generate cache key for enrichment result
 */
export function enrichmentKey(domain, sources = []) {
  const sourceKey = sources.length > 0 ? sources.sort().join('-') : 'all';
  return `${KEY_PREFIXES.ENRICHMENT}:${domain}:${sourceKey}`;
}

/**
 * Generate cache key for QTLE score
 */
export function scoreKey(entityId, verticalSlug, context = {}) {
  const contextHash = Object.keys(context)
    .sort()
    .map(k => `${k}=${context[k]}`)
    .join('|') || 'default';
  return `${KEY_PREFIXES.SCORE}:${entityId}:${verticalSlug}:${contextHash}`;
}

/**
 * Generate cache key for ranking result
 */
export function rankKey(entityIds, verticalSlug, rankingMethod = 'qtle') {
  // Hash entity IDs for consistent key
  const idHash = entityIds.sort().slice(0, 5).join('-');
  return `${KEY_PREFIXES.RANK}:${verticalSlug}:${rankingMethod}:${idHash}`;
}

/**
 * Generate glob pattern for invalidation
 */
export function invalidationPattern(prefix, ...segments) {
  const parts = [prefix, ...segments.filter(Boolean)];
  return parts.join(':') + '.*';
}

/**
 * Parse cache key to extract components
 */
export function parseKey(key) {
  const parts = key.split(':');
  const prefix = parts[0];

  // Find prefix name
  const prefixName = Object.entries(KEY_PREFIXES)
    .find(([, v]) => v === prefix)?.[0] || 'UNKNOWN';

  return {
    prefix,
    prefixName,
    segments: parts.slice(1),
    raw: key,
  };
}

export default {
  KEY_PREFIXES,
  verticalKey,
  verticalConfigKey,
  signalTypesKey,
  scoringTemplateKey,
  evidenceRulesKey,
  personaTemplatesKey,
  journeyTemplatesKey,
  providerKey,
  providerConfigKey,
  entityKey,
  enrichmentKey,
  scoreKey,
  rankKey,
  invalidationPattern,
  parseKey,
};
