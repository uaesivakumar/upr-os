/**
 * Evidence System Types (PRD v1.2 §5)
 *
 * Type definitions for Evidence System v2:
 * - content_hash: SHA256 hash for integrity verification
 * - transform_log: DAG of transformations
 * - freshness_ttl: Time-to-live for staleness detection
 *
 * PRD §5.1: "Evidence is immutable after creation"
 * PRD §5.2: "Every evidence blob has content_hash"
 * PRD §5.3: "Transformations recorded in DAG"
 */

/**
 * Evidence Types
 * @enum {string}
 */
export const EVIDENCE_TYPES = {
  // Raw data sources
  HIRING_SIGNAL: 'hiring_signal',
  FUNDING_SIGNAL: 'funding_signal',
  EXPANSION_SIGNAL: 'expansion_signal',
  NEWS_MENTION: 'news_mention',
  LINKEDIN_DATA: 'linkedin_data',
  COMPANY_DATA: 'company_data',
  CONTACT_DATA: 'contact_data',

  // Derived/transformed
  ENRICHED_COMPANY: 'enriched_company',
  ENRICHED_CONTACT: 'enriched_contact',
  SIVA_SCORE: 'siva_score',
  SIVA_DECISION: 'siva_decision',
  COMPOSITE_SCORE: 'composite_score',

  // External
  API_RESPONSE: 'api_response',
  SEARCH_RESULT: 'search_result',
};

/**
 * Transform Operations
 * @enum {string}
 */
export const TRANSFORM_OPS = {
  // Ingestion
  INGEST_RAW: 'ingest_raw',
  PARSE_JSON: 'parse_json',
  EXTRACT_FIELDS: 'extract_fields',

  // Enrichment
  ENRICH_COMPANY: 'enrich_company',
  ENRICH_CONTACT: 'enrich_contact',
  MERGE_SOURCES: 'merge_sources',

  // SIVA processing
  SIVA_QUALITY_SCORE: 'siva_quality_score',
  SIVA_TIMING_SCORE: 'siva_timing_score',
  SIVA_CONTACT_TIER: 'siva_contact_tier',
  SIVA_PRODUCT_MATCH: 'siva_product_match',
  SIVA_COMPOSITE: 'siva_composite',

  // Filtering
  DEDUPLICATE: 'deduplicate',
  FILTER_STALE: 'filter_stale',
  VALIDATE_SCHEMA: 'validate_schema',
};

/**
 * Freshness TTL Defaults (in seconds)
 * Per PRD §5.4: "Evidence freshness degrades over time"
 */
export const FRESHNESS_TTL = {
  // Real-time signals: 1 hour
  [EVIDENCE_TYPES.HIRING_SIGNAL]: 3600,
  [EVIDENCE_TYPES.FUNDING_SIGNAL]: 3600,
  [EVIDENCE_TYPES.EXPANSION_SIGNAL]: 3600,

  // News: 24 hours
  [EVIDENCE_TYPES.NEWS_MENTION]: 86400,

  // Company/contact data: 7 days
  [EVIDENCE_TYPES.COMPANY_DATA]: 604800,
  [EVIDENCE_TYPES.CONTACT_DATA]: 604800,
  [EVIDENCE_TYPES.LINKEDIN_DATA]: 604800,

  // Enriched data: 24 hours (re-enrichment should happen daily)
  [EVIDENCE_TYPES.ENRICHED_COMPANY]: 86400,
  [EVIDENCE_TYPES.ENRICHED_CONTACT]: 86400,

  // SIVA decisions: 6 hours (can change with new evidence)
  [EVIDENCE_TYPES.SIVA_SCORE]: 21600,
  [EVIDENCE_TYPES.SIVA_DECISION]: 21600,
  [EVIDENCE_TYPES.COMPOSITE_SCORE]: 21600,

  // API responses: 1 hour (cache invalidation)
  [EVIDENCE_TYPES.API_RESPONSE]: 3600,
  [EVIDENCE_TYPES.SEARCH_RESULT]: 3600,

  // Default: 24 hours
  DEFAULT: 86400,
};

/**
 * Evidence Quality Levels
 * @enum {string}
 */
export const QUALITY_LEVELS = {
  VERIFIED: 'verified',     // Human-verified or authoritative source
  HIGH: 'high',             // Multiple sources agree
  MEDIUM: 'medium',         // Single trusted source
  LOW: 'low',               // Inferred or uncertain
  STALE: 'stale',           // Past TTL, needs refresh
};

/**
 * Evidence Schema
 * @typedef {Object} Evidence
 * @property {string} evidence_id - UUID
 * @property {string} evidence_type - EVIDENCE_TYPES enum
 * @property {string} content_hash - SHA256 hash of content
 * @property {Object} content - The actual evidence data
 * @property {TransformLogEntry[]} transform_log - DAG of transformations
 * @property {number} freshness_ttl - TTL in seconds
 * @property {string} quality_level - QUALITY_LEVELS enum
 * @property {string} source - Original data source
 * @property {string} tenant_id - Tenant ID
 * @property {string} entity_id - Related entity (company_id, contact_id, etc.)
 * @property {string} entity_type - Type of related entity
 * @property {Date} created_at - Creation timestamp
 * @property {Date} expires_at - When evidence becomes stale
 */

/**
 * Transform Log Entry (DAG node)
 * @typedef {Object} TransformLogEntry
 * @property {string} transform_id - UUID for this transform
 * @property {string} operation - TRANSFORM_OPS enum
 * @property {string[]} input_hashes - Hashes of input evidence
 * @property {string} output_hash - Hash after transformation
 * @property {Object} metadata - Transform-specific metadata
 * @property {string} tool_name - SIVA tool that performed transform (if applicable)
 * @property {Date} timestamp - When transform occurred
 */

export default {
  EVIDENCE_TYPES,
  TRANSFORM_OPS,
  FRESHNESS_TTL,
  QUALITY_LEVELS,
};
