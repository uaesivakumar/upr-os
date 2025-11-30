/**
 * Territory Management Service
 * Sprint 53: Super-Admin Territory Management
 *
 * Handles hierarchical territory management with config inheritance.
 * NO TENANT AWARENESS - context passed via API params.
 */

import { query, getPool } from '../db/index.js';

// ============================================================================
// TERRITORY CRUD
// ============================================================================

/**
 * Get all territories with optional filtering
 */
export async function getAllTerritories(options = {}) {
  const { level, status = 'active', parentId, countryCode, includeInactive = false } = options;

  let sql = `
    SELECT
      t.id, t.slug, t.name, t.description, t.level,
      t.parent_id, t.country_code, t.region_code, t.timezone,
      t.currency, t.languages, t.config, t.inherited_config,
      t.verticals, t.status, t.metadata,
      t.created_at, t.updated_at,
      p.slug as parent_slug,
      p.name as parent_name,
      nlevel(t.path) - 1 as depth,
      (SELECT COUNT(*) FROM territories WHERE parent_id = t.id) as child_count
    FROM territories t
    LEFT JOIN territories p ON t.parent_id = p.id
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (!includeInactive) {
    sql += ` AND t.status = $${paramIndex++}`;
    params.push(status);
  }

  if (level) {
    sql += ` AND t.level = $${paramIndex++}`;
    params.push(level);
  }

  if (parentId) {
    sql += ` AND t.parent_id = $${paramIndex++}`;
    params.push(parentId);
  }

  if (countryCode) {
    sql += ` AND t.country_code = $${paramIndex++}`;
    params.push(countryCode);
  }

  sql += ` ORDER BY nlevel(t.path), t.name`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get single territory by slug or ID
 */
export async function getTerritory(identifier) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const sql = `
    SELECT
      t.*,
      p.slug as parent_slug,
      p.name as parent_name,
      nlevel(t.path) - 1 as depth,
      (SELECT COUNT(*) FROM territories WHERE parent_id = t.id) as child_count,
      (SELECT COUNT(*) FROM territory_assignment_rules WHERE territory_id = t.id AND is_active) as active_rules,
      (SELECT COUNT(*) FROM territory_verticals WHERE territory_id = t.id AND is_active) as active_verticals
    FROM territories t
    LEFT JOIN territories p ON t.parent_id = p.id
    WHERE ${isUUID ? 't.id = $1' : 't.slug = $1'}
  `;

  const result = await query(sql, [identifier]);
  return result.rows[0] || null;
}

/**
 * Get territory with effective (merged) config
 */
export async function getTerritoryConfig(identifier) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const sql = `SELECT get_effective_territory_config($1) as effective_config`;
  const result = await query(sql, [territory.id]);

  return {
    ...territory,
    effective_config: result.rows[0]?.effective_config || territory.config
  };
}

/**
 * Create a new territory
 */
export async function createTerritory(data, context = {}) {
  const {
    slug, name, description, level, parentId,
    countryCode, regionCode, timezone, currency,
    languages = [], config = {}, verticals = [],
    status = 'active', metadata = {}
  } = data;

  const sql = `
    INSERT INTO territories (
      slug, name, description, level, parent_id,
      country_code, region_code, timezone, currency,
      languages, config, verticals, status, metadata,
      created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `;

  const result = await query(sql, [
    slug, name, description, level, parentId,
    countryCode, regionCode, timezone, currency,
    JSON.stringify(languages), JSON.stringify(config),
    JSON.stringify(verticals), status, JSON.stringify(metadata),
    context.actorId || 'system'
  ]);

  const territory = result.rows[0];

  // Log audit
  await logAudit({
    territoryId: territory.id,
    territorySlug: territory.slug,
    action: 'create',
    newState: territory,
    ...context
  });

  return territory;
}

/**
 * Update a territory
 */
export async function updateTerritory(identifier, data, context = {}) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const allowedFields = [
    'name', 'description', 'level', 'parent_id',
    'country_code', 'region_code', 'timezone', 'currency',
    'languages', 'config', 'verticals', 'status', 'metadata'
  ];

  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const field of allowedFields) {
    const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (data[camelField] !== undefined || data[field] !== undefined) {
      const value = data[camelField] ?? data[field];
      updates.push(`${field} = $${paramIndex++}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
  }

  if (updates.length === 0) return territory;

  updates.push(`updated_at = NOW()`);
  updates.push(`updated_by = $${paramIndex++}`);
  values.push(context.actorId || 'system');
  values.push(territory.id);

  const sql = `
    UPDATE territories
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(sql, values);
  const updatedTerritory = result.rows[0];

  // Determine action type
  let action = 'update';
  if (data.config !== undefined) action = 'config_change';
  if (data.parentId !== undefined || data.parent_id !== undefined) action = 'hierarchy_change';
  if (data.status === 'active' && territory.status !== 'active') action = 'activate';
  if (data.status === 'inactive') action = 'deactivate';

  // Log audit
  await logAudit({
    territoryId: territory.id,
    territorySlug: territory.slug,
    action,
    changes: data,
    previousState: territory,
    newState: updatedTerritory,
    ...context
  });

  return updatedTerritory;
}

/**
 * Delete a territory (soft delete by setting status to 'inactive')
 */
export async function deleteTerritory(identifier, context = {}) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  // Check for children
  if (territory.child_count > 0) {
    throw new Error(`Cannot delete territory with ${territory.child_count} child territories`);
  }

  const sql = `
    UPDATE territories
    SET status = 'inactive', updated_at = NOW(), updated_by = $2
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [territory.id, context.actorId || 'system']);

  await logAudit({
    territoryId: territory.id,
    territorySlug: territory.slug,
    action: 'delete',
    previousState: territory,
    newState: result.rows[0],
    ...context
  });

  return result.rows[0];
}

