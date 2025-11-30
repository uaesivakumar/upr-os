/**
 * Journey Engine Core Service
 * Sprint 58: Journey Engine Core
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CRITICAL ARCHITECTURAL RULES - READ BEFORE MODIFYING
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1. THIS IS A PURE ENGINE - NO BUSINESS LOGIC ALLOWED
 *    ─────────────────────────────────────────────────
 *    ✅ CORRECT: Load journey definitions from DB/ConfigLoader
 *    ✅ CORRECT: Execute state transitions based on definition
 *    ✅ CORRECT: Apply generic operators (conditions, validators)
 *
 *    ❌ FORBIDDEN: if (vertical === 'banking') { special logic }
 *    ❌ FORBIDDEN: if (step === 'enrichment') { hardcoded behavior }
 *    ❌ FORBIDDEN: Any vertical/industry-specific code paths
 *
 * 2. DETERMINISTIC BEHAVIOR
 *    ─────────────────────────────────────────────────
 *    same config + same input → same output (ALWAYS)
 *
 *    This enables:
 *    • Journey replay for debugging
 *    • Predictive intelligence validation
 *    • Autonomous mode reliability
 *
 * 3. SEPARATION OF CONCERNS
 *    ─────────────────────────────────────────────────
 *    Engine (this file) = PURE STATE MACHINE
 *    Definitions + Templates = BRAIN (stored in DB)
 *    Steps = Executed via step registry (S59)
 *    Monitoring = Telemetry layer (S61)
 *
 * 4. CONCURRENCY SAFETY
 *    ─────────────────────────────────────────────────
 *    • State locks prevent race conditions
 *    • Transitions are atomic
 *    • Rollback is always possible
 *
 * 5. NO TENANT AWARENESS
 *    ─────────────────────────────────────────────────
 *    Context is passed via API params from SaaS layer
 *    Engine processes context, doesn't store tenant data
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

import { query } from '../db/index.js';
import { getConfig, getNamespaceConfig } from './configLoader.js';
import { EventEmitter } from 'events';

// ============================================================================
// JOURNEY ENGINE CLASS
// ============================================================================

class JourneyEngine extends EventEmitter {
  constructor() {
    super();
    this.stepExecutors = new Map();
    this.validators = new Map();
  }

  /**
   * Register a step executor
   * @param {string} executorType - The executor type (e.g., 'discovery', 'enrichment')
   * @param {Function} executor - The executor function
   */
  registerExecutor(executorType, executor) {
    this.stepExecutors.set(executorType, executor);
  }

  /**
   * Register a validator
   * @param {string} validatorType - The validator type
   * @param {Function} validator - The validator function
   */
  registerValidator(validatorType, validator) {
    this.validators.set(validatorType, validator);
  }

  /**
   * Get executor for step type
   */
  getExecutor(executorType) {
    return this.stepExecutors.get(executorType);
  }
}

// Singleton instance
export const journeyEngine = new JourneyEngine();

// ============================================================================
// JOURNEY DEFINITIONS
// ============================================================================

/**
 * Get all journey definitions
 */
