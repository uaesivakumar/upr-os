/**
 * S258 AUTHORITY: Envelope Verification Endpoint
 *
 * GET /api/os/verify-envelope
 *
 * Verifies that an envelope is sealed and valid.
 *
 * Error Codes (HARD FAILURES):
 *   - ENVELOPE_NOT_SEALED: Envelope not found in registry
 *   - ENVELOPE_EXPIRED: Envelope has expired
 *   - ENVELOPE_REVOKED: Envelope has been revoked
 *   - IDENTIFIER_REQUIRED: No envelope_id or sha256_hash provided
 *
 * This is an AUTHORITY endpoint - failures are hard blocks, not soft warnings.
 */

import express from 'express';
import pool from '../../../server/db.js';

const router = express.Router();

/**
 * Error codes for envelope verification failures
 */
const ErrorCodes = {
  ENVELOPE_NOT_SEALED: 'ENVELOPE_NOT_SEALED',
  ENVELOPE_EXPIRED: 'ENVELOPE_EXPIRED',
  ENVELOPE_REVOKED: 'ENVELOPE_REVOKED',
  IDENTIFIER_REQUIRED: 'IDENTIFIER_REQUIRED',
};

/**
 * GET /api/os/verify-envelope
 *
 * Query params:
 *   - envelope_id: UUID (optional, but one of envelope_id or sha256_hash required)
 *   - sha256_hash: string (optional, but one of envelope_id or sha256_hash required)
 */
router.get('/', async (req, res) => {
  const { envelope_id, sha256_hash } = req.query;

  // Validation: require at least one identifier
  if (!envelope_id && !sha256_hash) {
    return res.status(400).json({
      success: false,
      error: ErrorCodes.IDENTIFIER_REQUIRED,
      message: 'Either envelope_id or sha256_hash query parameter is required',
      runtime_eligible: false,
    });
  }

  try {
    // Verify envelope using DB function
    const result = await pool.query(
      `SELECT is_valid, envelope_id, status, sealed_at, verification_message
       FROM verify_envelope($1, $2)`,
      [envelope_id || null, sha256_hash || null]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'VERIFICATION_ERROR',
        message: 'Failed to verify envelope',
        runtime_eligible: false,
      });
    }

    const verification = result.rows[0];

    // Handle various failure cases
    if (!verification.is_valid) {
      const errorCode = verification.verification_message.split(':')[0];

      if (errorCode === 'ENVELOPE_NOT_SEALED') {
        return res.status(404).json({
          success: false,
          error: ErrorCodes.ENVELOPE_NOT_SEALED,
          message: 'Envelope not found in registry',
          runtime_eligible: false,
        });
      }

      if (errorCode === 'ENVELOPE_EXPIRED') {
        return res.status(410).json({
          success: false,
          error: ErrorCodes.ENVELOPE_EXPIRED,
          message: 'Envelope has expired',
          envelope_id: verification.envelope_id,
          sealed_at: verification.sealed_at,
          runtime_eligible: false,
        });
      }

      if (errorCode === 'ENVELOPE_REVOKED') {
        return res.status(410).json({
          success: false,
          error: ErrorCodes.ENVELOPE_REVOKED,
          message: 'Envelope has been revoked',
          envelope_id: verification.envelope_id,
          sealed_at: verification.sealed_at,
          runtime_eligible: false,
        });
      }

      // Generic failure
      return res.status(400).json({
        success: false,
        error: 'VERIFICATION_FAILED',
        message: verification.verification_message,
        runtime_eligible: false,
      });
    }

    // SUCCESS: Envelope is valid
    console.log(`[verify-envelope] SUCCESS: envelope_id=${verification.envelope_id}, status=${verification.status}`);

    return res.json({
      success: true,
      runtime_eligible: true,
      envelope_id: verification.envelope_id,
      status: verification.status,
      sealed_at: verification.sealed_at,
      verification_message: verification.verification_message,
    });

  } catch (error) {
    console.error('[verify-envelope] Error:', error);

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to verify envelope',
      runtime_eligible: false,
    });
  }
});

/**
 * GET /api/os/verify-envelope/content
 *
 * Retrieves the full sealed envelope content for replay.
 *
 * Query params:
 *   - envelope_id: UUID (optional)
 *   - sha256_hash: string (optional)
 */
router.get('/content', async (req, res) => {
  const { envelope_id, sha256_hash } = req.query;

  if (!envelope_id && !sha256_hash) {
    return res.status(400).json({
      success: false,
      error: ErrorCodes.IDENTIFIER_REQUIRED,
      message: 'Either envelope_id or sha256_hash query parameter is required',
    });
  }

  try {
    const result = await pool.query(
      `SELECT envelope_id, envelope_version, sha256_hash, envelope_content, sealed_at, status
       FROM get_envelope_content($1, $2)`,
      [envelope_id || null, sha256_hash || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: ErrorCodes.ENVELOPE_NOT_SEALED,
        message: 'Envelope not found in registry',
      });
    }

    const envelope = result.rows[0];

    console.log(`[verify-envelope/content] SUCCESS: envelope_id=${envelope.envelope_id}`);

    return res.json({
      success: true,
      envelope_id: envelope.envelope_id,
      envelope_version: envelope.envelope_version,
      sha256_hash: envelope.sha256_hash,
      sealed_at: envelope.sealed_at,
      status: envelope.status,
      content: envelope.envelope_content,
    });

  } catch (error) {
    console.error('[verify-envelope/content] Error:', error);

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to retrieve envelope content',
    });
  }
});

export default router;

export { ErrorCodes };
