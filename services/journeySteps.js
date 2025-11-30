/**
 * Journey Steps Library Service
 * Sprint 59: Journey Steps Library
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CRITICAL ARCHITECTURAL RULES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1. STEPS ARE GENERIC EXECUTORS
 *    ─────────────────────────────────────────────────
 *    Each step type is a PURE function that:
 *    • Receives config from DB (not hardcoded)
 *    • Receives context from caller
 *    • Returns deterministic output
 *
 * 2. NO VERTICAL/BUSINESS LOGIC
 *    ─────────────────────────────────────────────────
 *    ✅ CORRECT: Execute discovery based on config.target_type
 *    ❌ FORBIDDEN: if (vertical === 'banking') { special logic }
 *
 * 3. STEP TYPES ARE REGISTERED, NOT CODED
 *    ─────────────────────────────────────────────────
 *    • Step behavior is defined in DB (journey_step_types)
 *    • Executors are generic handlers
 *    • Config determines behavior
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

import { query } from '../db/index.js';
import { journeyEngine } from './journeyEngine.js';
import { getConfig } from './configLoader.js';

// ============================================================================
// STEP EXECUTORS - Register with Journey Engine
// ============================================================================

/**
 * Initialize all step executors
 */
export function initializeStepExecutors() {
  // Discovery executors
  journeyEngine.registerExecutor('discovery', discoveryExecutor);

  // Enrichment executors
  journeyEngine.registerExecutor('enrichment', enrichmentExecutor);

  // Scoring executors
  journeyEngine.registerExecutor('scoring', scoringExecutor);

  // Outreach executors
  journeyEngine.registerExecutor('outreach', outreachExecutor);

  // Control flow executors
  journeyEngine.registerExecutor('conditional', conditionalExecutor);
  journeyEngine.registerExecutor('parallel', parallelExecutor);
  journeyEngine.registerExecutor('wait', waitExecutor);

  // Validation executors
  journeyEngine.registerExecutor('validation', validationExecutor);

  // Notification executors
  journeyEngine.registerExecutor('notification', notificationExecutor);

  // LLM executors
  journeyEngine.registerExecutor('llm', llmExecutor);

  // Custom executors (loaded from config)
  journeyEngine.registerExecutor('custom', customExecutor);

  console.log('[JourneySteps] All executors registered');
}

// ============================================================================
// DISCOVERY EXECUTOR
// ============================================================================

/**
 * Discovery step executor
 * Triggers discovery based on target_type config
 */
async function discoveryExecutor(config, context, meta) {
  const {
    target_type,
    max_results = 100,
    filters = {},
    sources
  } = config;

  // Get discovery config from ConfigLoader
  const discoveryConfig = await getConfig('discovery', target_type, context);

  // Build discovery params (deterministic)
  const params = {
    targetType: target_type,
    maxResults: max_results,
    filters: {
      ...discoveryConfig?.default_filters,
      ...filters
    },
    sources: sources || discoveryConfig?.sources,
    context: {
      vertical: context.vertical,
      territory: context.territory
    }
  };

  // In production, this would call the discovery service
  // For now, return a placeholder result
  const result = {
    success: true,
    targetType: target_type,
    params,
    resultsCount: 0, // Would be populated by actual discovery
    results: [],
    timestamp: new Date().toISOString()
  };

  return result;
}

// ============================================================================
// ENRICHMENT EXECUTOR
// ============================================================================

/**
 * Enrichment step executor
 */
async function enrichmentExecutor(config, context, meta) {
  const {
    sources = [],
    fields = [],
    priority = 'normal',
    schedule
  } = config;

  // Get enrichment config
  const enrichmentConfig = await getConfig('enrichment', 'default', context);

  const params = {
    sources: sources.length > 0 ? sources : enrichmentConfig?.default_sources,
    fields: fields.length > 0 ? fields : enrichmentConfig?.default_fields,
    priority,
    entityType: context.entityType,
    entityId: context.entityId
  };

  // In production, this would call the enrichment service
  const result = {
    success: true,
    params,
    enrichedFields: [],
    sourcesUsed: params.sources,
    timestamp: new Date().toISOString()
  };

  return result;
}

