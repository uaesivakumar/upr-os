/**
 * S256 AUTHORITY: Persona Resolution Hard Gate
 *
 * GET /api/os/resolve-persona
 *
 * Resolves persona using inheritance hierarchy:
 *   LOCAL → REGIONAL → GLOBAL
 *
 * Error Codes (HARD FAILURES):
 *   - PERSONA_NOT_RESOLVED: No persona found for sub-vertical + region
 *   - POLICY_NOT_FOUND: Persona exists but has no ACTIVE policy
 *   - MULTIPLE_ACTIVE_POLICIES: Data integrity violation - more than one ACTIVE
 *
 * This is an AUTHORITY endpoint - failures are hard blocks, not soft warnings.
 */

import express from 'express';
import pool from '../../../server/db.js';

const router = express.Router();

/**
 * Error codes for persona resolution failures
 */
const ErrorCodes = {
  PERSONA_NOT_RESOLVED: 'PERSONA_NOT_RESOLVED',
  POLICY_NOT_FOUND: 'POLICY_NOT_FOUND',
  MULTIPLE_ACTIVE_POLICIES: 'MULTIPLE_ACTIVE_POLICIES',
  SUB_VERTICAL_NOT_FOUND: 'SUB_VERTICAL_NOT_FOUND',
  SUB_VERTICAL_INACTIVE: 'SUB_VERTICAL_INACTIVE',
};

/**
 * GET /api/os/resolve-persona
 *
 * Query params:
 *   - sub_vertical_id: UUID (required)
 *   - region_code: string (optional, for LOCAL/REGIONAL resolution)
 */
router.get('/', async (req, res) => {
  const { sub_vertical_id, region_code } = req.query;

  // Validation
  if (!sub_vertical_id) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'sub_vertical_id query parameter is required',
    });
  }

  try {
    // Step 1: Verify sub-vertical exists and is active
    const svResult = await pool.query(
      `SELECT id, key, name, is_active, primary_entity_type
       FROM os_sub_verticals
       WHERE id = $1`,
      [sub_vertical_id]
    );

    if (svResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: ErrorCodes.SUB_VERTICAL_NOT_FOUND,
        message: `Sub-vertical ${sub_vertical_id} not found`,
        runtime_eligible: false,
      });
    }

    const subVertical = svResult.rows[0];

    if (!subVertical.is_active) {
      return res.status(409).json({
        success: false,
        error: ErrorCodes.SUB_VERTICAL_INACTIVE,
        message: `Sub-vertical ${subVertical.key} is inactive`,
        runtime_eligible: false,
      });
    }

    // Step 2: Resolve persona using inheritance (LOCAL → REGIONAL → GLOBAL)
    const personaResult = await pool.query(
      `SELECT persona_id, persona_key, persona_name, resolution_path, resolution_scope
       FROM resolve_persona_with_inheritance($1, $2)`,
      [sub_vertical_id, region_code || null]
    );

    if (personaResult.rows.length === 0) {
      // HARD FAILURE: No persona resolved
      console.error(`[resolve-persona] HARD FAILURE: PERSONA_NOT_RESOLVED for sub_vertical=${sub_vertical_id}, region=${region_code}`);

      return res.status(404).json({
        success: false,
        error: ErrorCodes.PERSONA_NOT_RESOLVED,
        message: `No persona resolved for sub-vertical ${subVertical.key}${region_code ? ` in region ${region_code}` : ''}`,
        resolution_path: `LOCAL(${region_code || 'none'}) → REGIONAL(none) → GLOBAL(none)`,
        runtime_eligible: false,
      });
    }

    const persona = personaResult.rows[0];

    // Step 3: Get active policy for resolved persona
    const policyResult = await pool.query(
      `SELECT policy_id, policy_version, policy_status, active_count
       FROM get_active_persona_policy($1)`,
      [persona.persona_id]
    );

    // Check policy resolution
    if (policyResult.rows.length === 0) {
      // HARD FAILURE: No active policy
      console.error(`[resolve-persona] HARD FAILURE: POLICY_NOT_FOUND for persona=${persona.persona_key}`);

      return res.status(404).json({
        success: false,
        error: ErrorCodes.POLICY_NOT_FOUND,
        message: `Persona ${persona.persona_key} has no ACTIVE policy`,
        persona: {
          id: persona.persona_id,
          key: persona.persona_key,
          name: persona.persona_name,
        },
        resolution_path: persona.resolution_path,
        runtime_eligible: false,
      });
    }

    const policy = policyResult.rows[0];

    // Check for data integrity violation
    if (policy.active_count > 1) {
      // HARD FAILURE: Multiple active policies (should never happen with constraint)
      console.error(`[resolve-persona] HARD FAILURE: MULTIPLE_ACTIVE_POLICIES for persona=${persona.persona_key} (count=${policy.active_count})`);

      return res.status(409).json({
        success: false,
        error: ErrorCodes.MULTIPLE_ACTIVE_POLICIES,
        message: `Data integrity violation: ${policy.active_count} ACTIVE policies found for persona ${persona.persona_key}`,
        persona: {
          id: persona.persona_id,
          key: persona.persona_key,
          name: persona.persona_name,
        },
        runtime_eligible: false,
      });
    }

    // Step 4: Load full policy details
    const fullPolicyResult = await pool.query(
      `SELECT id, policy_version, allowed_intents, forbidden_outputs, allowed_tools,
              evidence_scope, memory_scope, cost_budget, latency_budget,
              escalation_rules, disclaimer_rules, allowed_capabilities,
              forbidden_capabilities, max_cost_per_call, max_latency_ms,
              activated_at
       FROM os_persona_policies
       WHERE id = $1`,
      [policy.policy_id]
    );

    const fullPolicy = fullPolicyResult.rows[0];

    // SUCCESS: Persona and policy resolved
    console.log(`[resolve-persona] SUCCESS: persona=${persona.persona_key}, policy_v=${fullPolicy.policy_version}, path=${persona.resolution_path}`);

    return res.json({
      success: true,
      runtime_eligible: true,
      resolution: {
        path: persona.resolution_path,
        scope: persona.resolution_scope,
      },
      sub_vertical: {
        id: subVertical.id,
        key: subVertical.key,
        name: subVertical.name,
        primary_entity_type: subVertical.primary_entity_type,
      },
      persona: {
        id: persona.persona_id,
        key: persona.persona_key,
        name: persona.persona_name,
      },
      policy: {
        id: fullPolicy.id,
        version: fullPolicy.policy_version,
        allowed_intents: fullPolicy.allowed_intents || [],
        forbidden_outputs: fullPolicy.forbidden_outputs || [],
        allowed_tools: fullPolicy.allowed_tools || [],
        allowed_capabilities: fullPolicy.allowed_capabilities || [],
        forbidden_capabilities: fullPolicy.forbidden_capabilities || [],
        evidence_scope: fullPolicy.evidence_scope || {},
        memory_scope: fullPolicy.memory_scope || {},
        cost_budget: fullPolicy.cost_budget || {},
        latency_budget: fullPolicy.latency_budget || {},
        escalation_rules: fullPolicy.escalation_rules || {},
        disclaimer_rules: fullPolicy.disclaimer_rules || {},
        max_cost_per_call: fullPolicy.max_cost_per_call,
        max_latency_ms: fullPolicy.max_latency_ms,
        activated_at: fullPolicy.activated_at,
      },
    });

  } catch (error) {
    console.error('[resolve-persona] Error:', error);

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to resolve persona',
      runtime_eligible: false,
    });
  }
});

export default router;

export { ErrorCodes };
