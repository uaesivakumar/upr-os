/**
 * Signal Quality Scoring Service
 * Sprint 19, Task 4: Signal Quality Scoring
 *
 * Calculate signal quality scores based on:
 * - Signal confidence (0.0-1.0)
 * - Source reliability
 * - Multi-source validation bonus
 * - Signal freshness
 * - Data completeness
 *
 * Quality Score Formula:
 * base_score = (confidence * 0.4) + (source_reliability * 0.3) + (freshness * 0.2) + (completeness * 0.1)
 * multi_source_bonus = +0.15 if signal appears in 2+ sources
 * final_score = min(1.0, base_score + multi_source_bonus)
 */

import * as Sentry from '@sentry/node';
import pool from '../db.js';

class SignalQualityScoring {
  constructor() {
    this.weights = {
      confidence: 0.4,
      sourceReliability: 0.3,
      freshness: 0.2,
      completeness: 0.1
    };

    this.multiSourceBonus = 0.15;  // +15% for multi-source validation

    this.qualityThresholds = {
      excellent: 0.80,  // High-quality signals
      good: 0.60,       // Good quality
      fair: 0.40,       // Fair quality
      poor: 0.20        // Low quality (consider filtering)
    };

    // Days for freshness calculation
    this.freshnessDays = {
      fresh: 7,      // < 7 days = 1.0
      stale: 30      // > 30 days = 0.0
    };
  }

  /**
   * Calculate quality score for a signal
   * @param {Object} signal - Signal object
   * @param {Object} options - Calculation options
   * @returns {Object} Quality score and breakdown
   */
  calculateQualityScore(signal, options = {}) {
    try {
      const {
        sourceReliability = null,
        multiSourceCount = 1
      } = options;

      // 1. Confidence score (0.0-1.0)
      const confidenceScore = Math.max(0, Math.min(1, signal.confidence || 0));

      // 2. Source reliability score (from source_performance_metrics)
      const reliabilityScore = sourceReliability !== null ? sourceReliability : 0.7;  // Default

      // 3. Freshness score (based on signal date)
      const freshnessScore = this.calculateFreshnessScore(signal.detected_at || signal.created_at);

      // 4. Completeness score (data completeness)
      const completenessScore = this.calculateCompletenessScore(signal);

      // Calculate base score
      const baseScore =
        (confidenceScore * this.weights.confidence) +
        (reliabilityScore * this.weights.sourceReliability) +
        (freshnessScore * this.weights.freshness) +
        (completenessScore * this.weights.completeness);

      // Multi-source validation bonus
      const multiSourceBonus = multiSourceCount >= 2 ? this.multiSourceBonus : 0;

      // Final quality score (capped at 1.0)
      const qualityScore = Math.min(1.0, baseScore + multiSourceBonus);

      // Quality tier
      const qualityTier = this.getQualityTier(qualityScore);

      return {
        qualityScore: Math.round(qualityScore * 1000) / 1000,  // 3 decimals
        qualityTier,
        breakdown: {
          confidence: Math.round(confidenceScore * 1000) / 1000,
          sourceReliability: Math.round(reliabilityScore * 1000) / 1000,
          freshness: Math.round(freshnessScore * 1000) / 1000,
          completeness: Math.round(completenessScore * 1000) / 1000,
          baseScore: Math.round(baseScore * 1000) / 1000,
          multiSourceBonus: Math.round(multiSourceBonus * 1000) / 1000,
          multiSourceCount
        }
      };

    } catch (error) {
      console.error('[SignalQuality] Failed to calculate quality score:', error);

      Sentry.captureException(error, {
        tags: {
          service: 'SignalQualityScoring',
          operation: 'calculateQualityScore'
        },
        extra: { signalId: signal.id }
      });

      // Return default score on error
      return {
        qualityScore: 0.5,
        qualityTier: 'FAIR',
        breakdown: null,
        error: error.message
      };
    }
  }

