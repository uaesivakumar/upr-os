/**
 * Journey State Service
 * Sprint 51: LLM Engine Routing
 *
 * Manages LLM journey state for multi-step AI workflows.
 * Enables pause/resume/abort functionality for long-running operations.
 *
 * Key Features:
 * - State persistence for multi-step journeys
 * - Checkpoint management for resume capability
 * - Conversation history tracking
 * - Cost accumulation per journey
 * - Graceful abort with cleanup
 */

import db from '../../utils/db.js';
import crypto from 'crypto';

const { pool } = db;

// ============================================================================
// JOURNEY LIFECYCLE
// ============================================================================

/**
 * Start a new journey
 *
 * @param {Object} params
 * @param {string} params.journeyId - External journey identifier
 * @param {string} params.initialStep - First step name
 * @param {Object} [params.stateData] - Initial state data
 * @param {string} [params.modelSlug] - Preferred model for this journey
 * @returns {Promise<Object>} Created journey state
 */
async function startJourney({ journeyId, initialStep, stateData = {}, modelSlug }) {
  // Get model ID if slug provided
  let modelId = null;
  if (modelSlug) {
    const modelResult = await pool.query(
      'SELECT id FROM llm_models WHERE slug = $1',
      [modelSlug]
    );
    modelId = modelResult.rows[0]?.id;
  }

  const result = await pool.query(`
    INSERT INTO llm_journey_states
      (journey_id, current_step, state_data, model_id, conversation_history, status)
    VALUES ($1, $2, $3, $4, '[]'::jsonb, 'active')
    RETURNING *
  `, [journeyId, initialStep, JSON.stringify(stateData), modelId]);

  console.log(`[JourneyState] Started journey: ${journeyId} at step: ${initialStep}`);

  return result.rows[0];
}

/**
 * Get journey state by ID
 */
async function getJourneyState(journeyId) {
  const result = await pool.query(`
    SELECT js.*, m.slug as model_slug, m.model_id as provider_model_id
    FROM llm_journey_states js
    LEFT JOIN llm_models m ON js.model_id = m.id
    WHERE js.journey_id = $1
    ORDER BY js.created_at DESC
    LIMIT 1
  `, [journeyId]);

  return result.rows[0] || null;
}

/**
 * Update journey step
 */
async function updateStep(journeyId, stepName, stateData = {}) {
  const result = await pool.query(`
    UPDATE llm_journey_states
    SET
      current_step = $2,
      state_data = state_data || $3::jsonb,
      last_successful_step = current_step,
      resume_checkpoint = jsonb_build_object(
        'step', current_step,
        'timestamp', NOW()::text,
        'state', state_data
      ),
      updated_at = NOW()
    WHERE journey_id = $1 AND status = 'active'
    RETURNING *
  `, [journeyId, stepName, JSON.stringify(stateData)]);

  if (result.rows.length === 0) {
    throw new Error(`Journey not found or not active: ${journeyId}`);
  }

  console.log(`[JourneyState] Updated journey ${journeyId} to step: ${stepName}`);

  return result.rows[0];
}

/**
 * Add message to conversation history
 */
async function addToHistory(journeyId, message) {
  const result = await pool.query(`
    UPDATE llm_journey_states
    SET
      conversation_history = conversation_history || $2::jsonb,
      updated_at = NOW()
    WHERE journey_id = $1 AND status IN ('active', 'paused')
    RETURNING *
  `, [journeyId, JSON.stringify([message])]);

  return result.rows[0];
}

/**
 * Get conversation history
 */
async function getHistory(journeyId) {
  const result = await pool.query(`
    SELECT conversation_history FROM llm_journey_states
    WHERE journey_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `, [journeyId]);

  return result.rows[0]?.conversation_history || [];
}

/**
 * Update token usage for journey
 */
async function recordTokenUsage(journeyId, inputTokens, outputTokens, cost) {
  await pool.query(`
    UPDATE llm_journey_states
    SET
      total_tokens_used = total_tokens_used + $2 + $3,
      total_cost = total_cost + $4,
      updated_at = NOW()
    WHERE journey_id = $1
  `, [journeyId, inputTokens, outputTokens, cost]);
}

// ============================================================================
// PAUSE/RESUME LOGIC
// ============================================================================

