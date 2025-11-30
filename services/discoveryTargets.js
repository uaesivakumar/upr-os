/**
 * Discovery Target Types Service
 * Sprint 56: Discovery Target Types
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CRITICAL ARCHITECTURAL RULES - READ BEFORE MODIFYING
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1. THIS IS A PURE ENGINE - NO BUSINESS LOGIC ALLOWED
 *    ─────────────────────────────────────────────────
 *    ✅ CORRECT: Read target types, strategies, sources from DB/ConfigLoader
 *    ✅ CORRECT: Execute strategies loaded from config
 *    ✅ CORRECT: Apply generic condition operators (eq, in, gte, etc.)
 *
 *    ❌ FORBIDDEN: if (vertical === 'banking') { special logic }
 *    ❌ FORBIDDEN: if (targetType === 'company') { hardcoded behavior }
 *    ❌ FORBIDDEN: Any vertical/industry-specific code paths
 *
 * 2. SEPARATION OF CONCERNS
 *    ─────────────────────────────────────────────────
 *    Kernel (this file) = PURE ENGINE (executes what config tells it)
 *    Config + Vertical Packs + Target Types = BRAIN (stored in DB)
 *
 *    The engine NEVER decides what to do. It ONLY executes what the
 *    config/DB tells it to do.
 *
 * 3. CONFIG ACCESS VIA SINGLE CHOKEPOINT
 *    ─────────────────────────────────────────────────
 *    All config access MUST go through ConfigLoader service.
 *    Direct DB access for config is FORBIDDEN.
 *
 * 4. DETERMINISTIC EXECUTION
 *    ─────────────────────────────────────────────────
 *    Same config + input → MUST yield same output.
 *    Required for: autonomous mode, journey replay, predictive validation.
 *
 * 5. NO TENANT AWARENESS
 *    ─────────────────────────────────────────────────
 *    Context (vertical, territory) passed via API params, never stored.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Features:
 * - Target type registry (CRUD for target types)
 * - Source management (priority, weights, health)
 * - Strategy selection (condition-based, from DB)
 * - Execution tracking (runs, history, stats)
 */

import { query } from '../db/index.js';
import { getConfig, getNamespaceConfig } from './configLoader.js';

// ============================================================================
// TARGET TYPES
// ============================================================================

/**
 * Get all target types with optional filtering
 */
