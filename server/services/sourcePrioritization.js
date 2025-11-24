/**
 * Source Prioritization Service
 * Sprint 19, Task 3: Source Prioritization Engine
 *
 * Dynamic source prioritization based on performance metrics:
 * - Success rate (40% weight)
 * - Signal quality (30% weight)
 * - Signal volume (20% weight)
 * - Execution speed (10% weight)
 *
 * Features:
 * - Automatic priority calculation
 * - Manual priority overrides
 * - Performance tracking
 * - Priority decay for underperforming sources
 */

import * as Sentry from '@sentry/node';
import pool from '../db.js';

class SourcePrioritizationService {
  constructor() {
    this.weights = {
      successRate: 0.4,
      qualityRate: 0.3,
      signalVolume: 0.2,
      executionSpeed: 0.1
    };

    this.thresholds = {
      excellent: 0.80,
      good: 0.60,
      fair: 0.40
    };

    this.decayConfig = {
      enabled: true,
      threshold: 0.30,  // Decay if priority falls below 30%
      decayRate: 0.05,  // Reduce by 5% per period
      recoveryRate: 0.10  // Increase by 10% on successful execution
    };
  }

  /**
   * Update source performance metrics after execution
   * @param {Object} executionResult - Execution result
   * @returns {Promise<Object>} Updated metrics
   */
  async updateSourcePerformance(executionResult) {
    const {
      sourceId,
      executionTimeMs,
      success,
      signalsCount = 0,
      highQualityCount = 0
    } = executionResult;

    try {
      console.log(`[SourcePrioritization] Updating performance for source: ${sourceId}`);

      // Call database function to update metrics
      const result = await pool.query(
        `SELECT update_source_performance($1, $2, $3, $4, $5)`,
        [sourceId, executionTimeMs, success, signalsCount, highQualityCount]
      );

      // Fetch updated metrics
      const metrics = await this.getSourceMetrics(sourceId);

      console.log(`[SourcePrioritization] Source ${sourceId} priority updated: ${metrics.effectivePriority} (${metrics.priorityTier})`);

      return metrics;

    } catch (error) {
      console.error(`[SourcePrioritization] Failed to update performance for ${sourceId}:`, error);

      Sentry.captureException(error, {
        tags: {
          service: 'SourcePrioritization',
          operation: 'updateSourcePerformance',
          sourceId
        },
        extra: executionResult
      });

      throw error;
    }
  }

