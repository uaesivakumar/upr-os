/**
 * Scenario Management API Routes
 * S242: Scenario Management API
 * PRD v1.3 §2.1, §7.3
 *
 * Endpoints:
 * - POST   /api/os/sales-bench/scenarios       - Create scenario
 * - GET    /api/os/sales-bench/scenarios/:id   - Get scenario by ID
 * - GET    /api/os/sales-bench/scenarios       - List scenarios (vertical required)
 * - GET    /api/os/sales-bench/scenarios/stats - Get scenario counts by vertical
 * - DELETE /api/os/sales-bench/scenarios/:id   - Deactivate scenario (soft delete)
 */

import express from 'express';
import pool from '../../../server/db.js';
import {
  createScenarioRecord,
  getScenarioById,
  listScenarios,
  getScenarioCountsByVertical,
  deactivateScenario,
  findDuplicateScenario,
} from '../../../os/sales-bench/storage/scenario-store.js';
import { AuthorityInvarianceError } from '../../../os/sales-bench/guards/authority-invariance.js';

const router = express.Router();

/**
 * POST /api/os/sales-bench/scenarios
 * Create a new scenario (immutable after creation)
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
    const requiredFields = [
      'vertical',
      'sub_vertical',
      'region',
      'entry_intent',
      'buyer_bot_id',
      'success_condition',
      'path_type',
      'expected_outcome',
    ];

    const missingFields = requiredFields.filter((f) => !data[f]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        missing: missingFields,
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    // Check for duplicate scenario (same hash)
    const duplicate = await findDuplicateScenario(data);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_SCENARIO',
        existing_scenario_id: duplicate.scenario_id,
        message: 'A scenario with identical configuration already exists',
      });
    }

    const scenario = await createScenarioRecord(data);

    res.status(201).json({
      success: true,
      data: scenario,
      message: 'Scenario created successfully',
    });
  } catch (error) {
    if (error instanceof AuthorityInvarianceError) {
      return res.status(403).json({
        success: false,
        error: 'AUTHORITY_INVARIANCE_VIOLATION',
        message: error.message,
        prdReference: error.prdReference,
      });
    }

    console.error('[SALES_BENCH] Scenario creation error:', error);
    res.status(500).json({
      success: false,
      error: 'SCENARIO_CREATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/scenarios/:id
 * Get scenario by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SCENARIO_ID',
        message: 'Scenario ID must be a valid UUID',
      });
    }

    const scenario = await getScenarioById(id);

    if (!scenario) {
      return res.status(404).json({
        success: false,
        error: 'SCENARIO_NOT_FOUND',
        message: `Scenario with ID ${id} not found`,
      });
    }

    res.json({
      success: true,
      data: scenario,
    });
  } catch (error) {
    if (error.message.includes('hash mismatch')) {
      return res.status(500).json({
        success: false,
        error: 'SCENARIO_INTEGRITY_VIOLATION',
        message: error.message,
      });
    }

    console.error('[SALES_BENCH] Scenario retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'SCENARIO_RETRIEVAL_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/scenarios
 * List scenarios with filters
 * PRD v1.3 §7.3: Vertical filter is REQUIRED (no cross-vertical aggregation)
 */
