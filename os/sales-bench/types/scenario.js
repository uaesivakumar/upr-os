/**
 * SalesScenario Type Definitions
 * PRD v1.3 Appendix §2.1
 *
 * A SalesScenario defines a deterministic sales situation.
 * Each scenario is versioned, immutable, and replayable.
 */

import crypto from 'crypto';

/**
 * @typedef {Object} SalesScenario
 * @property {string} scenario_id - UUID
 * @property {string} version - semver (e.g., "1.0.0")
 * @property {string} created_at - ISO timestamp
 * @property {string} hash - SHA256 of scenario content
 * @property {string} vertical - e.g., "banking"
 * @property {string} sub_vertical - e.g., "employee_banking"
 * @property {string} region - e.g., "UAE"
 * @property {string} entry_intent - e.g., "open_salary_account"
 * @property {string} buyer_bot_id - Reference to Buyer Bot
 * @property {ScenarioConstraints} constraints
 * @property {'next_step_committed'|'qualified_handoff'|'correct_refusal'} success_condition
 * @property {'GOLDEN'|'KILL'} path_type
 * @property {'PASS'|'FAIL'|'BLOCK'} expected_outcome
 * @property {ScenarioTolerances} tolerances
 */

/**
 * @typedef {Object} ScenarioConstraints
 * @property {boolean} regulatory - Regulatory scenario?
 * @property {boolean} pricing_fixed - Fixed pricing?
 * @property {boolean} time_pressure - Urgency factor?
 * @property {boolean} competitor_mention - Competitor involved?
 */

/**
 * @typedef {Object} ScenarioTolerances
 * @property {number} max_turns - Max conversation turns
 * @property {number} max_latency_ms - Max response time
 * @property {number} max_cost_usd - Max cost per run
 */

/**
 * Valid path types per PRD v1.3 §6
 */
export const PATH_TYPES = Object.freeze({
  GOLDEN: 'GOLDEN',
  KILL: 'KILL',
});

/**
 * Valid success conditions per PRD v1.3 §3.1
 */
export const SUCCESS_CONDITIONS = Object.freeze({
  NEXT_STEP_COMMITTED: 'next_step_committed',
  QUALIFIED_HANDOFF: 'qualified_handoff',
  CORRECT_REFUSAL: 'correct_refusal',
});

/**
 * Hard outcomes per PRD v1.3 §3.1
 * Precedence: BLOCK > FAIL > PASS
 */
export const HARD_OUTCOMES = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  BLOCK: 'BLOCK',
});

/**
 * Compute SHA256 hash of scenario content for immutability verification
 * @param {SalesScenario} scenario
 * @returns {string} SHA256 hash
 */
export function computeScenarioHash(scenario) {
  const contentToHash = {
    vertical: scenario.vertical,
    sub_vertical: scenario.sub_vertical,
    region: scenario.region,
    entry_intent: scenario.entry_intent,
    buyer_bot_id: scenario.buyer_bot_id,
    constraints: scenario.constraints,
    success_condition: scenario.success_condition,
    path_type: scenario.path_type,
    expected_outcome: scenario.expected_outcome,
    tolerances: scenario.tolerances,
    version: scenario.version,
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(contentToHash, Object.keys(contentToHash).sort()))
    .digest('hex');
}

/**
 * Verify scenario hash matches content
 * @param {SalesScenario} scenario
 * @returns {boolean}
 */
export function verifyScenarioHash(scenario) {
  const computedHash = computeScenarioHash(scenario);
  return computedHash === scenario.hash;
}

/**
 * Validate scenario structure
 * @param {Object} data - Raw scenario data
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateScenario(data) {
  const errors = [];

  // Required fields
  const required = [
    'vertical',
    'sub_vertical',
    'region',
    'entry_intent',
    'buyer_bot_id',
    'success_condition',
    'path_type',
    'expected_outcome',
  ];

  for (const field of required) {
    if (!data[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Path type validation
  if (data.path_type && !Object.values(PATH_TYPES).includes(data.path_type)) {
    errors.push(`Invalid path_type: ${data.path_type}. Must be GOLDEN or KILL`);
  }

  // Success condition validation
  if (
    data.success_condition &&
    !Object.values(SUCCESS_CONDITIONS).includes(data.success_condition)
  ) {
    errors.push(`Invalid success_condition: ${data.success_condition}`);
  }

  // Expected outcome validation
  if (
    data.expected_outcome &&
    !Object.values(HARD_OUTCOMES).includes(data.expected_outcome)
  ) {
    errors.push(`Invalid expected_outcome: ${data.expected_outcome}`);
  }

  // Constraints validation
  if (data.constraints) {
    const constraintFields = [
      'regulatory',
      'pricing_fixed',
      'time_pressure',
      'competitor_mention',
    ];
    for (const field of constraintFields) {
      if (
        data.constraints[field] !== undefined &&
        typeof data.constraints[field] !== 'boolean'
      ) {
        errors.push(`constraints.${field} must be boolean`);
      }
    }
  }

  // Tolerances validation
  if (data.tolerances) {
    if (data.tolerances.max_turns && typeof data.tolerances.max_turns !== 'number') {
      errors.push('tolerances.max_turns must be number');
    }
    if (
      data.tolerances.max_latency_ms &&
      typeof data.tolerances.max_latency_ms !== 'number'
    ) {
      errors.push('tolerances.max_latency_ms must be number');
    }
    if (
      data.tolerances.max_cost_usd &&
      typeof data.tolerances.max_cost_usd !== 'number'
    ) {
      errors.push('tolerances.max_cost_usd must be number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a new SalesScenario with computed hash
 * @param {Object} data - Scenario data
 * @returns {SalesScenario}
 */
export function createScenario(data) {
  const validation = validateScenario(data);
  if (!validation.valid) {
    throw new Error(`Invalid scenario: ${validation.errors.join(', ')}`);
  }

  const scenario = {
    scenario_id: data.scenario_id || crypto.randomUUID(),
    version: data.version || '1.0.0',
    created_at: data.created_at || new Date().toISOString(),
    vertical: data.vertical,
    sub_vertical: data.sub_vertical,
    region: data.region,
    entry_intent: data.entry_intent,
    buyer_bot_id: data.buyer_bot_id,
    constraints: {
      regulatory: data.constraints?.regulatory ?? false,
      pricing_fixed: data.constraints?.pricing_fixed ?? false,
      time_pressure: data.constraints?.time_pressure ?? false,
      competitor_mention: data.constraints?.competitor_mention ?? false,
    },
    success_condition: data.success_condition,
    path_type: data.path_type,
    expected_outcome: data.expected_outcome,
    tolerances: {
      max_turns: data.tolerances?.max_turns ?? 10,
      max_latency_ms: data.tolerances?.max_latency_ms ?? 5000,
      max_cost_usd: data.tolerances?.max_cost_usd ?? 0.10,
    },
  };

  // Compute and attach hash
  scenario.hash = computeScenarioHash(scenario);

  // Freeze to enforce immutability in memory
  return Object.freeze(scenario);
}
