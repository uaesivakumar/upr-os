/**
 * S66: Autonomous Safety Routes
 * Sprint 66: Safety Infrastructure for Autonomous Operations API
 *
 * Endpoints:
 * - Control: /control, /control/enable, /control/disable, /control/limits, /control/history
 * - Activity: /activity, /activity/summary, /activity/error-rate
 * - Checkpoints: /checkpoints, /checkpoints/:id, /checkpoints/:id/approve, /checkpoints/:id/reject
 * - Tasks: /tasks, /tasks/:id, /tasks/batch, /tasks/:id/cancel
 * - Health: /health
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import * as autonomousSafety from '../../services/autonomousSafety.js';
import { createOSResponse, createOSError } from './types.js';

const router = express.Router();

// =====================================================
// CONTROL STATE (KILL SWITCH) ENDPOINTS
// =====================================================

/**
 * GET /api/os/autonomous/control
 * Get control state
 */
router.get('/control', async (req, res) => {
  try {
    const { verticalSlug, territoryId, includeGlobal } = req.query;

    const state = await autonomousSafety.getControlState({
      verticalSlug,
      territoryId,
      includeGlobal: includeGlobal !== 'false'
    });

    res.json(createOSResponse(state));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/control/check
 * Quick check if autonomy is enabled
 */
router.get('/control/check', async (req, res) => {
  try {
    const { verticalSlug, territoryId } = req.query;

    const enabled = await autonomousSafety.isAutonomyEnabled({
      verticalSlug,
      territoryId
    });

    res.json(createOSResponse({ enabled }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/autonomous/control/enable
 * Enable autonomous operations
 */
router.post('/control/enable', async (req, res) => {
  try {
    const { verticalSlug, territoryId, enabledBy, reason } = req.body;

    const state = await autonomousSafety.enableAutonomy({
      verticalSlug,
      territoryId,
      enabledBy: enabledBy || 'api',
      reason
    });

    res.json(createOSResponse({ state, enabled: true }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/autonomous/control/disable
 * Disable autonomous operations (Kill Switch)
 */
router.post('/control/disable', async (req, res) => {
  try {
    const { verticalSlug, territoryId, disabledBy, reason } = req.body;

    const state = await autonomousSafety.disableAutonomy({
      verticalSlug,
      territoryId,
      disabledBy: disabledBy || 'api',
      reason: reason || 'Manual kill switch activated via API'
    });

    res.json(createOSResponse({ state, enabled: false }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * PUT /api/os/autonomous/control/limits
 * Update control limits
 */
router.put('/control/limits', async (req, res) => {
  try {
    const state = await autonomousSafety.updateControlLimits(req.body);

    if (!state) {
      return res.status(404).json(createOSError('Control state not found'));
    }

    res.json(createOSResponse({ state }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/control/history
 * Get control state change history
 */
router.get('/control/history', async (req, res) => {
  try {
    const { verticalSlug, territoryId, limit, offset } = req.query;

    const result = await autonomousSafety.getControlHistory({
      verticalSlug,
      territoryId,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    });

    res.json(createOSResponse(result));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// ACTIVITY LOG ENDPOINTS
// =====================================================

/**
 * POST /api/os/autonomous/activity
 * Log an autonomous event
 */
router.post('/activity', async (req, res) => {
  try {
    const { eventType, eventCategory, sourceService } = req.body;

    if (!eventType || !eventCategory || !sourceService) {
      return res.status(400).json(createOSError('eventType, eventCategory, and sourceService are required'));
    }

    const event = await autonomousSafety.logAutonomousEvent(req.body);
    res.status(201).json(createOSResponse({ event }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/activity
 * List autonomous events
 */
router.get('/activity', async (req, res) => {
  try {
    const {
      eventType, eventCategory, eventSeverity, sourceService,
      verticalSlug, territoryId, status, correlationId,
      startDate, endDate, limit, offset
    } = req.query;

    const result = await autonomousSafety.listAutonomousEvents({
      eventType,
      eventCategory,
      eventSeverity,
      sourceService,
      verticalSlug,
      territoryId,
      status,
      correlationId,
      startDate,
      endDate,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    });

    res.json(createOSResponse(result));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/activity/summary
 * Get activity summary
 */
router.get('/activity/summary', async (req, res) => {
  try {
    const { verticalSlug, sourceService, hours } = req.query;

    const summary = await autonomousSafety.getActivitySummary({
      verticalSlug,
      sourceService,
      hours: parseInt(hours, 10) || 24
    });

    res.json(createOSResponse({ summary }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/activity/error-rate
 * Get error rate for service
 */
router.get('/activity/error-rate', async (req, res) => {
  try {
    const { sourceService, verticalSlug, hours } = req.query;

    if (!sourceService) {
      return res.status(400).json(createOSError('sourceService is required'));
    }

    const errorRate = await autonomousSafety.getErrorRate({
      sourceService,
      verticalSlug,
      hours: parseInt(hours, 10) || 1
    });

    res.json(createOSResponse({ errorRate }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// CHECKPOINT ENDPOINTS
// =====================================================

/**
 * POST /api/os/autonomous/checkpoints/definitions
 * Create checkpoint definition
 */
router.post('/checkpoints/definitions', async (req, res) => {
  try {
    const definition = await autonomousSafety.createCheckpointDefinition(req.body);
    res.status(201).json(createOSResponse({ definition }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/checkpoints/definitions
 * List checkpoint definitions
 */
router.get('/checkpoints/definitions', async (req, res) => {
  try {
    const { verticalSlug, isActive } = req.query;

    const definitions = await autonomousSafety.listCheckpointDefinitions({
      verticalSlug,
      isActive: isActive === 'false' ? false : isActive === 'true' ? true : null
    });

    res.json(createOSResponse({ definitions, count: definitions.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/autonomous/checkpoints
 * Register a checkpoint (request approval)
 */
router.post('/checkpoints', async (req, res) => {
  try {
    const { service, action } = req.body;

    if (!service || !action) {
      return res.status(400).json(createOSError('service and action are required'));
    }

    const checkpoint = await autonomousSafety.registerCheckpoint(req.body);
    res.status(201).json(createOSResponse({ checkpoint }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/checkpoints
 * List pending checkpoints
 */
router.get('/checkpoints', async (req, res) => {
  try {
    const { verticalSlug, territoryId, service, priority, limit, offset } = req.query;

    const result = await autonomousSafety.listPendingCheckpoints({
      verticalSlug,
      territoryId,
      service,
      priority: priority ? parseInt(priority, 10) : null,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    });

    res.json(createOSResponse(result));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/checkpoints/:id
 * Get checkpoint by ID
 */
router.get('/checkpoints/:id', async (req, res) => {
  try {
    const checkpoint = await autonomousSafety.getCheckpoint(req.params.id);

    if (!checkpoint) {
      return res.status(404).json(createOSError('Checkpoint not found'));
    }

    res.json(createOSResponse({ checkpoint }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/autonomous/checkpoints/:id/approve
 * Approve checkpoint
 */
router.post('/checkpoints/:id/approve', async (req, res) => {
  try {
    const { approvedBy, reason, resolutionData } = req.body;

    if (!approvedBy) {
      return res.status(400).json(createOSError('approvedBy is required'));
    }

    const checkpoint = await autonomousSafety.approveCheckpoint({
      checkpointId: req.params.id,
      approvedBy,
      reason,
      resolutionData
    });

    res.json(createOSResponse({ checkpoint, approved: true }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/autonomous/checkpoints/:id/reject
 * Reject checkpoint
 */
router.post('/checkpoints/:id/reject', async (req, res) => {
  try {
    const { rejectedBy, reason, resolutionData } = req.body;

    if (!rejectedBy || !reason) {
      return res.status(400).json(createOSError('rejectedBy and reason are required'));
    }

    const checkpoint = await autonomousSafety.rejectCheckpoint({
      checkpointId: req.params.id,
      rejectedBy,
      reason,
      resolutionData
    });

    res.json(createOSResponse({ checkpoint, rejected: true }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/autonomous/checkpoints/process-expired
 * Process expired checkpoints
 */
router.post('/checkpoints/process-expired', async (req, res) => {
  try {
    const processed = await autonomousSafety.processExpiredCheckpoints();
    res.json(createOSResponse({ processed, count: processed.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// TASK QUEUE ENDPOINTS
// =====================================================

/**
 * POST /api/os/autonomous/tasks
 * Enqueue a task
 */
router.post('/tasks', async (req, res) => {
  try {
    const { taskType, taskCategory, service, action } = req.body;

    if (!taskType || !taskCategory || !service || !action) {
      return res.status(400).json(createOSError('taskType, taskCategory, service, and action are required'));
    }

    const task = await autonomousSafety.enqueueTask(req.body);
    res.status(201).json(createOSResponse({ task }));
  } catch (error) {
    Sentry.captureException(error);

    if (error.message.includes('disabled')) {
      return res.status(503).json(createOSError(error.message));
    }

    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/autonomous/tasks/batch
 * Get next batch of tasks for processing
 */
router.post('/tasks/batch', async (req, res) => {
  try {
    const { batchSize, service, verticalSlug } = req.body;

    const tasks = await autonomousSafety.dequeueTask({
      batchSize: batchSize || 10,
      service,
      verticalSlug
    });

    res.json(createOSResponse({ tasks, count: tasks.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/tasks
 * List tasks
 */
router.get('/tasks', async (req, res) => {
  try {
    const {
      taskType, taskCategory, service, status,
      verticalSlug, territoryId, limit, offset
    } = req.query;

    const result = await autonomousSafety.listTasks({
      taskType,
      taskCategory,
      service,
      status,
      verticalSlug,
      territoryId,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0
    });

    res.json(createOSResponse(result));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/tasks/:id
 * Get task by ID
 */
router.get('/tasks/:id', async (req, res) => {
  try {
    const task = await autonomousSafety.getTask(req.params.id);

    if (!task) {
      return res.status(404).json(createOSError('Task not found'));
    }

    res.json(createOSResponse({ task }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/autonomous/tasks/:id/complete
 * Complete a task
 */
router.post('/tasks/:id/complete', async (req, res) => {
  try {
    const { result } = req.body;

    const completion = await autonomousSafety.completeTask({
      taskId: req.params.id,
      result
    });

    res.json(createOSResponse(completion));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/autonomous/tasks/:id/fail
 * Fail a task
 */
router.post('/tasks/:id/fail', async (req, res) => {
  try {
    const { error } = req.body;

    if (!error) {
      return res.status(400).json(createOSError('error message is required'));
    }

    const failure = await autonomousSafety.failTask({
      taskId: req.params.id,
      error
    });

    res.json(createOSResponse(failure));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/autonomous/tasks/:id/cancel
 * Cancel a task
 */
router.post('/tasks/:id/cancel', async (req, res) => {
  try {
    const { cancelledBy, reason } = req.body;

    const task = await autonomousSafety.cancelTask({
      taskId: req.params.id,
      cancelledBy,
      reason
    });

    if (!task) {
      return res.status(404).json(createOSError('Task not found or not cancellable'));
    }

    res.json(createOSResponse({ task, cancelled: true }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/autonomous/tasks/health
 * Get task queue health
 */
router.get('/tasks/health', async (req, res) => {
  try {
    const { verticalSlug, territoryId } = req.query;

    const health = await autonomousSafety.getTaskQueueHealth({
      verticalSlug,
      territoryId
    });

    res.json(createOSResponse({ health }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// HEALTH ENDPOINT
// =====================================================

/**
 * GET /api/os/autonomous/health
 * Get overall autonomous system health
 */
router.get('/health', async (req, res) => {
  try {
    const { verticalSlug, territoryId } = req.query;

    const [controlState, taskHealth, activitySummary, pendingCheckpoints] = await Promise.all([
      autonomousSafety.getControlState({ verticalSlug, territoryId }),
      autonomousSafety.getTaskQueueHealth({ verticalSlug, territoryId }),
      autonomousSafety.getActivitySummary({ verticalSlug, hours: 1 }),
      autonomousSafety.listPendingCheckpoints({ verticalSlug, territoryId, limit: 5 })
    ]);

    res.json(createOSResponse({
      controlState: {
        enabled: controlState.effectiveEnabled,
        global: controlState.global?.is_enabled,
        scoped: controlState.scoped?.is_enabled
      },
      taskQueue: taskHealth,
      activitySummary,
      pendingCheckpoints: pendingCheckpoints.total,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

export default router;