router.get('/', async (req, res) => {
  try {
    const {
      vertical,
      sub_vertical,
      region,
      path_type,
      expected_outcome,
      limit,
    } = req.query;

    // PRD v1.3 §7.3: Vertical is REQUIRED
    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'vertical query parameter is required (PRD v1.3 §7.3: Cross-vertical aggregation forbidden)',
        prdReference: 'PRD v1.3 §7.3',
      });
    }

    const filters = {
      vertical,
      sub_vertical,
      region,
      path_type,
      expected_outcome,
      limit: limit ? parseInt(limit, 10) : 100,
    };

    const scenarios = await listScenarios(filters);

    res.json({
      success: true,
      data: scenarios,
      count: scenarios.length,
      filters: {
        vertical,
        sub_vertical: sub_vertical || null,
        region: region || null,
        path_type: path_type || null,
        expected_outcome: expected_outcome || null,
      },
    });
  } catch (error) {
    if (error.message.includes('FORBIDDEN')) {
      return res.status(403).json({
        success: false,
        error: 'CROSS_VERTICAL_FORBIDDEN',
        message: error.message,
        prdReference: 'PRD v1.3 §7.3',
      });
    }

    console.error('[SALES_BENCH] Scenario list error:', error);
    res.status(500).json({
      success: false,
      error: 'SCENARIO_LIST_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/scenarios/stats/:vertical
 * Get scenario counts by vertical
 */
router.get('/stats/:vertical', async (req, res) => {
  try {
    const { vertical } = req.params;

    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'Vertical parameter is required',
      });
    }

    const stats = await getScenarioCountsByVertical(vertical);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Scenario stats error:', error);
    res.status(500).json({
      success: false,
      error: 'SCENARIO_STATS_FAILED',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/os/sales-bench/scenarios/:id
 * Deactivate a scenario (soft delete - maintains audit trail)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SCENARIO_ID',
        message: 'Scenario ID must be a valid UUID',
      });
    }

    const deactivated = await deactivateScenario(id);

    if (!deactivated) {
      return res.status(404).json({
        success: false,
        error: 'SCENARIO_NOT_FOUND',
        message: `Active scenario with ID ${id} not found`,
      });
    }

    res.json({
      success: true,
      message: 'Scenario deactivated successfully',
      scenario_id: id,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Scenario deactivation error:', error);
    res.status(500).json({
      success: false,
      error: 'SCENARIO_DEACTIVATION_FAILED',
      message: error.message,
    });
  }
});

// ============================================================================
// TRACEABILITY ENDPOINTS
// ============================================================================

/**
 * GET /api/os/sales-bench/scenarios/:id/trace
 * Get full traceability info for a scenario
 */
router.get('/:id/trace', async (req, res) => {
  try {
    const { id } = req.params;

    // Get scenario with full context
    const scenarioResult = await pool.query(`
      SELECT
        s.*,
        (SELECT COUNT(*) FROM sales_bench_suite_scenarios ss WHERE ss.scenario_id = s.id) AS suite_count,
        (SELECT COUNT(*) FROM sales_bench_run_scenarios rs WHERE rs.scenario_id = s.id) AS run_count,
        (SELECT COUNT(*) FROM sales_bench_run_scenarios rs WHERE rs.scenario_id = s.id AND rs.outcome_match = true) AS pass_count,
        (SELECT COUNT(*) FROM sales_bench_human_scores hs WHERE hs.scenario_id = s.id) AS human_score_count
      FROM sales_bench.sales_scenarios s
      WHERE s.id = $1
    `, [id]);

    if (scenarioResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SCENARIO_NOT_FOUND',
      });
    }

    const scenario = scenarioResult.rows[0];

    // Get suites this scenario belongs to
    const suitesResult = await pool.query(`
      SELECT su.suite_key, su.name, ss.status, ss.sequence_order
      FROM sales_bench_suite_scenarios ss
      JOIN sales_bench_suites su ON su.id = ss.suite_id
      LEFT JOIN sales_bench_suite_status sst ON sst.suite_id = su.id
      WHERE ss.scenario_id = $1
      ORDER BY su.created_at DESC
    `, [id]);

    // Get run history
    const runsResult = await pool.query(`
      SELECT
        r.suite_key, r.run_number, r.status AS run_status,
        rs.status AS scenario_status, rs.outcome_match,
        rs.crs_overall, rs.execution_time_ms,
        rs.completed_at
      FROM sales_bench_run_scenarios rs
      JOIN sales_bench_runs r ON r.id = rs.run_id
      WHERE rs.scenario_id = $1
      ORDER BY r.created_at DESC
      LIMIT 20
    `, [id]);

    // Get human scores if any
    const humanScoresResult = await pool.query(`
      SELECT
        hs.evaluator_id, hs.crs_weighted, hs.would_pursue, hs.confidence, hs.scored_at,
        sess.session_name
      FROM sales_bench_human_scores hs
      JOIN sales_bench_human_sessions sess ON sess.id = hs.session_id
      WHERE hs.scenario_id = $1
      ORDER BY hs.scored_at DESC
    `, [id]);

    // Get lineage if exists
    const lineageResult = await pool.query(`
      SELECT * FROM sales_bench_scenario_lineage WHERE scenario_id = $1
    `, [id]);

    res.json({
      success: true,
      data: {
        scenario: {
          id: scenario.id,
          hash: scenario.hash,
          content_hash: scenario.content_hash,
          vertical: scenario.vertical,
          sub_vertical: scenario.sub_vertical,
          region: scenario.region,
          path_type: scenario.path_type,
          expected_outcome: scenario.expected_outcome,
          entry_intent: scenario.entry_intent,
          source: scenario.source,
          source_id: scenario.source_id,
          created_at: scenario.created_at,
          created_by: scenario.created_by,
          tags: scenario.tags,
          is_active: scenario.is_active,
        },
        context: {
          company_profile: scenario.company_profile,
          contact_profile: scenario.contact_profile,
          signal_context: scenario.signal_context,
          persona_context: scenario.persona_context,
          scenario_data: scenario.scenario_data,
        },
        statistics: {
          suite_count: parseInt(scenario.suite_count) || 0,
          run_count: parseInt(scenario.run_count) || 0,
          pass_count: parseInt(scenario.pass_count) || 0,
          pass_rate: scenario.run_count > 0 ? ((scenario.pass_count / scenario.run_count) * 100).toFixed(1) + '%' : 'N/A',
          human_score_count: parseInt(scenario.human_score_count) || 0,
        },
        suites: suitesResult.rows,
        run_history: runsResult.rows,
        human_scores: humanScoresResult.rows,
        lineage: lineageResult.rows[0] || null,
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Scenario trace error:', error);
    res.status(500).json({
      success: false,
      error: 'TRACE_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/scenarios/trace/summary
 * Get summary traceability for all scenarios in a vertical
 */
router.get('/trace/summary', async (req, res) => {
  try {
    const { vertical, sub_vertical } = req.query;

    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
      });
    }

    let query = `
      SELECT
        s.id,
        s.hash,
        s.path_type,
        s.expected_outcome,
        s.source,
        s.tags,
        s.created_at,
        (SELECT COUNT(*) FROM sales_bench_suite_scenarios ss WHERE ss.scenario_id = s.id) AS suite_count,
        (SELECT COUNT(*) FROM sales_bench_run_scenarios rs WHERE rs.scenario_id = s.id) AS run_count,
        (SELECT COUNT(*) FROM sales_bench_run_scenarios rs WHERE rs.scenario_id = s.id AND rs.outcome_match = true) AS pass_count
      FROM sales_bench.sales_scenarios s
      WHERE s.is_active = true AND s.vertical = $1
    `;

    const params = [vertical];
    if (sub_vertical) {
      query += ` AND s.sub_vertical = $2`;
      params.push(sub_vertical);
    }

    query += ` ORDER BY s.created_at DESC LIMIT 100`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        vertical,
        sub_vertical: sub_vertical || 'all',
        count: result.rows.length,
        scenarios: result.rows.map(s => ({
          ...s,
          pass_rate: s.run_count > 0 ? ((s.pass_count / s.run_count) * 100).toFixed(1) : null,
        })),
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Trace summary error:', error);
    res.status(500).json({
      success: false,
      error: 'SUMMARY_FAILED',
      message: error.message,
    });
  }
});

export default router;
