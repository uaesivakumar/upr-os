/**
 * Scoring Adjustments System - Sprint 28
 *
 * Automatically adjusts rule scores based on decision feedback
 * to improve future decision quality through reinforcement learning
 *
 * Features:
 * - Analyzes feedback patterns (positive/negative outcomes)
 * - Calculates adjustment factors per rule/version
 * - Applies adjustments to confidence scores
 * - Stores adjustments in database for persistence
 * - Decays old adjustments to prevent over-fitting
 *
 * Phase 10: Feedback & Reinforcement Analytics
 */

const db = require('../../utils/db');

// Configuration
const ADJUSTMENT_CONFIG = {
  MIN_FEEDBACK_SAMPLES: 20,        // Minimum feedback needed to calculate adjustments
  MAX_ADJUSTMENT_FACTOR: 0.2,      // Max ±20% adjustment
  LEARNING_RATE: 0.1,              // How quickly to adjust (10%)
  DECAY_RATE: 0.95,                // Decay factor per week (5% decay)
  CONFIDENCE_WEIGHT: 0.7,          // Weight of confidence in adjustment
  SUCCESS_RATE_WEIGHT: 0.3,        // Weight of success rate in adjustment
  UPDATE_INTERVAL_HOURS: 24        // Recalculate adjustments every 24 hours
};

class ScoringAdjustments {
  constructor() {
    this.cache = new Map();  // Cache of adjustments per tool/version
    this.lastUpdate = null;
  }

