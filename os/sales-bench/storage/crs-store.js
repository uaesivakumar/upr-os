/**
 * CRS Storage Layer
 * S245: CRS Foundation
 * PRD v1.3 Appendix §4
 *
 * Handles storage and retrieval of CRS scores.
 * Scores are append-only (immutable after creation).
 */

import pool from '../../../server/db.js';
import {
  createCRSScore,
  calibrateCRSScore,
  calculateCRSAggregates,
  CRS_DIMENSIONS,
} from '../types/crs.js';
import {
  SALES_BENCH_CONTEXT,
  enforceAuthorityInvariance,
  assertTableAccess,
  assertCRSAdvisoryOnly,
} from '../guards/authority-invariance.js';

/**
 * Create a new CRS score record
 * @param {Object} data - Score data
 * @returns {Promise<Object>} Created score
 */
export async function createCRSScoreRecord(data) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'crs.create');
  assertTableAccess('sales_bench.crs_scores', 'write');

  // Ensure CRS is advisory only
  assertCRSAdvisoryOnly(data);

  const score = createCRSScore(data);

  const query = `
    INSERT INTO sales_bench.crs_scores (
      id, run_id, scenario_id, overall_score,
      dimension_scores, dimension_evidence,
      is_calibrated, calibrated_by, calibration_adjustments,
      vertical, sub_vertical
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
    RETURNING *
  `;

  // Get vertical info from scenario run
  const runQuery = `
    SELECT vertical, sub_vertical FROM sales_bench.scenario_runs WHERE id = $1
  `;
  const runResult = await pool.query(runQuery, [data.run_id]);

  if (runResult.rows.length === 0) {
    throw new Error(`Run not found: ${data.run_id}`);
  }

  const { vertical, sub_vertical } = runResult.rows[0];

  const values = [
    score.score_id,
    score.run_id,
    score.scenario_id,
    score.overall_score,
    JSON.stringify(score.dimension_scores),
    JSON.stringify(score.dimension_evidence),
    score.is_calibrated,
    score.calibrated_by,
    score.calibration_adjustments ? JSON.stringify(score.calibration_adjustments) : null,
    vertical,
    sub_vertical,
  ];

  const result = await pool.query(query, values);

  // Update the scenario run with CRS reference
  await pool.query(
    'UPDATE sales_bench.scenario_runs SET crs_score_id = $1 WHERE id = $2',
    [score.score_id, score.run_id]
  );

  return mapRowToScore(result.rows[0]);
}

/**
 * Get CRS score by ID
 * @param {string} scoreId - UUID
 * @returns {Promise<Object|null>} Score or null
 */
