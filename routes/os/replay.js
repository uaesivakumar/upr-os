/**
 * Deterministic Replay API (PRD v1.2 §7)
 *
 * Enables replay of any SIVA interaction for audit, debugging, and compliance.
 *
 * Key Features:
 * - /replay/{interaction_id} - Replay with original envelope + evidence
 * - Output comparison (determinism verification)
 * - Policy gate tracking
 * - Audit trail for compliance
 *
 * PRD §7.1: "Any interaction can be replayed given its interaction_id"
 * PRD §7.2: "Replay uses stored envelope + evidence snapshot"
 * PRD §7.3: "Output hash comparison for determinism verification"
 */

import express from 'express';
import crypto from 'crypto';
import db from '../../utils/db.js';
import { validateEnvelope } from '../../os/envelope/index.js';

const router = express.Router();
const { pool } = db;

/**
 * POST /api/os/replay/:interaction_id
 *
 * Replay a SIVA interaction with original envelope and evidence
 *
 * Response includes:
 * - original_output_hash: Hash of original SIVA output
 * - replay_output_hash: Hash of replayed output
 * - outputs_match: Boolean determinism check
 * - policy_gates_hit: Which policy gates were triggered
 */
router.post('/:interaction_id', async (req, res) => {
  const { interaction_id } = req.params;
  const { replay_reason = 'audit' } = req.body;
  const replayed_by = req.user?.id || req.headers['x-user-id'] || 'system';

  try {
    // Step 1: Fetch original interaction from envelope_audit_log
    const auditResult = await pool.query(`
      SELECT
        id,
        envelope_hash,
        envelope_version,
        tenant_id,
        user_id,
        persona_id,
        vertical,
        sub_vertical,
        region,
        endpoint,
        method,
        correlation_id,
        interaction_id,
        evidence_snapshot_id,
        output_hash,
        created_at
      FROM envelope_audit_log
      WHERE interaction_id = $1
    `, [interaction_id]);

    if (auditResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'INTERACTION_NOT_FOUND',
          message: `No interaction found with ID: ${interaction_id}`,
        },
      });
    }

    const originalInteraction = auditResult.rows[0];

    // Step 2: Fetch evidence snapshot if available
    let evidenceSnapshot = null;
    if (originalInteraction.evidence_snapshot_id) {
      const snapshotResult = await pool.query(`
        SELECT
          id,
          envelope_hash,
          evidence_data,
          evidence_ids,
          created_at
        FROM evidence_snapshots
        WHERE id = $1
      `, [originalInteraction.evidence_snapshot_id]);

      if (snapshotResult.rows.length > 0) {
        evidenceSnapshot = snapshotResult.rows[0];
      }
    }

    // Step 3: Reconstruct envelope from audit log
    const reconstructedEnvelope = {
      envelope_version: originalInteraction.envelope_version,
      tenant_id: originalInteraction.tenant_id,
      user_id: originalInteraction.user_id,
      persona_id: originalInteraction.persona_id,
      vertical: originalInteraction.vertical,
      sub_vertical: originalInteraction.sub_vertical,
      region: originalInteraction.region,
      sha256_hash: originalInteraction.envelope_hash,
      // Replay-specific fields
      is_replay: true,
      original_interaction_id: interaction_id,
    };

    // Step 4: Validate reconstructed envelope
    const envelopeValidation = validateEnvelope(reconstructedEnvelope);
    if (!envelopeValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ENVELOPE_RECONSTRUCTION_FAILED',
          message: 'Could not reconstruct valid envelope from audit log',
          validation_errors: envelopeValidation.errors,
        },
      });
    }

    // Step 5: For now, return replay metadata (actual SIVA re-execution would go here)
    // In production, this would re-execute the SIVA tool with the envelope + evidence
    const replayOutput = {
      replay_mode: true,
      original_envelope_hash: originalInteraction.envelope_hash,
      evidence_available: !!evidenceSnapshot,
      evidence_count: evidenceSnapshot?.evidence_ids?.length || 0,
      // Placeholder for actual replay output
      replay_executed: false,
      reason: 'SIVA tool re-execution not implemented in this phase',
    };

    // Calculate replay output hash
    const replayOutputHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(replayOutput))
      .digest('hex');

    // Step 6: Compare outputs (determinism check)
    const outputsMatch = originalInteraction.output_hash === replayOutputHash;

    // Step 7: Log replay attempt
    const policyGatesHit = {
      envelope_validation: envelopeValidation.valid,
      evidence_available: !!evidenceSnapshot,
      persona_check: true,
    };

    await pool.query(`
      INSERT INTO replay_log (
        original_interaction_id,
        original_envelope_hash,
        original_output_hash,
        replay_output_hash,
        outputs_match,
        policy_gates_hit,
        replayed_by,
        replay_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      interaction_id,
      originalInteraction.envelope_hash,
      originalInteraction.output_hash,
      replayOutputHash,
      outputsMatch,
      JSON.stringify(policyGatesHit),
      replayed_by,
      replay_reason,
    ]);

    // Step 8: Return replay result
    res.json({
      success: true,
      data: {
        interaction_id,
        original: {
          envelope_hash: originalInteraction.envelope_hash,
          output_hash: originalInteraction.output_hash,
          created_at: originalInteraction.created_at,
          endpoint: originalInteraction.endpoint,
          method: originalInteraction.method,
        },
        replay: {
          output_hash: replayOutputHash,
          outputs_match: outputsMatch,
          evidence_snapshot_used: !!evidenceSnapshot,
          evidence_count: evidenceSnapshot?.evidence_ids?.length || 0,
        },
        policy_gates_hit: policyGatesHit,
        envelope: {
          tenant_id: originalInteraction.tenant_id,
          persona_id: originalInteraction.persona_id,
          vertical: originalInteraction.vertical,
          sub_vertical: originalInteraction.sub_vertical,
          region: originalInteraction.region,
        },
        meta: {
          replayed_at: new Date().toISOString(),
          replayed_by,
          replay_reason,
        },
      },
    });
  } catch (error) {
    console.error('[Replay API] Error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REPLAY_FAILED',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/os/replay/:interaction_id/history
 *
 * Get replay history for an interaction
 */
router.get('/:interaction_id/history', async (req, res) => {
  const { interaction_id } = req.params;

  try {
    const result = await pool.query(`
      SELECT
        id,
        original_interaction_id,
        original_envelope_hash,
        original_output_hash,
        replay_output_hash,
        outputs_match,
        policy_gates_hit,
        replayed_at,
        replayed_by,
        replay_reason
      FROM replay_log
      WHERE original_interaction_id = $1
      ORDER BY replayed_at DESC
    `, [interaction_id]);

    res.json({
      success: true,
      data: {
        interaction_id,
        replay_count: result.rows.length,
        replays: result.rows,
      },
    });
  } catch (error) {
    console.error('[Replay API] History error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'HISTORY_FETCH_FAILED',
        message: error.message,
      },
    });
  }
});

/**
 * GET /api/os/replay/stats
 *
 * Get replay statistics for compliance reporting
 */
router.get('/stats', async (req, res) => {
  const { tenant_id, from_date, to_date } = req.query;

  try {
    let whereClause = '';
    const params = [];

    if (tenant_id) {
      params.push(tenant_id);
      whereClause = `WHERE eal.tenant_id = $${params.length}`;
    }

    if (from_date) {
      params.push(from_date);
      whereClause += whereClause ? ' AND' : 'WHERE';
      whereClause += ` rl.replayed_at >= $${params.length}`;
    }

    if (to_date) {
      params.push(to_date);
      whereClause += whereClause ? ' AND' : 'WHERE';
      whereClause += ` rl.replayed_at <= $${params.length}`;
    }

    const result = await pool.query(`
      SELECT
        COUNT(*) as total_replays,
        COUNT(*) FILTER (WHERE rl.outputs_match = true) as deterministic_replays,
        COUNT(*) FILTER (WHERE rl.outputs_match = false) as non_deterministic_replays,
        COUNT(DISTINCT rl.original_interaction_id) as unique_interactions_replayed
      FROM replay_log rl
      LEFT JOIN envelope_audit_log eal ON rl.original_interaction_id = eal.interaction_id
      ${whereClause}
    `, params);

    const stats = result.rows[0];
    const determinismRate = stats.total_replays > 0
      ? (parseInt(stats.deterministic_replays) / parseInt(stats.total_replays) * 100).toFixed(2)
      : 100;

    res.json({
      success: true,
      data: {
        total_replays: parseInt(stats.total_replays),
        deterministic_replays: parseInt(stats.deterministic_replays),
        non_deterministic_replays: parseInt(stats.non_deterministic_replays),
        unique_interactions_replayed: parseInt(stats.unique_interactions_replayed),
        determinism_rate: `${determinismRate}%`,
        filters: {
          tenant_id: tenant_id || null,
          from_date: from_date || null,
          to_date: to_date || null,
        },
      },
    });
  } catch (error) {
    console.error('[Replay API] Stats error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_FETCH_FAILED',
        message: error.message,
      },
    });
  }
});

export default router;
