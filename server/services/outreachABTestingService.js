/**
 * Outreach A/B Testing Service
 * Sprint 45 - A/B testing framework for outreach optimization
 *
 * Capabilities:
 * - Create and manage A/B tests
 * - Assign messages to variants
 * - Track performance metrics
 * - Calculate statistical significance
 * - Auto-declare winners
 */

import pg from 'pg';
const { Pool } = pg;

export class OutreachABTestingService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
  }

  /**
   * Create a new A/B test
   */
  async createTest(params) {
    const {
      test_name,
      description,
      test_type, // TEMPLATE, TONE, TIMING, SUBJECT, FULL_MESSAGE
      variant_a_config,
      variant_b_config,
      traffic_split = 0.50,
      primary_metric = 'reply_rate',
      secondary_metrics = [],
      min_sample_size = 100,
      created_by
    } = params;

    const query = `
      INSERT INTO outreach_ab_tests (
        test_name,
        description,
        test_type,
        status,
        variant_a_config,
        variant_b_config,
        traffic_split,
        primary_metric,
        secondary_metrics,
        min_sample_size,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      test_name,
      description,
      test_type,
      'DRAFT',
      JSON.stringify(variant_a_config),
      JSON.stringify(variant_b_config),
      traffic_split,
      primary_metric,
      JSON.stringify(secondary_metrics),
      min_sample_size,
      created_by
    ]);

    return result.rows[0];
  }

  /**
   * Start an A/B test
   */
  async startTest(testId) {
    const query = `
      UPDATE outreach_ab_tests
      SET status = 'RUNNING', started_at = NOW()
      WHERE id = $1 AND status = 'DRAFT'
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId]);

    if (result.rows.length === 0) {
      throw new Error('Test not found or not in DRAFT status');
    }

    return result.rows[0];
  }

  /**
   * Pause an A/B test
   */
  async pauseTest(testId) {
    const query = `
      UPDATE outreach_ab_tests
      SET status = 'PAUSED'
      WHERE id = $1 AND status = 'RUNNING'
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId]);
    return result.rows[0];
  }

  /**
   * Complete an A/B test
   */
  async completeTest(testId) {
    // Calculate final results
    const results = await this.analyzeTest(testId);

    const query = `
      UPDATE outreach_ab_tests
      SET
        status = 'COMPLETED',
        ended_at = NOW(),
        winner = $2,
        confidence_level = $3,
        results_summary = $4
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      testId,
      results.winner,
      results.confidence_level,
      JSON.stringify(results.summary)
    ]);

    return result.rows[0];
  }

  /**
   * Assign message to A/B test variant
   */
  async assignMessage(testId, messageId) {
    // Get test configuration
    const testResult = await this.pool.query(
      'SELECT traffic_split, status FROM outreach_ab_tests WHERE id = $1',
      [testId]
    );

    if (testResult.rows.length === 0) {
      throw new Error('Test not found');
    }

    const test = testResult.rows[0];

    if (test.status !== 'RUNNING') {
      throw new Error('Test is not running');
    }

    // Determine variant based on traffic split
    const variant = Math.random() < test.traffic_split ? 'A' : 'B';

    const query = `
      INSERT INTO outreach_ab_assignments (
        test_id,
        message_id,
        variant
      ) VALUES ($1, $2, $3)
      ON CONFLICT (test_id, message_id) DO NOTHING
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId, messageId, variant]);
    return result.rows[0] || { test_id: testId, message_id: messageId, variant };
  }

  /**
   * Record message sent event
   */
  async recordSent(testId, messageId) {
    const query = `
      UPDATE outreach_ab_assignments
      SET sent = TRUE
      WHERE test_id = $1 AND message_id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId, messageId]);
    return result.rows[0];
  }

  /**
   * Record message opened event
   */
  async recordOpened(testId, messageId) {
    const query = `
      UPDATE outreach_ab_assignments
      SET
        opened = TRUE,
        open_time = NOW(),
        time_to_open = EXTRACT(EPOCH FROM (NOW() - assigned_at)) / 60
      WHERE test_id = $1 AND message_id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId, messageId]);
    return result.rows[0];
  }

  /**
   * Record message clicked event
   */
  async recordClicked(testId, messageId) {
    const query = `
      UPDATE outreach_ab_assignments
      SET
        clicked = TRUE,
        click_time = NOW(),
        time_to_click = EXTRACT(EPOCH FROM (NOW() - assigned_at)) / 60
      WHERE test_id = $1 AND message_id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId, messageId]);
    return result.rows[0];
  }

  /**
   * Record message replied event
   */
  async recordReplied(testId, messageId) {
    const query = `
      UPDATE outreach_ab_assignments
      SET
        replied = TRUE,
        reply_time = NOW(),
        time_to_reply = EXTRACT(EPOCH FROM (NOW() - assigned_at)) / 60
      WHERE test_id = $1 AND message_id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId, messageId]);
    return result.rows[0];
  }

  /**
   * Record conversion event
   */
  async recordConversion(testId, messageId) {
    const query = `
      UPDATE outreach_ab_assignments
      SET
        converted = TRUE,
        conversion_time = NOW(),
        time_to_conversion = EXTRACT(EPOCH FROM (NOW() - assigned_at)) / 60
      WHERE test_id = $1 AND message_id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId, messageId]);
    return result.rows[0];
  }

  /**
   * Analyze A/B test results
   */
  async analyzeTest(testId) {
    const query = `
      SELECT
        variant,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE sent = TRUE) as sent,
        COUNT(*) FILTER (WHERE opened = TRUE) as opened,
        COUNT(*) FILTER (WHERE clicked = TRUE) as clicked,
        COUNT(*) FILTER (WHERE replied = TRUE) as replied,
        COUNT(*) FILTER (WHERE converted = TRUE) as converted,
        AVG(time_to_open) as avg_time_to_open,
        AVG(time_to_reply) as avg_time_to_reply,
        AVG(time_to_conversion) as avg_time_to_conversion
      FROM outreach_ab_assignments
      WHERE test_id = $1
      GROUP BY variant
    `;

    const result = await this.pool.query(query, [testId]);

    if (result.rows.length < 2) {
      return {
        status: 'INSUFFICIENT_DATA',
        message: 'Need both variants to have data'
      };
    }

    const variantA = result.rows.find(r => r.variant === 'A');
    const variantB = result.rows.find(r => r.variant === 'B');

    // Get test configuration
    const testResult = await this.pool.query(
      'SELECT primary_metric, min_sample_size FROM outreach_ab_tests WHERE id = $1',
      [testId]
    );

    const test = testResult.rows[0];

    // Check if we have minimum sample size
    if (parseInt(variantA.total) < test.min_sample_size ||
        parseInt(variantB.total) < test.min_sample_size) {
      return {
        status: 'INSUFFICIENT_SAMPLE',
        message: `Need ${test.min_sample_size} messages per variant`,
        variantA: this.calculateMetrics(variantA),
        variantB: this.calculateMetrics(variantB)
      };
    }

    // Calculate metrics
    const metricsA = this.calculateMetrics(variantA);
    const metricsB = this.calculateMetrics(variantB);

    // Calculate statistical significance for primary metric
    const primaryMetricKey = `${test.primary_metric}_rate`;
    const significance = this.calculateSignificance(
      parseInt(variantA[test.primary_metric.replace('_rate', '')]),
      parseInt(variantA.sent),
      parseInt(variantB[test.primary_metric.replace('_rate', '')]),
      parseInt(variantB.sent)
    );

    // Determine winner
    let winner = null;
    if (significance.significant) {
      winner = metricsA[primaryMetricKey] > metricsB[primaryMetricKey] ? 'A' : 'B';
    }

    return {
      status: 'COMPLETE',
      variantA: metricsA,
      variantB: metricsB,
      winner,
      confidence_level: significance.confidence,
      significant: significance.significant,
      z_score: significance.zScore,
      primary_metric: test.primary_metric,
      summary: {
        total_messages: parseInt(variantA.total) + parseInt(variantB.total),
        variant_a_performance: metricsA[primaryMetricKey],
        variant_b_performance: metricsB[primaryMetricKey],
        improvement: winner ? this.calculateImprovement(metricsA, metricsB, primaryMetricKey) : 0,
        recommendation: this.generateRecommendation(winner, metricsA, metricsB, significance)
      }
    };
  }

  /**
   * Calculate metrics for a variant
   */
  calculateMetrics(variantData) {
    const sent = parseInt(variantData.sent) || 0;

    return {
      total: parseInt(variantData.total),
      sent,
      opened: parseInt(variantData.opened),
      clicked: parseInt(variantData.clicked),
      replied: parseInt(variantData.replied),
      converted: parseInt(variantData.converted),
      open_rate: sent > 0 ? ((parseInt(variantData.opened) / sent) * 100).toFixed(2) : 0,
      click_rate: sent > 0 ? ((parseInt(variantData.clicked) / sent) * 100).toFixed(2) : 0,
      reply_rate: sent > 0 ? ((parseInt(variantData.replied) / sent) * 100).toFixed(2) : 0,
      conversion_rate: sent > 0 ? ((parseInt(variantData.converted) / sent) * 100).toFixed(2) : 0,
      avg_time_to_open: variantData.avg_time_to_open ? parseFloat(variantData.avg_time_to_open).toFixed(1) : null,
      avg_time_to_reply: variantData.avg_time_to_reply ? parseFloat(variantData.avg_time_to_reply).toFixed(1) : null,
      avg_time_to_conversion: variantData.avg_time_to_conversion ? parseFloat(variantData.avg_time_to_conversion).toFixed(1) : null
    };
  }

  /**
   * Calculate statistical significance using z-test
   */
  calculateSignificance(conversionsA, totalA, conversionsB, totalB) {
    if (totalA === 0 || totalB === 0) {
      return { significant: false, confidence: 0, zScore: 0 };
    }

    const pA = conversionsA / totalA;
    const pB = conversionsB / totalB;
    const pPool = (conversionsA + conversionsB) / (totalA + totalB);

    const se = Math.sqrt(pPool * (1 - pPool) * (1 / totalA + 1 / totalB));

    if (se === 0) {
      return { significant: false, confidence: 0, zScore: 0 };
    }

    const zScore = (pA - pB) / se;
    const absZ = Math.abs(zScore);

    // Z-score thresholds
    // 1.96 = 95% confidence
    // 2.58 = 99% confidence
    let confidence = 0;
    let significant = false;

    if (absZ >= 2.58) {
      confidence = 99;
      significant = true;
    } else if (absZ >= 1.96) {
      confidence = 95;
      significant = true;
    } else if (absZ >= 1.65) {
      confidence = 90;
    } else {
      confidence = Math.round((1 - Math.exp(-absZ)) * 100);
    }

    return {
      significant,
      confidence: parseFloat(confidence.toFixed(2)),
      zScore: parseFloat(zScore.toFixed(3)),
      pValue: this.calculatePValue(absZ)
    };
  }

  /**
   * Calculate p-value from z-score (approximation)
   */
  calculatePValue(zScore) {
    // Simplified approximation
    const t = 1 / (1 + 0.2316419 * zScore);
    const d = 0.3989423 * Math.exp(-zScore * zScore / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return parseFloat((2 * prob).toFixed(4));
  }

  /**
   * Calculate improvement percentage
   */
  calculateImprovement(metricsA, metricsB, metric) {
    const valueA = parseFloat(metricsA[metric]);
    const valueB = parseFloat(metricsB[metric]);

    if (valueB === 0) return 0;

    const improvement = ((Math.max(valueA, valueB) - Math.min(valueA, valueB)) / Math.min(valueA, valueB)) * 100;
    return parseFloat(improvement.toFixed(1));
  }

  /**
   * Generate recommendation
   */
  generateRecommendation(winner, metricsA, metricsB, significance) {
    if (!winner) {
      return 'No clear winner - continue testing or accept null hypothesis';
    }

    const winnerMetrics = winner === 'A' ? metricsA : metricsB;
    const loserMetrics = winner === 'A' ? metricsB : metricsA;

    return `Deploy Variant ${winner} - shows ${significance.confidence}% confidence with better performance`;
  }

  /**
   * List all tests
   */
  async listTests(options = {}) {
    const { status = null, limit = 50 } = options;

    let query = 'SELECT * FROM outreach_ab_tests WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get test details
   */
  async getTest(testId) {
    const query = 'SELECT * FROM outreach_ab_tests WHERE id = $1';
    const result = await this.pool.query(query, [testId]);
    return result.rows[0];
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default OutreachABTestingService;
