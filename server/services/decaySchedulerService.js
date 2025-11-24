/**
 * Decay Scheduler Service
 * Automated score decay application on a schedule
 *
 * Features:
 * - Cron-based scheduling
 * - Configurable decay parameters
 * - Dry-run mode for testing
 * - Performance monitoring
 * - Error handling and logging
 */

import pg from 'pg';
const { Pool } = pg;
import { ScoreDecayService } from './scoreDecayService.js';
import { ScoreAlertService } from './scoreAlertService.js';

export class DecaySchedulerService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }

    this.decayService = new ScoreDecayService(connectionConfig || process.env.DATABASE_URL);
    this.alertService = new ScoreAlertService(connectionConfig || process.env.DATABASE_URL);

    this.schedulerInterval = null;
    this.lastRun = null;
  }

  /**
   * Run decay process
   */
  async runDecay(options = {}) {
    const {
      dryRun = false,
      notifyOnCompletion = true
    } = options;

    console.log(`Starting decay process (dryRun: ${dryRun})...`);
    const startTime = Date.now();

    try {
      // Get decay configuration
      const config = await this.getConfig('decay_config');

      if (!config || !config.enabled) {
        console.log('Score decay disabled in configuration');
        return {
          status: 'disabled',
          message: 'Decay is disabled in configuration'
        };
      }

      // Apply decay using configuration parameters
      const result = await this.decayService.batchApplyDecay({
        dryRun,
        minDaysInactive: config.min_days_inactive || 7,
        limit: null, // Process all eligible
        concurrency: 10
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Log execution
      await this.logDecayExecution({
        dryRun,
        total: result.total,
        processed: result.processed,
        decayApplied: result.decayApplied,
        gradeChanges: result.gradeChanges,
        failed: result.failed,
        duration,
        summary: result.summary
      });

      // Create alerts for significant grade changes
      if (!dryRun && result.gradeChanges > 0) {
        await this.createGradeChangeAlerts(result.results);
      }

      console.log(`Decay process completed in ${duration}s`);
      console.log(`- Total opportunities: ${result.total}`);
      console.log(`- Decay applied: ${result.decayApplied}`);
      console.log(`- Grade changes: ${result.gradeChanges}`);

      this.lastRun = new Date();

      return {
        status: 'success',
        dryRun,
        ...result,
        duration,
        completedAt: this.lastRun
      };

    } catch (error) {
      console.error('Error running decay process:', error);

      // Log failed execution
      await this.logDecayExecution({
        dryRun,
        error: error.message,
        duration: ((Date.now() - startTime) / 1000).toFixed(2)
      });

      throw error;
    }
  }

  /**
   * Create alerts for grade changes due to decay
   */
  async createGradeChangeAlerts(results) {
    const gradeChanges = results.filter(r => r.gradeChange && !r.error);

    for (const result of gradeChanges.slice(0, 100)) { // Limit to 100 alerts
      try {
        await this.alertService.createAlert({
          opportunityId: result.opportunityId,
          type: 'DECAY_APPLIED',
          severity: this.getDecaySeverity(result.decayRate, result.gradeChange),
          message: `Score decayed due to ${result.daysInactive} days inactivity. Grade: ${result.previousGrade} → ${result.newGrade}`,
          metadata: JSON.stringify({
            decayRate: result.decayRate,
            daysInactive: result.daysInactive,
            oldGrade: result.previousGrade,
            newGrade: result.newGrade,
            oldScore: result.originalLeadScore,
            newScore: result.newLeadScore
          })
        });
      } catch (error) {
        console.error(`Failed to create alert for ${result.opportunityId}:`, error);
      }
    }
  }

  /**
   * Determine severity based on decay rate and grade change
   */
  getDecaySeverity(decayRate, gradeChange) {
    if (gradeChange && decayRate > 0.5) return 'HIGH';
    if (gradeChange) return 'MEDIUM';
    if (decayRate > 0.5) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Log decay execution to database
   */
  async logDecayExecution(data) {
    const query = `
      INSERT INTO decay_executions (
        dry_run,
        total_opportunities,
        decay_applied,
        grade_changes,
        failed,
        duration_seconds,
        error_message,
        summary,
        executed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `;

    try {
      // First check if table exists, if not create it
      await this.ensureDecayExecutionsTable();

      await this.pool.query(query, [
        data.dryRun || false,
        data.total || 0,
        data.decayApplied || 0,
        data.gradeChanges || 0,
        data.failed || 0,
        parseFloat(data.duration) || 0,
        data.error || null,
        JSON.stringify(data.summary || {})
      ]);
    } catch (error) {
      console.error('Failed to log decay execution:', error);
      // Don't throw - logging failure shouldn't stop the process
    }
  }

  /**
   * Ensure decay_executions table exists
   */
  async ensureDecayExecutionsTable() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS decay_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dry_run BOOLEAN DEFAULT FALSE,
        total_opportunities INTEGER,
        decay_applied INTEGER,
        grade_changes INTEGER,
        failed INTEGER,
        duration_seconds DECIMAL(10,2),
        error_message TEXT,
        summary JSONB,
        executed_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;

    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_decay_executions_executed_at
      ON decay_executions(executed_at DESC)
    `;

    await this.pool.query(createTableQuery);
    await this.pool.query(createIndexQuery);
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
   * Start automated decay scheduler
   */
  async startScheduler(options = {}) {
    const config = await this.getConfig('decay_config');

    if (!config || !config.enabled || !config.auto_apply) {
      console.log('Automated decay disabled in configuration');
      return {
        status: 'disabled',
        message: 'Automated decay is disabled'
      };
    }

    // Parse cron schedule or use default (2 AM daily)
    const schedule = config.cron_schedule || '0 2 * * *';

    // For MVP, use simple interval (24 hours)
    // In production, use a proper cron library like node-cron
    const intervalHours = options.intervalHours || 24;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    console.log(`Starting decay scheduler (every ${intervalHours} hours)`);

    // Run immediately if requested
    if (options.runImmediately) {
      await this.runDecay({ dryRun: false });
    }

    // Schedule recurring execution
    this.schedulerInterval = setInterval(async () => {
      try {
        await this.runDecay({ dryRun: false });
      } catch (error) {
        console.error('Scheduled decay execution failed:', error);
      }
    }, intervalMs);

    return {
      status: 'started',
      schedule,
      intervalHours,
      nextRun: new Date(Date.now() + intervalMs)
    };
  }

  /**
   * Stop scheduler
   */
  stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      return { status: 'stopped' };
    }
    return { status: 'not running' };
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      running: this.schedulerInterval !== null,
      lastRun: this.lastRun,
      nextRun: this.schedulerInterval ?
        new Date(this.lastRun.getTime() + 24 * 60 * 60 * 1000) :
        null
    };
  }

  /**
   * Get decay execution history
   */
  async getExecutionHistory(options = {}) {
    const { limit = 30, includeErrors = true } = options;

    try {
      await this.ensureDecayExecutionsTable();

      let query = `
        SELECT *
        FROM decay_executions
        WHERE 1=1
      `;

      if (!includeErrors) {
        query += ` AND error_message IS NULL`;
      }

      query += `
        ORDER BY executed_at DESC
        LIMIT $1
      `;

      const result = await this.pool.query(query, [limit]);

      return result.rows.map(row => ({
        id: row.id,
        dryRun: row.dry_run,
        totalOpportunities: row.total_opportunities,
        decayApplied: row.decay_applied,
        gradeChanges: row.grade_changes,
        failed: row.failed,
        durationSeconds: parseFloat(row.duration_seconds),
        error: row.error_message,
        summary: row.summary,
        executedAt: row.executed_at
      }));

    } catch (error) {
      console.error('Failed to get execution history:', error);
      return [];
    }
  }

  /**
   * Get decay statistics
   */
  async getDecayStatistics(options = {}) {
    const { days = 30 } = options;

    const query = `
      SELECT
        COUNT(*) as total_runs,
        SUM(total_opportunities) as total_opportunities_processed,
        SUM(decay_applied) as total_decay_applied,
        SUM(grade_changes) as total_grade_changes,
        AVG(duration_seconds) as avg_duration_seconds,
        MAX(executed_at) as last_run,
        COUNT(*) FILTER (WHERE error_message IS NOT NULL) as failed_runs
      FROM decay_executions
      WHERE executed_at >= NOW() - INTERVAL '${days} days'
    `;

    try {
      await this.ensureDecayExecutionsTable();
      const result = await this.pool.query(query);

      if (result.rows.length === 0) {
        return {
          totalRuns: 0,
          totalOpportunitiesProcessed: 0,
          totalDecayApplied: 0,
          totalGradeChanges: 0,
          avgDurationSeconds: 0,
          lastRun: null,
          failedRuns: 0,
          period: `${days} days`
        };
      }

      const row = result.rows[0];

      return {
        totalRuns: parseInt(row.total_runs) || 0,
        totalOpportunitiesProcessed: parseInt(row.total_opportunities_processed) || 0,
        totalDecayApplied: parseInt(row.total_decay_applied) || 0,
        totalGradeChanges: parseInt(row.total_grade_changes) || 0,
        avgDurationSeconds: parseFloat(row.avg_duration_seconds) || 0,
        lastRun: row.last_run,
        failedRuns: parseInt(row.failed_runs) || 0,
        period: `${days} days`
      };

    } catch (error) {
      console.error('Failed to get decay statistics:', error);
      return null;
    }
  }

  /**
   * Close database connection
   */
  async close() {
    this.stopScheduler();
    await this.decayService.close();
    await this.alertService.close();
    await this.pool.end();
  }
}

export default DecaySchedulerService;