export async function getAllTargetTypes(options = {}) {
  const { category, entityType, includeInactive = false, verticalSlug } = options;

  let sql = `
    SELECT
      t.*,
      (SELECT COUNT(*) FROM discovery_strategies WHERE target_type_id = t.id AND is_active) as strategy_count,
      (SELECT COUNT(*) FROM target_type_sources WHERE target_type_id = t.id AND is_active) as source_count
    FROM discovery_target_types t
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (!includeInactive) {
    sql += ` AND t.is_active = true`;
  }

  if (category) {
    sql += ` AND t.category = $${paramIndex++}`;
    params.push(category);
  }

  if (entityType) {
    sql += ` AND t.entity_type = $${paramIndex++}`;
    params.push(entityType);
  }

  if (verticalSlug) {
    sql += ` AND t.verticals @> $${paramIndex++}::jsonb`;
    params.push(JSON.stringify([verticalSlug]));
  }

  sql += ` ORDER BY t.category, t.name`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get single target type by slug or ID
 */
export async function getTargetType(identifier) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const sql = `
    SELECT
      t.*,
      (SELECT COUNT(*) FROM discovery_strategies WHERE target_type_id = t.id AND is_active) as strategy_count,
      (SELECT COUNT(*) FROM target_type_sources WHERE target_type_id = t.id AND is_active) as source_count
    FROM discovery_target_types t
    WHERE ${isUUID ? 't.id = $1' : 't.slug = $1'}
  `;

  const result = await query(sql, [identifier]);
  return result.rows[0] || null;
}

/**
 * Get target type with full configuration (sources, strategies)
 */
export async function getTargetTypeConfig(identifier, context = {}) {
  const targetType = await getTargetType(identifier);
  if (!targetType) return null;

  const [sources, strategies] = await Promise.all([
    getTargetTypeSources(targetType.id),
    getTargetTypeStrategies(targetType.id, context)
  ]);

  // Get discovery config from Config Loader
  const discoveryConfig = await getNamespaceConfig('discovery', context);

  return {
    ...targetType,
    sources,
    strategies,
    effectiveConfig: {
      ...targetType.discovery_config,
      ...discoveryConfig
    }
  };
}

/**
 * Create target type
 */
export async function createTargetType(data) {
  const {
    slug, name, description, category, entityType,
    discoveryConfig = {}, sourceWeights = {}, filters = {},
    outputSchema = {}, verticals = [], isActive = true
  } = data;

  const sql = `
    INSERT INTO discovery_target_types (
      slug, name, description, category, entity_type,
      discovery_config, source_weights, filters, output_schema,
      verticals, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

  const result = await query(sql, [
    slug, name, description, category, entityType,
    JSON.stringify(discoveryConfig), JSON.stringify(sourceWeights),
    JSON.stringify(filters), JSON.stringify(outputSchema),
    JSON.stringify(verticals), isActive
  ]);

  return result.rows[0];
}

/**
 * Update target type
 */
export async function updateTargetType(identifier, data) {
  const targetType = await getTargetType(identifier);
  if (!targetType) return null;

  if (targetType.is_system) {
    throw new Error('Cannot modify system-defined target type');
  }

  const allowedFields = [
    'name', 'description', 'discovery_config', 'source_weights',
    'filters', 'output_schema', 'verticals', 'is_active'
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

  if (updates.length === 0) return targetType;

  updates.push(`updated_at = NOW()`);
  values.push(targetType.id);

  const sql = `
    UPDATE discovery_target_types
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Delete target type (soft delete)
 */
export async function deleteTargetType(identifier) {
  const targetType = await getTargetType(identifier);
  if (!targetType) return null;

  if (targetType.is_system) {
    throw new Error('Cannot delete system-defined target type');
  }

  const sql = `
    UPDATE discovery_target_types
    SET is_active = false, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [targetType.id]);
  return result.rows[0];
}

// ============================================================================
// DISCOVERY SOURCES
// ============================================================================

/**
 * Get all discovery sources
 */
export async function getAllSources(options = {}) {
  const { sourceType, healthStatus, includeInactive = false } = options;

  let sql = `
    SELECT
      s.*,
      (SELECT COUNT(*) FROM target_type_sources WHERE source_id = s.id AND is_active) as target_types_using
    FROM discovery_sources s
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (!includeInactive) {
    sql += ` AND s.is_active = true`;
  }

  if (sourceType) {
    sql += ` AND s.source_type = $${paramIndex++}`;
    params.push(sourceType);
  }

  if (healthStatus) {
    sql += ` AND s.health_status = $${paramIndex++}`;
    params.push(healthStatus);
  }

  sql += ` ORDER BY s.quality_score DESC, s.name`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get single source by slug or ID
 */
export async function getSource(identifier) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const sql = `
    SELECT * FROM discovery_sources
    WHERE ${isUUID ? 'id = $1' : 'slug = $1'}
  `;

  const result = await query(sql, [identifier]);
  return result.rows[0] || null;
}

/**
 * Get sources for a target type
 */
export async function getTargetTypeSources(targetTypeId) {
  const sql = `
    SELECT
      s.*,
      ts.priority,
      ts.weight,
      ts.is_primary,
      ts.config_override
    FROM target_type_sources ts
    JOIN discovery_sources s ON ts.source_id = s.id
    WHERE ts.target_type_id = $1
      AND ts.is_active = true
      AND s.is_active = true
    ORDER BY ts.priority, ts.is_primary DESC
  `;

  const result = await query(sql, [targetTypeId]);
  return result.rows;
}

/**
 * Associate source with target type
 */
export async function associateSource(targetTypeId, sourceId, options = {}) {
  const { priority = 100, weight = 1.0, isPrimary = false, configOverride = {} } = options;

  // If setting as primary, unset other primaries
  if (isPrimary) {
    await query(
      `UPDATE target_type_sources SET is_primary = false WHERE target_type_id = $1`,
      [targetTypeId]
    );
  }

  const sql = `
    INSERT INTO target_type_sources (target_type_id, source_id, priority, weight, is_primary, config_override)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (target_type_id, source_id)
    DO UPDATE SET
      priority = EXCLUDED.priority,
      weight = EXCLUDED.weight,
      is_primary = EXCLUDED.is_primary,
      config_override = EXCLUDED.config_override
    RETURNING *
  `;

  const result = await query(sql, [
    targetTypeId, sourceId, priority, weight, isPrimary, JSON.stringify(configOverride)
  ]);

  return result.rows[0];
}

/**
 * Remove source from target type
 */
export async function disassociateSource(targetTypeId, sourceId) {
  const sql = `
    UPDATE target_type_sources
    SET is_active = false
    WHERE target_type_id = $1 AND source_id = $2
    RETURNING *
  `;

  const result = await query(sql, [targetTypeId, sourceId]);
  return result.rows[0];
}

/**
 * Update source health status
 */
export async function updateSourceHealth(identifier, healthStatus) {
  const source = await getSource(identifier);
  if (!source) return null;

  const sql = `
    UPDATE discovery_sources
    SET health_status = $2, last_health_check = NOW(), updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [source.id, healthStatus]);
  return result.rows[0];
}

