/**
 * Mandatory Adversarial Bots API Routes
 * S244: Mandatory Adversarial Bots
 * PRD v1.3 Appendix §5.3
 *
 * Endpoints:
 * - POST /api/os/sales-bench/mandatory/seed       - Seed mandatory bots for a vertical
 * - GET  /api/os/sales-bench/mandatory/validate   - Validate mandatory coverage
 * - GET  /api/os/sales-bench/mandatory/required   - Get required bots list
 */

import express from 'express';
import {
  MANDATORY_ADVERSARIAL_BOTS,
  getMandatoryBotsForContext,
  seedMandatoryBots,
  validateMandatoryCoverage,
  getKillPathRequiredBots,
  getGoldenPathMinimumBots,
} from '../../../os/sales-bench/bots/mandatory-adversarial.js';
import {
  createBuyerBotRecord,
  listBuyerBots,
  getMandatoryBots,
} from '../../../os/sales-bench/storage/buyer-bot-store.js';
import { AuthorityInvarianceError } from '../../../os/sales-bench/guards/authority-invariance.js';

const router = express.Router();

/**
 * POST /api/os/sales-bench/mandatory/seed
 * Seed mandatory adversarial bots for a vertical/sub-vertical
 */
router.post('/seed', async (req, res) => {
  try {
    const { vertical, sub_vertical } = req.body;

    if (!vertical || !sub_vertical) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CONTEXT',
        message: 'Both vertical and sub_vertical are required',
      });
    }

    const created = await seedMandatoryBots(createBuyerBotRecord, vertical, sub_vertical);

    res.status(201).json({
      success: true,
      data: {
        vertical,
        sub_vertical,
        bots_created: created.length,
        bots: created.map((b) => ({
          bot_id: b.bot_id,
          name: b.name,
          category: b.category,
        })),
      },
      message: `Seeded ${created.length} mandatory adversarial bots`,
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

    console.error('[SALES_BENCH] Mandatory bot seeding error:', error);
    res.status(500).json({
      success: false,
      error: 'SEEDING_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/mandatory/validate
 * Validate that all mandatory bots exist for a vertical/sub-vertical
 */
router.get('/validate', async (req, res) => {
  try {
    const { vertical, sub_vertical } = req.query;

    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'vertical query parameter is required',
      });
    }

    const validation = await validateMandatoryCoverage(
      listBuyerBots,
      vertical,
      sub_vertical
    );

    const status = validation.valid ? 200 : 409;

    res.status(status).json({
      success: validation.valid,
      data: {
        vertical,
        sub_vertical: sub_vertical || 'all',
        valid: validation.valid,
        coverage: validation.coverage,
        missing: validation.missing,
      },
      message: validation.valid
        ? 'All mandatory adversarial bots present'
        : `Missing ${validation.missing.length} mandatory bots`,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Validation error:', error);
    res.status(500).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/mandatory/required
 * Get the list of required mandatory bots
 */
router.get('/required', (req, res) => {
  const { path_type } = req.query;

  let requiredBots;
  let description;

  if (path_type === 'KILL') {
    requiredBots = getKillPathRequiredBots();
    description = 'Kill Path scenarios MUST test against all mandatory adversarial bots';
  } else if (path_type === 'GOLDEN') {
    requiredBots = getGoldenPathMinimumBots();
    description = 'Golden Path scenarios must test against minimum 3 mandatory adversarial bots';
  } else {
    requiredBots = MANDATORY_ADVERSARIAL_BOTS.map((b) => b.name);
    description = 'Complete list of mandatory adversarial bots';
  }

  res.json({
    success: true,
    data: {
      path_type: path_type || 'all',
      required_count: requiredBots.length,
      bots: requiredBots,
      definitions: MANDATORY_ADVERSARIAL_BOTS.map((b) => ({
        name: b.name,
        category: b.category,
        description: b.persona_description.split('\n')[0].trim(),
        trigger_count: b.failure_triggers.length,
        hidden_state_count: b.hidden_states.length,
      })),
    },
    description,
    prdReference: 'PRD v1.3 §5.3',
  });
});

/**
 * GET /api/os/sales-bench/mandatory/bots/:vertical
 * Get mandatory bots for a specific vertical
 */
router.get('/bots/:vertical', async (req, res) => {
  try {
    const { vertical } = req.params;
    const { sub_vertical } = req.query;

    const bots = await getMandatoryBots(vertical, sub_vertical);

    res.json({
      success: true,
      data: bots,
      count: bots.length,
      vertical,
      sub_vertical: sub_vertical || null,
      required_count: MANDATORY_ADVERSARIAL_BOTS.length,
      coverage_complete: bots.length >= MANDATORY_ADVERSARIAL_BOTS.length,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Mandatory bots list error:', error);
    res.status(500).json({
      success: false,
      error: 'LIST_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/mandatory/seed-all
 * Seed mandatory bots for all configured verticals
 */
router.post('/seed-all', async (req, res) => {
  try {
    const { verticals } = req.body;

    if (!verticals || !Array.isArray(verticals) || verticals.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_VERTICALS',
        message: 'verticals array is required with format: [{vertical, sub_vertical}]',
        example: {
          verticals: [
            { vertical: 'banking', sub_vertical: 'employee_banking' },
            { vertical: 'banking', sub_vertical: 'corporate_banking' },
          ],
        },
      });
    }

    const results = [];

    for (const { vertical, sub_vertical } of verticals) {
      if (!vertical || !sub_vertical) continue;

      try {
        const created = await seedMandatoryBots(createBuyerBotRecord, vertical, sub_vertical);
        results.push({
          vertical,
          sub_vertical,
          bots_created: created.length,
          success: true,
        });
      } catch (error) {
        results.push({
          vertical,
          sub_vertical,
          bots_created: 0,
          success: false,
          error: error.message,
        });
      }
    }

    const totalCreated = results.reduce((sum, r) => sum + r.bots_created, 0);

    res.status(201).json({
      success: true,
      data: {
        verticals_processed: results.length,
        total_bots_created: totalCreated,
        results,
      },
      message: `Seeded ${totalCreated} mandatory bots across ${results.length} vertical combinations`,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Bulk seeding error:', error);
    res.status(500).json({
      success: false,
      error: 'BULK_SEEDING_FAILED',
      message: error.message,
    });
  }
});

export default router;
