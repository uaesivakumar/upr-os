/**
 * CRS API Routes
 * S245-S246: CRS Foundation & Dimension Scoring
 * PRD v1.3 Appendix §4
 *
 * CRITICAL: CRS is ADVISORY ONLY. It never alters SIVA runtime behavior.
 *
 * Endpoints:
 * - POST /api/os/sales-bench/crs/score/:runId    - Compute CRS for a run
 * - GET  /api/os/sales-bench/crs/:scoreId        - Get CRS score by ID
 * - GET  /api/os/sales-bench/crs/run/:runId      - Get CRS for a run
 * - GET  /api/os/sales-bench/crs                 - List CRS scores
 * - POST /api/os/sales-bench/crs/:scoreId/calibrate - Apply human calibration
 * - GET  /api/os/sales-bench/crs/stats/:vertical - Get CRS aggregates
 * - GET  /api/os/sales-bench/crs/dimensions      - Get dimension reference
 */

import express from 'express';
import {
  createCRSScoreRecord,
  getCRSScoreById,
  getCRSScoreByRun,
  listCRSScores,
  applyCRSCalibration,
  getCRSAggregates,
  getDimensionBreakdown,
} from '../../../os/sales-bench/storage/crs-store.js';
import { getRunById } from '../../../os/sales-bench/storage/run-store.js';
import { getScenarioById } from '../../../os/sales-bench/storage/scenario-store.js';
import { scoreConversation, getDimensionInfo } from '../../../os/sales-bench/engine/dimension-scorer.js';
import { CRS_DIMENSIONS, CRS_WEIGHTS } from '../../../os/sales-bench/types/crs.js';
import { AuthorityInvarianceError } from '../../../os/sales-bench/guards/authority-invariance.js';

const router = express.Router();

/**
 * POST /api/os/sales-bench/crs/score/:runId
 * Compute CRS score for a completed scenario run
 */
