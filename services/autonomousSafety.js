/**
 * S66: Autonomous Safety & Control
 * Sprint 66: Safety Infrastructure for Autonomous Operations
 *
 * Features:
 *   1. Emergency Kill Switch - Global autonomous off switch
 *   2. Autonomous Activity Log - Centralized event log
 *   3. Human-in-the-Loop Checkpoints - Manual approval gates
 *   4. Autonomous Task Queue - Unified job orchestration
 *
 * Architecture:
 *   - NO tenant awareness (OS-only)
 *   - Context via territoryId, verticalSlug parameters
 *   - Integrates with S67 Auto-Discovery
 *   - Integrates with S68 Auto-Outreach
 *   - ConfigLoader for all thresholds and limits
 */

import { getDb } from '../db/index.js';
import { ConfigLoader } from './configLoader.js';
import * as Sentry from '@sentry/node';

// =====================================================
// KILL SWITCH / CONTROL STATE
// =====================================================

/**
 * Get control state for scope
 */
export async function getControlState({
  verticalSlug = null,
  territoryId = null,
  includeGlobal = true
}) {
  const db = getDb();

  let query = db('autonomous_control_state');

  if (verticalSlug || territoryId) {
    query = query.where(function() {
      if (includeGlobal) {
        this.where('scope_type', 'global');
      }
      if (verticalSlug) {
        this.orWhere('vertical_slug', verticalSlug);
      }
      if (territoryId) {
        this.orWhere('territory_id', territoryId);
      }
    });
  } else if (includeGlobal) {
    query = query.where('scope_type', 'global');
  }

  const states = await query.orderBy('scope_type');

  // Calculate effective state
  const globalState = states.find(s => s.scope_type === 'global');
  const scopedState = states.find(s => s.scope_type !== 'global');

  const effectiveEnabled = globalState?.is_enabled !== false &&
    (scopedState?.is_enabled !== false);

  return {
    global: globalState,
    scoped: scopedState,
    effectiveEnabled,
    states
  };
}

/**
 * Check if autonomy is enabled (fast check)
 */
