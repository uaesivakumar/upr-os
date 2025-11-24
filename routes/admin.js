// routes/admin.js
const express = require("express");
const { ok } = require("../utils/respond");
const { adminOnly } = require("../utils/adminOnly");

const router = express.Router();

/**
 * GET /api/admin/verify
 * This endpoint is protected by the adminOnly middleware.
 * If a request successfully reaches this handler, it confirms the user
 * has a valid JWT with an 'admin' role.
 */
router.get("/verify", adminOnly, (req, res) => {
  return ok(res, { message: "Admin verified." });
});

/**
 * GET /api/admin/queue-stats
 * Get statistics for all BullMQ queues (enrichment, hiring-signals, etc.)
 */
router.get("/queue-stats", adminOnly, async (req, res) => {
  try {
    // Dynamic import to avoid top-level connection issues
    const { enrichmentQueue, hiringSignalsQueue } = await import("../workers/queue.js");

    const stats = {
      enrichment_queue: null,
      hiring_signals_queue: null,
      redis_connected: false
    };

    // Check if queues are available (Redis connected)
    if (enrichmentQueue) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          enrichmentQueue.getWaitingCount(),
          enrichmentQueue.getActiveCount(),
          enrichmentQueue.getCompletedCount(),
          enrichmentQueue.getFailedCount(),
          enrichmentQueue.getDelayedCount()
        ]);

        stats.enrichment_queue = {
          waiting,
          active,
          completed,
          failed,
          delayed,
          total: waiting + active + completed + failed + delayed
        };
        stats.redis_connected = true;
      } catch (err) {
        console.error('[Admin] Failed to get enrichment queue stats:', err.message);
      }
    }

    if (hiringSignalsQueue) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          hiringSignalsQueue.getWaitingCount(),
          hiringSignalsQueue.getActiveCount(),
          hiringSignalsQueue.getCompletedCount(),
          hiringSignalsQueue.getFailedCount(),
          hiringSignalsQueue.getDelayedCount()
        ]);

        stats.hiring_signals_queue = {
          waiting,
          active,
          completed,
          failed,
          delayed,
          total: waiting + active + completed + failed + delayed
        };
        stats.redis_connected = true;
      } catch (err) {
        console.error('[Admin] Failed to get hiring signals queue stats:', err.message);
      }
    }

    return ok(res, stats);
  } catch (err) {
    console.error('[Admin] Queue stats error:', err);
    return ok(res, {
      enrichment_queue: null,
      hiring_signals_queue: null,
      redis_connected: false,
      error: err.message
    });
  }
});

/**
 * GET /api/admin/recent-jobs/:queueName
 * Get recent jobs from a specific queue (for debugging)
 */
router.get("/recent-jobs/:queueName", adminOnly, async (req, res) => {
  try {
    const { queueName } = req.params;
    const { enrichmentQueue, hiringSignalsQueue } = await import("../workers/queue.js");

    let queue = null;
    if (queueName === 'enrichment-queue') {
      queue = enrichmentQueue;
    } else if (queueName === 'hiring-signals-queue') {
      queue = hiringSignalsQueue;
    }

    if (!queue) {
      return ok(res, { jobs: [], error: 'Queue not found or Redis not connected' });
    }

    // Get last 10 failed jobs and 10 completed jobs
    const [failed, completed] = await Promise.all([
      queue.getFailed(0, 9),
      queue.getCompleted(0, 9)
    ]);

    const jobs = {
      failed: failed.map(job => ({
        id: job.id,
        name: job.name,
        data: job.data,
        failedReason: job.failedReason,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn
      })),
      completed: completed.map(job => ({
        id: job.id,
        name: job.name,
        data: job.data,
        returnvalue: job.returnvalue,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn
      }))
    };

    return ok(res, jobs);
  } catch (err) {
    console.error('[Admin] Recent jobs error:', err);
    return ok(res, { jobs: [], error: err.message });
  }
});

// ===================================================================
// ERROR RECOVERY ENDPOINTS (Sprint 18, Task 8)
// ===================================================================

