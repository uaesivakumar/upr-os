/**
 * S67: Auto-Discovery Engine
 * Sprint 67: Autonomous Discovery System
 *
 * Features:
 *   1. Auto-Enrichment Pipeline - automated enrichment queues
 *   2. Discovery Quality Filter - filter/validate discovered data
 *   3. Signal-Triggered Discovery - event-driven discovery initiation
 *   4. Auto-Discovery Scheduler - scheduled discovery jobs
 *
 * Architecture:
 *   - NO tenant awareness (OS-only)
 *   - Context via territoryId, verticalSlug parameters
 *   - Integrates with S64 Object Intelligence
 *   - Integrates with S65 Evidence System
 *   - Integrates with S66 Autonomous Safety (kill switch, activity log, checkpoints)
 *   - ConfigLoader for all configuration
 *
 * S66 Integration:
 *   - Before processing: check isAutonomyEnabled()
 *   - On start: logAutonomousEvent({ eventType: 'discovery_started', source: 'auto-discovery' })
 *   - On complete: logAutonomousEvent({ eventType: 'discovery_completed' })
 *   - On error: logAutonomousEvent({ eventType: 'discovery_failed', severity: 'error' })
 *   - High-value targets: registerCheckpoint() before enrichment
 */

import { getDb } from '../db/index.js';
import { ConfigLoader } from './configLoader.js';
import * as Sentry from '@sentry/node';
import * as autonomousSafety from './autonomousSafety.js';

// =====================================================
// ENRICHMENT PIPELINE
// =====================================================

/**
 * Add item to enrichment queue
 */
export async function queueEnrichment({
  objectId,
  objectType,
  verticalSlug,
  territoryId,
  pipelineSlug = 'standard',
  providers = [],
  priority = 5,
  source = 'manual',
  triggeredBy = null,
  correlationId = null
}) {
  const db = getDb();

  // Load pipeline config
  const pipeline = await db('enrichment_pipelines')
    .where('slug', pipelineSlug)
    .where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    })
    .first();

  const pipelineConfig = {
    pipeline_slug: pipelineSlug,
    stages: pipeline?.stages || [],
    timeout_ms: pipeline?.timeout_ms || 30000,
    retry_policy: pipeline?.retry_policy || { max_attempts: 3, backoff: 'exponential' }
  };

  const providerChain = providers.length > 0 ? providers : (pipeline?.provider_chain || []);

  const [item] = await db('enrichment_queue')
    .insert({
      object_id: objectId,
      object_type: objectType,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      pipeline_config: pipelineConfig,
      providers: providerChain,
      priority,
      source,
      triggered_by: triggeredBy,
      correlation_id: correlationId,
      max_attempts: pipelineConfig.retry_policy?.max_attempts || 3
    })
    .returning('*');

  return item;
}

/**
 * Get next batch of enrichment items for processing
 */
export async function getEnrichmentBatch({
  batchSize = 10,
  verticalSlug = null,
  territoryId = null,
  respectKillSwitch = true
}) {
  const db = getDb();

  // Check kill switch before processing
  if (respectKillSwitch) {
    const enabled = await autonomousSafety.isAutonomyEnabled({ verticalSlug, territoryId });
    if (!enabled) {
      await autonomousSafety.logAutonomousEvent({
        eventType: 'discovery_blocked',
        severity: 'warning',
        source: 'auto-discovery',
        message: 'Kill switch is active - skipping enrichment batch',
        verticalSlug,
        territoryId
      });
      return [];
    }
  }

  const result = await db.raw(
    'SELECT * FROM get_enrichment_batch(?, ?, ?)',
    [batchSize, verticalSlug, territoryId]
  );

  // Log batch fetch
  if (result.rows?.length > 0) {
    await autonomousSafety.logAutonomousEvent({
      eventType: 'discovery_batch_fetched',
      severity: 'info',
      source: 'auto-discovery',
      message: `Fetched ${result.rows.length} items for enrichment`,
      verticalSlug,
      territoryId,
      metadata: { batchSize: result.rows.length }
    });
  }

  return result.rows || [];
}

/**
 * Complete enrichment item (success or failure)
 */