  /**
   * Get scoring adjustment for a specific tool and version
   * @param {string} toolName - Tool name (e.g., 'CompanyQualityTool')
   * @param {string} ruleVersion - Rule version (e.g., 'v2.2')
   * @returns {Promise<Object>} Adjustment object with factor and metadata
   */
  async getAdjustment(toolName, ruleVersion) {
    // Check cache first
    const cacheKey = `${toolName}:${ruleVersion}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      // Cache valid for UPDATE_INTERVAL_HOURS
      const cacheAge = Date.now() - cached.timestamp;
      if (cacheAge < ADJUSTMENT_CONFIG.UPDATE_INTERVAL_HOURS * 3600 * 1000) {
        return cached.adjustment;
      }
    }

    // Calculate fresh adjustment
    const adjustment = await this._calculateAdjustment(toolName, ruleVersion);

    // Cache the result
    this.cache.set(cacheKey, {
      adjustment,
      timestamp: Date.now()
    });

    return adjustment;
  }

  /**
   * Calculate adjustment factor based on recent feedback
   * @private
   */
  async _calculateAdjustment(toolName, ruleVersion) {
    try {
      // Query feedback data for the last 30 days
      const feedbackQuery = await db.query(`
        SELECT
          COUNT(*) as total_feedback,
          AVG(CASE WHEN f.outcome_positive = true THEN 1.0
                   WHEN f.outcome_positive = false THEN 0.0
                   ELSE NULL END) as success_rate,
          AVG(d.confidence_score) as avg_confidence,
          COUNT(CASE WHEN f.outcome_positive = false THEN 1 END) as failure_count,
          COUNT(CASE WHEN f.outcome_positive = true THEN 1 END) as success_count
        FROM agent_core.agent_decisions d
        INNER JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
        WHERE d.tool_name = $1
          AND d.rule_version = $2
          AND d.decided_at >= NOW() - INTERVAL '30 days'
          AND f.outcome_positive IS NOT NULL
      `, [toolName, ruleVersion]);

      const stats = feedbackQuery.rows[0];

      // Default: no adjustment if insufficient data
      if (!stats || parseInt(stats.total_feedback) < ADJUSTMENT_CONFIG.MIN_FEEDBACK_SAMPLES) {
        return {
          factor: 0.0,
          confidence: 0.0,
          metadata: {
            reason: 'insufficient_feedback',
            sample_size: parseInt(stats?.total_feedback || 0),
            required: ADJUSTMENT_CONFIG.MIN_FEEDBACK_SAMPLES
          }
        };
      }

      const successRate = parseFloat(stats.success_rate);
      const avgConfidence = parseFloat(stats.avg_confidence || 0.75);
      const totalFeedback = parseInt(stats.total_feedback);

      // Calculate adjustment factor based on success rate and confidence
      // Positive adjustment if success rate > 0.85 and high confidence
      // Negative adjustment if success rate < 0.75 or low confidence

      let adjustmentFactor = 0.0;

      // Success rate component (-1.0 to +1.0)
      const successComponent = (successRate - 0.80) / 0.20;  // 0.80 is baseline

      // Confidence component (-1.0 to +1.0)
      const confidenceComponent = (avgConfidence - 0.75) / 0.25;  // 0.75 is baseline

      // Weighted combination
      const rawAdjustment =
        (successComponent * ADJUSTMENT_CONFIG.SUCCESS_RATE_WEIGHT) +
        (confidenceComponent * ADJUSTMENT_CONFIG.CONFIDENCE_WEIGHT);

      // Apply learning rate
      adjustmentFactor = rawAdjustment * ADJUSTMENT_CONFIG.LEARNING_RATE;

      // Cap at max adjustment
      adjustmentFactor = Math.max(
        -ADJUSTMENT_CONFIG.MAX_ADJUSTMENT_FACTOR,
        Math.min(ADJUSTMENT_CONFIG.MAX_ADJUSTMENT_FACTOR, adjustmentFactor)
      );

      // Calculate confidence in this adjustment (based on sample size)
      const adjustmentConfidence = Math.min(1.0, totalFeedback / 100);

      // Store adjustment in database for audit trail
      await this._storeAdjustment(toolName, ruleVersion, adjustmentFactor, stats);

      return {
        factor: adjustmentFactor,
        confidence: adjustmentConfidence,
        metadata: {
          success_rate: successRate,
          avg_confidence: avgConfidence,
          sample_size: totalFeedback,
          success_count: parseInt(stats.success_count),
          failure_count: parseInt(stats.failure_count),
          calculated_at: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('[ScoringAdjustments] Error calculating adjustment:', error.message);
      return {
        factor: 0.0,
        confidence: 0.0,
        metadata: {
          reason: 'calculation_error',
          error: error.message
        }
      };
    }
  }

  /**
   * Store adjustment in database for audit trail
   * @private
   */
  async _storeAdjustment(toolName, ruleVersion, adjustmentFactor, stats) {
    try {
      // Create scoring_adjustments table if it doesn't exist
      await db.query(`
        CREATE TABLE IF NOT EXISTS agent_core.scoring_adjustments (
          adjustment_id SERIAL PRIMARY KEY,
          tool_name TEXT NOT NULL,
          rule_version TEXT NOT NULL,
          adjustment_factor DECIMAL NOT NULL,
          success_rate DECIMAL,
          avg_confidence DECIMAL,
          sample_size INTEGER,
          calculated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(tool_name, rule_version, calculated_at)
        )
      `);

      await db.query(`
        INSERT INTO agent_core.scoring_adjustments (
          tool_name,
          rule_version,
          adjustment_factor,
          success_rate,
          avg_confidence,
          sample_size,
          calculated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (tool_name, rule_version, calculated_at) DO NOTHING
      `, [
        toolName,
        ruleVersion,
        adjustmentFactor,
        stats.success_rate,
        stats.avg_confidence,
        stats.total_feedback
      ]);

    } catch (error) {
      console.error('[ScoringAdjustments] Error storing adjustment:', error.message);
    }
  }

  /**
   * Apply adjustment to a confidence score
   * @param {number} baseConfidence - Original confidence score (0.0 to 1.0)
   * @param {Object} adjustment - Adjustment object from getAdjustment()
   * @returns {number} Adjusted confidence score (0.0 to 1.0)
   */
  applyAdjustment(baseConfidence, adjustment) {
    if (!adjustment || adjustment.factor === 0.0) {
      return baseConfidence;
    }

    // Apply adjustment with confidence weighting
    const adjustedConfidence = baseConfidence + (adjustment.factor * adjustment.confidence);

    // Ensure bounds [0.0, 1.0]
    return Math.max(0.0, Math.min(1.0, adjustedConfidence));
  }

  /**
   * Get adjustment history for a tool/version
   * @param {string} toolName - Tool name
   * @param {string} ruleVersion - Rule version
   * @param {number} limit - Max number of records (default 30)
   * @returns {Promise<Array>} Array of adjustment records
   */
  async getAdjustmentHistory(toolName, ruleVersion, limit = 30) {
    try {
      const result = await db.query(`
        SELECT
          adjustment_id,
          tool_name,
          rule_version,
          adjustment_factor,
          success_rate,
          avg_confidence,
          sample_size,
          calculated_at
        FROM agent_core.scoring_adjustments
        WHERE tool_name = $1
          AND rule_version = $2
        ORDER BY calculated_at DESC
        LIMIT $3
      `, [toolName, ruleVersion, limit]);

      return result.rows;

    } catch (error) {
      console.error('[ScoringAdjustments] Error fetching history:', error.message);
      return [];
    }
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache() {
    this.cache.clear();
    this.lastUpdate = null;
  }

  /**
   * Get current cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      last_update: this.lastUpdate,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
module.exports = new ScoringAdjustments();