// ============================================================================
// HIERARCHY OPERATIONS
// ============================================================================

/**
 * Get territory hierarchy (children tree)
 */
export async function getTerritoryHierarchy(identifier) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const sql = `SELECT * FROM get_territory_hierarchy($1)`;
  const result = await query(sql, [territory.id]);

  return {
    root: territory,
    hierarchy: result.rows
  };
}

/**
 * Get territory ancestors (path to root)
 */
export async function getTerritoryAncestors(identifier) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const sql = `SELECT * FROM get_territory_ancestors($1)`;
  const result = await query(sql, [territory.id]);

  return result.rows;
}

/**
 * Move territory to new parent
 */
export async function moveTerritory(identifier, newParentId, context = {}) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  // Verify new parent exists and is not a descendant
  if (newParentId) {
    const newParent = await getTerritory(newParentId);
    if (!newParent) throw new Error('New parent territory not found');

    // Check for circular reference
    const ancestors = await getTerritoryAncestors(newParentId);
    if (ancestors.some(a => a.id === territory.id)) {
      throw new Error('Cannot move territory to its own descendant');
    }
  }

  return updateTerritory(identifier, { parentId: newParentId }, context);
}

// ============================================================================
// VERTICAL ASSOCIATIONS
// ============================================================================

/**
 * Get verticals for a territory
 */
export async function getTerritoryVerticals(identifier) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const sql = `
    SELECT
      tv.*,
      vp.name as vertical_name,
      vp.description as vertical_description
    FROM territory_verticals tv
    LEFT JOIN vertical_packs vp ON tv.vertical_slug = vp.slug
    WHERE tv.territory_id = $1
    ORDER BY tv.is_primary DESC, tv.created_at
  `;

  const result = await query(sql, [territory.id]);
  return result.rows;
}

/**
 * Assign vertical to territory
 */
export async function assignVertical(identifier, verticalSlug, options = {}, context = {}) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const { configOverride = {}, isPrimary = false, isActive = true } = options;

  // If setting as primary, unset other primaries
  if (isPrimary) {
    await query(
      `UPDATE territory_verticals SET is_primary = false WHERE territory_id = $1`,
      [territory.id]
    );
  }

  const sql = `
    INSERT INTO territory_verticals (territory_id, vertical_slug, config_override, is_primary, is_active)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (territory_id, vertical_slug)
    DO UPDATE SET
      config_override = EXCLUDED.config_override,
      is_primary = EXCLUDED.is_primary,
      is_active = EXCLUDED.is_active,
      updated_at = NOW()
    RETURNING *
  `;

  const result = await query(sql, [
    territory.id, verticalSlug, JSON.stringify(configOverride), isPrimary, isActive
  ]);

  await logAudit({
    territoryId: territory.id,
    territorySlug: territory.slug,
    action: 'vertical_assign',
    changes: { verticalSlug, ...options },
    ...context
  });

  return result.rows[0];
}

