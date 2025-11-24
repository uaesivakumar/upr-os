/**
 * JSON Schemas for OpeningContextTool (GENERATE_OPENING_CONTEXT)
 * SIVA Phase 1: Primitive 7 - GENERATE_OPENING_CONTEXT
 * SIVA Phase 2: Tool 7 - generate_opening_context (STRICT)
 *
 * v1.0 Features:
 * - Template-based generation (5 signal types)
 * - Mixed style based on signal type
 * - Formula protection (NO template selection logic exposed)
 */

const openingContextInputSchema = {
  type: 'object',
  required: ['company_name', 'signal_type'],
  properties: {
    company_name: {
      type: 'string',
      minLength: 1,
      description: 'Company name'
    },
    signal_type: {
      type: 'string',
      enum: ['expansion', 'hiring', 'funding', 'news', 'generic'],
      description: 'Type of business signal detected'
    },
    signal_headline: {
      type: 'string',
      description: 'Signal headline or description'
    },
    industry: {
      type: 'string',
      description: 'Company industry'
    },
    city: {
      type: 'string',
      description: 'UAE city (Dubai, Abu Dhabi, etc.)'
    },
    additional_context: {
      type: 'string',
      description: 'Additional context for customization'
    }
  },
  additionalProperties: false
};

const openingContextOutputSchema = {
  type: 'object',
  required: ['opening_context', 'confidence', 'template_id', 'timestamp'],
  properties: {
    opening_context: {
      type: 'string',
      minLength: 1,
      description: 'Generated opening context (2-3 sentences)'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score (0-1)'
    },
    template_id: {
      type: 'string',
      description: 'Template identifier used'
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp of generation'
    },
    metadata: {
      type: 'object',
      description: 'Tool metadata (NO template selection logic exposed)',
      properties: {
        confidenceLevel: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Confidence level classification'
        },
        signal_freshness: {
          type: 'string',
          description: 'Signal freshness indicator'
        },
        value_proposition: {
          type: 'string',
          description: 'Value proposition variant used'
        }
      }
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
  openingContextInputSchema,
  openingContextOutputSchema
};
