/**
 * BTE Temporal Signals Computation
 *
 * S262: Behavioral Telemetry Engine
 *
 * Temporal signals measure TIME-BASED behavioral patterns:
 * - decision_latency: Time between recommendation and action
 * - idle_decay: Workspace inactivity degradation
 * - momentum: Acceleration/deceleration of activity
 * - execution_consistency: Regularity of action patterns
 *
 * GUARDRAILS:
 * - Uses BTE reader (READ-ONLY) for all data access
 * - Uses BTE writer for signal output ONLY
 * - No SIVA runtime imports
 * - No envelopes
 * - Deterministic computation
 */

import {
  readBusinessEvents,
  readUserActions,
  readWorkspaceState,
  readThresholdsMap,
} from '../reader.js';
import { writeSignal } from '../writer.js';

// ============================================================
// TEMPORAL SIGNAL: DECISION LATENCY
// ============================================================

/**
 * Compute decision latency signal.
 *
 * Measures: Average time between NBA recommendation and user action.
 * Lower = faster decisions (good)
 * Higher = slower decisions (friction indicator)
 *
 * Formula: AVG(action_timestamp - recommendation_timestamp) in hours
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} startTime - Start of computation window
 * @param {Date} endTime - End of computation window
 * @returns {Promise<Object>} Computed signal
 */
export async function computeDecisionLatency(workspaceId, startTime, endTime) {
  // Get all recommendation events
  const events = await readBusinessEvents(workspaceId, startTime, endTime);

  // Find recommendation -> action pairs
  const recommendations = events.filter(
    (e) => e.event_type === 'nba_recommendation_shown'
  );
  const actions = events.filter((e) => e.event_type === 'nba_action_taken');

  if (recommendations.length === 0) {
    // No recommendations, no latency to measure
    return {
      signal_type: 'decision_latency',
      signal_value: 0,
      metadata: { recommendation_count: 0, action_count: 0 },
    };
  }

  // Match recommendations to subsequent actions
  let totalLatencyHours = 0;
  let matchedPairs = 0;

  for (const rec of recommendations) {
    const recTime = new Date(rec.timestamp).getTime();

    // Find first action after this recommendation
    const subsequentAction = actions.find((a) => {
      const actionTime = new Date(a.timestamp).getTime();
      return (
        actionTime > recTime &&
        a.metadata?.recommendation_id === rec.metadata?.recommendation_id
      );
    });

    if (subsequentAction) {
      const actionTime = new Date(subsequentAction.timestamp).getTime();
      const latencyMs = actionTime - recTime;
      const latencyHours = latencyMs / (1000 * 60 * 60);
      totalLatencyHours += latencyHours;
      matchedPairs++;
    }
  }

  const avgLatencyHours =
    matchedPairs > 0 ? totalLatencyHours / matchedPairs : 0;

  return {
    signal_type: 'decision_latency',
    signal_value: Math.round(avgLatencyHours * 100) / 100, // 2 decimal places
    metadata: {
      recommendation_count: recommendations.length,
      action_count: actions.length,
      matched_pairs: matchedPairs,
    },
  };
}

// ============================================================
// TEMPORAL SIGNAL: IDLE DECAY
// ============================================================

/**
 * Compute idle decay signal.
 *
 * Measures: Days since last meaningful activity.
 * Lower = recent activity (good)
 * Higher = workspace going stale (intervention needed)
 *
 * Formula: NOW() - last_action_timestamp in days
 *
 * @param {string} workspaceId - Workspace UUID
 * @returns {Promise<Object>} Computed signal
 */
export async function computeIdleDecay(workspaceId) {
  const state = await readWorkspaceState(workspaceId);

  if (!state || !state.last_action_taken_at) {
    // No state or no actions ever, maximum decay
    return {
      signal_type: 'idle_decay',
      signal_value: 999, // Max value indicates never active
      metadata: { last_action: null },
    };
  }

  const lastActionTime = new Date(state.last_action_taken_at).getTime();
  const nowTime = Date.now();
  const idleDays = (nowTime - lastActionTime) / (1000 * 60 * 60 * 24);

  return {
    signal_type: 'idle_decay',
    signal_value: Math.round(idleDays * 100) / 100, // 2 decimal places
    metadata: {
      last_action: state.last_action_taken_at,
      current_stage: state.current_sales_stage,
    },
  };
}

// ============================================================
// TEMPORAL SIGNAL: MOMENTUM
// ============================================================

/**
 * Compute momentum signal.
 *
 * Measures: Rate of change in activity frequency.
 * Positive = accelerating (good)
 * Negative = decelerating (concerning)
 * Zero = stable
 *
 * Formula: (events_recent_half - events_older_half) / events_older_half
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} startTime - Start of computation window
 * @param {Date} endTime - End of computation window
 * @returns {Promise<Object>} Computed signal
 */