/**
 * Pause a journey
 *
 * @param {string} journeyId
 * @param {string} [reason] - Reason for pausing
 * @returns {Promise<Object>} Updated journey state
 */
async function pauseJourney(journeyId, reason = 'User requested') {
  const result = await pool.query(`
    UPDATE llm_journey_states
    SET
      status = 'paused',
      pause_reason = $2,
      paused_at = NOW(),
      resume_checkpoint = jsonb_build_object(
        'step', current_step,
        'timestamp', NOW()::text,
        'state', state_data,
        'history_length', jsonb_array_length(conversation_history)
      ),
      updated_at = NOW()
    WHERE journey_id = $1 AND status = 'active'
    RETURNING *
  `, [journeyId, reason]);

  if (result.rows.length === 0) {
    throw new Error(`Journey not found or cannot be paused: ${journeyId}`);
  }

  console.log(`[JourneyState] Paused journey: ${journeyId} - ${reason}`);

  return result.rows[0];
}

/**
 * Resume a paused journey
 *
 * @param {string} journeyId
 * @param {Object} [options]
 * @param {boolean} [options.fromCheckpoint=true] - Resume from last checkpoint
 * @param {string} [options.overrideStep] - Override the step to resume from
 * @returns {Promise<Object>} Journey state with resume info
 */
async function resumeJourney(journeyId, options = {}) {
  const { fromCheckpoint = true, overrideStep } = options;

  // Get current state
  const journey = await getJourneyState(journeyId);

  if (!journey) {
    throw new Error(`Journey not found: ${journeyId}`);
  }

  if (journey.status !== 'paused') {
    throw new Error(`Journey is not paused: ${journeyId} (status: ${journey.status})`);
  }

  if (!journey.is_resumable) {
    throw new Error(`Journey is not resumable: ${journeyId}`);
  }

  // Determine resume point
  let resumeStep = journey.current_step;
  let resumeState = journey.state_data;

  if (fromCheckpoint && journey.resume_checkpoint) {
    resumeStep = journey.resume_checkpoint.step || resumeStep;
    resumeState = journey.resume_checkpoint.state || resumeState;
  }

  if (overrideStep) {
    resumeStep = overrideStep;
  }

  // Update journey status
  const result = await pool.query(`
    UPDATE llm_journey_states
    SET
      status = 'active',
      current_step = $2,
      state_data = $3::jsonb,
      resumed_at = NOW(),
      pause_reason = NULL,
      updated_at = NOW()
    WHERE journey_id = $1
    RETURNING *
  `, [journeyId, resumeStep, JSON.stringify(resumeState)]);

  console.log(`[JourneyState] Resumed journey: ${journeyId} at step: ${resumeStep}`);

  return {
    ...result.rows[0],
    resumedFrom: {
      step: resumeStep,
      checkpoint: journey.resume_checkpoint
    }
  };
}

/**
 * Check if journey can be resumed
 */
async function canResume(journeyId) {
  const journey = await getJourneyState(journeyId);

  if (!journey) {
    return { canResume: false, reason: 'Journey not found' };
  }

  if (journey.status === 'completed') {
    return { canResume: false, reason: 'Journey already completed' };
  }

  if (journey.status === 'aborted') {
    return { canResume: false, reason: 'Journey was aborted' };
  }

  if (!journey.is_resumable) {
    return { canResume: false, reason: 'Journey marked as non-resumable' };
  }

  return {
    canResume: true,
    currentStep: journey.current_step,
    checkpoint: journey.resume_checkpoint,
    pausedAt: journey.paused_at
  };
}

// ============================================================================
// ABORT LOGIC
// ============================================================================

/**
 * Abort a journey
 *
 * @param {string} journeyId
 * @param {string} reason - Reason for aborting
 * @param {Object} [options]
 * @param {boolean} [options.cleanup=true] - Clean up associated resources
 * @returns {Promise<Object>} Final journey state
 */