export async function completeEnrichment({
  itemId,
  success,
  result = null,
  error = null,
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  await db.raw(
    'SELECT complete_enrichment_item(?, ?, ?, ?)',
    [itemId, success, result ? JSON.stringify(result) : null, error]
  );

  // Log completion to activity log
  await autonomousSafety.logAutonomousEvent({
    eventType: success ? 'discovery_item_completed' : 'discovery_item_failed',
    severity: success ? 'info' : 'error',
    source: 'auto-discovery',
    message: success ? `Enrichment completed for item ${itemId}` : `Enrichment failed for item ${itemId}`,
    verticalSlug,
    territoryId,
    errorMessage: error,
    metadata: { itemId, success }
  });

  return { itemId, success };
}

/**
 * Get enrichment queue status
 */
export async function getEnrichmentQueueStatus({
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  let query = db('enrichment_queue')
    .select('status')
    .count('* as count')
    .groupBy('status');

  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);

  const statusCounts = await query;

  const totals = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    retry: 0
  };

  statusCounts.forEach(row => {
    totals[row.status] = parseInt(row.count, 10);
  });

  return totals;
}

/**
 * Get enrichment item by ID
 */
export async function getEnrichmentItem(itemId) {
  const db = getDb();
  return db('enrichment_queue').where('id', itemId).first();
}

/**
 * Cancel enrichment item
 */
export async function cancelEnrichment(itemId) {
  const db = getDb();

  const [item] = await db('enrichment_queue')
    .where('id', itemId)
    .whereIn('status', ['pending', 'retry'])
    .update({
      status: 'cancelled',
      updated_at: new Date()
    })
    .returning('*');

  return item;
}

// =====================================================
// ENRICHMENT PIPELINES MANAGEMENT
// =====================================================

/**
 * Create enrichment pipeline
 */
export async function createPipeline({
  slug,
  name,
  description,
  verticalSlug = null,
  territoryId = null,
  stages = [],
  providerChain = [],
  fallbackStrategy = 'next',
  timeoutMs = 30000,
  retryPolicy = { max_attempts: 3, backoff: 'exponential' },
  concurrencyLimit = 10,
  minConfidence = 0.7,
  requiredFields = []
}) {
  const db = getDb();

  const [pipeline] = await db('enrichment_pipelines')
    .insert({
      slug,
      name,
      description,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      stages,
      provider_chain: providerChain,
      fallback_strategy: fallbackStrategy,
      timeout_ms: timeoutMs,
      retry_policy: retryPolicy,
      concurrency_limit: concurrencyLimit,
      min_confidence: minConfidence,
      required_fields: requiredFields
    })
    .returning('*');

  return pipeline;
}

/**
 * Get pipeline by slug
 */
export async function getPipeline(slug, verticalSlug = null) {
  const db = getDb();

  return db('enrichment_pipelines')
    .where('slug', slug)
    .where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    })
    .orderByRaw('vertical_slug IS NULL')
    .first();
}

/**
 * List pipelines
 */
export async function listPipelines({
  verticalSlug = null,
  isActive = true,
  limit = 50,
  offset = 0
}) {
  const db = getDb();

  let query = db('enrichment_pipelines');

  if (verticalSlug) {
    query = query.where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    });
  }

  if (isActive !== null) {
    query = query.where('is_active', isActive);
  }

  const [{ count }] = await query.clone().count();
  const pipelines = await query.orderBy('name').limit(limit).offset(offset);

  return { pipelines, total: parseInt(count, 10) };
}

/**
 * Update pipeline
 */
export async function updatePipeline(slug, updates) {
  const db = getDb();

  const allowedFields = [
    'name', 'description', 'stages', 'provider_chain', 'fallback_strategy',
    'timeout_ms', 'retry_policy', 'concurrency_limit', 'min_confidence',
    'required_fields', 'is_active'
  ];

  const filteredUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (allowedFields.includes(snakeKey)) {
      filteredUpdates[snakeKey] = value;
    }
  }

  filteredUpdates.updated_at = new Date();

  const [pipeline] = await db('enrichment_pipelines')
    .where('slug', slug)
    .update(filteredUpdates)
    .returning('*');

  return pipeline;
}

// =====================================================
// QUALITY FILTER
// =====================================================

/**
 * Create quality rule
 */
export async function createQualityRule({
  slug,
  name,
  description,
  verticalSlug = null,
  territoryId = null,
  objectType = null,
  ruleType,
  conditions = [],
  actions = [],
  scoreModifier = 0,
  confidenceThreshold = null,
  priority = 100
}) {
  const db = getDb();

  const [rule] = await db('discovery_quality_rules')
    .insert({
      slug,
      name,
      description,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      object_type: objectType,
      rule_type: ruleType,
      conditions,
      actions,
      score_modifier: scoreModifier,
      confidence_threshold: confidenceThreshold,
      priority
    })
    .returning('*');

  return rule;
}

