/**
 * OS Control Plane - Envelope Generation Endpoint
 *
 * POST /api/os/envelope
 *
 * Generates a sealed context envelope for SIVA execution.
 * This is the PRD-required envelope that controls SIVA behavior.
 *
 * S256 AUTHORITY CONTRACT:
 * - Persona MUST resolve via inheritance (LOCAL → REGIONAL → GLOBAL)
 * - Exactly ONE ACTIVE policy MUST exist for resolved persona
 * - Envelope generation FAILS HARD if persona/policy resolution fails
 * - sha256_hash is MANDATORY and STORED for audit replay
 *
 * S257 AUTHORITY CONTRACT:
 * - Territory MUST resolve via inheritance (exact → parent → global)
 * - Territory MUST be configured for the sub-vertical
 * - Envelope INCLUDES territory context for SIVA
 * - Envelope generation FAILS HARD if territory resolution fails
 *
 * S258 AUTHORITY CONTRACT:
 * - Envelope MUST be sealed to os_envelopes table
 * - sha256_hash is MANDATORY (fail if missing)
 * - envelope_id is UUID and tracked in response
 * - Envelope is immutable once sealed
 * - ENVELOPE_NOT_SEALED error if sealing fails
 *
 * Error Codes:
 * - PERSONA_NOT_RESOLVED: No persona found for sub-vertical + region
 * - POLICY_NOT_FOUND: Persona exists but has no ACTIVE policy
 * - MULTIPLE_ACTIVE_POLICIES: Data integrity violation
 * - TERRITORY_NOT_CONFIGURED: No territory for region_code (S257)
 * - TERRITORY_INVALID_FOR_SUBVERTICAL: Territory not configured for sub-vertical (S257)
 * - ENVELOPE_NOT_SEALED: Failed to seal envelope to database (S258)
 */

import express from 'express';
import crypto from 'crypto';
import pool from '../../../server/db.js';

const router = express.Router();

/**
 * Generate SHA256 hash of envelope content
 */
