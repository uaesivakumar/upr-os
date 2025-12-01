/**
 * S70: Autonomous Observability
 * Sprint 70: Cost & Token Tracking + Performance Metrics
 *
 * Features:
 *   1. Cost & Token Tracking - LLM usage metrics for all autonomous operations
 *   2. Autonomous Performance Metrics - success/failure, throughput, latency, conversion
 *
 * Architecture:
 *   - NO tenant awareness (OS-only)
 *   - Context via territoryId, verticalSlug parameters
 *   - Integrates with S66 Autonomous Safety
 *   - Integrates with S67 Auto-Discovery
 *   - Integrates with S68 Auto-Outreach
 *   - ConfigLoader for all thresholds
 */

import { getDb } from '../db/index.js';
import { ConfigLoader } from './configLoader.js';
import * as Sentry from '@sentry/node';

// =====================================================
// LLM USAGE / TOKEN TRACKING
// =====================================================

/**
 * Record LLM API usage with token counts
 */
export async function recordTokenUsage({
  service,
  operation,
  provider,
  model,
  modelVersion = null,
  inputTokens,
  outputTokens,
  cachedTokens = 0,
  latencyMs = null,
  success = true,
  errorCode = null,
  errorMessage = null,
  verticalSlug = null,
  territoryId = null,
  correlationId = null,
  taskId = null,
  requestMetadata = {},
  responseMetadata = {}
}) {
  const db = getDb();

  try {
    // Calculate cost using pricing table
    const costResult = await db.raw(
      'SELECT * FROM calculate_llm_cost(?, ?, ?, ?, ?)',
      [provider, model, inputTokens, outputTokens, cachedTokens]
    );

    const cost = costResult.rows?.[0] || {
      input_cost_micros: 0,
      output_cost_micros: 0,
      total_cost_micros: 0
    };

    const [record] = await db('llm_usage_metrics')
      .insert({
        service,
        operation,
        provider,
        model,
        model_version: modelVersion,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cached_tokens: cachedTokens,
        input_cost_micros: cost.input_cost_micros,
        output_cost_micros: cost.output_cost_micros,
        latency_ms: latencyMs,
        request_timestamp: new Date(),
        response_timestamp: latencyMs ? new Date() : null,
        success,
        error_code: errorCode,
        error_message: errorMessage,
        vertical_slug: verticalSlug,
        territory_id: territoryId,
        correlation_id: correlationId,
        task_id: taskId,
        request_metadata: requestMetadata,
        response_metadata: responseMetadata
      })
      .returning('*');

    return {
      id: record.id,
      totalTokens: record.total_tokens,
      totalCostMicros: record.total_cost_micros,
      totalCostUsd: record.total_cost_micros / 1_000_000
    };
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}

/**
 * Compute LLM cost for given parameters (without recording)
 */
export async function computeLLMCost({
  provider,
  model,
  inputTokens,
  outputTokens,
  cachedTokens = 0
}) {
  const db = getDb();

  const result = await db.raw(
    'SELECT * FROM calculate_llm_cost(?, ?, ?, ?, ?)',
    [provider, model, inputTokens, outputTokens, cachedTokens]
  );

  const cost = result.rows?.[0] || {
    input_cost_micros: 0,
    output_cost_micros: 0,
    total_cost_micros: 0
  };

  return {
    inputCostMicros: cost.input_cost_micros,
    outputCostMicros: cost.output_cost_micros,
    totalCostMicros: cost.total_cost_micros,
    inputCostUsd: cost.input_cost_micros / 1_000_000,
    outputCostUsd: cost.output_cost_micros / 1_000_000,
    totalCostUsd: cost.total_cost_micros / 1_000_000
  };
}

/**
 * Get LLM usage statistics
 */
export async function getLLMUsageStats({
  startDate,
  endDate,
  service = null,
  provider = null,
  model = null,
  verticalSlug = null,
  territoryId = null,
  groupBy = 'service'  // 'service', 'provider', 'model', 'day'
}) {
  const db = getDb();

  let query = db('llm_usage_metrics')
    .whereBetween('created_at', [startDate, endDate]);

  if (service) query = query.where('service', service);
  if (provider) query = query.where('provider', provider);
  if (model) query = query.where('model', model);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);

  const groupColumns = {
    service: ['service'],
    provider: ['provider'],
    model: ['provider', 'model'],
    day: [db.raw('DATE(created_at) as date')]
  };

  const groups = groupColumns[groupBy] || ['service'];

  const stats = await query
    .select(groups)
    .count('* as total_calls')
    .sum('input_tokens as total_input_tokens')
    .sum('output_tokens as total_output_tokens')
    .sum('total_tokens as total_tokens')
    .sum('total_cost_micros as total_cost_micros')
    .avg('latency_ms as avg_latency_ms')
    .count(db.raw('CASE WHEN NOT success THEN 1 END as failed_calls'))
    .groupBy(groups)
    .orderBy(groupBy === 'day' ? 'date' : groups[0]);

  return stats.map(row => ({
    ...row,
    totalCostUsd: (row.total_cost_micros || 0) / 1_000_000,
    avgLatencyMs: parseFloat(row.avg_latency_ms) || 0
  }));
}