/**
 * Get quality rules for context
 */
export async function getQualityRules({
  verticalSlug = null,
  territoryId = null,
  objectType = null,
  ruleType = null,
  isActive = true
}) {
  const db = getDb();

  let query = db('discovery_quality_rules').where('is_active', isActive);

  if (verticalSlug) {
    query = query.where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    });
  }

  if (territoryId) {
    query = query.where(function() {
      this.whereNull('territory_id').orWhere('territory_id', territoryId);
    });
  }

  if (objectType) {
    query = query.where(function() {
      this.whereNull('object_type').orWhere('object_type', objectType);
    });
  }

  if (ruleType) {
    query = query.where('rule_type', ruleType);
  }

  return query.orderBy('priority', 'desc');
}

/**
 * Assess object quality
 */
export async function assessQuality({
  objectId,
  objectType,
  objectData,
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  // Get applicable rules
  const rules = await getQualityRules({ verticalSlug, territoryId, objectType });

  const fieldScores = {};
  const rulesApplied = [];
  const issuesFound = [];
  let totalScore = 0;
  let ruleCount = 0;
  let passed = true;

  // Evaluate each rule
  for (const rule of rules) {
    const ruleResult = evaluateRule(rule, objectData);
    rulesApplied.push({
      ruleId: rule.id,
      ruleSlug: rule.slug,
      passed: ruleResult.passed,
      details: ruleResult.details
    });

    if (!ruleResult.passed) {
      // Process actions
      for (const action of rule.actions || []) {
        if (action.type === 'reject') {
          passed = false;
          issuesFound.push({
            rule: rule.slug,
            severity: 'error',
            message: action.reason || 'Rule validation failed'
          });
        } else if (action.type === 'flag') {
          issuesFound.push({
            rule: rule.slug,
            severity: 'warning',
            message: action.reason || 'Data flagged for review'
          });
        }
      }
    }

    // Calculate score contribution
    const ruleScore = ruleResult.passed ? 1 : 0;
    totalScore += ruleScore + (rule.score_modifier || 0);
    ruleCount++;

    // Track field-level scores
    for (const condition of rule.conditions || []) {
      if (condition.field) {
        fieldScores[condition.field] = fieldScores[condition.field] || [];
        fieldScores[condition.field].push(ruleResult.passed ? 1 : 0);
      }
    }
  }

  // Calculate overall score
  const overallScore = ruleCount > 0 ? totalScore / ruleCount : 1;
  const confidence = ruleCount > 0 ? Math.min(ruleCount / 10, 1) : 0.5;

  // Compute field averages
  const fieldAverages = {};
  for (const [field, scores] of Object.entries(fieldScores)) {
    fieldAverages[field] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  // Store assessment
  const [assessment] = await db('discovery_quality_assessments')
    .insert({
      object_id: objectId,
      object_type: objectType,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      overall_score: overallScore,
      confidence,
      field_scores: fieldAverages,
      rules_applied: rulesApplied,
      issues_found: issuesFound,
      passed,
      rejection_reasons: issuesFound.filter(i => i.severity === 'error'),
      assessor_version: '1.0.0'
    })
    .returning('*');

  return assessment;
}

/**
 * Evaluate a single rule against object data
 */
function evaluateRule(rule, objectData) {
  const details = [];
  let allPassed = true;

  for (const condition of rule.conditions || []) {
    const { field, operator, value } = condition;
    const fieldValue = getNestedValue(objectData, field);
    let passed = false;

    switch (operator) {
      case 'equals':
        passed = fieldValue === value;
        break;
      case 'not_equals':
        passed = fieldValue !== value;
        break;
      case 'not_empty':
        passed = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
        break;
      case 'empty':
        passed = fieldValue === null || fieldValue === undefined || fieldValue === '';
        break;
      case 'contains':
        passed = String(fieldValue || '').includes(value);
        break;
      case 'matches':
        passed = new RegExp(value).test(String(fieldValue || ''));
        break;
      case 'gte':
        passed = Number(fieldValue) >= Number(value);
        break;
      case 'lte':
        passed = Number(fieldValue) <= Number(value);
        break;
      case 'gt':
        passed = Number(fieldValue) > Number(value);
        break;
      case 'lt':
        passed = Number(fieldValue) < Number(value);
        break;
      case 'in':
        passed = Array.isArray(value) && value.includes(fieldValue);
        break;
      case 'not_in':
        passed = !Array.isArray(value) || !value.includes(fieldValue);
        break;
      default:
        passed = true;
    }

    details.push({ field, operator, expected: value, actual: fieldValue, passed });
    if (!passed) allPassed = false;
  }

  return { passed: allPassed, details };
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Get quality assessment by object
 */
export async function getQualityAssessment(objectId) {
  const db = getDb();
  return db('discovery_quality_assessments')
    .where('object_id', objectId)
    .orderBy('assessed_at', 'desc')
    .first();
}

/**
 * Get quality summary
 */
export async function getQualitySummary({
  verticalSlug = null,
  territoryId = null,
  objectType = null
}) {
  const db = getDb();

  let query = db('v_quality_summary');

  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);
  if (objectType) query = query.where('object_type', objectType);

  return query;
}

// =====================================================
// SIGNAL-TRIGGERED DISCOVERY
// =====================================================

/**
 * Create discovery trigger
 */
export async function createTrigger({
  slug,
  name,
  description,
  verticalSlug = null,
  territoryId = null,
  signalType,
  signalConditions = {},
  discoveryConfig = {},
  pipelineSlug = 'standard',
  priorityBoost = 0,
  cooldownSeconds = 300,
  maxTriggersPerHour = 100
}) {
  const db = getDb();

  const [trigger] = await db('discovery_triggers')
    .insert({
      slug,
      name,
      description,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      signal_type: signalType,
      signal_conditions: signalConditions,
      discovery_config: discoveryConfig,
      pipeline_slug: pipelineSlug,
      priority_boost: priorityBoost,
      cooldown_seconds: cooldownSeconds,
      max_triggers_per_hour: maxTriggersPerHour
    })
    .returning('*');

  return trigger;
}

/**
 * Process incoming signal for potential triggers
 */
export async function processSignal({
  signalType,
  signalData,
  objectId = null,
  objectType = null,
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  // Find matching triggers
  const result = await db.raw(
    'SELECT * FROM check_discovery_triggers(?, ?::jsonb, ?, ?)',
    [signalType, JSON.stringify(signalData), verticalSlug, territoryId]
  );

  const matchedTriggers = result.rows || [];
  const triggered = [];

  for (const trigger of matchedTriggers) {
    try {
      // Update trigger stats
      await db('discovery_triggers')
        .where('id', trigger.trigger_id)
        .update({
          last_triggered_at: new Date(),
          trigger_count: db.raw('trigger_count + 1')
        });

      // Queue enrichment if object provided
      let queueItemId = null;
      if (objectId && objectType) {
        const queueItem = await queueEnrichment({
          objectId,
          objectType,
          verticalSlug,
          territoryId,
          pipelineSlug: trigger.pipeline_slug,
          priority: 5 + (trigger.priority_boost || 0),
          source: 'trigger',
          triggeredBy: trigger.trigger_slug
        });
        queueItemId = queueItem.id;
      }

      // Log trigger execution
      await db('discovery_trigger_log').insert({
        trigger_id: trigger.trigger_id,
        signal_id: signalData.id || null,
        object_id: objectId,
        object_type: objectType,
        vertical_slug: verticalSlug,
        territory_id: territoryId,
        signal_data: signalData,
        discovery_initiated: !!queueItemId,
        queue_item_id: queueItemId,
        status: 'success'
      });

      triggered.push({
        triggerId: trigger.trigger_id,
        triggerSlug: trigger.trigger_slug,
        queueItemId,
        discoveryConfig: trigger.discovery_config
      });
    } catch (error) {
      Sentry.captureException(error);

      await db('discovery_trigger_log').insert({
        trigger_id: trigger.trigger_id,
        object_id: objectId,
        object_type: objectType,
        vertical_slug: verticalSlug,
        territory_id: territoryId,
        signal_data: signalData,
        discovery_initiated: false,
        status: 'error',
        error_message: error.message
      });
    }
  }

  return { signalType, matchedCount: matchedTriggers.length, triggered };
}

/**
 * Get trigger by slug
 */
export async function getTrigger(slug, verticalSlug = null) {
  const db = getDb();

  return db('discovery_triggers')
    .where('slug', slug)
    .where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    })
    .first();
}

/**
 * List triggers
 */
export async function listTriggers({
  verticalSlug = null,
  territoryId = null,
  signalType = null,
  isActive = true
}) {
  const db = getDb();

  let query = db('v_active_triggers');

  if (!isActive) {
    query = db('discovery_triggers');
  }

  if (verticalSlug) {
    query = query.where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    });
  }

  if (territoryId) {
    query = query.where(function() {
      this.whereNull('territory_id').orWhere('territory_id', territoryId);
    });
  }

  if (signalType) {
    query = query.where('signal_type', signalType);
  }

  return query.orderBy('name');
}

