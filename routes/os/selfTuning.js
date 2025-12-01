/**
 * =====================================================
 * Sprint 69: Self-Tuning Routes
 * =====================================================
 *
 * REST API endpoints for ML Self-Tuning system.
 * All apply/complete actions are checkpoint-protected via S66.
 *
 * Endpoints:
 * - GET  /api/os/tuning/actions     - List tuning actions
 * - POST /api/os/tuning/apply       - Apply a tuning action (checkpoint-protected)
 * - POST /api/os/tuning/complete    - Complete a tuning action after checkpoint
 * - POST /api/os/tuning/reject      - Reject a tuning action
 * - POST /api/os/tuning/generate    - Generate new tuning proposals
 * - GET  /api/os/tuning/patterns    - Get win/loss patterns
 * - POST /api/os/tuning/patterns/compute - Recompute patterns
 * - GET  /api/os/tuning/personas    - Get persona stats
 * - POST /api/os/tuning/personas/compute - Recompute persona stats
 * - GET  /api/os/tuning/journeys    - Get journey suggestions
 * - POST /api/os/tuning/journeys/generate - Generate journey suggestions
 * - GET  /api/os/tuning/config      - Get scoring config
 * - GET  /api/os/tuning/health      - Health check
 */

import { Router } from 'express';
import * as selfTuning from '../../services/selfTuning.js';

const router = Router();

// =====================================================
// TUNING ACTIONS
// =====================================================

/**
 * GET /api/os/tuning/actions
 * List tuning actions with optional filters
 */
