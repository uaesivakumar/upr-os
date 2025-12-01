/**
 * S68: Auto-Outreach Routes
 * Sprint 68: Autonomous Outreach System API
 *
 * Endpoints:
 * - Queue: /queue, /queue/:id, /queue/batch, /queue/status, /queue/:id/event
 * - Channels: /channels, /channels/:slug
 * - Send Time: /send-time/optimal, /send-time/patterns, /send-time/predict
 * - Sequences: /sequences, /sequences/:slug, /sequences/:id/steps, /sequences/:id/enroll
 * - Instances: /instances, /instances/:id, /instances/:id/exit, /instances/due
 * - Classification: /responses/categories, /responses/classify, /responses/:id/review
 * - Health: /health, /performance
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import * as autoOutreach from '../../services/autoOutreach.js';
import { createOSResponse, createOSError } from './types.js';

const router = express.Router();

// =====================================================
// QUEUE ENDPOINTS
// =====================================================

/**
 * POST /api/os/auto-outreach/queue
 * Queue outreach message
 */
router.post('/queue', async (req, res) => {
  try {
    const {
      objectId, objectType, contactId, verticalSlug, territoryId,
      channel, templateId, sequenceId, stepNumber, subject, body,
      personalization, scheduledAt, sendWindowStart, sendWindowEnd,
      timezone, priority, source, correlationId
    } = req.body;

    if (!objectId || !objectType || !channel) {
      return res.status(400).json(createOSError('objectId, objectType, and channel are required'));
    }

    const item = await autoOutreach.queueOutreach({
      objectId, objectType, contactId, verticalSlug, territoryId,
      channel, templateId, sequenceId, stepNumber, subject, body,
      personalization, scheduledAt, sendWindowStart, sendWindowEnd,
      timezone, priority, source, correlationId
    });

    res.status(201).json(createOSResponse({ item }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/queue/:id
 * Get outreach item
 */
router.get('/queue/:id', async (req, res) => {
  try {
    const item = await autoOutreach.getOutreachItem(req.params.id);

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
 * POST /api/os/auto-outreach/queue/batch
 * Get batch of items for sending
 */
router.post('/queue/batch', async (req, res) => {
  try {
    const { batchSize, channel, verticalSlug } = req.body;

    const items = await autoOutreach.getOutreachBatch({
      batchSize: batchSize || 10,
      channel,
      verticalSlug
    });

    res.json(createOSResponse({ items, count: items.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-outreach/queue/:id/event
 * Record outreach event
 */
router.post('/queue/:id/event', async (req, res) => {
  try {
    const { eventType, eventData } = req.body;

    if (!eventType) {
      return res.status(400).json(createOSError('eventType is required'));
    }

    const result = await autoOutreach.recordOutreachEvent({
      outreachId: req.params.id,
      eventType,
      eventData
    });

    res.json(createOSResponse(result));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * DELETE /api/os/auto-outreach/queue/:id
 * Cancel outreach item
 */
router.delete('/queue/:id', async (req, res) => {
  try {
    const item = await autoOutreach.cancelOutreach(req.params.id);

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
 * GET /api/os/auto-outreach/queue/status
 * Get queue status
 */
router.get('/queue/status', async (req, res) => {
  try {
    const { verticalSlug, territoryId, channel } = req.query;

    const status = await autoOutreach.getOutreachQueueStatus({
      verticalSlug,
      territoryId,
      channel
    });

    res.json(createOSResponse({ status }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// CHANNEL ENDPOINTS
// =====================================================

/**
 * GET /api/os/auto-outreach/channels
 * List channels
 */
router.get('/channels', async (req, res) => {
  try {
    const { isActive } = req.query;

    const channels = await autoOutreach.listChannels({
      isActive: isActive === 'false' ? false : isActive === 'true' ? true : null
    });

    res.json(createOSResponse({ channels, count: channels.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/channels/:slug
 * Get channel
 */
router.get('/channels/:slug', async (req, res) => {
  try {
    const channel = await autoOutreach.getChannel(req.params.slug);

    if (!channel) {
      return res.status(404).json(createOSError('Channel not found'));
    }

    res.json(createOSResponse({ channel }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * PATCH /api/os/auto-outreach/channels/:slug
 * Update channel
 */
router.patch('/channels/:slug', async (req, res) => {
  try {
    const channel = await autoOutreach.updateChannel(req.params.slug, req.body);

    if (!channel) {
      return res.status(404).json(createOSError('Channel not found'));
    }

    res.json(createOSResponse({ channel }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// SEND TIME OPTIMIZATION ENDPOINTS
// =====================================================

/**
 * POST /api/os/auto-outreach/send-time/optimal
 * Calculate optimal send time
 */
router.post('/send-time/optimal', async (req, res) => {
  try {
    const { objectId, channel, verticalSlug, territoryId, windowStart, windowEnd, timezone } = req.body;

    if (!objectId || !channel) {
      return res.status(400).json(createOSError('objectId and channel are required'));
    }

    const optimalTime = await autoOutreach.calculateOptimalSendTime({
      objectId,
      channel,
      verticalSlug,
      territoryId,
      windowStart,
      windowEnd,
      timezone
    });

    res.json(createOSResponse({ optimalTime }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/send-time/patterns
 * Get send time patterns
 */
router.get('/send-time/patterns', async (req, res) => {
  try {
    const { channel, verticalSlug, territoryId, minSamples } = req.query;

    if (!channel) {
      return res.status(400).json(createOSError('channel is required'));
    }

    const patterns = await autoOutreach.getSendTimePatterns({
      channel,
      verticalSlug,
      territoryId,
      minSamples: parseInt(minSamples, 10) || 10
    });

    res.json(createOSResponse({ patterns, count: patterns.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/send-time/best
 * Get optimal send times
 */
router.get('/send-time/best', async (req, res) => {
  try {
    const { channel, verticalSlug, territoryId, topN } = req.query;

    if (!channel) {
      return res.status(400).json(createOSError('channel is required'));
    }

    const times = await autoOutreach.getOptimalSendTimes({
      channel,
      verticalSlug,
      territoryId,
      topN: parseInt(topN, 10) || 5
    });

    res.json(createOSResponse({ times, count: times.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-outreach/send-time/predict
 * Create send time prediction
 */
router.post('/send-time/predict', async (req, res) => {
  try {
    const prediction = await autoOutreach.createSendTimePrediction(req.body);
    res.status(201).json(createOSResponse({ prediction }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// SEQUENCE ENDPOINTS
// =====================================================

/**
 * POST /api/os/auto-outreach/sequences
 * Create sequence
 */
router.post('/sequences', async (req, res) => {
  try {
    const sequence = await autoOutreach.createSequence(req.body);
    res.status(201).json(createOSResponse({ sequence }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/sequences
 * List sequences
 */
router.get('/sequences', async (req, res) => {
  try {
    const { verticalSlug, territoryId, isActive } = req.query;

    const sequences = await autoOutreach.listSequences({
      verticalSlug,
      territoryId,
      isActive: isActive === 'false' ? false : isActive === 'true' ? true : null
    });

    res.json(createOSResponse({ sequences, count: sequences.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/sequences/:slug
 * Get sequence by slug
 */
router.get('/sequences/:slug', async (req, res) => {
  try {
    const { verticalSlug } = req.query;
    const sequence = await autoOutreach.getSequence(req.params.slug, verticalSlug);

    if (!sequence) {
      return res.status(404).json(createOSError('Sequence not found'));
    }

    res.json(createOSResponse({ sequence }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-outreach/sequences/:id/steps
 * Add step to sequence
 */
router.post('/sequences/:id/steps', async (req, res) => {
  try {
    const step = await autoOutreach.addSequenceStep({
      sequenceId: req.params.id,
      ...req.body
    });

    res.status(201).json(createOSResponse({ step }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-outreach/sequences/:id/enroll
 * Enroll object in sequence
 */
router.post('/sequences/:id/enroll', async (req, res) => {
  try {
    const { objectId, contactId, verticalSlug, territoryId, personalizationContext, startAtStep } = req.body;

    if (!objectId) {
      return res.status(400).json(createOSError('objectId is required'));
    }

    const instance = await autoOutreach.enrollInSequence({
      sequenceId: req.params.id,
      objectId,
      contactId,
      verticalSlug,
      territoryId,
      personalizationContext,
      startAtStep
    });

    res.status(201).json(createOSResponse({ instance }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/sequences/performance
 * Get sequence performance
 */
router.get('/sequences/performance', async (req, res) => {
  try {
    const { sequenceId, verticalSlug } = req.query;

    const performance = await autoOutreach.getSequencePerformance({
      sequenceId,
      verticalSlug
    });

    res.json(createOSResponse({ performance }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// INSTANCE ENDPOINTS
// =====================================================

/**
 * GET /api/os/auto-outreach/instances/:id
 * Get sequence instance
 */
router.get('/instances/:id', async (req, res) => {
  try {
    const instance = await autoOutreach.getSequenceInstance(req.params.id);

    if (!instance) {
      return res.status(404).json(createOSError('Instance not found'));
    }

    res.json(createOSResponse({ instance }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-outreach/instances/:id/exit
 * Exit sequence instance
 */
router.post('/instances/:id/exit', async (req, res) => {
  try {
    const { reason } = req.body;

    const instance = await autoOutreach.exitSequence(req.params.id, reason);

    if (!instance) {
      return res.status(404).json(createOSError('Instance not found or already exited'));
    }

    res.json(createOSResponse({ instance, exited: true }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/instances/due
 * Get instances due for next step
 */
router.get('/instances/due', async (req, res) => {
  try {
    const { limit } = req.query;

    const instances = await autoOutreach.getDueSequenceInstances({
      limit: parseInt(limit, 10) || 50
    });

    res.json(createOSResponse({ instances, count: instances.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-outreach/instances/advance
 * Advance due sequence instances
 */
router.post('/instances/advance', async (req, res) => {
  try {
    const advanced = await autoOutreach.advanceSequenceInstances();
    res.json(createOSResponse({ advanced, count: advanced.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// RESPONSE CLASSIFICATION ENDPOINTS
// =====================================================

/**
 * GET /api/os/auto-outreach/responses/categories
 * Get response categories
 */
router.get('/responses/categories', async (req, res) => {
  try {
    const { isActive } = req.query;

    const categories = await autoOutreach.getResponseCategories({
      isActive: isActive === 'false' ? false : isActive === 'true' ? true : null
    });

    res.json(createOSResponse({ categories, count: categories.length }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * POST /api/os/auto-outreach/responses/classify
 * Classify response
 */
router.post('/responses/classify', async (req, res) => {
  try {
    const { objectId, responseText } = req.body;

    if (!objectId || !responseText) {
      return res.status(400).json(createOSError('objectId and responseText are required'));
    }

    const classification = await autoOutreach.classifyResponse(req.body);
    res.status(201).json(createOSResponse({ classification }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/responses/:id
 * Get classification
 */
router.get('/responses/:id', async (req, res) => {
  try {
    const classification = await autoOutreach.getClassification(req.params.id);

    if (!classification) {
      return res.status(404).json(createOSError('Classification not found'));
    }

    res.json(createOSResponse({ classification }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/responses
 * List classifications
 */
router.get('/responses', async (req, res) => {
  try {
    const { objectId, categorySlug, isReviewed, verticalSlug, limit, offset } = req.query;

    const result = await autoOutreach.listClassifications({
      objectId,
      categorySlug,
      isReviewed: isReviewed === 'true' ? true : isReviewed === 'false' ? false : null,
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

/**
 * POST /api/os/auto-outreach/responses/:id/review
 * Review classification
 */
router.post('/responses/:id/review', async (req, res) => {
  try {
    const { reviewedBy, finalCategoryId, finalCategorySlug } = req.body;

    if (!reviewedBy) {
      return res.status(400).json(createOSError('reviewedBy is required'));
    }

    const classification = await autoOutreach.reviewClassification({
      classificationId: req.params.id,
      reviewedBy,
      finalCategoryId,
      finalCategorySlug
    });

    if (!classification) {
      return res.status(404).json(createOSError('Classification not found'));
    }

    res.json(createOSResponse({ classification, reviewed: true }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/responses/summary
 * Get response summary
 */
router.get('/responses/summary', async (req, res) => {
  try {
    const { verticalSlug } = req.query;

    const summary = await autoOutreach.getResponseSummary({ verticalSlug });
    res.json(createOSResponse({ summary }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

// =====================================================
// HEALTH & PERFORMANCE ENDPOINTS
// =====================================================

/**
 * GET /api/os/auto-outreach/health
 * Get outreach health metrics
 */
router.get('/health', async (req, res) => {
  try {
    const { verticalSlug, territoryId } = req.query;

    const health = await autoOutreach.getOutreachHealth({
      verticalSlug,
      territoryId
    });

    res.json(createOSResponse(health));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

/**
 * GET /api/os/auto-outreach/performance
 * Get outreach performance metrics
 */
router.get('/performance', async (req, res) => {
  try {
    const { channel, verticalSlug, territoryId, days } = req.query;

    const performance = await autoOutreach.getOutreachPerformance({
      channel,
      verticalSlug,
      territoryId,
      days: parseInt(days, 10) || 30
    });

    res.json(createOSResponse({ performance }));
  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json(createOSError(error.message));
  }
});

export default router;
