/**
 * Sales-Bench Governance Command API
 * Super Admin Trigger Endpoints
 *
 * Authority: OS executes
 * Visibility: Super Admin triggers
 *
 * Command-style endpoints for governance actions:
 * - /commands/run-system-validation  - Trigger system validation run
 * - /commands/start-human-calibration - Start human calibration session
 * - /commands/approve-for-ga - Approve suite for GA (after human validation)
 * - /commands/deprecate-suite - Deprecate a suite
 * - /commands/archive-run - Archive run artifacts
 */

import express from 'express';
import { randomBytes } from 'crypto';
import pool from '../../../server/db.js';

const router = express.Router();

/**
 * POST /api/os/sales-bench/governance/commands/run-system-validation
 * Trigger system validation run for a suite
 *
 * Super Admin triggers → OS executes
 */
router.post('/commands/run-system-validation', async (req, res) => {
  try {
    const { suite_key, run_mode = 'FULL', triggered_by, environment = 'PRODUCTION' } = req.body;

    if (!suite_key) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_KEY_REQUIRED',
        message: 'suite_key is required',
      });
    }

    // Get suite and validate state
    const suiteResult = await pool.query(`
      SELECT s.*, ss.status
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.suite_key = $1 AND s.is_active = true
    `, [suite_key]);

    if (suiteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
        command: 'run-system-validation',
      });
    }

    const suite = suiteResult.rows[0];

    // Validate preconditions
    if (!suite.is_frozen) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_NOT_FROZEN',
        command: 'run-system-validation',
        message: 'Suite must be frozen before running system validation',
        action_required: 'FREEZE_SUITE',
      });
    }

    // Get next run number
    const nextRunResult = await pool.query(
      `SELECT COALESCE(MAX(run_number), 0) + 1 AS next_run FROM sales_bench_runs WHERE suite_id = $1`,
      [suite.id]
    );
    const runNumber = nextRunResult.rows[0].next_run;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create run record
      const runResult = await client.query(`
        INSERT INTO sales_bench_runs (
          suite_id, suite_key, run_number, run_mode,
          scenario_manifest_hash, siva_version, code_commit_sha,
          environment, triggered_by, trigger_source,
          scenario_count, golden_count, kill_count,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'SUPER_ADMIN', $10, $11, $12, 'RUNNING')
        RETURNING *
      `, [
        suite.id, suite_key, runNumber, run_mode,
        suite.scenario_manifest_hash, '1.0.0', 'unknown',
        environment, triggered_by || 'SUPER_ADMIN',
        suite.scenario_count, Math.floor(suite.scenario_count / 2), Math.floor(suite.scenario_count / 2),
      ]);

      // Audit log
      await client.query(`
        INSERT INTO sales_bench_audit_log (suite_id, run_id, event_type, event_description, actor, actor_role)
        VALUES ($1, $2, 'RUN_STARTED', $3, $4, 'SUPER_ADMIN')
      `, [suite.id, runResult.rows[0].id, `System validation run #${runNumber} started (${run_mode})`, triggered_by || 'SUPER_ADMIN']);

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        command: 'run-system-validation',
        data: {
          run_id: runResult.rows[0].id,
          run_number: runNumber,
          suite_key,
          run_mode,
          status: 'RUNNING',
        },
        message: `System validation run #${runNumber} started`,
        next_step: 'Poll /api/os/sales-bench/suites/${suite_key}/history for run status',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[SALES_BENCH] run-system-validation error:', error);
    res.status(500).json({
      success: false,
      command: 'run-system-validation',
      error: 'COMMAND_FAILED',
      message: error.message,
    });
  }
});

/**
 * Generate URL-safe token for evaluator access
 */
function generateToken() {
  return randomBytes(48).toString('base64url');
}

/**
 * POST /api/os/sales-bench/governance/commands/start-human-calibration
 * Start human calibration session for a suite with email-based evaluator invites
 *
 * Super Admin triggers → OS executes
 * Requires: SYSTEM_VALIDATED status
 *
 * Flow:
 * 1. Create session with evaluator invites
 * 2. Generate unique tokens for each evaluator
 * 3. Return invite URLs (Super Admin or system sends emails)
 * 4. Evaluators access scoring page via token (no login required)
 */