/**
 * GET /api/admin/failed-operations
 * Get failed operations (webhooks, RADAR runs) with filters
 *
 * Query params:
 * - type: 'webhook' | 'radar'
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - limit: number (default 100)
 * - offset: number (default 0)
 */
router.get("/failed-operations", adminOnly, async (req, res) => {
  try {
    const { default: ErrorRecoveryService } = await import("../server/services/errorRecovery.js");

    const filters = {
      type: req.query.type || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0
    };

    const operations = await ErrorRecoveryService.getFailedOperations(filters);

    return ok(res, {
      success: true,
      count: operations.length,
      filters,
      operations
    });
  } catch (err) {
    console.error('[Admin] Failed operations error:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/admin/error-analytics
 * Get error analytics and trends
 *
 * Query params:
 * - startDate: ISO date string (default: 7 days ago)
 * - endDate: ISO date string (default: now)
 */
router.get("/error-analytics", adminOnly, async (req, res) => {
  try {
    const { default: ErrorRecoveryService } = await import("../server/services/errorRecovery.js");

    const filters = {
      startDate: req.query.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: req.query.endDate || new Date().toISOString()
    };

    const analytics = await ErrorRecoveryService.getErrorAnalytics(filters);

    return ok(res, {
      success: true,
      filters,
      analytics
    });
  } catch (err) {
    console.error('[Admin] Error analytics error:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/admin/retry-operation
 * Retry a failed operation
 *
 * Body:
 * {
 *   "operationType": "webhook" | "radar",
 *   "operationId": "uuid"
 * }
 */
router.post("/retry-operation", adminOnly, async (req, res) => {
  try {
    const { default: ErrorRecoveryService } = await import("../server/services/errorRecovery.js");

    const { operationType, operationId } = req.body;

    if (!operationType || !operationId) {
      return res.status(400).json({
        success: false,
        error: 'Missing operationType or operationId'
      });
    }

    const result = await ErrorRecoveryService.retryOperation(operationType, operationId);

    return ok(res, result);
  } catch (err) {
    console.error('[Admin] Retry operation error:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * POST /api/admin/bulk-retry
 * Retry multiple failed operations
 *
 * Body:
 * {
 *   "operations": [
 *     { "type": "webhook", "id": "uuid1" },
 *     { "type": "radar", "id": "uuid2" }
 *   ]
 * }
 */
router.post("/bulk-retry", adminOnly, async (req, res) => {
  try {
    const { default: ErrorRecoveryService } = await import("../server/services/errorRecovery.js");

    const { operations } = req.body;

    if (!operations || !Array.isArray(operations)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid operations array'
      });
    }

    const result = await ErrorRecoveryService.bulkRetry(operations);

    return ok(res, result);
  } catch (err) {
    console.error('[Admin] Bulk retry error:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * GET /api/admin/operation-details/:operationType/:operationId
 * Get detailed information about a specific operation
 *
 * Params:
 * - operationType: 'webhook' | 'radar'
 * - operationId: operation ID
 */
router.get("/operation-details/:operationType/:operationId", adminOnly, async (req, res) => {
  try {
    const { default: ErrorRecoveryService } = await import("../server/services/errorRecovery.js");

    const { operationType, operationId } = req.params;

    const details = await ErrorRecoveryService.getOperationDetails(operationType, operationId);

    if (!details) {
      return res.status(404).json({
        success: false,
        error: 'Operation not found'
      });
    }

    return ok(res, {
      success: true,
      operation: details
    });
  } catch (err) {
    console.error('[Admin] Operation details error:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/**
 * DELETE /api/admin/clear-old-errors
 * Clear old failed operations
 *
 * Query params:
 * - daysOld: number (default 30)
 */
router.delete("/clear-old-errors", adminOnly, async (req, res) => {
  try {
    const { default: ErrorRecoveryService } = await import("../server/services/errorRecovery.js");

    const daysOld = parseInt(req.query.daysOld) || 30;
    const deletedCount = await ErrorRecoveryService.clearOldErrors(daysOld);

    return ok(res, {
      success: true,
      deleted_count: deletedCount,
      message: `Cleared ${deletedCount} failed operations older than ${daysOld} days`
    });
  } catch (err) {
    console.error('[Admin] Clear old errors error:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;