// server/services/radar.js
// Radar Service - Business logic for discovery runs
import pool from '../db.js';
import crypto from 'crypto';

class RadarService {
  /**
   * Create a new discovery run
   * @param {object} params - { tenantId, trigger, promptVersion, budgetLimitUsd }
   * @returns {Promise<object>} Created run
   */
  async createRun(params) {
    const {
      tenantId,
      trigger = 'manual',
      promptVersion = 'v1.0',
      budgetLimitUsd = 2.00,
      metadata = {}
    } = params;

    // Create inputs hash for idempotency
    const inputsHash = this.createInputsHash({ tenantId, trigger, promptVersion });

    const result = await pool.query(
      `INSERT INTO discovery_runs (
        tenant_id,
        trigger,
        prompt_version,
        inputs_hash,
        budget_limit_usd,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [tenantId, trigger, promptVersion, inputsHash, budgetLimitUsd, JSON.stringify(metadata)]
    );

    return result.rows[0];
  }

  /**
   * Update run status
   * @param {string} runId - Run ID
   * @param {object} updates - Fields to update
   */
  async updateRun(runId, updates) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    values.push(runId);

    const query = `
      UPDATE discovery_runs
      SET ${fields.join(', ')}
      WHERE run_id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Complete a discovery run
   * @param {string} runId - Run ID
   * @param {object} stats - { companiesFound, companiesAccepted, costUsd, latencyMs }
   */
  async completeRun(runId, stats) {
    const { companiesFound, companiesAccepted, costUsd, latencyMs } = stats;

    return this.updateRun(runId, {
      status: 'completed',
      ended_at: new Date().toISOString(),
      companies_found: companiesFound,
      companies_accepted: companiesAccepted,
      cost_usd: costUsd,
      latency_ms: latencyMs
    });
  }

  /**
   * Fail a discovery run
   * @param {string} runId - Run ID
   * @param {string} error - Error message
   */
  async failRun(runId, error) {
    return this.updateRun(runId, {
      status: 'failed',
      ended_at: new Date().toISOString(),
      error_summary: error,
      metadata: { error }
    });
  }

  /**
   * Get run by ID
   * @param {string} runId - Run ID
   * @returns {Promise<object>} Run details
   */
  async getRun(runId) {
    const result = await pool.query(
      'SELECT * FROM discovery_runs WHERE run_id = $1',
      [runId]
    );
    return result.rows[0];
  }

  /**
   * Get recent runs for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {number} limit - Max number of runs
   * @returns {Promise<Array>} Recent runs
   */
  async getRecentRuns(tenantId, limit = 20) {
    const result = await pool.query(
      `SELECT * FROM discovery_runs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  }

  /**
   * Get run summary stats
   * @param {string} runId - Run ID
   * @returns {Promise<object>} Summary stats
   */
  async getRunSummary(runId) {
    const result = await pool.query(
      'SELECT * FROM run_summary WHERE run_id = $1',
      [runId]
    );
    return result.rows[0];
  }

  /**
   * Get all discovery sources
   * @returns {Promise<Array>} Discovery sources
   */
  async getSources() {
    const result = await pool.query(
      'SELECT * FROM discovery_sources ORDER BY name ASC'
    );
    return result.rows;
  }

  /**
   * Get source performance metrics
   * @param {string} sourceId - Source ID (optional)
   * @returns {Promise<Array|object>} Source performance
   */
  async getSourcePerformance(sourceId = null) {
    if (sourceId) {
      const result = await pool.query(
        'SELECT * FROM source_performance WHERE source_id = $1',
        [sourceId]
      );
      return result.rows[0];
    }

    const result = await pool.query(
      'SELECT * FROM source_performance ORDER BY avg_precision DESC'
    );
    return result.rows;
  }

  /**
   * Update source performance metrics
   * @param {string} sourceId - Source ID
   * @param {object} metrics - { avgPrecision, avgCpaUsd }
   */
  async updateSourceMetrics(sourceId, metrics) {
    const { avgPrecision, avgCpaUsd } = metrics;

    await pool.query(
      `UPDATE discovery_sources
       SET avg_precision = $1, avg_cpa_usd = $2, updated_at = NOW()
       WHERE source_id = $3`,
      [avgPrecision, avgCpaUsd, sourceId]
    );
  }

  /**
   * Get dead letter queue entries
   * @param {number} limit - Max entries
   * @returns {Promise<Array>} Dead letters
   */
  async getDeadLetters(limit = 50) {
    const result = await pool.query(
      `SELECT * FROM discovery_dead_letters
       WHERE resolved_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  /**
   * Resolve a dead letter
   * @param {string} deadLetterId - Dead letter ID
   * @param {object} resolution - { resolvedBy, notes }
   */
  async resolveDeadLetter(deadLetterId, resolution) {
    const { resolvedBy, notes } = resolution;

    await pool.query(
      `UPDATE discovery_dead_letters
       SET resolved_at = NOW(), resolved_by = $1, resolution_notes = $2
       WHERE dead_letter_id = $3`,
      [resolvedBy, notes, deadLetterId]
    );
  }

  /**
   * Get tenant stats
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<object>} Tenant stats
   */
  async getTenantStats(tenantId) {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_runs,
        SUM(companies_found) as total_companies_found,
        SUM(companies_accepted) as total_companies_accepted,
        SUM(cost_usd) as total_cost,
        AVG(latency_ms) as avg_latency_ms,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_runs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_runs
       FROM discovery_runs
       WHERE tenant_id = $1`,
      [tenantId]
    );

    return result.rows[0];
  }

  /**
   * Create inputs hash for idempotency
   * @param {object} inputs - Run inputs
   * @returns {string} SHA256 hash
   */
  createInputsHash(inputs) {
    const inputString = JSON.stringify(inputs);
    return crypto.createHash('sha256').update(inputString).digest('hex');
  }

  /**
   * Check if identical run exists recently (within 24 hours)
   * @param {string} inputsHash - Inputs hash
   * @returns {Promise<object|null>} Existing run or null
   */
  async findDuplicateRun(inputsHash) {
    const result = await pool.query(
      `SELECT * FROM discovery_runs
       WHERE inputs_hash = $1
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [inputsHash]
    );

    return result.rows[0] || null;
  }

  /**
   * Get daily run stats for last N days
   * @param {string} tenantId - Tenant ID
   * @param {number} days - Number of days
   * @returns {Promise<Array>} Daily stats
   */
  async getDailyStats(tenantId, days = 30) {
    const result = await pool.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as run_count,
        SUM(companies_found) as companies_found,
        SUM(companies_accepted) as companies_accepted,
        SUM(cost_usd) as cost_usd
       FROM discovery_runs
       WHERE tenant_id = $1
       AND created_at > NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [tenantId]
    );

    return result.rows;
  }

  /**
   * Create a dead letter entry
   * @param {object} params - { runId, sourceId, rawData, failureReason, tenantId }
   */
  async createDeadLetter(params) {
    const { runId, sourceId, rawData, failureReason, tenantId } = params;

    await pool.query(
      `INSERT INTO discovery_dead_letters (
        run_id, source_id, raw_data, failure_reason, tenant_id
      ) VALUES ($1, $2, $3, $4, $5)`,
      [runId, sourceId, JSON.stringify(rawData), failureReason, tenantId]
    );
  }
}

export default new RadarService();