router.post('/commands/start-human-calibration', async (req, res) => {
  try {
    const { suite_key, session_name, evaluator_count, evaluator_emails, triggered_by, deadline_days = 7 } = req.body;

    if (!suite_key) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_KEY_REQUIRED',
        command: 'start-human-calibration',
      });
    }

    // Validate evaluator emails
    const emails = evaluator_emails || [];
    const effectiveCount = evaluator_count || emails.length;

    if (effectiveCount < 2) {
      return res.status(400).json({
        success: false,
        error: 'EVALUATOR_COUNT_REQUIRED',
        command: 'start-human-calibration',
        message: 'At least 2 evaluators required for ICC/Spearman computation',
      });
    }

    if (emails.length > 0 && emails.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'INSUFFICIENT_EMAILS',
        command: 'start-human-calibration',
        message: 'Please provide at least 2 evaluator emails',
      });
    }

    // Get suite and validate state
    const suiteResult = await pool.query(`
      SELECT s.*, ss.status
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.suite_key = $1 AND s.is_active = true
    `, [suite_key]);

    if (suiteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
        command: 'start-human-calibration',
      });
    }

    const suite = suiteResult.rows[0];

    // Validate preconditions
    if (suite.status !== 'SYSTEM_VALIDATED') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        command: 'start-human-calibration',
        message: 'Suite must be SYSTEM_VALIDATED before human calibration',
        current_status: suite.status,
        action_required: suite.status === 'DRAFT' ? 'RUN_SYSTEM_VALIDATION' : null,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate deadline
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + deadline_days);

      // Create human calibration session
      const sessionResult = await client.query(`
        INSERT INTO sales_bench_human_sessions (
          suite_id, session_name, evaluator_count, deadline, created_by
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        suite.id,
        session_name || `Calibration ${new Date().toISOString().split('T')[0]}`,
        effectiveCount,
        deadline,
        triggered_by || 'SUPER_ADMIN'
      ]);

      const session = sessionResult.rows[0];

      // Get scenarios for this suite
      const scenariosResult = await client.query(`
        SELECT scenario_id FROM sales_bench_suite_scenarios
        WHERE suite_id = $1
        ORDER BY sequence_order
      `, [suite.id]);

      const scenarioIds = scenariosResult.rows.map(r => r.scenario_id);

      // Create evaluator invites if emails provided
      const invites = [];
      const baseUrl = process.env.SAAS_BASE_URL || 'https://upr.sivakumar.ai';

      for (let i = 0; i < emails.length; i++) {
        const email = emails[i].trim().toLowerCase();
        const evaluatorId = `EVAL_${i + 1}`;
        const token = generateToken();
        const expiresAt = new Date(deadline);
        expiresAt.setDate(expiresAt.getDate() + 1); // Expires 1 day after deadline

        const inviteResult = await client.query(`
          INSERT INTO sales_bench_evaluator_invites (
            session_id, evaluator_id, email, token, scenarios_assigned, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [session.id, evaluatorId, email, token, scenarioIds.length, expiresAt]);

        const invite = inviteResult.rows[0];

        // Create scenario queue for this evaluator (shuffled order for bias reduction)
        const shuffledScenarios = [...scenarioIds];
        // Seeded shuffle based on evaluator index for reproducibility
        for (let j = shuffledScenarios.length - 1; j > 0; j--) {
          const seed = (i + 1) * 12345 + j;
          const k = Math.floor(((seed * 9301 + 49297) % 233280) / 233280 * (j + 1));
          [shuffledScenarios[j], shuffledScenarios[k]] = [shuffledScenarios[k], shuffledScenarios[j]];
        }

        for (let q = 0; q < shuffledScenarios.length; q++) {
          await client.query(`
            INSERT INTO sales_bench_evaluator_scenario_queue (
              invite_id, scenario_id, queue_position
            ) VALUES ($1, $2, $3)
          `, [invite.id, shuffledScenarios[q], q + 1]);
        }

        invites.push({
          evaluator_id: evaluatorId,
          email: email,
          token: token,
          scoring_url: `${baseUrl}/evaluate/${token}`,
          scenarios_to_score: scenarioIds.length,
          expires_at: expiresAt.toISOString(),
        });
      }

      // Update session with invite count
      if (invites.length > 0) {
        await client.query(`
          UPDATE sales_bench_human_sessions
          SET invites_sent = $2
          WHERE id = $1
        `, [session.id, invites.length]);
      }

      // Audit log
      await client.query(`
        INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role, after_state)
        VALUES ($1, 'HUMAN_CALIBRATION_STARTED', $2, $3, 'SUPER_ADMIN', $4)
      `, [
        suite.id,
        `Human calibration session started with ${effectiveCount} evaluators`,
        triggered_by || 'SUPER_ADMIN',
        JSON.stringify({ session_id: session.id, invites: invites.length, deadline: deadline.toISOString() })
      ]);

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        command: 'start-human-calibration',
        data: {
          session_id: session.id,
          suite_key,
          evaluator_count: effectiveCount,
          status: 'IN_PROGRESS',
          deadline: deadline.toISOString(),
          invites: invites,
        },
        message: `Human calibration session started. ${invites.length > 0 ? `Send the scoring URLs to evaluators.` : 'Add evaluators via API.'}`,
        next_steps: invites.length > 0 ? [
          'Send scoring URLs to evaluators via email',
          'Evaluators click link and score scenarios (no login required)',
          'Monitor progress via /api/os/sales-bench/calibration/session/:id',
          'Correlation computed automatically when all complete',
        ] : [
          'Use calibration API to add evaluators',
          'Record human scores via submit endpoint',
        ],
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[SALES_BENCH] start-human-calibration error:', error);
    res.status(500).json({
      success: false,
      command: 'start-human-calibration',
      error: 'COMMAND_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/governance/commands/approve-for-ga
 * Approve suite for GA (after human validation)
 *
 * Super Admin triggers → OS executes
 * Requires: HUMAN_VALIDATED status
 */
router.post('/commands/approve-for-ga', async (req, res) => {
  try {
    const { suite_key, approved_by, approval_notes } = req.body;

    if (!suite_key) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_KEY_REQUIRED',
        command: 'approve-for-ga',
      });
    }

    if (!approved_by) {
      return res.status(400).json({
        success: false,
        error: 'APPROVED_BY_REQUIRED',
        command: 'approve-for-ga',
        message: 'approved_by is required (must be CALIBRATION_ADMIN)',
      });
    }

    // Get suite and validate state
    const suiteResult = await pool.query(`
      SELECT s.*, ss.status, ss.spearman_rho
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.suite_key = $1 AND s.is_active = true
    `, [suite_key]);

    if (suiteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
        command: 'approve-for-ga',
      });
    }

    const suite = suiteResult.rows[0];

    // Validate preconditions - MUST be HUMAN_VALIDATED
    if (suite.status !== 'HUMAN_VALIDATED') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        command: 'approve-for-ga',
        message: 'Suite must be HUMAN_VALIDATED before GA approval',
        current_status: suite.status,
        action_required: suite.status === 'SYSTEM_VALIDATED' ? 'START_HUMAN_CALIBRATION' : 'RUN_SYSTEM_VALIDATION',
        gating_rule: 'Human validation is MANDATORY for GA (PRD v1.3)',
      });
    }

    // Validate Spearman correlation meets threshold
    if (suite.spearman_rho && parseFloat(suite.spearman_rho) < 0.60) {
      return res.status(400).json({
        success: false,
        error: 'CORRELATION_TOO_LOW',
        command: 'approve-for-ga',
        message: 'Spearman correlation below acceptable threshold (0.60)',
        current_rho: suite.spearman_rho,
        required_rho: 0.60,
        action_required: 'Review calibration data or retrain model',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update status to GA_APPROVED
      await client.query(`
        UPDATE sales_bench_suite_status
        SET status = 'GA_APPROVED', ga_approved_at = NOW(), approved_by = $2, approval_notes = $3
        WHERE suite_id = $1
      `, [suite.id, approved_by, approval_notes]);

      // Audit log
      await client.query(`
        INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role, after_state)
        VALUES ($1, 'GA_APPROVED', $2, $3, 'CALIBRATION_ADMIN', $4)
      `, [
        suite.id,
        `Suite approved for GA. Spearman ρ = ${suite.spearman_rho || 'N/A'}`,
        approved_by,
        JSON.stringify({ status: 'GA_APPROVED', approved_by, approval_notes }),
      ]);

      await client.query('COMMIT');

      res.json({
        success: true,
        command: 'approve-for-ga',
        data: {
          suite_key,
          status: 'GA_APPROVED',
          approved_by,
          approved_at: new Date().toISOString(),
          spearman_rho: suite.spearman_rho,
        },
        message: 'Suite approved for GA',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[SALES_BENCH] approve-for-ga error:', error);
    res.status(500).json({
      success: false,
      command: 'approve-for-ga',
      error: 'COMMAND_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/governance/commands/deprecate-suite
 * Deprecate a suite (remove from active use)
 *
 * Super Admin triggers → OS executes
 */
router.post('/commands/deprecate-suite', async (req, res) => {
  try {
    const { suite_key, deprecated_by, deprecation_reason } = req.body;

    if (!suite_key || !deprecated_by || !deprecation_reason) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        command: 'deprecate-suite',
        required: ['suite_key', 'deprecated_by', 'deprecation_reason'],
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get suite
      const suiteResult = await client.query(
        `SELECT id FROM sales_bench_suites WHERE suite_key = $1 AND is_active = true`,
        [suite_key]
      );

      if (suiteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'SUITE_NOT_FOUND',
          command: 'deprecate-suite',
        });
      }

      const suiteId = suiteResult.rows[0].id;

      // Deprecate suite
      await client.query(`
        UPDATE sales_bench_suites SET is_active = false WHERE id = $1
      `, [suiteId]);

      // Update status
      await client.query(`
        UPDATE sales_bench_suite_status
        SET status = 'DEPRECATED', deprecated_at = NOW(), deprecated_by = $2, deprecation_reason = $3
        WHERE suite_id = $1
      `, [suiteId, deprecated_by, deprecation_reason]);

      // Audit log
      await client.query(`
        INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role)
        VALUES ($1, 'SUITE_DEPRECATED', $2, $3, 'CALIBRATION_ADMIN')
      `, [suiteId, `Suite deprecated: ${deprecation_reason}`, deprecated_by]);

      await client.query('COMMIT');

      res.json({
        success: true,
        command: 'deprecate-suite',
        data: {
          suite_key,
          status: 'DEPRECATED',
          deprecated_by,
          deprecated_at: new Date().toISOString(),
        },
        message: 'Suite deprecated',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[SALES_BENCH] deprecate-suite error:', error);
    res.status(500).json({
      success: false,
      command: 'deprecate-suite',
      error: 'COMMAND_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/governance/commands/create-version
 * Create a new version of a suite
 *
 * Copies scenarios from source suite to new version.
 * New version starts in DRAFT status.
 */
router.post('/commands/create-version', async (req, res) => {
  try {
    const { suite_key, version_notes, created_by } = req.body;

    if (!suite_key) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_KEY_REQUIRED',
        command: 'create-version',
      });
    }

    // Get source suite
    const suiteResult = await pool.query(`
      SELECT id, suite_key, name, version, base_suite_key
      FROM sales_bench_suites
      WHERE suite_key = $1 AND is_active = true
    `, [suite_key]);

    if (suiteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
        command: 'create-version',
      });
    }

    const sourceSuite = suiteResult.rows[0];

    // Create new version using database function
    const newVersionResult = await pool.query(`
      SELECT sales_bench_create_suite_version($1, $2, $3) AS new_suite_id
    `, [sourceSuite.id, version_notes, created_by || 'SUPER_ADMIN']);

    const newSuiteId = newVersionResult.rows[0].new_suite_id;

    // Get new suite details
    const newSuiteResult = await pool.query(`
      SELECT s.*, ss.status
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.id = $1
    `, [newSuiteId]);

    const newSuite = newSuiteResult.rows[0];

    // Audit log
    await pool.query(`
      INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role, after_state)
      VALUES ($1, 'VERSION_CREATED', $2, $3, 'SUPER_ADMIN', $4)
    `, [
      newSuiteId,
      `Created version ${newSuite.version} from ${sourceSuite.suite_key}`,
      created_by || 'SUPER_ADMIN',
      JSON.stringify({ source_suite_key: sourceSuite.suite_key, new_version: newSuite.version })
    ]);

    res.status(201).json({
      success: true,
      command: 'create-version',
      data: {
        new_suite_id: newSuiteId,
        new_suite_key: newSuite.suite_key,
        version: newSuite.version,
        base_suite_key: newSuite.base_suite_key,
        status: newSuite.status,
        scenario_count: newSuite.scenario_count,
        source_suite_key: sourceSuite.suite_key,
      },
      message: `Created version ${newSuite.version} of ${newSuite.base_suite_key}`,
      next_step: 'Modify scenarios as needed, then freeze and validate',
    });
  } catch (error) {
    console.error('[SALES_BENCH] create-version error:', error);
    res.status(500).json({
      success: false,
      command: 'create-version',
      error: 'COMMAND_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/governance/versions/:base_suite_key
 * Get all versions of a suite
 */
router.get('/versions/:base_suite_key', async (req, res) => {
  try {
    const { base_suite_key } = req.params;

    const versionsResult = await pool.query(`
      SELECT
        s.id,
        s.suite_key,
        s.name,
        s.version,
        s.is_latest_version,
        s.version_notes,
        s.version_created_at,
        s.scenario_count,
        s.is_frozen,
        ss.status,
        ss.system_validated_at,
        ss.human_validated_at,
        ss.ga_approved_at
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.base_suite_key = $1 AND s.is_active = true
      ORDER BY s.version DESC
    `, [base_suite_key]);

    res.json({
      success: true,
      data: {
        base_suite_key,
        total_versions: versionsResult.rows.length,
        versions: versionsResult.rows,
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] get versions error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/governance/status
 * Get overall governance status (dashboard data)
 */
router.get('/status', async (req, res) => {
  try {
    // Get suite counts by status
    const statusCounts = await pool.query(`
      SELECT ss.status, COUNT(*) as count
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.is_active = true
      GROUP BY ss.status
    `);

    // Get recent runs
    const recentRuns = await pool.query(`
      SELECT r.suite_key, r.run_number, r.status, r.golden_pass_rate, r.kill_containment_rate, r.started_at
      FROM sales_bench_runs r
      ORDER BY r.started_at DESC
      LIMIT 5
    `);

    // Get recent audit events
    const recentEvents = await pool.query(`
      SELECT a.event_type, a.event_description, a.actor, a.created_at, s.suite_key
      FROM sales_bench_audit_log a
      LEFT JOIN sales_bench_suites s ON s.id = a.suite_id
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        status_summary: statusCounts.rows.reduce((acc, row) => {
          acc[row.status || 'UNKNOWN'] = parseInt(row.count);
          return acc;
        }, {}),
        recent_runs: recentRuns.rows,
        recent_events: recentEvents.rows,
        governance_model: {
          authority: 'OS',
          visibility: 'SUPER_ADMIN',
          human_validation: 'MANDATORY_FOR_GA',
        },
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] governance status error:', error);
    res.status(500).json({
      success: false,
      error: 'STATUS_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/governance/commands
 * List available governance commands
 */
router.get('/commands', (req, res) => {
  res.json({
    success: true,
    commands: [
      {
        command: 'run-system-validation',
        method: 'POST',
        path: '/api/os/sales-bench/governance/commands/run-system-validation',
        description: 'Trigger system validation run for a suite',
        requires: ['suite_key'],
        preconditions: ['Suite must be FROZEN'],
      },
      {
        command: 'start-human-calibration',
        method: 'POST',
        path: '/api/os/sales-bench/governance/commands/start-human-calibration',
        description: 'Start human calibration session',
        requires: ['suite_key', 'evaluator_count'],
        preconditions: ['Suite must be SYSTEM_VALIDATED'],
      },
      {
        command: 'approve-for-ga',
        method: 'POST',
        path: '/api/os/sales-bench/governance/commands/approve-for-ga',
        description: 'Approve suite for GA (production use)',
        requires: ['suite_key', 'approved_by'],
        preconditions: ['Suite must be HUMAN_VALIDATED', 'Spearman ρ ≥ 0.60'],
      },
      {
        command: 'deprecate-suite',
        method: 'POST',
        path: '/api/os/sales-bench/governance/commands/deprecate-suite',
        description: 'Deprecate a suite',
        requires: ['suite_key', 'deprecated_by', 'deprecation_reason'],
        preconditions: [],
      },
    ],
    governance_flow: [
      '1. Create suite → status: DRAFT',
      '2. Freeze suite → scenarios immutable',
      '3. Run system validation → status: SYSTEM_VALIDATED',
      '4. Start human calibration → collect RM scores',
      '5. Complete calibration → status: HUMAN_VALIDATED',
      '6. Approve for GA → status: GA_APPROVED',
    ],
    authority_model: {
      OS: 'Executes all logic, owns data',
      SUPER_ADMIN: 'Triggers commands, views status (read-only)',
    },
  });
});

export default router;
