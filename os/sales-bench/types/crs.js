/**
 * CRS (Conversion Readiness Score) Type Definitions
 * S245: CRS Foundation
 * PRD v1.3 Appendix §4
 *
 * CRS is the summary metric for SIVA performance in Sales-Bench.
 * It has 8 dimensions with fixed weights that sum to 1.0.
 *
 * CRITICAL: CRS is ADVISORY ONLY. It never alters SIVA runtime behavior.
 */

import crypto from 'crypto';

/**
 * CRS Dimensions (PRD v1.3 §4.2)
 * Each dimension measures a specific aspect of sales conversation quality
 */
export const CRS_DIMENSIONS = Object.freeze({
  // Qualification & Discovery
  QUALIFICATION: 'qualification',     // Properly qualifying the prospect
  NEEDS_DISCOVERY: 'needs_discovery', // Uncovering true needs

  // Value & Positioning
  VALUE_ARTICULATION: 'value_articulation', // Communicating value clearly
  OBJECTION_HANDLING: 'objection_handling', // Addressing concerns effectively

  // Process & Compliance
  PROCESS_ADHERENCE: 'process_adherence', // Following sales methodology
  COMPLIANCE: 'compliance',               // Regulatory/policy compliance

  // Relationship & Closing
  RELATIONSHIP_BUILD: 'relationship_build', // Building rapport and trust
  NEXT_STEP_SECURED: 'next_step_secured',   // Advancing the deal
});

/**
 * Fixed CRS dimension weights (PRD v1.3 §4.2)
 * These weights are FIXED and cannot be modified per-vertical
 * They sum to exactly 1.0
 */
export const CRS_WEIGHTS = Object.freeze({
  [CRS_DIMENSIONS.QUALIFICATION]: 0.15,
  [CRS_DIMENSIONS.NEEDS_DISCOVERY]: 0.15,
  [CRS_DIMENSIONS.VALUE_ARTICULATION]: 0.15,
  [CRS_DIMENSIONS.OBJECTION_HANDLING]: 0.15,
  [CRS_DIMENSIONS.PROCESS_ADHERENCE]: 0.10,
  [CRS_DIMENSIONS.COMPLIANCE]: 0.10,
  [CRS_DIMENSIONS.RELATIONSHIP_BUILD]: 0.10,
  [CRS_DIMENSIONS.NEXT_STEP_SECURED]: 0.10,
});

// Validate weights sum to 1.0
const weightSum = Object.values(CRS_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightSum - 1.0) > 0.001) {
  throw new Error(`CRS weights must sum to 1.0, got ${weightSum}`);
}

/**
 * Score ranges for dimension interpretation
 */
export const SCORE_RANGES = Object.freeze({
  EXCELLENT: { min: 0.8, max: 1.0, label: 'Excellent' },
  GOOD: { min: 0.6, max: 0.8, label: 'Good' },
  NEEDS_IMPROVEMENT: { min: 0.4, max: 0.6, label: 'Needs Improvement' },
  POOR: { min: 0.2, max: 0.4, label: 'Poor' },
  CRITICAL: { min: 0.0, max: 0.2, label: 'Critical' },
});

/**
 * @typedef {Object} CRSScore
 * @property {string} score_id - UUID
 * @property {string} run_id - Reference to ScenarioRun
 * @property {string} scenario_id - Reference to SalesScenario
 * @property {number} overall_score - Weighted composite score (0-1)
 * @property {Object} dimension_scores - Individual dimension scores
 * @property {Object} dimension_evidence - Evidence for each dimension
 * @property {string} computed_at - ISO timestamp
 * @property {boolean} is_calibrated - Whether human-calibrated
 * @property {string} calibrated_by - User who calibrated (if any)
 * @property {Object} calibration_adjustments - Human adjustments (if any)
 */

/**
 * @typedef {Object} DimensionScore
 * @property {number} score - Raw score (0-1)
 * @property {number} weighted_score - Score * weight
 * @property {string} rating - EXCELLENT, GOOD, NEEDS_IMPROVEMENT, POOR, CRITICAL
 * @property {string[]} evidence_refs - References to evidence
 */

/**
 * Create a new CRS score
 * @param {Object} data - Score data
 * @returns {CRSScore}
 */