  /**
   * Calculate freshness score based on signal date
   * @param {Date|string} signalDate - Signal detection date
   * @returns {number} Freshness score (0.0-1.0)
   */
  calculateFreshnessScore(signalDate) {
    if (!signalDate) return 0.5;  // Default for missing date

    const now = new Date();
    const date = new Date(signalDate);
    const daysOld = (now - date) / (1000 * 60 * 60 * 24);

    // Fresh signals (< 7 days) = 1.0
    if (daysOld < this.freshnessDays.fresh) {
      return 1.0;
    }

    // Stale signals (> 30 days) = 0.0
    if (daysOld > this.freshnessDays.stale) {
      return 0.0;
    }

    // Linear decay between 7-30 days
    const decayRange = this.freshnessDays.stale - this.freshnessDays.fresh;
    const decayDays = daysOld - this.freshnessDays.fresh;
    return Math.max(0, 1.0 - (decayDays / decayRange));
  }

  /**
   * Calculate completeness score based on data availability
   * @param {Object} signal - Signal object
   * @returns {number} Completeness score (0.0-1.0)
   */
  calculateCompletenessScore(signal) {
    const requiredFields = [
      'company_name',
      'trigger_type',
      'source'
    ];

    const optionalFields = [
      'company_domain',
      'description',
      'signal_url',
      'company_size',
      'company_sector'
    ];

    let score = 0;
    let totalWeight = 0;

    // Required fields (60% weight)
    requiredFields.forEach(field => {
      totalWeight += 0.6 / requiredFields.length;
      if (signal[field] && signal[field].trim().length > 0) {
        score += 0.6 / requiredFields.length;
      }
    });

    // Optional fields (40% weight)
    optionalFields.forEach(field => {
      totalWeight += 0.4 / optionalFields.length;
      if (signal[field] && signal[field].trim().length > 0) {
        score += 0.4 / optionalFields.length;
      }
    });

    return Math.min(1.0, score);
  }

  /**
   * Get quality tier label
   * @param {number} qualityScore - Quality score
   * @returns {string} Quality tier
   */
  getQualityTier(qualityScore) {
    if (qualityScore >= this.qualityThresholds.excellent) return 'EXCELLENT';
    if (qualityScore >= this.qualityThresholds.good) return 'GOOD';
    if (qualityScore >= this.qualityThresholds.fair) return 'FAIR';
    if (qualityScore >= this.qualityThresholds.poor) return 'POOR';
    return 'VERY_POOR';
  }

  /**
   * Batch calculate quality scores for multiple signals
   * @param {Array} signals - Array of signal objects
   * @param {Object} sourceReliabilityMap - Map of sourceId -> reliability score
   * @returns {Promise<Array>} Signals with quality scores
   */
  async batchCalculateQuality(signals, sourceReliabilityMap = {}) {
    try {
      // Detect multi-source signals (group by company + trigger)
      const signalGroups = this.groupSignalsByCompanyAndTrigger(signals);

      // Calculate quality for each signal
      const scoredSignals = signals.map(signal => {
        const groupKey = this.getSignalGroupKey(signal);
        const multiSourceCount = signalGroups[groupKey] ? signalGroups[groupKey].length : 1;
        const sourceReliability = sourceReliabilityMap[signal.source] || null;

        const quality = this.calculateQualityScore(signal, {
          sourceReliability,
          multiSourceCount
        });

        return {
          ...signal,
          quality_score: quality.qualityScore,
          quality_tier: quality.qualityTier,
          quality_breakdown: quality.breakdown
        };
      });

      return scoredSignals;

    } catch (error) {
      console.error('[SignalQuality] Batch calculation failed:', error);

      Sentry.captureException(error, {
        tags: {
          service: 'SignalQualityScoring',
          operation: 'batchCalculateQuality'
        },
        extra: { signalCount: signals.length }
      });

      throw error;
    }
  }

  /**
   * Group signals by company and trigger type
   * @param {Array} signals - Array of signals
   * @returns {Object} Grouped signals
   */
  groupSignalsByCompanyAndTrigger(signals) {
    const groups = {};

    signals.forEach(signal => {
      const key = this.getSignalGroupKey(signal);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(signal);
    });

    return groups;
  }

  /**
   * Get grouping key for a signal
   * @param {Object} signal - Signal object
   * @returns {string} Group key
   */
  getSignalGroupKey(signal) {
    const company = (signal.company_name || '').toLowerCase().trim();
    const trigger = (signal.trigger_type || '').toLowerCase().trim();
    return `${company}::${trigger}`;
  }