export async function isAutonomyEnabled({
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  const result = await db.raw(
    'SELECT is_autonomy_enabled(?, ?)',
    [verticalSlug, territoryId]
  );

  return result.rows?.[0]?.is_autonomy_enabled ?? true;
}

/**
 * Enable autonomous operations
 */
export async function enableAutonomy({
  verticalSlug = null,
  territoryId = null,
  enabledBy = 'system',
  reason = null
}) {
  const db = getDb();

  const scopeType = territoryId ? 'territory' : verticalSlug ? 'vertical' : 'global';

  // Get current state
  const currentState = await db('autonomous_control_state')
    .where({ scope_type: scopeType, vertical_slug: verticalSlug, territory_id: territoryId })
    .first();

  // Update or insert
  const [state] = await db('autonomous_control_state')
    .insert({
      scope_type: scopeType,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      is_enabled: true,
      disabled_reason: null,
      disabled_by: null,
      disabled_at: null
    })
    .onConflict(['scope_type', 'vertical_slug', 'territory_id'])
    .merge({
      is_enabled: true,
      disabled_reason: null,
      disabled_by: null,
      disabled_at: null,
      updated_at: new Date()
    })
    .returning('*');

  // Log history
  await db('autonomous_control_history').insert({
    control_state_id: state.id,
    action: 'enabled',
    previous_state: currentState ? { is_enabled: currentState.is_enabled } : null,
    new_state: { is_enabled: true },
    reason,
    changed_by: enabledBy
  });

  // Log activity
  await logAutonomousEvent({
    eventType: 'control_state_changed',
    eventCategory: 'safety',
    eventSeverity: 'info',
    sourceService: 'autonomousSafety',
    sourceAction: 'enableAutonomy',
    verticalSlug,
    territoryId,
    eventData: { action: 'enabled', by: enabledBy, reason }
  });

  return state;
}

/**
 * Disable autonomous operations (Kill Switch)
 */
export async function disableAutonomy({
  verticalSlug = null,
  territoryId = null,
  disabledBy = 'system',
  reason = 'Manual kill switch activated'
}) {
  const db = getDb();

  const scopeType = territoryId ? 'territory' : verticalSlug ? 'vertical' : 'global';

  // Get current state
  const currentState = await db('autonomous_control_state')
    .where({ scope_type: scopeType, vertical_slug: verticalSlug, territory_id: territoryId })
    .first();

  // Update or insert
  const [state] = await db('autonomous_control_state')
    .insert({
      scope_type: scopeType,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      is_enabled: false,
      disabled_reason: reason,
      disabled_by: disabledBy,
      disabled_at: new Date()
    })
    .onConflict(['scope_type', 'vertical_slug', 'territory_id'])
    .merge({
      is_enabled: false,
      disabled_reason: reason,
      disabled_by: disabledBy,
      disabled_at: new Date(),
      updated_at: new Date()
    })
    .returning('*');

  // Log history
  await db('autonomous_control_history').insert({
    control_state_id: state.id,
    action: 'disabled',
    previous_state: currentState ? { is_enabled: currentState.is_enabled } : null,
    new_state: { is_enabled: false, reason },
    reason,
    changed_by: disabledBy
  });

  // Log activity
  await logAutonomousEvent({
    eventType: 'control_state_changed',
    eventCategory: 'safety',
    eventSeverity: 'warning',
    sourceService: 'autonomousSafety',
    sourceAction: 'disableAutonomy',
    verticalSlug,
    territoryId,
    eventData: { action: 'disabled', by: disabledBy, reason }
  });

  return state;
}

/**
 * Update control state limits
 */
export async function updateControlLimits({
  verticalSlug = null,
  territoryId = null,
  maxConcurrentTasks = null,
  maxTasksPerHour = null,
  maxTasksPerDay = null,
  errorRateThreshold = null,
  autoDisableOnThreshold = null,
  configOverride = null,
  updatedBy = 'system'
}) {
  const db = getDb();

  const scopeType = territoryId ? 'territory' : verticalSlug ? 'vertical' : 'global';

  const updates = { updated_at: new Date() };
  if (maxConcurrentTasks !== null) updates.max_concurrent_tasks = maxConcurrentTasks;
  if (maxTasksPerHour !== null) updates.max_tasks_per_hour = maxTasksPerHour;
  if (maxTasksPerDay !== null) updates.max_tasks_per_day = maxTasksPerDay;
  if (errorRateThreshold !== null) updates.error_rate_threshold = errorRateThreshold;
  if (autoDisableOnThreshold !== null) updates.auto_disable_on_threshold = autoDisableOnThreshold;
  if (configOverride !== null) updates.config_override = configOverride;

  const [state] = await db('autonomous_control_state')
    .where({ scope_type: scopeType, vertical_slug: verticalSlug, territory_id: territoryId })
    .update(updates)
    .returning('*');

  return state;
}

/**
 * Get control state history
 */
export async function getControlHistory({
  verticalSlug = null,
  territoryId = null,
  limit = 50,
  offset = 0
}) {
  const db = getDb();

  let query = db('autonomous_control_history as ach')
    .join('autonomous_control_state as acs', 'acs.id', 'ach.control_state_id')
    .select('ach.*', 'acs.scope_type', 'acs.vertical_slug', 'acs.territory_id');

  if (verticalSlug) {
    query = query.where(function() {
      this.where('acs.scope_type', 'global').orWhere('acs.vertical_slug', verticalSlug);
    });
  }

  if (territoryId) {
    query = query.where(function() {
      this.where('acs.scope_type', 'global').orWhere('acs.territory_id', territoryId);
    });
  }

  const [{ count }] = await query.clone().count();
  const history = await query.orderBy('ach.occurred_at', 'desc').limit(limit).offset(offset);

  return { history, total: parseInt(count, 10) };
}

// =====================================================
// AUTONOMOUS ACTIVITY LOG
// =====================================================

/**
 * Log an autonomous event
 */
export async function logAutonomousEvent({
  eventType,
  eventCategory,
  eventSeverity = 'info',
  verticalSlug = null,
  territoryId = null,
  sourceService,
  sourceAction = null,
  sourceId = null,
  targetType = null,
  targetId = null,
  eventData = {},
  metadata = {},
  status = 'completed',
  errorMessage = null,
  errorStack = null,
  startedAt = null,
  completedAt = null,
  correlationId = null,
  parentEventId = null,
  traceId = null
}) {
  const db = getDb();

  const durationMs = startedAt && completedAt
    ? new Date(completedAt) - new Date(startedAt)
    : null;

  const [event] = await db('autonomous_activity_log')
    .insert({
      event_type: eventType,
      event_category: eventCategory,
      event_severity: eventSeverity,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      source_service: sourceService,
      source_action: sourceAction,
      source_id: sourceId,
      target_type: targetType,
      target_id: targetId,
      event_data: eventData,
      metadata,
      status,
      error_message: errorMessage,
      error_stack: errorStack,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: durationMs,
      correlation_id: correlationId,
      parent_event_id: parentEventId,
      trace_id: traceId
    })
    .returning('*');

  // Check error rate if this was a failure
  if (status === 'failed' && sourceService) {
    try {
      await db.raw('SELECT check_error_rate_threshold(?, ?)', [sourceService, verticalSlug]);
    } catch (e) {
      // Don't fail logging due to threshold check
      Sentry.captureException(e);
    }
  }

  return event;
}

/**
 * List autonomous events
 */
export async function listAutonomousEvents({
  eventType = null,
  eventCategory = null,
  eventSeverity = null,
  sourceService = null,
  verticalSlug = null,
  territoryId = null,
  status = null,
  correlationId = null,
  startDate = null,
  endDate = null,
  limit = 50,
  offset = 0
}) {
  const db = getDb();

  let query = db('autonomous_activity_log');

  if (eventType) query = query.where('event_type', eventType);
  if (eventCategory) query = query.where('event_category', eventCategory);
  if (eventSeverity) query = query.where('event_severity', eventSeverity);
  if (sourceService) query = query.where('source_service', sourceService);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);
  if (status) query = query.where('status', status);
  if (correlationId) query = query.where('correlation_id', correlationId);
  if (startDate) query = query.where('occurred_at', '>=', startDate);
  if (endDate) query = query.where('occurred_at', '<=', endDate);

  const [{ count }] = await query.clone().count();
  const events = await query.orderBy('occurred_at', 'desc').limit(limit).offset(offset);

  return { events, total: parseInt(count, 10) };
}

