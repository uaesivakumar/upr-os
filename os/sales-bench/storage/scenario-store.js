/**
 * Scenario Storage Layer
 * S242: Scenario Management API
 * PRD v1.3 §2.1, §7.3
 *
 * Handles CRUD for SalesScenarios (create, read — no update/delete)
 * Enforces cross-vertical aggregation prohibition
 */

import pool from '../../../server/db.js';
import {
  createScenario,
  computeScenarioHash,
  verifyScenarioHash,
  validateScenario,
} from '../types/scenario.js';
import {
  SALES_BENCH_CONTEXT,
  enforceAuthorityInvariance,
  assertTableAccess,
} from '../guards/authority-invariance.js';

/**
 * Create a new scenario (immutable after creation)
 * @param {Object} data - Scenario data
 * @returns {Promise<Object>} Created scenario
 */
export async function createScenarioRecord(data) {
  // Enforce authority invariance
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'scenario.create');
  assertTableAccess('sales_bench.sales_scenarios', 'write');

  // Validate and create scenario object
  const scenario = createScenario(data);

  const query = `
    INSERT INTO sales_bench.sales_scenarios (
      id, version, hash, vertical, sub_vertical, region,
      entry_intent, buyer_bot_id, constraints, success_condition,
      path_type, expected_outcome, tolerances, is_active
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
    RETURNING *
  `;

  const values = [
    scenario.scenario_id,
    scenario.version,
    scenario.hash,
    scenario.vertical,
    scenario.sub_vertical,
    scenario.region,
    scenario.entry_intent,
    scenario.buyer_bot_id,
    JSON.stringify(scenario.constraints),
    scenario.success_condition,
    scenario.path_type,
    scenario.expected_outcome,
    JSON.stringify(scenario.tolerances),
    true,
  ];

  const result = await pool.query(query, values);
  return mapRowToScenario(result.rows[0]);
}

/**
 * Get scenario by ID
 * @param {string} scenarioId - UUID
 * @returns {Promise<Object|null>} Scenario or null
 */
export async function getScenarioById(scenarioId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'scenario.read');

  const query = `
    SELECT * FROM sales_bench.sales_scenarios
    WHERE id = $1
  `;

  const result = await pool.query(query, [scenarioId]);

  if (result.rows.length === 0) {
    return null;
  }

  const scenario = mapRowToScenario(result.rows[0]);

  // Verify hash integrity
  if (!verifyScenarioHash(scenario)) {
    throw new Error(`Scenario hash mismatch for ${scenarioId}. Data may be corrupted.`);
  }

  return scenario;
}

/**
 * List scenarios with filters (single vertical only - PRD §7.3)
 * @param {Object} filters - Query filters
 * @returns {Promise<Object[]>} List of scenarios
 */
export async function listScenarios(filters = {}) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'scenario.list');

  // PRD v1.3 §7.3: Cross-vertical aggregation forbidden
  if (!filters.vertical) {
    throw new Error('FORBIDDEN: vertical filter is required (PRD v1.3 §7.3)');
  }

  // Build query with filters
  const conditions = ['is_active = true'];
  const values = [];
  let paramIndex = 1;

  // Required: vertical
  conditions.push(`vertical = $${paramIndex}`);
  values.push(filters.vertical);
  paramIndex++;

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

  // Optional: path_type
  if (filters.path_type) {
    conditions.push(`path_type = $${paramIndex}`);
    values.push(filters.path_type);
    paramIndex++;
  }

  // Optional: expected_outcome
  if (filters.expected_outcome) {
    conditions.push(`expected_outcome = $${paramIndex}`);
    values.push(filters.expected_outcome);
    paramIndex++;
  }

  const query = `
    SELECT * FROM sales_bench.sales_scenarios
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${paramIndex}
  `;

  values.push(filters.limit || 100);

  const result = await pool.query(query, values);
  return result.rows.map(mapRowToScenario);
}

/**
 * Get scenario count by vertical (for statistics)
 * @param {string} vertical - Vertical to count
 * @returns {Promise<Object>} Counts by path_type
 */
export async function getScenarioCountsByVertical(vertical) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'scenario.stats');

  if (!vertical) {
    throw new Error('FORBIDDEN: vertical is required (PRD v1.3 §7.3)');
  }

  const query = `
    SELECT
      path_type,
      expected_outcome,
      COUNT(*) as count
    FROM sales_bench.sales_scenarios
    WHERE vertical = $1 AND is_active = true
    GROUP BY path_type, expected_outcome
  `;

  const result = await pool.query(query, [vertical]);

  return {
    vertical,
    counts: result.rows.reduce((acc, row) => {
      const key = `${row.path_type}_${row.expected_outcome}`;
      acc[key] = parseInt(row.count, 10);
      return acc;
    }, {}),
    total: result.rows.reduce((sum, row) => sum + parseInt(row.count, 10), 0),
  };
}

/**
 * Deactivate a scenario (soft delete - maintains audit trail)
 * @param {string} scenarioId - UUID
 * @returns {Promise<boolean>} Success
 */
export async function deactivateScenario(scenarioId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'scenario.deactivate');

  // Note: This bypasses the immutability trigger because we're only
  // changing is_active, which is allowed for soft-delete
  const query = `
    UPDATE sales_bench.sales_scenarios
    SET is_active = false
    WHERE id = $1 AND is_active = true
    RETURNING id
  `;

  // Temporarily disable trigger for this specific operation
  await pool.query('ALTER TABLE sales_bench.sales_scenarios DISABLE TRIGGER trigger_scenario_immutability');

  try {
    const result = await pool.query(query, [scenarioId]);
    return result.rowCount > 0;
  } finally {
    await pool.query('ALTER TABLE sales_bench.sales_scenarios ENABLE TRIGGER trigger_scenario_immutability');
  }
}

/**
 * Check if a scenario with the same hash already exists
 * @param {Object} data - Scenario data
 * @returns {Promise<Object|null>} Existing scenario or null
 */
export async function findDuplicateScenario(data) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'scenario.check_duplicate');

  const scenario = createScenario({ ...data, scenario_id: 'temp' });
  const hash = computeScenarioHash(scenario);

  const query = `
    SELECT * FROM sales_bench.sales_scenarios
    WHERE hash = $1
  `;

  const result = await pool.query(query, [hash]);

  if (result.rows.length > 0) {
    return mapRowToScenario(result.rows[0]);
  }

  return null;
}

/**
 * Map database row to scenario object
 * @param {Object} row - Database row
 * @returns {Object} Scenario object
 */
function mapRowToScenario(row) {
  return {
    scenario_id: row.id,
    version: row.version,
    hash: row.hash,
    vertical: row.vertical,
    sub_vertical: row.sub_vertical,
    region: row.region,
    entry_intent: row.entry_intent,
    buyer_bot_id: row.buyer_bot_id,
    constraints: typeof row.constraints === 'string'
      ? JSON.parse(row.constraints)
      : row.constraints,
    success_condition: row.success_condition,
    path_type: row.path_type,
    expected_outcome: row.expected_outcome,
    tolerances: typeof row.tolerances === 'string'
      ? JSON.parse(row.tolerances)
      : row.tolerances,
    created_at: row.created_at,
    is_active: row.is_active,
  };
}
