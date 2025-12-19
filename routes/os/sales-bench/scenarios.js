/**
 * Scenario Management API Routes
 * S242: Scenario Management API
 * PRD v1.3 §2.1, §7.3
 *
 * Endpoints:
 * - POST   /api/os/sales-bench/scenarios       - Create scenario
 * - GET    /api/os/sales-bench/scenarios/:id   - Get scenario by ID
 * - GET    /api/os/sales-bench/scenarios       - List scenarios (vertical required)
 * - GET    /api/os/sales-bench/scenarios/stats - Get scenario counts by vertical
 * - DELETE /api/os/sales-bench/scenarios/:id   - Deactivate scenario (soft delete)
 */

import express from 'express';
import {
  createScenarioRecord,
  getScenarioById,
  listScenarios,
  getScenarioCountsByVertical,
  deactivateScenario,
  findDuplicateScenario,
} from '../../../os/sales-bench/storage/scenario-store.js';
import { AuthorityInvarianceError } from '../../../os/sales-bench/guards/authority-invariance.js';

const router = express.Router();

/**
 * POST /api/os/sales-bench/scenarios
 * Create a new scenario (immutable after creation)
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
    const requiredFields = [
      'vertical',
      'sub_vertical',
      'region',
      'entry_intent',
      'buyer_bot_id',
      'success_condition',
      'path_type',
      'expected_outcome',
    ];

    const missingFields = requiredFields.filter((f) => !data[f]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        missing: missingFields,
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    // Check for duplicate scenario (same hash)
    const duplicate = await findDuplicateScenario(data);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_SCENARIO',
        existing_scenario_id: duplicate.scenario_id,
        message: 'A scenario with identical configuration already exists',
      });
    }

    const scenario = await createScenarioRecord(data);

    res.status(201).json({
      success: true,
      data: scenario,
      message: 'Scenario created successfully',
    });
  } catch (error) {
    if (error instanceof AuthorityInvarianceError) {
      return res.status(403).json({
        success: false,
        error: 'AUTHORITY_INVARIANCE_VIOLATION',
        message: error.message,
        prdReference: error.prdReference,
      });
    }

    console.error('[SALES_BENCH] Scenario creation error:', error);
    res.status(500).json({
      success: false,
      error: 'SCENARIO_CREATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/scenarios/:id
 * Get scenario by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SCENARIO_ID',
        message: 'Scenario ID must be a valid UUID',
      });
    }

    const scenario = await getScenarioById(id);

    if (!scenario) {
      return res.status(404).json({
        success: false,
        error: 'SCENARIO_NOT_FOUND',
        message: `Scenario with ID ${id} not found`,
      });
    }

    res.json({
      success: true,
      data: scenario,
    });
  } catch (error) {
    if (error.message.includes('hash mismatch')) {
      return res.status(500).json({
        success: false,
        error: 'SCENARIO_INTEGRITY_VIOLATION',
        message: error.message,
      });
    }

    console.error('[SALES_BENCH] Scenario retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'SCENARIO_RETRIEVAL_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/scenarios
 * List scenarios with filters
 * PRD v1.3 §7.3: Vertical filter is REQUIRED (no cross-vertical aggregation)
 */
router.get('/', async (req, res) => {
  try {
    const {
      vertical,
      sub_vertical,
      region,
      path_type,
      expected_outcome,
      limit,
    } = req.query;

    // PRD v1.3 §7.3: Vertical is REQUIRED
    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'vertical query parameter is required (PRD v1.3 §7.3: Cross-vertical aggregation forbidden)',
        prdReference: 'PRD v1.3 §7.3',
      });
    }

    const filters = {
      vertical,
      sub_vertical,
      region,
      path_type,
      expected_outcome,
      limit: limit ? parseInt(limit, 10) : 100,
    };

    const scenarios = await listScenarios(filters);

    res.json({
      success: true,
      data: scenarios,
      count: scenarios.length,
      filters: {
        vertical,
        sub_vertical: sub_vertical || null,
        region: region || null,
        path_type: path_type || null,
        expected_outcome: expected_outcome || null,
      },
    });
  } catch (error) {
    if (error.message.includes('FORBIDDEN')) {
      return res.status(403).json({
        success: false,
        error: 'CROSS_VERTICAL_FORBIDDEN',
        message: error.message,
        prdReference: 'PRD v1.3 §7.3',
      });
    }

    console.error('[SALES_BENCH] Scenario list error:', error);
    res.status(500).json({
      success: false,
      error: 'SCENARIO_LIST_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/scenarios/stats/:vertical
 * Get scenario counts by vertical
 */
router.get('/stats/:vertical', async (req, res) => {
  try {
    const { vertical } = req.params;

    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'Vertical parameter is required',
      });
    }

    const stats = await getScenarioCountsByVertical(vertical);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Scenario stats error:', error);
    res.status(500).json({
      success: false,
      error: 'SCENARIO_STATS_FAILED',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/os/sales-bench/scenarios/:id
 * Deactivate a scenario (soft delete - maintains audit trail)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SCENARIO_ID',
        message: 'Scenario ID must be a valid UUID',
      });
    }

    const deactivated = await deactivateScenario(id);

    if (!deactivated) {
      return res.status(404).json({
        success: false,
        error: 'SCENARIO_NOT_FOUND',
        message: `Active scenario with ID ${id} not found`,
      });
    }

    res.json({
      success: true,
      message: 'Scenario deactivated successfully',
      scenario_id: id,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Scenario deactivation error:', error);
    res.status(500).json({
      success: false,
      error: 'SCENARIO_DEACTIVATION_FAILED',
      message: error.message,
    });
  }
});

export default router;
