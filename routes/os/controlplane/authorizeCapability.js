/**
 * OS Control Plane - Capability Authorization Endpoint
 *
 * POST /api/os/authorize-capability
 *
 * Pre-SIVA guard that validates capability requests against persona policy.
 * This endpoint MUST be called before any SIVA invocation.
 *
 * S229: Persona Capability Policy
 *
 * Contract Rules:
 * - If capability not in allowed_capabilities → 403 DENIED
 * - If capability in forbidden_capabilities → 403 DENIED (blacklist wins)
 * - If no eligible model can satisfy cost/latency budgets → 403 DENIED
 * - Denial is logged to os_capability_denials
 * - SIVA MUST NOT run on denial
 *
 * INVARIANT: This is about DENIAL, not routing.
 */

import express from 'express';
import pool from '../../server/db.js';

const router = express.Router();

/**
 * POST /api/os/authorize-capability
 *
 * Request body:
 * - persona_id: UUID of the persona (from envelope)
 * - capability_key: The capability being requested
 * - envelope_hash: (optional) Hash of the envelope for audit trail
 * - context: (optional) Additional context for logging
 */
router.post('/', async (req, res) => {
  const { persona_id, capability_key, envelope_hash, context } = req.body;

  // Validation
  if (!persona_id) {
    return res.status(400).json({
      success: false,
      error: 'validation',
      field: 'persona_id',
      message: 'persona_id is required',
    });
  }

  if (!capability_key) {
    return res.status(400).json({
      success: false,
      error: 'validation',
      field: 'capability_key',
      message: 'capability_key is required',
    });
  }

  try {
    // Call the authorize_capability function
    const result = await pool.query(
      `SELECT authorize_capability($1, $2, $3, $4) as auth_result`,
      [
        persona_id,
        capability_key,
        envelope_hash || null,
        context ? JSON.stringify(context) : null,
      ]
    );

    const authResult = result.rows[0]?.auth_result;

    if (!authResult) {
      console.error('[authorize-capability] No result from authorize_capability function');
      return res.status(500).json({
        success: false,
        error: 'server_error',
        message: 'Authorization check failed',
      });
    }

    // Check authorization result
    if (authResult.authorized === true) {
      console.log(`[authorize-capability] ALLOWED: persona=${persona_id}, capability=${capability_key}`);
      return res.json({
        success: true,
        authorized: true,
        persona_id: authResult.persona_id,
        capability_key: authResult.capability_key,
        max_cost_per_call: authResult.max_cost_per_call,
        max_latency_ms: authResult.max_latency_ms,
      });
    } else {
      // DENIED - Return 403
      console.warn(`[authorize-capability] DENIED: persona=${persona_id}, capability=${capability_key}, reason=${authResult.denial_reason}`);
      return res.status(403).json({
        success: false,
        authorized: false,
        denial_reason: authResult.denial_reason,
        denial_details: authResult.denial_details,
        denial_id: authResult.denial_id,
        message: 'Capability authorization denied. SIVA must not proceed.',
      });
    }
  } catch (error) {
    console.error('[authorize-capability] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to authorize capability',
    });
  }
});

/**
 * GET /api/os/authorize-capability/denials
 *
 * Query capability denials for audit/debugging
 * Supports filtering by persona_id, capability_key, denial_reason
 */
router.get('/denials', async (req, res) => {
  const { persona_id, capability_key, denial_reason, limit = 50 } = req.query;

  try {
    let query = `
      SELECT d.*, p.key as persona_key, p.name as persona_name
      FROM os_capability_denials d
      LEFT JOIN os_personas p ON d.persona_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (persona_id) {
      query += ` AND d.persona_id = $${paramIndex++}`;
      params.push(persona_id);
    }

    if (capability_key) {
      query += ` AND d.capability_key = $${paramIndex++}`;
      params.push(capability_key);
    }

    if (denial_reason) {
      query += ` AND d.denial_reason = $${paramIndex++}`;
      params.push(denial_reason);
    }

    query += ` ORDER BY d.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit, 10));

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('[authorize-capability] Error fetching denials:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to fetch capability denials',
    });
  }
});

/**
 * GET /api/os/authorize-capability/summary
 *
 * Get persona capability summary view
 */
router.get('/summary', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM v_persona_capability_summary');

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error('[authorize-capability] Error fetching summary:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to fetch capability summary',
    });
  }
});

export default router;