export async function getCRSScoreById(scoreId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'crs.read');

  const query = `
    SELECT * FROM sales_bench.crs_scores
    WHERE id = $1
  `;

  const result = await pool.query(query, [scoreId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToScore(result.rows[0]);
}

/**
 * Get CRS score for a run
 * @param {string} runId - Run UUID
 * @returns {Promise<Object|null>} Score or null
 */
export async function getCRSScoreByRun(runId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'crs.read');

  const query = `
    SELECT * FROM sales_bench.crs_scores
    WHERE run_id = $1
    ORDER BY computed_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [runId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToScore(result.rows[0]);
}

/**
 * List CRS scores with filters
 * PRD v1.3 §7.3: Vertical required
 * @param {Object} filters - Query filters
 * @returns {Promise<Object[]>} List of scores
 */
export async function listCRSScores(filters = {}) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'crs.list');

  if (!filters.vertical) {
    throw new Error('FORBIDDEN: vertical filter is required (PRD v1.3 §7.3)');
  }

  const conditions = ['vertical = $1'];
  const values = [filters.vertical];
  let paramIndex = 2;

  // Optional: sub_vertical
  if (filters.sub_vertical) {
    conditions.push(`sub_vertical = $${paramIndex}`);
    values.push(filters.sub_vertical);
    paramIndex++;
  }

  // Optional: scenario_id
  if (filters.scenario_id) {
    conditions.push(`scenario_id = $${paramIndex}`);
    values.push(filters.scenario_id);
    paramIndex++;
  }

  // Optional: min_score
  if (typeof filters.min_score === 'number') {
    conditions.push(`overall_score >= $${paramIndex}`);
    values.push(filters.min_score);
    paramIndex++;
  }

  // Optional: max_score
  if (typeof filters.max_score === 'number') {
    conditions.push(`overall_score <= $${paramIndex}`);
    values.push(filters.max_score);
    paramIndex++;
  }

  // Optional: calibrated only
  if (filters.calibrated_only) {
    conditions.push('is_calibrated = true');
  }

  const query = `
    SELECT * FROM sales_bench.crs_scores
    WHERE ${conditions.join(' AND ')}
    ORDER BY computed_at DESC
    LIMIT $${paramIndex}
  `;

  values.push(filters.limit || 100);

  const result = await pool.query(query, values);
  return result.rows.map(mapRowToScore);
}

/**
 * Apply human calibration to a CRS score
 * Creates a new calibrated version (append-only)
 * @param {string} scoreId - Original score ID
 * @param {Object} adjustments - Dimension adjustments
 * @param {string} calibratedBy - User making adjustments
 * @returns {Promise<Object>} Calibrated score
 */
export async function applyCRSCalibration(scoreId, adjustments, calibratedBy) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'crs.calibrate');

  // Get original score
  const original = await getCRSScoreById(scoreId);
  if (!original) {
    throw new Error(`Score not found: ${scoreId}`);
  }

  // Apply calibration
  const calibrated = calibrateCRSScore(original, adjustments, calibratedBy);

  // Store as new record (append-only - original is preserved)
  const query = `
    INSERT INTO sales_bench.crs_scores (
      id, run_id, scenario_id, overall_score,
      dimension_scores, dimension_evidence,
      is_calibrated, calibrated_by, calibration_adjustments,
      vertical, sub_vertical, original_score_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    RETURNING *
  `;

  const values = [
    calibrated.score_id,
    calibrated.run_id,
    calibrated.scenario_id,
    calibrated.overall_score,
    JSON.stringify(calibrated.dimension_scores),
    JSON.stringify(calibrated.dimension_evidence),
    true,
    calibratedBy,
    JSON.stringify(calibrated.calibration_adjustments),
    original.vertical,
    original.sub_vertical,
    scoreId, // Reference to original
  ];

  const result = await pool.query(query, values);
  return mapRowToScore(result.rows[0]);
}

/**
 * Get aggregate CRS statistics by vertical
 * @param {string} vertical - Vertical (REQUIRED)
 * @param {Object} filters - Additional filters
 * @returns {Promise<Object>} Aggregate statistics
 */
export async function getCRSAggregates(vertical, filters = {}) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'crs.stats');

  if (!vertical) {
    throw new Error('FORBIDDEN: vertical is required (PRD v1.3 §7.3)');
  }

  // Get all scores for aggregation
  const scores = await listCRSScores({
    vertical,
    sub_vertical: filters.sub_vertical,
    calibrated_only: filters.calibrated_only,
    limit: 1000, // Higher limit for aggregation
  });

  const aggregates = calculateCRSAggregates(scores);

  return {
    vertical,
    sub_vertical: filters.sub_vertical || 'all',
    ...aggregates,
  };
}

/**
 * Get dimension breakdown for a vertical
 * @param {string} vertical - Vertical
 * @returns {Promise<Object>} Dimension statistics
 */
export async function getDimensionBreakdown(vertical) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'crs.stats');

  if (!vertical) {
    throw new Error('FORBIDDEN: vertical is required (PRD v1.3 §7.3)');
  }

  const query = `
    SELECT
      dimension_scores
    FROM sales_bench.crs_scores
    WHERE vertical = $1
    ORDER BY computed_at DESC
    LIMIT 1000
  `;

  const result = await pool.query(query, [vertical]);

  const dimensionStats = {};
  for (const dim of Object.values(CRS_DIMENSIONS)) {
    dimensionStats[dim] = {
      scores: [],
      mean: 0,
      min: 1,
      max: 0,
    };
  }

  for (const row of result.rows) {
    const scores = typeof row.dimension_scores === 'string'
      ? JSON.parse(row.dimension_scores)
      : row.dimension_scores;

    for (const [dim, data] of Object.entries(scores)) {
      dimensionStats[dim].scores.push(data.score);
      dimensionStats[dim].min = Math.min(dimensionStats[dim].min, data.score);
      dimensionStats[dim].max = Math.max(dimensionStats[dim].max, data.score);
    }
  }

  // Calculate means
  for (const dim of Object.values(CRS_DIMENSIONS)) {
    const scores = dimensionStats[dim].scores;
    if (scores.length > 0) {
      dimensionStats[dim].mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    }
    delete dimensionStats[dim].scores; // Remove raw scores from response
    dimensionStats[dim].count = result.rows.length;
  }

  return {
    vertical,
    dimensions: dimensionStats,
    score_count: result.rows.length,
  };
}

/**
 * Map database row to score object
 * @param {Object} row - Database row
 * @returns {Object} Score object
 */
function mapRowToScore(row) {
  return {
    score_id: row.id,
    run_id: row.run_id,
    scenario_id: row.scenario_id,
    overall_score: parseFloat(row.overall_score),
    dimension_scores: typeof row.dimension_scores === 'string'
      ? JSON.parse(row.dimension_scores)
      : row.dimension_scores,
    dimension_evidence: typeof row.dimension_evidence === 'string'
      ? JSON.parse(row.dimension_evidence)
      : row.dimension_evidence,
    computed_at: row.computed_at,
    is_calibrated: row.is_calibrated,
    calibrated_by: row.calibrated_by,
    calibration_adjustments: row.calibration_adjustments
      ? (typeof row.calibration_adjustments === 'string'
        ? JSON.parse(row.calibration_adjustments)
        : row.calibration_adjustments)
      : null,
    vertical: row.vertical,
    sub_vertical: row.sub_vertical,
    original_score_id: row.original_score_id,
  };
}
