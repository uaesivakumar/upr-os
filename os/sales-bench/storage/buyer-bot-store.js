/**
 * Buyer Bot Storage Layer
 * S243: Buyer Bot Framework
 * PRD v1.3 Appendix §5
 *
 * Handles CRUD for Buyer Bots and Variants
 */

import pool from '../../../server/db.js';
import {
  createBuyerBot,
  createBotVariant,
  BOT_CATEGORIES,
} from '../types/buyer-bot.js';
import {
  SALES_BENCH_CONTEXT,
  enforceAuthorityInvariance,
  assertTableAccess,
} from '../guards/authority-invariance.js';

/**
 * Create a new Buyer Bot
 * @param {Object} data - Bot data
 * @returns {Promise<Object>} Created bot
 */
export async function createBuyerBotRecord(data) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'buyer_bot.create');
  assertTableAccess('sales_bench.buyer_bots', 'write');

  const bot = createBuyerBot(data);

  const query = `
    INSERT INTO sales_bench.buyer_bots (
      id, name, category, vertical, sub_vertical,
      persona_description, hidden_states, failure_triggers,
      behavioral_rules, system_prompt, is_mandatory, is_active
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    RETURNING *
  `;

  const values = [
    bot.bot_id,
    bot.name,
    bot.category,
    bot.vertical,
    bot.sub_vertical,
    bot.persona_description,
    JSON.stringify(bot.hidden_states),
    JSON.stringify(bot.failure_triggers),
    JSON.stringify(bot.behavioral_rules),
    bot.system_prompt,
    bot.is_mandatory,
    true,
  ];

  const result = await pool.query(query, values);
  return mapRowToBot(result.rows[0]);
}

/**
 * Get Buyer Bot by ID
 * @param {string} botId - UUID
 * @returns {Promise<Object|null>} Bot or null
 */
export async function getBuyerBotById(botId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'buyer_bot.read');

  const query = `
    SELECT * FROM sales_bench.buyer_bots
    WHERE id = $1
  `;

  const result = await pool.query(query, [botId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToBot(result.rows[0]);
}

/**
 * List Buyer Bots with filters
 * PRD v1.3 §7.3: Vertical filter required
 * @param {Object} filters - Query filters
 * @returns {Promise<Object[]>} List of bots
 */
export async function listBuyerBots(filters = {}) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'buyer_bot.list');

  // PRD v1.3 §7.3: Cross-vertical aggregation forbidden
  if (!filters.vertical) {
    throw new Error('FORBIDDEN: vertical filter is required (PRD v1.3 §7.3)');
  }

  const conditions = ['is_active = true', 'vertical = $1'];
  const values = [filters.vertical];
  let paramIndex = 2;

  // Optional: sub_vertical
  if (filters.sub_vertical) {
    conditions.push(`sub_vertical = $${paramIndex}`);
    values.push(filters.sub_vertical);
    paramIndex++;
  }

  // Optional: category
  if (filters.category) {
    conditions.push(`category = $${paramIndex}`);
    values.push(filters.category);
    paramIndex++;
  }

  // Optional: mandatory only
  if (filters.mandatory_only) {
    conditions.push('is_mandatory = true');
  }

  const query = `
    SELECT * FROM sales_bench.buyer_bots
    WHERE ${conditions.join(' AND ')}
    ORDER BY name ASC
    LIMIT $${paramIndex}
  `;

  values.push(filters.limit || 100);

  const result = await pool.query(query, values);
  return result.rows.map(mapRowToBot);
}

/**
 * Get mandatory Buyer Bots for a vertical (S244)
 * @param {string} vertical - Vertical
 * @param {string} subVertical - Sub-vertical
 * @returns {Promise<Object[]>} Mandatory bots
 */
export async function getMandatoryBots(vertical, subVertical) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'buyer_bot.list_mandatory');

  if (!vertical) {
    throw new Error('FORBIDDEN: vertical is required (PRD v1.3 §7.3)');
  }

  const query = `
    SELECT * FROM sales_bench.buyer_bots
    WHERE vertical = $1
      AND ($2::text IS NULL OR sub_vertical = $2)
      AND is_mandatory = true
      AND is_active = true
    ORDER BY category, name
  `;

  const result = await pool.query(query, [vertical, subVertical || null]);
  return result.rows.map(mapRowToBot);
}

/**
 * Update Buyer Bot (limited updates allowed)
 * @param {string} botId - UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated bot
 */