  /**
   * Get quality analytics from database
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Quality analytics
   */
  async getQualityAnalytics(filters = {}) {
    try {
      const {
        startDate = null,
        endDate = null,
        source = null,
        tenantId = null
      } = filters;

      let query = `
        SELECT
          COUNT(*) as total_signals,
          AVG(quality_score) as avg_quality_score,
          AVG(confidence_score) as avg_confidence,
          COUNT(CASE WHEN quality_score >= 0.80 THEN 1 END) as excellent_count,
          COUNT(CASE WHEN quality_score >= 0.60 AND quality_score < 0.80 THEN 1 END) as good_count,
          COUNT(CASE WHEN quality_score >= 0.40 AND quality_score < 0.60 THEN 1 END) as fair_count,
          COUNT(CASE WHEN quality_score < 0.40 THEN 1 END) as poor_count,
          source_type as source
        FROM hiring_signals
        WHERE quality_score IS NOT NULL
      `;

      const params = [];
      let paramIndex = 1;

      if (startDate) {
        query += ` AND created_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND created_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      if (source) {
        query += ` AND source_type = $${paramIndex}`;
        params.push(source);
        paramIndex++;
      }

      if (tenantId) {
        query += ` AND tenant_id = $${paramIndex}`;
        params.push(tenantId);
        paramIndex++;
      }

      query += ` GROUP BY source_type ORDER BY total_signals DESC`;

      const result = await pool.query(query, params);

      // Calculate overall statistics
      const totalSignals = result.rows.reduce((sum, row) => sum + parseInt(row.total_signals), 0);
      const excellentCount = result.rows.reduce((sum, row) => sum + parseInt(row.excellent_count), 0);
      const goodCount = result.rows.reduce((sum, row) => sum + parseInt(row.good_count), 0);
      const fairCount = result.rows.reduce((sum, row) => sum + parseInt(row.fair_count), 0);
      const poorCount = result.rows.reduce((sum, row) => sum + parseInt(row.poor_count), 0);

      return {
        overall: {
          totalSignals,
          excellentCount,
          goodCount,
          fairCount,
          poorCount,
          excellentRate: totalSignals > 0 ? excellentCount / totalSignals : 0,
          goodRate: totalSignals > 0 ? goodCount / totalSignals : 0,
          highQualityRate: totalSignals > 0 ? (excellentCount + goodCount) / totalSignals : 0
        },
        bySource: result.rows.map(row => ({
          source: row.source,
          totalSignals: parseInt(row.total_signals),
          avgConfidence: parseFloat(row.avg_confidence),
          distribution: {
            excellent: parseInt(row.excellent_count),
            good: parseInt(row.good_count),
            fair: parseInt(row.fair_count),
            poor: parseInt(row.poor_count)
          }
        }))
      };

    } catch (error) {
      console.error('[SignalQuality] Failed to get quality analytics:', error);

      Sentry.captureException(error, {
        tags: {
          service: 'SignalQualityScoring',
          operation: 'getQualityAnalytics'
        },
        extra: filters
      });

      throw error;
    }
  }

  /**
   * Filter signals by quality threshold
   * @param {Array} signals - Array of signals
   * @param {number} minQuality - Minimum quality score (0.0-1.0)
   * @returns {Array} Filtered signals
   */
  filterByQuality(signals, minQuality = 0.4) {
    return signals.filter(signal => {
      const qualityScore = signal.quality_score || signal.confidence || 0;
      return qualityScore >= minQuality;
    });
  }

  /**
   * Get multi-source validated signals
   * @param {Array} signals - Array of signals
   * @returns {Array} Multi-source signals
   */
  getMultiSourceSignals(signals) {
    const groups = this.groupSignalsByCompanyAndTrigger(signals);

    const multiSourceKeys = Object.keys(groups).filter(key => groups[key].length >= 2);

    return signals.filter(signal => {
      const key = this.getSignalGroupKey(signal);
      return multiSourceKeys.includes(key);
    });
  }
}

export default new SignalQualityScoring();