/**
 * Get cost breakdown by service
 */
export async function getCostStats({
  startDate,
  endDate,
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  const result = await db.raw(
    'SELECT * FROM get_cost_summary(?, ?, ?, ?)',
    [startDate, endDate, verticalSlug, territoryId]
  );

  return result.rows || [];
}

// =====================================================
// PERFORMANCE METRICS
// =====================================================

/**
 * Record a performance event
 */
export async function recordPerformanceEvent({
  service,
  operation,
  eventType,  // 'started', 'completed', 'failed', 'retried', 'cancelled'
  verticalSlug = null,
  territoryId = null,
  correlationId = null,
  taskId = null,
  entityType = null,
  entityId = null,
  durationMs = null,
  queueWaitMs = null,
  batchSize = 1,
  itemsProcessed = 1,
  itemsSucceeded = 0,
  itemsFailed = 0,
  confidenceScore = null,
  qualityScore = null,
  opened = null,
  clicked = null,
  replied = null,
  converted = null,
  errorCode = null,
  errorCategory = null,
  errorMessage = null,
  retryCount = 0,
  memoryMb = null,
  cpuMs = null,
  metadata = {}
}) {
  const db = getDb();

  try {
    const [record] = await db('autonomous_performance_metrics')
      .insert({
        service,
        operation,
        event_type: eventType,
        vertical_slug: verticalSlug,
        territory_id: territoryId,
        correlation_id: correlationId,
        task_id: taskId,
        entity_type: entityType,
        entity_id: entityId,
        duration_ms: durationMs,
        queue_wait_ms: queueWaitMs,
        batch_size: batchSize,
        items_processed: itemsProcessed,
        items_succeeded: itemsSucceeded,
        items_failed: itemsFailed,
        confidence_score: confidenceScore,
        quality_score: qualityScore,
        opened,
        clicked,
        replied,
        converted,
        error_code: errorCode,
        error_category: errorCategory,
        error_message: errorMessage,
        retry_count: retryCount,
        memory_mb: memoryMb,
        cpu_ms: cpuMs,
        metadata
      })
      .returning('*');

    return record;
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}

/**
 * Get performance statistics
 */
export async function getPerformanceStats({
  startDate,
  endDate,
  service = null,
  operation = null,
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  const result = await db.raw(
    'SELECT * FROM get_performance_summary(?, ?, ?, ?)',
    [startDate, endDate, service, verticalSlug]
  );

  return result.rows || [];
}

/**
 * Get real-time performance (last 24 hours)
 */
export async function getRealtimePerformance({
  service = null,
  verticalSlug = null
}) {
  const db = getDb();

  let query = db('v_performance_24h');
  if (service) query = query.where('service', service);

  return query;
}

/**
 * Get error summary
 */
export async function getErrorSummary({
  startDate = null,
  endDate = null,
  service = null,
  verticalSlug = null,
  limit = 20
}) {
  const db = getDb();

  // If no dates provided, use last 24 hours view
  if (!startDate && !endDate) {
    let query = db('v_error_summary_24h');
    if (service) query = query.where('service', service);
    return query.limit(limit);
  }

  let query = db('autonomous_performance_metrics')
    .select('service', 'error_category', 'error_code')
    .count('* as error_count')
    .min('created_at as first_occurrence')
    .max('created_at as last_occurrence')
    .countDistinct('correlation_id as affected_correlations')
    .where('event_type', 'failed')
    .whereBetween('created_at', [startDate, endDate])
    .groupBy('service', 'error_category', 'error_code')
    .orderBy('error_count', 'desc')
    .limit(limit);

  if (service) query = query.where('service', service);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);

  return query;
}

// =====================================================
// CONVERSION / OUTREACH METRICS
// =====================================================

/**
 * Get outreach conversion funnel
 */
export async function getOutreachFunnel({
  startDate,
  endDate,
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  let query = db('autonomous_performance_metrics')
    .select(db.raw('DATE(created_at) as date'))
    .count('* as total_sent')
    .count(db.raw('CASE WHEN opened THEN 1 END as opened'))
    .count(db.raw('CASE WHEN clicked THEN 1 END as clicked'))
    .count(db.raw('CASE WHEN replied THEN 1 END as replied'))
    .count(db.raw('CASE WHEN converted THEN 1 END as converted'))
    .where('service', 'auto-outreach')
    .where('operation', 'send')
    .whereBetween('created_at', [startDate, endDate])
    .groupBy(db.raw('DATE(created_at)'))
    .orderBy('date', 'desc');

  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);

  const results = await query;

  return results.map(row => ({
    ...row,
    openRate: row.total_sent > 0 ? (row.opened / row.total_sent * 100).toFixed(2) : 0,
    clickRate: row.total_sent > 0 ? (row.clicked / row.total_sent * 100).toFixed(2) : 0,
    replyRate: row.total_sent > 0 ? (row.replied / row.total_sent * 100).toFixed(2) : 0,
    conversionRate: row.total_sent > 0 ? (row.converted / row.total_sent * 100).toFixed(2) : 0
  }));
}

/**
 * Update outreach conversion status
 */
export async function updateOutreachConversion({
  correlationId,
  opened = null,
  clicked = null,
  replied = null,
  converted = null
}) {
  const db = getDb();

  const updates = {};
  if (opened !== null) updates.opened = opened;
  if (clicked !== null) updates.clicked = clicked;
  if (replied !== null) updates.replied = replied;
  if (converted !== null) updates.converted = converted;

  if (Object.keys(updates).length === 0) {
    return { updated: false };
  }

  const count = await db('autonomous_performance_metrics')
    .where('correlation_id', correlationId)
    .where('service', 'auto-outreach')
    .update(updates);

  return { updated: count > 0, rowsAffected: count };
}

// =====================================================
// DAILY SUMMARIES
// =====================================================

/**
 * Get daily summary
 */
export async function getDailySummary({
  date,
  service = null,
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  let query = db('autonomous_daily_summary')
    .where('summary_date', date);

  if (service) query = query.where('service', service);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);

  return query;
}

/**
 * Get daily summaries for date range
 */
export async function getDailySummaries({
  startDate,
  endDate,
  service = null,
  verticalSlug = null
}) {
  const db = getDb();

  let query = db('autonomous_daily_summary')
    .whereBetween('summary_date', [startDate, endDate])
    .orderBy('summary_date', 'desc');

  if (service) query = query.where('service', service);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);

  return query;
}

/**
 * Trigger daily summary aggregation
 */
export async function aggregateDailySummary(date = null) {
  const db = getDb();

  const targetDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const result = await db.raw('SELECT aggregate_daily_summary(?)', [targetDate]);

  return {
    date: targetDate,
    rowsAggregated: result.rows?.[0]?.aggregate_daily_summary || 0
  };
}

// =====================================================
// COST TRENDS & ALERTS
// =====================================================

/**
 * Get cost trend
 */
export async function getCostTrend({
  days = 30,
  service = null,
  verticalSlug = null
}) {
  const db = getDb();

  let query = db('llm_usage_metrics')
    .select(db.raw('DATE(created_at) as date'))
    .sum('total_cost_micros as total_cost_micros')
    .sum('total_tokens as total_tokens')
    .count('* as total_calls')
    .where('created_at', '>=', db.raw(`NOW() - INTERVAL '${days} days'`))
    .groupBy(db.raw('DATE(created_at)'))
    .orderBy('date', 'desc');

  if (service) query = query.where('service', service);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);

  const results = await query;

  return results.map(row => ({
    ...row,
    totalCostUsd: (row.total_cost_micros || 0) / 1_000_000
  }));
}

