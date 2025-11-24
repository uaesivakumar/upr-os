/**
 * A/B Testing Service for Lead Scoring
 * Test different scoring formulas, weights, and thresholds
 *
 * Features:
 * - Create and manage A/B tests
 * - Automatic variant assignment
 * - Statistical significance calculation
 * - Winner determination
 * - Test monitoring and analytics
 */

import pg from 'pg';
const { Pool } = pg;

export class ABTestingService {
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
  async createTest(testData) {
    const {
      testName,
      testType,
      description,
      configA, // Control configuration
      configB, // Variant configuration
      targetSampleSize = 1000,
      createdBy = 'system'
    } = testData;

    const query = `
      INSERT INTO ab_tests (
        test_name,
        test_type,
        description,
        config_a,
        config_b,
        target_sample_size,
        status,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      testName,
      testType,
      description,
      JSON.stringify(configA),
      JSON.stringify(configB),
      targetSampleSize,
      createdBy
    ]);

    return result.rows[0];
  }

  /**
   * Start a test
   */
  async startTest(testId) {
    const query = `
      UPDATE ab_tests
      SET
        status = 'RUNNING',
        start_date = NOW()
      WHERE id = $1 AND status = 'DRAFT'
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId]);

    if (result.rows.length === 0) {
      throw new Error('Test not found or already started');
    }

    return result.rows[0];
  }

  /**
   * Pause a running test
   */
  async pauseTest(testId) {
    const query = `
      UPDATE ab_tests
      SET status = 'PAUSED'
      WHERE id = $1 AND status = 'RUNNING'
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId]);
    return result.rows[0];
  }

  /**
   * Complete a test
   */
  async completeTest(testId) {
    // Calculate final results
    const results = await this.getTestResults(testId);

    // Determine winner
    const winner = results.statistically_significant ? results.winner : null;

    const query = `
      UPDATE ab_tests
      SET
        status = 'COMPLETED',
        end_date = NOW(),
        winner = $2,
        confidence_level = $3,
        results = $4
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      testId,
      winner,
      results.confidence_level,
      JSON.stringify(results)
    ]);

    return result.rows[0];
  }

  /**
   * Assign opportunity to test variant
   */
  async assignToVariant(testId, opportunityId) {
    // Check if test is running
    const testQuery = 'SELECT * FROM ab_tests WHERE id = $1 AND status = \'RUNNING\'';
    const testResult = await this.pool.query(testQuery, [testId]);

    if (testResult.rows.length === 0) {
      throw new Error('Test not found or not running');
    }

    // Check if already assigned
    const assignmentQuery = `
      SELECT variant FROM ab_test_assignments
      WHERE test_id = $1 AND opportunity_id = $2
    `;
    const assignmentResult = await this.pool.query(assignmentQuery, [testId, opportunityId]);

    if (assignmentResult.rows.length > 0) {
      // Already assigned
      return {
        variant: assignmentResult.rows[0].variant,
        config: assignmentResult.rows[0].variant === 'A' ?
          testResult.rows[0].config_a :
          testResult.rows[0].config_b,
        alreadyAssigned: true
      };
    }

    // Assign to variant (50/50 split)
    const variant = Math.random() < 0.5 ? 'A' : 'B';

    const insertQuery = `
      INSERT INTO ab_test_assignments (
        test_id,
        opportunity_id,
        variant,
        assigned_at
      ) VALUES ($1, $2, $3, NOW())
      RETURNING *
    `;

    await this.pool.query(insertQuery, [testId, opportunityId, variant]);

    // Update test sample size
    await this.pool.query(`
      UPDATE ab_tests
      SET sample_size = (
        SELECT COUNT(*) FROM ab_test_assignments WHERE test_id = $1
      )
      WHERE id = $1
    `, [testId]);

    return {
      variant,
      config: variant === 'A' ?
        testResult.rows[0].config_a :
        testResult.rows[0].config_b,
      alreadyAssigned: false
    };
  }

  /**
   * Record score calculated for test assignment
   */
  async recordScore(testId, opportunityId, score) {
    const query = `
      UPDATE ab_test_assignments
      SET score_calculated = $3
      WHERE test_id = $1 AND opportunity_id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId, opportunityId, score]);
    return result.rows[0];
  }

  /**
   * Record conversion
   */
  async recordConversion(testId, opportunityId, converted = true) {
    const query = `
      UPDATE ab_test_assignments
      SET
        converted = $3,
        conversion_date = NOW()
      WHERE test_id = $1 AND opportunity_id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [testId, opportunityId, converted]);
    return result.rows[0];
  }

  /**
   * Get test results with statistical analysis
   */
  async getTestResults(testId) {
    const assignmentsQuery = `
      SELECT
        variant,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE converted = TRUE) as conversions,
        AVG(score_calculated) as avg_score
      FROM ab_test_assignments
      WHERE test_id = $1
      GROUP BY variant
    `;

    const result = await this.pool.query(assignmentsQuery, [testId]);

    if (result.rows.length === 0) {
      return {
        variantA: { total: 0, conversions: 0, conversionRate: 0, avgScore: 0 },
        variantB: { total: 0, conversions: 0, conversionRate: 0, avgScore: 0 },
        statistically_significant: false,
        confidence_level: 0,
        winner: null
      };
    }

    const variantA = result.rows.find(r => r.variant === 'A') || { total: 0, conversions: 0, avg_score: 0 };
    const variantB = result.rows.find(r => r.variant === 'B') || { total: 0, conversions: 0, avg_score: 0 };

    const aConvRate = parseInt(variantA.total) > 0 ?
      parseInt(variantA.conversions) / parseInt(variantA.total) : 0;
    const bConvRate = parseInt(variantB.total) > 0 ?
      parseInt(variantB.conversions) / parseInt(variantB.total) : 0;

    // Calculate statistical significance (simplified z-test)
    const { significant, confidence, zScore } = this.calculateSignificance(
      parseInt(variantA.conversions),
      parseInt(variantA.total),
      parseInt(variantB.conversions),
      parseInt(variantB.total)
    );

    // Determine winner
    let winner = null;
    if (significant) {
      winner = aConvRate > bConvRate ? 'A' : 'B';
    }

    return {
      variantA: {
        total: parseInt(variantA.total),
        conversions: parseInt(variantA.conversions),
        conversionRate: parseFloat(aConvRate.toFixed(4)),
        avgScore: parseFloat(variantA.avg_score) || 0
      },
      variantB: {
        total: parseInt(variantB.total),
        conversions: parseInt(variantB.conversions),
        conversionRate: parseFloat(bConvRate.toFixed(4)),
        avgScore: parseFloat(variantB.avg_score) || 0
      },
      statistically_significant: significant,
      confidence_level: parseFloat(confidence.toFixed(4)),
      z_score: parseFloat(zScore.toFixed(4)),
      winner,
      lift: winner ? parseFloat((Math.abs(aConvRate - bConvRate) / Math.max(aConvRate, bConvRate) * 100).toFixed(2)) : 0
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

    // Pooled proportion
    const pPool = (conversionsA + conversionsB) / (totalA + totalB);

    // Standard error
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / totalA + 1 / totalB));

    // Z-score
    const zScore = (pA - pB) / se;

    // Confidence level (two-tailed test)
    const absZ = Math.abs(zScore);

    // Approximate p-value to confidence level
    // |Z| > 1.96 => 95% confidence
    // |Z| > 2.58 => 99% confidence
    let confidence = 0;
    if (absZ > 2.58) confidence = 0.99;
    else if (absZ > 1.96) confidence = 0.95;
    else if (absZ > 1.65) confidence = 0.90;
    else if (absZ > 1.28) confidence = 0.80;

    const significant = absZ > 1.96; // 95% confidence threshold

    return { significant, confidence, zScore };
  }

  /**
   * Get test summary
   */
  async getTest(testId) {
    const query = 'SELECT * FROM ab_tests WHERE id = $1';
    const result = await this.pool.query(query, [testId]);

    if (result.rows.length === 0) {
      throw new Error('Test not found');
    }

    return result.rows[0];
  }

  /**
   * List all tests
   */
  async listTests(options = {}) {
    const { status = null, limit = 50 } = options;

    let query = 'SELECT * FROM ab_tests WHERE 1=1';
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
   * Get active tests for assignment
   */
  async getActiveTests(testType = null) {
    let query = `
      SELECT * FROM ab_tests
      WHERE status = 'RUNNING'
    `;

    const params = [];

    if (testType) {
      params.push(testType);
      query += ` AND test_type = $${params.length}`;
    }

    query += ' ORDER BY created_at ASC';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get test analytics
   */
  async getTestAnalytics(testId) {
    const test = await this.getTest(testId);
    const results = await this.getTestResults(testId);

    // Get daily breakdown
    const dailyQuery = `
      SELECT
        DATE(assigned_at) as date,
        variant,
        COUNT(*) as assignments,
        COUNT(*) FILTER (WHERE converted = TRUE) as conversions
      FROM ab_test_assignments
      WHERE test_id = $1
      GROUP BY DATE(assigned_at), variant
      ORDER BY date, variant
    `;

    const dailyResult = await this.pool.query(dailyQuery, [testId]);

    return {
      test,
      results,
      daily_breakdown: dailyResult.rows,
      status: {
        progress: test.target_sample_size > 0 ?
          (test.sample_size / test.target_sample_size * 100).toFixed(1) : 0,
        current_sample: test.sample_size || 0,
        target_sample: test.target_sample_size || 0,
        days_running: test.start_date ?
          Math.floor((new Date() - new Date(test.start_date)) / (1000 * 60 * 60 * 24)) : 0
      }
    };
  }

  /**
   * Delete test (admin only)
   */
  async deleteTest(testId) {
    // Delete assignments first (cascade should handle this)
    await this.pool.query('DELETE FROM ab_test_assignments WHERE test_id = $1', [testId]);

    // Delete test
    const result = await this.pool.query('DELETE FROM ab_tests WHERE id = $1 RETURNING *', [testId]);

    return {
      deleted: result.rowCount > 0,
      test: result.rows[0]
    };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default ABTestingService;
