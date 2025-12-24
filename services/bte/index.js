/**
 * Behavioral Telemetry Engine (BTE) - Main Export
 *
 * S262: BTE v1 Implementation
 *
 * BTE is the behavioral intelligence layer that computes signals
 * from user actions and business events. It is READ-ONLY for core
 * data tables and writes ONLY to bte_signals.
 *
 * ARCHITECTURE:
 * - READ-ONLY access to: business_events, user_actions, workspace_state
 * - WRITE access to: bte_signals ONLY (computed output)
 * - CONFIGURABLE via: bte_thresholds (Super Admin controlled)
 *
 * SIGNAL CATEGORIES:
 * 1. Temporal: Time-based patterns (latency, decay, momentum)
 * 2. Execution: Action-based patterns (adoption, follow-through)
 * 3. Counterfactual: What-if analysis (missed opportunities)
 *
 * GUARDRAILS:
 * - No SIVA runtime imports
 * - No envelopes
 * - Deterministic computation only
 * - All outputs recomputable from raw events
 */

// Core reader/writer
export { readQuery, readOne, readThresholdsMap } from './reader.js';
export { writeSignal, writeSignals } from './writer.js';

// Temporal signals
export {
  computeDecisionLatency,
  computeIdleDecay,
  computeMomentum,
  computeExecutionConsistency,
  computeAllTemporalSignals,
} from './signals/temporal.js';

// Execution signals
export {
  computeNbaAdoptionRate,
  computeFollowThroughRate,
  computeDropOffPoint,
  computeHesitationIndex,
  computeAllExecutionSignals,
} from './signals/execution.js';

// Counterfactual signals
export {
  computeMissedOpportunityCount,
  computeExecutionGap,
  computeAllCounterfactualSignals,
} from './signals/counterfactual.js';

// ============================================================
// COMPUTE ALL SIGNALS
// ============================================================

import { computeAllTemporalSignals } from './signals/temporal.js';
import { computeAllExecutionSignals } from './signals/execution.js';
import { computeAllCounterfactualSignals } from './signals/counterfactual.js';

/**
 * Compute ALL BTE signals for a workspace.
 *
 * This is the main entry point for BTE signal computation.
 * It computes all temporal, execution, and counterfactual signals.
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} [startTime] - Start of window (default: 30 days ago)
 * @param {Date} [endTime] - End of window (default: now)
 * @returns {Promise<Object>} All computed signals by category
 */
export async function computeAllSignals(
  workspaceId,
  startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  endTime = new Date()
) {
  const [temporal, execution, counterfactual] = await Promise.all([
    computeAllTemporalSignals(workspaceId, startTime, endTime),
    computeAllExecutionSignals(workspaceId, startTime, endTime),
    computeAllCounterfactualSignals(workspaceId, startTime, endTime),
  ]);

  return {
    workspace_id: workspaceId,
    computed_at: new Date().toISOString(),
    window: {
      start: startTime.toISOString(),
      end: endTime.toISOString(),
    },
    signals: {
      temporal,
      execution,
      counterfactual,
    },
    summary: {
      total_signals: temporal.length + execution.length + counterfactual.length,
      temporal_count: temporal.length,
      execution_count: execution.length,
      counterfactual_count: counterfactual.length,
    },
  };
}

// ============================================================
// DEFAULT EXPORT
// ============================================================

export default {
  // Main entry point
  computeAllSignals,

  // By category
  computeAllTemporalSignals,
  computeAllExecutionSignals,
  computeAllCounterfactualSignals,
};
