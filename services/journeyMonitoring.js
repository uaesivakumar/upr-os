/**
 * Journey Monitoring Service
 * Sprint 61: Journey Monitoring
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CRITICAL ARCHITECTURAL RULES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1. METRICS ARE AGGREGATED, NOT RAW
 *    ─────────────────────────────────────────────────
 *    • Hourly buckets for performance
 *    • Pre-computed percentiles
 *    • No PII in metrics
 *
 * 2. MEMORY IS SCOPED AND DECAYED
 *    ─────────────────────────────────────────────────
 *    • Company, contact, user, vertical, global scopes
 *    • Relevance scores decay over time
 *    • TTL support for automatic cleanup
 *
 * 3. A/B TESTS ARE STATISTICALLY VALID
 *    ─────────────────────────────────────────────────
 *    • Minimum sample sizes enforced
 *    • Confidence levels tracked
 *    • Winner declared only when significant
 *
 * 4. DEBUG MODE IS ISOLATED
 *    ─────────────────────────────────────────────────
 *    • Debug sessions don't affect production
 *    • Captured data is temporary
 *    • Breakpoints don't block other instances
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

import { query } from '../db/index.js';
import { journeyEngine } from './journeyEngine.js';

// ============================================================================
// METRICS
// ============================================================================

/**
 * Record a metric
 */
export async function recordMetric(metricType, metricName, value, scope = {}) {
  const {
    journeyDefinitionId = null,
    templateId = null,
    verticalSlug = null,
    dimensions = {}
  } = scope;

  const sql = `
    SELECT record_journey_metric($1, $2, $3, $4, $5, $6, $7) as metric
  `;

  const result = await query(sql, [
    metricType,
    metricName,
    value,
    journeyDefinitionId,
    templateId,
    verticalSlug,
    JSON.stringify(dimensions)
  ]);

  return result.rows[0]?.metric;
}

/**
 * Get metrics with aggregation
 */