// ============================================================================
// SCORING EXECUTOR
// ============================================================================

/**
 * Scoring step executor
 */
async function scoringExecutor(config, context, meta) {
  const {
    score_types = ['q_score', 't_score', 'l_score'],
    include_e_score = false,
    profile = 'balanced',
    auto_rank = false
  } = config;

  // Get scoring config
  const scoringConfig = await getConfig('scoring', profile, context);

  const allScoreTypes = include_e_score
    ? [...score_types, 'e_score']
    : score_types;

  const params = {
    scoreTypes: allScoreTypes,
    profile,
    weights: scoringConfig?.weights,
    autoRank: auto_rank,
    entityType: context.entityType,
    entityId: context.entityId
  };

  // In production, this would call the scoring service
  const result = {
    success: true,
    params,
    scores: {},
    rank: null,
    timestamp: new Date().toISOString()
  };

  // Check for trigger conditions
  if (context.q_score >= 80) {
    result.trigger = 'score_high';
    result.nextState = 'qualified';
  } else if (context.q_score >= 50) {
    result.trigger = 'score_medium';
    result.nextState = 'nurturing';
  } else if (context.q_score !== undefined) {
    result.trigger = 'score_low';
    result.nextState = 'lost';
  }

  return result;
}

// ============================================================================
// OUTREACH EXECUTOR
// ============================================================================

/**
 * Outreach step executor
 */
async function outreachExecutor(config, context, meta) {
  const {
    tone_pack = 'professional',
    channel = 'email',
    template,
    auto_personalize = false,
    sequence_length = 1
  } = config;

  // Get outreach config
  const outreachConfig = await getConfig('outreach', channel, context);

  const params = {
    tonePack: tone_pack,
    channel,
    template,
    autoPersonalize: auto_personalize,
    sequenceLength: sequence_length,
    recipientType: context.recipientType,
    recipientId: context.recipientId,
    personalization: context.personalization
  };

  // In production, this would call the outreach service
  const result = {
    success: true,
    params,
    messageGenerated: false,
    messageId: null,
    timestamp: new Date().toISOString()
  };

  return result;
}

// ============================================================================
// CONDITIONAL EXECUTOR
// ============================================================================

/**
 * Conditional branch executor
 */
async function conditionalExecutor(config, context, meta) {
  const {
    condition,
    thresholds,
    true_branch,
    false_branch,
    default_branch = 'continue'
  } = config;

  let selectedBranch = default_branch;
  let evaluationResult = null;

  if (condition) {
    // Evaluate single condition
    evaluationResult = evaluateCondition(condition, context);
    selectedBranch = evaluationResult ? (true_branch || 'continue') : (false_branch || 'skip');
  } else if (thresholds) {
    // Evaluate threshold-based branching
    for (const [level, threshold] of Object.entries(thresholds)) {
      const value = getNestedValue(context, thresholds.field || 'score');
      if (value >= threshold) {
        selectedBranch = level;
        break;
      }
    }
  }

  return {
    success: true,
    branch: selectedBranch,
    condition,
    evaluationResult,
    timestamp: new Date().toISOString()
  };
}

/**
 * Evaluate a condition expression
 */