function generateEnvelopeHash(envelope) {
  const content = JSON.stringify({
    persona_id: envelope.persona_id,
    policy_version: envelope.policy_version,
    allowed_intents: envelope.allowed_intents,
    forbidden_outputs: envelope.forbidden_outputs,
    allowed_tools: envelope.allowed_tools,
    // S229: Include capability fields in hash
    allowed_capabilities: envelope.allowed_capabilities,
    forbidden_capabilities: envelope.forbidden_capabilities,
    max_cost_per_call: envelope.max_cost_per_call,
    max_latency_ms: envelope.max_latency_ms,
    // S257: Include territory in hash
    territory_id: envelope.territory?.id || null,
    territory_slug: envelope.territory?.slug || null,
    timestamp: envelope.generated_at,
  });
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * POST /api/os/envelope
 *
 * Request body:
 * - tenant_id: UUID of the tenant
 * - workspace_id: workspace identifier
 * - user_id: (optional) user requesting the envelope
 */
router.post('/', async (req, res) => {
  const { tenant_id, workspace_id, user_id } = req.body;

  // Validation
  if (!tenant_id) {
    return res.status(400).json({
      error: 'validation',
      field: 'tenant_id',
      message: 'tenant_id is required',
    });
  }

  if (!workspace_id) {
    return res.status(400).json({
      error: 'validation',
      field: 'workspace_id',
      message: 'workspace_id is required',
    });
  }

  try {
    // Step 1: Resolve config (same logic as resolve-config endpoint)
    const bindingResult = await pool.query(
      `SELECT wb.id, wb.tenant_id, wb.workspace_id, wb.vertical_id, wb.sub_vertical_id,
              wb.persona_id, wb.is_active
       FROM os_workspace_bindings wb
       WHERE wb.tenant_id = $1 AND wb.workspace_id = $2`,
      [tenant_id, workspace_id]
    );

    if (bindingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'binding_missing',
        message: 'No workspace binding configured. Envelope generation failed.',
      });
    }

    const binding = bindingResult.rows[0];

    if (!binding.is_active) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Workspace binding is inactive. Envelope generation failed.',
      });
    }

    // Step 2: Load vertical and sub-vertical data
    const configResult = await pool.query(
      `SELECT
         v.id as vertical_id, v.key as vertical_key, v.name as vertical_name,
         v.entity_type, v.region_scope, v.is_active as vertical_active,
         sv.id as sub_vertical_id, sv.key as sub_vertical_key, sv.name as sub_vertical_name,
         sv.default_agent, sv.is_active as sub_vertical_active
       FROM os_workspace_bindings wb
       JOIN os_verticals v ON wb.vertical_id = v.id
       JOIN os_sub_verticals sv ON wb.sub_vertical_id = sv.id
       WHERE wb.tenant_id = $1 AND wb.workspace_id = $2`,
      [tenant_id, workspace_id]
    );

    if (configResult.rows.length === 0) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references missing configuration. Envelope generation failed.',
      });
    }

    const config = configResult.rows[0];

    // Validate all components are active
    if (!config.vertical_active) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references inactive vertical. Envelope generation failed.',
      });
    }

    if (!config.sub_vertical_active) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references inactive sub-vertical. Envelope generation failed.',
      });
    }

    // S256 AUTHORITY: Persona Resolution with Inheritance Hard Gate
    // Step 3: Resolve persona using inheritance (LOCAL → REGIONAL → GLOBAL)
    const { region_code } = req.body;  // Optional region for resolution

    const personaResult = await pool.query(
      `SELECT persona_id, persona_key, persona_name, resolution_path, resolution_scope
       FROM resolve_persona_with_inheritance($1, $2)`,
      [config.sub_vertical_id, region_code || null]
    );

    if (personaResult.rows.length === 0) {
      // S256 HARD FAILURE: No persona resolved
      console.error(`[envelope] S256 HARD FAILURE: PERSONA_NOT_RESOLVED for sub_vertical=${config.sub_vertical_key}`);
      return res.status(404).json({
        success: false,
        error: 'PERSONA_NOT_RESOLVED',
        message: `No persona resolved for sub-vertical ${config.sub_vertical_key}${region_code ? ` in region ${region_code}` : ''}`,
        resolution_path: `LOCAL(${region_code || 'none'}) → REGIONAL(none) → GLOBAL(none)`,
        runtime_eligible: false,
      });
    }

    const persona = personaResult.rows[0];

    // Step 4: Get ACTIVE policy with hard gate enforcement
    const policyResult = await pool.query(
      `SELECT policy_id, policy_version, policy_status, active_count
       FROM get_active_persona_policy($1)`,
      [persona.persona_id]
    );

    if (policyResult.rows.length === 0) {
      // S256 HARD FAILURE: No active policy
      console.error(`[envelope] S256 HARD FAILURE: POLICY_NOT_FOUND for persona=${persona.persona_key}`);
      return res.status(404).json({
        success: false,
        error: 'POLICY_NOT_FOUND',
        message: `Persona ${persona.persona_key} has no ACTIVE policy`,
        persona: { id: persona.persona_id, key: persona.persona_key },
        runtime_eligible: false,
      });
    }

    const policyMeta = policyResult.rows[0];

    // S256 HARD FAILURE: Multiple active policies (data integrity violation)
    if (policyMeta.active_count > 1) {
      console.error(`[envelope] S256 HARD FAILURE: MULTIPLE_ACTIVE_POLICIES for persona=${persona.persona_key}`);
      return res.status(409).json({
        success: false,
        error: 'MULTIPLE_ACTIVE_POLICIES',
        message: `Data integrity violation: ${policyMeta.active_count} ACTIVE policies for persona ${persona.persona_key}`,
        persona: { id: persona.persona_id, key: persona.persona_key },
        runtime_eligible: false,
      });
    }

    // S257 AUTHORITY: Territory Resolution with Hard Gate
    // Step 4a: Resolve territory if region_code provided
    let territory = null;
    if (region_code) {
      const territoryResult = await pool.query(
        `SELECT territory_id, territory_slug, territory_name, territory_level,
                coverage_type, resolution_path, resolution_depth
         FROM resolve_territory_with_inheritance($1, $2)`,
        [region_code, config.sub_vertical_id]
      );

      if (territoryResult.rows.length === 0) {
        // S257 HARD FAILURE: No territory configured
        console.error(`[envelope] S257 HARD FAILURE: TERRITORY_NOT_CONFIGURED for region_code=${region_code}`);
        return res.status(404).json({
          success: false,
          error: 'TERRITORY_NOT_CONFIGURED',
          message: `No territory configured for region ${region_code}`,
          resolution_path: `EXACT(${region_code}) → COUNTRY(none) → SLUG(none) → NAME(none) → GLOBAL(none)`,
          runtime_eligible: false,
        });
      }

      territory = territoryResult.rows[0];

      // Validate territory is configured for sub-vertical
      const validationResult = await pool.query(
        `SELECT is_valid, validation_message, territory_config
         FROM validate_territory_for_sub_vertical($1, $2)`,
        [territory.territory_id, config.sub_vertical_id]
      );

      if (validationResult.rows.length === 0 || !validationResult.rows[0].is_valid) {
        const validationMessage = validationResult.rows[0]?.validation_message || 'Validation failed';
        console.error(`[envelope] S257 HARD FAILURE: TERRITORY_INVALID_FOR_SUBVERTICAL territory=${territory.territory_slug}`);
        return res.status(409).json({
          success: false,
          error: 'TERRITORY_INVALID_FOR_SUBVERTICAL',
          message: validationMessage,
          territory: { id: territory.territory_id, slug: territory.territory_slug },
          runtime_eligible: false,
        });
      }
    }

    // Step 5: Load full persona and policy details
    const fullDataResult = await pool.query(
      `SELECT
         p.id as persona_id, p.key as persona_key, p.name as persona_name,
         p.mission, p.decision_lens,
         pp.id as policy_id, pp.policy_version, pp.allowed_intents, pp.forbidden_outputs,
         pp.allowed_tools, pp.evidence_scope, pp.memory_scope, pp.cost_budget,
         pp.latency_budget, pp.escalation_rules, pp.disclaimer_rules,
         pp.allowed_capabilities, pp.forbidden_capabilities, pp.max_cost_per_call, pp.max_latency_ms
       FROM os_personas p
       JOIN os_persona_policies pp ON p.id = pp.persona_id
       WHERE p.id = $1 AND pp.id = $2`,
      [persona.persona_id, policyMeta.policy_id]
    );

    const fullData = fullDataResult.rows[0];

    // Step 6: Generate envelope
    const generatedAt = new Date().toISOString();

    const envelope = {
      // Metadata
      envelope_version: '1.2',  // Bumped for S257
      generated_at: generatedAt,
      tenant_id,
      workspace_id,
      user_id: user_id || null,

      // S256: Persona Resolution metadata (for audit)
      resolution: {
        persona_path: persona.resolution_path,
        persona_scope: persona.resolution_scope,
        region_code: region_code || null,
        // S257: Territory Resolution metadata
        territory_path: territory?.resolution_path || null,
        territory_depth: territory?.resolution_depth || null,
      },

      // S257: Territory context
      territory: territory ? {
        id: territory.territory_id,
        slug: territory.territory_slug,
        name: territory.territory_name,
        level: territory.territory_level,
        coverage_type: territory.coverage_type,
      } : null,

      // Context
      vertical: {
        id: config.vertical_id,
        key: config.vertical_key,
        name: config.vertical_name,
        entity_type: config.entity_type,
        region_scope: config.region_scope,
      },
      sub_vertical: {
        id: config.sub_vertical_id,
        key: config.sub_vertical_key,
        name: config.sub_vertical_name,
        default_agent: config.default_agent,
      },

      // PRD-Required Envelope Fields
      persona_id: fullData.persona_id,
      persona_key: fullData.persona_key,
      persona_name: fullData.persona_name,
      mission: fullData.mission,
      decision_lens: fullData.decision_lens,

      // Policy fields (PRD-required)
      policy_id: fullData.policy_id,
      policy_version: fullData.policy_version,
      allowed_intents: fullData.allowed_intents || [],
      forbidden_outputs: fullData.forbidden_outputs || [],
      allowed_tools: fullData.allowed_tools || [],
      evidence_scope: fullData.evidence_scope || {},
      memory_scope: fullData.memory_scope || {},
      cost_budget: fullData.cost_budget || {},
      latency_budget: fullData.latency_budget || {},
      escalation_rules: fullData.escalation_rules || {},
      disclaimer_rules: fullData.disclaimer_rules || {},

      // S229: Capability Policy fields
      allowed_capabilities: fullData.allowed_capabilities || [],
      forbidden_capabilities: fullData.forbidden_capabilities || [],
      max_cost_per_call: fullData.max_cost_per_call || null,
      max_latency_ms: fullData.max_latency_ms || null,
    };

    // Step 7: Generate hash
    const sha256_hash = generateEnvelopeHash(envelope);

    // Step 8: Add hash to envelope
    const sealedEnvelope = {
      ...envelope,
      sha256_hash,
    };

    // S258 AUTHORITY: Seal envelope to database
    // Step 9: Persist envelope to os_envelopes table
    const sealResult = await pool.query(
      `SELECT envelope_id, is_new, sealed_at
       FROM seal_envelope($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        envelope.envelope_version,
        sha256_hash,
        tenant_id,
        workspace_id,
        user_id || null,
        fullData.persona_id,
        fullData.policy_id,
        fullData.policy_version,
        territory?.territory_id || null,
        persona.resolution_path,
        persona.resolution_scope,
        territory?.resolution_path || null,
        sealedEnvelope,  // Full envelope content as JSONB
        'system',  // sealed_by
        null,  // expires_at
      ]
    );

    if (sealResult.rows.length === 0) {
      // S258 HARD FAILURE: Failed to seal
      console.error(`[envelope] S258 HARD FAILURE: ENVELOPE_NOT_SEALED`);
      return res.status(500).json({
        success: false,
        error: 'ENVELOPE_NOT_SEALED',
        message: 'Failed to seal envelope to database',
        runtime_eligible: false,
      });
    }

    const sealData = sealResult.rows[0];

    // Add envelope_id to the sealed envelope
    const finalEnvelope = {
      envelope_id: sealData.envelope_id,
      ...sealedEnvelope,
      sealed_at: sealData.sealed_at,
      is_new: sealData.is_new,
    };

    console.log(`[envelope] S256/S257/S258 SUCCESS: tenant=${tenant_id}, workspace=${workspace_id}, persona=${fullData.persona_key}, policy_v=${fullData.policy_version}, persona_resolution=${persona.resolution_scope}, territory=${territory?.territory_slug || 'none'}, envelope_id=${sealData.envelope_id}, is_new=${sealData.is_new}, hash=${sha256_hash.substring(0, 16)}...`);

    return res.json({
      success: true,
      data: finalEnvelope,
    });

  } catch (error) {
    console.error('[envelope] Error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: 'Failed to generate envelope',
    });
  }
});

export default router;