/**
 * Update trigger
 */
export async function updateTrigger(slug, updates) {
  const db = getDb();

  const allowedFields = [
    'name', 'description', 'signal_type', 'signal_conditions', 'discovery_config',
    'pipeline_slug', 'priority_boost', 'cooldown_seconds', 'max_triggers_per_hour', 'is_active'
  ];

  const filteredUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (allowedFields.includes(snakeKey)) {
      filteredUpdates[snakeKey] = value;
    }
  }

  filteredUpdates.updated_at = new Date();

  const [trigger] = await db('discovery_triggers')
    .where('slug', slug)
    .update(filteredUpdates)
    .returning('*');

  return trigger;
}

/**
 * Get trigger execution log
 */
export async function getTriggerLog({
  triggerId = null,
  verticalSlug = null,
  limit = 50,
  offset = 0
}) {
  const db = getDb();

  let query = db('discovery_trigger_log');

  if (triggerId) query = query.where('trigger_id', triggerId);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);

  const [{ count }] = await query.clone().count();
  const logs = await query.orderBy('executed_at', 'desc').limit(limit).offset(offset);

  return { logs, total: parseInt(count, 10) };
}

// =====================================================
// DISCOVERY SCHEDULER
// =====================================================

/**
 * Create discovery schedule
 */
