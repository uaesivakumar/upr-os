/**
 * OS Control Plane - Envelope Generation Endpoint
 *
 * POST /api/os/envelope
 *
 * Generates a sealed context envelope for SIVA execution.
 * This is the PRD-required envelope that controls SIVA behavior.
 *
 * Contract Rules:
 * - If resolve-config fails, envelope fails
 * - Output must include PRD-required envelope fields + sha256_hash
 * - Envelope is mandatory: SIVA cannot run without a valid envelope + hash
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

    // Step 2: Load all required data in one query
    const configResult = await pool.query(
      `SELECT
         v.id as vertical_id, v.key as vertical_key, v.name as vertical_name,
         v.entity_type, v.region_scope, v.is_active as vertical_active,
         sv.id as sub_vertical_id, sv.key as sub_vertical_key, sv.name as sub_vertical_name,
         sv.default_agent, sv.is_active as sub_vertical_active,
         p.id as persona_id, p.key as persona_key, p.name as persona_name,
         p.mission, p.decision_lens, p.is_active as persona_active,
         pp.id as policy_id, pp.policy_version, pp.allowed_intents, pp.forbidden_outputs,
         pp.allowed_tools, pp.evidence_scope, pp.memory_scope, pp.cost_budget,
         pp.latency_budget, pp.escalation_rules, pp.disclaimer_rules, pp.updated_at as policy_updated_at,
         pp.allowed_capabilities, pp.forbidden_capabilities, pp.max_cost_per_call, pp.max_latency_ms
       FROM os_workspace_bindings wb
       JOIN os_verticals v ON wb.vertical_id = v.id
       JOIN os_sub_verticals sv ON wb.sub_vertical_id = sv.id
       JOIN os_personas p ON wb.persona_id = p.id
       LEFT JOIN os_persona_policies pp ON p.id = pp.persona_id
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

    if (!config.persona_active) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references inactive persona. Envelope generation failed.',
      });
    }

    if (!config.policy_id) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Persona has no policy configured. Envelope generation failed.',
      });
    }

    // Step 3: Generate envelope
    const generatedAt = new Date().toISOString();

    const envelope = {
      // Metadata
      envelope_version: '1.0',
      generated_at: generatedAt,
      tenant_id,
      workspace_id,
      user_id: user_id || null,

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
      persona_id: config.persona_id,
      persona_key: config.persona_key,
      persona_name: config.persona_name,
      mission: config.mission,
      decision_lens: config.decision_lens,

      // Policy fields (PRD-required)
      policy_version: config.policy_version,
      allowed_intents: config.allowed_intents || [],
      forbidden_outputs: config.forbidden_outputs || [],
      allowed_tools: config.allowed_tools || [],
      evidence_scope: config.evidence_scope || {},
      memory_scope: config.memory_scope || {},
      cost_budget: config.cost_budget || {},
      latency_budget: config.latency_budget || {},
      escalation_rules: config.escalation_rules || {},
      disclaimer_rules: config.disclaimer_rules || {},

      // S229: Capability Policy fields
      allowed_capabilities: config.allowed_capabilities || [],
      forbidden_capabilities: config.forbidden_capabilities || [],
      max_cost_per_call: config.max_cost_per_call || null,
      max_latency_ms: config.max_latency_ms || null,
    };

    // Step 4: Generate hash
    const sha256_hash = generateEnvelopeHash(envelope);

    // Step 5: Add hash to envelope
    const sealedEnvelope = {
      ...envelope,
      sha256_hash,
    };

    console.log(`[envelope] Generated: tenant=${tenant_id}, workspace=${workspace_id}, persona=${config.persona_key}, policy_v=${config.policy_version}, hash=${sha256_hash.substring(0, 16)}...`);

    return res.json({
      success: true,
      data: sealedEnvelope,
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
