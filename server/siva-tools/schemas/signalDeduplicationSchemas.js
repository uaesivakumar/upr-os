/**
 * JSON Schemas for SignalDeduplicationTool (CHECK_SIGNAL_DUPLICATION)
 * SIVA Phase 2: Tool 15 - check_signal_duplication (STRICT)
 *
 * Purpose: Detect duplicate hiring signals using fuzzy matching
 * Type: STRICT (Fuzzy matching + database lookup)
 * Replaces: SQL ON CONFLICT logic
 */

const signalDeduplicationInputSchema = {
  type: 'object',
  required: ['company_name', 'signal_type', 'tenant_id'],
  properties: {
    company_name: {
      type: 'string',
      minLength: 1,
      description: 'Company name to check'
    },
    company_domain: {
      type: ['string', 'null'],
      description: 'Company domain (optional but recommended)'
    },
    signal_type: {
      type: 'string',
      description: 'Signal type (HIRING, EXPANSION, etc.)'
    },
    location: {
      type: 'string',
      description: 'UAE location (optional)'
    },
    tenant_id: {
      type: 'string',
      description: 'Tenant ID for multi-tenancy'
    },
    lookback_days: {
      type: 'number',
      minimum: 1,
      maximum: 365,
      description: 'Days to look back for duplicates (default: 30)'
    }
  },
  additionalProperties: false
};

const signalDeduplicationOutputSchema = {
  type: 'object',
  required: ['is_duplicate', 'duplicate_confidence', 'metadata', 'timestamp'],
  properties: {
    is_duplicate: {
      type: 'boolean',
      description: 'Whether signal is a duplicate'
    },
    duplicate_confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence in duplicate detection (0.0-1.0)'
    },
    existing_signal_id: {
      type: ['string', 'null'],
      description: 'ID of existing signal if duplicate'
    },
    match_details: {
      type: ['object', 'null'],
      properties: {
        name_similarity: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Name similarity score (0.0-1.0)'
        },
        domain_match: {
          type: 'boolean',
          description: 'Whether domains match exactly'
        },
        days_since_last: {
          type: 'number',
          minimum: 0,
          description: 'Days since last signal for this company'
        }
      }
    },
    metadata: {
      type: 'object',
      required: ['signals_checked', 'lookback_days'],
      properties: {
        signals_checked: {
          type: 'number',
          minimum: 0,
          description: 'Number of signals checked for duplicates'
        },
        lookback_days: {
          type: 'number',
          minimum: 1,
          description: 'Days looked back'
        }
      }
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp of check'
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
  signalDeduplicationInputSchema,
  signalDeduplicationOutputSchema
};
