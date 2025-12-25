/**
 * NBA Context Adapter
 *
 * S266-F2: Context Adapter (ISOLATION LAYER)
 *
 * This is the ONLY place NBA sees BTE.
 * NBA core logic must NOT query BTE directly.
 *
 * Responsibilities:
 * 1. Read latest BTE signals
 * 2. Map signals → bounded context values
 * 3. Version the mapping logic
 *
 * GUARDRAILS:
 * - No raw BTE signals passed through
 * - No numeric thresholds exposed externally
 * - All mapping logic is versioned and auditable
 * - BTE must NOT suggest, rank, or suppress actions
 */

import { readLatestSignal, readSignals } from '../bte/reader.js';
import {
  URGENCY_LEVELS,
  MOMENTUM_TRENDS,
  EXECUTION_HEALTH,
  DEFAULT_BEHAVIOR_CONTEXT,
  validateBehaviorContext,
} from './behavior-context.js';

// ============================================================
// ADAPTER VERSION
// ============================================================

/**
 * Adapter version for tracking mapping logic changes.
 * Increment when mapping thresholds change.
 */
export const ADAPTER_VERSION = '1.0.0';

// ============================================================
// INTERNAL THRESHOLDS (NOT EXPOSED)
// ============================================================

// These thresholds are internal to the adapter.
// NBA never sees these numeric values.

const THRESHOLDS = {
  // Urgency (from idle_decay)
  URGENCY_LOW_MAX: 3,       // < 3 days = LOW
  URGENCY_MEDIUM_MAX: 7,    // 3-7 days = MEDIUM
                            // > 7 days = HIGH

  // Hesitation (from hesitation_index)
  HESITATION_THRESHOLD: 0.3, // > 0.3 = hesitation_flag true

  // Momentum (from momentum signal)
  MOMENTUM_POSITIVE_MIN: 0.2,  // > 0.2 = POSITIVE
  MOMENTUM_NEGATIVE_MAX: -0.2, // < -0.2 = NEGATIVE
                               // else NEUTRAL

  // Execution Health (composite)
  HEALTH_NBA_ADOPTION_WARNING: 0.5,
  HEALTH_FOLLOW_THROUGH_WARNING: 0.5,
  HEALTH_IDLE_CRITICAL: 7,
};

// ============================================================
// SIGNAL MAPPING FUNCTIONS
// ============================================================

/**
 * Map idle_decay signal to urgency_level.
 *
 * @param {number|null} idleDecay - Days since last activity
 * @returns {string} URGENCY_LEVELS value
 */
function mapUrgencyLevel(idleDecay) {
  if (idleDecay === null || idleDecay === undefined) {
    return URGENCY_LEVELS.LOW;
  }

  if (idleDecay < THRESHOLDS.URGENCY_LOW_MAX) {
    return URGENCY_LEVELS.LOW;
  } else if (idleDecay <= THRESHOLDS.URGENCY_MEDIUM_MAX) {
    return URGENCY_LEVELS.MEDIUM;
  } else {
    return URGENCY_LEVELS.HIGH;
  }
}

/**
 * Map hesitation_index signal to hesitation_flag.
 *
 * @param {number|null} hesitationIndex - Hesitation index (0-1)
 * @returns {boolean} True if hesitation detected
 */
function mapHesitationFlag(hesitationIndex) {
  if (hesitationIndex === null || hesitationIndex === undefined) {
    return false;
  }

  return hesitationIndex > THRESHOLDS.HESITATION_THRESHOLD;
}

/**
 * Map momentum signal to momentum trend.
 *
 * @param {number|null} momentum - Momentum value (-1 to 1)
 * @returns {string} MOMENTUM_TRENDS value
 */
function mapMomentumTrend(momentum) {
  if (momentum === null || momentum === undefined) {
    return MOMENTUM_TRENDS.NEUTRAL;
  }

  if (momentum > THRESHOLDS.MOMENTUM_POSITIVE_MIN) {
    return MOMENTUM_TRENDS.POSITIVE;
  } else if (momentum < THRESHOLDS.MOMENTUM_NEGATIVE_MAX) {
    return MOMENTUM_TRENDS.NEGATIVE;
  } else {
    return MOMENTUM_TRENDS.NEUTRAL;
  }
}