export async function getAllDefinitions(options = {}) {
  const { vertical, isActive = true, includeInactive = false } = options;

  let sql = `
    SELECT * FROM journey_definitions
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (!includeInactive) {
    sql += ` AND is_active = $${paramIndex++}`;
    params.push(isActive);
  }

  if (vertical) {
    sql += ` AND (vertical_slug = $${paramIndex++} OR vertical_slug IS NULL)`;
    params.push(vertical);
  }

  sql += ` ORDER BY name`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get journey definition by slug or ID
 */
export async function getDefinition(identifier) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  const sql = isUuid
    ? `SELECT * FROM journey_definitions WHERE id = $1`
    : `SELECT * FROM journey_definitions WHERE slug = $1`;

  const result = await query(sql, [identifier]);
  return result.rows[0] || null;
}

/**
 * Get definition with effective config (merged with ConfigLoader)
 */
export async function getDefinitionWithConfig(identifier, context = {}) {
  const definition = await getDefinition(identifier);
  if (!definition) return null;

  // Get journey config from ConfigLoader
  const journeyConfig = await getConfig('journey', definition.slug, context);

  // Merge with definition
  return {
    ...definition,
    effectiveConfig: {
      ...definition,
      ...(journeyConfig || {}),
      // Context-specific overrides
      context
    }
  };
}

/**
 * Create journey definition
 */
export async function createDefinition(data) {
  const {
    slug,
    name,
    description,
    initialState = 'pending',
    states = [],
    transitions = [],
    steps = [],
    preconditions = [],
    validators = [],
    requiredContext = [],
    optionalContext = [],
    verticalSlug,
    territoryCode,
    isSystem = false,
    tags = [],
    createdBy
  } = data;

  const sql = `
    INSERT INTO journey_definitions (
      slug, name, description, initial_state,
      states, transitions, steps,
      preconditions, validators,
      required_context, optional_context,
      vertical_slug, territory_code,
      is_system, tags, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
  `;

  const result = await query(sql, [
    slug, name, description, initialState,
    JSON.stringify(states), JSON.stringify(transitions), JSON.stringify(steps),
    JSON.stringify(preconditions), JSON.stringify(validators),
    JSON.stringify(requiredContext), JSON.stringify(optionalContext),
    verticalSlug, territoryCode,
    isSystem, JSON.stringify(tags), createdBy
  ]);

  journeyEngine.emit('definition:created', result.rows[0]);
  return result.rows[0];
}

/**
 * Update journey definition
 */
export async function updateDefinition(identifier, updates) {
  const definition = await getDefinition(identifier);
  if (!definition) return null;

  if (definition.is_system) {
    throw new Error('Cannot modify system-defined journey definition');
  }

  const allowedFields = [
    'name', 'description', 'states', 'transitions', 'steps',
    'preconditions', 'validators', 'required_context', 'optional_context',
    'vertical_slug', 'territory_code', 'tags', 'is_active'
  ];

  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(dbKey)) {
      setClauses.push(`${dbKey} = $${paramIndex++}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
  }

  if (setClauses.length === 0) return definition;

  // Increment version on update
  setClauses.push(`version = version + 1`);

  values.push(definition.id);

  const sql = `
    UPDATE journey_definitions
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(sql, values);
  journeyEngine.emit('definition:updated', result.rows[0]);
  return result.rows[0];
}

// ============================================================================
// JOURNEY INSTANCES
// ============================================================================

/**
 * Create a new journey instance
 */
export async function createInstance(definitionId, context = {}, options = {}) {
  const { initiatedBy, priority = 50 } = options;

  const definition = await getDefinition(definitionId);
  if (!definition) {
    throw new Error(`Journey definition not found: ${definitionId}`);
  }

  // Validate required context
  const requiredContext = definition.required_context || [];
  for (const required of requiredContext) {
    if (!(required in context)) {
      throw new Error(`Missing required context: ${required}`);
    }
  }

  // Validate preconditions (deterministic - loaded from definition)
  const preconditions = definition.preconditions || [];
  for (const precondition of preconditions) {
    const isValid = await evaluatePrecondition(precondition, context);
    if (!isValid) {
      throw new Error(`Precondition failed: ${precondition.name || precondition.type}`);
    }
  }

  const stepsTotal = (definition.steps || []).length;

  const sql = `
    INSERT INTO journey_instances (
      definition_id, current_state, context,
      status, steps_total, priority, initiated_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await query(sql, [
    definition.id,
    definition.initial_state,
    JSON.stringify(context),
    'pending',
    stepsTotal,
    priority,
    initiatedBy
  ]);

  const instance = result.rows[0];
  journeyEngine.emit('instance:created', instance);
  return instance;
}

/**
 * Get journey instance by ID
 */
export async function getInstance(instanceId) {
  const sql = `
    SELECT ji.*, jd.slug as definition_slug, jd.name as definition_name
    FROM journey_instances ji
    JOIN journey_definitions jd ON ji.definition_id = jd.id
    WHERE ji.id = $1
  `;
  const result = await query(sql, [instanceId]);
  return result.rows[0] || null;
}

/**
 * Get instances with filtering
 */
export async function getInstances(options = {}) {
  const { definitionId, status, limit = 50, offset = 0 } = options;

  let sql = `
    SELECT ji.*, jd.slug as definition_slug, jd.name as definition_name
    FROM journey_instances ji
    JOIN journey_definitions jd ON ji.definition_id = jd.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (definitionId) {
    sql += ` AND ji.definition_id = $${paramIndex++}`;
    params.push(definitionId);
  }

  if (status) {
    sql += ` AND ji.status = $${paramIndex++}`;
    params.push(status);
  }

  sql += ` ORDER BY ji.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  const result = await query(sql, params);
  return result.rows;
}

// ============================================================================
// STATE MACHINE OPERATIONS
// ============================================================================

/**
 * Acquire lock on journey instance
 */
export async function acquireLock(instanceId, durationSeconds = 30) {
  const sql = `SELECT acquire_journey_lock($1, $2) as acquired`;
  const result = await query(sql, [instanceId, durationSeconds]);
  return result.rows[0]?.acquired || false;
}

/**
 * Release lock on journey instance
 */
export async function releaseLock(instanceId, lockId = null) {
  const sql = `SELECT release_journey_lock($1, $2) as released`;
  const result = await query(sql, [instanceId, lockId]);
  return result.rows[0]?.released || false;
}

/**
 * Start a journey instance
 */
export async function startInstance(instanceId) {
  const instance = await getInstance(instanceId);
  if (!instance) {
    throw new Error(`Journey instance not found: ${instanceId}`);
  }

  if (instance.status !== 'pending') {
    throw new Error(`Cannot start journey in status: ${instance.status}`);
  }

  // Acquire lock
  const lockAcquired = await acquireLock(instanceId);
  if (!lockAcquired) {
    throw new Error('Failed to acquire state lock');
  }

  try {
    const sql = `
      UPDATE journey_instances
      SET status = 'running', started_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sql, [instanceId]);
    const updated = result.rows[0];

    journeyEngine.emit('instance:started', updated);
    return updated;
  } finally {
    await releaseLock(instanceId);
  }
}

/**
 * Transition to a new state (DETERMINISTIC)
 */
export async function transitionState(instanceId, toState, trigger, options = {}) {
  const { triggerData, stepIndex, stepSlug } = options;

  // Use the database function for atomic, deterministic transition
  const sql = `
    SELECT transition_journey_state($1, $2, $3, $4, $5, $6) as instance
  `;

  try {
    const result = await query(sql, [
      instanceId,
      toState,
      trigger,
      triggerData ? JSON.stringify(triggerData) : null,
      stepIndex,
      stepSlug
    ]);

    const instance = result.rows[0]?.instance;
    journeyEngine.emit('instance:transitioned', { instanceId, from: instance?.previous_state, to: toState, trigger });
    return instance;
  } catch (error) {
    journeyEngine.emit('instance:transition_failed', { instanceId, toState, trigger, error: error.message });
    throw error;
  }
}

/**
 * Complete a journey instance
 */
export async function completeInstance(instanceId, results = {}) {
  const lockAcquired = await acquireLock(instanceId);
  if (!lockAcquired) {
    throw new Error('Failed to acquire state lock');
  }

  try {
    const sql = `
      UPDATE journey_instances
      SET status = 'completed',
          completed_at = NOW(),
          results = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sql, [instanceId, JSON.stringify(results)]);
    const instance = result.rows[0];

    journeyEngine.emit('instance:completed', instance);
    return instance;
  } finally {
    await releaseLock(instanceId);
  }
}

