/**
 * OS Control Plane - Resolve Config Endpoint
 *
 * GET /api/os/resolve-config?tenant_id=...&workspace_id=...
 *
 * Returns the complete runtime configuration for a workspace binding.
 * This is the authoritative source for SIVA envelope generation.
 *
 * Contract Rules:
 * - If binding missing: 404 { error: "binding_missing" }
 * - If any referenced row missing/inactive: 409 { error: "config_invalid" }
 * - Returns full config with vertical, sub_vertical, persona, and policy
 */

import express from 'express';
import pool from '../../server/db.js';

const router = express.Router();

/**
 * GET /api/os/resolve-config
 *
 * Required query params:
 * - tenant_id: UUID of the tenant
 * - workspace_id: workspace identifier
 */
router.get('/', async (req, res) => {
  const { tenant_id, workspace_id } = req.query;

  // Validation
  if (!tenant_id) {
    return res.status(400).json({
      error: 'validation',
      field: 'tenant_id',
      message: 'tenant_id query parameter is required',
    });
  }

  if (!workspace_id) {
    return res.status(400).json({
      error: 'validation',
      field: 'workspace_id',
      message: 'workspace_id query parameter is required',
    });
  }

  try {
    // Step 1: Look up workspace binding
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
        message: 'No workspace binding configured.',
      });
    }

    const binding = bindingResult.rows[0];

    // Check binding is active
    if (!binding.is_active) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Workspace binding is inactive.',
      });
    }

    // Step 2: Load vertical
    const verticalResult = await pool.query(
      `SELECT id, key, name, entity_type, region_scope, is_active
       FROM os_verticals WHERE id = $1`,
      [binding.vertical_id]
    );

    if (verticalResult.rows.length === 0) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references missing vertical.',
      });
    }

    const vertical = verticalResult.rows[0];
    if (!vertical.is_active) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references inactive vertical.',
      });
    }

    // Step 3: Load sub-vertical
    const subVerticalResult = await pool.query(
      `SELECT id, key, name, default_agent, is_active
       FROM os_sub_verticals WHERE id = $1`,
      [binding.sub_vertical_id]
    );

    if (subVerticalResult.rows.length === 0) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references missing sub-vertical.',
      });
    }

    const subVertical = subVerticalResult.rows[0];
    if (!subVertical.is_active) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references inactive sub-vertical.',
      });
    }

    // Step 4: Load persona
    const personaResult = await pool.query(
      `SELECT id, key, name, mission, decision_lens, is_active
       FROM os_personas WHERE id = $1`,
      [binding.persona_id]
    );

    if (personaResult.rows.length === 0) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references missing persona.',
      });
    }

    const persona = personaResult.rows[0];
    if (!persona.is_active) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references inactive persona.',
      });
    }

    // Step 5: Load persona policy
    const policyResult = await pool.query(
      `SELECT id, policy_version, allowed_intents, forbidden_outputs, allowed_tools,
              evidence_scope, memory_scope, cost_budget, latency_budget,
              escalation_rules, disclaimer_rules, updated_at
       FROM os_persona_policies WHERE persona_id = $1`,
      [binding.persona_id]
    );

    if (policyResult.rows.length === 0) {
      return res.status(409).json({
        error: 'config_invalid',
        message: 'Binding references persona without policy.',
      });
    }

    const policy = policyResult.rows[0];

    // Step 6: Construct response
    const config = {
      binding: {
        id: binding.id,
        tenant_id: binding.tenant_id,
        workspace_id: binding.workspace_id,
      },
      vertical: {
        id: vertical.id,
        key: vertical.key,
        name: vertical.name,
        entity_type: vertical.entity_type,
        region_scope: vertical.region_scope,
      },
      sub_vertical: {
        id: subVertical.id,
        key: subVertical.key,
        name: subVertical.name,
        default_agent: subVertical.default_agent,
      },
      persona: {
        id: persona.id,
        key: persona.key,
        name: persona.name,
        mission: persona.mission,
        decision_lens: persona.decision_lens,
      },
      policy: {
        id: policy.id,
        version: policy.policy_version,
        allowed_intents: policy.allowed_intents,
        forbidden_outputs: policy.forbidden_outputs,
        allowed_tools: policy.allowed_tools,
        evidence_scope: policy.evidence_scope,
        memory_scope: policy.memory_scope,
        cost_budget: policy.cost_budget,
        latency_budget: policy.latency_budget,
        escalation_rules: policy.escalation_rules,
        disclaimer_rules: policy.disclaimer_rules,
        updated_at: policy.updated_at,
      },
    };

    console.log(`[resolve-config] Success: tenant=${tenant_id}, workspace=${workspace_id}, persona=${persona.key}`);

    return res.json({
      success: true,
      data: config,
    });

  } catch (error) {
    console.error('[resolve-config] Error:', error);
    return res.status(500).json({
      error: 'server_error',
      message: 'Failed to resolve config',
    });
  }
});

export default router;