/**
 * Remove vertical from territory
 */
export async function removeVertical(identifier, verticalSlug, context = {}) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const sql = `
    DELETE FROM territory_verticals
    WHERE territory_id = $1 AND vertical_slug = $2
    RETURNING *
  `;

  const result = await query(sql, [territory.id, verticalSlug]);

  if (result.rows[0]) {
    await logAudit({
      territoryId: territory.id,
      territorySlug: territory.slug,
      action: 'vertical_remove',
      changes: { verticalSlug },
      ...context
    });
  }

  return result.rows[0];
}

// ============================================================================
// SUB-VERTICALS
// ============================================================================

/**
 * Get sub-verticals for a territory
 */
export async function getSubVerticals(identifier, verticalSlug = null) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  let sql = `
    SELECT * FROM territory_sub_verticals
    WHERE territory_id = $1
  `;
  const params = [territory.id];

  if (verticalSlug) {
    sql += ` AND vertical_slug = $2`;
    params.push(verticalSlug);
  }

  sql += ` ORDER BY vertical_slug, name`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Create sub-vertical
 */
export async function createSubVertical(identifier, data, context = {}) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const { verticalSlug, slug, name, description, config = {}, isActive = true } = data;

  const sql = `
    INSERT INTO territory_sub_verticals (
      territory_id, vertical_slug, slug, name, description, config, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await query(sql, [
    territory.id, verticalSlug, slug, name, description, JSON.stringify(config), isActive
  ]);

  await logAudit({
    territoryId: territory.id,
    territorySlug: territory.slug,
    action: 'update',
    changes: { subVertical: data },
    ...context
  });

  return result.rows[0];
}

/**
 * Update sub-vertical
 */
export async function updateSubVertical(subVerticalId, data, context = {}) {
  const allowedFields = ['name', 'description', 'config', 'is_active'];
  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const field of allowedFields) {
    const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (data[camelField] !== undefined || data[field] !== undefined) {
      const value = data[camelField] ?? data[field];
      updates.push(`${field} = $${paramIndex++}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
  }

  if (updates.length === 0) return null;

  updates.push(`updated_at = NOW()`);
  values.push(subVerticalId);

  const sql = `
    UPDATE territory_sub_verticals
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(sql, values);
  return result.rows[0];
}

// ============================================================================
// ASSIGNMENT RULES
// ============================================================================

/**
 * Get assignment rules for a territory
 */
export async function getAssignmentRules(identifier) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const sql = `
    SELECT * FROM territory_assignment_rules
    WHERE territory_id = $1
    ORDER BY priority
  `;

  const result = await query(sql, [territory.id]);
  return result.rows;
}

/**
 * Create assignment rule
 */
export async function createAssignmentRule(identifier, data, context = {}) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const { name, description, priority = 100, conditions, actions = {}, isActive = true } = data;

  const sql = `
    INSERT INTO territory_assignment_rules (
      territory_id, name, description, priority, conditions, actions, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await query(sql, [
    territory.id, name, description, priority,
    JSON.stringify(conditions), JSON.stringify(actions), isActive
  ]);

  await logAudit({
    territoryId: territory.id,
    territorySlug: territory.slug,
    action: 'rule_add',
    changes: data,
    ...context
  });

  return result.rows[0];
}

/**
 * Update assignment rule
 */
