/**
 * JSON Schemas for OutreachMessageGeneratorTool (GENERATE_OUTREACH_MESSAGE)
 * SIVA Phase 2: Tool 9 - generate_outreach_message (DELEGATED)
 *
 * v1.0 Features:
 * - LLM-assisted message generation (GPT-4)
 * - Schema-locked JSON output
 * - Spam score calculation
 * - Compliance checking (NEVER rules enforcement)
 */

const outreachMessageGeneratorInputSchema = {
  type: 'object',
  required: ['company_context', 'contact_info', 'message_type'],
  properties: {
    company_context: {
      type: 'object',
      required: ['company_name', 'industry'],
      properties: {
        company_name: {
          type: 'string',
          minLength: 1,
          description: 'Company name'
        },
        industry: {
          type: 'string',
          description: 'Industry sector'
        },
        signal_type: {
          type: 'string',
          enum: ['expansion', 'hiring', 'funding', 'news', 'generic'],
          description: 'Type of business signal'
        },
        signal_headline: {
          type: 'string',
          description: 'Signal headline or description'
        },
        city: {
          type: 'string',
          description: 'UAE city'
        }
      }
    },
    opening_context: {
      type: 'string',
      description: 'Pre-generated opening context from Tool 7'
    },
    recommended_products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product_name: { type: 'string' },
          product_category: { type: 'string' }
        }
      },
      description: 'Banking products from Tool 5'
    },
    contact_info: {
      type: 'object',
      required: ['contact_name'],
      properties: {
        contact_name: {
          type: 'string',
          minLength: 1,
          description: 'Contact person name'
        },
        title: {
          type: 'string',
          description: 'Job title'
        },
        tier: {
          type: 'string',
          enum: ['STRATEGIC', 'PRIMARY', 'SECONDARY', 'BACKUP'],
          description: 'Contact tier from Tool 2'
        }
      }
    },
    message_type: {
      type: 'string',
      enum: ['INITIAL', 'FOLLOW_UP', 'RE_ENGAGEMENT'],
      description: 'Type of outreach message'
    },
    tone_preference: {
      type: 'string',
      enum: ['PROFESSIONAL', 'CONVERSATIONAL'],
      description: 'Tone style preference'
    }
  },
  additionalProperties: false
};

const outreachMessageGeneratorOutputSchema = {
  type: 'object',
  required: ['message', 'metadata', 'timestamp'],
  properties: {
    message: {
      type: 'object',
      required: ['subject_line', 'greeting', 'opening_paragraph', 'value_proposition', 'call_to_action', 'signature'],
      properties: {
        subject_line: {
          type: 'string',
          maxLength: 60,
          description: 'Email subject line (max 60 chars)'
        },
        greeting: {
          type: 'string',
          description: 'Email greeting (Dear [Name] or Hi [Name])'
        },
        opening_paragraph: {
          type: 'string',
          description: '2-3 sentences referencing company signal'
        },
        value_proposition: {
          type: 'string',
          description: '2-3 sentences explaining benefits'
        },
        call_to_action: {
          type: 'string',
          description: '1-2 sentences with low-friction ask'
        },
        signature: {
          type: 'string',
          description: 'Siva\'s signature block'
        }
      }
    },
    metadata: {
      type: 'object',
      required: ['tone_used', 'spam_score', 'compliance_flags', 'confidence'],
      properties: {
        tone_used: {
          type: 'string',
          description: 'Tone applied to message'
        },
        estimated_read_time_seconds: {
          type: 'number',
          minimum: 0,
          description: 'Estimated time to read message'
        },
        spam_score: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Spam likelihood score (0.0-1.0, lower is better)'
        },
        compliance_flags: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of compliance violations found'
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Generation confidence score'
        }
      }
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp of generation'
    },
    _meta: {
      type: 'object',
      description: 'Internal metadata',
      properties: {
        latency_ms: { type: 'number' },
        tool_name: { type: 'string' },
        tool_type: { type: 'string' },
        policy_version: { type: 'string' },
        llm_model: { type: 'string' },
        llm_tokens: { type: 'number' }
      }
    }
  },
  additionalProperties: false
};

module.exports = {
  outreachMessageGeneratorInputSchema,
  outreachMessageGeneratorOutputSchema
};
