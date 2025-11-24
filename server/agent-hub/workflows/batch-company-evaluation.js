/**
 * Batch Company Evaluation Workflow
 * Sprint 30 - Task 3: Advanced Workflows
 *
 * Processes multiple companies in parallel for efficient bulk evaluation.
 * Useful for batch processing, data enrichment pipelines, and bulk scoring.
 *
 * Input: Array of companies
 * Output: Array of results with aggregated statistics
 */

module.exports = {
  name: 'batch_company_evaluation',
  version: 'v1.0',
  description: 'Evaluate multiple companies in parallel for bulk processing',

  // Note: This workflow expects input.companies to be an array
  // The WorkflowEngine will need to handle batch execution
  steps: [
    {
      id: 'batch_quality_evaluation',
      tool_name: 'CompanyQualityTool',
      input_mapping: {
        // Batch mode: Process each company in the array
        company_name: '$.input.companies[*].company_name',
        domain: '$.input.companies[*].domain',
        industry: '$.input.companies[*].industry',
        size: '$.input.companies[*].size',
        size_bucket: '$.input.companies[*].size_bucket',
        uae_signals: '$.input.companies[*].uae_signals',
        salary_indicators: '$.input.companies[*].salary_indicators',
        license_type: '$.input.companies[*].license_type',
        sector: '$.input.companies[*].sector'
      },
      dependencies: [],
      optional: false,

      // Batch configuration
      batch_mode: true,
      batch_size: 10, // Process 10 companies at a time
      parallel: true   // Process batches in parallel
    }
  ],

  config: {
    execution_mode: 'parallel_batch',
    timeout_ms: 30000, // Longer timeout for batch processing
    retry_policy: {
      max_retries: 2,
      backoff_ms: 1000
    },

    // Batch-specific configuration
    batch: {
      max_concurrent: 5,
      aggregate_results: true,
      fail_on_partial_failure: false, // Continue even if some items fail
      return_failures: true // Include failed items in results
    }
  },

  // Post-processing for aggregation
  aggregation: {
    enabled: true,
    metrics: [
      {
        name: 'total_companies',
        calculation: 'count'
      },
      {
        name: 'average_quality_score',
        path: '$.results[*].quality_score',
        calculation: 'mean'
      },
      {
        name: 'high_quality_count',
        path: '$.results[*].quality_score',
        calculation: 'count_above',
        threshold: 80
      },
      {
        name: 'processing_time_ms',
        calculation: 'sum_duration'
      }
    ]
  },

  metadata: {
    use_case: 'bulk_data_enrichment',
    max_batch_size: 100,
    recommended_batch_size: 20
  }
};