/**
 * Get activity summary
 */
export async function getActivitySummary({
  verticalSlug = null,
  sourceService = null,
  hours = 24
}) {
  const db = getDb();

  let query = db('autonomous_activity_log')
    .select(
      'source_service',
      'event_category',
      'event_severity',
      db.raw('COUNT(*) as total'),
      db.raw("COUNT(*) FILTER (WHERE status = 'completed') as success"),
      db.raw("COUNT(*) FILTER (WHERE status = 'failed') as failed"),
      db.raw('AVG(duration_ms) as avg_duration_ms')
    )
    .where('occurred_at', '>', db.raw(`NOW() - INTERVAL '${hours} hours'`))
    .groupBy('source_service', 'event_category', 'event_severity');

  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (sourceService) query = query.where('source_service', sourceService);

  return query;
}

/**
 * Get error rate for service
 */
export async function getErrorRate({
  sourceService,
  verticalSlug = null,
  hours = 1
}) {
  const db = getDb();

  const result = await db('v_autonomous_error_rates')
    .where('source_service', sourceService)
    .where(function() {
      if (verticalSlug) {
        this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
      }
    })
    .orderBy('hour', 'desc')
    .limit(hours);

  return result;
}

// =====================================================
// HUMAN-IN-THE-LOOP CHECKPOINTS
// =====================================================

