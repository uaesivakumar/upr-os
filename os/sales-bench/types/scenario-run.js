/**
 * ScenarioRun Type Definitions
 * PRD v1.3 Appendix §3.1
 *
 * A ScenarioRun represents a single execution of a SalesScenario.
 * Runs are append-only and include deterministic seed for replay.
 */

import crypto from 'crypto';
import { HARD_OUTCOMES } from './scenario.js';

/**
 * @typedef {Object} ScenarioRun
 * @property {string} run_id - UUID
 * @property {string} scenario_id - Reference to SalesScenario
 * @property {string} buyer_bot_id - Reference to BuyerBot used
 * @property {string} buyer_bot_variant_id - Specific variant used (if any)
 * @property {number} seed - Deterministic seed for Buyer Bot behavior
 * @property {string} started_at - ISO timestamp
 * @property {string} completed_at - ISO timestamp
 * @property {'PASS'|'FAIL'|'BLOCK'} hard_outcome - Final outcome
 * @property {string} outcome_reason - Reason for outcome
 * @property {ConversationTurn[]} conversation - Full conversation log
 * @property {RunMetrics} metrics - Execution metrics
 * @property {Object} crs_score_id - Reference to CRS score (if computed)
 * @property {boolean} is_replay - Whether this is a replay of another run
 * @property {string} original_run_id - If replay, reference to original
 */

/**
 * @typedef {Object} ConversationTurn
 * @property {number} turn_number
 * @property {'SIVA'|'BUYER_BOT'} speaker
 * @property {string} content
 * @property {number} latency_ms
 * @property {number} tokens_used
 * @property {string} timestamp
 */

/**
 * @typedef {Object} RunMetrics
 * @property {number} total_turns
 * @property {number} total_latency_ms
 * @property {number} total_tokens
 * @property {number} total_cost_usd
 * @property {string[]} policy_gates_hit - List of policy gates triggered
 * @property {string[]} failure_triggers_fired - List of Buyer Bot triggers
 */

/**
 * Generate deterministic seed for a scenario run
 * Seed is used to make Buyer Bot behavior reproducible
 * @returns {number} 32-bit integer seed
 */
export function generateRunSeed() {
  return crypto.randomInt(0, 2147483647);
}

/**
 * Create a new ScenarioRun
 * @param {Object} data - Run initialization data
 * @returns {ScenarioRun}
 */
export function createScenarioRun(data) {
  if (!data.scenario_id) {
    throw new Error('scenario_id is required');
  }
  if (!data.buyer_bot_id) {
    throw new Error('buyer_bot_id is required');
  }

  return {
    run_id: data.run_id || crypto.randomUUID(),
    scenario_id: data.scenario_id,
    buyer_bot_id: data.buyer_bot_id,
    buyer_bot_variant_id: data.buyer_bot_variant_id || null,
    seed: data.seed ?? generateRunSeed(), // Use provided seed or generate new
    started_at: data.started_at || new Date().toISOString(),
    completed_at: null,
    hard_outcome: null,
    outcome_reason: null,
    conversation: [],
    metrics: {
      total_turns: 0,
      total_latency_ms: 0,
      total_tokens: 0,
      total_cost_usd: 0,
      policy_gates_hit: [],
      failure_triggers_fired: [],
    },
    crs_score_id: null,
    is_replay: data.is_replay || false,
    original_run_id: data.original_run_id || null,
  };
}

/**
 * Add a conversation turn to a run
 * @param {ScenarioRun} run
 * @param {ConversationTurn} turn
 * @returns {ScenarioRun} Updated run (new object, runs are append-only)
 */
export function addConversationTurn(run, turn) {
  if (run.completed_at) {
    throw new Error('Cannot add turn to completed run');
  }

  const newTurn = {
    turn_number: run.conversation.length + 1,
    speaker: turn.speaker,
    content: turn.content,
    latency_ms: turn.latency_ms || 0,
    tokens_used: turn.tokens_used || 0,
    timestamp: new Date().toISOString(),
  };

  return {
    ...run,
    conversation: [...run.conversation, newTurn],
    metrics: {
      ...run.metrics,
      total_turns: run.metrics.total_turns + 1,
      total_latency_ms: run.metrics.total_latency_ms + newTurn.latency_ms,
      total_tokens: run.metrics.total_tokens + newTurn.tokens_used,
    },
  };
}

/**
 * Complete a scenario run with outcome
 * @param {ScenarioRun} run
 * @param {'PASS'|'FAIL'|'BLOCK'} outcome
 * @param {string} reason
 * @param {number} totalCost
 * @returns {ScenarioRun} Completed run
 */
export function completeRun(run, outcome, reason, totalCost = 0) {
  if (!Object.values(HARD_OUTCOMES).includes(outcome)) {
    throw new Error(`Invalid outcome: ${outcome}`);
  }

  return {
    ...run,
    completed_at: new Date().toISOString(),
    hard_outcome: outcome,
    outcome_reason: reason,
    metrics: {
      ...run.metrics,
      total_cost_usd: totalCost,
    },
  };
}

/**
 * Record a policy gate hit
 * @param {ScenarioRun} run
 * @param {string} gateName
 * @returns {ScenarioRun}
 */
export function recordPolicyGate(run, gateName) {
  return {
    ...run,
    metrics: {
      ...run.metrics,
      policy_gates_hit: [...run.metrics.policy_gates_hit, gateName],
    },
  };
}

/**
 * Record a failure trigger fired
 * @param {ScenarioRun} run
 * @param {string} triggerId
 * @returns {ScenarioRun}
 */
export function recordFailureTrigger(run, triggerId) {
  return {
    ...run,
    metrics: {
      ...run.metrics,
      failure_triggers_fired: [...run.metrics.failure_triggers_fired, triggerId],
    },
  };
}

/**
 * Validate that a replay run matches the original
 * @param {ScenarioRun} originalRun
 * @param {ScenarioRun} replayRun
 * @returns {{matches: boolean, differences: string[]}}
 */
export function validateReplay(originalRun, replayRun) {
  const differences = [];

  // Seeds must match
  if (originalRun.seed !== replayRun.seed) {
    differences.push(`Seed mismatch: ${originalRun.seed} vs ${replayRun.seed}`);
  }

  // Scenario must match
  if (originalRun.scenario_id !== replayRun.scenario_id) {
    differences.push('Scenario ID mismatch');
  }

  // Buyer bot must match
  if (originalRun.buyer_bot_id !== replayRun.buyer_bot_id) {
    differences.push('Buyer Bot ID mismatch');
  }

  // Turn count should match
  if (originalRun.conversation.length !== replayRun.conversation.length) {
    differences.push(
      `Turn count: ${originalRun.conversation.length} vs ${replayRun.conversation.length}`
    );
  }

  // Outcome should match
  if (originalRun.hard_outcome !== replayRun.hard_outcome) {
    differences.push(
      `Outcome: ${originalRun.hard_outcome} vs ${replayRun.hard_outcome}`
    );
  }

  return {
    matches: differences.length === 0,
    differences,
  };
}
