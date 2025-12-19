/**
 * Scenario Run API Routes
 * S242: Scenario Management API
 * PRD v1.3 §3.1
 *
 * Endpoints:
 * - POST   /api/os/sales-bench/runs                - Create run
 * - GET    /api/os/sales-bench/runs/:id            - Get run by ID
 * - GET    /api/os/sales-bench/runs                - List runs (vertical required)
 * - POST   /api/os/sales-bench/runs/:id/turns      - Append conversation turn
 * - POST   /api/os/sales-bench/runs/:id/complete   - Complete run with outcome
 * - POST   /api/os/sales-bench/runs/:id/gate       - Record policy gate hit
 * - POST   /api/os/sales-bench/runs/:id/trigger    - Record failure trigger
 * - POST   /api/os/sales-bench/runs/:id/replay     - Create replay run
 * - GET    /api/os/sales-bench/runs/stats/:vertical - Get run statistics
 */

import express from 'express';
import {
  createRunRecord,
  getRunById,
  appendTurnToRun,
  completeRunRecord,
  recordPolicyGateHit,
  recordFailureTriggerFired,
  listRunsByScenario,
  listRunsByVertical,
  getRunSummaryByVertical,
  createReplayRun,
} from '../../../os/sales-bench/storage/run-store.js';
import { AuthorityInvarianceError } from '../../../os/sales-bench/guards/authority-invariance.js';

const router = express.Router();

/**
 * POST /api/os/sales-bench/runs
 * Create a new scenario run
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
    const requiredFields = ['scenario_id', 'buyer_bot_id'];
    const missingFields = requiredFields.filter((f) => !data[f]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        missing: missingFields,
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    const run = await createRunRecord(data);

    res.status(201).json({
      success: true,
      data: run,
      message: 'Run created successfully',
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

    if (error.message.includes('Scenario not found')) {
      return res.status(404).json({
        success: false,
        error: 'SCENARIO_NOT_FOUND',
        message: error.message,
      });
    }

    console.error('[SALES_BENCH] Run creation error:', error);
    res.status(500).json({
      success: false,
      error: 'RUN_CREATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/runs/:id
 * Get run by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_RUN_ID',
        message: 'Run ID must be a valid UUID',
      });
    }

    const run = await getRunById(id);

    if (!run) {
      return res.status(404).json({
        success: false,
        error: 'RUN_NOT_FOUND',
        message: `Run with ID ${id} not found`,
      });
    }

    res.json({
      success: true,
      data: run,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Run retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'RUN_RETRIEVAL_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/runs
 * List runs with filters
 * PRD v1.3 §7.3: Vertical filter is REQUIRED (no cross-vertical aggregation)
 */
