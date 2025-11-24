/**
 * JSON Schemas for SourceReliabilityTool (EVALUATE_SOURCE_RELIABILITY)
 * SIVA Phase 2: Tool 14 - evaluate_source_reliability (STRICT)
 *
 * Purpose: Score news sources for reliability (0-100)
 * Type: STRICT (Deterministic scoring)
 * Replaces: RADAR's implicit source weighting
 */

const sourceReliabilityInputSchema = {
  type: 'object',
  required: ['source_domain'],
  properties: {
    source_url: {
      type: 'string',
      format: 'uri',
      description: 'Full source URL'
    },
    source_domain: {
      type: 'string',
      minLength: 3,
      description: 'Source domain (e.g., gulfnews.com)'
    },
    source_type: {
      type: 'string',
      enum: ['NEWS', 'JOB_BOARD', 'CORPORATE_WEBSITE', 'BLOG', 'SOCIAL_MEDIA', 'UNKNOWN'],
      description: 'Type of source'
    }
  },
  additionalProperties: false
};

const sourceReliabilityOutputSchema = {
  type: 'object',
  required: ['reliability_score', 'source_tier', 'confidence', 'metadata', 'timestamp'],
  properties: {
    reliability_score: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Reliability score (0-100)'
    },
    source_tier: {
      type: 'string',
      enum: ['TIER_1', 'TIER_2', 'TIER_3', 'UNVERIFIED'],
      description: 'Source tier classification'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence in score (0.0-1.0)'
    },
    metadata: {
      type: 'object',
      required: ['is_verified_source', 'known_for_accuracy'],
      properties: {
        is_verified_source: {
          type: 'boolean',
          description: 'Whether source is in verified list'
        },
        known_for_accuracy: {
          type: 'boolean',
          description: 'Whether source is known for accuracy'
        },
        domain_age_years: {
          type: 'number',
          minimum: 0,
          description: 'Domain age in years (optional)'
        }
      }
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp of evaluation'
    },
    _meta: {
      type: 'object',
      description: 'Internal metadata',
      properties: {
        latency_ms: { type: 'number' },
        tool_name: { type: 'string' },
        tool_type: { type: 'string' },
        policy_version: { type: 'string' }
      }
    }
  },
  additionalProperties: false
};

module.exports = {
  sourceReliabilityInputSchema,
  sourceReliabilityOutputSchema
};