/**
 * Create checkpoint definition
 */
export async function createCheckpointDefinition({
  slug,
  name,
  description,
  verticalSlug = null,
  territoryId = null,
  triggerConditions = {},
  appliesToServices = ['*'],
  appliesToActions = ['*'],
  approvalRequired = true,
  autoApproveAfterHours = null,
  autoRejectAfterHours = 72,
  requiresReason = false,
  notifyOnPending = [],
  escalationPolicy = {}
}) {
  const db = getDb();

  const [definition] = await db('autonomous_checkpoint_definitions')
    .insert({
      slug,
      name,
      description,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      trigger_conditions: triggerConditions,
      applies_to_services: appliesToServices,
      applies_to_actions: appliesToActions,
      approval_required: approvalRequired,
      auto_approve_after_hours: autoApproveAfterHours,
      auto_reject_after_hours: autoRejectAfterHours,
      requires_reason: requiresReason,
      notify_on_pending: notifyOnPending,
      escalation_policy: escalationPolicy
    })
    .returning('*');

  return definition;
}

/**
 * Get checkpoint definition
 */
export async function getCheckpointDefinition(slug, verticalSlug = null) {
  const db = getDb();

  return db('autonomous_checkpoint_definitions')
    .where('slug', slug)
    .where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    })
    .orderByRaw('vertical_slug IS NULL')
    .first();
}

/**
 * List checkpoint definitions
 */
export async function listCheckpointDefinitions({
  verticalSlug = null,
  isActive = true
}) {
  const db = getDb();

  let query = db('autonomous_checkpoint_definitions');

  if (verticalSlug) {
    query = query.where(function() {
      this.whereNull('vertical_slug').orWhere('vertical_slug', verticalSlug);
    });
  }

  if (isActive !== null) {
    query = query.where('is_active', isActive);
  }

  return query.orderBy('name');
}

/**
 * Register a checkpoint (request approval)
 */
export async function registerCheckpoint({
  definitionSlug = null,
  verticalSlug = null,
  territoryId = null,
  service,
  action,
  targetType = null,
  targetId = null,
  requestData = {},
  riskAssessment = {},
  impactSummary = null,
  priority = 5,
  correlationId = null,
  taskId = null
}) {
  const db = getDb();

  // Get definition if slug provided
  let definition = null;
  let definitionId = null;
  let expiresAt = null;

  if (definitionSlug) {
    definition = await getCheckpointDefinition(definitionSlug, verticalSlug);
    if (definition) {
      definitionId = definition.id;
      if (definition.auto_reject_after_hours) {
        expiresAt = new Date(Date.now() + definition.auto_reject_after_hours * 60 * 60 * 1000);
      }
    }
  }

  const [checkpoint] = await db('autonomous_checkpoints')
    .insert({
      definition_id: definitionId,
      definition_slug: definitionSlug,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      service,
      action,
      target_type: targetType,
      target_id: targetId,
      request_data: requestData,
      risk_assessment: riskAssessment,
      impact_summary: impactSummary,
      priority,
      expires_at: expiresAt,
      correlation_id: correlationId,
      task_id: taskId
    })
    .returning('*');

  // Log history
  await db('autonomous_checkpoint_history').insert({
    checkpoint_id: checkpoint.id,
    action: 'created',
    data: { requestData, riskAssessment }
  });

  // Log activity
  await logAutonomousEvent({
    eventType: 'checkpoint_registered',
    eventCategory: 'checkpoint',
    eventSeverity: 'info',
    sourceService: service,
    sourceAction: action,
    verticalSlug,
    territoryId,
    targetType,
    targetId,
    eventData: { checkpointId: checkpoint.id, definitionSlug },
    correlationId
  });

  return checkpoint;
}

/**
 * Get checkpoint by ID
 */
