/**
 * Human Calibration API Routes
 * S248: Human Calibration Tooling
 * PRD v1.3 Appendix §8
 *
 * Enables human experts to review and calibrate CRS scores.
 *
 * Endpoints:
 * - GET  /api/os/sales-bench/calibration/queue      - Get scores needing calibration
 * - GET  /api/os/sales-bench/calibration/review/:id - Get score for review
 * - POST /api/os/sales-bench/calibration/submit     - Submit calibration
 * - GET  /api/os/sales-bench/calibration/stats      - Get calibration statistics
 * - POST /api/os/sales-bench/calibration/session    - Start calibration session
 * - GET  /api/os/sales-bench/calibration/session/:id - Get session status
 */

import express from 'express';
import {
  spearmanCorrelation,
  calculateCalibrationStats,
  prepareForCalibration,
  validateCalibrationSubmission,
  calculateInterRaterReliability,
  getCalibrationQuality,
  CALIBRATION_THRESHOLDS,
} from '../../../os/sales-bench/calibration/calibration-engine.js';
import { getCRSScoreById, listCRSScores, applyCRSCalibration } from '../../../os/sales-bench/storage/crs-store.js';
import { getRunById } from '../../../os/sales-bench/storage/run-store.js';
import { AuthorityInvarianceError } from '../../../os/sales-bench/guards/authority-invariance.js';

const router = express.Router();

// In-memory session storage (would be database in production)
const calibrationSessions = new Map();

/**
 * GET /api/os/sales-bench/calibration/queue
 * Get scores that need human calibration
 */