// ============================================================================
// DISCOVERY STRATEGIES
// ============================================================================

/**
 * Get strategies for a target type
 */
export async function getTargetTypeStrategies(targetTypeId, context = {}) {
  const sql = `
    SELECT * FROM discovery_strategies
    WHERE target_type_id = $1 AND is_active = true
    ORDER BY priority
  `;

  const result = await query(sql, [targetTypeId]);
  return result.rows;
}

/**
 * Create strategy
 */
export async function createStrategy(targetTypeId, data) {
  const {
    name, description, strategyType, config = {},
    executionSettings = {}, priority = 100, conditions = [],
    isActive = true
  } = data;

  const sql = `
    INSERT INTO discovery_strategies (
      target_type_id, name, description, strategy_type,
      config, execution_settings, priority, conditions, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const result = await query(sql, [
    targetTypeId, name, description, strategyType,
    JSON.stringify(config), JSON.stringify(executionSettings),
    priority, JSON.stringify(conditions), isActive
  ]);

  return result.rows[0];
}

/**
 * Update strategy
 */
export async function updateStrategy(strategyId, data) {
  const allowedFields = [
    'name', 'description', 'config', 'execution_settings',
    'priority', 'conditions', 'is_active'
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

  if (updates.length === 0) return null;

  updates.push(`updated_at = NOW()`);
  values.push(strategyId);

  const sql = `
    UPDATE discovery_strategies
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Delete strategy
 */
export async function deleteStrategy(strategyId) {
  const sql = `
    UPDATE discovery_strategies
    SET is_active = false, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [strategyId]);
  return result.rows[0];
}

/**
 * Select best strategy for context (DETERMINISTIC)
 * Given the same config + context, returns the same strategy
 */
export async function selectStrategy(targetTypeSlug, context = {}) {
  const strategies = await getTargetTypeStrategies(
    (await getTargetType(targetTypeSlug))?.id,
    context
  );

  if (strategies.length === 0) return null;

  // Filter by conditions
  const matchingStrategies = strategies.filter(strategy => {
    if (!strategy.conditions || strategy.conditions.length === 0) {
      return true;
    }

    return strategy.conditions.every(condition => {
      const fieldValue = context[condition.field];
      if (fieldValue === undefined) return true; // Skip unset fields

      switch (condition.op) {
        case 'eq': return fieldValue === condition.value;
        case 'ne': return fieldValue !== condition.value;
        case 'in': return condition.value.includes(fieldValue);
        case 'gte': return fieldValue >= condition.value;
        case 'lte': return fieldValue <= condition.value;
        case 'contains': return String(fieldValue).includes(condition.value);
        default: return true;
      }
    });
  });

  // Return highest priority (lowest number) matching strategy
  return matchingStrategies[0] || null;
}

// ============================================================================
// DISCOVERY RUNS (EXECUTION TRACKING)
// ============================================================================

/**
 * Create discovery run
 */
export async function createRun(targetTypeId, strategyId, inputParams = {}, createdBy = 'system') {
  const sql = `
    INSERT INTO discovery_runs (target_type_id, strategy_id, input_params, status, created_by)
    VALUES ($1, $2, $3, 'pending', $4)
    RETURNING *
  `;

  const result = await query(sql, [targetTypeId, strategyId, JSON.stringify(inputParams), createdBy]);
  return result.rows[0];
}

/**
 * Start discovery run
 */
export async function startRun(runId) {
  const sql = `
    UPDATE discovery_runs
    SET status = 'running', started_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [runId]);
  return result.rows[0];
}

/**
 * Complete discovery run
 */