export async function createSchedule({
  slug,
  name,
  description,
  verticalSlug = null,
  territoryId = null,
  scheduleType,
  cronExpression = null,
  intervalSeconds = null,
  discoveryConfig = {},
  targetQuery = {},
  pipelineSlug = 'standard',
  batchSize = 100,
  timezone = 'UTC',
  startTime = null,
  endTime = null,
  daysOfWeek = [1, 2, 3, 4, 5]
}) {
  const db = getDb();

  // Calculate first run time
  const nextRunAt = calculateNextRunTime(scheduleType, cronExpression, intervalSeconds, timezone);

  const [schedule] = await db('discovery_schedules')
    .insert({
      slug,
      name,
      description,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      schedule_type: scheduleType,
      cron_expression: cronExpression,
      interval_seconds: intervalSeconds,
      discovery_config: discoveryConfig,
      target_query: targetQuery,
      pipeline_slug: pipelineSlug,
      batch_size: batchSize,
      timezone,
      start_time: startTime,
      end_time: endTime,
      days_of_week: daysOfWeek,
      next_run_at: nextRunAt
    })
    .returning('*');

  return schedule;
}

/**
 * Calculate next run time for schedule
 */
function calculateNextRunTime(scheduleType, cronExpression, intervalSeconds, timezone) {
  const now = new Date();

  if (scheduleType === 'interval' && intervalSeconds) {
    return new Date(now.getTime() + intervalSeconds * 1000);
  }

  if (scheduleType === 'cron') {
    // Simplified: next hour for cron (real implementation would use cron-parser)
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    return nextHour;
  }

  return null;
}

/**
 * Get schedules due for execution
 */
export async function getDueSchedules({ limit = 10 }) {
  const db = getDb();

  return db('discovery_schedules')
    .where('is_active', true)
    .where('next_run_at', '<=', new Date())
    .orderBy('next_run_at', 'asc')
    .limit(limit);
}

/**
 * Execute scheduled discovery
 */