/**
 * Check cost threshold alerts
 */
export async function checkCostThresholds({
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  // Get config thresholds
  const config = await ConfigLoader.getConfig('autonomous.metrics', verticalSlug);
  const dailyThresholdUsd = config?.dailyCostThresholdUsd || 100;
  const hourlyThresholdUsd = config?.hourlyCostThresholdUsd || 20;

  // Check daily cost
  const dailyCost = await db('llm_usage_metrics')
    .sum('total_cost_micros as total')
    .where('created_at', '>=', db.raw("DATE_TRUNC('day', NOW())"))
    .modify(qb => {
      if (verticalSlug) qb.where('vertical_slug', verticalSlug);
      if (territoryId) qb.where('territory_id', territoryId);
    })
    .first();

  const dailyCostUsd = (dailyCost?.total || 0) / 1_000_000;

  // Check hourly cost
  const hourlyCost = await db('llm_usage_metrics')
    .sum('total_cost_micros as total')
    .where('created_at', '>=', db.raw("NOW() - INTERVAL '1 hour'"))
    .modify(qb => {
      if (verticalSlug) qb.where('vertical_slug', verticalSlug);
      if (territoryId) qb.where('territory_id', territoryId);
    })
    .first();

  const hourlyCostUsd = (hourlyCost?.total || 0) / 1_000_000;

  const alerts = [];

  if (dailyCostUsd >= dailyThresholdUsd) {
    alerts.push({
      type: 'daily_cost_threshold',
      severity: 'warning',
      message: `Daily cost ($${dailyCostUsd.toFixed(2)}) exceeds threshold ($${dailyThresholdUsd})`,
      currentValue: dailyCostUsd,
      threshold: dailyThresholdUsd
    });
  }

  if (hourlyCostUsd >= hourlyThresholdUsd) {
    alerts.push({
      type: 'hourly_cost_threshold',
      severity: 'warning',
      message: `Hourly cost ($${hourlyCostUsd.toFixed(2)}) exceeds threshold ($${hourlyThresholdUsd})`,
      currentValue: hourlyCostUsd,
      threshold: hourlyThresholdUsd
    });
  }

  return {
    dailyCostUsd,
    hourlyCostUsd,
    dailyThresholdUsd,
    hourlyThresholdUsd,
    hasAlerts: alerts.length > 0,
    alerts
  };
}

// =====================================================
// MODEL PRICING MANAGEMENT
// =====================================================

/**
 * Get model pricing
 */
export async function getModelPricing({
  provider = null,
  model = null,
  activeOnly = true
}) {
  const db = getDb();

  let query = db('llm_model_pricing');

  if (activeOnly) query = query.where('is_active', true);
  if (provider) query = query.where('provider', provider);
  if (model) query = query.where('model', model);

  return query.orderBy(['provider', 'model']);
}

/**
 * Update model pricing
 */
export async function updateModelPricing({
  provider,
  model,
  inputPricePerMillionMicros,
  outputPricePerMillionMicros,
  cachedInputPricePerMillionMicros = null,
  modelVersion = null,
  notes = null
}) {
  const db = getDb();

  // Deactivate existing pricing
  await db('llm_model_pricing')
    .where({ provider, model })
    .where('is_active', true)
    .update({
      is_active: false,
      effective_until: new Date()
    });

  // Insert new pricing
  const [record] = await db('llm_model_pricing')
    .insert({
      provider,
      model,
      model_version: modelVersion,
      input_price_per_million_micros: inputPricePerMillionMicros,
      output_price_per_million_micros: outputPricePerMillionMicros,
      cached_input_price_per_million_micros: cachedInputPricePerMillionMicros,
      notes,
      is_active: true
    })
    .returning('*');

  return record;
}

// =====================================================
// HEALTH & DASHBOARD
// =====================================================

/**
 * Get metrics health overview
 */
export async function getMetricsHealth({
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  // Get 24h stats
  const llmStats24h = await db('llm_usage_metrics')
    .count('* as total_calls')
    .sum('total_cost_micros as total_cost_micros')
    .count(db.raw('CASE WHEN NOT success THEN 1 END as failed_calls'))
    .avg('latency_ms as avg_latency_ms')
    .where('created_at', '>=', db.raw("NOW() - INTERVAL '24 hours'"))
    .modify(qb => {
      if (verticalSlug) qb.where('vertical_slug', verticalSlug);
      if (territoryId) qb.where('territory_id', territoryId);
    })
    .first();

  const perfStats24h = await db('autonomous_performance_metrics')
    .count('* as total_operations')
    .count(db.raw("CASE WHEN event_type = 'completed' THEN 1 END as completed"))
    .count(db.raw("CASE WHEN event_type = 'failed' THEN 1 END as failed"))
    .avg('duration_ms as avg_duration_ms')
    .where('created_at', '>=', db.raw("NOW() - INTERVAL '24 hours'"))
    .modify(qb => {
      if (verticalSlug) qb.where('vertical_slug', verticalSlug);
      if (territoryId) qb.where('territory_id', territoryId);
    })
    .first();

  const totalOps = parseInt(perfStats24h?.total_operations) || 0;
  const completedOps = parseInt(perfStats24h?.completed) || 0;
  const failedOps = parseInt(perfStats24h?.failed) || 0;

  return {
    period: '24h',
    llm: {
      totalCalls: parseInt(llmStats24h?.total_calls) || 0,
      failedCalls: parseInt(llmStats24h?.failed_calls) || 0,
      totalCostUsd: (llmStats24h?.total_cost_micros || 0) / 1_000_000,
      avgLatencyMs: parseFloat(llmStats24h?.avg_latency_ms) || 0
    },
    performance: {
      totalOperations: totalOps,
      completedOperations: completedOps,
      failedOperations: failedOps,
      successRate: totalOps > 0 ? ((completedOps / (completedOps + failedOps)) * 100).toFixed(2) : 0,
      avgDurationMs: parseFloat(perfStats24h?.avg_duration_ms) || 0
    },
    timestamp: new Date().toISOString()
  };
}

// =====================================================
// EXPORTS
// =====================================================

export default {
  // Token tracking
  recordTokenUsage,
  computeLLMCost,
  getLLMUsageStats,
  getCostStats,

  // Performance
  recordPerformanceEvent,
  getPerformanceStats,
  getRealtimePerformance,
  getErrorSummary,

  // Conversion
  getOutreachFunnel,
  updateOutreachConversion,

  // Daily summaries
  getDailySummary,
  getDailySummaries,
  aggregateDailySummary,

  // Cost trends
  getCostTrend,
  checkCostThresholds,

  // Pricing
  getModelPricing,
  updateModelPricing,

  // Health
  getMetricsHealth
};
