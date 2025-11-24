/**
 * Sprint 18 Task 6: Webhook Retry Logic
 * Worker process for delivering webhooks with retry logic
 */

import { Worker } from 'bullmq';
import Redis from 'ioredis';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { pool } from '../../utils/db.js';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

/**
 * Generate HMAC signature for webhook payload
 * @param {Object} payload - The webhook payload
 * @param {string} secret - Secret key for signing
 * @returns {string} - HMAC signature
 */
function generateSignature(payload, secret) {
  const hmac = crypto.createHmac('sha256', secret || process.env.WEBHOOK_SECRET || 'default-secret');
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

/**
 * Record webhook attempt in database
 * @param {string} deliveryId - Webhook delivery ID
 * @param {number} attemptNumber - Current attempt number
 * @param {boolean} success - Whether attempt succeeded
 * @param {Object} details - Attempt details (status_code, response_body, error_message, duration_ms)
 */
async function recordAttempt(deliveryId, attemptNumber, success, details) {
  try {
    await pool.query(`
      INSERT INTO webhook_attempt_history
        (delivery_id, attempt_number, status_code, response_body, error_message, duration_ms, success)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      deliveryId,
      attemptNumber,
      details.status_code || null,
      details.response_body ? details.response_body.substring(0, 1000) : null, // Limit to 1000 chars
      details.error_message || null,
      details.duration_ms || null,
      success
    ]);
  } catch (error) {
    console.error('[webhookWorker] Failed to record attempt:', error);
  }
}

/**
 * Update webhook delivery status in database
 * @param {string} deliveryId - Webhook delivery ID
 * @param {Object} updates - Fields to update
 */
async function updateDelivery(deliveryId, updates) {
  const {
    status,
    attempts,
    last_attempt_at,
    last_error,
    last_status_code,
    last_response_body,
    delivered_at
  } = updates;

  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (status) {
    fields.push(`status = $${paramIndex++}`);
    values.push(status);
  }
  if (attempts !== undefined) {
    fields.push(`attempts = $${paramIndex++}`);
    values.push(attempts);
  }
  if (last_attempt_at) {
    fields.push(`last_attempt_at = $${paramIndex++}`);
    values.push(last_attempt_at);
  }
  if (last_error !== undefined) {
    fields.push(`last_error = $${paramIndex++}`);
    values.push(last_error);
  }
  if (last_status_code !== undefined) {
    fields.push(`last_status_code = $${paramIndex++}`);
    values.push(last_status_code);
  }
  if (last_response_body !== undefined) {
    fields.push(`last_response_body = $${paramIndex++}`);
    values.push(last_response_body ? last_response_body.substring(0, 1000) : null);
  }
  if (delivered_at) {
    fields.push(`delivered_at = $${paramIndex++}`);
    values.push(delivered_at);
  }

  values.push(deliveryId);

  try {
    await pool.query(`
      UPDATE webhook_deliveries
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
    `, values);
  } catch (error) {
    console.error('[webhookWorker] Failed to update delivery:', error);
  }
}

/**
 * Webhook Worker
 * Processes webhook delivery jobs with automatic retry
 */
export const webhookWorker = new Worker('webhooks', async (job) => {
  const { deliveryId, url, payload, headers = {} } = job.data;
  const attemptNumber = job.attemptsMade + 1;

  console.log(`[webhookWorker] Processing delivery ${deliveryId}, attempt ${attemptNumber}/5`);

  const startTime = Date.now();

  try {
    // Prepare webhook request
    const signature = generateSignature(payload, process.env.WEBHOOK_SECRET);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'User-Agent': 'UPR-Webhook/1.0',
        ...headers
      },
      body: JSON.stringify(payload),
      timeout: 10000 // 10 second timeout
    });

    const duration = Date.now() - startTime;
    const responseBody = await response.text();

    // Record attempt
    await recordAttempt(deliveryId, attemptNumber, response.ok, {
      status_code: response.status,
      response_body: responseBody,
      duration_ms: duration
    });

    if (response.ok) {
      // Success - mark as delivered
      console.log(`[webhookWorker] Delivery ${deliveryId} succeeded on attempt ${attemptNumber}`);

      await updateDelivery(deliveryId, {
        status: 'delivered',
        attempts: attemptNumber,
        last_attempt_at: new Date(),
        last_status_code: response.status,
        last_response_body: responseBody,
        delivered_at: new Date(),
        last_error: null
      });

      // Track success in Sentry
      if (process.env.SENTRY_DSN) {
        const Sentry = await import('@sentry/node');
        Sentry.captureMessage(`Webhook delivered: ${deliveryId}`, {
          level: 'info',
          tags: { type: 'webhook', phase: 'delivered', delivery_id: deliveryId },
          extra: { attempt_number: attemptNumber, duration_ms: duration }
        });
      }

      return { success: true, status: response.status, attemptNumber };

    } else {
      // HTTP error - will retry
      const error = `HTTP ${response.status}: ${responseBody}`;
      console.warn(`[webhookWorker] Delivery ${deliveryId} failed with ${response.status}, will retry`);

      await updateDelivery(deliveryId, {
        status: attemptNumber >= 5 ? 'dead' : 'failed',
        attempts: attemptNumber,
        last_attempt_at: new Date(),
        last_status_code: response.status,
        last_response_body: responseBody,
        last_error: error
      });

      throw new Error(error);
    }

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`[webhookWorker] Delivery ${deliveryId} error:`, error.message);

    // Record failed attempt
    await recordAttempt(deliveryId, attemptNumber, false, {
      error_message: error.message,
      duration_ms: duration
    });

    // Update delivery status
    await updateDelivery(deliveryId, {
      status: attemptNumber >= 5 ? 'dead' : 'failed',
      attempts: attemptNumber,
      last_attempt_at: new Date(),
      last_error: error.message
    });

    // Track failure in Sentry (only on final failure)
    if (attemptNumber >= 5 && process.env.SENTRY_DSN) {
      const Sentry = await import('@sentry/node');
      Sentry.captureException(error, {
        tags: { type: 'webhook', phase: 'dead', delivery_id: deliveryId },
        extra: { url, attempts: attemptNumber }
      });
    }

    throw error; // Re-throw to trigger Bull MQ retry
  }
}, {
  connection,
  concurrency: 5, // Process 5 webhooks concurrently
  limiter: {
    max: 10, // Max 10 jobs per...
    duration: 1000 // ...1 second (rate limiting)
  }
});

// Worker event handlers
webhookWorker.on('completed', (job) => {
  console.log(`[webhookWorker] Job ${job.id} completed`);
});

webhookWorker.on('failed', (job, err) => {
  console.error(`[webhookWorker] Job ${job?.id} failed permanently:`, err.message);
});

webhookWorker.on('error', (err) => {
  console.error('[webhookWorker] Worker error:', err);
});

export default webhookWorker;
