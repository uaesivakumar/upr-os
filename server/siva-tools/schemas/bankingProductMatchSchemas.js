/**
 * JSON Schemas for BankingProductMatchTool (MATCH_BANKING_PRODUCTS)
 * SIVA Phase 1: Primitive 5 - MATCH_BANKING_PRODUCTS
 * SIVA Phase 2: Tool 5 - match_banking_products (STRICT)
 *
 * v1.0 Features:
 * - Formula protection (NO scoring breakdown exposed)
 * - Product recommendations with fit scores
 * - Confidence level classification
 */

const bankingProductMatchInputSchema = {
  type: 'object',
  required: ['company_size', 'average_salary_aed', 'uae_employees'],
  properties: {
    company_size: {
      type: 'number',
      minimum: 1,
      description: 'Total number of employees'
    },
    industry: {
      type: 'string',
      description: 'Industry sector (e.g., FinTech, Healthcare, Technology)'
    },
    signals: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['hiring', 'expansion', 'funding', 'relocation', 'award']
      },
      description: 'Business signals detected'
    },
    uae_employees: {
      type: 'number',
      minimum: 1,
      description: 'Number of employees in UAE'
    },
    average_salary_aed: {
      type: 'number',
      minimum: 0,
      description: 'Average monthly salary in AED'
    },
    segment: {
      type: 'string',
      enum: ['startup', 'sme', 'mid-market', 'enterprise'],
      description: 'Company segment classification'
    },
    has_free_zone_license: {
      type: 'boolean',
      description: 'Whether company has UAE free zone license'
    }
  },
  additionalProperties: false
};

const bankingProductMatchOutputSchema = {
  type: 'object',
  required: ['recommended_products', 'confidence', 'timestamp'],
  properties: {
    recommended_products: {
      type: 'array',
      items: {
        type: 'object',
        required: ['product_id', 'product_name', 'product_category', 'priority', 'fit_score'],
        properties: {
          product_id: {
            type: 'string',
            description: 'Unique product identifier'
          },
          product_name: {
            type: 'string',
            description: 'Display name of the product'
          },
          product_category: {
            type: 'string',
            description: 'Product category (Salary Accounts, Credit Cards, etc.)'
          },
          priority: {
            type: 'number',
            minimum: 1,
            description: 'Priority ranking (1=highest)'
          },
          fit_score: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: 'Product fit score (0-100) - formula protected'
          },
          target_audience: {
            type: 'string',
            description: 'Target audience for this product'
          },
          key_benefits: {
            type: 'array',
            items: { type: 'string' },
            description: 'Key product benefits'
          }
        }
      },
      description: 'Recommended products sorted by fit score'
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
      description: 'Tool metadata (NO scoring breakdown - competitive algorithm protected)',
      properties: {
        confidenceLevel: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Confidence level classification'
        },
        segment_match: {
          type: 'string',
          description: 'Matched company segment'
        },
        total_products_considered: {
          type: 'number',
          description: 'Total number of products evaluated'
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
  bankingProductMatchInputSchema,
  bankingProductMatchOutputSchema
};