export async function updateBuyerBot(botId, updates) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'buyer_bot.update');

  // Only allow updating certain fields
  const allowedFields = [
    'name',
    'persona_description',
    'behavioral_rules',
    'system_prompt',
    'is_mandatory',
  ];

  const updateFields = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = $${paramIndex}`);
      values.push(key === 'behavioral_rules' ? JSON.stringify(value) : value);
      paramIndex++;
    }
  }

  if (updateFields.length === 0) {
    throw new Error('No valid fields to update');
  }

  values.push(botId);

  const query = `
    UPDATE sales_bench.buyer_bots
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE id = $${paramIndex} AND is_active = true
    RETURNING *
  `;

  const result = await pool.query(query, values);

  if (result.rows.length === 0) {
    throw new Error(`Bot not found: ${botId}`);
  }

  return mapRowToBot(result.rows[0]);
}

/**
 * Deactivate a Buyer Bot (soft delete)
 * @param {string} botId - UUID
 * @returns {Promise<boolean>} Success
 */
export async function deactivateBuyerBot(botId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'buyer_bot.deactivate');

  const query = `
    UPDATE sales_bench.buyer_bots
    SET is_active = false, updated_at = NOW()
    WHERE id = $1 AND is_active = true
    RETURNING id
  `;

  const result = await pool.query(query, [botId]);
  return result.rowCount > 0;
}

/**
 * Create a Buyer Bot variant
 * @param {Object} data - Variant data
 * @returns {Promise<Object>} Created variant
 */
export async function createBotVariantRecord(data) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'buyer_bot_variant.create');
  assertTableAccess('sales_bench.buyer_bot_variants', 'write');

  // Verify parent bot exists
  const parentBot = await getBuyerBotById(data.bot_id);
  if (!parentBot) {
    throw new Error(`Parent bot not found: ${data.bot_id}`);
  }

  const variant = createBotVariant(data);

  const query = `
    INSERT INTO sales_bench.buyer_bot_variants (
      id, bot_id, name, state_overrides, trigger_overrides,
      difficulty_modifier, is_active
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7
    )
    RETURNING *
  `;

  const values = [
    variant.variant_id,
    variant.bot_id,
    variant.name,
    JSON.stringify(variant.state_overrides),
    JSON.stringify(variant.trigger_overrides),
    variant.difficulty_modifier,
    true,
  ];

  const result = await pool.query(query, values);
  return mapRowToVariant(result.rows[0]);
}

/**
 * Get variants for a bot
 * @param {string} botId - Parent bot ID
 * @returns {Promise<Object[]>} List of variants
 */
export async function getBotVariants(botId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'buyer_bot_variant.list');

  const query = `
    SELECT * FROM sales_bench.buyer_bot_variants
    WHERE bot_id = $1 AND is_active = true
    ORDER BY name
  `;

  const result = await pool.query(query, [botId]);
  return result.rows.map(mapRowToVariant);
}

/**
 * Get variant by ID
 * @param {string} variantId - Variant UUID
 * @returns {Promise<Object|null>} Variant or null
 */
export async function getBotVariantById(variantId) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'buyer_bot_variant.read');

  const query = `
    SELECT * FROM sales_bench.buyer_bot_variants
    WHERE id = $1
  `;

  const result = await pool.query(query, [variantId]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToVariant(result.rows[0]);
}

/**
 * Get bot category statistics for a vertical
 * @param {string} vertical - Vertical
 * @returns {Promise<Object>} Category counts
 */
export async function getBotCategoryCounts(vertical) {
  enforceAuthorityInvariance(SALES_BENCH_CONTEXT, 'buyer_bot.stats');

  if (!vertical) {
    throw new Error('FORBIDDEN: vertical is required (PRD v1.3 §7.3)');
  }

  const query = `
    SELECT category, COUNT(*) as count, SUM(CASE WHEN is_mandatory THEN 1 ELSE 0 END) as mandatory_count
    FROM sales_bench.buyer_bots
    WHERE vertical = $1 AND is_active = true
    GROUP BY category
  `;

  const result = await pool.query(query, [vertical]);

  const counts = {};
  let total = 0;
  let mandatoryTotal = 0;

  for (const row of result.rows) {
    counts[row.category] = {
      total: parseInt(row.count, 10),
      mandatory: parseInt(row.mandatory_count, 10),
    };
    total += parseInt(row.count, 10);
    mandatoryTotal += parseInt(row.mandatory_count, 10);
  }

  return {
    vertical,
    categories: counts,
    total,
    mandatory_total: mandatoryTotal,
  };
}

/**
 * Map database row to bot object
 * @param {Object} row - Database row
 * @returns {Object} Bot object
 */
function mapRowToBot(row) {
  return {
    bot_id: row.id,
    name: row.name,
    category: row.category,
    vertical: row.vertical,
    sub_vertical: row.sub_vertical,
    persona_description: row.persona_description,
    hidden_states: typeof row.hidden_states === 'string'
      ? JSON.parse(row.hidden_states)
      : row.hidden_states,
    failure_triggers: typeof row.failure_triggers === 'string'
      ? JSON.parse(row.failure_triggers)
      : row.failure_triggers,
    behavioral_rules: typeof row.behavioral_rules === 'string'
      ? JSON.parse(row.behavioral_rules)
      : row.behavioral_rules,
    system_prompt: row.system_prompt,
    is_mandatory: row.is_mandatory,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_active: row.is_active,
  };
}

/**
 * Map database row to variant object
 * @param {Object} row - Database row
 * @returns {Object} Variant object
 */
function mapRowToVariant(row) {
  return {
    variant_id: row.id,
    bot_id: row.bot_id,
    name: row.name,
    state_overrides: typeof row.state_overrides === 'string'
      ? JSON.parse(row.state_overrides)
      : row.state_overrides,
    trigger_overrides: typeof row.trigger_overrides === 'string'
      ? JSON.parse(row.trigger_overrides)
      : row.trigger_overrides,
    difficulty_modifier: row.difficulty_modifier,
    created_at: row.created_at,
    is_active: row.is_active,
  };
}