router.get('/queue', async (req, res) => {
  try {
    const { vertical, sub_vertical, limit } = req.query;

    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'vertical query parameter is required (PRD v1.3 §7.3)',
      });
    }

    // Get uncalibrated scores
    const scores = await listCRSScores({
      vertical,
      sub_vertical,
      calibrated_only: false,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    // Filter to uncalibrated only
    const uncalibrated = scores.filter((s) => !s.is_calibrated);

    res.json({
      success: true,
      data: {
        queue: uncalibrated.map((s) => ({
          score_id: s.score_id,
          run_id: s.run_id,
          scenario_id: s.scenario_id,
          overall_score: s.overall_score,
          computed_at: s.computed_at,
          vertical: s.vertical,
          sub_vertical: s.sub_vertical,
        })),
        count: uncalibrated.length,
        total_scores: scores.length,
        calibration_rate: scores.length > 0
          ? (((scores.length - uncalibrated.length) / scores.length) * 100).toFixed(1)
          : 0,
      },
      message: `${uncalibrated.length} scores pending calibration`,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Calibration queue error:', error);
    res.status(500).json({
      success: false,
      error: 'QUEUE_FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/calibration/review/:id
 * Get a score prepared for human review
 */
router.get('/review/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get score
    const score = await getCRSScoreById(id);
    if (!score) {
      return res.status(404).json({
        success: false,
        error: 'SCORE_NOT_FOUND',
        message: `Score ${id} not found`,
      });
    }

    // Get run for conversation
    const run = await getRunById(score.run_id);
    if (!run) {
      return res.status(404).json({
        success: false,
        error: 'RUN_NOT_FOUND',
        message: `Run ${score.run_id} not found`,
      });
    }

    // Prepare for calibration
    const reviewData = prepareForCalibration(score, run);

    res.json({
      success: true,
      data: {
        review: reviewData,
        calibration_instructions: {
          task: 'Review the conversation and CRS scores. Adjust dimension scores if automated scoring is inaccurate.',
          dimensions: Object.values(require('../../../os/sales-bench/types/crs.js').CRS_DIMENSIONS),
          scale: '0.0 (worst) to 1.0 (best)',
          notes: 'Provide reasoning for significant adjustments (delta > 0.1)',
        },
        already_calibrated: score.is_calibrated,
        previous_calibrator: score.calibrated_by,
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Review fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'REVIEW_FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/calibration/submit
 * Submit a calibration for a score
 */
router.post('/submit', async (req, res) => {
  try {
    const submission = req.body;

    // Validate submission
    const validation = validateCalibrationSubmission(submission);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SUBMISSION',
        errors: validation.errors,
      });
    }

    const { score_id, calibrator_id, dimension_adjustments, notes } = submission;

    // Get original score
    const originalScore = await getCRSScoreById(score_id);
    if (!originalScore) {
      return res.status(404).json({
        success: false,
        error: 'SCORE_NOT_FOUND',
        message: `Score ${score_id} not found`,
      });
    }

    // Build adjustments object
    const adjustments = {};
    if (dimension_adjustments) {
      for (const [dim, adj] of Object.entries(dimension_adjustments)) {
        adjustments[dim] = {
          delta: adj.delta,
          note: adj.note || notes,
        };
      }
    }

    // Apply calibration
    const calibratedScore = await applyCRSCalibration(score_id, adjustments, calibrator_id);

    // Calculate delta
    const delta = calibratedScore.overall_score - originalScore.overall_score;

    res.status(201).json({
      success: true,
      data: {
        original_score_id: score_id,
        calibrated_score_id: calibratedScore.score_id,
        original_overall: originalScore.overall_score,
        calibrated_overall: calibratedScore.overall_score,
        delta,
        calibrator: calibrator_id,
        dimensions_adjusted: Object.keys(adjustments).length,
      },
      message: 'Calibration submitted successfully',
    });
  } catch (error) {
    if (error instanceof AuthorityInvarianceError) {
      return res.status(403).json({
        success: false,
        error: 'AUTHORITY_INVARIANCE_VIOLATION',
        message: error.message,
      });
    }

    console.error('[SALES_BENCH] Calibration submission error:', error);
    res.status(500).json({
      success: false,
      error: 'SUBMISSION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/calibration/stats
 * Get calibration statistics for a vertical
 */
router.get('/stats', async (req, res) => {
  try {
    const { vertical, sub_vertical } = req.query;

    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'vertical query parameter is required',
      });
    }

    // Get all calibrated scores
    const allScores = await listCRSScores({
      vertical,
      sub_vertical,
      limit: 1000,
    });

    const calibratedScores = allScores.filter((s) => s.is_calibrated && s.original_score_id);

    if (calibratedScores.length < 5) {
      return res.json({
        success: true,
        data: {
          vertical,
          sub_vertical: sub_vertical || 'all',
          calibration_count: calibratedScores.length,
          min_required: 30,
          status: 'INSUFFICIENT_DATA',
          message: `Need at least 30 calibrations for statistical analysis, have ${calibratedScores.length}`,
        },
      });
    }

    // Build calibration data for analysis
    const calibrations = [];
    for (const cal of calibratedScores) {
      // Get original score
      const original = allScores.find((s) => s.score_id === cal.original_score_id);
      if (original) {
        calibrations.push({
          score_id: cal.original_score_id,
          original_score: original.overall_score,
          calibrated_score: cal.overall_score,
          delta: cal.overall_score - original.overall_score,
          dimension_adjustments: cal.calibration_adjustments,
          calibrator_id: cal.calibrated_by,
        });
      }
    }

    // Calculate statistics
    const stats = calculateCalibrationStats(calibrations);

    res.json({
      success: true,
      data: {
        vertical,
        sub_vertical: sub_vertical || 'all',
        ...stats,
        thresholds: CALIBRATION_THRESHOLDS,
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Calibration stats error:', error);
    res.status(500).json({
      success: false,
      error: 'STATS_FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/calibration/session
 * Start a calibration session
 */
router.post('/session', async (req, res) => {
  try {
    const { calibrator_id, vertical, sub_vertical, batch_size } = req.body;

    if (!calibrator_id || !vertical) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'calibrator_id and vertical are required',
      });
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get queue of scores to calibrate
    const scores = await listCRSScores({
      vertical,
      sub_vertical,
      calibrated_only: false,
      limit: batch_size || 10,
    });

    const uncalibrated = scores.filter((s) => !s.is_calibrated);

    const session = {
      session_id: sessionId,
      calibrator_id,
      vertical,
      sub_vertical: sub_vertical || null,
      started_at: new Date().toISOString(),
      completed_at: null,
      queue: uncalibrated.map((s) => s.score_id),
      completed: [],
      current_index: 0,
    };

    calibrationSessions.set(sessionId, session);

    res.status(201).json({
      success: true,
      data: {
        session_id: sessionId,
        queue_length: session.queue.length,
        first_score_id: session.queue[0] || null,
      },
      message: 'Calibration session started',
    });
  } catch (error) {
    console.error('[SALES_BENCH] Session creation error:', error);
    res.status(500).json({
      success: false,
      error: 'SESSION_CREATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/calibration/session/:id
 * Get calibration session status
 */
router.get('/session/:id', (req, res) => {
  const { id } = req.params;

  const session = calibrationSessions.get(id);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'SESSION_NOT_FOUND',
      message: `Session ${id} not found`,
    });
  }

  const progress = session.queue.length > 0
    ? ((session.completed.length / session.queue.length) * 100).toFixed(1)
    : 0;

  res.json({
    success: true,
    data: {
      session_id: session.session_id,
      calibrator_id: session.calibrator_id,
      vertical: session.vertical,
      sub_vertical: session.sub_vertical,
      started_at: session.started_at,
      completed_at: session.completed_at,
      progress: `${progress}%`,
      queue_length: session.queue.length,
      completed_count: session.completed.length,
      remaining: session.queue.length - session.completed.length,
      current_score_id: session.queue[session.current_index] || null,
    },
  });
});

/**
 * POST /api/os/sales-bench/calibration/session/:id/next
 * Move to next score in session
 */
router.post('/session/:id/next', (req, res) => {
  const { id } = req.params;
  const { score_id } = req.body;

  const session = calibrationSessions.get(id);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'SESSION_NOT_FOUND',
      message: `Session ${id} not found`,
    });
  }

  // Mark current as completed
  if (score_id && !session.completed.includes(score_id)) {
    session.completed.push(score_id);
  }

  // Move to next
  session.current_index++;

  // Check if complete
  if (session.current_index >= session.queue.length) {
    session.completed_at = new Date().toISOString();
    return res.json({
      success: true,
      data: {
        session_complete: true,
        total_calibrated: session.completed.length,
      },
      message: 'Calibration session completed',
    });
  }

  const nextScoreId = session.queue[session.current_index];

  res.json({
    success: true,
    data: {
      next_score_id: nextScoreId,
      remaining: session.queue.length - session.current_index,
      progress: `${((session.current_index / session.queue.length) * 100).toFixed(1)}%`,
    },
  });
});

/**
 * GET /api/os/sales-bench/calibration/inter-rater
 * Get inter-rater reliability metrics
 */
router.get('/inter-rater', async (req, res) => {
  try {
    const { vertical, sub_vertical } = req.query;

    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'vertical query parameter is required',
      });
    }

    // Get all calibrated scores
    const allScores = await listCRSScores({
      vertical,
      sub_vertical,
      limit: 1000,
    });

    const calibratedScores = allScores.filter((s) => s.is_calibrated && s.original_score_id);

    // Build calibration data
    const calibrations = calibratedScores.map((cal) => ({
      score_id: cal.original_score_id,
      calibrated_score: cal.overall_score,
      calibrator_id: cal.calibrated_by,
    }));

    // Calculate inter-rater reliability
    const reliability = calculateInterRaterReliability(calibrations);

    res.json({
      success: true,
      data: {
        vertical,
        sub_vertical: sub_vertical || 'all',
        ...reliability,
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Inter-rater calculation error:', error);
    res.status(500).json({
      success: false,
      error: 'INTER_RATER_FAILED',
      message: error.message,
    });
  }
});

export default router;
