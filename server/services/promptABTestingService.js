/**
 * Prompt A/B Testing Service
 * Sprint 32 - Task 2: Prompt Optimization System
 *
 * Manages A/B tests, tracks performance, and declares winners
 */

const { Pool } = require('pg');

class PromptABTestingService {
  constructor(pool) {
    this.pool = pool || new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  // ═══════════════════════════════════════════════════════════
  // EXECUTION TRACKING
  // ═══════════════════════════════════════════════════════════

  /**
   * Log a prompt execution for performance tracking
   */
  async logExecution(params) {
    const {
      prompt_name,
      prompt_version,
      execution_time_ms,
      success,
      error_message = null,
      input_variables = {},
      output_data = null,
      output_quality_score = null,
      user_id = null,
      company_id = null,
      contact_id = null
    } = params;

    const query = `
      INSERT INTO prompt_executions (
        prompt_name, prompt_version, execution_time_ms, success, error_message,
        input_variables, output_data, output_quality_score,
        user_id, company_id, contact_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;

    const result = await this.pool.query(query, [
      prompt_name,
      prompt_version,
      execution_time_ms,
      success,
      error_message,
      JSON.stringify(input_variables),
      output_data ? JSON.stringify(output_data) : null,
      output_quality_score,
      user_id,
      company_id,
      contact_id
    ]);

    return result.rows[0].id;
  }

  /**
   * Update execution with conversion data (opened, responded)
   */
  async updateExecutionConversion(execution_id, conversions) {
    const { message_sent, message_opened, message_responded } = conversions;

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (message_sent !== undefined) {
      paramCount++;
      updates.push(`message_sent = $${paramCount}`);
      values.push(message_sent);
    }

    if (message_opened !== undefined) {
      paramCount++;
      updates.push(`message_opened = $${paramCount}`);
      values.push(message_opened);
    }

    if (message_responded !== undefined) {
      paramCount++;
      updates.push(`message_responded = $${paramCount}`);
      values.push(message_responded);
    }

    if (updates.length === 0) return;

    values.push(execution_id);
    const query = `
      UPDATE prompt_executions
      SET ${updates.join(', ')}
      WHERE id = $${paramCount + 1}
    `;

    await this.pool.query(query, values);
  }

  // ═══════════════════════════════════════════════════════════
  // A/B TEST MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  /**
   * Create or update an A/B test configuration
   */
  async createABTest(params) {
    const {
      prompt_name,
      traffic_split = {},
      min_sample_size = 100,
      confidence_threshold = 0.95,
      created_by = 'system'
    } = params;

    const query = `
      INSERT INTO prompt_ab_tests (
        prompt_name, traffic_split, min_sample_size,
        confidence_threshold, created_by
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (prompt_name)
      DO UPDATE SET
        traffic_split = EXCLUDED.traffic_split,
        min_sample_size = EXCLUDED.min_sample_size,
        confidence_threshold = EXCLUDED.confidence_threshold,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      prompt_name,
      JSON.stringify(traffic_split),
      min_sample_size,
      confidence_threshold,
      created_by
    ]);

    return result.rows[0];
  }

  /**
   * Get A/B test configuration
   */
  async getABTest(prompt_name) {
    const query = `
      SELECT * FROM prompt_ab_tests
      WHERE prompt_name = $1
    `;

    const result = await this.pool.query(query, [prompt_name]);
    return result.rows[0] || null;
  }

  /**
   * List all A/B tests
   */
  async listABTests(filters = {}) {
    const { status, test_enabled } = filters;

    let whereClause = [];
    let values = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      whereClause.push(`status = $${paramCount}`);
      values.push(status);
    }

    if (test_enabled !== undefined) {
      paramCount++;
      whereClause.push(`test_enabled = $${paramCount}`);
      values.push(test_enabled);
    }

