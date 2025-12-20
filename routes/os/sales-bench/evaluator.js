/**
 * Evaluator API for Human Calibration
 *
 * Endpoints for evaluators to access and score scenarios via token-based access.
 * No traditional auth required - access controlled by unique invite tokens.
 *
 * Endpoints:
 * - GET  /api/os/sales-bench/evaluator/:token - Get evaluator session and current scenario
 * - POST /api/os/sales-bench/evaluator/:token/score - Submit a score
 * - POST /api/os/sales-bench/evaluator/:token/skip - Skip current scenario
 * - GET  /api/os/sales-bench/evaluator/:token/progress - Get scoring progress
 */

import express from 'express';
import pool from '../../../server/db.js';

const router = express.Router();

/**
 * GET /api/os/sales-bench/evaluator/:token
 * Get evaluator session info and current scenario to score
 */
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Validate token and get invite
    const inviteResult = await pool.query(`
      SELECT
        i.*,
        s.id AS session_id,
        s.suite_id,
        s.session_name,
        s.deadline,
        s.status AS session_status,
        su.suite_key,
        su.name AS suite_name,
        su.description AS suite_description,
        v.name AS vertical_name,
        sv.name AS sub_vertical_name
      FROM sales_bench_evaluator_invites i
      JOIN sales_bench_human_sessions s ON s.id = i.session_id
      JOIN sales_bench_suites su ON su.id = s.suite_id
      LEFT JOIN os_verticals v ON v.key = su.vertical
      LEFT JOIN os_sub_verticals sv ON sv.key = su.sub_vertical
      WHERE i.token = $1
    `, [token]);

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'This evaluation link is invalid or has expired',
      });
    }

    const invite = inviteResult.rows[0];

    // Check if expired
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'This evaluation link has expired',
        expired_at: invite.expires_at,
      });
    }

    // Check if already completed
    if (invite.status === 'COMPLETED') {
      return res.json({
        success: true,
        data: {
          status: 'COMPLETED',
          message: 'You have completed all scenarios. Thank you for your participation!',
          evaluator_id: invite.evaluator_id,
          scenarios_completed: invite.scenarios_completed,
          completed_at: invite.completed_at,
        },
      });
    }

    // Update first access if not set
    if (!invite.first_accessed_at) {
      await pool.query(`
        UPDATE sales_bench_evaluator_invites
        SET first_accessed_at = NOW(), status = 'OPENED', user_agent = $2, ip_address = $3
        WHERE id = $1
      `, [invite.id, req.headers['user-agent'], req.ip]);
    }

    // Get current scenario from queue
    const queueResult = await pool.query(`
      SELECT
        q.*,
        sc.scenario_data,
        sc.expected_outcome,
        sc.path_type,
        sc.company_profile,
        sc.contact_profile,
        sc.signal_context,
        sc.persona_context
      FROM sales_bench_evaluator_scenario_queue q
      JOIN sales_bench.sales_scenarios sc ON sc.id = q.scenario_id
      WHERE q.invite_id = $1 AND q.status = 'PENDING'
      ORDER BY q.queue_position
      LIMIT 1
    `, [invite.id]);

    // Get progress
    const progressResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
        COUNT(*) AS total
      FROM sales_bench_evaluator_scenario_queue
      WHERE invite_id = $1
    `, [invite.id]);

    const progress = progressResult.rows[0];
    const completed = parseInt(progress.completed) || 0;
    const total = parseInt(progress.total) || 0;

    if (queueResult.rows.length === 0) {
      // All scenarios completed
      await pool.query(`
        UPDATE sales_bench_evaluator_invites
        SET status = 'COMPLETED', completed_at = NOW(), scenarios_completed = $2
        WHERE id = $1
      `, [invite.id, completed]);

      // Check if all evaluators completed
      await checkSessionCompletion(invite.session_id);

      return res.json({
        success: true,
        data: {
          status: 'COMPLETED',
          message: 'You have completed all scenarios. Thank you for your participation!',
          evaluator_id: invite.evaluator_id,
          scenarios_completed: completed,
        },
      });
    }

    const scenario = queueResult.rows[0];

    // Update status to in_progress
    if (invite.status !== 'IN_PROGRESS') {
      await pool.query(`
        UPDATE sales_bench_evaluator_invites SET status = 'IN_PROGRESS' WHERE id = $1
      `, [invite.id]);
    }

    res.json({
      success: true,
      data: {
        status: 'IN_PROGRESS',
        evaluator_id: invite.evaluator_id,
        session: {
          name: invite.session_name,
          suite_name: invite.suite_name,
          suite_description: invite.suite_description,
          vertical: invite.vertical_name,
          sub_vertical: invite.sub_vertical_name,
          deadline: invite.deadline,
        },
        progress: {
          completed,
          total,
          remaining: total - completed,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        },
        current_scenario: {
          id: scenario.scenario_id,
          queue_position: scenario.queue_position,
          path_type: scenario.path_type,
          company: scenario.company_profile,
          contact: scenario.contact_profile,
          signals: scenario.signal_context,
          persona: scenario.persona_context,
          scenario: scenario.scenario_data,
          expected_outcome: scenario.expected_outcome,
        },
        scoring_instructions: {
          dimensions: [
            { key: 'qualification', label: 'Qualification', description: 'How well does the lead match the target profile?' },
            { key: 'needs_discovery', label: 'Needs Discovery', description: 'Are there clear, addressable needs?' },
            { key: 'value_articulation', label: 'Value Articulation', description: 'Can you articulate clear value for this lead?' },
            { key: 'objection_handling', label: 'Objection Handling', description: 'Are potential objections manageable?' },
            { key: 'process_adherence', label: 'Process Adherence', description: 'Does this follow your sales process?' },
            { key: 'compliance', label: 'Compliance', description: 'Are there any compliance concerns?' },
            { key: 'relationship_building', label: 'Relationship Building', description: 'Is there relationship-building potential?' },
            { key: 'next_step_secured', label: 'Next Step Secured', description: 'Can you secure a clear next step?' },
          ],
          scale: '1-5 (1 = Poor, 5 = Excellent)',
          overall: {
            would_pursue: 'YES, NO, or MAYBE',
            confidence: '1-5 (how confident are you in your assessment?)',
          },
        },
      },
    });
  } catch (error) {
    console.error('[EVALUATOR] GET error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/evaluator/:token/score
 * Submit a score for the current scenario
 */
router.post('/:token/score', async (req, res) => {
  try {
    const { token } = req.params;
    const {
      scenario_id,
      scores,
      would_pursue,
      confidence,
      notes,
      time_spent_seconds,
    } = req.body;

    // Validate token
    const inviteResult = await pool.query(`
      SELECT i.*, s.suite_id
      FROM sales_bench_evaluator_invites i
      JOIN sales_bench_human_sessions s ON s.id = i.session_id
      WHERE i.token = $1
    `, [token]);

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_TOKEN',
      });
    }

    const invite = inviteResult.rows[0];

    // Check expiry
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        error: 'TOKEN_EXPIRED',
      });
    }

    // Validate required fields
    if (!scenario_id || !scores || !would_pursue || !confidence) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        required: ['scenario_id', 'scores', 'would_pursue', 'confidence'],
      });
    }

    // Validate scores object has required dimensions
    const requiredDimensions = [
      'qualification', 'needs_discovery', 'value_articulation', 'objection_handling',
      'process_adherence', 'compliance', 'relationship_building', 'next_step_secured'
    ];
    for (const dim of requiredDimensions) {
      if (!scores[dim] || scores[dim] < 1 || scores[dim] > 5) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_SCORE',
          message: `${dim} must be 1-5`,
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate weighted CRS (equal weights for now)
      const weights = { qualification: 0.15, needs_discovery: 0.15, value_articulation: 0.15, objection_handling: 0.10, process_adherence: 0.10, compliance: 0.10, relationship_building: 0.10, next_step_secured: 0.15 };
      let weightedSum = 0;
      for (const [dim, weight] of Object.entries(weights)) {
        weightedSum += (scores[dim] / 5) * weight; // Normalize 1-5 to 0-1
      }

      // Get scenario path_type
      const scenarioResult = await client.query(`
        SELECT path_type FROM sales_bench.sales_scenarios WHERE id = $1
      `, [scenario_id]);
      const pathType = scenarioResult.rows[0]?.path_type || 'UNKNOWN';

      // Insert human score
      await client.query(`
        INSERT INTO sales_bench_human_scores (
          session_id, invite_id, evaluator_id, evaluator_role,
          scenario_id, path_type,
          crs_qualification, crs_needs_discovery, crs_value_articulation,
          crs_objection_handling, crs_process_adherence, crs_compliance,
          crs_relationship_building, crs_next_step_secured, crs_weighted,
          would_pursue, confidence, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        invite.session_id, invite.id, invite.evaluator_id, 'EVALUATOR',
        scenario_id, pathType,
        scores.qualification, scores.needs_discovery, scores.value_articulation,
        scores.objection_handling, scores.process_adherence, scores.compliance,
        scores.relationship_building, scores.next_step_secured, weightedSum,
        would_pursue, confidence, notes
      ]);

      // Update queue status
      await client.query(`
        UPDATE sales_bench_evaluator_scenario_queue
        SET status = 'COMPLETED', completed_at = NOW(), time_spent_seconds = $3
        WHERE invite_id = $1 AND scenario_id = $2
      `, [invite.id, scenario_id, time_spent_seconds || 0]);

      // Update invite progress
      await client.query(`
        UPDATE sales_bench_evaluator_invites
        SET scenarios_completed = scenarios_completed + 1,
            current_scenario_index = current_scenario_index + 1
        WHERE id = $1
      `, [invite.id]);

      await client.query('COMMIT');

      // Get next scenario
      const nextResult = await client.query(`
        SELECT scenario_id, queue_position
        FROM sales_bench_evaluator_scenario_queue
        WHERE invite_id = $1 AND status = 'PENDING'
        ORDER BY queue_position
        LIMIT 1
      `, [invite.id]);

      // Get progress
      const progressResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
          COUNT(*) AS total
        FROM sales_bench_evaluator_scenario_queue
        WHERE invite_id = $1
      `, [invite.id]);

      const progress = progressResult.rows[0];
      const completed = parseInt(progress.completed) || 0;
      const total = parseInt(progress.total) || 0;

      if (nextResult.rows.length === 0) {
        // All done
        await pool.query(`
          UPDATE sales_bench_evaluator_invites
          SET status = 'COMPLETED', completed_at = NOW()
          WHERE id = $1
        `, [invite.id]);

        // Check session completion
        await checkSessionCompletion(invite.session_id);

        return res.json({
          success: true,
          data: {
            status: 'COMPLETED',
            message: 'All scenarios scored. Thank you for your participation!',
            scenarios_completed: completed,
          },
        });
      }

      res.json({
        success: true,
        data: {
          status: 'IN_PROGRESS',
          message: 'Score submitted successfully',
          progress: {
            completed,
            total,
            remaining: total - completed,
            percentage: Math.round((completed / total) * 100),
          },
          next_scenario_id: nextResult.rows[0].scenario_id,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[EVALUATOR] POST score error:', error);
    res.status(500).json({
      success: false,
      error: 'SCORE_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/evaluator/:token/skip
 * Skip the current scenario
 */
router.post('/:token/skip', async (req, res) => {
  try {
    const { token } = req.params;
    const { scenario_id, reason } = req.body;

    // Validate token
    const inviteResult = await pool.query(`
      SELECT * FROM sales_bench_evaluator_invites WHERE token = $1
    `, [token]);

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'INVALID_TOKEN' });
    }

    const invite = inviteResult.rows[0];

    // Update queue status
    await pool.query(`
      UPDATE sales_bench_evaluator_scenario_queue
      SET status = 'SKIPPED'
      WHERE invite_id = $1 AND scenario_id = $2
    `, [invite.id, scenario_id]);

    // Update invite index
    await pool.query(`
      UPDATE sales_bench_evaluator_invites
      SET current_scenario_index = current_scenario_index + 1
      WHERE id = $1
    `, [invite.id]);

    res.json({
      success: true,
      message: 'Scenario skipped',
    });
  } catch (error) {
    console.error('[EVALUATOR] Skip error:', error);
    res.status(500).json({
      success: false,
      error: 'SKIP_FAILED',
      message: error.message,
    });
  }
});

/**
 * Check if all evaluators have completed and compute correlation
 */
async function checkSessionCompletion(sessionId) {
  try {
    // Check if all invites are complete
    const statusResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
        COUNT(*) AS total
      FROM sales_bench_evaluator_invites
      WHERE session_id = $1
    `, [sessionId]);

    const { completed, total } = statusResult.rows[0];

    if (parseInt(completed) >= parseInt(total) && parseInt(total) >= 2) {
      // All evaluators complete - update session
      await pool.query(`
        UPDATE sales_bench_human_sessions
        SET status = 'COMPLETED', completed_at = NOW(), invites_completed = $2
        WHERE id = $1
      `, [sessionId, completed]);

      // Compute correlation (async - can be done later)
      console.log(`[EVALUATOR] Session ${sessionId} completed. Ready for correlation computation.`);

      // TODO: Trigger correlation computation
      // await computeSpearmanCorrelation(sessionId);
    }
  } catch (error) {
    console.error('[EVALUATOR] Session completion check error:', error);
  }
}

export default router;
