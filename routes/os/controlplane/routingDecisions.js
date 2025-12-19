/**
 * Routing Decisions API
 * S232: Model Radar - Routing Decision Viewer
 *
 * Exposes routing decisions for Super Admin visibility.
 * Read-only endpoint - routing behavior is never controlled from here.
 */

import express from 'express';
import { getRoutingDecisions } from '../model-router.js';

const router = express.Router();

/**
 * GET /api/os/routing-decisions
 *
 * List routing decisions from v_routing_decision_audit view.
 *
 * Query params:
 * - capability_key: Filter by capability
 * - persona_id: Filter by persona
 * - deviations_only: Only show decisions with replay issues
 * - limit: Max results (default 50)
 * - offset: Pagination offset
 */
router.get('/', async (req, res) => {
  try {
    const {
      capability_key,
      persona_id,
      deviations_only,
      limit = 50,
      offset = 0,
    } = req.query;

    const result = await getRoutingDecisions({
      capability_key,
      persona_id,
      deviations_only: deviations_only === 'true',
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        message: result.message,
      });
    }

    res.json({
      success: true,
      data: result.data,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  } catch (error) {
    console.error('[OS:RoutingDecisions] Error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_ERROR',
      message: error.message,
    });
  }
});

export default router;