export function createCRSScore(data) {
  if (!data.run_id) throw new Error('run_id is required');
  if (!data.scenario_id) throw new Error('scenario_id is required');
  if (!data.dimension_scores) throw new Error('dimension_scores is required');

  // Validate all dimensions are present
  for (const dim of Object.values(CRS_DIMENSIONS)) {
    if (typeof data.dimension_scores[dim] !== 'number') {
      throw new Error(`Missing dimension score: ${dim}`);
    }
    if (data.dimension_scores[dim] < 0 || data.dimension_scores[dim] > 1) {
      throw new Error(`Dimension score out of range: ${dim} = ${data.dimension_scores[dim]}`);
    }
  }

  // Calculate weighted scores and overall
  const dimensionDetails = {};
  let overallScore = 0;

  for (const [dim, rawScore] of Object.entries(data.dimension_scores)) {
    const weight = CRS_WEIGHTS[dim];
    const weightedScore = rawScore * weight;
    overallScore += weightedScore;

    dimensionDetails[dim] = {
      score: rawScore,
      weight,
      weighted_score: weightedScore,
      rating: getRating(rawScore),
      evidence_refs: data.dimension_evidence?.[dim] || [],
    };
  }

  return {
    score_id: data.score_id || crypto.randomUUID(),
    run_id: data.run_id,
    scenario_id: data.scenario_id,
    overall_score: overallScore,
    dimension_scores: dimensionDetails,
    dimension_evidence: data.dimension_evidence || {},
    computed_at: data.computed_at || new Date().toISOString(),
    is_calibrated: data.is_calibrated || false,
    calibrated_by: data.calibrated_by || null,
    calibration_adjustments: data.calibration_adjustments || null,
  };
}

/**
 * Get rating label for a score
 * @param {number} score - Score 0-1
 * @returns {string} Rating label
 */
export function getRating(score) {
  for (const [key, range] of Object.entries(SCORE_RANGES)) {
    if (score >= range.min && score < range.max) {
      return key;
    }
  }
  if (score >= 1.0) return 'EXCELLENT';
  return 'CRITICAL';
}

/**
 * Apply human calibration adjustments to a CRS score
 * @param {CRSScore} score - Original score
 * @param {Object} adjustments - Human adjustments by dimension
 * @param {string} calibratedBy - User making adjustments
 * @returns {CRSScore} Calibrated score
 */
export function calibrateCRSScore(score, adjustments, calibratedBy) {
  const calibratedDimensions = { ...score.dimension_scores };
  let newOverallScore = 0;

  for (const [dim, adjustment] of Object.entries(adjustments)) {
    if (!CRS_DIMENSIONS[dim.toUpperCase()] && !Object.values(CRS_DIMENSIONS).includes(dim)) {
      throw new Error(`Invalid dimension for calibration: ${dim}`);
    }

    const dimKey = Object.values(CRS_DIMENSIONS).includes(dim) ? dim : CRS_DIMENSIONS[dim.toUpperCase()];
    const current = calibratedDimensions[dimKey];

    if (current) {
      const newScore = Math.max(0, Math.min(1, current.score + adjustment.delta));
      const weight = CRS_WEIGHTS[dimKey];

      calibratedDimensions[dimKey] = {
        ...current,
        score: newScore,
        weighted_score: newScore * weight,
        rating: getRating(newScore),
        calibration_note: adjustment.note || null,
        original_score: current.score,
      };
    }
  }

  // Recalculate overall
  for (const dim of Object.values(calibratedDimensions)) {
    newOverallScore += dim.weighted_score;
  }

  return {
    ...score,
    overall_score: newOverallScore,
    dimension_scores: calibratedDimensions,
    is_calibrated: true,
    calibrated_by: calibratedBy,
    calibration_adjustments: adjustments,
    calibrated_at: new Date().toISOString(),
  };
}

/**
 * Compare two CRS scores
 * @param {CRSScore} scoreA - First score
 * @param {CRSScore} scoreB - Second score
 * @returns {Object} Comparison result
 */
