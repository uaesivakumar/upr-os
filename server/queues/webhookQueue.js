/**
 * Sprint 18 Task 6: Webhook Retry Logic
 * Bull MQ queue for webhook deliveries with exponential backoff
 */

import { Queue } from 'bullmq';
import Redis from 'ioredis';

// Redis connection (reuse across queues)
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

/**
 * Webhook Delivery Queue
 *
 * Retry Strategy:
 * - Attempt 1: Immediate
 * - Attempt 2: 1 minute delay
 * - Attempt 3: 5 minutes delay (total 6m)
 * - Attempt 4: 15 minutes delay (total 21m)
 * - Attempt 5: 1 hour delay (total 1h 21m)
 */
export const webhookQueue = new Queue('webhooks', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 60000 // 1 minute base delay (1m, 2m, 4m, 8m, 16m pattern)
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 1000 // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 604800 // Keep failed jobs for 7 days
    }
  }
});

// Log queue events for monitoring
webhookQueue.on('error', (err) => {
  console.error('[webhookQueue] Queue error:', err);
});

webhookQueue.on('waiting', (jobId) => {
  console.log(`[webhookQueue] Job ${jobId} is waiting`);
});

webhookQueue.on('active', (job) => {
  console.log(`[webhookQueue] Job ${job.id} is now active`);
});

webhookQueue.on('completed', (job, result) => {
  console.log(`[webhookQueue] Job ${job.id} completed successfully`);
});

webhookQueue.on('failed', (job, err) => {
  console.error(`[webhookQueue] Job ${job?.id} failed:`, err.message);
});

export default webhookQueue;
