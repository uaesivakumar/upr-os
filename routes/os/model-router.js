/**
 * MODEL ROUTER - THE MOAT
 * Sprint 230: Capability-Driven Model Selection
 * Sprint 231: Replay Safety Integration
 *
 * This module is the SINGLE AUTHORITY for model selection.
 *
 * INVARIANTS:
 * - Same inputs → same model EVERY TIME (deterministic)
 * - SIVA never sees model_id, provider, or version
 * - No admin preferences at runtime
 * - No fallback "best effort" routing
 * - No silent downgrades
 *
 * S231 REPLAY INVARIANTS:
 * - Every successful routing writes to os_routing_decisions (append-only)
 * - Replay is exact or flagged, never hidden
 * - No overwrites, no updates
 *
 * Routing ≠ permission. Permission is done in authorize_capability (S229).
 * This module is called AFTER authorization passes.
 */

import pool from '../../server/db.js';

/**
 * Latency class mapping (for budget comparison)
 * Maps latency_class strings to max milliseconds
 */
const LATENCY_CLASS_MAP = {
  low: 500,
  medium: 2000,
  high: 10000,
};

/**
 * Map average latency to latency class
 */
function getLatencyClass(avgLatencyMs) {
  if (avgLatencyMs <= 500) return 'low';
  if (avgLatencyMs <= 2000) return 'medium';
  return 'high';
}

/**
 * Calculate routing score for deterministic ranking
 *
 * Formula (fixed weights, no ML, no randomness):
 * - stability_score: weight 0.5 (higher is better)
 * - cost_estimate: weight 0.3 (lower is better, normalized)
 * - latency: weight 0.2 (lower is better, normalized)
 *
 * Score range: 0-100, higher is better
 */
function calculateRoutingScore(model) {
  // Normalize cost (inverse: lower cost = higher score)
  // Max cost ~$0.05/1k, so normalize to 0-100
  const costNormalized = Math.max(0, 100 - (parseFloat(model.cost_per_1k) * 2000));

  // Normalize latency (inverse: lower latency = higher score)
  // Max latency ~10000ms, so normalize to 0-100
  const latencyNormalized = Math.max(0, 100 - (model.avg_latency_ms / 100));

  // Weighted score
  const score =
    (model.stability_score * 0.5) +
    (costNormalized * 0.3) +
    (latencyNormalized * 0.2);

  return Math.round(score * 100) / 100; // Round to 2 decimal places
}

/**
 * Deterministic sorting comparator
 *
 * Order:
 * 1. routing_score DESC (higher wins)
 * 2. stability_score DESC (tie-breaker 1)
 * 3. cost_estimate ASC (tie-breaker 2)
 * 4. avg_latency_ms ASC (tie-breaker 3)
 * 5. model_id ASC (final tie-breaker, lexicographic)
 */
function deterministicSort(a, b) {
  // Primary: routing_score DESC
  if (a.routing_score !== b.routing_score) {
    return b.routing_score - a.routing_score;
  }

  // Tie-breaker 1: stability_score DESC
  if (a.stability_score !== b.stability_score) {
    return b.stability_score - a.stability_score;
  }

  // Tie-breaker 2: cost ASC
  const aCost = parseFloat(a.cost_per_1k);
  const bCost = parseFloat(b.cost_per_1k);
  if (aCost !== bCost) {
    return aCost - bCost;
  }

  // Tie-breaker 3: latency ASC
  if (a.avg_latency_ms !== b.avg_latency_ms) {
    return a.avg_latency_ms - b.avg_latency_ms;
  }

  // Final tie-breaker: model_id lexicographic ASC
  return a.id.localeCompare(b.id);
}

