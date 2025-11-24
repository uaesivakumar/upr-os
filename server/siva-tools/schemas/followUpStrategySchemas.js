/**
 * JSON Schemas for FollowUpStrategyTool (DETERMINE_FOLLOWUP_STRATEGY)
 * SIVA Phase 2: Tool 10 - determine_followup_strategy (DELEGATED - Hybrid)
 *
 * v1.0 Features:
 * - Deterministic decision matrix for action recommendation
 * - LLM-assisted follow-up message generation
 * - Engagement score calculation
 * - Multi-channel strategy (Email, LinkedIn)
 */

const followUpStrategyInputSchema = {
  type: 'object',
  required: ['previous_message', 'engagement_signals', 'contact_info'],
  properties: {
    previous_message: {
      type: 'object',
      required: ['subject_line', 'body', 'sent_at'],
      properties: {
        subject_line: {
          type: 'string',
          description: 'Previous message subject'
        },
        body: {
          type: 'string',
          description: 'Previous message body text'
        },
        sent_at: {
          type: 'string',
          format: 'date-time',
          description: 'ISO timestamp when previous message was sent'
        }
      }
    },
    engagement_signals: {
      type: 'object',
      required: ['email_opened', 'links_clicked', 'reply_received', 'days_since_sent'],
      properties: {
        email_opened: {
          type: 'boolean',
          description: 'Whether email was opened'
        },
        links_clicked: {
          type: 'boolean',
          description: 'Whether links in email were clicked'
        },
        reply_received: {
          type: 'boolean',
          description: 'Whether contact replied'
        },
        days_since_sent: {
          type: 'number',
          minimum: 0,
          description: 'Days since message was sent'
        }
      }
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
          description: 'Contact tier from Tool 2'
        },
        company_name: {
          type: 'string',
          description: 'Company name'
        }
      }
    },
    company_context: {
      type: 'object',
      properties: {
        industry: {
          type: 'string',
          description: 'Industry sector'
        },
        signal_type: {
          type: 'string',
          description: 'Business signal type'
        }
      }
    }
  },
  additionalProperties: false
};

const followUpStrategyOutputSchema = {
  type: 'object',
  required: ['recommendation', 'metadata', 'timestamp'],
  properties: {
    recommendation: {
      type: 'object',
      required: ['action', 'timing_days', 'reasoning', 'priority'],
      properties: {
        action: {
          type: 'string',
          enum: ['WAIT', 'FOLLOW_UP_EMAIL', 'FOLLOW_UP_LINKEDIN', 'ESCALATE_CONTACT', 'CLOSE_OPPORTUNITY'],
          description: 'Recommended action'
        },
        timing_days: {
          type: 'number',
          minimum: 0,
          description: 'Days to wait before taking action'
        },
        reasoning: {
          type: 'string',
          description: 'Natural language explanation for recommendation'
        },
        priority: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Priority level for follow-up'
        }
      }
    },
    follow_up_message: {
      type: 'object',
      description: 'Generated follow-up message (only if action = FOLLOW_UP_*)',
      properties: {
        subject_line: {
          type: 'string',
          maxLength: 60,
          description: 'Follow-up subject line'
        },
        opening: {
          type: 'string',
          description: '1-2 sentences acknowledging previous contact'
        },
        body: {
          type: 'string',
          description: '2-3 sentences adding new value/context'
        },
        cta: {
          type: 'string',
          description: '1-2 sentences with alternative options'
        }
      }
    },
    metadata: {
      type: 'object',
      required: ['engagement_score', 'confidence'],
      properties: {
        engagement_score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Engagement score (0-100)'
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Confidence in recommendation'
        },
        engagement_level: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'],
          description: 'Engagement level classification'
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
  followUpStrategyInputSchema,
  followUpStrategyOutputSchema
};
