/**
 * Real-time Score Update Service
 * Processes score recalculation queue triggered by touchpoints and lifecycle changes
 *
 * Features:
 * - Automatic queue processing
 * - Debouncing to prevent excessive recalculations
 * - Batch processing for efficiency
 * - Error handling with retry logic
 */

import pg from 'pg';
const { Pool } = pg;
import { LeadScoreCalculator } from './leadScoreCalculator.js';
import { PriorityRankingService } from './priorityRankingService.js';
import { ScoreAlertService } from './scoreAlertService.js';

export class RealtimeScoreService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }

    this.calculator = new LeadScoreCalculator(connectionConfig || process.env.DATABASE_URL);
    this.priorityService = new PriorityRankingService(connectionConfig || process.env.DATABASE_URL);
    this.alertService = new ScoreAlertService(connectionConfig || process.env.DATABASE_URL);

    this.isProcessing = false;
  }

  /**
   * Process next batch of queued score recalculations
   */
  async processQueue(options = {}) {
    const { batchSize = 50, maxAttempts = 3 } = options;

    if (this.isProcessing) {
      console.log('Already processing queue, skipping...');
      return { message: 'Already processing' };
    }

    this.isProcessing = true;

    try {
      // Get configuration
      const config = await this.getConfig('realtime_scoring');

      if (!config || !config.enabled) {
        console.log('Real-time scoring disabled');
        return { message: 'Real-time scoring disabled', processed: 0 };
      }

      const effectiveBatchSize = config.batch_size || batchSize;

      // Get next batch from queue (ordered by priority and created_at)
      const query = `
        SELECT *
        FROM score_recalc_queue
        WHERE status = 'PENDING'
          AND attempts < $1
          AND (scheduled_at IS NULL OR scheduled_at <= NOW())
        ORDER BY priority ASC, created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      `;

      const result = await this.pool.query(query, [maxAttempts, effectiveBatchSize]);
      const queueItems = result.rows;

      if (queueItems.length === 0) {
        console.log('No pending items in queue');
        return { message: 'Queue empty', processed: 0 };
      }

      console.log(`Processing ${queueItems.length} queued score recalculations...`);

      // Mark items as processing
      const itemIds = queueItems.map(item => item.id);
      await this.pool.query(
        'UPDATE score_recalc_queue SET status = $1 WHERE id = ANY($2)',
        ['PROCESSING', itemIds]
      );

      // Process each item
      const results = await Promise.allSettled(
        queueItems.map(item => this.processQueueItem(item))
      );

      // Summarize results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`Completed: ${successful} successful, ${failed} failed`);

      return {
        total: queueItems.length,
        successful,
        failed,
        results
      };

    } catch (error) {
      console.error('Error processing queue:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single queue item
   */
  async processQueueItem(item) {
    try {
      const { id, opportunity_id, trigger_reason, attempts } = item;

      console.log(`Processing ${opportunity_id} (reason: ${trigger_reason}, attempt: ${attempts + 1})`);

      // Get old score for comparison
      const oldScore = await this.getOldScore(opportunity_id);

      // Recalculate score
      const newScoreData = await this.calculator.calculateLeadScore(opportunity_id);

      // Recalculate priority
      await this.priorityService.calculatePriorityScore(opportunity_id);

      // Check for significant changes and create alerts
      if (oldScore) {
        await this.checkAndCreateAlerts(opportunity_id, oldScore, newScoreData);
      }

      // Mark as completed
      await this.pool.query(
        `UPDATE score_recalc_queue
         SET status = 'COMPLETED', processed_at = NOW()
         WHERE id = $1`,
        [id]
      );

      return {
        success: true,
        opportunityId: opportunity_id,
        oldScore: oldScore?.lead_score,
        newScore: newScoreData.leadScore,
        change: oldScore ? newScoreData.leadScore - oldScore.lead_score : 0
      };

    } catch (error) {
      console.error(`Error processing item ${item.id}:`, error);

      // Update queue item with error
      await this.pool.query(
        `UPDATE score_recalc_queue
         SET
           status = CASE
             WHEN attempts + 1 >= max_attempts THEN 'FAILED'
             ELSE 'PENDING'
           END,
           attempts = attempts + 1,
           error_message = $2
         WHERE id = $1`,
        [item.id, error.message]
      );

      throw error;
    }
  }

  /**
   * Get old score before recalculation
   */
  async getOldScore(opportunityId) {
    const query = 'SELECT * FROM lead_scores WHERE opportunity_id = $1';
    const result = await this.pool.query(query, [opportunityId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Check for significant changes and create alerts
   */
  async checkAndCreateAlerts(opportunityId, oldScore, newScore) {
    const config = await this.getConfig('alert_thresholds');

    if (!config) return;

    const oldLeadScore = oldScore.lead_score;
    const newLeadScore = newScore.leadScore;
    const change = newLeadScore - oldLeadScore;
    const percentChange = oldLeadScore > 0 ? (change / oldLeadScore) * 100 : 0;

    // Score increase alert
    if (percentChange >= config.score_increase_percent) {
      await this.alertService.createAlert({
        opportunityId,
        type: 'SCORE_INCREASE',
        severity: percentChange >= 50 ? 'HIGH' : 'MEDIUM',
        message: `Score increased by ${percentChange.toFixed(1)}% (${oldLeadScore} → ${newLeadScore})`,
        metadata: JSON.stringify({
          oldScore: oldLeadScore,
          newScore: newLeadScore,
          change,
          percentChange
        })
      });
    }

    // Score decrease alert
    if (percentChange <= -config.score_decrease_percent) {
      await this.alertService.createAlert({
        opportunityId,
        type: 'SCORE_DECREASE',
        severity: percentChange <= -50 ? 'CRITICAL' : 'HIGH',
        message: `Score dropped by ${Math.abs(percentChange).toFixed(1)}% (${oldLeadScore} → ${newLeadScore})`,
        metadata: JSON.stringify({
          oldScore: oldLeadScore,
          newScore: newLeadScore,
          change,
          percentChange
        })
      });
    }

    // Grade change alert
    if (config.grade_change && oldScore.grade !== newScore.grade) {
      await this.alertService.createAlert({
        opportunityId,
        type: 'GRADE_CHANGE',
        severity: this.getGradeChangeSeverity(oldScore.grade, newScore.grade),
        message: `Grade changed from ${oldScore.grade} to ${newScore.grade}`,
        metadata: JSON.stringify({
          oldGrade: oldScore.grade,
          newGrade: newScore.grade,
          oldScore: oldLeadScore,
          newScore: newLeadScore
        })
      });
    }
  }

  /**
   * Determine severity of grade change
   */
  getGradeChangeSeverity(oldGrade, newGrade) {
    const gradeOrder = { 'A+': 6, 'A': 5, 'B+': 4, 'B': 3, 'C': 2, 'D': 1 };
    const oldRank = gradeOrder[oldGrade] || 0;
    const newRank = gradeOrder[newGrade] || 0;
    const diff = newRank - oldRank;

    if (diff >= 2) return 'HIGH';    // 2+ grade improvement
    if (diff >= 1) return 'MEDIUM';  // 1 grade improvement
    if (diff <= -2) return 'CRITICAL'; // 2+ grade drop
    if (diff <= -1) return 'HIGH';   // 1 grade drop
    return 'LOW';
  }

  /**
   * Get configuration by key
   */
  async getConfig(configKey) {
    const query = `
      SELECT config_value
      FROM scoring_config
      WHERE config_key = $1 AND is_active = TRUE
    `;
    const result = await this.pool.query(query, [configKey]);

    if (result.rows.length === 0) return null;

    return result.rows[0].config_value;
  }

  /**
   * Manually queue score recalculation
   */
  async queueRecalculation(opportunityId, reason = 'manual', priority = 5) {
    const query = `
      SELECT queue_score_recalc($1, $2, $3) as queue_id
    `;

    const result = await this.pool.query(query, [opportunityId, reason, priority]);

    return {
      queueId: result.rows[0].queue_id,
      opportunityId,
      reason,
      priority,
      queuedAt: new Date()
    };
  }

  /**
   * Batch queue recalculations
   */
  async batchQueueRecalculations(opportunityIds, reason = 'batch', priority = 5) {
    const results = [];

    for (const opportunityId of opportunityIds) {
      try {
        const result = await this.queueRecalculation(opportunityId, reason, priority);
        results.push(result);
      } catch (error) {
        results.push({
          opportunityId,
          error: error.message
        });
      }
    }

    return {
      total: opportunityIds.length,
      queued: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
      results
    };
  }

  /**
   * Get queue status
   */
  async getQueueStatus() {
    const query = `
      SELECT
        status,
        COUNT(*) as count,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM score_recalc_queue
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY status
      ORDER BY status
    `;

    const result = await this.pool.query(query);

    const statusMap = {};
    result.rows.forEach(row => {
      statusMap[row.status] = {
        count: parseInt(row.count),
        oldest: row.oldest,
        newest: row.newest
      };
    });

    return {
      pending: statusMap.PENDING || { count: 0 },
      processing: statusMap.PROCESSING || { count: 0 },
      completed: statusMap.COMPLETED || { count: 0 },
      failed: statusMap.FAILED || { count: 0 },
      generatedAt: new Date()
    };
  }

  /**
   * Clear old completed queue items (cleanup)
   */
  async cleanupQueue(options = {}) {
    const { olderThanDays = 7 } = options;

    const query = `
      DELETE FROM score_recalc_queue
      WHERE status IN ('COMPLETED', 'FAILED')
        AND processed_at < NOW() - INTERVAL '${olderThanDays} days'
    `;

    const result = await this.pool.query(query);

    return {
      deleted: result.rowCount,
      olderThanDays,
      cleanedAt: new Date()
    };
  }

  /**
   * Start continuous queue processor (for production)
   */
  async startQueueProcessor(options = {}) {
    const { intervalSeconds = 30, batchSize = 50 } = options;

    console.log(`Starting queue processor (interval: ${intervalSeconds}s, batch: ${batchSize})`);

    const processInterval = setInterval(async () => {
      try {
        await this.processQueue({ batchSize });
      } catch (error) {
        console.error('Queue processor error:', error);
      }
    }, intervalSeconds * 1000);

    // Store interval ID for cleanup
    this.processorInterval = processInterval;

    return {
      status: 'started',
      intervalSeconds,
      batchSize
    };
  }

  /**
   * Stop queue processor
   */
  stopQueueProcessor() {
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = null;
      return { status: 'stopped' };
    }
    return { status: 'not running' };
  }

  /**
   * Close database connection
   */
  async close() {
    this.stopQueueProcessor();
    await this.calculator.close();
    await this.priorityService.close();
    await this.alertService.close();
    await this.pool.end();
  }
}

export default RealtimeScoreService;