  /**
   * Get performance metrics for a source
   * @param {string} sourceId - Source identifier
   * @returns {Promise<Object>} Performance metrics
   */
  async getSourceMetrics(sourceId) {
    try {
      const result = await pool.query(
        `SELECT * FROM source_performance_metrics WHERE source_id = $1`,
        [sourceId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      return {
        sourceId: row.source_id,
        totalExecutions: parseInt(row.total_executions),
        successfulExecutions: parseInt(row.successful_executions),
        failedExecutions: parseInt(row.failed_executions),
        successRate: parseFloat(row.success_rate),
        avgExecutionTimeMs: parseInt(row.avg_execution_time_ms),
        totalSignals: parseInt(row.total_signals_discovered),
        avgSignalsPerExecution: parseFloat(row.avg_signals_per_execution),
        highQualitySignals: parseInt(row.high_quality_signals),
        qualityRate: parseFloat(row.quality_rate),
        calculatedPriority: parseFloat(row.calculated_priority),
        manualPriorityOverride: row.manual_priority_override ? parseFloat(row.manual_priority_override) : null,
        effectivePriority: parseFloat(row.effective_priority),
        lastExecutionAt: row.last_execution_at,
        priorityTier: this.getPriorityTier(parseFloat(row.effective_priority))
      };

    } catch (error) {
      console.error(`[SourcePrioritization] Failed to get metrics for ${sourceId}:`, error);

      Sentry.captureException(error, {
        tags: {
          service: 'SourcePrioritization',
          operation: 'getSourceMetrics',
          sourceId
        }
      });

      throw error;
    }
  }

  /**
   * Get all source metrics sorted by priority
   * @returns {Promise<Array>} All source metrics
   */
  async getAllSourceMetrics() {
    try {
      const result = await pool.query(`
        SELECT * FROM source_priority_rankings
        ORDER BY effective_priority DESC, success_rate DESC
      `);

      return result.rows.map(row => ({
        sourceId: row.source_id,
        effectivePriority: parseFloat(row.effective_priority),
        calculatedPriority: parseFloat(row.calculated_priority),
        manualPriorityOverride: row.manual_priority_override ? parseFloat(row.manual_priority_override) : null,
        successRate: parseFloat(row.success_rate),
        qualityRate: parseFloat(row.quality_rate),
        avgSignalsPerExecution: parseFloat(row.avg_signals_per_execution),
        avgExecutionTimeMs: parseInt(row.avg_execution_time_ms),
        totalExecutions: parseInt(row.total_executions),
        successfulExecutions: parseInt(row.successful_executions),
        failedExecutions: parseInt(row.failed_executions),
        lastExecutionAt: row.last_execution_at,
        priorityTier: row.priority_tier,
        priorityRank: parseInt(row.priority_rank)
      }));

    } catch (error) {
      console.error('[SourcePrioritization] Failed to get all metrics:', error);

      Sentry.captureException(error, {
        tags: {
          service: 'SourcePrioritization',
          operation: 'getAllSourceMetrics'
        }
      });

      throw error;
    }
  }

  /**
   * Set manual priority override for a source
   * @param {string} sourceId - Source identifier
   * @param {number} priority - Priority value (0.0-1.0) or null to remove override
   * @returns {Promise<Object>} Updated metrics
   */
  async setManualPriority(sourceId, priority) {
    try {
      console.log(`[SourcePrioritization] Setting manual priority for ${sourceId}: ${priority}`);

      // Validate priority
      if (priority !== null && (priority < 0 || priority > 1)) {
        throw new Error('Priority must be between 0.0 and 1.0');
      }

      // Update manual priority override
      await pool.query(
        `UPDATE source_performance_metrics
         SET manual_priority_override = $1,
             effective_priority = COALESCE($1, calculated_priority),
             metrics_updated_at = CURRENT_TIMESTAMP
         WHERE source_id = $2`,
        [priority, sourceId]
      );

      // Return updated metrics
      return await this.getSourceMetrics(sourceId);

    } catch (error) {
      console.error(`[SourcePrioritization] Failed to set manual priority for ${sourceId}:`, error);

      Sentry.captureException(error, {
        tags: {
          service: 'SourcePrioritization',
          operation: 'setManualPriority',
          sourceId
        },
        extra: { priority }
      });

      throw error;
    }
  }

  /**
   * Remove manual priority override (revert to calculated priority)
   * @param {string} sourceId - Source identifier
   * @returns {Promise<Object>} Updated metrics
   */
  async removeManualPriority(sourceId) {
    return await this.setManualPriority(sourceId, null);
  }

  /**
   * Get priority tier label
   * @param {number} priority - Priority value
   * @returns {string} Tier label
   */
  getPriorityTier(priority) {
    if (priority >= this.thresholds.excellent) return 'EXCELLENT';
    if (priority >= this.thresholds.good) return 'GOOD';
    if (priority >= this.thresholds.fair) return 'FAIR';
    return 'POOR';
  }

  /**
   * Calculate priority score manually (for testing/validation)
   * @param {Object} metrics - Performance metrics
   * @returns {number} Calculated priority (0.0-1.0)
   */
  calculatePriority(metrics) {
    const {
      successRate = 0,
      qualityRate = 0,
      avgSignalsPerExecution = 0,
      avgExecutionTimeMs = 30000
    } = metrics;

    // Normalize signals (assume 50 signals = 1.0)
    const signalsNormalized = Math.min(1.0, avgSignalsPerExecution / 50.0);

    // Speed score (faster is better)
    // 1.0 if < 10s, decreases linearly to 0.0 at 30s
    const speedScore = Math.max(0.0, Math.min(1.0, 1.0 - ((avgExecutionTimeMs - 10000) / 20000)));

    // Weighted calculation
    const priority =
      (successRate * this.weights.successRate) +
      (qualityRate * this.weights.qualityRate) +
      (signalsNormalized * this.weights.signalVolume) +
      (speedScore * this.weights.executionSpeed);

    return Math.round(priority * 100) / 100;  // Round to 2 decimals
  }

  /**
   * Apply priority decay for underperforming sources
   * @param {string} sourceId - Source identifier
   * @returns {Promise<Object>} Updated metrics
   */
  async applyPriorityDecay(sourceId) {
    if (!this.decayConfig.enabled) {
      return await this.getSourceMetrics(sourceId);
    }

    try {
      const metrics = await this.getSourceMetrics(sourceId);

      if (!metrics) {
        throw new Error(`Source ${sourceId} not found`);
      }

      // Check if priority is below decay threshold
      if (metrics.effectivePriority < this.decayConfig.threshold) {
        const newPriority = Math.max(0, metrics.effectivePriority - this.decayConfig.decayRate);

        console.log(`[SourcePrioritization] Applying decay to ${sourceId}: ${metrics.effectivePriority} → ${newPriority}`);

        await pool.query(
          `UPDATE source_performance_metrics
           SET calculated_priority = $1,
               effective_priority = COALESCE(manual_priority_override, $1),
               metrics_updated_at = CURRENT_TIMESTAMP
           WHERE source_id = $2`,
          [newPriority, sourceId]
        );

        return await this.getSourceMetrics(sourceId);
      }

      return metrics;

    } catch (error) {
      console.error(`[SourcePrioritization] Failed to apply decay for ${sourceId}:`, error);

      Sentry.captureException(error, {
        tags: {
          service: 'SourcePrioritization',
          operation: 'applyPriorityDecay',
          sourceId
        }
      });

      throw error;
    }
  }

  /**
   * Reset performance metrics for a source
   * @param {string} sourceId - Source identifier
   * @returns {Promise<Object>} Reset metrics
   */
  async resetMetrics(sourceId) {
    try {
      console.log(`[SourcePrioritization] Resetting metrics for ${sourceId}`);

      await pool.query(
        `UPDATE source_performance_metrics
         SET total_executions = 0,
             successful_executions = 0,
             failed_executions = 0,
             success_rate = 0,
             avg_execution_time_ms = 0,
             min_execution_time_ms = 0,
             max_execution_time_ms = 0,
             total_signals_discovered = 0,
             avg_signals_per_execution = 0,
             high_quality_signals = 0,
             quality_rate = 0,
             calculated_priority = 0.50,
             effective_priority = COALESCE(manual_priority_override, 0.50),
             last_execution_at = NULL,
             metrics_updated_at = CURRENT_TIMESTAMP
         WHERE source_id = $1`,
        [sourceId]
      );

      return await this.getSourceMetrics(sourceId);

    } catch (error) {
      console.error(`[SourcePrioritization] Failed to reset metrics for ${sourceId}:`, error);

      Sentry.captureException(error, {
        tags: {
          service: 'SourcePrioritization',
          operation: 'resetMetrics',
          sourceId
        }
      });

      throw error;
    }
  }

  /**
   * Get priority recommendations based on current metrics
   * @returns {Promise<Object>} Priority recommendations
   */
  async getPriorityRecommendations() {
    try {
      const allMetrics = await this.getAllSourceMetrics();

      const recommendations = {
        topPerformers: [],
        underperformers: [],
        needsAttention: [],
        suggestions: []
      };

      allMetrics.forEach(metrics => {
        if (metrics.priorityTier === 'EXCELLENT' || metrics.priorityTier === 'GOOD') {
          recommendations.topPerformers.push({
            sourceId: metrics.sourceId,
            priority: metrics.effectivePriority,
            tier: metrics.priorityTier,
            reason: `High performance: ${(metrics.successRate * 100).toFixed(1)}% success rate, ${metrics.avgSignalsPerExecution.toFixed(1)} avg signals`
          });
        }

        if (metrics.priorityTier === 'POOR') {
          recommendations.underperformers.push({
            sourceId: metrics.sourceId,
            priority: metrics.effectivePriority,
            tier: metrics.priorityTier,
            reason: `Low performance: ${(metrics.successRate * 100).toFixed(1)}% success rate, ${metrics.avgSignalsPerExecution.toFixed(1)} avg signals`
          });
        }

        if (metrics.successRate < 0.50 && metrics.totalExecutions > 5) {
          recommendations.needsAttention.push({
            sourceId: metrics.sourceId,
            issue: 'Low success rate',
            value: `${(metrics.successRate * 100).toFixed(1)}%`,
            suggestion: 'Consider disabling or investigating failures'
          });
        }

        if (metrics.avgExecutionTimeMs > 25000) {
          recommendations.needsAttention.push({
            sourceId: metrics.sourceId,
            issue: 'Slow execution',
            value: `${(metrics.avgExecutionTimeMs / 1000).toFixed(1)}s`,
            suggestion: 'Optimize timeout or implementation'
          });
        }
      });

      // General suggestions
      if (recommendations.underperformers.length > 0) {
        recommendations.suggestions.push(`${recommendations.underperformers.length} source(s) are underperforming and may need attention`);
      }

      if (recommendations.topPerformers.length > 0) {
        recommendations.suggestions.push(`${recommendations.topPerformers.length} source(s) are performing well and should be prioritized`);
      }

      return recommendations;

    } catch (error) {
      console.error('[SourcePrioritization] Failed to get recommendations:', error);

      Sentry.captureException(error, {
        tags: {
          service: 'SourcePrioritization',
          operation: 'getPriorityRecommendations'
        }
      });

      throw error;
    }
  }
}

export default new SourcePrioritizationService();
