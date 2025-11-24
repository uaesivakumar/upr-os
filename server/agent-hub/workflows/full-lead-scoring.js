/**
 * Full Lead Scoring Workflow
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Complete lead scoring combining all 4 SIVA tools
 * Execution: Sequential (company quality → contact tier → timing → banking products)
 *
 * Use Case: Score a complete lead with company profile, contact, timing, and product recommendations
 *
 * Reference: Agent Hub Architecture §8 - Multi-Tool Workflows
 */

module.exports = {
  name: 'full_lead_scoring',
  version: 'v1.0',
  description: 'Complete lead scoring combining company quality, contact tier, timing, and banking products',

  steps: [
    // ═══════════════════════════════════════════════════════════
    // STEP 1: Evaluate Company Quality
    // ═══════════════════════════════════════════════════════════
    {
      id: 'step_1_company_quality',
      tool_name: 'CompanyQualityTool',
      input_mapping: {
        company_name: '$.input.company_name',
        domain: '$.input.domain',
        industry: '$.input.industry',
        size: '$.input.size',
        size_bucket: '$.input.size_bucket',
        uae_signals: '$.input.uae_signals',
        salary_indicators: '$.input.salary_indicators'
      },
      dependencies: [],
      optional: false
    },

    // ═══════════════════════════════════════════════════════════
    // STEP 2: Select Contact Tier
    // ═══════════════════════════════════════════════════════════
    {
      id: 'step_2_contact_tier',
      tool_name: 'ContactTierTool',
      input_mapping: {
        title: '$.input.contact_title',
        company_size: '$.input.size',
        department: '$.input.department'
      },
      dependencies: [],
      optional: false
    },

    // ═══════════════════════════════════════════════════════════
    // STEP 3: Calculate Timing Score
    // ═══════════════════════════════════════════════════════════
    {
      id: 'step_3_timing_score',
      tool_name: 'TimingScoreTool',
      input_mapping: {
        current_date: '$.input.current_date',
        signal_type: '$.input.signal_type',
        signal_age: '$.input.signal_age',
        fiscal_context: '$.input.fiscal_context'
      },
      dependencies: [],
      optional: true // Timing not critical for lead scoring
    },

    // ═══════════════════════════════════════════════════════════
    // STEP 4: Match Banking Products
    // ═══════════════════════════════════════════════════════════
    {
      id: 'step_4_banking_products',
      tool_name: 'BankingProductMatchTool',
      input_mapping: {
        company_size: '$.input.size',
        industry: '$.input.industry',
        average_salary_aed: '$.input.salary_indicators.avg_salary',
        signals: '$.input.signals',
        has_free_zone_license: '$.input.has_free_zone_license'
      },
      dependencies: ['step_1_company_quality'], // Uses quality score implicitly
      optional: true // Product recommendations not critical for lead scoring
    }
  ],

  config: {
    execution_mode: 'sequential',
    timeout_ms: 5000, // 5s total workflow timeout
    retry_policy: {
      max_retries: 1,
      backoff_ms: 500
    }
  }
};
