/**
 * Fallback Lead Scoring Workflow
 * Sprint 30 - Task 3: Advanced Workflows
 *
 * Implements error recovery with fallback strategies.
 * If primary tools fail, falls back to simpler alternatives.
 *
 * Fallback Strategy:
 * 1. Try full 4-tool scoring
 * 2. If any tool fails, retry with exponential backoff
 * 3. If still fails, use simplified 2-tool scoring (company + contact only)
 * 4. If that fails, use basic 1-tool scoring (company only)
 *
 * This ensures we always return *some* result, even if partial.
 */

module.exports = {
  name: 'fallback_lead_scoring',
  version: 'v1.0',
  description: 'Lead scoring with error recovery and fallback strategies',

  steps: [
    // Primary: Company Quality (always required)
    {
      id: 'company_quality_primary',
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
      retry: {
        max_attempts: 3,
        backoff_strategy: 'exponential',
        initial_delay_ms: 500
      }
    },

    // Primary: Contact Tier (with fallback)
    {
      id: 'contact_tier_primary',
      tool_name: 'ContactTierTool',
      input_mapping: {
        title: '$.input.contact_title',
        company_size: '$.input.size'
      },
      dependencies: ['company_quality_primary'],
      optional: true,
      retry: {
        max_attempts: 3,
        backoff_strategy: 'exponential',
        initial_delay_ms: 500
      },

      // Fallback if this fails
      fallback: {
        enabled: true,
        strategy: 'default_value',
        default_result: {
          tier: 'SECONDARY',
          confidence: 0.3,
          rationale: 'Fallback tier due to tool failure'
        }
      }
    },

    // Primary: Timing Score (with fallback)
    {
      id: 'timing_score_primary',
      tool_name: 'TimingScoreTool',
      input_mapping: {
        current_date: '$.input.current_date',
        signal_type: '$.input.signal_type',
        signal_age: '$.input.signal_age',
        fiscal_context: '$.input.fiscal_context'
      },
      dependencies: ['company_quality_primary'],
      optional: true,
      retry: {
        max_attempts: 2,
        backoff_strategy: 'linear',
        initial_delay_ms: 300
      },

      fallback: {
        enabled: true,
        strategy: 'default_value',
        default_result: {
          score: 50,
          confidence: 0.2,
          rationale: 'Fallback score due to tool failure'
        }
      }
    },

    // Primary: Banking Product Match (with fallback)
    {
      id: 'banking_product_primary',
      tool_name: 'BankingProductMatchTool',
      input_mapping: {
        industry: '$.input.industry',
        company_size: '$.input.size',
        signals: '$.input.signals',
        has_free_zone_license: '$.input.has_free_zone_license'
      },
      dependencies: ['company_quality_primary'],
      optional: true,
      retry: {
        max_attempts: 2,
        backoff_strategy: 'exponential',
        initial_delay_ms: 500
      },

      fallback: {
        enabled: true,
        strategy: 'skip',
        on_failure: 'continue' // Continue workflow even if this fails
      }
    }
  ],

  config: {
    execution_mode: 'sequential',
    timeout_ms: 10000,
    retry_policy: {
      max_retries: 3,
      backoff_ms: 1000,
      exponential: true
    },

    // Error recovery configuration
    error_recovery: {
      enabled: true,
      strategy: 'fallback_cascade',
      min_required_tools: 1, // Minimum 1 tool must succeed (company_quality)
      partial_results_acceptable: true
    },

    // Graceful degradation
    graceful_degradation: {
      enabled: true,
      quality_levels: [
        { min_tools: 4, label: 'full' },
        { min_tools: 3, label: 'high' },
        { min_tools: 2, label: 'medium' },
        { min_tools: 1, label: 'basic' }
      ]
    }
  },

  metadata: {
    use_case: 'high_availability_scoring',
    resilience: 'high',
    guaranteed_result: true,
    max_degradation: 'basic_company_score_only'
  }
};
