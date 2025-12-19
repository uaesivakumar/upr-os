/**
 * Human Calibration Engine
 * S248: Human Calibration Tooling
 * PRD v1.3 Appendix §8
 *
 * Enables human experts to review and calibrate CRS scores.
 * Uses Spearman rank correlation for calibration quality assessment.
 *
 * Key requirements:
 * - Same vertical+sub_vertical only
 * - n >= 30 for valid correlation
 * - Scenario-level calibration
 */

import { CRS_DIMENSIONS, getRating } from '../types/crs.js';

/**
 * Calculate Spearman rank correlation coefficient
 * @param {number[]} x - First ranking
 * @param {number[]} y - Second ranking
 * @returns {number} Correlation coefficient (-1 to 1)
 */
export function spearmanCorrelation(x, y) {
  if (x.length !== y.length) {
    throw new Error('Arrays must have same length');
  }

  const n = x.length;
  if (n < 2) {
    throw new Error('Need at least 2 data points');
  }

  // Convert to ranks
  const rankX = toRanks(x);
  const rankY = toRanks(y);

  // Calculate sum of squared differences
  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = rankX[i] - rankY[i];
    sumD2 += d * d;
  }

  // Spearman formula: rho = 1 - (6 * sum(d^2)) / (n * (n^2 - 1))
  const rho = 1 - (6 * sumD2) / (n * (n * n - 1));

  return rho;
}

/**
 * Convert values to ranks (average rank for ties)
 * @param {number[]} arr - Values to rank
 * @returns {number[]} Ranks
 */
function toRanks(arr) {
  const indexed = arr.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => a.value - b.value);

  const ranks = new Array(arr.length);
  let i = 0;

  while (i < indexed.length) {
    // Find all elements with same value (ties)
    let j = i;
    while (j < indexed.length && indexed[j].value === indexed[i].value) {
      j++;
    }

    // Average rank for ties
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      ranks[indexed[k].index] = avgRank;
    }

    i = j;
  }

  return ranks;
}

/**
 * Calibration quality assessment thresholds
 */
export const CALIBRATION_THRESHOLDS = Object.freeze({
  EXCELLENT: { min: 0.9, label: 'Excellent agreement' },
  GOOD: { min: 0.7, label: 'Good agreement' },
  MODERATE: { min: 0.5, label: 'Moderate agreement' },
  POOR: { min: 0.3, label: 'Poor agreement' },
  VERY_POOR: { min: 0.0, label: 'Very poor agreement' },
});

/**
 * Get calibration quality label
 * @param {number} correlation - Spearman correlation
 * @returns {string} Quality label
 */
export function getCalibrationQuality(correlation) {
  const absCorr = Math.abs(correlation);
  for (const [key, threshold] of Object.entries(CALIBRATION_THRESHOLDS)) {
    if (absCorr >= threshold.min) {
      return key;
    }
  }
  return 'VERY_POOR';
}

/**
 * @typedef {Object} CalibrationSession
 * @property {string} session_id - UUID
 * @property {string} calibrator_id - User performing calibration
 * @property {string} vertical - Vertical being calibrated
 * @property {string} sub_vertical - Sub-vertical being calibrated
 * @property {string} started_at - ISO timestamp
 * @property {string} completed_at - ISO timestamp
 * @property {Object[]} calibrations - Individual score calibrations
 * @property {Object} summary - Session summary statistics
 */

/**
 * Create a calibration session
 * @param {Object} data - Session data
 * @returns {CalibrationSession}
 */
export function createCalibrationSession(data) {
  if (!data.calibrator_id) throw new Error('calibrator_id is required');
  if (!data.vertical) throw new Error('vertical is required');

  return {
    session_id: data.session_id || crypto.randomUUID(),
    calibrator_id: data.calibrator_id,
    vertical: data.vertical,
    sub_vertical: data.sub_vertical || null,
    started_at: new Date().toISOString(),
    completed_at: null,
    calibrations: [],
    summary: null,
  };
}

/**
 * Calculate calibration statistics for a session
 * @param {Object[]} calibrations - Array of calibrations
 * @returns {Object} Statistics
 */
export function calculateCalibrationStats(calibrations) {
  if (calibrations.length === 0) {
    return { count: 0, error: 'No calibrations to analyze' };
  }

  // Extract original and calibrated scores
  const originalScores = calibrations.map((c) => c.original_score);
  const calibratedScores = calibrations.map((c) => c.calibrated_score);

  // Calculate correlation
  let correlation = null;
  let correlationQuality = null;
  let correlationValid = false;

  if (calibrations.length >= 30) {
    correlation = spearmanCorrelation(originalScores, calibratedScores);
    correlationQuality = getCalibrationQuality(correlation);
    correlationValid = true;
  }

  // Calculate adjustment statistics
  const deltas = calibrations.map((c) => c.delta);
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const maxDelta = Math.max(...deltas.map(Math.abs));

  // Count by direction
  const increased = deltas.filter((d) => d > 0.01).length;
  const decreased = deltas.filter((d) => d < -0.01).length;
  const unchanged = deltas.filter((d) => Math.abs(d) <= 0.01).length;

  // Dimension-specific analysis
  const dimensionStats = {};
  for (const dim of Object.values(CRS_DIMENSIONS)) {
    const dimCalibrations = calibrations.filter((c) =>
      c.dimension_adjustments && c.dimension_adjustments[dim]
    );

    if (dimCalibrations.length > 0) {
      const dimDeltas = dimCalibrations.map((c) => c.dimension_adjustments[dim].delta);
      dimensionStats[dim] = {
        count: dimCalibrations.length,
        avg_delta: dimDeltas.reduce((a, b) => a + b, 0) / dimDeltas.length,
        bias_direction: dimDeltas.reduce((a, b) => a + b, 0) > 0 ? 'over_scored' : 'under_scored',
      };
    }
  }

  return {
    count: calibrations.length,
    correlation,
    correlation_quality: correlationQuality,
    correlation_valid: correlationValid,
    min_required_for_correlation: 30,
    adjustments: {
      average_delta: avgDelta,
      max_absolute_delta: maxDelta,
      increased,
      decreased,
      unchanged,
    },
    dimension_bias: dimensionStats,
    recommendation: generateCalibrationRecommendation(correlation, avgDelta, dimensionStats),
  };
}