export async function computeMomentum(workspaceId, startTime, endTime) {
  const events = await readBusinessEvents(workspaceId, startTime, endTime);

  if (events.length < 2) {
    // Not enough data for momentum calculation
    return {
      signal_type: 'momentum',
      signal_value: 0,
      metadata: { event_count: events.length, insufficient_data: true },
    };
  }

  // Split window into two halves
  const midTime =
    new Date(startTime).getTime() +
    (new Date(endTime).getTime() - new Date(startTime).getTime()) / 2;

  const olderHalf = events.filter(
    (e) => new Date(e.timestamp).getTime() < midTime
  );
  const recentHalf = events.filter(
    (e) => new Date(e.timestamp).getTime() >= midTime
  );

  const olderCount = olderHalf.length;
  const recentCount = recentHalf.length;

  // Calculate momentum (rate of change)
  let momentum = 0;
  if (olderCount > 0) {
    momentum = (recentCount - olderCount) / olderCount;
  } else if (recentCount > 0) {
    momentum = 1; // Started from nothing, positive momentum
  }

  return {
    signal_type: 'momentum',
    signal_value: Math.round(momentum * 100) / 100, // 2 decimal places
    metadata: {
      older_half_count: olderCount,
      recent_half_count: recentCount,
    },
  };
}

// ============================================================
// TEMPORAL SIGNAL: EXECUTION CONSISTENCY
// ============================================================

/**
 * Compute execution consistency signal.
 *
 * Measures: Regularity of action patterns (low variance = consistent).
 * Higher = more consistent (good)
 * Lower = erratic patterns (concerning)
 *
 * Formula: 1 - (std_dev(inter_action_gaps) / mean(inter_action_gaps))
 * Coefficient of variation inverted so higher = better
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} startTime - Start of computation window
 * @param {Date} endTime - End of computation window
 * @returns {Promise<Object>} Computed signal
 */
export async function computeExecutionConsistency(
  workspaceId,
  startTime,
  endTime
) {
  const actions = await readUserActions(workspaceId, startTime, endTime);

  if (actions.length < 3) {
    // Not enough data for consistency calculation
    return {
      signal_type: 'execution_consistency',
      signal_value: 0,
      metadata: { action_count: actions.length, insufficient_data: true },
    };
  }

  // Calculate inter-action gaps
  const gaps = [];
  for (let i = 1; i < actions.length; i++) {
    const prevTime = new Date(actions[i - 1].timestamp).getTime();
    const currTime = new Date(actions[i].timestamp).getTime();
    gaps.push(currTime - prevTime);
  }

  // Calculate mean and standard deviation
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const variance =
    gaps.reduce((sum, gap) => sum + Math.pow(gap - mean, 2), 0) / gaps.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of variation (CV)
  const cv = mean > 0 ? stdDev / mean : 0;

  // Invert so higher = more consistent
  // Cap at 1.0 for very consistent, 0.0 for very inconsistent
  const consistency = Math.max(0, Math.min(1, 1 - cv));

  return {
    signal_type: 'execution_consistency',
    signal_value: Math.round(consistency * 100) / 100, // 2 decimal places
    metadata: {
      action_count: actions.length,
      gap_count: gaps.length,
      mean_gap_ms: Math.round(mean),
      std_dev_ms: Math.round(stdDev),
    },
  };
}

// ============================================================
// COMPUTE ALL TEMPORAL SIGNALS
// ============================================================

/**
 * Compute all temporal signals for a workspace.
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} [startTime] - Start of window (default: 30 days ago)
 * @param {Date} [endTime] - End of window (default: now)
 * @returns {Promise<Array>} All computed temporal signals
 */
export async function computeAllTemporalSignals(
  workspaceId,
  startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  endTime = new Date()
) {
  const signals = await Promise.all([
    computeDecisionLatency(workspaceId, startTime, endTime),
    computeIdleDecay(workspaceId),
    computeMomentum(workspaceId, startTime, endTime),
    computeExecutionConsistency(workspaceId, startTime, endTime),
  ]);

  // Write all signals to bte_signals
  const writtenSignals = [];
  for (const signal of signals) {
    const written = await writeSignal({
      entity_type: 'workspace',
      entity_id: workspaceId,
      signal_type: signal.signal_type,
      signal_value: signal.signal_value,
      version: 1,
    });
    writtenSignals.push({
      ...written,
      metadata: signal.metadata,
    });
  }

  return writtenSignals;
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  computeDecisionLatency,
  computeIdleDecay,
  computeMomentum,
  computeExecutionConsistency,
  computeAllTemporalSignals,
};
