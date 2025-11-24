/**
 * Sprint 18 Task 6: Webhook Retry Logic
 * Service layer for webhook delivery management
 */

import { pool } from '../../utils/db.js';
import webhookQueue from '../queues/webhookQueue.js';

/**
 * Queue a webhook for delivery with automatic retries
 *
 * @param {Object} params - Webhook parameters
 * @param {string} params.url - Target URL for webhook
 * @param {Object} params.payload - JSON payload to send
 * @param {string} params.entityType - Type of entity (e.g., 'outreach_generation', 'hiring_signal')
 * @param {string} params.entityId - ID of the entity
 * @param {Object} [params.headers] - Optional custom headers
 * @param {number} [params.maxAttempts=5] - Maximum retry attempts
 * @returns {Promise<Object>} - Delivery record with delivery_id
 */
export async function queueWebhook({ url, payload, entityType, entityId, headers = {}, maxAttempts = 5 }) {
  try {
    // Create delivery record in database
    const result = await pool.query(`
      INSERT INTO webhook_deliveries
        (target_url, payload, entity_type, entity_id, headers, status, max_attempts)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
      RETURNING id, created_at
    `, [url, JSON.stringify(payload), entityType, entityId, JSON.stringify(headers), maxAttempts]);

    const deliveryId = result.rows[0].id;
    const createdAt = result.rows[0].created_at;

    // Add job to Bull MQ queue
    await webhookQueue.add('deliver', {
      deliveryId,
      url,
      payload,
      headers
    }, {
      jobId: deliveryId, // Use delivery ID as job ID for easy tracking
      attempts: maxAttempts
    });

    console.log(`[webhookService] Queued webhook delivery ${deliveryId} to ${url}`);

    return {
      delivery_id: deliveryId,
      status: 'pending',
      created_at: createdAt,
      url
    };

  } catch (error) {
    console.error('[webhookService] Failed to queue webhook:', error);

    // Track error in Sentry
    if (process.env.SENTRY_DSN) {
      const Sentry = await import('@sentry/node');
      Sentry.captureException(error, {
        tags: { service: 'webhook', phase: 'queue-error' },
        extra: { url, entity_type: entityType, entity_id: entityId }
      });
    }

    throw error;
  }
}

/**
 * Get webhook delivery status
 *
 * @param {string} deliveryId - Webhook delivery ID
 * @returns {Promise<Object>} - Delivery status with attempt history
 */
export async function getDeliveryStatus(deliveryId) {
  try {
    // Get delivery record
    const deliveryResult = await pool.query(`
      SELECT * FROM webhook_deliveries WHERE id = $1
    `, [deliveryId]);

    if (deliveryResult.rowCount === 0) {
      return null;
    }

    const delivery = deliveryResult.rows[0];

    // Get attempt history
    const historyResult = await pool.query(`
      SELECT * FROM webhook_attempt_history
      WHERE delivery_id = $1
      ORDER BY attempted_at DESC
    `, [deliveryId]);

    return {
      ...delivery,
      payload: JSON.parse(delivery.payload),
      headers: delivery.headers ? JSON.parse(delivery.headers) : {},
      attempt_history: historyResult.rows
    };

  } catch (error) {
    console.error('[webhookService] Failed to get delivery status:', error);
    throw error;
  }
}

/**
 * Get recent webhook deliveries
 *
 * @param {Object} [options] - Query options
 * @param {string} [options.status] - Filter by status
 * @param {string} [options.entityType] - Filter by entity type
 * @param {number} [options.limit=50] - Max results
 * @returns {Promise<Array>} - List of deliveries
 */
export async function listDeliveries({ status, entityType, limit = 50 } = {}) {
  try {
    let query = 'SELECT * FROM webhook_deliveries WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    if (entityType) {
      query += ` AND entity_type = $${paramIndex++}`;
      params.push(entityType);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);

    return result.rows.map(row => ({
      ...row,
      payload: JSON.parse(row.payload),
      headers: row.headers ? JSON.parse(row.headers) : {}
    }));

  } catch (error) {
    console.error('[webhookService] Failed to list deliveries:', error);
    throw error;
  }
}

/**
 * Retry a failed webhook delivery
 *
 * @param {string} deliveryId - Webhook delivery ID
 * @returns {Promise<Object>} - Updated delivery status
 */
export async function retryDelivery(deliveryId) {
  try {
    // Get delivery record
    const result = await pool.query(`
      SELECT * FROM webhook_deliveries WHERE id = $1
    `, [deliveryId]);

    if (result.rowCount === 0) {
      throw new Error(`Delivery ${deliveryId} not found`);
    }

    const delivery = result.rows[0];

    // Check if eligible for retry
    if (delivery.status === 'delivered') {
      throw new Error('Delivery already succeeded');
    }

    if (delivery.attempts >= delivery.max_attempts) {
      throw new Error('Max attempts reached');
    }

    // Reset status to pending
    await pool.query(`
      UPDATE webhook_deliveries
      SET status = 'pending', next_retry_at = NOW()
      WHERE id = $1
    `, [deliveryId]);

    // Add back to queue
    await webhookQueue.add('deliver', {
      deliveryId,
      url: delivery.target_url,
      payload: JSON.parse(delivery.payload),
      headers: delivery.headers ? JSON.parse(delivery.headers) : {}
    }, {
      jobId: `${deliveryId}-retry-${Date.now()}`,
      attempts: delivery.max_attempts - delivery.attempts
    });

    console.log(`[webhookService] Manually retried delivery ${deliveryId}`);

    return { success: true, delivery_id: deliveryId, status: 'pending' };

  } catch (error) {
    console.error('[webhookService] Failed to retry delivery:', error);
    throw error;
  }
}

/**
 * Get webhook delivery statistics
 *
 * @returns {Promise<Object>} - Delivery statistics
 */
export async function getDeliveryStats() {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) as dead,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        AVG(CASE WHEN status = 'delivered' THEN attempts END) as avg_attempts_success,
        AVG(CASE WHEN status = 'dead' THEN attempts END) as avg_attempts_failure
      FROM webhook_deliveries
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);

    return result.rows[0];

  } catch (error) {
    console.error('[webhookService] Failed to get delivery stats:', error);
    throw error;
  }
}

export default {
  queueWebhook,
  getDeliveryStatus,
  listDeliveries,
  retryDelivery,
  getDeliveryStats
};