export async function updateAssignmentRule(ruleId, data, context = {}) {
  const allowedFields = ['name', 'description', 'priority', 'conditions', 'actions', 'is_active'];
  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const field of allowedFields) {
    const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (data[camelField] !== undefined || data[field] !== undefined) {
      const value = data[camelField] ?? data[field];
      updates.push(`${field} = $${paramIndex++}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
  }

  if (updates.length === 0) return null;

  updates.push(`updated_at = NOW()`);
  values.push(ruleId);

  const sql = `
    UPDATE territory_assignment_rules
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(sql, values);

  if (result.rows[0]) {
    await logAudit({
      territoryId: result.rows[0].territory_id,
      action: 'rule_update',
      changes: data,
      ...context
    });
  }

  return result.rows[0];
}

/**
 * Delete assignment rule
 */
export async function deleteAssignmentRule(ruleId, context = {}) {
  // Get rule first for audit
  const ruleResult = await query(
    `SELECT * FROM territory_assignment_rules WHERE id = $1`,
    [ruleId]
  );
  const rule = ruleResult.rows[0];

  if (!rule) return null;

  const sql = `DELETE FROM territory_assignment_rules WHERE id = $1 RETURNING *`;
  const result = await query(sql, [ruleId]);

  await logAudit({
    territoryId: rule.territory_id,
    action: 'rule_delete',
    previousState: rule,
    ...context
  });

  return result.rows[0];
}

/**
 * Assign entity to territory using rules
 */
export async function assignEntityToTerritory(entityData) {
  const sql = `SELECT assign_entity_to_territory($1) as result`;
  const result = await query(sql, [JSON.stringify(entityData)]);
  return result.rows[0]?.result || { assigned: false };
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

/**
 * Log audit entry
 */
async function logAudit(data) {
  const {
    territoryId, territorySlug, action, changes,
    previousState, newState, actorId, actorType = 'system',
    actorIp, requestId, metadata = {}
  } = data;

  const sql = `
    INSERT INTO territory_audit_logs (
      territory_id, territory_slug, action, changes,
      previous_state, new_state, actor_id, actor_type,
      actor_ip, request_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `;

  try {
    await query(sql, [
      territoryId, territorySlug, action,
      changes ? JSON.stringify(changes) : null,
      previousState ? JSON.stringify(previousState) : null,
      newState ? JSON.stringify(newState) : null,
      actorId, actorType, actorIp, requestId,
      JSON.stringify(metadata)
    ]);
  } catch (error) {
    console.error('Failed to log audit:', error);
    // Don't throw - audit logging should not break main operations
  }
}

/**
 * Get audit logs for a territory
 */
export async function getAuditLogs(identifier, options = {}) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const { limit = 50, offset = 0, action, actorId, startDate, endDate } = options;

  let sql = `
    SELECT * FROM territory_audit_logs
    WHERE territory_id = $1
  `;
  const params = [territory.id];
  let paramIndex = 2;

  if (action) {
    sql += ` AND action = $${paramIndex++}`;
    params.push(action);
  }

  if (actorId) {
    sql += ` AND actor_id = $${paramIndex++}`;
    params.push(actorId);
  }

  if (startDate) {
    sql += ` AND created_at >= $${paramIndex++}`;
    params.push(startDate);
  }

  if (endDate) {
    sql += ` AND created_at <= $${paramIndex++}`;
    params.push(endDate);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  return result.rows;
}

// ============================================================================
// METRICS
// ============================================================================

/**
 * Get metrics for a territory
 */
export async function getMetrics(identifier, options = {}) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const { granularity = 'daily', startDate, endDate, limit = 30 } = options;

  let sql = `
    SELECT * FROM territory_metrics
    WHERE territory_id = $1 AND granularity = $2
  `;
  const params = [territory.id, granularity];
  let paramIndex = 3;

  if (startDate) {
    sql += ` AND period_start >= $${paramIndex++}`;
    params.push(startDate);
  }

  if (endDate) {
    sql += ` AND period_end <= $${paramIndex++}`;
    params.push(endDate);
  }

  sql += ` ORDER BY period_start DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Record metrics for a territory
 */
export async function recordMetrics(identifier, data) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const {
    periodStart, periodEnd, granularity = 'daily',
    signalsDiscovered = 0, signalsByType = {},
    uniqueCompanies = 0, uniqueContacts = 0,
    enrichmentRequests = 0, enrichmentSuccesses = 0,
    avgQScore, avgTScore, avgLScore, avgEScore,
    scoreDistribution = {}, outreachGenerated = 0,
    outreachByChannel = {}, providerUsage = {},
    providerCosts = {}
  } = data;

  const enrichmentRate = enrichmentRequests > 0
    ? (enrichmentSuccesses / enrichmentRequests * 100).toFixed(2)
    : null;

  const sql = `
    INSERT INTO territory_metrics (
      territory_id, period_start, period_end, granularity,
      signals_discovered, signals_by_type, unique_companies, unique_contacts,
      enrichment_requests, enrichment_successes, enrichment_rate,
      avg_q_score, avg_t_score, avg_l_score, avg_e_score, score_distribution,
      outreach_generated, outreach_by_channel, provider_usage, provider_costs
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    ON CONFLICT (territory_id, period_start, granularity)
    DO UPDATE SET
      signals_discovered = EXCLUDED.signals_discovered,
      signals_by_type = EXCLUDED.signals_by_type,
      unique_companies = EXCLUDED.unique_companies,
      unique_contacts = EXCLUDED.unique_contacts,
      enrichment_requests = EXCLUDED.enrichment_requests,
      enrichment_successes = EXCLUDED.enrichment_successes,
      enrichment_rate = EXCLUDED.enrichment_rate,
      avg_q_score = EXCLUDED.avg_q_score,
      avg_t_score = EXCLUDED.avg_t_score,
      avg_l_score = EXCLUDED.avg_l_score,
      avg_e_score = EXCLUDED.avg_e_score,
      score_distribution = EXCLUDED.score_distribution,
      outreach_generated = EXCLUDED.outreach_generated,
      outreach_by_channel = EXCLUDED.outreach_by_channel,
      provider_usage = EXCLUDED.provider_usage,
      provider_costs = EXCLUDED.provider_costs,
      updated_at = NOW()
    RETURNING *
  `;

  const result = await query(sql, [
    territory.id, periodStart, periodEnd, granularity,
    signalsDiscovered, JSON.stringify(signalsByType), uniqueCompanies, uniqueContacts,
    enrichmentRequests, enrichmentSuccesses, enrichmentRate,
    avgQScore, avgTScore, avgLScore, avgEScore, JSON.stringify(scoreDistribution),
    outreachGenerated, JSON.stringify(outreachByChannel),
    JSON.stringify(providerUsage), JSON.stringify(providerCosts)
  ]);

  return result.rows[0];
}

/**
 * Get aggregated metrics summary
 */
export async function getMetricsSummary(identifier) {
  const territory = await getTerritory(identifier);
  if (!territory) return null;

  const sql = `
    SELECT
      COALESCE(SUM(signals_discovered), 0) as total_signals,
      COALESCE(SUM(unique_companies), 0) as total_companies,
      COALESCE(SUM(unique_contacts), 0) as total_contacts,
      COALESCE(AVG(avg_q_score), 0) as avg_q_score,
      COALESCE(AVG(avg_t_score), 0) as avg_t_score,
      COALESCE(AVG(avg_l_score), 0) as avg_l_score,
      COALESCE(AVG(avg_e_score), 0) as avg_e_score,
      COALESCE(AVG(enrichment_rate), 0) as avg_enrichment_rate,
      COALESCE(SUM(outreach_generated), 0) as total_outreach,
      MAX(period_end) as last_activity
    FROM territory_metrics
    WHERE territory_id = $1
  `;

  const result = await query(sql, [territory.id]);
  return result.rows[0];
}

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * Get territory dashboard data
 */
export async function getDashboard(identifier) {
  const territory = await getTerritoryConfig(identifier);
  if (!territory) return null;

  const [hierarchy, ancestors, verticals, rules, metrics, recentAudit] = await Promise.all([
    getTerritoryHierarchy(territory.id),
    getTerritoryAncestors(territory.id),
    getTerritoryVerticals(territory.id),
    getAssignmentRules(territory.id),
    getMetricsSummary(territory.id),
    getAuditLogs(territory.id, { limit: 10 })
  ]);

  return {
    territory,
    hierarchy,
    ancestors,
    verticals,
    rules,
    metrics,
    recentAudit
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  logAudit
};