export function compareCRSScores(scoreA, scoreB) {
  const comparison = {
    overall_delta: scoreB.overall_score - scoreA.overall_score,
    overall_direction: scoreB.overall_score > scoreA.overall_score ? 'improved' : scoreB.overall_score < scoreA.overall_score ? 'declined' : 'unchanged',
    dimension_deltas: {},
    biggest_improvement: null,
    biggest_decline: null,
  };

  let maxImprovement = 0;
  let maxDecline = 0;

  for (const dim of Object.values(CRS_DIMENSIONS)) {
    const delta = scoreB.dimension_scores[dim].score - scoreA.dimension_scores[dim].score;
    comparison.dimension_deltas[dim] = {
      delta,
      direction: delta > 0 ? 'improved' : delta < 0 ? 'declined' : 'unchanged',
    };

    if (delta > maxImprovement) {
      maxImprovement = delta;
      comparison.biggest_improvement = { dimension: dim, delta };
    }
    if (delta < maxDecline) {
      maxDecline = delta;
      comparison.biggest_decline = { dimension: dim, delta };
    }
  }

  return comparison;
}

/**
 * Calculate aggregate CRS statistics for a set of scores
 * @param {CRSScore[]} scores - Array of CRS scores
 * @returns {Object} Aggregate statistics
 */
export function calculateCRSAggregates(scores) {
  if (scores.length === 0) {
    return { count: 0, error: 'No scores to aggregate' };
  }

  const aggregates = {
    count: scores.length,
    overall: {
      mean: 0,
      min: 1,
      max: 0,
      std_dev: 0,
    },
    by_dimension: {},
    by_rating: {
      EXCELLENT: 0,
      GOOD: 0,
      NEEDS_IMPROVEMENT: 0,
      POOR: 0,
      CRITICAL: 0,
    },
  };

  // Initialize dimension aggregates
  for (const dim of Object.values(CRS_DIMENSIONS)) {
    aggregates.by_dimension[dim] = {
      mean: 0,
      min: 1,
      max: 0,
    };
  }

  // First pass: sum and find min/max
  for (const score of scores) {
    aggregates.overall.mean += score.overall_score;
    aggregates.overall.min = Math.min(aggregates.overall.min, score.overall_score);
    aggregates.overall.max = Math.max(aggregates.overall.max, score.overall_score);

    // Count by rating
    const rating = getRating(score.overall_score);
    aggregates.by_rating[rating]++;

    // Dimension stats
    for (const dim of Object.values(CRS_DIMENSIONS)) {
      const dimScore = score.dimension_scores[dim].score;
      aggregates.by_dimension[dim].mean += dimScore;
      aggregates.by_dimension[dim].min = Math.min(aggregates.by_dimension[dim].min, dimScore);
      aggregates.by_dimension[dim].max = Math.max(aggregates.by_dimension[dim].max, dimScore);
    }
  }

  // Calculate means
  aggregates.overall.mean /= scores.length;
  for (const dim of Object.values(CRS_DIMENSIONS)) {
    aggregates.by_dimension[dim].mean /= scores.length;
  }

  // Second pass: standard deviation
  let variance = 0;
  for (const score of scores) {
    variance += Math.pow(score.overall_score - aggregates.overall.mean, 2);
  }
  aggregates.overall.std_dev = Math.sqrt(variance / scores.length);

  return aggregates;
}

/**
 * Validate that a score meets minimum thresholds
 * @param {CRSScore} score - Score to validate
 * @param {Object} thresholds - Minimum thresholds by dimension
 * @returns {{passes: boolean, failures: Object[]}}
 */
export function validateScoreThresholds(score, thresholds = {}) {
  const defaultThresholds = {
    overall: 0.5,
    [CRS_DIMENSIONS.COMPLIANCE]: 0.6, // Higher threshold for compliance
  };

  const effectiveThresholds = { ...defaultThresholds, ...thresholds };
  const failures = [];

  // Check overall
  if (score.overall_score < effectiveThresholds.overall) {
    failures.push({
      type: 'overall',
      threshold: effectiveThresholds.overall,
      actual: score.overall_score,
    });
  }

  // Check dimensions
  for (const [dim, threshold] of Object.entries(effectiveThresholds)) {
    if (dim === 'overall') continue;
    if (score.dimension_scores[dim] && score.dimension_scores[dim].score < threshold) {
      failures.push({
        type: 'dimension',
        dimension: dim,
        threshold,
        actual: score.dimension_scores[dim].score,
      });
    }
  }

  return {
    passes: failures.length === 0,
    failures,
  };
}
