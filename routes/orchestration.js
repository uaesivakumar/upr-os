/**
 * Multi-Source Orchestration Routes
 * Sprint 19, Task 1: Multi-Source Orchestration
 *
 * API endpoints for multi-source signal discovery orchestration
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import multiSourceOrchestrator from '../server/services/multiSourceOrchestrator.js';
import sourcePrioritization from '../server/services/sourcePrioritization.js';
import signalQualityScoring from '../server/services/signalQualityScoring.js';
import pool from '../server/db.js';

const router = express.Router();

/**
 * POST /api/orchestration/discover
 * Execute multi-source signal discovery
 *
 * Body:
 * {
 *   "sources": ["news", "linkedin"],  // Optional: specific sources
 *   "filters": { ... },                // Optional: discovery filters
 *   "maxParallel": 4,                  // Optional: max concurrent sources
 *   "tenantId": "uuid"                 // Required
 * }
 */
router.post('/discover', async (req, res) => {
  try {
    const {
      sources = null,
      filters = {},
      maxParallel = 4,
      tenantId
    } = req.body;

    // Validate tenantId
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Missing tenantId'
      });
    }

    console.log(`[Orchestration API] Starting discovery for tenant: ${tenantId}`);

    // Execute orchestration
    const result = await multiSourceOrchestrator.orchestrate({
      sources,
      filters,
      maxParallel,
      tenantId
    });

    // Save discovered signals to database (if any)
    if (result.signals && result.signals.length > 0) {
      let savedCount = 0;

      for (const signal of result.signals) {
        try {
          await pool.query(
            `INSERT INTO hiring_signals (
              tenant_id,
              company,
              domain,
              sector,
              trigger_type,
              description,
              source_url,
              source_date,
              evidence_quote,
              evidence_note,
              location,
              geo_status,
              geo_hints,
              confidence_score,
              source_type,
              review_status,
              notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', $16)
            ON CONFLICT DO NOTHING
            RETURNING *`,
            [
              tenantId,
              signal.company,
              signal.domain,
              signal.sector,
              signal.trigger_type,
              signal.description,
              signal.source_url,
              signal.source_date,
              signal.evidence_quote,
              signal.evidence_note,
              signal.location,
              signal.geo_status,
              signal.geo_hints || [],
              signal.confidence_score || 0.65,
              signal.source_type,
              JSON.stringify({
                orchestration_id: result.orchestrationId,
                discovery_source: 'multi_source_orchestration'
              })
            ]
          );

          savedCount++;
        } catch (error) {
          console.error('[Orchestration API] Error saving signal:', error);
          // Continue with next signal
        }
      }

      result.signalsSaved = savedCount;
    }

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('[Orchestration API] Discovery error:', error);
    Sentry.captureException(error, {
      tags: {
        route: '/api/orchestration/discover'
      }
    });

    res.status(500).json({
      success: false,
      error: 'Failed to execute multi-source discovery',
      message: error.message
    });
  }
});

/**
 * GET /api/orchestration/sources
 * Get all source configurations and health status
 */
router.get('/sources', async (req, res) => {
  try {
    // Get source configurations from orchestrator
    const sources = multiSourceOrchestrator.getAllSources();

    // Get source health from database
    const healthResult = await pool.query(
      'SELECT * FROM source_health ORDER BY source_id'
    );

    const sourcesWithHealth = sources.map(source => {
      const health = healthResult.rows.find(h => h.source_id === source.id);
      return {
        ...source,
        health: health ? {
          totalRuns: health.total_runs,
          successfulRuns: health.successful_runs,
          failedRuns: health.failed_runs,
          avgExecutionTimeMs: health.avg_execution_time_ms,
          lastSuccessAt: health.last_success_at,
          lastFailureAt: health.last_failure_at,
          signalsPerRun: parseFloat(health.signals_per_run) || 0,
          uptimePercentage: parseFloat(health.uptime_percentage) || 100
        } : null
      };
    });

    res.json({
      success: true,
      sources: sourcesWithHealth
    });

  } catch (error) {
    console.error('[Orchestration API] Error getting sources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get source configurations'
    });
  }
});

/**
 * POST /api/orchestration/sources/:sourceId/enable
 * Enable a specific source
 */