router.get('/actions', async (req, res) => {
  try {
    const { status, verticalSlug, modelName, limit } = req.query;

    const actions = await selfTuning.listTuningActions({
      status,
      verticalSlug,
      modelName,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    res.json({
      success: true,
      data: actions,
      count: actions.length,
    });
  } catch (error) {
    console.error('Error listing tuning actions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/os/tuning/apply
 * Apply a tuning action (creates S66 checkpoint)
 */
router.post('/apply', async (req, res) => {
  try {
    const { actionId, approvedBy, verticalSlug, territoryId } = req.body;

    if (!actionId) {
      return res.status(400).json({
        success: false,
        error: 'actionId is required',
      });
    }

    if (!verticalSlug) {
      return res.status(400).json({
        success: false,
        error: 'verticalSlug is required',
      });
    }

    const result = await selfTuning.applyTuningAction({
      actionId,
      approvedBy: approvedBy || 'api',
      verticalSlug,
      territoryId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error applying tuning action:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/os/tuning/complete
 * Complete a tuning action after checkpoint approval
 */
router.post('/complete', async (req, res) => {
  try {
    const { actionId, completedBy } = req.body;

    if (!actionId) {
      return res.status(400).json({
        success: false,
        error: 'actionId is required',
      });
    }

    const result = await selfTuning.completeTuningAction({
      actionId,
      completedBy: completedBy || 'api',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error completing tuning action:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/os/tuning/reject
 * Reject a tuning action
 */
router.post('/reject', async (req, res) => {
  try {
    const { actionId, rejectedBy, reason } = req.body;

    if (!actionId) {
      return res.status(400).json({
        success: false,
        error: 'actionId is required',
      });
    }

    const result = await selfTuning.rejectTuningAction({
      actionId,
      rejectedBy: rejectedBy || 'api',
      reason: reason || 'No reason provided',
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error rejecting tuning action:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/os/tuning/generate
 * Generate new tuning action proposals
 */
router.post('/generate', async (req, res) => {
  try {
    const { verticalSlug, territoryId, modelName } = req.body;

    if (!verticalSlug) {
      return res.status(400).json({
        success: false,
        error: 'verticalSlug is required',
      });
    }

    const actions = await selfTuning.generateScoringTuningActions({
      verticalSlug,
      territoryId,
      modelName,
    });

    res.json({
      success: true,
      data: actions,
      generated: actions.length,
    });
  } catch (error) {
    console.error('Error generating tuning actions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =====================================================
// WIN/LOSS PATTERNS
// =====================================================

/**
 * GET /api/os/tuning/patterns
 * Get win/loss patterns
 */
router.get('/patterns', async (req, res) => {
  try {
    const { verticalSlug, segmentKey, minConfidence } = req.query;

    const patterns = await selfTuning.getWinLossPatterns({
      verticalSlug,
      segmentKey,
      minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
    });

    res.json({
      success: true,
      data: patterns,
      count: patterns.length,
    });
  } catch (error) {
    console.error('Error getting patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/os/tuning/patterns/compute
 * Recompute win/loss patterns
 */
router.post('/patterns/compute', async (req, res) => {
  try {
    const { verticalSlug, territoryId, timeWindowDays } = req.body;

    if (!verticalSlug) {
      return res.status(400).json({
        success: false,
        error: 'verticalSlug is required',
      });
    }

    const patterns = await selfTuning.generateWinLossPatterns({
      verticalSlug,
      territoryId,
      timeWindowDays: timeWindowDays ? parseInt(timeWindowDays, 10) : undefined,
    });

    res.json({
      success: true,
      data: patterns,
      computed: patterns.length,
    });
  } catch (error) {
    console.error('Error computing patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =====================================================
// PERSONA STATS
// =====================================================

/**
 * GET /api/os/tuning/personas
 * Get persona performance stats
 */
router.get('/personas', async (req, res) => {
  try {
    const { verticalSlug, personaKey, topN } = req.query;

    const stats = await selfTuning.getPersonaStats({
      verticalSlug,
      personaKey,
      topN: topN ? parseInt(topN, 10) : undefined,
    });

    res.json({
      success: true,
      data: stats,
      count: stats.length,
    });
  } catch (error) {
    console.error('Error getting persona stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/os/tuning/personas/top
 * Get top personas for a vertical
 */
router.get('/personas/top', async (req, res) => {
  try {
    const { verticalSlug, territoryId, limit } = req.query;

    if (!verticalSlug) {
      return res.status(400).json({
        success: false,
        error: 'verticalSlug is required',
      });
    }

    const personas = await selfTuning.getTopPersonas({
      verticalSlug,
      territoryId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    res.json({
      success: true,
      data: personas,
      count: personas.length,
    });
  } catch (error) {
    console.error('Error getting top personas:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/os/tuning/personas/compute
 * Recompute persona stats
 */
router.post('/personas/compute', async (req, res) => {
  try {
    const { verticalSlug, territoryId, timeWindowDays } = req.body;

    if (!verticalSlug) {
      return res.status(400).json({
        success: false,
        error: 'verticalSlug is required',
      });
    }

    const stats = await selfTuning.computePersonaStats({
      verticalSlug,
      territoryId,
      timeWindowDays: timeWindowDays ? parseInt(timeWindowDays, 10) : undefined,
    });

    res.json({
      success: true,
      data: stats,
      computed: stats.length,
    });
  } catch (error) {
    console.error('Error computing persona stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =====================================================
// JOURNEY SUGGESTIONS
// =====================================================

/**
 * GET /api/os/tuning/journeys
 * Get journey tuning suggestions
 */
router.get('/journeys', async (req, res) => {
  try {
    const { verticalSlug, journeyId, status } = req.query;

    const suggestions = await selfTuning.getJourneySuggestions({
      verticalSlug,
      journeyId,
      status,
    });

    res.json({
      success: true,
      data: suggestions,
      count: suggestions.length,
    });
  } catch (error) {
    console.error('Error getting journey suggestions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/os/tuning/journeys/generate
 * Generate journey optimization suggestions
 */
router.post('/journeys/generate', async (req, res) => {
  try {
    const { verticalSlug, territoryId, journeyId } = req.body;

    if (!verticalSlug) {
      return res.status(400).json({
        success: false,
        error: 'verticalSlug is required',
      });
    }

    const suggestions = await selfTuning.generateJourneySuggestions({
      verticalSlug,
      territoryId,
      journeyId,
    });

    res.json({
      success: true,
      data: suggestions,
      generated: suggestions.length,
    });
  } catch (error) {
    console.error('Error generating journey suggestions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =====================================================
// SCORING CONFIG
// =====================================================

/**
 * GET /api/os/tuning/config
 * Get scoring configuration
 */
router.get('/config', async (req, res) => {
  try {
    const { modelName, verticalSlug, enabledOnly } = req.query;

    const configs = await selfTuning.listScoringConfigs({
      modelName,
      verticalSlug,
      enabledOnly: enabledOnly !== 'false',
    });

    res.json({
      success: true,
      data: configs,
      count: configs.length,
    });
  } catch (error) {
    console.error('Error getting scoring config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/os/tuning/config/:modelName
 * Get active scoring config for a specific model
 */
router.get('/config/:modelName', async (req, res) => {
  try {
    const { modelName } = req.params;
    const { verticalSlug, territoryId } = req.query;

    const config = await selfTuning.getScoringConfig({
      modelName,
      verticalSlug,
      territoryId,
    });

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('Error getting model config:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =====================================================
// ANALYSIS & UTILITIES
// =====================================================

/**
 * POST /api/os/tuning/analyze
 * Run performance analysis
 */
router.post('/analyze', async (req, res) => {
  try {
    const { verticalSlug, territoryId, timeWindowDays } = req.body;

    if (!verticalSlug) {
      return res.status(400).json({
        success: false,
        error: 'verticalSlug is required',
      });
    }

    const analysis = await selfTuning.analyzePerformance({
      verticalSlug,
      territoryId,
      timeWindowDays: timeWindowDays ? parseInt(timeWindowDays, 10) : undefined,
    });

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('Error analyzing performance:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/os/tuning/summary
 * Get tuning summary statistics
 */
router.get('/summary', async (req, res) => {
  try {
    const { verticalSlug } = req.query;

    const summary = await selfTuning.getTuningSummary(verticalSlug);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/os/tuning/expire
 * Expire old proposed actions
 */
router.post('/expire', async (req, res) => {
  try {
    const { maxAgeDays } = req.body;

    const expiredCount = await selfTuning.expireOldActions(
      maxAgeDays ? parseInt(maxAgeDays, 10) : undefined
    );

    res.json({
      success: true,
      expired: expiredCount,
    });
  } catch (error) {
    console.error('Error expiring actions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/os/tuning/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const health = await selfTuning.getHealth();

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    console.error('Error getting health:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
