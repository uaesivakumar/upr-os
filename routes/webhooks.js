/**
 * Sprint 18 Task 6: Webhook Retry Logic
 * API endpoints for webhook delivery management
 */

const express = require('express');
const { ok, bad } = require('../utils/respond');
const { adminOnly } = require('../utils/adminOnly');

const router = express.Router();

// Import webhook service (will be loaded dynamically)
let webhookService;
(async () => {
  webhookService = (await import('../server/services/webhookService.js')).default;
})();

/**
 * POST /api/webhooks
 * Queue a new webhook for delivery
 *
 * Body: {
 *   url: "https://example.com/webhook",
 *   payload: { ... },
 *   entityType: "hiring_signal",
 *   entityId: "uuid",
 *   headers: { ... } // optional
 * }
 */
router.post('/', adminOnly, async (req, res) => {
  const { url, payload, entityType, entityId, headers, maxAttempts } = req.body;

  if (!url || !payload || !entityType || !entityId) {
    return bad(res, 'Missing required fields: url, payload, entityType, entityId', 400);
  }

  try {
    const result = await webhookService.queueWebhook({
      url,
      payload,
      entityType,
      entityId,
      headers,
      maxAttempts
    });

    return ok(res, result);
  } catch (error) {
    console.error('[webhooks] Queue error:', error);
    return bad(res, 'Failed to queue webhook', 500);
  }
});

/**
 * GET /api/webhooks/:id
 * Get webhook delivery status with attempt history
 */
router.get('/:id', adminOnly, async (req, res) => {
  const { id } = req.params;

  try {
    const delivery = await webhookService.getDeliveryStatus(id);

    if (!delivery) {
      return bad(res, `Delivery ${id} not found`, 404);
    }

    return ok(res, delivery);
  } catch (error) {
    console.error('[webhooks] Get status error:', error);
    return bad(res, 'Failed to get delivery status', 500);
  }
});

/**
 * GET /api/webhooks
 * List recent webhook deliveries
 *
 * Query params:
 *   - status: Filter by status (pending, delivered, failed, dead)
 *   - entityType: Filter by entity type
 *   - limit: Max results (default: 50)
 */
router.get('/', adminOnly, async (req, res) => {
  const { status, entityType, limit } = req.query;

  try {
    const deliveries = await webhookService.listDeliveries({
      status,
      entityType,
      limit: limit ? parseInt(limit) : undefined
    });

    return ok(res, deliveries);
  } catch (error) {
    console.error('[webhooks] List error:', error);
    return bad(res, 'Failed to list deliveries', 500);
  }
});

/**
 * POST /api/webhooks/:id/retry
 * Manually retry a failed webhook delivery
 */
router.post('/:id/retry', adminOnly, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await webhookService.retryDelivery(id);
    return ok(res, result);
  } catch (error) {
    console.error('[webhooks] Retry error:', error);
    return bad(res, error.message || 'Failed to retry delivery', 500);
  }
});

/**
 * GET /api/webhooks/stats
 * Get webhook delivery statistics (7 days)
 */
router.get('/stats', adminOnly, async (req, res) => {
  try {
    const stats = await webhookService.getDeliveryStats();
    return ok(res, stats);
  } catch (error) {
    console.error('[webhooks] Stats error:', error);
    return bad(res, 'Failed to get delivery stats', 500);
  }
});

module.exports = router;