export async function getCheckpoint(checkpointId) {
  const db = getDb();

  const checkpoint = await db('autonomous_checkpoints')
    .where('id', checkpointId)
    .first();

  if (checkpoint) {
    checkpoint.history = await db('autonomous_checkpoint_history')
      .where('checkpoint_id', checkpointId)
      .orderBy('occurred_at', 'desc');
  }

  return checkpoint;
}

/**
 * List pending checkpoints
 */
export async function listPendingCheckpoints({
  verticalSlug = null,
  territoryId = null,
  service = null,
  priority = null,
  limit = 50,
  offset = 0
}) {
  const db = getDb();

  let query = db('v_pending_checkpoints');

  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);
  if (service) query = query.where('service', service);
  if (priority) query = query.where('priority', '>=', priority);

  const [{ count }] = await query.clone().count();
  const checkpoints = await query.limit(limit).offset(offset);

  return { checkpoints, total: parseInt(count, 10) };
}

/**
 * Approve checkpoint
 */
export async function approveCheckpoint({
  checkpointId,
  approvedBy,
  reason = null,
  resolutionData = {}
}) {
  const db = getDb();

  const [checkpoint] = await db('autonomous_checkpoints')
    .where('id', checkpointId)
    .where('status', 'pending')
    .update({
      status: 'approved',
      resolved_by: approvedBy,
      resolved_at: new Date(),
      resolution_reason: reason,
      resolution_data: resolutionData,
      updated_at: new Date()
    })
    .returning('*');

  if (!checkpoint) {
    throw new Error(`Checkpoint not found or already resolved: ${checkpointId}`);
  }

  // Log history
  await db('autonomous_checkpoint_history').insert({
    checkpoint_id: checkpointId,
    action: 'approved',
    actor: approvedBy,
    reason,
    data: resolutionData
  });

  // Update associated task if exists
  if (checkpoint.task_id) {
    await db('autonomous_task_queue')
      .where('id', checkpoint.task_id)
      .update({
        checkpoint_status: 'approved',
        updated_at: new Date()
      });
  }

  // Log activity
  await logAutonomousEvent({
    eventType: 'checkpoint_approved',
    eventCategory: 'checkpoint',
    eventSeverity: 'info',
    sourceService: 'autonomousSafety',
    sourceAction: 'approveCheckpoint',
    verticalSlug: checkpoint.vertical_slug,
    territoryId: checkpoint.territory_id,
    eventData: { checkpointId, approvedBy, reason },
    correlationId: checkpoint.correlation_id
  });

  return checkpoint;
}

/**
 * Reject checkpoint
 */
export async function rejectCheckpoint({
  checkpointId,
  rejectedBy,
  reason,
  resolutionData = {}
}) {
  const db = getDb();

  const [checkpoint] = await db('autonomous_checkpoints')
    .where('id', checkpointId)
    .where('status', 'pending')
    .update({
      status: 'rejected',
      resolved_by: rejectedBy,
      resolved_at: new Date(),
      resolution_reason: reason,
      resolution_data: resolutionData,
      updated_at: new Date()
    })
    .returning('*');

  if (!checkpoint) {
    throw new Error(`Checkpoint not found or already resolved: ${checkpointId}`);
  }

  // Log history
  await db('autonomous_checkpoint_history').insert({
    checkpoint_id: checkpointId,
    action: 'rejected',
    actor: rejectedBy,
    reason,
    data: resolutionData
  });

  // Update associated task if exists
  if (checkpoint.task_id) {
    await db('autonomous_task_queue')
      .where('id', checkpoint.task_id)
      .update({
        checkpoint_status: 'rejected',
        status: 'blocked',
        updated_at: new Date()
      });
  }

  // Log activity
  await logAutonomousEvent({
    eventType: 'checkpoint_rejected',
    eventCategory: 'checkpoint',
    eventSeverity: 'warning',
    sourceService: 'autonomousSafety',
    sourceAction: 'rejectCheckpoint',
    verticalSlug: checkpoint.vertical_slug,
    territoryId: checkpoint.territory_id,
    eventData: { checkpointId, rejectedBy, reason },
    correlationId: checkpoint.correlation_id
  });

  return checkpoint;
}

