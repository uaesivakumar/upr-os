/**
 * JSON Schemas for HiringSignalExtractionTool (EXTRACT_HIRING_SIGNALS)
 * SIVA Phase 2: Tool 13 - extract_hiring_signals (DELEGATED)
 *
 * Purpose: Extract structured hiring signals from news articles/web content
 * Type: DELEGATED (GPT-4 with schema-locking)
 * Replaces: RADAR's inline 60-line extraction prompt
 */

const hiringSignalExtractionInputSchema = {
  type: 'object',
  required: ['source', 'content', 'context'],
  properties: {
    source: {
      type: 'object',
      required: ['url', 'domain'],
      properties: {
        url: {
          type: 'string',
          format: 'uri',
          description: 'Source article URL'
        },
        domain: {
          type: 'string',
          description: 'Source domain (e.g., gulfnews.com)'
        },
        published_at: {
          type: 'string',
          format: 'date-time',
          description: 'Article publication date (optional)'
        }
      }
    },
    content: {
      type: 'object',
      required: ['title', 'body_text'],
      properties: {
        title: {
          type: 'string',
          minLength: 1,
          description: 'Article title'
        },
        body_text: {
          type: 'string',
          minLength: 10,
          description: 'Article body text'
        },
        snippet: {
          type: 'string',
          description: 'Article snippet/summary (optional)'
        }
      }
    },
    context: {
      type: 'object',
      required: ['source_type', 'request_id'],
      properties: {
        search_query: {
          type: 'string',
          description: 'Original search query (optional)'
        },
        source_type: {
          type: 'string',
          enum: ['NEWS', 'JOB_BOARD', 'CORPORATE_WEBSITE', 'BLOG'],
          description: 'Type of source content'
        },
        request_id: {
          type: 'string',
          description: 'Request/run ID for tracking'
        }
      }
    }
  },
  additionalProperties: false
};

const hiringSignalExtractionOutputSchema = {
  type: 'object',
  required: ['signals', 'metadata', 'timestamp'],
  properties: {
    signals: {
      type: 'array',
      items: {
        type: 'object',
        required: ['company_name', 'signal_type', 'uae_presence_confidence', 'hiring_likelihood'],
        properties: {
          company_name: {
            type: 'string',
            minLength: 1,
            description: 'Company name'
          },
          company_domain: {
            type: ['string', 'null'],
            description: 'Company domain/website'
          },
          industry: {
            type: ['string', 'null'],
            description: 'Industry/sector'
          },
          location: {
            type: 'string',
            description: 'UAE city or emirate'
          },
          signal_type: {
            type: 'string',
            enum: ['HIRING', 'EXPANSION', 'FUNDING', 'ACQUISITION', 'PARTNERSHIP', 'RELOCATION'],
            description: 'Type of signal detected'
          },
          trigger_description: {
            type: 'string',
            description: 'What triggered the signal'
          },
          employee_count_mentioned: {
            type: ['number', 'null'],
            minimum: 0,
            description: 'Number of employees mentioned'
          },
          roles_mentioned: {
            type: ['array', 'null'],
            items: {
              type: 'string'
            },
            description: 'Job roles mentioned'
          },
          uae_presence_confidence: {
            type: 'string',
            enum: ['CONFIRMED', 'PROBABLE', 'AMBIGUOUS'],
            description: 'Confidence in UAE presence'
          },
          hiring_likelihood: {
            type: 'number',
            minimum: 1,
            maximum: 5,
            description: 'Hiring likelihood score (1-5)'
          },
          key_facts: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Key facts extracted'
          }
        }
      }
    },
    metadata: {
      type: 'object',
      required: ['signals_found', 'extraction_confidence', 'model_used'],
      properties: {
        signals_found: {
          type: 'number',
          minimum: 0,
          description: 'Number of signals found'
        },
        extraction_confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Overall extraction confidence'
        },
        ambiguous_companies: {
          type: 'number',
          minimum: 0,
          description: 'Number of ambiguous companies filtered'
        },
        model_used: {
          type: 'string',
          description: 'LLM model used for extraction'
        },
        tokens_used: {
          type: 'number',
          minimum: 0,
          description: 'Total tokens consumed'
        },
        cost_usd: {
          type: 'number',
          minimum: 0,
          description: 'Cost in USD'
        }
      }
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp of extraction'
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
  hiringSignalExtractionInputSchema,
  hiringSignalExtractionOutputSchema
};
