/**
 * JSON Schemas for CompanyQualityTool (EVALUATE_COMPANY_QUALITY)
 * SIVA Phase 1: Primitive 1 - EVALUATE_COMPANY_QUALITY
 * SIVA Phase 2: Tool 1 - evaluate_company_quality (STRICT)
 */

const companyQualityInputSchema = {
  type: 'object',
  required: ['company_name', 'domain', 'industry', 'uae_signals', 'size_bucket'],
  properties: {
    company_name: {
      type: 'string',
      minLength: 1,
      description: 'Name of the company to evaluate'
    },
    domain: {
      type: 'string',
      pattern: '^[a-z0-9-]+\\.[a-z]{2,}$',
      description: 'Company domain (e.g., example.com)'
    },
    industry: {
      type: 'string',
      minLength: 2,
      description: 'Industry sector (e.g., Technology, FinTech, Healthcare)'
    },
    uae_signals: {
      type: 'object',
      required: ['has_ae_domain', 'has_uae_address'],
      properties: {
        has_ae_domain: {
          type: 'boolean',
          description: 'Whether company has .ae domain'
        },
        has_uae_address: {
          type: 'boolean',
          description: 'Whether company has UAE address'
        },
        linkedin_location: {
          type: 'string',
          description: 'LinkedIn location (optional)'
        }
      }
    },
    size_bucket: {
      type: 'string',
      enum: ['startup', 'scaleup', 'midsize', 'enterprise'],
      description: 'Company size category'
    },
    size: {
      type: 'number',
      minimum: 0,
      description: 'Actual company size (number of employees)'
    },
    salary_indicators: {
      type: 'object',
      properties: {
        salary_level: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Salary level classification'
        },
        avg_salary: {
          type: 'number',
          minimum: 0,
          description: 'Average salary in AED'
        },
        job_posting_salaries: {
          type: 'array',
          items: {
            type: 'number',
            minimum: 0
          },
          description: 'Array of job posting salaries'
        }
      }
    },
    license_type: {
      type: 'string',
      description: 'License type (e.g., Free Zone, Mainland)'
    },
    sector: {
      type: 'string',
      description: 'Business sector'
    }
  },
  additionalProperties: false
};

const companyQualityOutputSchema = {
  type: 'object',
  required: ['quality_score', 'reasoning', 'confidence', 'policy_version', 'timestamp'],
  properties: {
    quality_score: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: 'Company quality score (0-100)'
    },
    reasoning: {
      type: 'string',
      minLength: 1,
      description: 'Natural language reasoning (NO FORMULAS - competitive algorithm protected)'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score (0-1)'
    },
    policy_version: {
      type: 'string',
      description: 'Persona policy version used (e.g., "v2.0")'
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'ISO timestamp of evaluation'
    },
    metadata: {
      type: 'object',
      description: 'Tool metadata',
      properties: {
        keyFactors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key factors detected (replaces scoreBreakdown)'
        },
        confidenceLevel: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Confidence level classification'
        },
        edgeCasesApplied: {
          type: 'array',
          items: { type: 'string' },
          description: 'Edge case rules applied'
        }
      }
    },
    _meta: {
      type: 'object',
      description: 'Internal metadata (latency, tool type, etc.)',
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
  companyQualityInputSchema,
  companyQualityOutputSchema
};