export async function completeRun(runId, results) {
  const {
    resultsCount = 0, entitiesCreated = 0, entitiesUpdated = 0,
    errorsCount = 0, sourcesUsed = [], sourceResults = {},
    errorDetails = null
  } = results;

  const sql = `
    UPDATE discovery_runs
    SET
      status = $2,
      results_count = $3,
      entities_created = $4,
      entities_updated = $5,
      errors_count = $6,
      sources_used = $7,
      source_results = $8,
      error_details = $9,
      completed_at = NOW(),
      duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
    WHERE id = $1
    RETURNING *
  `;

  const status = errorsCount > 0 && resultsCount === 0 ? 'failed' : 'completed';

  const result = await query(sql, [
    runId, status, resultsCount, entitiesCreated, entitiesUpdated,
    errorsCount, JSON.stringify(sourcesUsed), JSON.stringify(sourceResults),
    errorDetails ? JSON.stringify(errorDetails) : null
  ]);

  return result.rows[0];
}

/**
 * Fail discovery run
 */
export async function failRun(runId, errorDetails) {
  const sql = `
    UPDATE discovery_runs
    SET
      status = 'failed',
      error_details = $2,
      completed_at = NOW(),
      duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [runId, JSON.stringify(errorDetails)]);
  return result.rows[0];
}

/**
 * Get run history
 */
export async function getRunHistory(options = {}) {
  const { targetTypeId, status, limit = 50, offset = 0 } = options;

  let sql = `
    SELECT
      r.*,
      t.slug as target_type_slug,
      t.name as target_type_name,
      s.name as strategy_name
    FROM discovery_runs r
    LEFT JOIN discovery_target_types t ON r.target_type_id = t.id
    LEFT JOIN discovery_strategies s ON r.strategy_id = s.id
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (targetTypeId) {
    sql += ` AND r.target_type_id = $${paramIndex++}`;
    params.push(targetTypeId);
  }

  if (status) {
    sql += ` AND r.status = $${paramIndex++}`;
    params.push(status);
  }

  sql += ` ORDER BY r.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  return result.rows;
}

// ============================================================================
// EXECUTION (DETERMINISTIC)
// ============================================================================

/**
 * Execute discovery for a target type
 * DETERMINISTIC: Same config + input → same execution plan
 */
export async function executeDiscovery(targetTypeSlug, inputParams = {}, context = {}) {
  // Get target type config
  const targetTypeConfig = await getTargetTypeConfig(targetTypeSlug, context);
  if (!targetTypeConfig) {
    throw new Error(`Target type not found: ${targetTypeSlug}`);
  }

  // Select best strategy (deterministic)
  const strategy = await selectStrategy(targetTypeSlug, { ...inputParams, ...context });
  if (!strategy) {
    throw new Error(`No suitable strategy found for: ${targetTypeSlug}`);
  }

  // Create run record
  const run = await createRun(
    targetTypeConfig.id,
    strategy.id,
    inputParams,
    context.actorId || 'system'
  );

  try {
    // Start run
    await startRun(run.id);

    // Get sources in priority order (deterministic)
    const sources = targetTypeConfig.sources;

    // Execute strategy (deterministic - same sources, same order, same config)
    const results = {
      resultsCount: 0,
      entitiesCreated: 0,
      entitiesUpdated: 0,
      errorsCount: 0,
      sourcesUsed: sources.map(s => s.slug),
      sourceResults: {}
    };

    // Note: Actual discovery execution would happen here
    // This is the framework - actual source calls would be implemented per source

    // Complete run
    const completedRun = await completeRun(run.id, results);

    return {
      run: completedRun,
      targetType: targetTypeConfig,
      strategy,
      sources,
      results
    };
  } catch (error) {
    await failRun(run.id, { message: error.message, stack: error.stack });
    throw error;
  }
}

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * Get discovery dashboard data
 */
export async function getDashboard() {
  const [targetTypes, sources, recentRuns, runStats] = await Promise.all([
    getAllTargetTypes(),
    getAllSources(),
    getRunHistory({ limit: 10 }),
    query(`
      SELECT
        status,
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration,
        SUM(results_count) as total_results
      FROM discovery_runs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY status
    `)
  ]);

  return {
    targetTypes: {
      total: targetTypes.length,
      byCategory: targetTypes.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + 1;
        return acc;
      }, {})
    },
    sources: {
      total: sources.length,
      healthy: sources.filter(s => s.health_status === 'healthy').length,
      degraded: sources.filter(s => s.health_status === 'degraded').length,
      unhealthy: sources.filter(s => s.health_status === 'unhealthy').length
    },
    recentRuns,
    runStats: runStats.rows
  };
}
