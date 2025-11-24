/**
 * JSON Schemas for ContactTierTool (SELECT_CONTACT_TIER)
 * SIVA Phase 1: Primitive 2 - SELECT_CONTACT_TIER
 * SIVA Phase 2: Tool 2 - select_contact_tier (STRICT)
 *
 * v2.0 Changes:
 * - Removed reasoning field (outcome only - protect formula)
 * - Removed score_breakdown (competitive algorithm protected)
 * - Added confidenceLevel classification (HIGH/MEDIUM/LOW)
 */

const contactTierInputSchema = {
  type: 'object',
  required: ['title', 'company_size'],
  properties: {
    title: {
      type: 'string',
      minLength: 1,
      description: 'Job title of the contact'
    },
    department: {
      type: 'string',
      description: 'Department (HR, Finance, Admin, C-Suite, Other)'
    },
    seniority_level: {
      type: 'string',
      enum: ['C-Level', 'VP', 'Director', 'Manager', 'Individual', 'Unknown'],
      description: 'Seniority level classification'
    },
    company_size: {
      type: 'number',
      minimum: 0,
      description: 'Company size (number of employees)'
    },
    hiring_velocity_monthly: {
      type: 'number',
      minimum: 0,
      description: 'Number of hires per month (optional)'
    },
    company_maturity_years: {
      type: 'number',
      minimum: 0,
      description: 'Company age in years (optional)'
    }
  },
  additionalProperties: false
};

const contactTierOutputSchema = {
  type: 'object',
  required: ['tier', 'priority', 'confidence', 'timestamp'],
  properties: {
    tier: {
      type: 'string',
      enum: ['STRATEGIC', 'PRIMARY', 'SECONDARY', 'BACKUP'],
      description: 'Contact tier classification'
    },
    priority: {
      type: 'number',
      minimum: 1,
      maximum: 4,
      description: 'Priority level (1=highest, 4=lowest)'
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
    target_titles: {
      type: 'array',
      items: {
        type: 'string'
      },
      description: 'Alternative titles to target (if applicable)'
    },
    fallback_titles: {
      type: 'array',
      items: {
        type: 'string'
      },
      description: 'Fallback titles if primary not available'
    },
    metadata: {
      type: 'object',
      description: 'Tool metadata (NO scoring details - competitive algorithm protected)',
      properties: {
        confidenceLevel: {
          type: 'string',
          enum: ['HIGH', 'MEDIUM', 'LOW'],
          description: 'Confidence level classification'
        },
        inferred_seniority: {
          type: 'string',
          description: 'Seniority inferred from title (if not provided)'
        },
        inferred_department: {
          type: 'string',
          description: 'Department inferred from title (if not provided)'
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
  contactTierInputSchema,
  contactTierOutputSchema
};
