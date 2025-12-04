/**
 * JSON Schemas for EdgeCasesTool (CHECK_EDGE_CASES)
 * SIVA Phase 1: Primitive 4 - CHECK_EDGE_CASES
 * SIVA Phase 2: Tool 4 - check_edge_cases (STRICT)
 *
 * v3.0 Updates (Sprint 71 - Multi-Vertical):
 * - Added sub_vertical_slug for persona loading
 * - Added signal_data for booster evaluation
 * - Added boosters to output
 * - Added persona metadata to output
 */

const edgeCasesInputSchema = {
  type: 'object',
  required: ['company_profile'],
  properties: {
    // v3.0: Sub-vertical for persona loading
    sub_vertical_slug: {
      type: 'string',
      description: 'Sub-vertical identifier for persona loading (e.g., employee-banking)'
    },
    company_profile: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: 'Company name'
        },
        domain: {
          type: 'string',
          description: 'Company domain (e.g., company.ae)'
        },
        industry: {
          type: 'string',
          description: 'Industry sector'
        },
        sector: {
          type: 'string',
          enum: ['private', 'government', 'semi-government', 'unknown'],
          description: 'Sector type'
        },
        country: {
          type: 'string',
          description: 'Country code (e.g., AE, SA)'
        },
        size: {
          type: 'number',
          minimum: 0,
          description: 'Number of employees'
        },
        revenue: {
          type: 'number',
          minimum: 0,
          description: 'Annual revenue in USD'
        },
        year_founded: {
          type: 'number',
          minimum: 1800,
          description: 'Year company was founded'
        },
        linkedin_followers: {
          type: 'number',
          minimum: 0,
          description: 'Number of LinkedIn followers'
        },
        stock_exchange: {
          type: 'string',
          description: 'Stock exchange if publicly traded (e.g., DFM, NASDAQ)'
        },
        number_of_locations: {
          type: 'number',
          minimum: 0,
          description: 'Number of physical office locations'
        },
        government_ownership: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Percentage of government ownership'
        },
        is_sanctioned: {
          type: 'boolean',
          description: 'Whether company is on sanctions list'
        },
        is_bankrupt: {
          type: 'boolean',
          description: 'Whether company is bankrupt'
        },
        has_legal_issues: {
          type: 'boolean',
          description: 'Whether company has legal issues'
        }
      }
    },
    contact_profile: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Contact name'
        },
        title: {
          type: 'string',
          description: 'Job title'
        },
        tier: {
          type: 'string',
          enum: ['STRATEGIC', 'PRIMARY', 'SECONDARY', 'BACKUP'],
          description: 'Contact tier classification (affects recent contact threshold)'
        },
        email: {
          type: 'string',
          format: 'email',
          description: 'Email address'
        },
        is_verified: {
          type: 'boolean',
          description: 'Whether email is verified'
        },
        has_bounced: {
          type: 'boolean',
          description: 'Whether email has bounced'
        },
        has_opted_out: {
          type: 'boolean',
          description: 'Whether contact has opted out'
        }
      }
    },
    historical_data: {
      type: 'object',
      properties: {
        previous_attempts: {
          type: 'number',
          minimum: 0,
          description: 'Number of previous outreach attempts'
        },
        previous_responses: {
          type: 'number',
          minimum: 0,
          description: 'Number of responses received'
        },
        last_contact_date: {
          type: ['string', 'null'],
          format: 'date',
          description: 'Date of last contact (ISO format)'
        },
        has_active_negotiation: {
          type: 'boolean',
          description: 'Whether there is an active negotiation'
        }
      }
    },
    // v3.0: Signal data for booster evaluation
    signal_data: {
      type: 'object',
      properties: {
        days_since_signal: {
          type: 'number',
          minimum: 0,
          description: 'Days since the triggering signal'
        },
        signal_type: {
          type: 'string',
          description: 'Type of signal (e.g., hiring-expansion, funding-round)'
        },
        signal_strength: {
          type: 'string',
          enum: ['HOT', 'WARM', 'RECENT', 'STALE'],
          description: 'Signal freshness category'
        }
      }
    }
  },
  additionalProperties: false
};

const edgeCasesOutputSchema = {
  type: 'object',
  required: ['decision', 'confidence', 'blockers', 'warnings', 'reasoning', 'timestamp'],
  properties: {
    decision: {
      type: 'string',
      enum: ['PROCEED', 'WARN', 'BLOCK'],
      description: 'Final decision on whether to proceed with outreach'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score (0-1)'
    },
    blockers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'severity', 'message', 'can_override'],
        properties: {
          type: {
            type: 'string',
            description: 'Blocker type identifier'
          },
          severity: {
            type: 'string',
            enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
            description: 'Severity level'
          },
          message: {
            type: 'string',
            description: 'Human-readable explanation'
          },
          can_override: {
            type: 'boolean',
            description: 'Whether this blocker can be overridden'
          },
          metadata: {
            type: 'object',
            description: 'v3.0: Additional blocker metadata',
            properties: {
              rule_type: { type: 'string' },
              multiplier: { type: 'number' },
              source: { type: 'string', enum: ['hardcoded', 'persona'] }
            }
          }
        }
      },
      description: 'List of blocking issues'
    },
    warnings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'severity', 'message', 'can_override'],
        properties: {
          type: {
            type: 'string',
            description: 'Warning type identifier'
          },
          severity: {
            type: 'string',
            enum: ['HIGH', 'MEDIUM', 'LOW'],
            description: 'Severity level (HIGH for semi-government, Ramadan, etc.)'
          },
          message: {
            type: 'string',
            description: 'Human-readable explanation'
          },
          can_override: {
            type: 'boolean',
            description: 'Whether this warning can be overridden (always true for warnings)'
          }
        }
      },
      description: 'List of warning issues'
    },
    // v3.0: Persona-driven boosters (opportunities)
    boosters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Booster type identifier'
          },
          multiplier: {
            type: 'number',
            minimum: 1,
            description: 'Score multiplier (e.g., 1.3 for Free Zone)'
          },
          reason: {
            type: 'string',
            description: 'Reason for the boost'
          },
          source: {
            type: 'string',
            enum: ['persona'],
            description: 'Source of the booster rule'
          }
        }
      },
      description: 'v3.0: List of positive signals/opportunities from persona'
    },
    reasoning: {
      type: 'string',
      minLength: 1,
      description: 'Detailed explanation of decision'
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp of evaluation'
    },
    metadata: {
      type: 'object',
      description: 'Additional metadata',
      properties: {
        blockers_count: {
          type: 'number',
          minimum: 0,
          description: 'Number of blockers found'
        },
        warnings_count: {
          type: 'number',
          minimum: 0,
          description: 'Number of warnings found'
        },
        boosters_count: {
          type: 'number',
          minimum: 0,
          description: 'v3.0: Number of boosters found'
        },
        critical_issues: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of critical issue types'
        },
        persona_blockers: {
          type: 'number',
          minimum: 0,
          description: 'v3.0: Number of persona-driven blockers'
        },
        overridable: {
          type: 'boolean',
          description: 'Whether the decision can be overridden'
        },
        // v3.0: Persona info
        persona_loaded: {
          type: 'boolean',
          description: 'Whether persona was successfully loaded'
        },
        sub_vertical_slug: {
          type: 'string',
          description: 'Sub-vertical used for persona lookup'
        },
        persona_name: {
          type: ['string', 'null'],
          description: 'Name of the loaded persona'
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
  edgeCasesInputSchema,
  edgeCasesOutputSchema
};