/**
 * SELECT MODEL
 *
 * The single entry point for model selection.
 *
 * @param {Object} params
 * @param {string} params.capability_key - The capability being requested
 * @param {string} params.persona_id - UUID of the persona
 * @param {string} params.envelope_hash - Hash of the envelope (for tracing)
 * @param {string} params.channel - Channel: 'wa' | 'saas' | 'api'
 * @param {string} params.interaction_id - (S231) Unique interaction ID for replay
 *
 * @returns {Object} Result with either model selection or failure
 */
export async function selectModel({ capability_key, persona_id, envelope_hash, channel, interaction_id }) {
  // Validate inputs
  if (!capability_key) {
    return {
      success: false,
      error: 'INVALID_INPUT',
      message: 'capability_key is required',
    };
  }

  if (!persona_id) {
    return {
      success: false,
      error: 'INVALID_INPUT',
      message: 'persona_id is required',
    };
  }

  if (!channel || !['wa', 'saas', 'api'].includes(channel)) {
    return {
      success: false,
      error: 'INVALID_INPUT',
      message: 'channel must be one of: wa, saas, api',
    };
  }

  try {
    // ========================================
    // STEP 1: Fetch eligible models
    // ========================================
    // Criteria:
    // - is_eligible = true
    // - is_active = true
    // - supports capability_key (in supported_capabilities array)
    // - NOT in model.disallowed_capabilities

    const modelsResult = await pool.query(
      `SELECT
         m.id,
         m.slug,
         m.name,
         m.stability_score,
         m.avg_latency_ms,
         m.supported_capabilities,
         m.disallowed_capabilities,
         (m.input_cost_per_million + m.output_cost_per_million) / 2000 as cost_per_1k,
         p.provider_type
       FROM llm_models m
       JOIN llm_providers p ON m.provider_id = p.id
       WHERE m.is_eligible = true
         AND m.is_active = true
         AND $1 = ANY(m.supported_capabilities)
         AND NOT ($1 = ANY(COALESCE(m.disallowed_capabilities, '{}')))
       ORDER BY m.id`,  // Deterministic initial order
      [capability_key]
    );

    let eligibleModels = modelsResult.rows;

    if (eligibleModels.length === 0) {
      // No models support this capability at all
      return {
        success: false,
        error: 'NO_ELIGIBLE_MODEL',
        capability_key,
        persona_id,
        denial_reason: 'NO_ELIGIBLE_MODEL',
        message: `No eligible models found for capability: ${capability_key}`,
        models_checked: 0,
        envelope_hash,
      };
    }

    // ========================================
    // STEP 2: Fetch persona budgets
    // ========================================
    const policyResult = await pool.query(
      `SELECT pp.max_cost_per_call, pp.max_latency_ms
       FROM os_persona_policies pp
       WHERE pp.persona_id = $1`,
      [persona_id]
    );

    const policy = policyResult.rows[0];
    const maxCostPerCall = policy?.max_cost_per_call ? parseFloat(policy.max_cost_per_call) : null;
    const maxLatencyMs = policy?.max_latency_ms || null;

    // ========================================
    // STEP 3: Enforce persona budgets
    // ========================================
    const preFilterCount = eligibleModels.length;

    if (maxCostPerCall !== null) {
      eligibleModels = eligibleModels.filter(m => {
        const costPer1k = parseFloat(m.cost_per_1k);
        return costPer1k <= maxCostPerCall;
      });
    }

    if (maxLatencyMs !== null) {
      eligibleModels = eligibleModels.filter(m => {
        return m.avg_latency_ms <= maxLatencyMs;
      });
    }

    const postFilterCount = eligibleModels.length;
    const excludedByBudget = preFilterCount - postFilterCount;

    if (eligibleModels.length === 0) {
      // Budget constraints exclude all models
      return {
        success: false,
        error: 'NO_ELIGIBLE_MODEL',
        capability_key,
        persona_id,
        denial_reason: 'NO_ELIGIBLE_MODEL',
        message: `No models satisfy budget constraints. ${excludedByBudget} model(s) excluded.`,
        budget_constraints: {
          max_cost_per_call: maxCostPerCall,
          max_latency_ms: maxLatencyMs,
        },
        models_checked: preFilterCount,
        models_excluded_by_budget: excludedByBudget,
        envelope_hash,
      };
    }

    // ========================================
    // STEP 4: Calculate routing scores
    // ========================================
    const scoredModels = eligibleModels.map(m => ({
      ...m,
      routing_score: calculateRoutingScore(m),
      latency_class: getLatencyClass(m.avg_latency_ms),
    }));

    // ========================================
    // STEP 5: Deterministic ranking
    // ========================================
    scoredModels.sort(deterministicSort);

    // Select the top model
    const selectedModel = scoredModels[0];

    // ========================================
    // S231: Persist routing decision (append-only)
    // ========================================
    if (interaction_id) {
      try {
        await pool.query(
          `INSERT INTO os_routing_decisions
           (interaction_id, capability_key, persona_id, model_id, routing_score,
            routing_reason, cost_budget, latency_budget_ms, channel, envelope_hash,
            alternatives_considered)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (interaction_id) DO NOTHING`,  // Append-only: never overwrite
          [
            interaction_id,
            capability_key,
            persona_id,
            selectedModel.id,
            selectedModel.routing_score,
            `Selected by capability routing: ${capability_key}`,
            maxCostPerCall,
            maxLatencyMs,
            channel,
            envelope_hash,
            JSON.stringify(scoredModels.slice(1, 4).map(m => ({
              model_id: m.id,
              routing_score: m.routing_score,
            }))),
          ]
        );
      } catch (persistError) {
        // Log but don't fail routing - append-only semantics
        console.error('[model-router] Failed to persist routing decision:', persistError.message);
      }
    }

    // ========================================
    // RESULT: Return selection
    // ========================================
    return {
      success: true,
      model_id: selectedModel.id,
      model_slug: selectedModel.slug,  // For logging only, NEVER expose to SIVA
      routing_reason: `Selected by capability routing: ${capability_key}`,
      routing_score: selectedModel.routing_score,
      cost_estimate: parseFloat(selectedModel.cost_per_1k),
      latency_class: selectedModel.latency_class,
      interaction_id,  // S231: Return for replay reference
      // Metadata (for logging/debugging, not for SIVA)
      _meta: {
        capability_key,
        persona_id,
        channel,
        envelope_hash,
        models_evaluated: scoredModels.length,
        models_excluded_by_budget: excludedByBudget,
        alternatives: scoredModels.slice(1, 4).map(m => ({
          model_id: m.id,
          routing_score: m.routing_score,
        })),
      },
    };

  } catch (error) {
    console.error('[model-router] Error:', error);
    return {
      success: false,
      error: 'ROUTER_ERROR',
      message: 'Internal router error',
      details: error.message,
    };
  }
}

