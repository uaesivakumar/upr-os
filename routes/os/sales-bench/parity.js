/**
 * Wiring Parity Test API
 *
 * Endpoints for certifying frontend and Sales-Bench use identical SIVA path.
 *
 * POST /parity/run       - Run single parity test
 * POST /parity/certify   - Run full 5-case certification
 * GET  /parity/status    - Get certification status
 * GET  /parity/results   - Get recent test results
 */

import express from 'express';
import pool from '../../../server/db.js';
import { runParityTest, runWiringCertification } from '../../../os/sales-bench/parity/wiring-parity-test.js';

const router = express.Router();

/**
 * POST /api/os/sales-bench/parity/run
 * Run a single parity test on a custom test case
 */
router.post('/run', async (req, res) => {
  try {
    const { testCase } = req.body;

    if (!testCase) {
      return res.status(400).json({
        success: false,
        error: 'TEST_CASE_REQUIRED',
        message: 'Provide testCase object with company and scenario data',
      });
    }

    console.log(`[PARITY] Running single test: ${testCase.name || 'custom'}`);

    const result = await runParityTest(testCase);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('[PARITY] Run error:', error);
    res.status(500).json({
      success: false,
      error: 'PARITY_TEST_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/parity/certify
 * Run full 5-case wiring certification
 */
router.post('/certify', async (req, res) => {
  try {
    console.log('[PARITY] Starting wiring certification...');

    const certification = await runWiringCertification();

    // Save to database
    await pool.query(`
      INSERT INTO sales_bench_parity_certifications (
        certification_id, total_tests, passed, failed, certified, summary, results
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      certification.certification_id,
      certification.total_tests,
      certification.passed,
      certification.failed,
      certification.certified,
      certification.summary,
      JSON.stringify(certification.results),
    ]);

    res.json({
      success: true,
      certification,
    });
  } catch (error) {
    console.error('[PARITY] Certification error:', error);
    res.status(500).json({
      success: false,
      error: 'CERTIFICATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/parity/status
 * Get current certification status
 */
router.get('/status', async (req, res) => {
  try {
    // Get latest certification
    const certResult = await pool.query(`
      SELECT
        certification_id,
        total_tests,
        passed,
        failed,
        certified,
        summary,
        created_at
      FROM sales_bench_parity_certifications
      ORDER BY created_at DESC
      LIMIT 1
    `);

    // Get recent test counts
    const countsResult = await pool.query(`
      SELECT
        parity,
        COUNT(*) as count
      FROM sales_bench_parity_results
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY parity
    `);

    const counts = countsResult.rows.reduce((acc, row) => {
      acc[row.parity] = parseInt(row.count);
      return acc;
    }, { PASS: 0, FAIL: 0 });

    res.json({
      success: true,
      latest_certification: certResult.rows[0] || null,
      last_7_days: counts,
      status: certResult.rows[0]?.certified ? 'CERTIFIED' : 'NOT_CERTIFIED',
    });
  } catch (error) {
    console.error('[PARITY] Status error:', error);
    res.status(500).json({
      success: false,
      error: 'STATUS_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/parity/results
 * Get recent parity test results
 */
router.get('/results', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const results = await pool.query(`
      SELECT
        test_id,
        test_case,
        parity,
        path_a_outcome,
        path_b_outcome,
        path_a_trace,
        path_b_trace,
        diffs,
        latency_ms,
        created_at
      FROM sales_bench_parity_results
      ORDER BY created_at DESC
      LIMIT $1
    `, [Math.min(parseInt(limit), 100)]);

    res.json({
      success: true,
      count: results.rows.length,
      results: results.rows,
    });
  } catch (error) {
    console.error('[PARITY] Results error:', error);
    res.status(500).json({
      success: false,
      error: 'RESULTS_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/parity/results/:testId
 * Get detailed result for a specific test
 */
router.get('/results/:testId', async (req, res) => {
  try {
    const { testId } = req.params;

    const result = await pool.query(`
      SELECT *
      FROM sales_bench_parity_results
      WHERE test_id = $1
    `, [testId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `Test ${testId} not found`,
      });
    }

    res.json({
      success: true,
      result: result.rows[0],
    });
  } catch (error) {
    console.error('[PARITY] Result detail error:', error);
    res.status(500).json({
      success: false,
      error: 'RESULT_DETAIL_FAILED',
      message: error.message,
    });
  }
});

export default router;
