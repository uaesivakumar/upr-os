/**
 * S260 AUTHORITY: Sales-Bench Mandatory Runtime Gate
 *
 * Enforces runtime gate check before any SIVA execution.
 * Blocks calls without valid envelope.
 *
 * Error Codes:
 * - RUNTIME_GATE_VIOLATION: No envelope provided
 * - NO_ENVELOPE: Missing envelope identifier
 * - INVALID_ENVELOPE: Envelope not found in registry
 * - REVOKED_ENVELOPE: Envelope has been revoked
 * - EXPIRED_ENVELOPE: Envelope has expired
 */

import express from 'express';
import pool from '../../../server/db.js';

const router = express.Router();

/**
 * POST /api/os/runtime-gate/check
 *
 * Check runtime gate before SIVA execution.
 * Returns gate_passed: true/false with violation details.
 */
router.post('/check', async (req, res) => {
  const {
    source = 'api',
    endpoint,
    method = 'POST',
    tenant_id,
    workspace_id,
    user_id,
    envelope_id,
    envelope_hash,
    request_context
  } = req.body;

  try {
    const result = await pool.query(
      `SELECT gate_passed, violation_id, violation_code, violation_message, envelope_status
       FROM check_runtime_gate($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        source,
        endpoint,
        method,
        tenant_id,
        workspace_id,
        user_id,
        envelope_id,
        envelope_hash,
        request_context ? JSON.stringify(request_context) : null
      ]
    );

    const gate = result.rows[0];

    if (gate.gate_passed) {
      return res.json({
        success: true,
        gate_passed: true,
        envelope_status: gate.envelope_status
      });
    }

    // Gate failed - return violation details
    return res.status(403).json({
      success: false,
      gate_passed: false,
      error: 'RUNTIME_GATE_VIOLATION',
      violation_id: gate.violation_id,
      violation_code: gate.violation_code,
      violation_message: gate.violation_message,
      envelope_status: gate.envelope_status
    });

  } catch (error) {
    console.error('Runtime gate check error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/os/runtime-gate/violations
 *
 * Get violation statistics for monitoring.
 */
router.get('/violations', async (req, res) => {
  const { since, source } = req.query;

  try {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await pool.query(
      `SELECT total_violations, unresolved_count, by_code, by_source, recent_violations
       FROM get_violation_statistics($1, $2)`,
      [sinceDate, source || null]
    );

    const stats = result.rows[0];

    return res.json({
      success: true,
      statistics: {
        total_violations: parseInt(stats.total_violations),
        unresolved_count: parseInt(stats.unresolved_count),
        by_code: stats.by_code,
        by_source: stats.by_source,
        recent_violations: stats.recent_violations
      },
      query: {
        since: sinceDate.toISOString(),
        source: source || 'all'
      }
    });

  } catch (error) {
    console.error('Get violation statistics error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * GET /api/os/runtime-gate/violations/:id
 *
 * Get details of a specific violation.
 */
router.get('/violations/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM os_runtime_gate_violations WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'VIOLATION_NOT_FOUND'
      });
    }

    return res.json({
      success: true,
      violation: result.rows[0]
    });

  } catch (error) {
    console.error('Get violation error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

/**
 * PATCH /api/os/runtime-gate/violations/:id/resolve
 *
 * Resolve a violation.
 */
router.patch('/violations/:id/resolve', async (req, res) => {
  const { id } = req.params;
  const { status, resolved_by, notes } = req.body;

  const validStatuses = ['RESOLVED', 'IGNORED', 'ESCALATED'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_STATUS',
      message: `Status must be one of: ${validStatuses.join(', ')}`
    });
  }

  try {
    const result = await pool.query(
      `UPDATE os_runtime_gate_violations
       SET resolution_status = $1,
           resolved_at = NOW(),
           resolved_by = $2,
           resolution_notes = $3
       WHERE id = $4
       RETURNING id, resolution_status, resolved_at`,
      [status, resolved_by, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'VIOLATION_NOT_FOUND'
      });
    }

    return res.json({
      success: true,
      violation: result.rows[0]
    });

  } catch (error) {
    console.error('Resolve violation error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error.message
    });
  }
});

export default router;