/**
 * INVOKE MODEL
 *
 * Wrapper that takes capability + prompt and returns output.
 * SIVA calls this, never knowing which model was selected.
 *
 * @param {Object} params
 * @param {string} params.capability_key - The capability being requested
 * @param {string} params.persona_id - UUID of the persona
 * @param {string} params.envelope_hash - Hash of the envelope
 * @param {string} params.channel - Channel: 'wa' | 'saas' | 'api'
 * @param {string} params.prompt - The prompt to send
 * @param {Object} params.options - Additional options (temperature, etc)
 *
 * @returns {Object} Result with output (model identity hidden)
 */
export async function invokeModel({ capability_key, persona_id, envelope_hash, channel, prompt, options = {} }) {
  // Step 1: Select model
  const routingResult = await selectModel({ capability_key, persona_id, envelope_hash, channel });

  if (!routingResult.success) {
    // Return structured failure
    return {
      success: false,
      error: routingResult.error,
      denial_reason: routingResult.denial_reason || routingResult.error,
      capability_key,
      persona_id,
      message: routingResult.message,
    };
  }

  // Step 2: Invoke the selected model
  // Note: Actual LLM invocation would go here
  // For now, return structure showing what would happen

  return {
    success: true,
    capability_key,
    // SIVA sees ONLY these fields:
    output: null,  // Would contain LLM response
    // Routing metadata (for OS logging, not exposed to SIVA prompt)
    _routing: {
      model_id: routingResult.model_id,
      routing_score: routingResult.routing_score,
      cost_estimate: routingResult.cost_estimate,
      latency_class: routingResult.latency_class,
    },
  };
}

