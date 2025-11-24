/**
 * Conditional Lead Scoring Workflow
 * Sprint 30 - Task 3: Advanced Workflows
 *
 * Implements conditional execution based on data quality signals.
 * Skips expensive tools if data quality is insufficient.
 *
 * Decision Logic:
 * 1. Always run CompanyQualityTool (baseline)
 * 2. If company_quality >= 70 AND has contact info -> Run ContactTierTool
 * 3. If company_quality >= 80 -> Run TimingScoreTool
 * 4. If all previous passed -> Run BankingProductMatchTool
 *
 * This saves API costs by only running expensive tools on high-quality leads.
 */

module.exports = {
  name: 'conditional_lead_scoring',
  version: 'v1.0',
  description: 'Conditional lead scoring that skips tools based on data quality thresholds',

  steps: [
    // Step 1: Always evaluate company quality (baseline)
    {
      id: 'company_quality',
      tool_name: 'CompanyQualityTool',
      input_mapping: {
        company_name: '$.input.company_name',
        domain: '$.input.domain',
        industry: '$.input.industry',
        size: '$.input.size',
        size_bucket: '$.input.size_bucket',
        uae_signals: '$.input.uae_signals',
        salary_indicators: '$.input.salary_indicators',
        license_type: '$.input.license_type',
        sector: '$.input.sector'
      },
      dependencies: [],
      optional: false,

      // Conditional execution: Always run (no condition)
      condition: null
    },

    // Step 2: Contact tier evaluation (conditional on quality >= 70)
    {
      id: 'contact_tier',
      tool_name: 'ContactTierTool',
      input_mapping: {
        title: '$.input.contact_title',
        company_size: '$.input.size'
      },
      dependencies: ['company_quality'],
      optional: true, // Can be skipped

      // Condition: Only run if company quality >= 70 AND has contact info
      condition: {
        type: 'and',
        checks: [
          {
            path: '$.results.company_quality.quality_score',
            operator: '>=',
            value: 70
          },
          {
            path: '$.input.contact_title',
            operator: 'exists',
            value: true
          }
        ]
      }
    },

    // Step 3: Timing evaluation (conditional on quality >= 80)
    {
      id: 'timing_score',
      tool_name: 'TimingScoreTool',
      input_mapping: {
        current_date: '$.input.current_date',
        signal_type: '$.input.signal_type',
        signal_age: '$.input.signal_age',
        fiscal_context: '$.input.fiscal_context'
      },
      dependencies: ['company_quality'],
      optional: true,

      // Condition: Only run if company quality >= 80
      condition: {
        type: 'threshold',
        path: '$.results.company_quality.quality_score',
        operator: '>=',
        value: 80
      }
    },

    // Step 4: Banking product match (conditional on all previous succeeded)
    {
      id: 'banking_product',
      tool_name: 'BankingProductMatchTool',
      input_mapping: {
        industry: '$.input.industry',
        company_size: '$.input.size',
        signals: '$.input.signals',
        has_free_zone_license: '$.input.has_free_zone_license'
      },
      dependencies: ['company_quality', 'contact_tier', 'timing_score'],
      optional: true,

      // Condition: Only run if contact_tier and timing_score both executed
      condition: {
        type: 'all_dependencies_executed',
        required_dependencies: ['contact_tier', 'timing_score']
      }
    }
  ],

  config: {
    execution_mode: 'sequential',
    timeout_ms: 5000,
    retry_policy: {
      max_retries: 1,
      backoff_ms: 500
    },

    // Advanced workflow features
    conditional_execution: true,
    skip_on_condition_failure: true,
    aggregate_partial_results: true
  },

  // Metadata for analytics
  metadata: {
    use_case: 'cost_optimization',
    expected_savings: '40-60% reduction in tool executions',
    quality_threshold: 70,
    premium_threshold: 80
  }
};
