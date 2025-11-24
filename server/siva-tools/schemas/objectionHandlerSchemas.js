/**
 * JSON Schemas for ObjectionHandlerTool (HANDLE_OBJECTION)
 * SIVA Phase 2: Tool 11 - handle_objection (DELEGATED)
 *
 * v1.0 Features:
 * - Objection classification (pattern matching)
 * - LLM-assisted response generation
 * - Conversion probability estimation
 * - Next-step recommendations
 */

const objectionHandlerInputSchema = {
  type: 'object',
  required: ['objection', 'conversation_context'],
  properties: {
    objection: {
      type: 'object',
      required: ['text'],
      properties: {
        text: {
          type: 'string',
          minLength: 1,
          description: 'The actual objection text'
        },
        category: {
          type: 'string',
          description: 'Optional pre-classification'
        }
      }
    },
    conversation_context: {
      type: 'object',
      required: ['company_name', 'contact_name'],
      properties: {
        company_name: {
          type: 'string',
          minLength: 1,
          description: 'Company name'
        },
        contact_name: {
          type: 'string',
          minLength: 1,
          description: 'Contact person name'
        },
        previous_messages_count: {
          type: 'number',
          minimum: 0,
          description: 'Number of previous messages exchanged'
        },
        relationship_stage: {
          type: 'string',
          description: 'Current relationship stage'
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
        size: {
          type: 'number',
          minimum: 1,
          description: 'Company size (number of employees)'
        },
        signals: {
          type: 'array',
          items: { type: 'string' },
          description: 'Business signals detected'
        }
      }
    }
  },
  additionalProperties: false
};

const objectionHandlerOutputSchema = {
  type: 'object',
  required: ['classification', 'response', 'strategy', 'metadata', 'timestamp'],
  properties: {
    classification: {
      type: 'object',
      required: ['objection_type', 'severity', 'is_genuine'],
      properties: {
        objection_type: {
          type: 'string',
          enum: ['ALREADY_HAVE_BANK', 'NOT_INTERESTED', 'NEED_APPROVAL', 'COST_CONCERN', 'TIMING_ISSUE', 'OTHER'],
          description: 'Type of objection'
        },
        severity: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH'],
          description: 'Severity of objection (how blocking it is)'
        },
        is_genuine: {
          type: 'boolean',
          description: 'Whether objection is genuine vs polite brush-off'
        }
      }
    },
    response: {
      type: 'object',
      required: ['acknowledgment', 'reframe', 'value_add', 'next_step'],
      properties: {
        acknowledgment: {
          type: 'string',
          description: 'Validate their concern'
        },
        reframe: {
          type: 'string',
          description: 'Different perspective on the issue'
        },
        value_add: {
          type: 'string',
          description: 'Additional benefit they may not know'
        },
        next_step: {
          type: 'string',
          description: 'Suggested low-friction action'
        }
      }
    },
    strategy: {
      type: 'object',
      required: ['recommended_action', 'follow_up_timing_days'],
      properties: {
        recommended_action: {
          type: 'string',
          enum: ['RESPOND_NOW', 'WAIT_AND_NURTURE', 'CLOSE_OPPORTUNITY'],
          description: 'Recommended next action'
        },
        follow_up_timing_days: {
          type: 'number',
          minimum: 0,
          description: 'Days to wait before follow-up'
        },
        alternative_angle: {
          type: 'string',
          description: 'Alternative approach to try'
        }
      }
    },
    metadata: {
      type: 'object',
      required: ['confidence', 'estimated_conversion_probability'],
      properties: {
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Confidence in response'
        },
        estimated_conversion_probability: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Estimated % chance of conversion'
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
  objectionHandlerInputSchema,
  objectionHandlerOutputSchema
};
