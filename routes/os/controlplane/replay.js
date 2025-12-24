/**
 * S259 AUTHORITY: Deterministic Replay Endpoint
 *
 * POST /api/os/replay
 * GET  /api/os/replay/:replay_id
 * GET  /api/os/replay/history
 *
 * Enables deterministic replay of SIVA interactions.
 * Drift detection is a HARD FAILURE - replay must produce same output.
 *
 * Error Codes (HARD FAILURES):
 *   - ENVELOPE_NOT_SEALED: Envelope not found in registry
 *   - ENVELOPE_REVOKED: Envelope has been revoked
 *   - ENVELOPE_EXPIRED: Envelope has expired
 *   - REPLAY_DRIFT_DETECTED: Replay produced different output
 *   - REPLAY_NOT_FOUND: Replay attempt not found
 *
 * This is an AUTHORITY endpoint - failures are hard blocks, not soft warnings.
 */

import express from 'express';
import pool from '../../../server/db.js';

const router = express.Router();

/**
 * Error codes for replay failures
 */
const ErrorCodes = {
  ENVELOPE_NOT_SEALED: 'ENVELOPE_NOT_SEALED',
  ENVELOPE_REVOKED: 'ENVELOPE_REVOKED',
  ENVELOPE_EXPIRED: 'ENVELOPE_EXPIRED',
  REPLAY_DRIFT_DETECTED: 'REPLAY_DRIFT_DETECTED',
  REPLAY_NOT_FOUND: 'REPLAY_NOT_FOUND',
  HASH_REQUIRED: 'HASH_REQUIRED',
};

/**
 * POST /api/os/replay
 *
 * Initiates a replay by looking up the sealed envelope.
 *
 * Request body:
 *   - envelope_hash: string (required) - SHA256 hash of envelope to replay
 *   - context: object (optional) - Additional context for replay
 *   - source: string (optional) - Source of replay request ('api', 'sales-bench', etc.)
 */
router.post('/', async (req, res) => {
  const { envelope_hash, context, source } = req.body;

  if (!envelope_hash) {
    return res.status(400).json({
      success: false,
      error: ErrorCodes.HASH_REQUIRED,
      message: 'envelope_hash is required in request body',
      runtime_eligible: false,
    });
  }

  try {
    // Initiate replay
    const result = await pool.query(
      `SELECT replay_id, envelope_id, envelope_content, replay_status, error_code
       FROM initiate_replay($1, $2, $3, $4)`,
      [envelope_hash, context ? JSON.stringify(context) : null, 'api', source || 'api']
    );

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'REPLAY_INIT_ERROR',
        message: 'Failed to initiate replay',
        runtime_eligible: false,
      });
    }

    const replay = result.rows[0];

    // Handle error cases
    if (replay.error_code === 'ENVELOPE_NOT_SEALED') {
      return res.status(404).json({
        success: false,
        error: ErrorCodes.ENVELOPE_NOT_SEALED,
        message: 'Envelope not found in registry',
        replay_id: replay.replay_id,
        runtime_eligible: false,
      });
    }

    if (replay.error_code === 'ENVELOPE_REVOKED') {
      return res.status(410).json({
        success: false,
        error: ErrorCodes.ENVELOPE_REVOKED,
        message: 'Envelope has been revoked',
        replay_id: replay.replay_id,
        envelope_id: replay.envelope_id,
        runtime_eligible: false,
      });
    }

    if (replay.error_code === 'ENVELOPE_EXPIRED') {
      return res.status(410).json({
        success: false,
        error: ErrorCodes.ENVELOPE_EXPIRED,
        message: 'Envelope has expired',
        replay_id: replay.replay_id,
        envelope_id: replay.envelope_id,
        runtime_eligible: false,
      });
    }

    // SUCCESS: Return envelope content for replay
    console.log(`[replay] INITIATED: replay_id=${replay.replay_id}, envelope_id=${replay.envelope_id}`);

    return res.json({
      success: true,
      replay_id: replay.replay_id,
      envelope_id: replay.envelope_id,
      envelope_content: replay.envelope_content,
      replay_status: 'PENDING',
      message: 'Replay initiated. Execute with envelope content and call complete endpoint.',
    });

  } catch (error) {
    console.error('[replay] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to initiate replay',
      runtime_eligible: false,
    });
  }
});

/**
 * POST /api/os/replay/:replay_id/complete
 *
 * Completes a replay with drift detection.
 *
 * Request body:
 *   - output: object (required) - Output from replay execution
 *   - new_hash: string (optional) - Hash of replay output for drift detection
 */
router.post('/:replay_id/complete', async (req, res) => {
  const { replay_id } = req.params;
  const { output, new_hash } = req.body;

  if (!output) {
    return res.status(400).json({
      success: false,
      error: 'OUTPUT_REQUIRED',
      message: 'output is required in request body',
    });
  }

  try {
    const result = await pool.query(
      `SELECT replay_id, replay_status, drift_detected, drift_details
       FROM complete_replay($1, $2, $3)`,
      [replay_id, JSON.stringify(output), new_hash || null]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'REPLAY_COMPLETE_ERROR',
        message: 'Failed to complete replay',
      });
    }

    const completion = result.rows[0];

    // HARD FAILURE: Drift detected
    if (completion.drift_detected) {
      console.error(`[replay] S259 HARD FAILURE: REPLAY_DRIFT_DETECTED replay_id=${replay_id}`);
      return res.status(409).json({
        success: false,
        error: ErrorCodes.REPLAY_DRIFT_DETECTED,
        message: 'Replay produced different output than original. Deterministic replay failed.',
        replay_id: completion.replay_id,
        drift_details: completion.drift_details,
        runtime_eligible: false,
      });
    }

    // SUCCESS
    console.log(`[replay] COMPLETED: replay_id=${replay_id}, status=${completion.replay_status}`);

    return res.json({
      success: true,
      replay_id: completion.replay_id,
      replay_status: completion.replay_status,
      drift_detected: false,
      message: 'Replay completed successfully. Output matches original.',
    });

  } catch (error) {
    console.error('[replay/complete] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to complete replay',
    });
  }
});

/**
 * GET /api/os/replay/:replay_id
 *
 * Get details of a specific replay attempt.
 */
router.get('/:replay_id', async (req, res) => {
  const { replay_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, envelope_id, envelope_hash, replay_status, drift_detected,
              drift_details, replay_requested_at, replay_completed_at,
              requested_by, request_source
       FROM os_replay_attempts
       WHERE id = $1`,
      [replay_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: ErrorCodes.REPLAY_NOT_FOUND,
        message: 'Replay attempt not found',
      });
    }

    return res.json({
      success: true,
      replay: result.rows[0],
    });

  } catch (error) {
    console.error('[replay/get] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to get replay details',
    });
  }
});

/**
 * GET /api/os/replay/history
 *
 * Get replay history for an envelope.
 *
 * Query params:
 *   - envelope_id: UUID (optional)
 *   - envelope_hash: string (optional)
 *   - limit: number (optional, default 10)
 */
router.get('/history', async (req, res) => {
  const { envelope_id, envelope_hash, limit } = req.query;

  try {
    const result = await pool.query(
      `SELECT replay_id, envelope_id, envelope_hash, replay_status, drift_detected,
              replay_requested_at, replay_completed_at, requested_by, request_source
       FROM get_replay_history($1, $2, $3)`,
      [envelope_id || null, envelope_hash || null, parseInt(limit) || 10]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      history: result.rows,
    });

  } catch (error) {
    console.error('[replay/history] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to get replay history',
    });
  }
});

export default router;

export { ErrorCodes };