router.post('/sources/:sourceId/enable', async (req, res) => {
  try {
    const { sourceId } = req.params;

    const success = multiSourceOrchestrator.enableSource(sourceId);

    if (success) {
      // Update database
      await pool.query(
        'UPDATE source_health SET enabled = true WHERE source_id = $1',
        [sourceId]
      );

      res.json({
        success: true,
        message: `Source ${sourceId} enabled`
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Source ${sourceId} not found`
      });
    }

  } catch (error) {
    console.error('[Orchestration API] Error enabling source:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to enable source'
    });
  }
});

/**
 * POST /api/orchestration/sources/:sourceId/disable
 * Disable a specific source
 */
router.post('/sources/:sourceId/disable', async (req, res) => {
  try {
    const { sourceId } = req.params;

    const success = multiSourceOrchestrator.disableSource(sourceId);

    if (success) {
      // Update database
      await pool.query(
        'UPDATE source_health SET enabled = false WHERE source_id = $1',
        [sourceId]
      );

      res.json({
        success: true,
        message: `Source ${sourceId} disabled`
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Source ${sourceId} not found`
      });
    }

  } catch (error) {
    console.error('[Orchestration API] Error disabling source:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disable source'
    });
  }
});

/**
 * POST /api/orchestration/sources/:sourceId/priority
 * Update source priority
 *
 * Body:
 * {
 *   "priority": 0.85  // 0.0 - 1.0
 * }
 */
router.post('/sources/:sourceId/priority', async (req, res) => {
  try {
    const { sourceId } = req.params;
    const { priority } = req.body;

    if (typeof priority !== 'number' || priority < 0 || priority > 1) {
      return res.status(400).json({
        success: false,
        error: 'Priority must be a number between 0 and 1'
      });
    }

    const success = multiSourceOrchestrator.updateSourcePriority(sourceId, priority);

    if (success) {
      res.json({
        success: true,
        message: `Source ${sourceId} priority updated to ${priority}`
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Source ${sourceId} not found`
      });
    }

  } catch (error) {
    console.error('[Orchestration API] Error updating priority:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update source priority'
    });
  }
});

/**
 * POST /api/orchestration/sources/:sourceId/reset
 * Reset circuit breaker for a source
 */
router.post('/sources/:sourceId/reset', async (req, res) => {
  try {
    const { sourceId } = req.params;

    const success = multiSourceOrchestrator.resetCircuitBreaker(sourceId);

    if (success) {
      // Update database
      await pool.query(
        `UPDATE source_health
         SET circuit_breaker_state = 'closed',
             failure_count = 0,
             is_healthy = true,
             last_checked_at = NOW()
         WHERE source_id = $1`,
        [sourceId]
      );

      res.json({
        success: true,
        message: `Circuit breaker reset for source ${sourceId}`
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Source ${sourceId} not found`
      });
    }

  } catch (error) {
    console.error('[Orchestration API] Error resetting circuit breaker:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset circuit breaker'
    });
  }
});

/**
 * GET /api/orchestration/history
 * Get orchestration history
 *
 * Query params:
 * - limit: number (default: 20)
 * - offset: number (default: 0)
 */
router.get('/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT
        orchestration_id,
        sources,
        signals_discovered,
        successful_sources,
        failed_sources,
        execution_time_ms,
        created_at
       FROM orchestration_runs
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      success: true,
      history: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('[Orchestration API] Error getting history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get orchestration history'
    });
  }
});

/**
 * GET /api/orchestration/analytics
 * Get orchestration analytics
 *
 * Query params:
 * - days: number (default: 7)
 */