export async function executeSchedule(scheduleId) {
  const db = getDb();

  const schedule = await db('discovery_schedules').where('id', scheduleId).first();
  if (!schedule) {
    throw new Error(`Schedule not found: ${scheduleId}`);
  }

  const startedAt = new Date();

  // Create run record
  const [run] = await db('discovery_schedule_runs')
    .insert({
      schedule_id: scheduleId,
      vertical_slug: schedule.vertical_slug,
      territory_id: schedule.territory_id,
      started_at: startedAt,
      status: 'running'
    })
    .returning('*');

  const metrics = {
    objectsDiscovered: 0,
    objectsEnriched: 0,
    objectsFiltered: 0,
    errorsCount: 0,
    queueItemsCreated: 0
  };

  const errorLog = [];

  try {
    // Execute target query to find objects
    const objects = await executeTargetQuery(schedule.target_query, {
      verticalSlug: schedule.vertical_slug,
      territoryId: schedule.territory_id,
      limit: schedule.batch_size
    });

    metrics.objectsDiscovered = objects.length;

    // Queue enrichment for each object
    for (const obj of objects) {
      try {
        // Assess quality first
        const assessment = await assessQuality({
          objectId: obj.id,
          objectType: obj.type || 'unknown',
          objectData: obj,
          verticalSlug: schedule.vertical_slug,
          territoryId: schedule.territory_id
        });

        if (!assessment.passed) {
          metrics.objectsFiltered++;
          continue;
        }

        // Queue for enrichment
        await queueEnrichment({
          objectId: obj.id,
          objectType: obj.type || 'unknown',
          verticalSlug: schedule.vertical_slug,
          territoryId: schedule.territory_id,
          pipelineSlug: schedule.pipeline_slug,
          source: 'schedule',
          triggeredBy: schedule.slug
        });

        metrics.objectsEnriched++;
        metrics.queueItemsCreated++;
      } catch (error) {
        metrics.errorsCount++;
        errorLog.push({ objectId: obj.id, error: error.message });
      }
    }

    // Update run record with success
    const completedAt = new Date();
    await db('discovery_schedule_runs')
      .where('id', run.id)
      .update({
        completed_at: completedAt,
        status: 'completed',
        objects_discovered: metrics.objectsDiscovered,
        objects_enriched: metrics.objectsEnriched,
        objects_filtered: metrics.objectsFiltered,
        errors_count: metrics.errorsCount,
        error_log: errorLog,
        duration_ms: completedAt - startedAt,
        queue_items_created: metrics.queueItemsCreated
      });

    // Update schedule with next run time
    const nextRunAt = calculateNextRunTime(
      schedule.schedule_type,
      schedule.cron_expression,
      schedule.interval_seconds,
      schedule.timezone
    );

    await db('discovery_schedules')
      .where('id', scheduleId)
      .update({
        last_run_at: startedAt,
        next_run_at: nextRunAt,
        run_count: db.raw('run_count + 1'),
        updated_at: new Date()
      });

    return { scheduleId, runId: run.id, metrics, status: 'completed' };
  } catch (error) {
    Sentry.captureException(error);

    await db('discovery_schedule_runs')
      .where('id', run.id)
      .update({
        completed_at: new Date(),
        status: 'failed',
        error_log: [{ error: error.message }]
      });

    throw error;
  }
}

/**
 * Execute target query to find objects for discovery
 */
async function executeTargetQuery(targetQuery, { verticalSlug, territoryId, limit }) {
  const db = getDb();

  // Build query based on target configuration
  let query = db('object_nodes');

  if (targetQuery.objectType) {
    query = query.where('type', targetQuery.objectType);
  }

  if (verticalSlug) {
    query = query.where('vertical_slug', verticalSlug);
  }

  if (territoryId) {
    query = query.where('territory_id', territoryId);
  }

  if (targetQuery.filters) {
    for (const filter of targetQuery.filters) {
      if (filter.field && filter.operator && filter.value !== undefined) {
        switch (filter.operator) {
          case 'equals':
            query = query.where(filter.field, filter.value);
            break;
          case 'not_equals':
            query = query.whereNot(filter.field, filter.value);
            break;
          case 'contains':
            query = query.where(filter.field, 'ilike', `%${filter.value}%`);
            break;
          case 'gte':
            query = query.where(filter.field, '>=', filter.value);
            break;
          case 'lte':
            query = query.where(filter.field, '<=', filter.value);
            break;
        }
      }
    }
  }

  if (targetQuery.lastEnrichedBefore) {
    query = query.where(function() {
      this.whereNull('last_enriched_at')
        .orWhere('last_enriched_at', '<', targetQuery.lastEnrichedBefore);
    });
  }

  return query.limit(limit);
}

/**
 * Get schedule by slug
 */
