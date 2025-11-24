/**
 * JSON Schemas for OutreachChannelTool (SELECT_OUTREACH_CHANNEL)
 * SIVA Phase 1: Primitive 6 - SELECT_OUTREACH_CHANNEL
 * SIVA Phase 2: Tool 6 - select_outreach_channel (STRICT)
 *
 * v1.0 Features:
 * - Outcome only (NO reasoning field - formula protected)
 * - Simplified: Always EMAIL primary (LinkedIn in v2.0)
 * - Confidence based on email deliverability
 */

const outreachChannelInputSchema = {
  type: 'object',
  required: ['contact_tier', 'email_deliverability'],
  properties: {
    contact_tier: {
      type: 'string',
      enum: ['STRATEGIC', 'PRIMARY', 'SECONDARY', 'BACKUP'],
      description: 'Contact tier classification'
    },
    email_deliverability: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Email deliverability score (0-1)'
    },
    has_linkedin_profile: {
      type: 'boolean',
      description: 'Whether contact has LinkedIn profile (for v2.0)'
    },
    company_size: {
      type: 'number',
      minimum: 1,
      description: 'Company size (number of employees)'
    },
    industry: {
      type: 'string',
      description: 'Industry sector'
    }
  },
  additionalProperties: false
};

const outreachChannelOutputSchema = {
  type: 'object',
  required: ['primary_channel', 'priority', 'confidence', 'timestamp'],
  properties: {
    primary_channel: {
      type: 'string',
      enum: ['EMAIL', 'LINKEDIN', 'PHONE', 'OTHER'],
      description: 'Primary outreach channel'
    },
    fallback_channel: {
      type: 'string',
      enum: ['EMAIL', 'LINKEDIN', 'PHONE', 'OTHER', null],
      description: 'Fallback channel if primary fails'
    },
    priority: {
      type: 'number',
      minimum: 1,
      description: 'Channel priority (1=highest)'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score (0-1)'
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp of evaluation'
    },
    metadata: {
      type: 'object',
      description: 'Tool metadata (NO reasoning - outcome only)',
      properties: {
        confidenceLevel: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Confidence level classification'
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
  outreachChannelInputSchema,
  outreachChannelOutputSchema
};
