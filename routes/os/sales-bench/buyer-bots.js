/**
 * Buyer Bot API Routes
 * S243: Buyer Bot Framework
 * PRD v1.3 Appendix §5
 *
 * Endpoints:
 * - POST   /api/os/sales-bench/buyer-bots           - Create bot
 * - GET    /api/os/sales-bench/buyer-bots/:id       - Get bot by ID
 * - GET    /api/os/sales-bench/buyer-bots           - List bots (vertical required)
 * - PATCH  /api/os/sales-bench/buyer-bots/:id       - Update bot
 * - DELETE /api/os/sales-bench/buyer-bots/:id       - Deactivate bot
 * - POST   /api/os/sales-bench/buyer-bots/:id/variants - Create variant
 * - GET    /api/os/sales-bench/buyer-bots/:id/variants - List variants
 * - GET    /api/os/sales-bench/buyer-bots/mandatory/:vertical - Get mandatory bots
 * - GET    /api/os/sales-bench/buyer-bots/stats/:vertical - Get category stats
 */

import express from 'express';
import {
  createBuyerBotRecord,
  getBuyerBotById,
  listBuyerBots,
  updateBuyerBot,
  deactivateBuyerBot,
  createBotVariantRecord,
  getBotVariants,
  getBotVariantById,
  getMandatoryBots,
  getBotCategoryCounts,
} from '../../../os/sales-bench/storage/buyer-bot-store.js';
import { BOT_CATEGORIES } from '../../../os/sales-bench/types/buyer-bot.js';
import { AuthorityInvarianceError } from '../../../os/sales-bench/guards/authority-invariance.js';

const router = express.Router();

/**
 * POST /api/os/sales-bench/buyer-bots
 * Create a new Buyer Bot
 */
router.post('/', async (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
    const requiredFields = [
      'name',
      'category',
      'vertical',
      'sub_vertical',
      'persona_description',
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

    // Validate category
    if (!Object.values(BOT_CATEGORIES).includes(data.category)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_CATEGORY',
        message: `Invalid category: ${data.category}. Valid: ${Object.values(BOT_CATEGORIES).join(', ')}`,
        valid_categories: Object.values(BOT_CATEGORIES),
      });
    }

    const bot = await createBuyerBotRecord(data);

    res.status(201).json({
      success: true,
      data: bot,
      message: 'Buyer Bot created successfully',
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

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_BOT_NAME',
        message: 'A bot with this name already exists in this vertical/sub-vertical',
      });
    }

    console.error('[SALES_BENCH] Buyer Bot creation error:', error);
    res.status(500).json({
      success: false,
      error: 'BOT_CREATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/buyer-bots/:id
 * Get Buyer Bot by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Handle special routes first
    if (id === 'mandatory' || id === 'stats') {
      return res.status(400).json({
        success: false,
        error: 'MISSING_VERTICAL',
        message: 'Use /mandatory/:vertical or /stats/:vertical',
      });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_BOT_ID',
        message: 'Bot ID must be a valid UUID',
      });
    }

    const bot = await getBuyerBotById(id);

    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'BOT_NOT_FOUND',
        message: `Buyer Bot with ID ${id} not found`,
      });
    }

    res.json({
      success: true,
      data: bot,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Buyer Bot retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'BOT_RETRIEVAL_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/buyer-bots
 * List Buyer Bots with filters
 * PRD v1.3 §7.3: Vertical filter is REQUIRED
 */
router.get('/', async (req, res) => {
  try {
    const {
      vertical,
      sub_vertical,
      category,
      mandatory_only,
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
      category,
      mandatory_only: mandatory_only === 'true',
      limit: limit ? parseInt(limit, 10) : 100,
    };

    const bots = await listBuyerBots(filters);

    res.json({
      success: true,
      data: bots,
      count: bots.length,
      filters: {
        vertical,
        sub_vertical: sub_vertical || null,
        category: category || null,
        mandatory_only: filters.mandatory_only,
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

    console.error('[SALES_BENCH] Buyer Bot list error:', error);
    res.status(500).json({
      success: false,
      error: 'BOT_LIST_FAILED',
      message: error.message,
    });
  }
});

/**
 * PATCH /api/os/sales-bench/buyer-bots/:id
 * Update a Buyer Bot (limited fields)
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_UPDATES',
        message: 'No update fields provided',
      });
    }

    const bot = await updateBuyerBot(id, updates);

    res.json({
      success: true,
      data: bot,
      message: 'Buyer Bot updated successfully',
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'BOT_NOT_FOUND',
        message: error.message,
      });
    }

    if (error.message.includes('No valid fields')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_UPDATE_FIELDS',
        message: error.message,
        allowed_fields: ['name', 'persona_description', 'behavioral_rules', 'system_prompt', 'is_mandatory'],
      });
    }

    console.error('[SALES_BENCH] Buyer Bot update error:', error);
    res.status(500).json({
      success: false,
      error: 'BOT_UPDATE_FAILED',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/os/sales-bench/buyer-bots/:id
 * Deactivate a Buyer Bot (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deactivated = await deactivateBuyerBot(id);

    if (!deactivated) {
      return res.status(404).json({
        success: false,
        error: 'BOT_NOT_FOUND',
        message: `Active Buyer Bot with ID ${id} not found`,
      });
    }

    res.json({
      success: true,
      message: 'Buyer Bot deactivated successfully',
      bot_id: id,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Buyer Bot deactivation error:', error);
    res.status(500).json({
      success: false,
      error: 'BOT_DEACTIVATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/buyer-bots/:id/variants
 * Create a Buyer Bot variant
 */
router.post('/:id/variants', async (req, res) => {
  try {
    const { id: bot_id } = req.params;
    const data = { ...req.body, bot_id };

    if (!data.name) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_NAME',
        message: 'Variant name is required',
      });
    }

    const variant = await createBotVariantRecord(data);

    res.status(201).json({
      success: true,
      data: variant,
      message: 'Buyer Bot variant created successfully',
    });
  } catch (error) {
    if (error.message.includes('Parent bot not found')) {
      return res.status(404).json({
        success: false,
        error: 'BOT_NOT_FOUND',
        message: error.message,
      });
    }

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_VARIANT_NAME',
        message: 'A variant with this name already exists for this bot',
      });
    }

    console.error('[SALES_BENCH] Variant creation error:', error);
    res.status(500).json({
      success: false,
      error: 'VARIANT_CREATION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/buyer-bots/:id/variants
 * List variants for a Buyer Bot
 */
router.get('/:id/variants', async (req, res) => {
  try {
    const { id } = req.params;

    const variants = await getBotVariants(id);

    res.json({
      success: true,
      data: variants,
      count: variants.length,
      bot_id: id,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Variant list error:', error);
    res.status(500).json({
      success: false,
      error: 'VARIANT_LIST_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/buyer-bots/mandatory/:vertical
 * Get mandatory Buyer Bots for a vertical (S244)
 */
router.get('/mandatory/:vertical', async (req, res) => {
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
      note: 'S244: Mandatory adversarial bots must be run for every scenario',
    });
  } catch (error) {
    console.error('[SALES_BENCH] Mandatory bots error:', error);
    res.status(500).json({
      success: false,
      error: 'MANDATORY_BOTS_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/buyer-bots/stats/:vertical
 * Get Buyer Bot category statistics
 */
router.get('/stats/:vertical', async (req, res) => {
  try {
    const { vertical } = req.params;

    const stats = await getBotCategoryCounts(vertical);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Bot stats error:', error);
    res.status(500).json({
      success: false,
      error: 'BOT_STATS_FAILED',
      message: error.message,
    });
  }
});

export default router;