export async function getSchedule(slug, verticalSlug = null) {
  const db = getDb();

  return db('discovery_schedules')
    .where('slug', slug)
    .where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    })
    .first();
}

/**
 * List schedules
 */
export async function listSchedules({
  verticalSlug = null,
  territoryId = null,
  isActive = true
}) {
  const db = getDb();

  let query = db('v_upcoming_schedules');

  if (!isActive) {
    query = db('discovery_schedules');
  }

  if (verticalSlug) {
    query = query.where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    });
  }

  if (territoryId) {
    query = query.where(function() {
      this.whereNull('territory_id').orWhere('territory_id', territoryId);
    });
  }

  return query.orderBy('next_run_at');
}

/**
 * Update schedule
 */
export async function updateSchedule(slug, updates) {
  const db = getDb();

  const allowedFields = [
    'name', 'description', 'schedule_type', 'cron_expression', 'interval_seconds',
    'discovery_config', 'target_query', 'pipeline_slug', 'batch_size',
    'timezone', 'start_time', 'end_time', 'days_of_week', 'is_active'
  ];

  const filteredUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    if (allowedFields.includes(snakeKey)) {
      filteredUpdates[snakeKey] = value;
    }
  }

  filteredUpdates.updated_at = new Date();

  const [schedule] = await db('discovery_schedules')
    .where('slug', slug)
    .update(filteredUpdates)
    .returning('*');

  return schedule;
}

/**
 * Pause/resume schedule
 */
export async function setScheduleActive(slug, isActive) {
  return updateSchedule(slug, { is_active: isActive });
}

/**
 * Get schedule run history
 */
export async function getScheduleRuns({
  scheduleId,
  status = null,
  limit = 20,
  offset = 0
}) {
  const db = getDb();

  let query = db('discovery_schedule_runs').where('schedule_id', scheduleId);

  if (status) {
    query = query.where('status', status);
  }

  const [{ count }] = await query.clone().count();
  const runs = await query.orderBy('started_at', 'desc').limit(limit).offset(offset);

  return { runs, total: parseInt(count, 10) };
}

// =====================================================
// DISCOVERY HEALTH
// =====================================================

/**
 * Get discovery health metrics
 */
export async function getDiscoveryHealth({
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  let healthQuery = db('v_discovery_health');
  if (verticalSlug) healthQuery = healthQuery.where('vertical_slug', verticalSlug);
  if (territoryId) healthQuery = healthQuery.where('territory_id', territoryId);

  const healthMetrics = await healthQuery;

  // Aggregate across all contexts if not filtered
  const aggregated = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    avgAttempts: 0,
    avgDurationSeconds: 0
  };

  for (const row of healthMetrics) {
    aggregated.pending += parseInt(row.pending_count, 10) || 0;
    aggregated.processing += parseInt(row.processing_count, 10) || 0;
    aggregated.completed += parseInt(row.completed_count, 10) || 0;
    aggregated.failed += parseInt(row.failed_count, 10) || 0;
  }

  if (healthMetrics.length > 0) {
    aggregated.avgAttempts = healthMetrics.reduce((sum, r) => sum + (parseFloat(r.avg_attempts) || 0), 0) / healthMetrics.length;
    aggregated.avgDurationSeconds = healthMetrics.reduce((sum, r) => sum + (parseFloat(r.avg_duration_seconds) || 0), 0) / healthMetrics.length;
  }

  return {
    queue: aggregated,
    byContext: healthMetrics,
    timestamp: new Date().toISOString()
  };
}

// =====================================================
// DEFAULT EXPORT
// =====================================================

export default {
  // Enrichment Queue
  queueEnrichment,
  getEnrichmentBatch,
  completeEnrichment,
  getEnrichmentQueueStatus,
  getEnrichmentItem,
  cancelEnrichment,

  // Pipelines
  createPipeline,
  getPipeline,
  listPipelines,
  updatePipeline,

  // Quality Filter
  createQualityRule,
  getQualityRules,
  assessQuality,
  getQualityAssessment,
  getQualitySummary,

  // Triggers
  createTrigger,
  processSignal,
  getTrigger,
  listTriggers,
  updateTrigger,
  getTriggerLog,

  // Scheduler
  createSchedule,
  getDueSchedules,
  executeSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
  setScheduleActive,
  getScheduleRuns,

  // Health
  getDiscoveryHealth
};