/**
 * S231: RESOLVE MODEL FOR REPLAY
 *
 * Resolves the model for a replay of a previous interaction.
 *
 * Behavior:
 * 1. Load original routing decision
 * 2. Check if original model is still active, eligible, supports capability
 * 3. If yes → reuse same model
 * 4. If no → flag deviation (NO silent substitution)
 *
 * @param {string} interaction_id - The interaction to replay
 * @returns {Object} Replay resolution with deviation flag if applicable
 */
export async function resolveModelForReplay(interaction_id) {
  if (!interaction_id) {
    return {
      success: false,
      error: 'INVALID_INPUT',
      message: 'interaction_id is required',
    };
  }

  try {
    // Call the database function
    const result = await pool.query(
      'SELECT resolve_model_for_replay($1) as replay_result',
      [interaction_id]
    );

    const replayResult = result.rows[0]?.replay_result;

    if (!replayResult) {
      return {
        success: false,
        error: 'REPLAY_FAILED',
        message: 'Failed to resolve replay',
      };
    }

    return replayResult;
  } catch (error) {
    console.error('[model-router] Replay resolution error:', error);
    return {
      success: false,
      error: 'REPLAY_ERROR',
      message: error.message,
    };
  }
}

/**
 * S231: REPLAY INTERACTION
 *
 * Full replay of a previous interaction.
 * Rehydrates envelope, re-runs authorization, resolves model.
 *
 * @param {string} interaction_id - The interaction to replay
 * @returns {Object} Full replay result with deviation tracking
 */
export async function replayInteraction(interaction_id) {
  // Step 1: Resolve model for replay
  const replayResolution = await resolveModelForReplay(interaction_id);

  if (!replayResolution.success) {
    return replayResolution;
  }

  // Step 2: Check for deviation
  if (replayResolution.replay_deviation) {
    // Model is no longer valid - return deviation info
    // Caller must decide whether to re-route or abort
    return {
      success: true,
      replay_possible: false,
      replay_deviation: true,
      deviation_reason: replayResolution.deviation_reason,
      deviation_details: replayResolution.deviation_details,
      original_model_id: replayResolution.original_model_id,
      original_model_slug: replayResolution.original_model_slug,
      capability_key: replayResolution.capability_key,
      routing_score: replayResolution.routing_score,
      envelope_hash: replayResolution.envelope_hash,
      original_created_at: replayResolution.original_created_at,
    };
  }

  // Step 3: No deviation - replay is exact
  return {
    success: true,
    replay_possible: true,
    replay_deviation: false,
    original_model_id: replayResolution.original_model_id,
    replay_model_id: replayResolution.replay_model_id,
    original_model_slug: replayResolution.original_model_slug,
    replay_model_slug: replayResolution.replay_model_slug,
    capability_key: replayResolution.capability_key,
    routing_score: replayResolution.routing_score,
    routing_reason: replayResolution.routing_reason,
    envelope_hash: replayResolution.envelope_hash,
    original_created_at: replayResolution.original_created_at,
  };
}

export default {
  selectModel,
  invokeModel,
  resolveModelForReplay,
  replayInteraction,
  // Export for testing only
  _internal: {
    calculateRoutingScore,
    deterministicSort,
    getLatencyClass,
    LATENCY_CLASS_MAP,
  },
};