/**
 * Fail a journey instance
 */
export async function failInstance(instanceId, errorDetails = {}) {
  const lockAcquired = await acquireLock(instanceId);
  if (!lockAcquired) {
    throw new Error('Failed to acquire state lock');
  }

  try {
    const sql = `
      UPDATE journey_instances
      SET status = 'failed',
          failed_at = NOW(),
          error_details = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(sql, [instanceId, JSON.stringify(errorDetails)]);
    const instance = result.rows[0];

    journeyEngine.emit('instance:failed', instance);
    return instance;
  } finally {
    await releaseLock(instanceId);
  }
}

/**
 * Rollback journey state
 */
export async function rollbackInstance(instanceId, steps = 1) {
  const sql = `SELECT rollback_journey_state($1, $2) as instance`;
  const result = await query(sql, [instanceId, steps]);
  const instance = result.rows[0]?.instance;

  journeyEngine.emit('instance:rolledback', { instanceId, steps });
  return instance;
}

// ============================================================================
// STEP EXECUTION
// ============================================================================

/**
 * Execute the next step in the journey
 */
export async function executeNextStep(instanceId, context = {}) {
  const instance = await getInstance(instanceId);
  if (!instance) {
    throw new Error(`Journey instance not found: ${instanceId}`);
  }

  if (instance.status !== 'running') {
    throw new Error(`Cannot execute step in status: ${instance.status}`);
  }

  const definition = await getDefinition(instance.definition_id);
  const steps = definition.steps || [];

  if (instance.current_step_index >= steps.length) {
    // All steps completed
    return await completeInstance(instanceId, instance.results || {});
  }

  const step = steps[instance.current_step_index];
  const mergedContext = { ...instance.context, ...context };

  // Record step execution start
  const executionId = await recordStepStart(instanceId, instance.current_step_index, step);

  try {
    // Execute the step (deterministic - executor loaded from registry)
    const result = await executeStep(step, mergedContext, instance);

    // Record step completion
    await recordStepComplete(executionId, result);

    // Update instance progress
    await updateStepProgress(instanceId, instance.current_step_index + 1);

    // Check for state transition triggers
    if (result.trigger) {
      const lockAcquired = await acquireLock(instanceId);
      if (lockAcquired) {
        try {
          await transitionState(instanceId, result.nextState, result.trigger, {
            stepIndex: instance.current_step_index,
            stepSlug: step.slug
          });
        } finally {
          await releaseLock(instanceId);
        }
      }
    }

    journeyEngine.emit('step:completed', { instanceId, step, result });
    return result;
  } catch (error) {
    await recordStepFailed(executionId, error);
    journeyEngine.emit('step:failed', { instanceId, step, error: error.message });

    // Check retry policy
    const instance2 = await getInstance(instanceId);
    if (instance2.retry_count < instance2.max_retries) {
      await incrementRetry(instanceId);
      throw error; // Let caller decide on retry
    } else {
      await failInstance(instanceId, {
        message: error.message,
        step: step.slug,
        stepIndex: instance.current_step_index
      });
      throw error;
    }
  }
}

/**
 * Execute a single step (PURE - no business logic)
 */
async function executeStep(step, context, instance) {
  const { type, config = {} } = step;

  // Get step type from registry
  const stepType = await getStepType(type);
  if (!stepType) {
    throw new Error(`Unknown step type: ${type}`);
  }

  // Get executor from engine
  const executor = journeyEngine.getExecutor(stepType.executor_type);
  if (!executor) {
    throw new Error(`No executor registered for: ${stepType.executor_type}`);
  }

  // Merge configs (default + step-specific)
  const mergedConfig = {
    ...stepType.default_config,
    ...config
  };

  // Execute (deterministic)
  const result = await executor(mergedConfig, context, {
    instance,
    stepType,
    step
  });

  return result;
}

// ============================================================================
// STEP EXECUTION TRACKING
// ============================================================================

async function recordStepStart(instanceId, stepIndex, step) {
  const stepType = await getStepType(step.type);

  const sql = `
    INSERT INTO journey_step_executions (
      instance_id, step_type_id, step_index, step_slug, step_config, status, started_at
    ) VALUES ($1, $2, $3, $4, $5, 'running', NOW())
    RETURNING id
  `;

  const result = await query(sql, [
    instanceId,
    stepType?.id,
    stepIndex,
    step.slug,
    JSON.stringify(step.config || {})
  ]);

  return result.rows[0].id;
}

async function recordStepComplete(executionId, result) {
  const sql = `
    UPDATE journey_step_executions
    SET status = 'completed',
        completed_at = NOW(),
        output_data = $2,
        duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
    WHERE id = $1
  `;

  await query(sql, [executionId, JSON.stringify(result)]);
}

async function recordStepFailed(executionId, error) {
  const sql = `
    UPDATE journey_step_executions
    SET status = 'failed',
        completed_at = NOW(),
        error_type = $2,
        error_message = $3,
        duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
    WHERE id = $1
  `;

  await query(sql, [executionId, error.name, error.message]);
}

async function updateStepProgress(instanceId, completedSteps) {
  const sql = `
    UPDATE journey_instances
    SET current_step_index = $2,
        steps_completed = $2,
        updated_at = NOW()
    WHERE id = $1
  `;

  await query(sql, [instanceId, completedSteps]);
}

async function incrementRetry(instanceId) {
  const sql = `
    UPDATE journey_instances
    SET retry_count = retry_count + 1,
        updated_at = NOW()
    WHERE id = $1
  `;

  await query(sql, [instanceId]);
}

// ============================================================================
// STEP TYPE REGISTRY
// ============================================================================

/**
 * Get all step types
 */
export async function getAllStepTypes(options = {}) {
  const { category, isActive = true } = options;

  let sql = `SELECT * FROM journey_step_types WHERE 1=1`;
  const params = [];
  let paramIndex = 1;

  if (isActive !== null) {
    sql += ` AND is_active = $${paramIndex++}`;
    params.push(isActive);
  }

  if (category) {
    sql += ` AND category = $${paramIndex++}`;
    params.push(category);
  }

  sql += ` ORDER BY category, name`;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get step type by slug
 */
export async function getStepType(slug) {
  const sql = `SELECT * FROM journey_step_types WHERE slug = $1`;
  const result = await query(sql, [slug]);
  return result.rows[0] || null;
}

// ============================================================================
// PRECONDITION & VALIDATOR EVALUATION
// ============================================================================

/**
 * Evaluate a precondition (DETERMINISTIC)
 */
async function evaluatePrecondition(precondition, context) {
  const { type, config = {} } = precondition;

  // Get registered validator
  const validator = journeyEngine.validators.get(type);
  if (validator) {
    return await validator(config, context);
  }

  // Built-in validators (generic, not vertical-specific)
  switch (type) {
    case 'context_has':
      return config.fields.every(field => field in context);

    case 'context_value':
      return evaluateCondition(config.condition, context);

    case 'time_window':
      const now = new Date();
      const start = config.start ? new Date(config.start) : null;
      const end = config.end ? new Date(config.end) : null;
      if (start && now < start) return false;
      if (end && now > end) return false;
      return true;

    default:
      console.warn(`Unknown precondition type: ${type}`);
      return true;
  }
}

/**
 * Evaluate a condition (DETERMINISTIC - generic operators only)
 */
function evaluateCondition(condition, context) {
  const { field, operator, value } = condition;
  const actualValue = getNestedValue(context, field);

  switch (operator) {
    case 'eq':
      return actualValue === value;
    case 'neq':
      return actualValue !== value;
    case 'gt':
      return actualValue > value;
    case 'gte':
      return actualValue >= value;
    case 'lt':
      return actualValue < value;
    case 'lte':
      return actualValue <= value;
    case 'in':
      return Array.isArray(value) && value.includes(actualValue);
    case 'not_in':
      return Array.isArray(value) && !value.includes(actualValue);
    case 'contains':
      return typeof actualValue === 'string' && actualValue.includes(value);
    case 'exists':
      return actualValue !== undefined && actualValue !== null;
    case 'not_exists':
      return actualValue === undefined || actualValue === null;
    default:
      return true;
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// ============================================================================
// REASONING TRACE
// ============================================================================

/**
 * Record reasoning trace for a step
 */
export async function recordReasoningTrace(instanceId, stepIndex, stepSlug, reasoning) {
  const {
    reasoningType,
    evidence = [],
    confidenceScore,
    pathsConsidered = [],
    selectedPath,
    pathWeights = {},
    timeFactors = {},
    decayApplied = false,
    agentsConsulted = [],
    consensusMethod,
    verticalContext = {}
  } = reasoning;

  const sql = `
    INSERT INTO journey_reasoning_trace (
      instance_id, step_index, step_slug, reasoning_type,
      evidence, confidence_score,
      paths_considered, selected_path, path_weights,
      time_factors, decay_applied,
      agents_consulted, consensus_method,
      vertical_context
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `;

  const result = await query(sql, [
    instanceId, stepIndex, stepSlug, reasoningType,
    JSON.stringify(evidence), confidenceScore,
    JSON.stringify(pathsConsidered), selectedPath, JSON.stringify(pathWeights),
    JSON.stringify(timeFactors), decayApplied,
    JSON.stringify(agentsConsulted), consensusMethod,
    JSON.stringify(verticalContext)
  ]);

  return result.rows[0];
}

/**
 * Get reasoning trace for instance
 */
export async function getReasoningTrace(instanceId) {
  const sql = `
    SELECT * FROM journey_reasoning_trace
    WHERE instance_id = $1
    ORDER BY step_index, created_at
  `;

  const result = await query(sql, [instanceId]);
  return result.rows;
}

// ============================================================================
// STATE HISTORY
// ============================================================================

/**
 * Get state history for instance
 */
export async function getStateHistory(instanceId) {
  const sql = `
    SELECT * FROM journey_state_history
    WHERE instance_id = $1
    ORDER BY created_at
  `;

  const result = await query(sql, [instanceId]);
  return result.rows;
}

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * Get journey engine dashboard
 */
export async function getDashboard() {
  const [definitions, instances, stepTypes, recentRuns] = await Promise.all([
    query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active) as active,
        COUNT(*) FILTER (WHERE is_system) as system
      FROM journey_definitions
    `),
    query(`
      SELECT
        status,
        COUNT(*) as count
      FROM journey_instances
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY status
    `),
    query(`
      SELECT
        category,
        COUNT(*) as count
      FROM journey_step_types
      WHERE is_active = true
      GROUP BY category
    `),
    query(`
      SELECT
        ji.id,
        ji.status,
        ji.current_state,
        ji.steps_completed,
        ji.steps_total,
        ji.created_at,
        jd.slug as definition_slug,
        jd.name as definition_name
      FROM journey_instances ji
      JOIN journey_definitions jd ON ji.definition_id = jd.id
      ORDER BY ji.created_at DESC
      LIMIT 10
    `)
  ]);

  const instancesByStatus = {};
  for (const row of instances.rows) {
    instancesByStatus[row.status] = parseInt(row.count);
  }

  const stepTypesByCategory = {};
  for (const row of stepTypes.rows) {
    stepTypesByCategory[row.category] = parseInt(row.count);
  }

  return {
    definitions: {
      total: parseInt(definitions.rows[0].total),
      active: parseInt(definitions.rows[0].active),
      system: parseInt(definitions.rows[0].system)
    },
    instances: {
      byStatus: instancesByStatus
    },
    stepTypes: {
      byCategory: stepTypesByCategory
    },
    recentRuns: recentRuns.rows
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default journeyEngine;
