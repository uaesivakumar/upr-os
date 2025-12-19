/**
 * Scenario Run Storage Layer
 * S242: Scenario Management API
 * PRD v1.3 §3.1
 *
 * Handles append-only storage for ScenarioRuns.
 * Runs are immutable after completion (append-only pattern).
 */

import pool from '../../../server/db.js';
import {
  createScenarioRun,
  completeRun,
  addConversationTurn,
  recordPolicyGate,
  recordFailureTrigger,
  generateRunSeed,
} from '../types/scenario-run.js';
import {
  SALES_BENCH_CONTEXT,
  enforceAuthorityInvariance,
  assertTableAccess,
} from '../guards/authority-invariance.js';

/**
 * Create a new scenario run
 * @param {Object} data - Run initialization data
 * @returns {Promise<Object>} Created run
 */
export async function createRunRecord(data) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'run.create');
  assertTableAccess('sales_bench.scenario_runs', 'write');

  // Create run object with seed
  const run = createScenarioRun(data);

  // Fetch scenario for denormalized fields
  const scenarioQuery = `
    SELECT vertical, sub_vertical, region
    FROM sales_bench.sales_scenarios
    WHERE id = $1
  `;
  const scenarioResult = await pool.query(scenarioQuery, [run.scenario_id]);

  if (scenarioResult.rows.length === 0) {
    throw new Error(`Scenario not found: ${run.scenario_id}`);
  }

  const scenario = scenarioResult.rows[0];

  const query = `
    INSERT INTO sales_bench.scenario_runs (
      id, scenario_id, buyer_bot_id, buyer_bot_variant_id,
      seed, started_at, conversation, metrics,
      is_replay, original_run_id,
      vertical, sub_vertical, region
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
    )
    RETURNING *
  `;

  const values = [
    run.run_id,
    run.scenario_id,
    run.buyer_bot_id,
    run.buyer_bot_variant_id,
    run.seed,
    run.started_at,
    JSON.stringify(run.conversation),
    JSON.stringify(run.metrics),
    run.is_replay,
    run.original_run_id,
    scenario.vertical,
    scenario.sub_vertical,
    scenario.region,
  ];

  const result = await pool.query(query, values);
  return mapRowToRun(result.rows[0]);
}

/**
 * Get run by ID
 * @param {string} runId - UUID
 * @returns {Promise<Object|null>} Run or null
 */
export async function getRunById(runId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'run.read');

  const query = `
    SELECT * FROM sales_bench.scenario_runs
    WHERE id = $1
  `;

  const result = await pool.query(query, [runId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRun(result.rows[0]);
}

/**
 * Update run with new conversation turn (append-only)
 * @param {string} runId - UUID
 * @param {Object} turn - Conversation turn
 * @returns {Promise<Object>} Updated run
 */
export async function appendTurnToRun(runId, turn) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'run.append_turn');

  // Get current run
  const run = await getRunById(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }

  if (run.completed_at) {
    throw new Error('Cannot append turn to completed run (append-only)');
  }

  // Add turn using type function
  const updatedRun = addConversationTurn(run, turn);

  // Update in database
  const query = `
    UPDATE sales_bench.scenario_runs
    SET
      conversation = $1,
      metrics = $2
    WHERE id = $3 AND completed_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [
    JSON.stringify(updatedRun.conversation),
    JSON.stringify(updatedRun.metrics),
    runId,
  ]);

  if (result.rows.length === 0) {
    throw new Error('Run update failed - may have been completed');
  }

  return mapRowToRun(result.rows[0]);
}

/**
 * Complete a scenario run with outcome
 * @param {string} runId - UUID
 * @param {'PASS'|'FAIL'|'BLOCK'} outcome - Hard outcome
 * @param {string} reason - Reason for outcome
 * @param {number} totalCost - Total cost in USD
 * @returns {Promise<Object>} Completed run
 */
export async function completeRunRecord(runId, outcome, reason, totalCost = 0) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'run.complete');

  // Validate outcome
  const validOutcomes = ['PASS', 'FAIL', 'BLOCK'];
  if (!validOutcomes.includes(outcome)) {
    throw new Error(`Invalid outcome: ${outcome}. Must be one of: ${validOutcomes.join(', ')}`);
  }

  const query = `
    UPDATE sales_bench.scenario_runs
    SET
      completed_at = NOW(),
      hard_outcome = $1,
      outcome_reason = $2,
      metrics = jsonb_set(metrics, '{total_cost_usd}', $3::text::jsonb)
    WHERE id = $4 AND completed_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [
    outcome,
    reason,
    totalCost.toString(),
    runId,
  ]);

  if (result.rows.length === 0) {
    throw new Error('Run completion failed - run not found or already completed');
  }

  return mapRowToRun(result.rows[0]);
}