async function abortJourney(journeyId, reason, options = {}) {
  const { cleanup = true } = options;

  // Get current state before abort
  const journey = await getJourneyState(journeyId);

  if (!journey) {
    throw new Error(`Journey not found: ${journeyId}`);
  }

  if (journey.status === 'completed' || journey.status === 'aborted') {
    throw new Error(`Journey already ${journey.status}: ${journeyId}`);
  }

  // Update journey status
  const result = await pool.query(`
    UPDATE llm_journey_states
    SET
      status = 'aborted',
      abort_reason = $2,
      aborted_at = NOW(),
      is_resumable = false,
      updated_at = NOW()
    WHERE journey_id = $1
    RETURNING *
  `, [journeyId, reason]);

  console.log(`[JourneyState] Aborted journey: ${journeyId} - ${reason}`);

  // Cleanup if requested
  if (cleanup) {
    await cleanupJourney(journeyId);
  }

  return {
    ...result.rows[0],
    previousStatus: journey.status,
    tokensUsed: journey.total_tokens_used,
    totalCost: journey.total_cost
  };
}

/**
 * Clean up journey resources
 */
async function cleanupJourney(journeyId) {
  try {
    // Clear sensitive data from state
    await pool.query(`
      UPDATE llm_journey_states
      SET
        conversation_history = '[]'::jsonb,
        state_data = jsonb_build_object('cleaned', true, 'cleaned_at', NOW()::text)
      WHERE journey_id = $1 AND status = 'aborted'
    `, [journeyId]);

    console.log(`[JourneyState] Cleaned up journey: ${journeyId}`);
  } catch (error) {
    console.error(`[JourneyState] Cleanup failed for ${journeyId}:`, error.message);
  }
}

/**
 * Force abort with timeout
 * Used when a journey has been running too long
 */
async function forceAbortStale(maxAgeMinutes = 60) {
  const result = await pool.query(`
    UPDATE llm_journey_states
    SET
      status = 'aborted',
      abort_reason = 'Stale journey timeout',
      aborted_at = NOW(),
      is_resumable = false
    WHERE status = 'active'
      AND updated_at < NOW() - INTERVAL '${maxAgeMinutes} minutes'
    RETURNING journey_id
  `);

  if (result.rows.length > 0) {
    console.log(`[JourneyState] Force aborted ${result.rows.length} stale journeys`);
  }

  return result.rows.map(r => r.journey_id);
}

// ============================================================================
// COMPLETION
// ============================================================================

/**
 * Complete a journey successfully
 */
async function completeJourney(journeyId, finalState = {}) {
  const result = await pool.query(`
    UPDATE llm_journey_states
    SET
      status = 'completed',
      state_data = state_data || $2::jsonb,
      completed_at = NOW(),
      is_resumable = false,
      updated_at = NOW()
    WHERE journey_id = $1 AND status = 'active'
    RETURNING *
  `, [journeyId, JSON.stringify(finalState)]);

  if (result.rows.length === 0) {
    throw new Error(`Journey not found or not active: ${journeyId}`);
  }

  console.log(`[JourneyState] Completed journey: ${journeyId}`);

  return result.rows[0];
}

// ============================================================================
// QUERY HELPERS
// ============================================================================

/**
 * List active journeys
 */
async function listActiveJourneys(limit = 100) {
  const result = await pool.query(`
    SELECT * FROM llm_journey_states
    WHERE status = 'active'
    ORDER BY updated_at DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
}

/**
 * List paused journeys
 */
async function listPausedJourneys(limit = 100) {
  const result = await pool.query(`
    SELECT * FROM llm_journey_states
    WHERE status = 'paused' AND is_resumable = true
    ORDER BY paused_at DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
}

/**
 * Get journey metrics
 */
async function getJourneyMetrics(startDate, endDate) {
  const result = await pool.query(`
    SELECT
      status,
      COUNT(*) as count,
      AVG(total_tokens_used) as avg_tokens,
      SUM(total_cost) as total_cost,
      AVG(EXTRACT(EPOCH FROM (
        COALESCE(completed_at, aborted_at, NOW()) - started_at
      ))) as avg_duration_seconds
    FROM llm_journey_states
    WHERE created_at BETWEEN $1 AND $2
    GROUP BY status
  `, [startDate, endDate]);

  return result.rows;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Lifecycle
  startJourney,
  getJourneyState,
  updateStep,
  completeJourney,

  // History
  addToHistory,
  getHistory,
  recordTokenUsage,

  // Pause/Resume
  pauseJourney,
  resumeJourney,
  canResume,

  // Abort
  abortJourney,
  cleanupJourney,
  forceAbortStale,

  // Query
  listActiveJourneys,
  listPausedJourneys,
  getJourneyMetrics
};