/**
 * Map multiple signals to execution health.
 *
 * @param {Object} signals - Signal map
 * @returns {string} EXECUTION_HEALTH value
 */
function mapExecutionHealth(signals) {
  const nbaAdoption = signals['nba_adoption_rate'];
  const followThrough = signals['follow_through_rate'];
  const idleDecay = signals['idle_decay'];

  // Check for RED conditions
  if (
    (idleDecay !== undefined && idleDecay > THRESHOLDS.HEALTH_IDLE_CRITICAL) ||
    (nbaAdoption !== undefined && nbaAdoption < 0.3) ||
    (followThrough !== undefined && followThrough < 0.3)
  ) {
    return EXECUTION_HEALTH.RED;
  }

  // Check for YELLOW conditions
  if (
    (nbaAdoption !== undefined && nbaAdoption < THRESHOLDS.HEALTH_NBA_ADOPTION_WARNING) ||
    (followThrough !== undefined && followThrough < THRESHOLDS.HEALTH_FOLLOW_THROUGH_WARNING)
  ) {
    return EXECUTION_HEALTH.YELLOW;
  }

  return EXECUTION_HEALTH.GREEN;
}

// ============================================================
// MAIN ADAPTER FUNCTION
// ============================================================

/**
 * Build behavior context from BTE signals.
 *
 * This is the SOLE interface between BTE and NBA.
 *
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<Object>} Behavior context with adapter version
 */
export async function buildBehaviorContext(workspaceId) {
  try {
    // Read all signals for this workspace
    const signals = await readSignals('workspace', workspaceId);

    // Build signal map
    const signalMap = {};
    for (const s of signals) {
      signalMap[s.signal_type] = parseFloat(s.signal_value);
    }

    // Map to bounded context values
    const context = {
      urgency_level: mapUrgencyLevel(signalMap['idle_decay']),
      hesitation_flag: mapHesitationFlag(signalMap['hesitation_index']),
      momentum: mapMomentumTrend(signalMap['momentum']),
      execution_health: mapExecutionHealth(signalMap),
    };

    // Validate context
    if (!validateBehaviorContext(context)) {
      console.error('[CONTEXT_ADAPTER] Invalid context generated, using default');
      return {
        ...DEFAULT_BEHAVIOR_CONTEXT,
        _adapter_version: ADAPTER_VERSION,
        _source: 'default_fallback',
      };
    }

    return {
      ...context,
      _adapter_version: ADAPTER_VERSION,
      _source: 'bte_signals',
    };
  } catch (error) {
    console.error('[CONTEXT_ADAPTER] Error building context:', error.message);

    // Return default context on error - NBA must still function
    return {
      ...DEFAULT_BEHAVIOR_CONTEXT,
      _adapter_version: ADAPTER_VERSION,
      _source: 'error_fallback',
    };
  }
}

/**
 * Build behavior context from pre-loaded signals.
 *
 * Use this when signals are already available (e.g., batch processing).
 *
 * @param {Object} signalMap - Pre-loaded signal map
 * @returns {Object} Behavior context
 */
export function buildBehaviorContextFromSignals(signalMap) {
  const context = {
    urgency_level: mapUrgencyLevel(signalMap['idle_decay']),
    hesitation_flag: mapHesitationFlag(signalMap['hesitation_index']),
    momentum: mapMomentumTrend(signalMap['momentum']),
    execution_health: mapExecutionHealth(signalMap),
  };

  if (!validateBehaviorContext(context)) {
    return {
      ...DEFAULT_BEHAVIOR_CONTEXT,
      _adapter_version: ADAPTER_VERSION,
      _source: 'default_fallback',
    };
  }

  return {
    ...context,
    _adapter_version: ADAPTER_VERSION,
    _source: 'preloaded_signals',
  };
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  ADAPTER_VERSION,
  buildBehaviorContext,
  buildBehaviorContextFromSignals,
};
