/**
 * JSON Schemas for TimingScoreTool (CALCULATE_TIMING_SCORE)
 * SIVA Phase 1: Primitive 3 - CALCULATE_TIMING_SCORE
 * SIVA Phase 2: Tool 3 - calculate_timing_score (STRICT)
 *
 * v2.0 Changes:
 * - Natural language reasoning (NO formula exposure)
 * - Removed calendar_multiplier, signal_recency_multiplier, signal_type_modifier
 * - Added key_factors array for contextual information
 */

const timingScoreInputSchema = {
  type: 'object',
  required: ['current_date'],
  properties: {
    signal_type: {
      type: 'string',
      enum: ['hiring', 'funding', 'expansion', 'award', 'other'],
      description: 'Type of signal detected'
    },
    signal_age: {
      type: 'number',
      minimum: 0,
      description: 'Days since signal was detected'
    },
    current_date: {
      type: 'string',
      format: 'date',
      description: 'Current date in ISO format (YYYY-MM-DD)'
    },
    fiscal_context: {
      type: 'object',
      properties: {
        quarter: {
          type: 'string',
          enum: ['Q1', 'Q2', 'Q3', 'Q4'],
          description: 'Current fiscal quarter'
        },
        is_ramadan: {
          type: 'boolean',
          description: 'Whether current date is during Ramadan'
        },
        is_post_eid: {
          type: 'boolean',
          description: 'Whether current date is within 2 weeks after Eid'
        },
        is_summer: {
          type: 'boolean',
          description: 'Whether current date is during summer (Jun-Aug)'
        }
      }
    }
  },
  additionalProperties: false
};

const timingScoreOutputSchema = {
  type: 'object',
  required: ['timing_multiplier', 'category', 'confidence', 'reasoning', 'timestamp'],
  properties: {
    timing_multiplier: {
      type: 'number',
      minimum: 0,
      maximum: 2,
      description: 'Final timing multiplier (0.0-2.0)'
    },
    category: {
      type: 'string',
      enum: ['OPTIMAL', 'GOOD', 'FAIR', 'POOR'],
      description: 'Timing category classification'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score (0-1)'
    },
    reasoning: {
      type: 'string',
      minLength: 1,
      description: 'Detailed explanation of timing score'
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp of evaluation'
    },
    metadata: {
      type: 'object',
      description: 'Contextual information (NO numeric multipliers - competitive algorithm protected)',
      properties: {
        calendar_context: {
          type: 'string',
          description: 'Calendar context label'
        },
        signal_freshness: {
          type: 'string',
          enum: ['HOT', 'WARM', 'RECENT', 'STANDARD', 'COOLING', 'COLD', 'STALE'],
          description: 'Signal freshness classification'
        },
        key_factors: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Key factors influencing timing assessment'
        },
        next_optimal_window: {
          type: ['string', 'null'],
          format: 'date',
          description: 'Next optimal outreach window (if current timing is POOR/FAIR)'
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
  timingScoreInputSchema,
  timingScoreOutputSchema
};