router.get('/analytics', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;

    // Query orchestration_runs directly
    const result = await pool.query(
      `SELECT
         orchestration_id,
         tenant_id,
         sources_requested,
         sources_executed,
         sources_successful,
         sources_failed,
         total_signals,
         unique_signals,
         execution_time_ms,
         filters,
         deduplication_stats,
         quality_stats,
         created_at
       FROM orchestration_runs
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      analytics: result.rows,
      days
    });

  } catch (error) {
    console.error('[Orchestration API] Error getting analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get orchestration analytics'
    });
  }
});

/**
 * GET /api/orchestration/priorities
 * Get all source priority metrics
 * Sprint 19, Task 3: Source Prioritization Engine
 */
router.get('/priorities', async (req, res) => {
  try {
    const metrics = await sourcePrioritization.getAllSourceMetrics();

    res.json({
      success: true,
      priorities: metrics
    });

  } catch (error) {
    console.error('[Orchestration API] Error getting priorities:', error);
    Sentry.captureException(error, {
      tags: { route: '/api/orchestration/priorities' }
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get source priorities'
    });
  }
});

/**
 * GET /api/orchestration/priorities/:sourceId
 * Get performance metrics for a specific source
 * Sprint 19, Task 3
 */
router.get('/priorities/:sourceId', async (req, res) => {
  try {
    const { sourceId } = req.params;
    const metrics = await sourcePrioritization.getSourceMetrics(sourceId);

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: `Source ${sourceId} not found`
      });
    }

    res.json({
      success: true,
      metrics
    });

  } catch (error) {
    console.error(`[Orchestration API] Error getting metrics for ${req.params.sourceId}:`, error);
    Sentry.captureException(error, {
      tags: { route: '/api/orchestration/priorities/:sourceId' }
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get source metrics'
    });
  }
});

/**
 * PUT /api/orchestration/priorities/:sourceId
 * Set manual priority override for a source
 * Body: { "priority": 0.85 }  // 0.0-1.0 or null to remove override
 * Sprint 19, Task 3
 */
router.put('/priorities/:sourceId', async (req, res) => {
  try {
    const { sourceId } = req.params;
    const { priority } = req.body;

    if (priority !== null && (typeof priority !== 'number' || priority < 0 || priority > 1)) {
      return res.status(400).json({
        success: false,
        error: 'Priority must be a number between 0.0 and 1.0, or null'
      });
    }

    const metrics = await sourcePrioritization.setManualPriority(sourceId, priority);

    res.json({
      success: true,
      message: priority === null ? 'Manual priority removed' : 'Manual priority set',
      metrics
    });

  } catch (error) {
    console.error(`[Orchestration API] Error setting priority for ${req.params.sourceId}:`, error);
    Sentry.captureException(error, {
      tags: { route: '/api/orchestration/priorities/:sourceId' }
    });
    res.status(500).json({
      success: false,
      error: 'Failed to set source priority'
    });
  }
});

/**
 * DELETE /api/orchestration/priorities/:sourceId
 * Remove manual priority override (revert to calculated)
 * Sprint 19, Task 3
 */
router.delete('/priorities/:sourceId', async (req, res) => {
  try {
    const { sourceId } = req.params;
    const metrics = await sourcePrioritization.removeManualPriority(sourceId);

    res.json({
      success: true,
      message: 'Manual priority removed, using calculated priority',
      metrics
    });

  } catch (error) {
    console.error(`[Orchestration API] Error removing priority for ${req.params.sourceId}:`, error);
    Sentry.captureException(error, {
      tags: { route: '/api/orchestration/priorities/:sourceId' }
    });
    res.status(500).json({
      success: false,
      error: 'Failed to remove manual priority'
    });
  }
});

/**
 * GET /api/orchestration/recommendations
 * Get priority recommendations based on performance
 * Sprint 19, Task 3
 */
router.get('/recommendations', async (req, res) => {
  try {
    const recommendations = await sourcePrioritization.getPriorityRecommendations();

    res.json({
      success: true,
      recommendations
    });

  } catch (error) {
    console.error('[Orchestration API] Error getting recommendations:', error);
    Sentry.captureException(error, {
      tags: { route: '/api/orchestration/recommendations' }
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get priority recommendations'
    });
  }
});

/**
 * POST /api/orchestration/priorities/:sourceId/reset
 * Reset performance metrics for a source
 * Sprint 19, Task 3
 */
router.post('/priorities/:sourceId/reset', async (req, res) => {
  try {
    const { sourceId } = req.params;
    const metrics = await sourcePrioritization.resetMetrics(sourceId);

    res.json({
      success: true,
      message: 'Source metrics reset successfully',
      metrics
    });

  } catch (error) {
    console.error(`[Orchestration API] Error resetting metrics for ${req.params.sourceId}:`, error);
    Sentry.captureException(error, {
      tags: { route: '/api/orchestration/priorities/:sourceId/reset' }
    });
    res.status(500).json({
      success: false,
      error: 'Failed to reset source metrics'
    });
  }
});

/**
 * GET /api/orchestration/quality
 * Get signal quality analytics
 * Sprint 19, Task 4: Signal Quality Scoring
 */
router.get('/quality', async (req, res) => {
  try {
    const { startDate, endDate, source, tenantId } = req.query;

    const analytics = await signalQualityScoring.getQualityAnalytics({
      startDate,
      endDate,
      source,
      tenantId: tenantId || req.user?.tenant_id || req.query.tenantId || 'default-tenant'
    });

    res.json({
      success: true,
      analytics
    });

  } catch (error) {
    console.error('[Orchestration API] Error getting quality analytics:', error);
    Sentry.captureException(error, {
      tags: { route: '/api/orchestration/quality' }
    });
    res.status(500).json({
      success: false,
      error: 'Failed to get quality analytics'
    });
  }
});

export default router;
