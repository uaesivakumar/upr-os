/**
 * Silent Shadow Mode API
 *
 * Endpoints for shadow validation:
 * - POST /shadow/run - Run shadow discovery on companies
 * - GET /shadow/report - Generate Founder Trust Report
 *
 * NO ACTION TAKEN. Log only.
 *
 * DISCOVERY_V1_FROZEN baseline — no modifications permitted.
 */

import express from 'express';
import { runShadowDiscovery, runShadowBatch } from '../../../os/sales-bench/shadow-mode/shadow-validator.js';
import { generateWeeklyReport, generateMarkdownReport, saveReport } from '../../../os/sales-bench/shadow-mode/founder-trust-report.js';
import pool from '../../../server/db.js';

const router = express.Router();

/**
 * POST /api/os/sales-bench/shadow/run
 * Run shadow discovery on a single company or batch
 *
 * Body:
 * - company: Single company object
 * - companies: Array of company objects
 *
 * Returns logged decisions (no action taken)
 */
router.post('/run', async (req, res) => {
  try {
    const { company, companies } = req.body;

    if (!company && !companies) {
      return res.status(400).json({
        success: false,
        error: 'COMPANY_REQUIRED',
        message: 'Provide company or companies array',
      });
    }

    if (company) {
      const decision = await runShadowDiscovery(company);
      return res.json({
        success: true,
        mode: 'shadow',
        action_taken: false, // SILENT
        decision,
      });
    }

    if (companies) {
      const results = await runShadowBatch(companies);
      return res.json({
        success: true,
        mode: 'shadow',
        action_taken: false, // SILENT
        summary: {
          ACT: results.ACT.length,
          WAIT: results.WAIT.length,
          IGNORE: results.IGNORE.length,
          BLOCK: results.BLOCK.length,
        },
        decisions: results,
      });
    }
  } catch (error) {
    console.error('[SHADOW] Run error:', error);
    res.status(500).json({
      success: false,
      error: 'SHADOW_RUN_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/shadow/report
 * Generate Founder Trust Report
 *
 * Query:
 * - format: 'json' | 'markdown' (default: json)
 * - save: 'true' to save to file
 * - week_start: ISO date for week start
 */
router.get('/report', async (req, res) => {
  try {
    const { format = 'json', save, week_start } = req.query;

    const weekStart = week_start ? new Date(week_start) : null;

    if (format === 'markdown') {
      const report = await generateMarkdownReport(weekStart);

      if (save === 'true') {
        const filepath = await saveReport(weekStart);
        return res.json({
          success: true,
          format: 'markdown',
          saved_to: filepath,
          report,
        });
      }

      return res.type('text/markdown').send(report);
    }

    // JSON format
    const report = await generateWeeklyReport(weekStart);
    res.json({
      success: true,
      format: 'json',
      report,
    });
  } catch (error) {
    console.error('[SHADOW] Report error:', error);
    res.status(500).json({
      success: false,
      error: 'REPORT_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/shadow/status
 * Get shadow mode status and recent decisions
 */
router.get('/status', async (req, res) => {
  try {
    // Get decision counts for last 7 days
    const countsResult = await pool.query(`
      SELECT
        decision,
        COUNT(*) as count
      FROM sales_bench_shadow_decisions
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      GROUP BY decision
    `);

    const counts = countsResult.rows.reduce((acc, row) => {
      acc[row.decision] = parseInt(row.count);
      return acc;
    }, { ACT: 0, WAIT: 0, IGNORE: 0, BLOCK: 0 });

    // Get total count
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total FROM sales_bench_shadow_decisions
    `);

    // Get suite freeze status
    const suiteResult = await pool.query(`
      SELECT
        s.suite_key,
        s.is_frozen,
        s.frozen_at,
        s.version_notes,
        ss.status
      FROM sales_bench_suites s
      JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.suite_key = 'banking-eb-uae-pre-entry-discovery'
    `);

    res.json({
      success: true,
      shadow_mode: 'ACTIVE',
      suite_status: suiteResult.rows[0] || null,
      last_7_days: counts,
      total_decisions: parseInt(totalResult.rows[0]?.total || 0),
      constraints: {
        threshold_changes: 'FORBIDDEN',
        logic_modifications: 'FORBIDDEN',
        scenario_changes: 'FORBIDDEN',
        outreach_automation: 'FORBIDDEN',
      },
      purpose: 'Observe SIVA behavior. Build trust. Earn confidence.',
    });
  } catch (error) {
    console.error('[SHADOW] Status error:', error);
    res.status(500).json({
      success: false,
      error: 'STATUS_FAILED',
      message: error.message,
    });
  }
});

export default router;
