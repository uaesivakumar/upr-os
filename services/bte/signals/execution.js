/**
 * BTE Execution Signals Computation
 *
 * S262: Behavioral Telemetry Engine
 *
 * Execution signals measure ACTION-BASED behavioral patterns:
 * - nba_adoption_rate: Percentage of NBAs acted upon
 * - follow_through_rate: Completion rate of started actions
 * - drop_off_point: Stage where users most commonly abandon
 * - hesitation_index: Frequency of action-cancel-redo patterns
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
  readEventCounts,
  readActionCounts,
} from '../reader.js';
import { writeSignal } from '../writer.js';

// ============================================================
// EXECUTION SIGNAL: NBA ADOPTION RATE
// ============================================================

/**
 * Compute NBA adoption rate signal.
 *
 * Measures: Percentage of NBA recommendations that were acted upon.
 * Higher = user trusts and follows recommendations (good)
 * Lower = user ignores recommendations (concerning)
 *
 * Formula: nba_actions_taken / nba_recommendations_shown
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} startTime - Start of computation window
 * @param {Date} endTime - End of computation window
 * @returns {Promise<Object>} Computed signal
 */
export async function computeNbaAdoptionRate(workspaceId, startTime, endTime) {
  const events = await readBusinessEvents(workspaceId, startTime, endTime);

  const recommendations = events.filter(
    (e) => e.event_type === 'nba_recommendation_shown'
  );
  const actions = events.filter((e) => e.event_type === 'nba_action_taken');

  if (recommendations.length === 0) {
    return {
      signal_type: 'nba_adoption_rate',
      signal_value: 0,
      metadata: { recommendations: 0, actions: 0, no_data: true },
    };
  }

  const adoptionRate = actions.length / recommendations.length;

  return {
    signal_type: 'nba_adoption_rate',
    signal_value: Math.round(Math.min(1, adoptionRate) * 100) / 100, // Cap at 1.0
    metadata: {
      recommendations: recommendations.length,
      actions: actions.length,
    },
  };
}

// ============================================================
// EXECUTION SIGNAL: FOLLOW-THROUGH RATE
// ============================================================

/**
 * Compute follow-through rate signal.
 *
 * Measures: Percentage of started workflows that were completed.
 * Higher = users complete what they start (good)
 * Lower = users abandon mid-process (concerning)
 *
 * Formula: workflow_completed / workflow_started
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} startTime - Start of computation window
 * @param {Date} endTime - End of computation window
 * @returns {Promise<Object>} Computed signal
 */
export async function computeFollowThroughRate(
  workspaceId,
  startTime,
  endTime
) {
  const events = await readBusinessEvents(workspaceId, startTime, endTime);

  const started = events.filter((e) => e.event_type === 'workflow_started');
  const completed = events.filter((e) => e.event_type === 'workflow_completed');

  if (started.length === 0) {
    return {
      signal_type: 'follow_through_rate',
      signal_value: 0,
      metadata: { started: 0, completed: 0, no_data: true },
    };
  }

  const followThroughRate = completed.length / started.length;

  return {
    signal_type: 'follow_through_rate',
    signal_value: Math.round(Math.min(1, followThroughRate) * 100) / 100,
    metadata: {
      started: started.length,
      completed: completed.length,
    },
  };
}

// ============================================================
// EXECUTION SIGNAL: DROP-OFF POINT
// ============================================================

/**
 * Compute drop-off point signal.
 *
 * Measures: The sales stage with highest abandonment rate.
 * Returns encoded stage number (1-5) for numeric signal.
 *
 * Stages:
 * 1 = discovery
 * 2 = qualification
 * 3 = proposal
 * 4 = negotiation
 * 5 = closing
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} startTime - Start of computation window
 * @param {Date} endTime - End of computation window
 * @returns {Promise<Object>} Computed signal
 */
