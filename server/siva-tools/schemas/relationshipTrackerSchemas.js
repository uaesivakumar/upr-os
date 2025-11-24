/**
 * JSON Schemas for RelationshipTrackerTool (TRACK_RELATIONSHIP_HEALTH)
 * SIVA Phase 2: Tool 12 - track_relationship_health (DELEGATED - Hybrid)
 *
 * v1.0 Features:
 * - RFM (Recency, Frequency, Quality) scoring model
 * - Relationship health tracking (0-100)
 * - Trend analysis (IMPROVING, STABLE, DECLINING)
 * - LLM-assisted nurture content suggestions
 */

const relationshipTrackerInputSchema = {
  type: 'object',
  required: ['interaction_history', 'contact_info', 'current_stage'],
  properties: {
    interaction_history: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['type', 'timestamp'],
        properties: {
          type: {
            type: 'string',
            enum: ['EMAIL_SENT', 'EMAIL_OPENED', 'EMAIL_CLICKED', 'REPLY_RECEIVED', 'CALL_COMPLETED', 'MEETING_HELD'],
            description: 'Type of interaction'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'ISO timestamp of interaction'
          },
          details: {
            type: 'string',
            description: 'Optional interaction details'
          }
        }
      },
      description: 'Chronological interaction history'
    },
    contact_info: {
      type: 'object',
      required: ['name', 'company_name'],
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: 'Contact name'
        },
        tier: {
          type: 'string',
          enum: ['STRATEGIC', 'PRIMARY', 'SECONDARY', 'BACKUP'],
          description: 'Contact tier'
        },
        company_name: {
          type: 'string',
          description: 'Company name'
        },
        industry: {
          type: 'string',
          description: 'Industry sector'
        }
      }
    },
    current_stage: {
      type: 'string',
      enum: ['COLD', 'WARMING', 'ENGAGED', 'OPPORTUNITY', 'CONVERTED', 'DORMANT'],
      description: 'Current relationship stage'
    }
  },
  additionalProperties: false
};

const relationshipTrackerOutputSchema = {
  type: 'object',
  required: ['relationship_health', 'engagement_metrics', 'recommendation', 'metadata', 'timestamp'],
  properties: {
    relationship_health: {
      type: 'object',
      required: ['score', 'health_indicator', 'trend', 'days_since_last_interaction'],
      properties: {
        score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Relationship health score (0-100)'
        },
        health_indicator: {
          type: 'string',
          enum: ['STRONG', 'NEUTRAL', 'WEAKENING', 'LOST'],
          description: 'Health indicator classification'
        },
        trend: {
          type: 'string',
          enum: ['IMPROVING', 'STABLE', 'DECLINING'],
          description: 'Trend direction'
        },
        days_since_last_interaction: {
          type: 'number',
          minimum: 0,
          description: 'Days since last interaction'
        }
      }
    },
    engagement_metrics: {
      type: 'object',
      required: ['recency_score', 'frequency_score', 'quality_score', 'response_rate'],
      properties: {
        recency_score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'How recent is engagement (0-100)'
        },
        frequency_score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'How often they engage (0-100)'
        },
        quality_score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Depth of engagement (0-100)'
        },
        response_rate: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Reply rate (0.0-1.0)'
        }
      }
    },
    recommendation: {
      type: 'object',
      required: ['action', 'timing_days', 'suggested_message_angle', 'priority'],
      properties: {
        action: {
          type: 'string',
          enum: ['NURTURE_CONTENT', 'CHECK_IN', 'RE_ENGAGE', 'ESCALATE', 'ARCHIVE'],
          description: 'Recommended action'
        },
        timing_days: {
          type: 'number',
          minimum: 0,
          description: 'Days to wait before action'
        },
        suggested_message_angle: {
          type: 'string',
          description: 'Suggested approach for next contact'
        },
        priority: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Priority level'
        }
      }
    },
    nurture_content: {
      type: 'object',
      description: 'Suggested content (only if action = NURTURE_CONTENT)',
      properties: {
        content_type: {
          type: 'string',
          enum: ['ARTICLE', 'CASE_STUDY', 'INDUSTRY_UPDATE', 'HELPFUL_RESOURCE'],
          description: 'Type of content to share'
        },
        subject: {
          type: 'string',
          description: 'Email subject line'
        },
        brief: {
          type: 'string',
          description: '2-3 sentences explaining content value'
        }
      }
    },
    metadata: {
      type: 'object',
      required: ['confidence', 'total_interactions', 'conversion_probability'],
      properties: {
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Confidence in assessment'
        },
        total_interactions: {
          type: 'number',
          minimum: 0,
          description: 'Total interaction count'
        },
        conversion_probability: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Estimated conversion probability'
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
        policy_version: { type: 'string' },
        llm_used: { type: 'boolean' },
        llm_tokens: { type: 'number' }
      }
    }
  },
  additionalProperties: false
};

module.exports = {
  relationshipTrackerInputSchema,
  relationshipTrackerOutputSchema
};