    const where = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    const query = `
      SELECT * FROM prompt_ab_tests
      ${where}
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  /**
   * Enable/disable A/B test
   */
  async toggleABTest(prompt_name, enabled) {
    const query = `
      UPDATE prompt_ab_tests
      SET test_enabled = $1, updated_at = NOW()
      WHERE prompt_name = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [enabled, prompt_name]);
    return result.rows[0];
  }

  // ═══════════════════════════════════════════════════════════
  // PERFORMANCE ANALYTICS
  // ═══════════════════════════════════════════════════════════

  /**
   * Refresh performance metrics materialized view
   */
  async refreshMetrics() {
    await this.pool.query('SELECT refresh_prompt_performance_metrics()');
  }

  /**
   * Get performance metrics for a prompt (all versions)
   */
  async getPromptPerformance(prompt_name) {
    await this.refreshMetrics();

    const query = `
      SELECT * FROM prompt_performance_metrics
      WHERE prompt_name = $1
      ORDER BY prompt_version DESC
    `;

    const result = await this.pool.query(query, [prompt_name]);
    return result.rows;
  }

  /**
   * Compare two prompt versions
   */
  async compareVersions(prompt_name, version_a, version_b) {
    await this.refreshMetrics();

    const query = `
      SELECT
        prompt_version,
        total_executions,
        avg_execution_time_ms,
        avg_quality_score,
        success_rate,
        open_rate,
        response_rate
      FROM prompt_performance_metrics
      WHERE prompt_name = $1
        AND prompt_version IN ($2, $3)
      ORDER BY prompt_version
    `;

    const result = await this.pool.query(query, [prompt_name, version_a, version_b]);

    if (result.rows.length !== 2) {
      throw new Error('Both versions must have execution data');
    }

    const [metricA, metricB] = result.rows;

    return {
      prompt_name,
      version_a: version_a,
      version_b: version_b,
      metrics: {
        [version_a]: metricA,
        [version_b]: metricB
      },
      comparison: {
        response_rate_lift: ((metricB.response_rate - metricA.response_rate) / metricA.response_rate * 100).toFixed(2),
        quality_score_lift: ((metricB.avg_quality_score - metricA.avg_quality_score) / metricA.avg_quality_score * 100).toFixed(2),
        sample_sizes: {
          [version_a]: parseInt(metricA.total_executions),
          [version_b]: parseInt(metricB.total_executions)
        }
      }
    };
  }

  /**
   * Determine A/B test winner based on statistical significance
   */
  async determineWinner(prompt_name) {
    const test = await this.getABTest(prompt_name);
    if (!test) {
      throw new Error(`No A/B test found for prompt: ${prompt_name}`);
    }

    const metrics = await this.getPromptPerformance(prompt_name);

    if (metrics.length < 2) {
      return {
        winner: null,
        reason: 'Need at least 2 active versions to determine winner'
      };
    }

    // Check minimum sample size
    const insufficientSamples = metrics.filter(m =>
      parseInt(m.total_executions) < test.min_sample_size
    );

    if (insufficientSamples.length > 0) {
      return {
        winner: null,
        reason: `Some versions have insufficient samples (min: ${test.min_sample_size})`
      };
    }

    // Sort by response rate (primary metric for outreach)
    const sorted = metrics.sort((a, b) => parseFloat(b.response_rate) - parseFloat(a.response_rate));

    const winner = sorted[0];
    const runnerUp = sorted[1];

    // Simple winner determination (can be enhanced with statistical tests)
    const lift = ((parseFloat(winner.response_rate) - parseFloat(runnerUp.response_rate)) /
                  parseFloat(runnerUp.response_rate) * 100);

    return {
      winner: winner.prompt_version,
      metrics: winner,
      lift_vs_next_best: `${lift.toFixed(2)}%`,
      confidence: lift > 10 ? 'HIGH' : lift > 5 ? 'MEDIUM' : 'LOW',
      recommendation: lift > 5 ? 'DECLARE_WINNER' : 'CONTINUE_TESTING'
    };
  }

  /**
   * Declare A/B test winner (deactivates other versions)
   */
  async declareWinner(prompt_name, winning_version) {
    await this.pool.query(
      'SELECT declare_ab_test_winner($1, $2)',
      [prompt_name, winning_version]
    );

    return {
      prompt_name,
      winning_version,
      status: 'winner_declared',
      declared_at: new Date()
    };
  }

  /**
   * Get A/B test dashboard summary
   */
  async getDashboard() {
    await this.refreshMetrics();

    const query = `
      SELECT
        abt.prompt_name,
        abt.status,
        abt.test_enabled,
        abt.winning_version,
        COUNT(DISTINCT pv.version) as active_versions,
        SUM(ppm.total_executions::integer) as total_executions
      FROM prompt_ab_tests abt
      LEFT JOIN prompt_versions pv
        ON abt.prompt_name = pv.name AND pv.active = true
      LEFT JOIN prompt_performance_metrics ppm
        ON abt.prompt_name = ppm.prompt_name
      GROUP BY abt.id, abt.prompt_name, abt.status, abt.test_enabled, abt.winning_version
      ORDER BY abt.created_at DESC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = { PromptABTestingService };