router.post('/score/:runId', async (req, res) => {
  try {
    const { runId } = req.params;

    // Get the run
    const run = await getRunById(runId);
    if (!run) {
      return res.status(404).json({
        success: false,
        error: 'RUN_NOT_FOUND',
        message: `Run with ID ${runId} not found`,
      });
    }

    // Run must be completed
    if (!run.completed_at) {
      return res.status(400).json({
        success: false,
        error: 'RUN_NOT_COMPLETED',
        message: 'Cannot score an incomplete run',
      });
    }

    // Check if already scored
    const existingScore = await getCRSScoreByRun(runId);
    if (existingScore && !req.body.force_rescore) {
      return res.status(409).json({
        success: false,
        error: 'ALREADY_SCORED',
        existing_score_id: existingScore.score_id,
        message: 'Run already has a CRS score. Use force_rescore=true to rescore.',
      });
    }

    // Get scenario for context
    const scenario = await getScenarioById(run.scenario_id);

    // Score the conversation
    const { dimension_scores, dimension_evidence } = scoreConversation({
      conversation: run.conversation,
      scenario,
      run,
      hard_outcome: run.hard_outcome,
    });

    // Create CRS score record
    const score = await createCRSScoreRecord({
      run_id: runId,
      scenario_id: run.scenario_id,
      dimension_scores,
      dimension_evidence,
    });

    res.status(201).json({
      success: true,
      data: score,
      message: 'CRS score computed successfully',
      note: 'CRS is advisory only - it does not alter SIVA runtime behavior',
    });
  } catch (error) {
    if (error instanceof AuthorityInvarianceError) {
      return res.status(403).json({
        success: false,
        error: 'AUTHORITY_INVARIANCE_VIOLATION',
        message: error.message,
        prdReference: error.prdReference,
      });
    }

    console.error('[SALES_BENCH] CRS scoring error:', error);
    res.status(500).json({
      success: false,
      error: 'CRS_SCORING_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/crs/:scoreId
 * Get CRS score by ID
 */
router.get('/:scoreId', async (req, res) => {
  try {
    const { scoreId } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(scoreId)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SCORE_ID',
        message: 'Score ID must be a valid UUID',
      });
    }

    const score = await getCRSScoreById(scoreId);

    if (!score) {
      return res.status(404).json({
        success: false,
        error: 'SCORE_NOT_FOUND',
        message: `CRS score with ID ${scoreId} not found`,
      });
    }

    res.json({
      success: true,
      data: score,
    });
  } catch (error) {
    console.error('[SALES_BENCH] CRS retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'CRS_RETRIEVAL_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/crs/run/:runId
 * Get CRS score for a specific run
 */
router.get('/run/:runId', async (req, res) => {
  try {
    const { runId } = req.params;

    const score = await getCRSScoreByRun(runId);

    if (!score) {
      return res.status(404).json({
        success: false,
        error: 'SCORE_NOT_FOUND',
        message: `No CRS score found for run ${runId}`,
      });
    }

    res.json({
      success: true,
      data: score,
    });
  } catch (error) {
    console.error('[SALES_BENCH] CRS retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'CRS_RETRIEVAL_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/crs
 * List CRS scores with filters
 * PRD v1.3 §7.3: Vertical filter is REQUIRED
 */
router.get('/', async (req, res) => {
  try {
    const {
      vertical,
      sub_vertical,
      scenario_id,
      min_score,
      max_score,
      calibrated_only,
      limit,
    } = req.query;

    // PRD v1.3 §7.3: Vertical is REQUIRED
    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'vertical query parameter is required (PRD v1.3 §7.3: Cross-vertical aggregation forbidden)',
        prdReference: 'PRD v1.3 §7.3',
      });
    }

    const filters = {
      vertical,
      sub_vertical,
      scenario_id,
      min_score: min_score ? parseFloat(min_score) : undefined,
      max_score: max_score ? parseFloat(max_score) : undefined,
      calibrated_only: calibrated_only === 'true',
      limit: limit ? parseInt(limit, 10) : 100,
    };

    const scores = await listCRSScores(filters);

    res.json({
      success: true,
      data: scores,
      count: scores.length,
      filters: {
        vertical,
        sub_vertical: sub_vertical || null,
        min_score: filters.min_score || null,
        max_score: filters.max_score || null,
        calibrated_only: filters.calibrated_only,
      },
    });
  } catch (error) {
    if (error.message.includes('FORBIDDEN')) {
      return res.status(403).json({
        success: false,
        error: 'CROSS_VERTICAL_FORBIDDEN',
        message: error.message,
        prdReference: 'PRD v1.3 §7.3',
      });
    }

    console.error('[SALES_BENCH] CRS list error:', error);
    res.status(500).json({
      success: false,
      error: 'CRS_LIST_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/crs/:scoreId/calibrate
 * Apply human calibration to a CRS score
 */
router.post('/:scoreId/calibrate', async (req, res) => {
  try {
    const { scoreId } = req.params;
    const { adjustments, calibrated_by } = req.body;

    if (!adjustments || typeof adjustments !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'ADJUSTMENTS_REQUIRED',
        message: 'adjustments object is required',
        example: {
          adjustments: {
            qualification: { delta: 0.1, note: 'Reviewer noted missed opportunity' },
            objection_handling: { delta: -0.05, note: 'Overscored initially' },
          },
        },
      });
    }

    if (!calibrated_by) {
      return res.status(400).json({
        success: false,
        error: 'CALIBRATOR_REQUIRED',
        message: 'calibrated_by field is required',
      });
    }

    const calibratedScore = await applyCRSCalibration(scoreId, adjustments, calibrated_by);

    res.status(201).json({
      success: true,
      data: calibratedScore,
      message: 'CRS calibration applied successfully',
      original_score_id: scoreId,
      note: 'Original score preserved. Calibrated score is new record.',
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'SCORE_NOT_FOUND',
        message: error.message,
      });
    }

    if (error.message.includes('Invalid dimension')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DIMENSION',
        message: error.message,
        valid_dimensions: Object.values(CRS_DIMENSIONS),
      });
    }

    console.error('[SALES_BENCH] CRS calibration error:', error);
    res.status(500).json({
      success: false,
      error: 'CRS_CALIBRATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/crs/stats/:vertical
 * Get CRS aggregate statistics by vertical
 */
router.get('/stats/:vertical', async (req, res) => {
  try {
    const { vertical } = req.params;
    const { sub_vertical, calibrated_only } = req.query;

    const aggregates = await getCRSAggregates(vertical, {
      sub_vertical,
      calibrated_only: calibrated_only === 'true',
    });

    res.json({
      success: true,
      data: aggregates,
    });
  } catch (error) {
    console.error('[SALES_BENCH] CRS stats error:', error);
    res.status(500).json({
      success: false,
      error: 'CRS_STATS_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/crs/dimensions
 * Get CRS dimension reference information
 */
router.get('/dimensions', (req, res) => {
  const dimensions = Object.values(CRS_DIMENSIONS).map((dim) => ({
    key: dim,
    weight: CRS_WEIGHTS[dim],
    ...getDimensionInfo(dim),
  }));

  const totalWeight = Object.values(CRS_WEIGHTS).reduce((a, b) => a + b, 0);

  res.json({
    success: true,
    data: {
      dimensions,
      total_weight: totalWeight,
      weight_validation: Math.abs(totalWeight - 1.0) < 0.001 ? 'VALID' : 'INVALID',
    },
    note: 'CRS dimensions and weights are fixed per PRD v1.3 §4.2',
    prdReference: 'PRD v1.3 §4.2',
  });
});

/**
 * GET /api/os/sales-bench/crs/dimensions/:vertical
 * Get dimension breakdown for a vertical
 */
router.get('/dimensions/:vertical', async (req, res) => {
  try {
    const { vertical } = req.params;

    const breakdown = await getDimensionBreakdown(vertical);

    res.json({
      success: true,
      data: breakdown,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Dimension breakdown error:', error);
    res.status(500).json({
      success: false,
      error: 'DIMENSION_BREAKDOWN_FAILED',
      message: error.message,
    });
  }
});

export default router;
