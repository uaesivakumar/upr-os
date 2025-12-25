/**
 * NBA Behavior Context Types
 *
 * S266-F1: Extend NBA Input Contract
 *
 * CRITICAL RULES:
 * - No raw BTE signals passed through
 * - No numeric thresholds exposed
 * - All values are bounded enums
 * - This is READ-ONLY context, not commands
 *
 * BTE provides contextual modifiers, not commands.
 * NBA remains the sole decision-maker.
 */

// ============================================================
// BEHAVIOR CONTEXT SCHEMA
// ============================================================

/**
 * Urgency Level - derived from idle_decay
 *
 * LOW: idle_decay < 3 days (healthy activity)
 * MEDIUM: idle_decay 3-7 days (attention needed)
 * HIGH: idle_decay > 7 days (critical intervention)
 */
export const URGENCY_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
};

/**
 * Momentum Trend - derived from momentum signal
 *
 * POSITIVE: momentum > 0.2 (accelerating)
 * NEUTRAL: momentum -0.2 to 0.2 (stable)
 * NEGATIVE: momentum < -0.2 (decelerating)
 */
export const MOMENTUM_TRENDS = {
  POSITIVE: 'POSITIVE',
  NEUTRAL: 'NEUTRAL',
  NEGATIVE: 'NEGATIVE',
};

/**
 * Execution Health - composite of multiple signals
 *
 * GREEN: All signals healthy
 * YELLOW: Some warning signs
 * RED: Critical issues
 */
export const EXECUTION_HEALTH = {
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  RED: 'RED',
};

/**
 * Behavior Context Schema
 *
 * This is the ONLY BTE data that NBA sees.
 * All values are bounded, precomputed, and read-only.
 *
 * @typedef {Object} BehaviorContext
 * @property {string} urgency_level - LOW | MEDIUM | HIGH
 * @property {boolean} hesitation_flag - true if hesitation_index > 0.3
 * @property {string} momentum - POSITIVE | NEUTRAL | NEGATIVE
 * @property {string} execution_health - GREEN | YELLOW | RED
 */

/**
 * Default behavior context when BTE signals unavailable.
 *
 * NBA must function without BTE context.
 */
export const DEFAULT_BEHAVIOR_CONTEXT = {
  urgency_level: URGENCY_LEVELS.LOW,
  hesitation_flag: false,
  momentum: MOMENTUM_TRENDS.NEUTRAL,
  execution_health: EXECUTION_HEALTH.GREEN,
};

/**
 * Extended NBA Input Schema
 *
 * @typedef {Object} NBAInput
 * @property {string} workspace_id - Workspace UUID
 * @property {string} sub_vertical_id - Sub-vertical UUID
 * @property {Object} deal_context - Deal/opportunity context
 * @property {Object} persona_config - Persona configuration
 * @property {BehaviorContext} [behavior_context] - Optional BTE context
 */

/**
 * NBA Output Schema (unchanged)
 *
 * @typedef {Object} NBAOutput
 * @property {string} action - ONE action (never multiple)
 * @property {string} reasoning - Explanation text
 * @property {Object} [metadata] - Optional metadata
 */

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate behavior context has valid bounded values.
 *
 * @param {BehaviorContext} context - Context to validate
 * @returns {boolean} True if valid
 */
export function validateBehaviorContext(context) {
  if (!context) return true; // Optional, so null/undefined is valid

  const validUrgency = Object.values(URGENCY_LEVELS).includes(context.urgency_level);
  const validMomentum = Object.values(MOMENTUM_TRENDS).includes(context.momentum);
  const validHealth = Object.values(EXECUTION_HEALTH).includes(context.execution_health);
  const validHesitation = typeof context.hesitation_flag === 'boolean';

  return validUrgency && validMomentum && validHealth && validHesitation;
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  URGENCY_LEVELS,
  MOMENTUM_TRENDS,
  EXECUTION_HEALTH,
  DEFAULT_BEHAVIOR_CONTEXT,
  validateBehaviorContext,
};