/**
 * Process expired checkpoints
 */
export async function processExpiredCheckpoints() {
  const db = getDb();

  const result = await db.raw('SELECT * FROM process_expired_checkpoints()');
  return result.rows || [];
}

// =====================================================
// AUTONOMOUS TASK QUEUE
// =====================================================

/**
 * Enqueue a task
 */
export async function enqueueTask({
  taskType,
  taskCategory,
  verticalSlug = null,
  territoryId = null,
  service,
  action,
  payload = {},
  targetType = null,
  targetId = null,
  priority = 5,
  scheduledAt = null,
  notBefore = null,
  notAfter = null,
  maxAttempts = 3,
  requiresCheckpoint = false,
  checkpointSlug = null,
  correlationId = null,
  parentTaskId = null,
  source = null,
  metadata = {}
}) {
  const db = getDb();

  // Check if autonomy is enabled
  const enabled = await isAutonomyEnabled({ verticalSlug, territoryId });
  if (!enabled) {
    throw new Error('Autonomous operations are currently disabled');
  }

  // Create checkpoint if required
  let checkpointId = null;
  let checkpointStatus = null;

  if (requiresCheckpoint) {
    const checkpoint = await registerCheckpoint({
      definitionSlug: checkpointSlug,
      verticalSlug,
      territoryId,
      service,
      action,
      targetType,
      targetId,
      requestData: payload,
      correlationId
    });
    checkpointId = checkpoint.id;
    checkpointStatus = 'pending';
  }

  const [task] = await db('autonomous_task_queue')
    .insert({
      task_type: taskType,
      task_category: taskCategory,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      service,
      action,
      payload,
      target_type: targetType,
      target_id: targetId,
      priority,
      scheduled_at: scheduledAt,
      not_before: notBefore,
      not_after: notAfter,
      max_attempts: maxAttempts,
      requires_checkpoint: requiresCheckpoint,
      checkpoint_id: checkpointId,
      checkpoint_status: checkpointStatus,
      correlation_id: correlationId,
      parent_task_id: parentTaskId,
      source,
      metadata
    })
    .returning('*');

  // Update checkpoint with task ID
  if (checkpointId) {
    await db('autonomous_checkpoints')
      .where('id', checkpointId)
      .update({ task_id: task.id });
  }

  // Log history
  await db('autonomous_task_history').insert({
    task_id: task.id,
    event_type: 'created',
    new_status: task.status
  });

  // Log activity
  await logAutonomousEvent({
    eventType: 'task_enqueued',
    eventCategory: 'task',
    eventSeverity: 'info',
    sourceService: service,
    sourceAction: action,
    verticalSlug,
    territoryId,
    targetType,
    targetId,
    eventData: { taskId: task.id, taskType, requiresCheckpoint },
    correlationId
  });

  return task;
}

/**
 * Get next batch of tasks for processing
 */
export async function dequeueTask({
  batchSize = 10,
  service = null,
  verticalSlug = null
}) {
  const db = getDb();

  const result = await db.raw(
    'SELECT * FROM get_autonomous_task_batch(?, ?, ?)',
    [batchSize, service, verticalSlug]
  );

  return result.rows || [];
}

/**
 * Complete a task successfully
 */
export async function completeTask({
  taskId,
  result = null
}) {
  const db = getDb();

  await db.raw(
    'SELECT complete_autonomous_task(?, ?, ?::jsonb, ?)',
    [taskId, true, result ? JSON.stringify(result) : null, null]
  );

  const task = await db('autonomous_task_queue').where('id', taskId).first();

  // Log activity
  await logAutonomousEvent({
    eventType: 'task_completed',
    eventCategory: 'task',
    eventSeverity: 'info',
    sourceService: task?.service,
    sourceAction: task?.action,
    verticalSlug: task?.vertical_slug,
    territoryId: task?.territory_id,
    eventData: { taskId, durationMs: task?.duration_ms },
    correlationId: task?.correlation_id
  });

  return { taskId, status: 'completed' };
}

