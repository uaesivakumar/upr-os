/**
 * S257 AUTHORITY: Territory Resolution Hard Gate
 *
 * GET /api/os/resolve-territory
 *
 * Resolves territory using inheritance hierarchy:
 *   exact match → parent hierarchy → global fallback
 *
 * Error Codes (HARD FAILURES):
 *   - TERRITORY_NOT_CONFIGURED: No territory found for region_code
 *   - TERRITORY_INVALID_FOR_SUBVERTICAL: Territory not configured for sub-vertical
 *   - REGION_CODE_REQUIRED: region_code query parameter missing
 *
 * This is an AUTHORITY endpoint - failures are hard blocks, not soft warnings.
 */

import express from 'express';
import pool from '../../../server/db.js';

const router = express.Router();

/**
 * Error codes for territory resolution failures
 */
const ErrorCodes = {
  TERRITORY_NOT_CONFIGURED: 'TERRITORY_NOT_CONFIGURED',
  TERRITORY_INVALID_FOR_SUBVERTICAL: 'TERRITORY_INVALID_FOR_SUBVERTICAL',
  REGION_CODE_REQUIRED: 'REGION_CODE_REQUIRED',
  SUB_VERTICAL_NOT_FOUND: 'SUB_VERTICAL_NOT_FOUND',
};

/**
 * GET /api/os/resolve-territory
 *
 * Query params:
 *   - region_code: string (required) - region identifier (e.g., 'UAE', 'dubai', 'US-CA')
 *   - sub_vertical_id: UUID (optional) - for sub-vertical specific validation
 */
router.get('/', async (req, res) => {
  const { region_code, sub_vertical_id } = req.query;

  // Validation
  if (!region_code) {
    return res.status(400).json({
      success: false,
      error: ErrorCodes.REGION_CODE_REQUIRED,
      message: 'region_code query parameter is required',
      runtime_eligible: false,
    });
  }

  try {
    // Step 1: Resolve territory using inheritance
    const territoryResult = await pool.query(
      `SELECT territory_id, territory_slug, territory_name, territory_level,
              coverage_type, resolution_path, resolution_depth
       FROM resolve_territory_with_inheritance($1, $2)`,
      [region_code, sub_vertical_id || null]
    );

    if (territoryResult.rows.length === 0) {
      // HARD FAILURE: No territory resolved
      console.error(`[resolve-territory] HARD FAILURE: TERRITORY_NOT_CONFIGURED for region_code=${region_code}`);

      return res.status(404).json({
        success: false,
        error: ErrorCodes.TERRITORY_NOT_CONFIGURED,
        message: `No territory configured for region ${region_code}`,
        resolution_path: `EXACT(${region_code}) → COUNTRY(none) → SLUG(none) → NAME(none) → GLOBAL(none)`,
        runtime_eligible: false,
      });
    }

    const territory = territoryResult.rows[0];

    // Step 2: If sub_vertical_id provided, validate territory is configured for it
    if (sub_vertical_id) {
      const validationResult = await pool.query(
        `SELECT is_valid, validation_message, territory_config
         FROM validate_territory_for_sub_vertical($1, $2)`,
        [territory.territory_id, sub_vertical_id]
      );

      if (validationResult.rows.length === 0 || !validationResult.rows[0].is_valid) {
        const validationMessage = validationResult.rows[0]?.validation_message || 'Validation failed';

        console.error(`[resolve-territory] HARD FAILURE: TERRITORY_INVALID_FOR_SUBVERTICAL territory=${territory.territory_slug}, sub_vertical=${sub_vertical_id}`);

        return res.status(409).json({
          success: false,
          error: ErrorCodes.TERRITORY_INVALID_FOR_SUBVERTICAL,
          message: validationMessage,
          territory: {
            id: territory.territory_id,
            slug: territory.territory_slug,
            name: territory.territory_name,
          },
          runtime_eligible: false,
        });
      }
    }

    // SUCCESS: Territory resolved
    console.log(`[resolve-territory] SUCCESS: territory=${territory.territory_slug}, level=${territory.territory_level}, path=${territory.resolution_path}`);

    return res.json({
      success: true,
      runtime_eligible: true,
      resolution: {
        path: territory.resolution_path,
        depth: territory.resolution_depth,
      },
      territory: {
        id: territory.territory_id,
        slug: territory.territory_slug,
        name: territory.territory_name,
        level: territory.territory_level,
        coverage_type: territory.coverage_type,
      },
    });

  } catch (error) {
    console.error('[resolve-territory] Error:', error);

    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Failed to resolve territory',
      runtime_eligible: false,
    });
  }
});

export default router;

export { ErrorCodes };