/**
 * Record a policy gate hit
 * @param {string} runId - UUID
 * @param {string} gateName - Name of policy gate
 * @returns {Promise<Object>} Updated run
 */
export async function recordPolicyGateHit(runId, gateName) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'run.record_gate');

  const query = `
    UPDATE sales_bench.scenario_runs
    SET metrics = jsonb_set(
      metrics,
      '{policy_gates_hit}',
      (COALESCE(metrics->'policy_gates_hit', '[]'::jsonb) || to_jsonb($1::text))
    )
    WHERE id = $2 AND completed_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [gateName, runId]);

  if (result.rows.length === 0) {
    throw new Error('Recording gate failed - run not found or completed');
  }

  return mapRowToRun(result.rows[0]);
}

/**
 * Record a failure trigger fired
 * @param {string} runId - UUID
 * @param {string} triggerId - ID of failure trigger
 * @returns {Promise<Object>} Updated run
 */
export async function recordFailureTriggerFired(runId, triggerId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'run.record_trigger');

  const query = `
    UPDATE sales_bench.scenario_runs
    SET metrics = jsonb_set(
      metrics,
      '{failure_triggers_fired}',
      (COALESCE(metrics->'failure_triggers_fired', '[]'::jsonb) || to_jsonb($1::text))
    )
    WHERE id = $2 AND completed_at IS NULL
    RETURNING *
  `;

  const result = await pool.query(query, [triggerId, runId]);

  if (result.rows.length === 0) {
    throw new Error('Recording trigger failed - run not found or completed');
  }

  return mapRowToRun(result.rows[0]);
}

/**
 * List runs for a scenario
 * @param {string} scenarioId - Scenario UUID
 * @param {Object} filters - Query filters
 * @returns {Promise<Object[]>} List of runs
 */
export async function listRunsByScenario(scenarioId, filters = {}) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'run.list');

  const conditions = ['scenario_id = $1'];
  const values = [scenarioId];
  let paramIndex = 2;

  // Optional: outcome filter
  if (filters.outcome) {
    conditions.push(`hard_outcome = $${paramIndex}`);
    values.push(filters.outcome);
    paramIndex++;
  }

  // Optional: completed only
  if (filters.completed_only) {
    conditions.push('completed_at IS NOT NULL');
  }

  // Optional: is_replay filter
  if (typeof filters.is_replay === 'boolean') {
    conditions.push(`is_replay = $${paramIndex}`);
    values.push(filters.is_replay);
    paramIndex++;
  }

  const query = `
    SELECT * FROM sales_bench.scenario_runs
    WHERE ${conditions.join(' AND ')}
    ORDER BY started_at DESC
    LIMIT $${paramIndex}
  `;

  values.push(filters.limit || 100);

  const result = await pool.query(query, values);
  return result.rows.map(mapRowToRun);
}

/**
 * List runs by vertical (PRD v1.3 §7.3 compliant)
 * @param {string} vertical - Vertical filter (REQUIRED)
 * @param {Object} filters - Additional filters
 * @returns {Promise<Object[]>} List of runs
 */
export async function listRunsByVertical(vertical, filters = {}) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'run.list_by_vertical');

  if (!vertical) {
    throw new Error('FORBIDDEN: vertical filter is required (PRD v1.3 §7.3)');
  }

  const conditions = ['vertical = $1'];
  const values = [vertical];
  let paramIndex = 2;

  // Optional: sub_vertical
  if (filters.sub_vertical) {
    conditions.push(`sub_vertical = $${paramIndex}`);
    values.push(filters.sub_vertical);
    paramIndex++;
  }

  // Optional: region
  if (filters.region) {
    conditions.push(`region = $${paramIndex}`);
    values.push(filters.region);
    paramIndex++;
  }

  // Optional: outcome
  if (filters.outcome) {
    conditions.push(`hard_outcome = $${paramIndex}`);
    values.push(filters.outcome);
    paramIndex++;
  }

  // Optional: completed only
  if (filters.completed_only) {
    conditions.push('completed_at IS NOT NULL');
  }

  const query = `
    SELECT * FROM sales_bench.scenario_runs
    WHERE ${conditions.join(' AND ')}
    ORDER BY started_at DESC
    LIMIT $${paramIndex}
  `;

  values.push(filters.limit || 100);

  const result = await pool.query(query, values);
  return result.rows.map(mapRowToRun);
}

/**
 * Get run summary statistics by vertical
 * @param {string} vertical - Vertical (REQUIRED)
 * @returns {Promise<Object>} Summary statistics
 */
export async function getRunSummaryByVertical(vertical) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'run.stats');

  if (!vertical) {
    throw new Error('FORBIDDEN: vertical is required (PRD v1.3 §7.3)');
  }

  const query = `
    SELECT
      hard_outcome,
      COUNT(*) as count,
      AVG((metrics->>'total_latency_ms')::numeric) as avg_latency_ms,
      AVG((metrics->>'total_cost_usd')::numeric) as avg_cost_usd,
      AVG((metrics->>'total_turns')::numeric) as avg_turns
    FROM sales_bench.scenario_runs
    WHERE vertical = $1 AND completed_at IS NOT NULL
    GROUP BY hard_outcome
  `;

  const result = await pool.query(query, [vertical]);

  const summary = {
    vertical,
    outcomes: {},
    totals: {
      runs: 0,
      avg_latency_ms: 0,
      avg_cost_usd: 0,
      avg_turns: 0,
    },
  };

  result.rows.forEach((row) => {
    const outcome = row.hard_outcome || 'IN_PROGRESS';
    summary.outcomes[outcome] = {
      count: parseInt(row.count, 10),
      avg_latency_ms: parseFloat(row.avg_latency_ms) || 0,
      avg_cost_usd: parseFloat(row.avg_cost_usd) || 0,
      avg_turns: parseFloat(row.avg_turns) || 0,
    };
    summary.totals.runs += parseInt(row.count, 10);
  });

  // Calculate overall averages
  if (summary.totals.runs > 0) {
    let totalLatency = 0;
    let totalCost = 0;
    let totalTurns = 0;

    Object.values(summary.outcomes).forEach((o) => {
      totalLatency += o.avg_latency_ms * o.count;
      totalCost += o.avg_cost_usd * o.count;
      totalTurns += o.avg_turns * o.count;
    });

    summary.totals.avg_latency_ms = totalLatency / summary.totals.runs;
    summary.totals.avg_cost_usd = totalCost / summary.totals.runs;
    summary.totals.avg_turns = totalTurns / summary.totals.runs;
  }

  return summary;
}

/**
 * Create a replay run from an original run
 * @param {string} originalRunId - Original run ID to replay
 * @returns {Promise<Object>} New replay run
 */
export async function createReplayRun(originalRunId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'run.create_replay');

  const originalRun = await getRunById(originalRunId);
  if (!originalRun) {
    throw new Error(`Original run not found: ${originalRunId}`);
  }

  if (!originalRun.completed_at) {
    throw new Error('Cannot replay incomplete run');
  }

  // Create replay with same seed for determinism
  return createRunRecord({
    scenario_id: originalRun.scenario_id,
    buyer_bot_id: originalRun.buyer_bot_id,
    buyer_bot_variant_id: originalRun.buyer_bot_variant_id,
    seed: originalRun.seed, // CRITICAL: Use same seed for deterministic replay
    is_replay: true,
    original_run_id: originalRunId,
  });
}

/**
 * Map database row to run object
 * @param {Object} row - Database row
 * @returns {Object} Run object
 */
function mapRowToRun(row) {
  return {
    run_id: row.id,
    scenario_id: row.scenario_id,
    buyer_bot_id: row.buyer_bot_id,
    buyer_bot_variant_id: row.buyer_bot_variant_id,
    seed: row.seed,
    started_at: row.started_at,
    completed_at: row.completed_at,
    hard_outcome: row.hard_outcome,
    outcome_reason: row.outcome_reason,
    conversation: typeof row.conversation === 'string'
      ? JSON.parse(row.conversation)
      : row.conversation,
    metrics: typeof row.metrics === 'string'
      ? JSON.parse(row.metrics)
      : row.metrics,
    crs_score_id: row.crs_score_id,
    is_replay: row.is_replay,
    original_run_id: row.original_run_id,
    vertical: row.vertical,
    sub_vertical: row.sub_vertical,
    region: row.region,
  };
}
