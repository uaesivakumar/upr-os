/**
 * Response Aggregator
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Aggregate multiple tool results into unified response
 * Pattern: Aggregator pattern with geometric mean confidence calculation
 *
 * Reference: Agent Hub Architecture §6 - Response Aggregator
 */

const { logger } = require('./logger');

class ResponseAggregator {
  /**
   * Aggregate multiple tool results into unified response
   * @param {object} toolResults - Map of tool name → result
   * @param {object} workflowMetadata - Workflow execution metadata
   * @returns {object} Aggregated response
   */
  aggregate(toolResults, workflowMetadata) {
    const startTime = Date.now();

    try {
      // Build aggregated response
      const aggregated = {
        workflow: workflowMetadata.name,
        workflow_version: workflowMetadata.version,
        executed_at: new Date().toISOString(),
        results: {},
        confidence: this._calculateAggregateConfidence(toolResults),
        metadata: this._mergeMetadata(toolResults, workflowMetadata)
      };

      // Extract key fields from each tool result
      for (const [toolName, result] of Object.entries(toolResults)) {
        aggregated.results[toolName] = this._extractKeyFields(toolName, result);
      }

      const duration = Date.now() - startTime;

      logger.info('Response aggregation completed', {
        workflow_name: workflowMetadata.name,
        tools_aggregated: Object.keys(toolResults).length,
        aggregate_confidence: aggregated.confidence,
        duration_ms: duration
      });

      return aggregated;

    } catch (error) {
      logger.error('Response aggregation failed', {
        workflow_name: workflowMetadata.name,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Calculate aggregate confidence using geometric mean
   *
   * Geometric mean: (c1 * c2 * ... * cn)^(1/n)
   * Better than arithmetic mean for confidence scores because:
   * - One low confidence significantly impacts final score
   * - Aligns with probabilistic interpretation (product of probabilities)
   *
   * @private
   */
  _calculateAggregateConfidence(toolResults) {
    const confidences = Object.values(toolResults)
      .map(r => this._extractConfidence(r))
      .filter(c => c > 0 && c <= 1); // Valid confidence range

    if (confidences.length === 0) {
      logger.warn('No valid confidences found, defaulting to 0.5');
      return 0.5;
    }

    // Calculate geometric mean
    const product = confidences.reduce((acc, c) => acc * c, 1);
    const geometricMean = Math.pow(product, 1 / confidences.length);

    // Round to 2 decimal places
    return Math.round(geometricMean * 100) / 100;
  }

  /**
   * Extract confidence from tool result
   * Handles multiple possible locations for confidence value
   * @private
   */
  _extractConfidence(result) {
    // Try different locations
    if (typeof result.confidence === 'number') {
      return result.confidence;
    }
    if (typeof result.metadata?.confidence === 'number') {
      return result.metadata.confidence;
    }
    if (typeof result._meta?.confidence === 'number') {
      return result._meta.confidence;
    }

    // Default to 0.5 if not found
    return 0.5;
  }

  /**
   * Merge metadata from all tools
   * @private
   */
  _mergeMetadata(toolResults, workflowMetadata) {
    const merged = {
      workflow_id: workflowMetadata.id,
      workflow_version: workflowMetadata.version,
      workflow_execution_mode: workflowMetadata.execution_mode,
      tools_executed: Object.keys(toolResults),
      decision_ids: {},
      execution_times_ms: {},
      ab_test_groups: {},
      shadow_mode_active: {},
      rule_versions: {},
      scoring_adjustments_applied: {}
    };

    for (const [toolName, result] of Object.entries(toolResults)) {
      // Handle both _meta and metadata conventions
      const meta = result._meta || result.metadata || {};

      merged.decision_ids[toolName] = meta.decision_id;
      merged.execution_times_ms[toolName] = meta.executionTimeMs || meta.execution_time_ms || meta.executionTime;
      merged.ab_test_groups[toolName] = meta.ab_test_group;
      merged.shadow_mode_active[toolName] = meta.shadow_mode_active || false;
      merged.rule_versions[toolName] = meta.rule_version || meta.version;

      // Check if scoring adjustments were applied
      if (meta.scoringAdjustment && meta.scoringAdjustment.applied) {
        merged.scoring_adjustments_applied[toolName] = {
          base_confidence: meta.scoringAdjustment.base_confidence,
          adjusted_confidence: meta.scoringAdjustment.adjusted_confidence,
          adjustment_factor: meta.scoringAdjustment.adjustment_factor
        };
      }
    }

    return merged;
  }

  /**
   * Extract key fields from tool result
   * Tool-specific extraction to avoid returning full internal state
   * @private
   */
  _extractKeyFields(toolName, result) {
    // Handle errors or skipped steps
    if (result.error || result.skipped) {
      return {
        error: result.error || 'Step skipped',
        skipped: result.skipped || false
      };
    }

    switch (toolName) {
      case 'CompanyQualityTool':
        return {
          quality_score: result.quality_score,
          quality_tier: result.quality_tier,
          confidence: result.confidence,
          key_factors: result.key_factors || [],
          reasoning: result.reasoning // Natural language reasoning (v2.0)
        };

      case 'ContactTierTool':
        return {
          tier: result.tier,
          target_titles: result.target_titles || [],
          confidence: result.confidence,
          confidence_level: result.confidence_level,
          metadata: {
            department: result.metadata?.department,
            seniority_level: result.metadata?.seniority_level
          }
        };

      case 'TimingScoreTool':
        return {
          timing_score: result.timing_score,
          timing_category: result.timing_category,
          confidence: result.confidence,
          key_factors: result.key_factors || [],
          reasoning: result.reasoning,
          metadata: {
            calendar_context: result.metadata?.calendar_context,
            signal_freshness: result.metadata?.signal_freshness
          }
        };

      case 'BankingProductMatchTool':
        return {
          recommended_products: result.recommended_products || [],
          confidence: result.confidence,
          segment: result.segment,
          metadata: {
            total_products_considered: result.recommended_products?.length || 0,
            top_product: result.recommended_products?.[0]?.name
          }
        };

      default:
        // Generic extraction - return full result minus internal metadata
        const { _meta, metadata, ...publicFields } = result;
        return publicFields;
    }
  }

  /**
   * Create summary statistics from aggregated results
   * Useful for analytics and monitoring
   */
  createSummary(aggregatedResponse) {
    const summary = {
      workflow: aggregatedResponse.workflow,
      executed_at: aggregatedResponse.executed_at,
      overall_confidence: aggregatedResponse.confidence,
      tools_count: aggregatedResponse.metadata.tools_executed.length,
      tools_successful: 0,
      tools_failed: 0,
      average_execution_time_ms: 0
    };

    // Count successes and failures
    for (const [toolName, result] of Object.entries(aggregatedResponse.results)) {
      if (result.error) {
        summary.tools_failed++;
      } else {
        summary.tools_successful++;
      }
    }

    // Calculate average execution time
    const executionTimes = Object.values(aggregatedResponse.metadata.execution_times_ms).filter(t => t > 0);
    if (executionTimes.length > 0) {
      summary.average_execution_time_ms = Math.round(
        executionTimes.reduce((sum, t) => sum + t, 0) / executionTimes.length
      );
    }

    return summary;
  }
}

module.exports = { ResponseAggregator };
