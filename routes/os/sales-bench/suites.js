/**
 * Sales-Bench Suite Governance API
 * S241-S248 Governance Layer
 *
 * Authority: OS (execution + evaluation)
 * Visibility: Super Admin (read-only + trigger)
 *
 * Endpoints:
 * - GET    /api/os/sales-bench/suites                  - List all suites
 * - GET    /api/os/sales-bench/suites/:key             - Get suite by key
 * - POST   /api/os/sales-bench/suites                  - Create suite
 * - PATCH  /api/os/sales-bench/suites/:key/freeze      - Freeze suite (make immutable)
 * - GET    /api/os/sales-bench/suites/:key/status      - Get suite validation status
 * - POST   /api/os/sales-bench/suites/:key/validate    - Trigger validation run
 * - GET    /api/os/sales-bench/suites/:key/history     - Get run history
 * - GET    /api/os/sales-bench/suites/:key/audit       - Get audit trail
 */

import express from 'express';
import pool from '../../../server/db.js';

const router = express.Router();

/**
 * GET /api/os/sales-bench/suites
 * List all benchmark suites with optional filters
 * Super Admin: Read-only visibility
 */
router.get('/', async (req, res) => {
  try {
    const { vertical, sub_vertical, region, status, frozen_only } = req.query;

    let query = `
      SELECT
        s.id,
        s.suite_key,
        s.name,
        s.description,
        v.key AS vertical,
        sv.key AS sub_vertical,
        s.region_code AS region,
        s.stage,
        COALESCE(ss.status, 'DRAFT') AS status,
        s.scenario_count,
        s.is_frozen,
        s.frozen_at,
        ss.system_validated_at,
        ss.human_validated_at,
        ss.ga_approved_at,
        ss.spearman_rho,
        s.created_at,
        (
          SELECT json_build_object(
            'golden_pass_rate', r.golden_pass_rate / 100.0,
            'kill_containment_rate', r.kill_containment_rate / 100.0,
            'cohens_d', r.cohens_d
          )
          FROM sales_bench_runs r
          WHERE r.suite_id = s.id AND r.status = 'COMPLETED'
          ORDER BY r.created_at DESC
          LIMIT 1
        ) AS last_run_result
      FROM sales_bench_suites s
      LEFT JOIN os_verticals v ON v.id = s.vertical_id
      LEFT JOIN os_sub_verticals sv ON sv.id = s.sub_vertical_id
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.is_active = true
    `;

    const params = [];
    let paramIndex = 1;

    if (vertical) {
      query += ` AND v.key = $${paramIndex++}`;
      params.push(vertical);
    }

    if (sub_vertical) {
      query += ` AND sv.key = $${paramIndex++}`;
      params.push(sub_vertical);
    }

    if (region) {
      query += ` AND s.region_code = $${paramIndex++}`;
      params.push(region);
    }

    if (status) {
      query += ` AND ss.status = $${paramIndex++}`;
      params.push(status);
    }

    if (frozen_only === 'true') {
      query += ` AND s.is_frozen = true`;
    }

    query += ` ORDER BY s.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      suites: result.rows,
      data: result.rows,  // Also keep data for backwards compat
      count: result.rows.length,
      filters: { vertical, sub_vertical, region, status, frozen_only },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Suite list error:', error);
    res.status(500).json({
      success: false,
      error: 'SUITE_LIST_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/suites/:key
 * Get suite by key with full details
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;

    const result = await pool.query(`
      SELECT
        s.*,
        v.key AS vertical,
        sv.key AS sub_vertical,
        COALESCE(ss.status, 'DRAFT') AS status,
        ss.system_validated_at,
        ss.system_metrics,
        ss.human_validated_at,
        ss.human_sample_n,
        ss.spearman_rho,
        ss.icc_score,
        ss.human_metrics,
        ss.ga_approved_at,
        ss.approved_by,
        ss.approval_notes
      FROM sales_bench_suites s
      LEFT JOIN os_verticals v ON v.id = s.vertical_id
      LEFT JOIN os_sub_verticals sv ON sv.id = s.sub_vertical_id
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.suite_key = $1
    `, [key]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
        message: `Suite '${key}' not found`,
      });
    }

    const suite = result.rows[0];

    // Get latest run metrics
    const latestRun = await pool.query(`
      SELECT
        run_number,
        started_at,
        golden_pass_rate,
        kill_containment_rate,
        cohens_d,
        status
      FROM sales_bench_runs
      WHERE suite_key = $1 AND status = 'COMPLETED'
      ORDER BY run_number DESC
      LIMIT 1
    `, [key]);

    res.json({
      success: true,
      data: {
        ...suite,
        latest_run: latestRun.rows[0] || null,
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Suite get error:', error);
    res.status(500).json({
      success: false,
      error: 'SUITE_GET_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/suites
 * Create a new benchmark suite
 * OS Authority: Only OS can create suites
 */
router.post('/', async (req, res) => {
  try {
    const {
      suite_key,
      name,
      description,
      vertical,
      sub_vertical,
      region_code,
      stage,
      scenario_manifest_hash,
      scenario_count,
      created_by,
    } = req.body;

    // Validate required fields
    const required = ['suite_key', 'name', 'vertical', 'sub_vertical', 'region_code', 'stage'];
    const missing = required.filter(f => !req.body[f]);
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        missing,
      });
    }

    // Validate stage
    if (!['PRE_ENTRY', 'POST_ENTRY'].includes(stage)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STAGE',
        message: 'Stage must be PRE_ENTRY or POST_ENTRY',
      });
    }

    // Look up vertical and sub_vertical IDs
    const verticalResult = await pool.query(
      `SELECT id FROM os_verticals WHERE slug = $1`,
      [vertical]
    );
    if (verticalResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_NOT_FOUND',
        message: `Vertical '${vertical}' not found`,
      });
    }

    const subVerticalResult = await pool.query(
      `SELECT id FROM os_sub_verticals WHERE key = $1 AND vertical_id = $2`,
      [sub_vertical, verticalResult.rows[0].id]
    );
    if (subVerticalResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'SUB_VERTICAL_NOT_FOUND',
        message: `Sub-vertical '${sub_vertical}' not found for vertical '${vertical}'`,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create suite
      const suiteResult = await client.query(`
        INSERT INTO sales_bench_suites (
          suite_key, name, description,
          vertical_id, sub_vertical_id, region_code,
          stage, scenario_manifest_hash, scenario_count,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        suite_key, name, description,
        verticalResult.rows[0].id, subVerticalResult.rows[0].id, region_code,
        stage, scenario_manifest_hash, scenario_count || 0,
        created_by || 'OS',
      ]);

      const suite = suiteResult.rows[0];

      // Create initial status
      await client.query(`
        INSERT INTO sales_bench_suite_status (suite_id, status)
        VALUES ($1, 'DRAFT')
      `, [suite.id]);

      // Create audit log entry
      await client.query(`
        INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role)
        VALUES ($1, 'SUITE_CREATED', $2, $3, 'SYSTEM')
      `, [suite.id, `Suite '${suite_key}' created`, created_by || 'OS']);

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        data: suite,
        message: 'Suite created successfully',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'SUITE_EXISTS',
        message: 'A suite with this key already exists',
      });
    }

    console.error('[SALES_BENCH] Suite create error:', error);
    res.status(500).json({
      success: false,
      error: 'SUITE_CREATE_FAILED',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/os/sales-bench/suites/:key/freeze
 * Freeze suite (make scenarios immutable)
 * OS Authority: Only OS can freeze suites
 */
router.patch('/:key/freeze', async (req, res) => {
  try {
    const { key } = req.params;
    const { frozen_by } = req.body;

    const result = await pool.query(`
      UPDATE sales_bench_suites
      SET is_frozen = true, frozen_at = NOW(), frozen_by = $2
      WHERE suite_key = $1 AND is_frozen = false
      RETURNING *
    `, [key, frozen_by || 'OS']);

    if (result.rows.length === 0) {
      // Check if already frozen or not found
      const check = await pool.query(
        `SELECT is_frozen FROM sales_bench_suites WHERE suite_key = $1`,
        [key]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'SUITE_NOT_FOUND',
        });
      }

      if (check.rows[0].is_frozen) {
        return res.status(400).json({
          success: false,
          error: 'SUITE_ALREADY_FROZEN',
          message: 'Suite is already frozen',
        });
      }
    }

    // Add audit log
    await pool.query(`
      INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role)
      SELECT id, 'SUITE_FROZEN', 'Suite frozen - scenarios now immutable', $2, 'SYSTEM'
      FROM sales_bench_suites WHERE suite_key = $1
    `, [key, frozen_by || 'OS']);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Suite frozen successfully. Scenarios are now immutable.',
    });
  } catch (error) {
    console.error('[SALES_BENCH] Suite freeze error:', error);
    res.status(500).json({
      success: false,
      error: 'SUITE_FREEZE_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/suites/:key/status
 * Get suite validation status (for Super Admin visibility)
 */
router.get('/:key/status', async (req, res) => {
  try {
    const { key } = req.params;

    const result = await pool.query(`
      SELECT
        s.suite_key,
        s.name,
        s.is_frozen,
        ss.status,
        ss.system_validated_at,
        ss.system_metrics,
        ss.human_validated_at,
        ss.human_sample_n,
        ss.spearman_rho,
        ss.icc_score,
        ss.human_metrics,
        ss.ga_approved_at,
        ss.approved_by,
        ss.approval_notes,
        ss.deprecated_at,
        ss.deprecation_reason
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.suite_key = $1
    `, [key]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
      });
    }

    const status = result.rows[0];

    // Determine next required action
    let nextAction = null;
    if (!status.is_frozen) {
      nextAction = 'FREEZE_SUITE';
    } else if (status.status === 'DRAFT') {
      nextAction = 'RUN_SYSTEM_VALIDATION';
    } else if (status.status === 'SYSTEM_VALIDATED') {
      nextAction = 'RUN_HUMAN_CALIBRATION';
    } else if (status.status === 'HUMAN_VALIDATED') {
      nextAction = 'APPROVE_FOR_GA';
    }

    res.json({
      success: true,
      data: {
        ...status,
        next_action: nextAction,
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Suite status error:', error);
    res.status(500).json({
      success: false,
      error: 'SUITE_STATUS_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/suites/:key/validate
 * Trigger a validation run (system or human)
 * Super Admin triggers, OS executes
 */
router.post('/:key/validate', async (req, res) => {
  try {
    const { key } = req.params;
    const { run_mode, triggered_by, trigger_source, environment } = req.body;

    // Validate run_mode
    if (!['FULL', 'FOUNDER', 'QUICK'].includes(run_mode || 'FULL')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RUN_MODE',
        message: 'run_mode must be FULL, FOUNDER, or QUICK',
      });
    }

    // Get suite
    const suiteResult = await pool.query(`
      SELECT s.*, ss.status
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.suite_key = $1
    `, [key]);

    if (suiteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
      });
    }

    const suite = suiteResult.rows[0];

    if (!suite.is_frozen) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_NOT_FROZEN',
        message: 'Suite must be frozen before validation runs',
      });
    }

    // Get next run number
    const nextRunResult = await pool.query(
      `SELECT COALESCE(MAX(run_number), 0) + 1 AS next_run FROM sales_bench_runs WHERE suite_id = $1`,
      [suite.id]
    );
    const runNumber = nextRunResult.rows[0].next_run;

    // Create run record
    const runResult = await pool.query(`
      INSERT INTO sales_bench_runs (
        suite_id, suite_key, run_number, run_mode,
        scenario_manifest_hash, siva_version, code_commit_sha,
        environment, triggered_by, trigger_source,
        scenario_count, golden_count, kill_count,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'RUNNING')
      RETURNING *
    `, [
      suite.id, key, runNumber, run_mode || 'FULL',
      suite.scenario_manifest_hash, '1.0.0', 'unknown',
      environment || 'LOCAL', triggered_by || 'SUPER_ADMIN', trigger_source || 'API',
      suite.scenario_count, Math.floor(suite.scenario_count / 2), Math.floor(suite.scenario_count / 2),
    ]);

    // Add audit log
    await pool.query(`
      INSERT INTO sales_bench_audit_log (suite_id, run_id, event_type, event_description, actor, actor_role)
      VALUES ($1, $2, 'RUN_STARTED', $3, $4, 'SUPER_ADMIN')
    `, [suite.id, runResult.rows[0].id, `Run #${runNumber} started (${run_mode || 'FULL'})`, triggered_by || 'SUPER_ADMIN']);

    res.status(201).json({
      success: true,
      data: runResult.rows[0],
      message: `Validation run #${runNumber} started`,
      note: 'Run will execute asynchronously. Poll /runs/:id for status.',
    });
  } catch (error) {
    console.error('[SALES_BENCH] Suite validate error:', error);
    res.status(500).json({
      success: false,
      error: 'SUITE_VALIDATE_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/suites/:key/history
 * Get run history for suite (longitudinal tracking)
 */
router.get('/:key/history', async (req, res) => {
  try {
    const { key } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const result = await pool.query(`
      SELECT
        r.id,
        r.run_number,
        r.run_mode,
        r.siva_version,
        r.model_slug,
        r.environment,
        r.triggered_by,
        r.started_at,
        r.ended_at,
        r.duration_ms,
        r.scenario_count,
        r.pass_count,
        r.fail_count,
        r.block_count,
        r.golden_pass_rate,
        r.kill_containment_rate,
        r.cohens_d,
        r.status
      FROM sales_bench_runs r
      JOIN sales_bench_suites s ON s.id = r.suite_id
      WHERE s.suite_key = $1
      ORDER BY r.run_number DESC
      LIMIT $2 OFFSET $3
    `, [key, parseInt(limit), parseInt(offset)]);

    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM sales_bench_runs r
      JOIN sales_bench_suites s ON s.id = r.suite_id
      WHERE s.suite_key = $1
    `, [key]);

    // Calculate trend (compare last 2 runs)
    let trend = null;
    if (result.rows.length >= 2) {
      const latest = result.rows[0];
      const previous = result.rows[1];
      if (latest.golden_pass_rate && previous.golden_pass_rate) {
        const delta = latest.golden_pass_rate - previous.golden_pass_rate;
        trend = {
          direction: delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'STABLE',
          delta: delta.toFixed(2),
          latest_run: latest.run_number,
          previous_run: previous.run_number,
        };
      }
    }

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].total),
      trend,
      pagination: { limit: parseInt(limit), offset: parseInt(offset) },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Suite history error:', error);
    res.status(500).json({
      success: false,
      error: 'SUITE_HISTORY_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/suites/:key/audit
 * Get audit trail for suite (governance timeline)
 */
router.get('/:key/audit', async (req, res) => {
  try {
    const { key } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(`
      SELECT
        a.id,
        a.event_type,
        a.event_description,
        a.actor,
        a.actor_role,
        a.before_state,
        a.after_state,
        a.created_at
      FROM sales_bench_audit_log a
      JOIN sales_bench_suites s ON s.id = a.suite_id
      WHERE s.suite_key = $1
      ORDER BY a.created_at DESC
      LIMIT $2 OFFSET $3
    `, [key, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Suite audit error:', error);
    res.status(500).json({
      success: false,
      error: 'SUITE_AUDIT_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/suites/:key/approve
 * Approve suite for GA (after human validation)
 * Requires CALIBRATION_ADMIN role
 */
router.post('/:key/approve', async (req, res) => {
  try {
    const { key } = req.params;
    const { approved_by, approval_notes } = req.body;

    if (!approved_by) {
      return res.status(400).json({
        success: false,
        error: 'APPROVED_BY_REQUIRED',
        message: 'approved_by is required',
      });
    }

    // Get current status
    const statusResult = await pool.query(`
      SELECT ss.status, s.id
      FROM sales_bench_suite_status ss
      JOIN sales_bench_suites s ON s.id = ss.suite_id
      WHERE s.suite_key = $1
    `, [key]);

    if (statusResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
      });
    }

    if (statusResult.rows[0].status !== 'HUMAN_VALIDATED') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS_TRANSITION',
        message: 'Suite must be HUMAN_VALIDATED before GA approval',
        current_status: statusResult.rows[0].status,
      });
    }

    // Update status
    await pool.query(`
      UPDATE sales_bench_suite_status
      SET status = 'GA_APPROVED', ga_approved_at = NOW(), approved_by = $2, approval_notes = $3
      WHERE suite_id = $1
    `, [statusResult.rows[0].id, approved_by, approval_notes]);

    // Add audit log
    await pool.query(`
      INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role)
      VALUES ($1, 'GA_APPROVED', $2, $3, 'CALIBRATION_ADMIN')
    `, [statusResult.rows[0].id, `Suite approved for GA: ${approval_notes || 'No notes'}`, approved_by]);

    res.json({
      success: true,
      message: 'Suite approved for GA',
      approved_by,
      approved_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[SALES_BENCH] Suite approve error:', error);
    res.status(500).json({
      success: false,
      error: 'SUITE_APPROVE_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/suites/overview
 * Get overview of all suites with status (for Super Admin dashboard)
 */
router.get('/dashboard/overview', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM v_sales_bench_suite_overview
      ORDER BY suite_key
    `);

    // Group by vertical/sub_vertical/region
    const grouped = {};
    for (const row of result.rows) {
      const key = `${row.vertical}/${row.sub_vertical}/${row.region_code}`;
      if (!grouped[key]) {
        grouped[key] = {
          vertical: row.vertical,
          sub_vertical: row.sub_vertical,
          region: row.region_code,
          suites: [],
        };
      }
      grouped[key].suites.push(row);
    }

    res.json({
      success: true,
      data: {
        total_suites: result.rows.length,
        by_status: {
          DRAFT: result.rows.filter(r => r.status === 'DRAFT').length,
          SYSTEM_VALIDATED: result.rows.filter(r => r.status === 'SYSTEM_VALIDATED').length,
          HUMAN_VALIDATED: result.rows.filter(r => r.status === 'HUMAN_VALIDATED').length,
          GA_APPROVED: result.rows.filter(r => r.status === 'GA_APPROVED').length,
        },
        by_context: Object.values(grouped),
        suites: result.rows,
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Suite overview error:', error);
    res.status(500).json({
      success: false,
      error: 'SUITE_OVERVIEW_FAILED',
      message: error.message,
    });
  }
});

export default router;