function evaluateCondition(conditionStr, context) {
  // Parse simple conditions like "q_score >= 70"
  const match = conditionStr.match(/^(\w+(?:\.\w+)*)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
  if (!match) return false;

  const [, field, operator, valueStr] = match;
  const actualValue = getNestedValue(context, field);
  const expectedValue = parseValue(valueStr);

  switch (operator) {
    case '>=': return actualValue >= expectedValue;
    case '<=': return actualValue <= expectedValue;
    case '>': return actualValue > expectedValue;
    case '<': return actualValue < expectedValue;
    case '==': return actualValue === expectedValue;
    case '!=': return actualValue !== expectedValue;
    default: return false;
  }
}

function parseValue(valueStr) {
  const trimmed = valueStr.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  const num = Number(trimmed);
  if (!isNaN(num)) return num;
  // Remove quotes if string
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// ============================================================================
// PARALLEL EXECUTOR
// ============================================================================

/**
 * Parallel execution executor
 */
async function parallelExecutor(config, context, meta) {
  const {
    steps = [],
    max_parallel = 5,
    fail_fast = false
  } = config;

  const parallelGroupId = crypto.randomUUID();
  const results = [];
  const errors = [];

  // Execute steps in parallel (respecting max_parallel)
  const batches = [];
  for (let i = 0; i < steps.length; i += max_parallel) {
    batches.push(steps.slice(i, i + max_parallel));
  }

  for (const batch of batches) {
    const batchPromises = batch.map(async (stepSlug, index) => {
      try {
        // In production, this would execute the actual step
        return {
          stepSlug,
          index,
          success: true,
          result: {}
        };
      } catch (error) {
        if (fail_fast) throw error;
        return {
          stepSlug,
          index,
          success: false,
          error: error.message
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (fail_fast && batchResults.some(r => !r.success)) {
      break;
    }
  }

  const allSuccess = results.every(r => r.success);

  return {
    success: allSuccess,
    parallelGroupId,
    results,
    stepsTotal: steps.length,
    stepsCompleted: results.filter(r => r.success).length,
    stepsFailed: results.filter(r => !r.success).length,
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// WAIT EXECUTOR
// ============================================================================

/**
 * Wait/delay executor
 */
async function waitExecutor(config, context, meta) {
  const {
    duration_ms,
    condition,
    timeout_ms = 300000,
    poll_interval_ms = 5000
  } = config;

  if (duration_ms) {
    // Simple delay
    await new Promise(resolve => setTimeout(resolve, duration_ms));
    return {
      success: true,
      waitType: 'delay',
      durationMs: duration_ms,
      timestamp: new Date().toISOString()
    };
  }

  if (condition) {
    // Wait for condition (with timeout)
    const startTime = Date.now();
    let conditionMet = false;

    while (Date.now() - startTime < timeout_ms) {
      conditionMet = evaluateCondition(condition, context);
      if (conditionMet) break;
      await new Promise(resolve => setTimeout(resolve, poll_interval_ms));
    }

    return {
      success: conditionMet,
      waitType: 'condition',
      condition,
      conditionMet,
      elapsedMs: Date.now() - startTime,
      timedOut: !conditionMet,
      timestamp: new Date().toISOString()
    };
  }

  return {
    success: true,
    waitType: 'noop',
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// VALIDATION EXECUTOR
// ============================================================================

/**
 * Validation step executor
 */
async function validationExecutor(config, context, meta) {
  const {
    rules = [],
    required = [],
    fail_on_missing = true
  } = config;

  const validationResults = [];
  let allValid = true;

  // Check required fields
  for (const field of required) {
    const value = getNestedValue(context, field);
    const isValid = value !== undefined && value !== null && value !== '';
    validationResults.push({
      field,
      rule: 'required',
      valid: isValid,
      value: isValid ? undefined : value
    });
    if (!isValid && fail_on_missing) {
      allValid = false;
    }
  }

  // Run validation rules
  for (const rule of rules) {
    const result = await runValidationRule(rule, context);
    validationResults.push(result);
    if (!result.valid) {
      allValid = false;
    }
  }

  return {
    success: allValid,
    validationResults,
    fieldsValidated: validationResults.length,
    fieldsFailed: validationResults.filter(r => !r.valid).length,
    timestamp: new Date().toISOString()
  };
}

async function runValidationRule(rule, context) {
  const { type, field, config: ruleConfig = {} } = rule;

  const value = getNestedValue(context, field);

  switch (type) {
    case 'email_valid':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return { field, rule: type, valid: emailRegex.test(value), value };

    case 'phone_valid':
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      return { field, rule: type, valid: phoneRegex.test(value?.replace(/\D/g, '')), value };

    case 'url_valid':
      try {
        new URL(value);
        return { field, rule: type, valid: true, value };
      } catch {
        return { field, rule: type, valid: false, value };
      }

    case 'min_length':
      return { field, rule: type, valid: (value?.length || 0) >= ruleConfig.min, value };

    case 'max_length':
      return { field, rule: type, valid: (value?.length || 0) <= ruleConfig.max, value };

    case 'regex':
      const regex = new RegExp(ruleConfig.pattern);
      return { field, rule: type, valid: regex.test(value), value };

    case 'in_list':
      return { field, rule: type, valid: ruleConfig.values.includes(value), value };

    default:
      return { field, rule: type, valid: true, value };
  }
}

// ============================================================================
// NOTIFICATION EXECUTOR
// ============================================================================

/**
 * Notification step executor
 */
async function notificationExecutor(config, context, meta) {
  const {
    channel,
    template,
    recipients = [],
    priority = 'normal',
    method = 'POST',
    url
  } = config;

  const notificationParams = {
    channel,
    template,
    recipients: recipients.length > 0 ? recipients : [context.recipientEmail],
    priority,
    data: {
      instanceId: meta.instance?.id,
      stepSlug: meta.step?.slug,
      context: sanitizeContext(context)
    }
  };

  // In production, this would send actual notifications
  let result;

  switch (channel) {
    case 'email':
      result = { sent: true, channel: 'email', messageId: crypto.randomUUID() };
      break;

    case 'webhook':
      result = { sent: true, channel: 'webhook', url, statusCode: 200 };
      break;

    case 'internal':
      result = { sent: true, channel: 'internal', alertId: crypto.randomUUID() };
      break;

    default:
      result = { sent: false, channel, error: 'Unknown channel' };
  }

  return {
    success: result.sent,
    ...result,
    params: notificationParams,
    timestamp: new Date().toISOString()
  };
}

function sanitizeContext(context) {
  // Remove sensitive fields before including in notifications
  const { password, token, apiKey, secret, ...safe } = context;
  return safe;
}

// ============================================================================
// LLM EXECUTOR
// ============================================================================

/**
 * LLM step executor
 */
async function llmExecutor(config, context, meta) {
  const {
    task,
    model_config = {},
    prompt_template,
    max_tokens = 1000,
    temperature = 0.7
  } = config;

  // Get LLM config
  const llmConfig = await getConfig('llm', task || 'default', context);

  const params = {
    task,
    model: model_config.model || llmConfig?.default_model,
    provider: model_config.provider || llmConfig?.default_provider,
    maxTokens: max_tokens,
    temperature,
    prompt: prompt_template
  };

  // In production, this would call the LLM router
  const result = {
    success: true,
    params,
    response: null,
    tokensUsed: 0,
    model: params.model,
    timestamp: new Date().toISOString()
  };

  return result;
}

// ============================================================================
// CUSTOM EXECUTOR
// ============================================================================

/**
 * Custom step executor (for user-defined steps)
 */
async function customExecutor(config, context, meta) {
  const { handler, params = {} } = config;

  // Custom executors are defined in config, not hardcoded
  // In production, this would load and execute a registered handler

  return {
    success: true,
    handler,
    params,
    result: null,
    timestamp: new Date().toISOString()
  };
}

// ============================================================================
// STEP TYPE CRUD
// ============================================================================

/**
 * Create a custom step type
 */
export async function createStepType(data) {
  const {
    slug,
    name,
    description,
    category,
    executorType,
    defaultConfig = {},
    inputSchema = {},
    outputSchema = {},
    requiresLlm = false,
    defaultModelTask,
    modelConfig = {},
    defaultTimeoutMs = 30000,
    supportsAsync = true,
    supportsParallel = false,
    retryable = true,
    defaultMaxRetries = 3,
    verticalSpecific = false,
    regionSpecific = false
  } = data;

  const sql = `
    INSERT INTO journey_step_types (
      slug, name, description, category, executor_type,
      default_config, input_schema, output_schema,
      requires_llm, default_model_task, model_config,
      default_timeout_ms, supports_async, supports_parallel,
      retryable, default_max_retries,
      vertical_specific, region_specific,
      is_system
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, false)
    RETURNING *
  `;

  const result = await query(sql, [
    slug, name, description, category, executorType,
    JSON.stringify(defaultConfig), JSON.stringify(inputSchema), JSON.stringify(outputSchema),
    requiresLlm, defaultModelTask, JSON.stringify(modelConfig),
    defaultTimeoutMs, supportsAsync, supportsParallel,
    retryable, defaultMaxRetries,
    verticalSpecific, regionSpecific
  ]);

  return result.rows[0];
}

/**
 * Update step type
 */
export async function updateStepType(identifier, updates) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  // Get current step type
  const currentSql = isUuid
    ? `SELECT * FROM journey_step_types WHERE id = $1`
    : `SELECT * FROM journey_step_types WHERE slug = $1`;

  const current = await query(currentSql, [identifier]);
  if (current.rows.length === 0) return null;

  if (current.rows[0].is_system) {
    throw new Error('Cannot modify system-defined step type');
  }

  const allowedFields = [
    'name', 'description', 'default_config', 'input_schema', 'output_schema',
    'requires_llm', 'default_model_task', 'model_config',
    'default_timeout_ms', 'supports_async', 'supports_parallel',
    'retryable', 'default_max_retries', 'is_active'
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

  if (setClauses.length === 0) return current.rows[0];

  values.push(current.rows[0].id);

  const sql = `
    UPDATE journey_step_types
    SET ${setClauses.join(', ')}, updated_at = NOW()
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const result = await query(sql, values);
  return result.rows[0];
}

/**
 * Get step execution history for an instance
 */
export async function getStepExecutions(instanceId, options = {}) {
  const { status, limit = 100 } = options;

  let sql = `
    SELECT jse.*, jst.slug as step_type_slug, jst.name as step_type_name
    FROM journey_step_executions jse
    LEFT JOIN journey_step_types jst ON jse.step_type_id = jst.id
    WHERE jse.instance_id = $1
  `;
  const params = [instanceId];
  let paramIndex = 2;

  if (status) {
    sql += ` AND jse.status = $${paramIndex++}`;
    params.push(status);
  }

  sql += ` ORDER BY jse.step_index, jse.created_at LIMIT $${paramIndex}`;
  params.push(limit);

  const result = await query(sql, params);
  return result.rows;
}

// ============================================================================
// BRANCH RULES
// ============================================================================

/**
 * Get branch rules for a step type
 */
export async function getBranchRules(stepTypeId) {
  const sql = `
    SELECT * FROM journey_branch_rules
    WHERE step_type_id = $1 AND is_active = true
    ORDER BY priority
  `;

  const result = await query(sql, [stepTypeId]);
  return result.rows;
}

/**
 * Create branch rule
 */
export async function createBranchRule(stepTypeId, data) {
  const {
    name,
    conditionType,
    conditionConfig,
    trueBranch,
    falseBranch,
    defaultBranch,
    priority = 50
  } = data;

  const sql = `
    INSERT INTO journey_branch_rules (
      step_type_id, name, condition_type, condition_config,
      true_branch, false_branch, default_branch, priority
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const result = await query(sql, [
    stepTypeId, name, conditionType, JSON.stringify(conditionConfig),
    trueBranch, falseBranch, defaultBranch, priority
  ]);

  return result.rows[0];
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Auto-initialize executors on import
initializeStepExecutors();

export default {
  initializeStepExecutors,
  createStepType,
  updateStepType,
  getStepExecutions,
  getBranchRules,
  createBranchRule
};