/**
 * Generate recommendations based on calibration analysis
 */
function generateCalibrationRecommendation(correlation, avgDelta, dimensionStats) {
  const recommendations = [];

  if (correlation !== null) {
    if (correlation < 0.7) {
      recommendations.push({
        type: 'LOW_CORRELATION',
        severity: 'high',
        message: 'Low correlation between automated and human scores. Review dimension scoring logic.',
      });
    }
  }

  if (Math.abs(avgDelta) > 0.1) {
    const direction = avgDelta > 0 ? 'under-scoring' : 'over-scoring';
    recommendations.push({
      type: 'SYSTEMATIC_BIAS',
      severity: 'medium',
      message: `Automated scoring appears to be ${direction} by ${(Math.abs(avgDelta) * 100).toFixed(1)}% on average.`,
    });
  }

  // Check for dimension-specific bias
  for (const [dim, stats] of Object.entries(dimensionStats)) {
    if (Math.abs(stats.avg_delta) > 0.15) {
      recommendations.push({
        type: 'DIMENSION_BIAS',
        severity: 'medium',
        dimension: dim,
        message: `${dim} dimension shows ${stats.bias_direction} pattern (avg delta: ${(stats.avg_delta * 100).toFixed(1)}%).`,
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: 'CALIBRATION_GOOD',
      severity: 'low',
      message: 'Calibration shows good agreement between automated and human scoring.',
    });
  }

  return recommendations;
}

/**
 * Prepare a score for calibration review
 * @param {Object} score - CRS score
 * @param {Object} run - Scenario run
 * @returns {Object} Calibration review object
 */
export function prepareForCalibration(score, run) {
  return {
    score_id: score.score_id,
    run_id: run.run_id,
    scenario_id: run.scenario_id,
    overall_score: score.overall_score,
    overall_rating: getRating(score.overall_score),
    dimensions: Object.entries(score.dimension_scores).map(([dim, data]) => ({
      dimension: dim,
      score: data.score,
      weight: data.weight,
      rating: getRating(data.score),
      evidence_refs: data.evidence_refs || [],
    })),
    conversation: run.conversation.map((turn, i) => ({
      turn_number: i + 1,
      speaker: turn.speaker,
      content: turn.content,
    })),
    hard_outcome: run.hard_outcome,
    outcome_reason: run.outcome_reason,
    buyer_bot_id: run.buyer_bot_id,
    vertical: run.vertical,
    sub_vertical: run.sub_vertical,
  };
}

/**
 * Validate calibration submission
 * @param {Object} submission - Calibration submission
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateCalibrationSubmission(submission) {
  const errors = [];

  if (!submission.score_id) {
    errors.push('score_id is required');
  }

  if (!submission.calibrator_id) {
    errors.push('calibrator_id is required');
  }

  if (typeof submission.calibrated_overall_score !== 'number') {
    errors.push('calibrated_overall_score must be a number');
  } else if (submission.calibrated_overall_score < 0 || submission.calibrated_overall_score > 1) {
    errors.push('calibrated_overall_score must be between 0 and 1');
  }

  if (submission.dimension_adjustments) {
    for (const [dim, adjustment] of Object.entries(submission.dimension_adjustments)) {
      if (!Object.values(CRS_DIMENSIONS).includes(dim)) {
        errors.push(`Invalid dimension: ${dim}`);
      }
      if (typeof adjustment.delta !== 'number') {
        errors.push(`${dim}.delta must be a number`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate inter-rater reliability for multiple calibrators
 * @param {Object[]} calibrations - Calibrations from multiple raters for same scores
 * @returns {Object} Reliability metrics
 */
export function calculateInterRaterReliability(calibrations) {
  // Group by score_id
  const byScore = {};
  for (const cal of calibrations) {
    if (!byScore[cal.score_id]) {
      byScore[cal.score_id] = [];
    }
    byScore[cal.score_id].push(cal);
  }

  // Only consider scores with multiple raters
  const multiRated = Object.entries(byScore).filter(([, cals]) => cals.length >= 2);

  if (multiRated.length < 5) {
    return {
      valid: false,
      error: 'Need at least 5 scores rated by multiple calibrators',
    };
  }

  // Calculate pairwise correlations
  const correlations = [];

  for (const [, cals] of multiRated) {
    for (let i = 0; i < cals.length; i++) {
      for (let j = i + 1; j < cals.length; j++) {
        correlations.push({
          rater1: cals[i].calibrator_id,
          rater2: cals[j].calibrator_id,
          score_id: cals[i].score_id,
          agreement: 1 - Math.abs(cals[i].calibrated_score - cals[j].calibrated_score),
        });
      }
    }
  }

  const avgAgreement = correlations.reduce((sum, c) => sum + c.agreement, 0) / correlations.length;

  return {
    valid: true,
    multi_rated_scores: multiRated.length,
    pairwise_comparisons: correlations.length,
    average_agreement: avgAgreement,
    reliability_rating: avgAgreement >= 0.8 ? 'EXCELLENT' :
      avgAgreement >= 0.6 ? 'GOOD' :
        avgAgreement >= 0.4 ? 'MODERATE' : 'POOR',
  };
}