export async function computeDropOffPoint(workspaceId, startTime, endTime) {
  const events = await readBusinessEvents(workspaceId, startTime, endTime);

  // Stage encoding
  const stageMap = {
    discovery: 1,
    qualification: 2,
    proposal: 3,
    negotiation: 4,
    closing: 5,
  };

  // Count stage transitions
  const stageEnters = {};
  const stageExits = {};

  for (const event of events) {
    if (event.event_type === 'stage_entered') {
      const stage = event.metadata?.stage || 'unknown';
      stageEnters[stage] = (stageEnters[stage] || 0) + 1;
    }
    if (
      event.event_type === 'stage_exited' ||
      event.event_type === 'stage_completed'
    ) {
      const stage = event.metadata?.stage || 'unknown';
      stageExits[stage] = (stageExits[stage] || 0) + 1;
    }
  }

  // Calculate drop-off rate per stage
  let maxDropOff = 0;
  let dropOffStage = 'discovery';

  for (const stage of Object.keys(stageMap)) {
    const enters = stageEnters[stage] || 0;
    const exits = stageExits[stage] || 0;
    if (enters > 0) {
      const dropOffRate = (enters - exits) / enters;
      if (dropOffRate > maxDropOff) {
        maxDropOff = dropOffRate;
        dropOffStage = stage;
      }
    }
  }

  return {
    signal_type: 'drop_off_point',
    signal_value: stageMap[dropOffStage] || 1,
    metadata: {
      drop_off_stage: dropOffStage,
      drop_off_rate: Math.round(maxDropOff * 100) / 100,
      stage_enters: stageEnters,
      stage_exits: stageExits,
    },
  };
}

// ============================================================
// EXECUTION SIGNAL: HESITATION INDEX
// ============================================================

/**
 * Compute hesitation index signal.
 *
 * Measures: Frequency of action-cancel-redo patterns.
 * Lower = decisive user (good)
 * Higher = indecisive/uncertain user (concerning)
 *
 * Formula: (cancel_count + undo_count) / total_actions
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} startTime - Start of computation window
 * @param {Date} endTime - End of computation window
 * @returns {Promise<Object>} Computed signal
 */
export async function computeHesitationIndex(workspaceId, startTime, endTime) {
  const actions = await readUserActions(workspaceId, startTime, endTime);

  if (actions.length === 0) {
    return {
      signal_type: 'hesitation_index',
      signal_value: 0,
      metadata: { total_actions: 0, no_data: true },
    };
  }

  // Count hesitation patterns
  const cancels = actions.filter(
    (a) =>
      a.action_type === 'cancel' ||
      a.action_type === 'abort' ||
      a.action_type === 'dismiss'
  );

  const undos = actions.filter(
    (a) =>
      a.action_type === 'undo' ||
      a.action_type === 'revert' ||
      a.action_type === 'rollback'
  );

  const hesitationCount = cancels.length + undos.length;
  const hesitationIndex = hesitationCount / actions.length;

  return {
    signal_type: 'hesitation_index',
    signal_value: Math.round(hesitationIndex * 100) / 100,
    metadata: {
      total_actions: actions.length,
      cancel_count: cancels.length,
      undo_count: undos.length,
    },
  };
}

// ============================================================
// COMPUTE ALL EXECUTION SIGNALS
// ============================================================

/**
 * Compute all execution signals for a workspace.
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} [startTime] - Start of window (default: 30 days ago)
 * @param {Date} [endTime] - End of window (default: now)
 * @returns {Promise<Array>} All computed execution signals
 */
export async function computeAllExecutionSignals(
  workspaceId,
  startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  endTime = new Date()
) {
  const signals = await Promise.all([
    computeNbaAdoptionRate(workspaceId, startTime, endTime),
    computeFollowThroughRate(workspaceId, startTime, endTime),
    computeDropOffPoint(workspaceId, startTime, endTime),
    computeHesitationIndex(workspaceId, startTime, endTime),
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
  computeNbaAdoptionRate,
  computeFollowThroughRate,
  computeDropOffPoint,
  computeHesitationIndex,
  computeAllExecutionSignals,
};
