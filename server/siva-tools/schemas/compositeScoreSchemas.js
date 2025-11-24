/**
 * JSON Schemas for CompositeScoreTool (GENERATE_COMPOSITE_SCORE)
 * SIVA Phase 1: Primitive 8 - GENERATE_COMPOSITE_SCORE
 * SIVA Phase 2: Tool 8 - generate_composite_score (STRICT)
 *
 * v1.0 Features:
 * - Aggregates outputs from Tools 1-7
 * - Generates final Q-Score (0-100)
 * - Generates Lead Score tier (HOT/WARM/COLD)
 * - Natural language reasoning (NO formula exposed)
 * - Formula protection (scoring weights hidden)
 */

const compositeScoreInputSchema = {
  type: 'object',
  required: ['company_name'],
  properties: {
    company_name: {
      type: 'string',
      minLength: 1,
      description: 'Company name'
    },

    // Tool 1: CompanyQualityTool output
    company_quality_score: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Company quality score from Tool 1 (0-100)'
    },

    // Tool 2: ContactTierTool output
    contact_tier: {
      type: 'string',
      enum: ['STRATEGIC', 'PRIMARY', 'SECONDARY', 'BACKUP'],
      description: 'Contact tier classification from Tool 2'
    },

    // Tool 3: TimingScoreTool output
    timing_category: {
      type: 'string',
      enum: ['OPTIMAL', 'GOOD', 'FAIR', 'POOR'],
      description: 'Timing assessment category from Tool 3'
    },
    timing_score: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Timing score from Tool 3 (0-100)'
    },

    // Tool 4: EdgeCasesTool output
    has_blockers: {
      type: 'boolean',
      description: 'Whether edge case blockers detected (Tool 4)'
    },
    blocker_count: {
      type: 'number',
      minimum: 0,
      description: 'Number of blockers detected (Tool 4)'
    },

    // Tool 5: BankingProductMatchTool output
    product_match_count: {
      type: 'number',
      minimum: 0,
      description: 'Number of banking products matched (Tool 5)'
    },
    top_product_fit_score: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Highest product fit score (Tool 5)'
    },

    // Tool 6: OutreachChannelTool output
    primary_channel: {
      type: 'string',
      enum: ['EMAIL', 'LINKEDIN', 'PHONE', 'OTHER'],
      description: 'Primary outreach channel (Tool 6)'
    },
    channel_confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Channel confidence score (Tool 6)'
    },

    // Tool 7: OpeningContextTool output
    opening_context_confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Opening context confidence (Tool 7)'
    }
  },
  additionalProperties: false
};

const compositeScoreOutputSchema = {
  type: 'object',
  required: ['q_score', 'lead_score_tier', 'reasoning', 'confidence', 'timestamp'],
  properties: {
    q_score: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Final quality score (0-100)'
    },
    lead_score_tier: {
      type: 'string',
      enum: ['HOT', 'WARM', 'COLD', 'DISQUALIFIED'],
      description: 'Lead score tier classification'
    },
    priority: {
      type: 'number',
      minimum: 1,
      description: 'Priority ranking (1=highest)'
    },
    reasoning: {
      type: 'string',
      minLength: 1,
      description: 'Natural language reasoning for score (NO formula exposed)'
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
      description: 'Tool metadata (NO scoring weights exposed)',
      properties: {
        confidenceLevel: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Confidence level classification'
        },
        key_strengths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key strengths contributing to score'
        },
        key_weaknesses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key weaknesses reducing score'
        },
        recommendation: {
          type: 'string',
          description: 'Action recommendation'
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
        policy_version: { type: 'string' },
        tools_aggregated: {
          type: 'number',
          description: 'Number of tools aggregated (1-7)'
        }
      }
    }
  },
  additionalProperties: false
};

module.exports = {
  compositeScoreInputSchema,
  compositeScoreOutputSchema
};