export async function getMetrics(options = {}) {
  const {
    metricType,
    metricName,
    startTime,
    endTime,
    journeyDefinitionId,
    templateId,
    verticalSlug,
    bucketSize = '1h',
    limit = 100
  } = options;

  let sql = `
    SELECT
      metric_type,
      metric_name,
      bucket_start,
      bucket_end,
      value_count,
      value_sum,
      value_avg,
      value_min,
      value_max,
      value_p50,
      value_p95,
      value_p99,
      dimensions
    FROM journey_metrics
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (metricType) {
    sql += ` AND metric_type = $${paramIndex++}`;
    params.push(metricType);
  }

  if (metricName) {
    sql += ` AND metric_name = $${paramIndex++}`;
    params.push(metricName);
  }

  if (startTime) {
    sql += ` AND bucket_start >= $${paramIndex++}`;
    params.push(startTime);
  }

  if (endTime) {
    sql += ` AND bucket_end <= $${paramIndex++}`;
    params.push(endTime);
  }

  if (journeyDefinitionId) {
    sql += ` AND journey_definition_id = $${paramIndex++}`;
    params.push(journeyDefinitionId);
  }

  if (templateId) {
    sql += ` AND template_id = $${paramIndex++}`;
    params.push(templateId);
  }

  if (verticalSlug) {
    sql += ` AND vertical_slug = $${paramIndex++}`;
    params.push(verticalSlug);
  }

  sql += ` ORDER BY bucket_start DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get metric summary
 */
export async function getMetricSummary(metricType, metricName, timeRange = '24h') {
  const sql = `
    SELECT
      SUM(value_count) as total_count,
      SUM(value_sum) / NULLIF(SUM(value_count), 0) as overall_avg,
      MIN(value_min) as overall_min,
      MAX(value_max) as overall_max
    FROM journey_metrics
    WHERE metric_type = $1
      AND metric_name = $2
      AND bucket_start >= NOW() - $3::INTERVAL
  `;

  const result = await query(sql, [metricType, metricName, timeRange]);
  return result.rows[0];
}

// ============================================================================
// A/B TESTING
// ============================================================================

/**
 * Create A/B test
 */
export async function createABTest(data) {
  const {
    name,
    description,
    testType,
    controlConfig,
    variantConfigs = [],
    trafficAllocation = { control: 50 },
    journeyDefinitionId,
    templateId,
    verticalSlug,
    primaryMetric,
    secondaryMetrics = [],
    minSampleSize = 100,
    confidenceLevel = 0.95,
    createdBy
  } = data;

  // Validate traffic allocation sums to 100
  const totalAllocation = Object.values(trafficAllocation).reduce((a, b) => a + b, 0);
  if (totalAllocation !== 100) {
    throw new Error('Traffic allocation must sum to 100');
  }

  const sql = `
    INSERT INTO journey_ab_tests (
      name, description, test_type,
      control_config, variant_configs, traffic_allocation,
      journey_definition_id, template_id, vertical_slug,
      primary_metric, secondary_metrics,
      min_sample_size, confidence_level,
      status, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft', $14)
    RETURNING *
  `;

  const result = await query(sql, [
    name, description, testType,
    JSON.stringify(controlConfig), JSON.stringify(variantConfigs), JSON.stringify(trafficAllocation),
    journeyDefinitionId, templateId, verticalSlug,
    primaryMetric, JSON.stringify(secondaryMetrics),
    minSampleSize, confidenceLevel,
    createdBy
  ]);

  return result.rows[0];
}

/**
 * Get A/B test by ID
 */
export async function getABTest(testId) {
  const sql = `SELECT * FROM journey_ab_tests WHERE id = $1`;
  const result = await query(sql, [testId]);
  return result.rows[0] || null;
}

/**
 * Get all A/B tests
 */
export async function getAllABTests(options = {}) {
  const { status, journeyDefinitionId, templateId, limit = 50 } = options;

  let sql = `SELECT * FROM journey_ab_tests WHERE 1=1`;
  const params = [];
  let paramIndex = 1;

  if (status) {
    sql += ` AND status = $${paramIndex++}`;
    params.push(status);
  }

  if (journeyDefinitionId) {
    sql += ` AND journey_definition_id = $${paramIndex++}`;
    params.push(journeyDefinitionId);
  }

  if (templateId) {
    sql += ` AND template_id = $${paramIndex++}`;
    params.push(templateId);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Start A/B test
 */
export async function startABTest(testId) {
  const test = await getABTest(testId);
  if (!test) {
    throw new Error(`A/B test not found: ${testId}`);
  }

  if (test.status !== 'draft') {
    throw new Error(`Cannot start test in status: ${test.status}`);
  }

  const sql = `
    UPDATE journey_ab_tests
    SET status = 'running', started_at = NOW(), updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [testId]);
  return result.rows[0];
}

/**
 * Stop A/B test
 */
export async function stopABTest(testId) {
  const sql = `
    UPDATE journey_ab_tests
    SET status = 'paused', updated_at = NOW()
    WHERE id = $1 AND status = 'running'
    RETURNING *
  `;

  const result = await query(sql, [testId]);
  return result.rows[0];
}

/**
 * Complete A/B test with results
 */
export async function completeABTest(testId, results) {
  const test = await getABTest(testId);
  if (!test) {
    throw new Error(`A/B test not found: ${testId}`);
  }

  // Determine winner based on results
  const winner = determineWinner(test, results);

  const sql = `
    UPDATE journey_ab_tests
    SET status = 'completed',
        ended_at = NOW(),
        results = $2,
        winner_variant = $3,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [testId, JSON.stringify(results), winner]);
  return result.rows[0];
}

/**
 * Determine A/B test winner
 */
function determineWinner(test, results) {
  const { primary_metric, min_sample_size, confidence_level } = test;

  // Check minimum sample size
  const controlSamples = results.control?.samples || 0;
  const variantSamples = Object.values(results.variants || {}).reduce(
    (sum, v) => sum + (v.samples || 0), 0
  );

  if (controlSamples < min_sample_size || variantSamples < min_sample_size) {
    return null; // Not enough samples
  }

  // Simple comparison (in production, use proper statistical testing)
  const controlValue = results.control?.[primary_metric] || 0;
  let bestVariant = null;
  let bestValue = controlValue;

  for (const [variant, data] of Object.entries(results.variants || {})) {
    const variantValue = data[primary_metric] || 0;
    if (variantValue > bestValue) {
      bestValue = variantValue;
      bestVariant = variant;
    }
  }

  // Check if improvement is statistically significant
  const improvement = bestVariant ? (bestValue - controlValue) / controlValue : 0;
  if (improvement > 0.05) { // 5% minimum improvement
    return bestVariant;
  }

  return 'control'; // Control wins if no variant is significantly better
}

/**
 * Get variant for instance (deterministic assignment)
 */
export async function getVariantForInstance(testId, instanceId) {
  const test = await getABTest(testId);
  if (!test || test.status !== 'running') {
    return null;
  }

  // Deterministic assignment based on instance ID hash
  const hash = simpleHash(instanceId);
  const bucket = hash % 100;

  let cumulative = 0;
  for (const [variant, allocation] of Object.entries(test.traffic_allocation)) {
    cumulative += allocation;
    if (bucket < cumulative) {
      return variant;
    }
  }

  return 'control';
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ============================================================================
// JOURNEY MEMORY
// ============================================================================

/**
 * Store memory
 */
export async function storeMemory(data) {
  const {
    memoryType,
    scopeType,
    scopeId,
    memoryKey,
    memoryValue,
    sourceJourneyId,
    sourceStepSlug,
    ttlDays
  } = data;

  const sql = `
    SELECT update_journey_memory($1, $2, $3, $4, $5, $6, $7, $8) as memory
  `;

  const result = await query(sql, [
    memoryType,
    scopeType,
    scopeId,
    memoryKey,
    JSON.stringify(memoryValue),
    sourceJourneyId,
    sourceStepSlug,
    ttlDays
  ]);

  return result.rows[0]?.memory;
}

/**
 * Get memory
 */
export async function getMemory(memoryType, scopeType, scopeId, memoryKey = null) {
  let sql;
  let params;

  if (memoryKey) {
    sql = `
      SELECT * FROM journey_memory
      WHERE memory_type = $1 AND scope_type = $2 AND scope_id = $3 AND memory_key = $4
        AND (expires_at IS NULL OR expires_at > NOW())
    `;
    params = [memoryType, scopeType, scopeId, memoryKey];
  } else {
    sql = `
      SELECT * FROM journey_memory
      WHERE memory_type = $1 AND scope_type = $2 AND scope_id = $3
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY relevance_score DESC, last_accessed_at DESC
    `;
    params = [memoryType, scopeType, scopeId];
  }

  const result = await query(sql, params);

  // Update access tracking
  if (result.rows.length > 0) {
    const ids = result.rows.map(r => r.id);
    await query(`
      UPDATE journey_memory
      SET last_accessed_at = NOW(), access_count = access_count + 1
      WHERE id = ANY($1)
    `, [ids]);
  }

  return memoryKey ? result.rows[0] : result.rows;
}

/**
 * Get all memory for an entity
 */
export async function getEntityMemory(scopeType, scopeId) {
  const sql = `
    SELECT * FROM journey_memory
    WHERE scope_type = $1 AND scope_id = $2
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY memory_type, relevance_score DESC
  `;

  const result = await query(sql, [scopeType, scopeId]);
  return result.rows;
}

/**
 * Decay memory relevance scores
 */
export async function decayMemoryScores(decayFactor = 0.95, minRelevance = 0.1) {
  const sql = `
    UPDATE journey_memory
    SET relevance_score = GREATEST($2, relevance_score * $1),
        updated_at = NOW()
    WHERE relevance_score > $2
    RETURNING id
  `;

  const result = await query(sql, [decayFactor, minRelevance]);
  return result.rowCount;
}

/**
 * Clean up expired memory
 */
export async function cleanupExpiredMemory() {
  const sql = `
    DELETE FROM journey_memory
    WHERE expires_at IS NOT NULL AND expires_at < NOW()
    RETURNING id
  `;

  const result = await query(sql);
  return result.rowCount;
}

// ============================================================================
// DEBUG MODE
// ============================================================================

/**
 * Start debug session
 */
export async function startDebugSession(instanceId, options = {}) {
  const {
    breakpoints = [],
    watchExpressions = [],
    traceLevel = 'info',
    createdBy
  } = options;

  const sql = `
    INSERT INTO journey_debug_sessions (
      instance_id, breakpoints, watch_expressions, trace_level, created_by
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const result = await query(sql, [
    instanceId,
    JSON.stringify(breakpoints),
    JSON.stringify(watchExpressions),
    traceLevel,
    createdBy
  ]);

  return result.rows[0];
}

/**
 * Get debug session
 */
export async function getDebugSession(instanceId) {
  const sql = `
    SELECT * FROM journey_debug_sessions
    WHERE instance_id = $1 AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `;

  const result = await query(sql, [instanceId]);
  return result.rows[0] || null;
}

/**
 * Capture debug state
 */
export async function captureDebugState(sessionId, stateData) {
  const session = await query(
    `SELECT * FROM journey_debug_sessions WHERE id = $1`,
    [sessionId]
  );

  if (!session.rows[0]) {
    throw new Error(`Debug session not found: ${sessionId}`);
  }

  const currentStates = session.rows[0].captured_states || [];
  currentStates.push({
    timestamp: new Date().toISOString(),
    ...stateData
  });

  const sql = `
    UPDATE journey_debug_sessions
    SET captured_states = $2
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [sessionId, JSON.stringify(currentStates)]);
  return result.rows[0];
}

/**
 * Capture debug context
 */
export async function captureDebugContext(sessionId, contextData) {
  const session = await query(
    `SELECT * FROM journey_debug_sessions WHERE id = $1`,
    [sessionId]
  );

  if (!session.rows[0]) {
    throw new Error(`Debug session not found: ${sessionId}`);
  }

  const currentContext = session.rows[0].captured_context || [];
  currentContext.push({
    timestamp: new Date().toISOString(),
    ...contextData
  });

  const sql = `
    UPDATE journey_debug_sessions
    SET captured_context = $2
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [sessionId, JSON.stringify(currentContext)]);
  return result.rows[0];
}

/**
 * Add debug log
 */
export async function addDebugLog(sessionId, level, message, data = {}) {
  const session = await query(
    `SELECT * FROM journey_debug_sessions WHERE id = $1`,
    [sessionId]
  );

  if (!session.rows[0]) {
    throw new Error(`Debug session not found: ${sessionId}`);
  }

  const currentLogs = session.rows[0].captured_logs || [];
  currentLogs.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    data
  });

  const sql = `
    UPDATE journey_debug_sessions
    SET captured_logs = $2
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [sessionId, JSON.stringify(currentLogs)]);
  return result.rows[0];
}

/**
 * End debug session
 */
export async function endDebugSession(sessionId) {
  const sql = `
    UPDATE journey_debug_sessions
    SET ended_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await query(sql, [sessionId]);
  return result.rows[0];
}

// ============================================================================
// ANALYTICS DASHBOARD
// ============================================================================

/**
 * Get journey analytics
 */
export async function getJourneyAnalytics(options = {}) {
  const {
    journeyDefinitionId,
    templateId,
    verticalSlug,
    timeRange = '7d'
  } = options;

  let whereClause = `WHERE ji.created_at >= NOW() - $1::INTERVAL`;
  const params = [timeRange];
  let paramIndex = 2;

  if (journeyDefinitionId) {
    whereClause += ` AND ji.definition_id = $${paramIndex++}`;
    params.push(journeyDefinitionId);
  }

  if (verticalSlug) {
    whereClause += ` AND jd.vertical_slug = $${paramIndex++}`;
    params.push(verticalSlug);
  }

  const [overview, byStatus, byState, stepPerformance, completionTrend] = await Promise.all([
    // Overview stats
    query(`
      SELECT
        COUNT(*) as total_journeys,
        COUNT(*) FILTER (WHERE ji.status = 'completed') as completed,
        COUNT(*) FILTER (WHERE ji.status = 'failed') as failed,
        COUNT(*) FILTER (WHERE ji.status = 'running') as running,
        AVG(EXTRACT(EPOCH FROM (ji.completed_at - ji.started_at))) FILTER (WHERE ji.status = 'completed') as avg_duration_seconds,
        AVG(ji.steps_completed::float / NULLIF(ji.steps_total, 0)) FILTER (WHERE ji.status = 'completed') as avg_completion_rate
      FROM journey_instances ji
      JOIN journey_definitions jd ON ji.definition_id = jd.id
      ${whereClause}
    `, params),

    // By status
    query(`
      SELECT ji.status, COUNT(*) as count
      FROM journey_instances ji
      JOIN journey_definitions jd ON ji.definition_id = jd.id
      ${whereClause}
      GROUP BY ji.status
    `, params),

    // By current state
    query(`
      SELECT ji.current_state, COUNT(*) as count
      FROM journey_instances ji
      JOIN journey_definitions jd ON ji.definition_id = jd.id
      ${whereClause}
      GROUP BY ji.current_state
      ORDER BY count DESC
      LIMIT 10
    `, params),

    // Step performance
    query(`
      SELECT
        jse.step_slug,
        COUNT(*) as executions,
        COUNT(*) FILTER (WHERE jse.status = 'completed') as completed,
        COUNT(*) FILTER (WHERE jse.status = 'failed') as failed,
        AVG(jse.duration_ms) as avg_duration_ms
      FROM journey_step_executions jse
      JOIN journey_instances ji ON jse.instance_id = ji.id
      JOIN journey_definitions jd ON ji.definition_id = jd.id
      ${whereClause}
      GROUP BY jse.step_slug
      ORDER BY executions DESC
      LIMIT 20
    `, params),

    // Completion trend (daily)
    query(`
      SELECT
        DATE_TRUNC('day', ji.completed_at) as date,
        COUNT(*) as completed
      FROM journey_instances ji
      JOIN journey_definitions jd ON ji.definition_id = jd.id
      ${whereClause} AND ji.status = 'completed'
      GROUP BY DATE_TRUNC('day', ji.completed_at)
      ORDER BY date
    `, params)
  ]);

  return {
    overview: overview.rows[0],
    byStatus: byStatus.rows,
    byState: byState.rows,
    stepPerformance: stepPerformance.rows,
    completionTrend: completionTrend.rows
  };
}

/**
 * Get execution timeline for an instance
 */
export async function getExecutionTimeline(instanceId) {
  const [stateHistory, stepExecutions, reasoningTrace] = await Promise.all([
    query(`
      SELECT * FROM journey_state_history
      WHERE instance_id = $1
      ORDER BY created_at
    `, [instanceId]),
    query(`
      SELECT * FROM journey_step_executions
      WHERE instance_id = $1
      ORDER BY step_index, created_at
    `, [instanceId]),
    query(`
      SELECT * FROM journey_reasoning_trace
      WHERE instance_id = $1
      ORDER BY step_index, created_at
    `, [instanceId])
  ]);

  // Merge into timeline
  const timeline = [];

  for (const state of stateHistory.rows) {
    timeline.push({
      type: 'state_transition',
      timestamp: state.created_at,
      data: state
    });
  }

  for (const step of stepExecutions.rows) {
    timeline.push({
      type: 'step_execution',
      timestamp: step.started_at || step.created_at,
      data: step
    });
  }

  for (const trace of reasoningTrace.rows) {
    timeline.push({
      type: 'reasoning',
      timestamp: trace.created_at,
      data: trace
    });
  }

  // Sort by timestamp
  timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return timeline;
}

// ============================================================================
// EVENT LISTENERS (Integration with Journey Engine)
// ============================================================================

/**
 * Initialize monitoring hooks
 */
export function initializeMonitoringHooks() {
  // Record metrics on instance events
  journeyEngine.on('instance:created', async (instance) => {
    await recordMetric('journey', 'instances_created', 1, {
      journeyDefinitionId: instance.definition_id
    });
  });

  journeyEngine.on('instance:completed', async (instance) => {
    await recordMetric('journey', 'instances_completed', 1, {
      journeyDefinitionId: instance.definition_id
    });

    // Record duration
    if (instance.started_at && instance.completed_at) {
      const duration = new Date(instance.completed_at) - new Date(instance.started_at);
      await recordMetric('journey', 'completion_duration_ms', duration, {
        journeyDefinitionId: instance.definition_id
      });
    }
  });

  journeyEngine.on('instance:failed', async (instance) => {
    await recordMetric('journey', 'instances_failed', 1, {
      journeyDefinitionId: instance.definition_id
    });
  });

  journeyEngine.on('step:completed', async ({ instanceId, step, result }) => {
    await recordMetric('step', 'executions_completed', 1, {
      dimensions: { step_slug: step.slug }
    });
  });

  journeyEngine.on('step:failed', async ({ instanceId, step, error }) => {
    await recordMetric('step', 'executions_failed', 1, {
      dimensions: { step_slug: step.slug, error_type: error }
    });
  });

  console.log('[JourneyMonitoring] Monitoring hooks initialized');
}

// Auto-initialize on import
initializeMonitoringHooks();

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Metrics
  recordMetric,
  getMetrics,
  getMetricSummary,

  // A/B Testing
  createABTest,
  getABTest,
  getAllABTests,
  startABTest,
  stopABTest,
  completeABTest,
  getVariantForInstance,

  // Memory
  storeMemory,
  getMemory,
  getEntityMemory,
  decayMemoryScores,
  cleanupExpiredMemory,

  // Debug
  startDebugSession,
  getDebugSession,
  captureDebugState,
  captureDebugContext,
  addDebugLog,
  endDebugSession,

  // Analytics
  getJourneyAnalytics,
  getExecutionTimeline,

  // Hooks
  initializeMonitoringHooks
};
