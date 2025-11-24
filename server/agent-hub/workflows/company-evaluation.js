/**
 * Company Evaluation Workflow
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Evaluate company quality only
 * Execution: Single tool
 *
 * Use Case: Quick company quality check without full lead scoring
 *
 * Reference: Agent Hub Architecture §8 - Multi-Tool Workflows
 */

module.exports = {
  name: 'company_evaluation',
  version: 'v1.0',
  description: 'Evaluate company quality only (single-tool workflow)',

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
    }
  ],

  config: {
    execution_mode: 'sequential',
    timeout_ms: 2000, // 2s timeout for single tool
    retry_policy: {
      max_retries: 2,
      backoff_ms: 300
    }
  }
};
