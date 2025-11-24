/**
 * Outreach Optimization Workflow
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Optimize outreach timing and banking product recommendations
 * Execution: Parallel (timing + banking products independent)
 *
 * Use Case: When to reach out and what products to pitch
 *
 * Reference: Agent Hub Architecture §8 - Multi-Tool Workflows
 */

module.exports = {
  name: 'outreach_optimization',
  version: 'v1.0',
  description: 'Optimize outreach timing and banking product recommendations in parallel',

  steps: [
    // ═══════════════════════════════════════════════════════════
    // STEP 1: Calculate Timing Score (parallel)
    // ═══════════════════════════════════════════════════════════
    {
      id: 'step_1_timing_score',
      tool_name: 'TimingScoreTool',
      input_mapping: {
        current_date: '$.input.current_date',
        signal_type: '$.input.signal_type',
        signal_age: '$.input.signal_age',
        fiscal_context: '$.input.fiscal_context'
      },
      dependencies: [],
      optional: false
    },

    // ═══════════════════════════════════════════════════════════
    // STEP 2: Match Banking Products (parallel)
    // ═══════════════════════════════════════════════════════════
    {
      id: 'step_2_banking_products',
      tool_name: 'BankingProductMatchTool',
      input_mapping: {
        company_size: '$.input.size',
        industry: '$.input.industry',
        average_salary_aed: '$.input.average_salary_aed',
        signals: '$.input.signals',
        has_free_zone_license: '$.input.has_free_zone_license'
      },
      dependencies: [],
      optional: false
    }
  ],

  config: {
    execution_mode: 'parallel', // Both tools execute in parallel
    timeout_ms: 3000, // 3s total workflow timeout
    retry_policy: {
      max_retries: 1,
      backoff_ms: 500
    }
  }
};
