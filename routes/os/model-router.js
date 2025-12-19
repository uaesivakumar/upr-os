/**
 * MODEL ROUTER - THE MOAT
 * Sprint 230: Capability-Driven Model Selection
 *
 * This module is the SINGLE AUTHORITY for model selection.
 *
 * INVARIANTS:
 * - Same inputs → same model EVERY TIME (deterministic)
 * - SIVA never sees model_id, provider, or version
 * - No admin preferences at runtime
 * - No side effects, no DB writes
 * - No fallback "best effort" routing
 * - No silent downgrades
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
 *
 * @returns {Object} Result with either model selection or failure
 */
export async function selectModel({ capability_key, persona_id, envelope_hash, channel }) {
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
    // RESULT: Return selection (no DB write)
    // ========================================
    return {
      success: true,
      model_id: selectedModel.id,
      model_slug: selectedModel.slug,  // For logging only, NEVER expose to SIVA
      routing_reason: `Selected by capability routing: ${capability_key}`,
      routing_score: selectedModel.routing_score,
      cost_estimate: parseFloat(selectedModel.cost_per_1k),
      latency_class: selectedModel.latency_class,
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

export default {
  selectModel,
  invokeModel,
  // Export for testing only
  _internal: {
    calculateRoutingScore,
    deterministicSort,
    getLatencyClass,
    LATENCY_CLASS_MAP,
  },
};
