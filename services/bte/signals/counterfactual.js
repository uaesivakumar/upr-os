/**
 * BTE Counterfactual Signals Computation
 *
 * S262: Behavioral Telemetry Engine
 *
 * Counterfactual signals measure WHAT-IF scenarios:
 * - missed_opportunity_count: NBAs not acted upon that later proved valuable
 * - execution_gap: Difference between recommended and actual timing
 *
 * GUARDRAILS:
 * - Uses BTE reader (READ-ONLY) for all data access
 * - Uses BTE writer for signal output ONLY
 * - No SIVA runtime imports
 * - No envelopes
 * - Deterministic computation
 */

import { readBusinessEvents, readWorkspaceState } from '../reader.js';
import { writeSignal } from '../writer.js';

// ============================================================
// COUNTERFACTUAL SIGNAL: MISSED OPPORTUNITY COUNT
// ============================================================

/**
 * Compute missed opportunity count signal.
 *
 * Measures: Number of ignored NBAs that later proved valuable.
 * An NBA is "missed" if:
 * 1. It was shown but not acted upon
 * 2. A similar action was taken later (too late)
 * 3. OR the opportunity window closed (deal lost, lead cold)
 *
 * Lower = fewer missed opportunities (good)
 * Higher = user missing valuable recommendations (concerning)
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} startTime - Start of computation window
 * @param {Date} endTime - End of computation window
 * @returns {Promise<Object>} Computed signal
 */
export async function computeMissedOpportunityCount(
  workspaceId,
  startTime,
  endTime
) {
  const events = await readBusinessEvents(workspaceId, startTime, endTime);

  // Get all recommendations and actions
  const recommendations = events.filter(
    (e) => e.event_type === 'nba_recommendation_shown'
  );
  const actions = events.filter((e) => e.event_type === 'nba_action_taken');
  const lostOpportunities = events.filter(
    (e) =>
      e.event_type === 'deal_lost' ||
      e.event_type === 'lead_cold' ||
      e.event_type === 'opportunity_expired'
  );

  // Track which recommendations were acted upon
  const actedRecIds = new Set(
    actions
      .map((a) => a.metadata?.recommendation_id)
      .filter((id) => id !== undefined)
  );

  // Count missed opportunities
  let missedCount = 0;
  const missedDetails = [];

  for (const rec of recommendations) {
    const recId = rec.metadata?.recommendation_id;
    if (!recId) continue;

    // Was this recommendation acted upon?
    if (actedRecIds.has(recId)) continue;

    const recTime = new Date(rec.timestamp).getTime();

    // Check if opportunity was lost after this recommendation
    const wasLost = lostOpportunities.some((lost) => {
      const lostTime = new Date(lost.timestamp).getTime();
      return (
        lostTime > recTime &&
        lost.metadata?.entity_id === rec.metadata?.entity_id
      );
    });

    // Check if same action was taken later (too late)
    const takenLater = actions.some((action) => {
      const actionTime = new Date(action.timestamp).getTime();
      const dayLater = recTime + 24 * 60 * 60 * 1000; // 24 hours
      return (
        actionTime > dayLater &&
        action.metadata?.action_type === rec.metadata?.action_type &&
        action.metadata?.entity_id === rec.metadata?.entity_id
      );
    });

    if (wasLost || takenLater) {
      missedCount++;
      missedDetails.push({
        recommendation_id: recId,
        reason: wasLost ? 'opportunity_lost' : 'acted_too_late',
        timestamp: rec.timestamp,
      });
    }
  }

  return {
    signal_type: 'missed_opportunity_count',
    signal_value: missedCount,
    metadata: {
      total_recommendations: recommendations.length,
      missed_count: missedCount,
      missed_details: missedDetails.slice(0, 10), // Limit details
    },
  };
}

// ============================================================
// COUNTERFACTUAL SIGNAL: EXECUTION GAP
// ============================================================

/**
 * Compute execution gap signal.
 *
 * Measures: Average difference between recommended timing and actual timing.
 * This represents "how late" actions are taken relative to recommendations.
 *
 * Lower = acting promptly on recommendations (good)
 * Higher = significant delays in execution (concerning)
 *
 * Formula: AVG(actual_action_time - recommended_action_time) in hours
 * Only counts actions that WERE taken (not missed ones)
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} startTime - Start of computation window
 * @param {Date} endTime - End of computation window
 * @returns {Promise<Object>} Computed signal
 */
export async function computeExecutionGap(workspaceId, startTime, endTime) {
  const events = await readBusinessEvents(workspaceId, startTime, endTime);

  const recommendations = events.filter(
    (e) => e.event_type === 'nba_recommendation_shown'
  );
  const actions = events.filter((e) => e.event_type === 'nba_action_taken');

  if (recommendations.length === 0) {
    return {
      signal_type: 'execution_gap',
      signal_value: 0,
      metadata: { recommendation_count: 0, no_data: true },
    };
  }

  // Calculate gaps for matched recommendation-action pairs
  let totalGapHours = 0;
  let matchedCount = 0;
  const gaps = [];

  for (const rec of recommendations) {
    const recId = rec.metadata?.recommendation_id;
    if (!recId) continue;

    // Find the matching action
    const matchingAction = actions.find(
      (a) => a.metadata?.recommendation_id === recId
    );

    if (matchingAction) {
      const recTime = new Date(rec.timestamp).getTime();
      const actionTime = new Date(matchingAction.timestamp).getTime();

      // Only count if action was after recommendation
      if (actionTime > recTime) {
        const gapHours = (actionTime - recTime) / (1000 * 60 * 60);
        totalGapHours += gapHours;
        matchedCount++;
        gaps.push(gapHours);
      }
    }
  }

  const avgGapHours = matchedCount > 0 ? totalGapHours / matchedCount : 0;

  return {
    signal_type: 'execution_gap',
    signal_value: Math.round(avgGapHours * 100) / 100,
    metadata: {
      recommendation_count: recommendations.length,
      matched_count: matchedCount,
      min_gap_hours: gaps.length > 0 ? Math.round(Math.min(...gaps) * 100) / 100 : 0,
      max_gap_hours: gaps.length > 0 ? Math.round(Math.max(...gaps) * 100) / 100 : 0,
    },
  };
}

// ============================================================
// COMPUTE ALL COUNTERFACTUAL SIGNALS
// ============================================================

/**
 * Compute all counterfactual signals for a workspace.
 *
 * @param {string} workspaceId - Workspace UUID
 * @param {Date} [startTime] - Start of window (default: 30 days ago)
 * @param {Date} [endTime] - End of window (default: now)
 * @returns {Promise<Array>} All computed counterfactual signals
 */
export async function computeAllCounterfactualSignals(
  workspaceId,
  startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  endTime = new Date()
) {
  const signals = await Promise.all([
    computeMissedOpportunityCount(workspaceId, startTime, endTime),
    computeExecutionGap(workspaceId, startTime, endTime),
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
  computeMissedOpportunityCount,
  computeExecutionGap,
  computeAllCounterfactualSignals,
};
