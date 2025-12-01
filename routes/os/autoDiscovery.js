/**
 * S67: Auto-Discovery Routes
 * Sprint 67: Autonomous Discovery System API
 *
 * Endpoints:
 * - Enrichment Queue: /queue, /queue/:id, /queue/batch, /queue/status
 * - Pipelines: /pipelines, /pipelines/:slug
 * - Quality Rules: /quality/rules, /quality/assess, /quality/summary
 * - Triggers: /triggers, /triggers/:slug, /triggers/signal, /triggers/log
 * - Schedules: /schedules, /schedules/:slug, /schedules/:slug/run, /schedules/:slug/runs
 * - Health: /health
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import * as autoDiscovery from '../../services/autoDiscovery.js';
import { createOSResponse, createOSError } from './types.js';

const router = express.Router();

// =====================================================
// ENRICHMENT QUEUE ENDPOINTS
// =====================================================

/**
 * POST /api/os/auto-discovery/queue
 * Add item to enrichment queue
 */
router.post('/queue', async (req, res) => {
  try {
    const {
      objectId,
      objectType,
      verticalSlug,
      territoryId,
      pipelineSlug,
      providers,
      priority,
      source,
      triggeredBy,
      correlationId
    } = req.body;

    if (!objectId || !objectType) {
      return res.status(400).json(createOSError('objectId and objectType are required'));
    }

    const item = await autoDiscovery.queueEnrichment({
      objectId,
      objectType,
      verticalSlug,
      territoryId,
      pipelineSlug,
      providers,
      priority,
      source,
      triggeredBy,
      correlationId
    });

    res.status(201).json(createOSResponse({ item }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/queue/:id
 * Get enrichment queue item
 */
router.get('/queue/:id', async (req, res) => {
  try {
    const item = await autoDiscovery.getEnrichmentItem(req.params.id);

    if (!item) {
      return res.status(404).json(createOSError('Queue item not found'));
    }

    res.json(createOSResponse({ item }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-discovery/queue/batch
 * Get batch of items for processing
 */
router.post('/queue/batch', async (req, res) => {
  try {
    const { batchSize, verticalSlug, territoryId } = req.body;

    const items = await autoDiscovery.getEnrichmentBatch({
      batchSize: batchSize || 10,
      verticalSlug,
      territoryId
    });

    res.json(createOSResponse({ items, count: items.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-discovery/queue/:id/complete
 * Complete enrichment item
 */
router.post('/queue/:id/complete', async (req, res) => {
  try {
    const { success, result, error } = req.body;

    const completion = await autoDiscovery.completeEnrichment({
      itemId: req.params.id,
      success: success !== false,
      result,
      error
    });

    res.json(createOSResponse(completion));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * DELETE /api/os/auto-discovery/queue/:id
 * Cancel enrichment item
 */
router.delete('/queue/:id', async (req, res) => {
  try {
    const item = await autoDiscovery.cancelEnrichment(req.params.id);

    if (!item) {
      return res.status(404).json(createOSError('Queue item not found or not cancellable'));
    }

    res.json(createOSResponse({ item, cancelled: true }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/queue/status
 * Get queue status
 */
router.get('/queue/status', async (req, res) => {
  try {
    const { verticalSlug, territoryId } = req.query;

    const status = await autoDiscovery.getEnrichmentQueueStatus({
      verticalSlug,
      territoryId
    });

    res.json(createOSResponse({ status }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// PIPELINE ENDPOINTS
// =====================================================

/**
 * POST /api/os/auto-discovery/pipelines
 * Create pipeline
 */
router.post('/pipelines', async (req, res) => {
  try {
    const pipeline = await autoDiscovery.createPipeline(req.body);
    res.status(201).json(createOSResponse({ pipeline }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/pipelines
 * List pipelines
 */
router.get('/pipelines', async (req, res) => {
  try {
    const { verticalSlug, isActive, limit, offset } = req.query;

    const result = await autoDiscovery.listPipelines({
      verticalSlug,
      isActive: isActive === 'false' ? false : isActive === 'true' ? true : null,
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
 * GET /api/os/auto-discovery/pipelines/:slug
 * Get pipeline by slug
 */
router.get('/pipelines/:slug', async (req, res) => {
  try {
    const { verticalSlug } = req.query;
    const pipeline = await autoDiscovery.getPipeline(req.params.slug, verticalSlug);

    if (!pipeline) {
      return res.status(404).json(createOSError('Pipeline not found'));
    }

    res.json(createOSResponse({ pipeline }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * PATCH /api/os/auto-discovery/pipelines/:slug
 * Update pipeline
 */
router.patch('/pipelines/:slug', async (req, res) => {
  try {
    const pipeline = await autoDiscovery.updatePipeline(req.params.slug, req.body);

    if (!pipeline) {
      return res.status(404).json(createOSError('Pipeline not found'));
    }

    res.json(createOSResponse({ pipeline }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// QUALITY ENDPOINTS
// =====================================================

/**
 * POST /api/os/auto-discovery/quality/rules
 * Create quality rule
 */
router.post('/quality/rules', async (req, res) => {
  try {
    const rule = await autoDiscovery.createQualityRule(req.body);
    res.status(201).json(createOSResponse({ rule }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/quality/rules
 * Get quality rules
 */
router.get('/quality/rules', async (req, res) => {
  try {
    const { verticalSlug, territoryId, objectType, ruleType, isActive } = req.query;

    const rules = await autoDiscovery.getQualityRules({
      verticalSlug,
      territoryId,
      objectType,
      ruleType,
      isActive: isActive === 'false' ? false : true
    });

    res.json(createOSResponse({ rules, count: rules.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-discovery/quality/assess
 * Assess object quality
 */
router.post('/quality/assess', async (req, res) => {
  try {
    const { objectId, objectType, objectData, verticalSlug, territoryId } = req.body;

    if (!objectId || !objectType || !objectData) {
      return res.status(400).json(createOSError('objectId, objectType, and objectData are required'));
    }

    const assessment = await autoDiscovery.assessQuality({
      objectId,
      objectType,
      objectData,
      verticalSlug,
      territoryId
    });

    res.json(createOSResponse({ assessment }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/quality/assessment/:objectId
 * Get quality assessment for object
 */
router.get('/quality/assessment/:objectId', async (req, res) => {
  try {
    const assessment = await autoDiscovery.getQualityAssessment(req.params.objectId);

    if (!assessment) {
      return res.status(404).json(createOSError('Assessment not found'));
    }

    res.json(createOSResponse({ assessment }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/quality/summary
 * Get quality summary
 */
router.get('/quality/summary', async (req, res) => {
  try {
    const { verticalSlug, territoryId, objectType } = req.query;

    const summary = await autoDiscovery.getQualitySummary({
      verticalSlug,
      territoryId,
      objectType
    });

    res.json(createOSResponse({ summary }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// TRIGGER ENDPOINTS
// =====================================================

/**
 * POST /api/os/auto-discovery/triggers
 * Create trigger
 */
router.post('/triggers', async (req, res) => {
  try {
    const trigger = await autoDiscovery.createTrigger(req.body);
    res.status(201).json(createOSResponse({ trigger }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/triggers
 * List triggers
 */
router.get('/triggers', async (req, res) => {
  try {
    const { verticalSlug, territoryId, signalType, isActive } = req.query;

    const triggers = await autoDiscovery.listTriggers({
      verticalSlug,
      territoryId,
      signalType,
      isActive: isActive === 'false' ? false : true
    });

    res.json(createOSResponse({ triggers, count: triggers.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/triggers/:slug
 * Get trigger by slug
 */
router.get('/triggers/:slug', async (req, res) => {
  try {
    const { verticalSlug } = req.query;
    const trigger = await autoDiscovery.getTrigger(req.params.slug, verticalSlug);

    if (!trigger) {
      return res.status(404).json(createOSError('Trigger not found'));
    }

    res.json(createOSResponse({ trigger }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * PATCH /api/os/auto-discovery/triggers/:slug
 * Update trigger
 */
router.patch('/triggers/:slug', async (req, res) => {
  try {
    const trigger = await autoDiscovery.updateTrigger(req.params.slug, req.body);

    if (!trigger) {
      return res.status(404).json(createOSError('Trigger not found'));
    }

    res.json(createOSResponse({ trigger }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-discovery/triggers/signal
 * Process incoming signal
 */
router.post('/triggers/signal', async (req, res) => {
  try {
    const { signalType, signalData, objectId, objectType, verticalSlug, territoryId } = req.body;

    if (!signalType || !signalData) {
      return res.status(400).json(createOSError('signalType and signalData are required'));
    }

    const result = await autoDiscovery.processSignal({
      signalType,
      signalData,
      objectId,
      objectType,
      verticalSlug,
      territoryId
    });

    res.json(createOSResponse(result));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/triggers/log
 * Get trigger execution log
 */
router.get('/triggers/log', async (req, res) => {
  try {
    const { triggerId, verticalSlug, limit, offset } = req.query;

    const result = await autoDiscovery.getTriggerLog({
      triggerId,
      verticalSlug,
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
// SCHEDULE ENDPOINTS
// =====================================================

/**
 * POST /api/os/auto-discovery/schedules
 * Create schedule
 */
router.post('/schedules', async (req, res) => {
  try {
    const schedule = await autoDiscovery.createSchedule(req.body);
    res.status(201).json(createOSResponse({ schedule }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/schedules
 * List schedules
 */
router.get('/schedules', async (req, res) => {
  try {
    const { verticalSlug, territoryId, isActive } = req.query;

    const schedules = await autoDiscovery.listSchedules({
      verticalSlug,
      territoryId,
      isActive: isActive === 'false' ? false : true
    });

    res.json(createOSResponse({ schedules, count: schedules.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/schedules/due
 * Get schedules due for execution
 */
router.get('/schedules/due', async (req, res) => {
  try {
    const { limit } = req.query;

    const schedules = await autoDiscovery.getDueSchedules({
      limit: parseInt(limit, 10) || 10
    });

    res.json(createOSResponse({ schedules, count: schedules.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/schedules/:slug
 * Get schedule by slug
 */
router.get('/schedules/:slug', async (req, res) => {
  try {
    const { verticalSlug } = req.query;
    const schedule = await autoDiscovery.getSchedule(req.params.slug, verticalSlug);

    if (!schedule) {
      return res.status(404).json(createOSError('Schedule not found'));
    }

    res.json(createOSResponse({ schedule }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * PATCH /api/os/auto-discovery/schedules/:slug
 * Update schedule
 */
router.patch('/schedules/:slug', async (req, res) => {
  try {
    const schedule = await autoDiscovery.updateSchedule(req.params.slug, req.body);

    if (!schedule) {
      return res.status(404).json(createOSError('Schedule not found'));
    }

    res.json(createOSResponse({ schedule }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-discovery/schedules/:id/run
 * Execute schedule manually
 */
router.post('/schedules/:id/run', async (req, res) => {
  try {
    const result = await autoDiscovery.executeSchedule(req.params.id);
    res.json(createOSResponse(result));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-discovery/schedules/:slug/pause
 * Pause schedule
 */
router.post('/schedules/:slug/pause', async (req, res) => {
  try {
    const schedule = await autoDiscovery.setScheduleActive(req.params.slug, false);

    if (!schedule) {
      return res.status(404).json(createOSError('Schedule not found'));
    }

    res.json(createOSResponse({ schedule, paused: true }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-discovery/schedules/:slug/resume
 * Resume schedule
 */
router.post('/schedules/:slug/resume', async (req, res) => {
  try {
    const schedule = await autoDiscovery.setScheduleActive(req.params.slug, true);

    if (!schedule) {
      return res.status(404).json(createOSError('Schedule not found'));
    }

    res.json(createOSResponse({ schedule, resumed: true }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-discovery/schedules/:id/runs
 * Get schedule run history
 */
router.get('/schedules/:id/runs', async (req, res) => {
  try {
    const { status, limit, offset } = req.query;

    const result = await autoDiscovery.getScheduleRuns({
      scheduleId: req.params.id,
      status,
      limit: parseInt(limit, 10) || 20,
      offset: parseInt(offset, 10) || 0
    });

    res.json(createOSResponse(result));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// HEALTH ENDPOINT
// =====================================================

/**
 * GET /api/os/auto-discovery/health
 * Get discovery health metrics
 */
router.get('/health', async (req, res) => {
  try {
    const { verticalSlug, territoryId } = req.query;

    const health = await autoDiscovery.getDiscoveryHealth({
      verticalSlug,
      territoryId
    });

    res.json(createOSResponse(health));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

export default router;