/**
 * Fail a task
 */
export async function failTask({
  taskId,
  error
}) {
  const db = getDb();

  await db.raw(
    'SELECT complete_autonomous_task(?, ?, ?, ?)',
    [taskId, false, null, error]
  );

  const task = await db('autonomous_task_queue').where('id', taskId).first();

  // Log activity
  await logAutonomousEvent({
    eventType: task?.status === 'failed' ? 'task_failed' : 'task_retry_scheduled',
    eventCategory: 'task',
    eventSeverity: task?.status === 'failed' ? 'error' : 'warning',
    sourceService: task?.service,
    sourceAction: task?.action,
    verticalSlug: task?.vertical_slug,
    territoryId: task?.territory_id,
    eventData: { taskId, attempt: task?.attempts, error },
    status: 'failed',
    errorMessage: error,
    correlationId: task?.correlation_id
  });

  return { taskId, status: task?.status };
}

/**
 * Get task by ID
 */
export async function getTask(taskId) {
  const db = getDb();

  const task = await db('autonomous_task_queue').where('id', taskId).first();

  if (task) {
    task.history = await db('autonomous_task_history')
      .where('task_id', taskId)
      .orderBy('occurred_at', 'desc');
  }

  return task;
}

/**
 * List tasks
 */
export async function listTasks({
  taskType = null,
  taskCategory = null,
  service = null,
  status = null,
  verticalSlug = null,
  territoryId = null,
  limit = 50,
  offset = 0
}) {
  const db = getDb();

  let query = db('autonomous_task_queue');

  if (taskType) query = query.where('task_type', taskType);
  if (taskCategory) query = query.where('task_category', taskCategory);
  if (service) query = query.where('service', service);
  if (status) query = query.where('status', status);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);

  const [{ count }] = await query.clone().count();
  const tasks = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);

  return { tasks, total: parseInt(count, 10) };
}

/**
 * Get task queue health
 */
export async function getTaskQueueHealth({
  verticalSlug = null,
  territoryId = null
}) {
  const db = getDb();

  let query = db('v_task_queue_health');

  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (territoryId) query = query.where('territory_id', territoryId);

  return query;
}

/**
 * Cancel a pending task
 */
export async function cancelTask({
  taskId,
  cancelledBy = 'system',
  reason = null
}) {
  const db = getDb();

  const [task] = await db('autonomous_task_queue')
    .where('id', taskId)
    .whereIn('status', ['pending', 'scheduled', 'blocked'])
    .update({
      status: 'cancelled',
      updated_at: new Date()
    })
    .returning('*');

  if (!task) {
    return null;
  }

  // Log history
  await db('autonomous_task_history').insert({
    task_id: taskId,
    event_type: 'cancelled',
    previous_status: task.status,
    new_status: 'cancelled',
    data: { cancelledBy, reason }
  });

  return task;
}

// =====================================================
// DEFAULT EXPORT
// =====================================================

export default {
  // Control State (Kill Switch)
  getControlState,
  isAutonomyEnabled,
  enableAutonomy,
  disableAutonomy,
  updateControlLimits,
  getControlHistory,

  // Activity Log
  logAutonomousEvent,
  listAutonomousEvents,
  getActivitySummary,
  getErrorRate,

  // Checkpoints
  createCheckpointDefinition,
  getCheckpointDefinition,
  listCheckpointDefinitions,
  registerCheckpoint,
  getCheckpoint,
  listPendingCheckpoints,
  approveCheckpoint,
  rejectCheckpoint,
  processExpiredCheckpoints,

  // Task Queue
  enqueueTask,
  dequeueTask,
  completeTask,
  failTask,
  getTask,
  listTasks,
  getTaskQueueHealth,
  cancelTask
};