router.get('/', async (req, res) => {
  try {
    const {
      vertical,
      sub_vertical,
      region,
      scenario_id,
      outcome,
      completed_only,
      is_replay,
      limit,
    } = req.query;

    // If scenario_id provided, use scenario-specific query
    if (scenario_id) {
      const runs = await listRunsByScenario(scenario_id, {
        outcome,
        completed_only: completed_only === 'true',
        is_replay: is_replay !== undefined ? is_replay === 'true' : undefined,
        limit: limit ? parseInt(limit, 10) : 100,
      });

      return res.json({
        success: true,
        data: runs,
        count: runs.length,
        filters: { scenario_id, outcome, completed_only, is_replay },
      });
    }

    // PRD v1.3 §7.3: Vertical is REQUIRED for vertical-wide queries
    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_OR_SCENARIO_REQUIRED',
        message: 'Either vertical or scenario_id query parameter is required (PRD v1.3 §7.3: Cross-vertical aggregation forbidden)',
        prdReference: 'PRD v1.3 §7.3',
      });
    }

    const runs = await listRunsByVertical(vertical, {
      sub_vertical,
      region,
      outcome,
      completed_only: completed_only === 'true',
      limit: limit ? parseInt(limit, 10) : 100,
    });

    res.json({
      success: true,
      data: runs,
      count: runs.length,
      filters: {
        vertical,
        sub_vertical: sub_vertical || null,
        region: region || null,
        outcome: outcome || null,
        completed_only: completed_only === 'true',
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

    console.error('[SALES_BENCH] Run list error:', error);
    res.status(500).json({
      success: false,
      error: 'RUN_LIST_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/runs/:id/turns
 * Append a conversation turn to a run
 */
router.post('/:id/turns', async (req, res) => {
  try {
    const { id } = req.params;
    const turn = req.body;

    // Validate required turn fields
    if (!turn.speaker || !turn.content) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TURN',
        message: 'Turn must have speaker and content fields',
      });
    }

    // Validate speaker
    if (!['SIVA', 'BUYER_BOT'].includes(turn.speaker)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SPEAKER',
        message: 'Speaker must be SIVA or BUYER_BOT',
      });
    }

    const run = await appendTurnToRun(id, turn);

    res.json({
      success: true,
      data: run,
      message: 'Turn appended successfully',
    });
  } catch (error) {
    if (error.message.includes('completed run')) {
      return res.status(409).json({
        success: false,
        error: 'RUN_ALREADY_COMPLETED',
        message: error.message,
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'RUN_NOT_FOUND',
        message: error.message,
      });
    }

    console.error('[SALES_BENCH] Turn append error:', error);
    res.status(500).json({
      success: false,
      error: 'TURN_APPEND_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/runs/:id/complete
 * Complete a run with outcome
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome, reason, total_cost } = req.body;

    // Validate outcome
    if (!outcome) {
      return res.status(400).json({
        success: false,
        error: 'OUTCOME_REQUIRED',
        message: 'outcome field is required (PASS, FAIL, or BLOCK)',
      });
    }

    if (!['PASS', 'FAIL', 'BLOCK'].includes(outcome)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_OUTCOME',
        message: 'Outcome must be PASS, FAIL, or BLOCK',
      });
    }

    const run = await completeRunRecord(id, outcome, reason || '', total_cost || 0);

    res.json({
      success: true,
      data: run,
      message: `Run completed with outcome: ${outcome}`,
    });
  } catch (error) {
    if (error.message.includes('already completed')) {
      return res.status(409).json({
        success: false,
        error: 'RUN_ALREADY_COMPLETED',
        message: error.message,
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'RUN_NOT_FOUND',
        message: error.message,
      });
    }

    console.error('[SALES_BENCH] Run completion error:', error);
    res.status(500).json({
      success: false,
      error: 'RUN_COMPLETION_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/runs/:id/gate
 * Record a policy gate hit
 */
router.post('/:id/gate', async (req, res) => {
  try {
    const { id } = req.params;
    const { gate_name } = req.body;

    if (!gate_name) {
      return res.status(400).json({
        success: false,
        error: 'GATE_NAME_REQUIRED',
        message: 'gate_name field is required',
      });
    }

    const run = await recordPolicyGateHit(id, gate_name);

    res.json({
      success: true,
      data: run,
      message: `Policy gate recorded: ${gate_name}`,
    });
  } catch (error) {
    if (error.message.includes('completed')) {
      return res.status(409).json({
        success: false,
        error: 'RUN_ALREADY_COMPLETED',
        message: 'Cannot record gate on completed run',
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'RUN_NOT_FOUND',
        message: error.message,
      });
    }

    console.error('[SALES_BENCH] Gate recording error:', error);
    res.status(500).json({
      success: false,
      error: 'GATE_RECORDING_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/runs/:id/trigger
 * Record a failure trigger fired
 */
router.post('/:id/trigger', async (req, res) => {
  try {
    const { id } = req.params;
    const { trigger_id } = req.body;

    if (!trigger_id) {
      return res.status(400).json({
        success: false,
        error: 'TRIGGER_ID_REQUIRED',
        message: 'trigger_id field is required',
      });
    }

    const run = await recordFailureTriggerFired(id, trigger_id);

    res.json({
      success: true,
      data: run,
      message: `Failure trigger recorded: ${trigger_id}`,
    });
  } catch (error) {
    if (error.message.includes('completed')) {
      return res.status(409).json({
        success: false,
        error: 'RUN_ALREADY_COMPLETED',
        message: 'Cannot record trigger on completed run',
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'RUN_NOT_FOUND',
        message: error.message,
      });
    }

    console.error('[SALES_BENCH] Trigger recording error:', error);
    res.status(500).json({
      success: false,
      error: 'TRIGGER_RECORDING_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/runs/:id/replay
 * Create a replay run from an original run
 * Uses the same seed for deterministic behavior (Clarification #2)
 */
router.post('/:id/replay', async (req, res) => {
  try {
    const { id } = req.params;

    const replayRun = await createReplayRun(id);

    res.status(201).json({
      success: true,
      data: replayRun,
      message: 'Replay run created',
      original_run_id: id,
      seed: replayRun.seed,
      note: 'Replay uses same seed for deterministic Buyer Bot behavior',
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'RUN_NOT_FOUND',
        message: error.message,
      });
    }

    if (error.message.includes('incomplete')) {
      return res.status(400).json({
        success: false,
        error: 'CANNOT_REPLAY_INCOMPLETE',
        message: error.message,
      });
    }

    console.error('[SALES_BENCH] Replay creation error:', error);
    res.status(500).json({
      success: false,
      error: 'REPLAY_CREATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/runs/stats/:vertical
 * Get run summary statistics by vertical
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

    const stats = await getRunSummaryByVertical(vertical);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Run stats error:', error);
    res.status(500).json({
      success: false,
      error: 'RUN_STATS_FAILED',
      message: error.message,
    });
  }
});

export default router;
