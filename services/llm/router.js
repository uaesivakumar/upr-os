/**
 * LLM Router Service
 * Sprint 51: LLM Engine Routing
 *
 * Intelligent routing of LLM requests to the best available model
 * based on task type, vertical, cost, and availability.
 *
 * Key Features:
 * - Model selection based on task requirements
 * - Fallback chains for reliability
 * - Conditional routing rules
 * - Vertical-aware model preferences
 * - Cost tracking and budgeting
 * - Response caching
 */

import db from '../../utils/db.js';
import { createProvider } from './providers/index.js';
import crypto from 'crypto';

const { pool } = db;

// Provider instance cache
const providerInstances = new Map();

// ============================================================================
// PROVIDER MANAGEMENT
// ============================================================================

/**
 * Get or create a provider instance
 * @param {string} providerType
 * @param {Object} config
 * @returns {BaseLLMProvider}
 */
function getProviderInstance(providerType, config = {}) {
  const cacheKey = `${providerType}:${JSON.stringify(config)}`;

  if (!providerInstances.has(cacheKey)) {
    const provider = createProvider(providerType, config);
    providerInstances.set(cacheKey, provider);
  }

  return providerInstances.get(cacheKey);
}

/**
 * Get all active providers from database
 */
async function getActiveProviders() {
  const result = await pool.query(`
    SELECT p.*, array_agg(m.slug) as model_slugs
    FROM llm_providers p
    LEFT JOIN llm_models m ON m.provider_id = p.id AND m.is_active = true
    WHERE p.is_active = true
    GROUP BY p.id
    ORDER BY p.slug
  `);
  return result.rows;
}

/**
 * Get model by slug
 */
async function getModel(modelSlug) {
  const result = await pool.query(`
    SELECT m.*, p.slug as provider_slug, p.provider_type
    FROM llm_models m
    JOIN llm_providers p ON m.provider_id = p.id
    WHERE m.slug = $1 AND m.is_active = true
  `, [modelSlug]);
  return result.rows[0];
}

/**
 * Get default model
 */
async function getDefaultModel() {
  const result = await pool.query(`
    SELECT m.*, p.slug as provider_slug, p.provider_type
    FROM llm_models m
    JOIN llm_providers p ON m.provider_id = p.id
    WHERE m.is_default = true AND m.is_active = true
    LIMIT 1
  `);
  return result.rows[0];
}

// ============================================================================
// MODEL SELECTION (selectModel Runtime API)
// ============================================================================

/**
 * Select the best model for a task
 *
 * @param {string} taskType - Task type slug (e.g., 'outreach_generation')
 * @param {Object} options
 * @param {string} [options.vertical] - Vertical context
 * @param {boolean} [options.preferQuality=true] - Prefer quality over cost
 * @param {number} [options.maxCostPer1k] - Maximum cost per 1k tokens
 * @param {boolean} [options.requiresVision] - Requires vision capability
 * @param {boolean} [options.requiresFunctions] - Requires function calling
 * @param {boolean} [options.requiresJson] - Requires JSON mode
 * @returns {Promise<Object>} Selected model info
 */
async function selectModel(taskType, options = {}) {
  const {
    vertical,
    preferQuality = true,
    maxCostPer1k,
    requiresVision = false,
    requiresFunctions = false,
    requiresJson = false
  } = options;

  // First, check routing rules
  const routedModel = await checkRoutingRules(taskType, options);
  if (routedModel) {
    console.log(`[LLMRouter] Rule-based routing selected: ${routedModel.slug}`);
    return routedModel;
  }

  // Check vertical-specific preferences
  const verticalModel = await checkVerticalPreferences(taskType, vertical);
  if (verticalModel) {
    console.log(`[LLMRouter] Vertical preference selected: ${verticalModel.slug}`);
    return verticalModel;
  }

  // Use database function for capability-based selection
  const result = await pool.query(`
    SELECT * FROM select_model_for_task($1, $2, $3, $4)
  `, [taskType, vertical, preferQuality, maxCostPer1k]);

  if (result.rows.length > 0) {
    const selected = result.rows[0];

    // Verify capability requirements
    const model = await getModel(selected.model_slug);

    if (requiresVision && !model.supports_vision) {
      return selectModelWithCapability('vision', options);
    }
    if (requiresFunctions && !model.supports_functions) {
      return selectModelWithCapability('functions', options);
    }
    if (requiresJson && !model.supports_json_mode) {
      return selectModelWithCapability('json', options);
    }

    return {
      ...model,
      selectionReason: selected.selection_reason
    };
  }

  // Fall back to default model
  const defaultModel = await getDefaultModel();
  if (defaultModel) {
    return {
      ...defaultModel,
      selectionReason: 'Default model'
    };
  }

  throw new Error('No suitable model found');
}

/**
 * Select model with specific capability
 */
async function selectModelWithCapability(capability, options = {}) {
  const capabilityColumn = {
    vision: 'supports_vision',
    functions: 'supports_functions',
    json: 'supports_json_mode'
  }[capability];

  const result = await pool.query(`
    SELECT m.*, p.provider_type
    FROM llm_models m
    JOIN llm_providers p ON m.provider_id = p.id
    WHERE m.is_active = true
      AND p.is_active = true
      AND m.${capabilityColumn} = true
    ORDER BY m.priority, m.quality_score DESC
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    throw new Error(`No model found with ${capability} capability`);
  }

  return {
    ...result.rows[0],
    selectionReason: `Required capability: ${capability}`
  };
}

// ============================================================================
// ROUTING RULES (Conditional Routing Engine)
// ============================================================================

/**
 * Check routing rules for model selection
 */
async function checkRoutingRules(taskType, context) {
  const result = await pool.query(`
    SELECT r.*, m.slug as model_slug, m.model_id, p.provider_type
    FROM llm_routing_rules r
    LEFT JOIN llm_models m ON r.target_model_id = m.id
    LEFT JOIN llm_providers p ON m.provider_id = p.id
    WHERE r.is_active = true
    ORDER BY r.priority
  `);

  for (const rule of result.rows) {
    if (evaluateConditions(rule.conditions, { taskType, ...context })) {
      if (rule.target_model_id) {
        const model = await getModel(rule.model_slug);
        return {
          ...model,
          selectionReason: `Routing rule: ${rule.name}`
        };
      }
    }
  }

  return null;
}

/**
 * Evaluate routing conditions
 */
function evaluateConditions(conditions, context) {
  if (!conditions || Object.keys(conditions).length === 0) {
    return false;
  }

  for (const [key, value] of Object.entries(conditions)) {
    switch (key) {
      case 'vertical':
        if (context.vertical !== value) return false;
        break;

      case 'task':
      case 'taskType':
        if (context.taskType !== value) return false;
        break;

      case 'complexity':
        if (context.complexity !== value) return false;
        break;

      case 'token_count_gt':
        if (!context.tokenCount || context.tokenCount <= value) return false;
        break;

      case 'token_count_lt':
        if (!context.tokenCount || context.tokenCount >= value) return false;
        break;

      case 'cost_budget_remaining_lt':
        if (!context.budgetRemaining || context.budgetRemaining >= value) return false;
        break;

      case 'time_of_day':
        const hour = new Date().getHours();
        if (value === 'peak' && (hour < 9 || hour > 17)) return false;
        if (value === 'off_peak' && (hour >= 9 && hour <= 17)) return false;
        break;

      default:
        if (context[key] !== value) return false;
    }
  }

  return true;
}

// ============================================================================
// VERTICAL-AWARE BRANCHING
// ============================================================================

/**
 * Vertical-specific model preferences
 */
const VERTICAL_MODEL_PREFERENCES = {
  banking: {
    outreach_generation: ['claude-3-5-sonnet', 'gpt-4o'], // Better compliance tone
    company_analysis: ['gpt-4o', 'claude-3-opus'], // Thorough analysis
    data_extraction: ['gpt-4o-mini', 'gemini-1-5-flash'] // Cost effective
  },
  insurance: {
    outreach_generation: ['claude-3-5-sonnet', 'gpt-4o'],
    company_analysis: ['gpt-4o', 'claude-3-5-sonnet'],
    data_extraction: ['gpt-4o-mini', 'gemini-1-5-flash']
  },
  saas: {
    outreach_generation: ['gpt-4o', 'claude-3-5-sonnet'], // More casual
    company_analysis: ['claude-3-5-sonnet', 'gpt-4o'],
    data_extraction: ['gemini-1-5-flash', 'gpt-4o-mini'] // Fast
  },
  recruitment: {
    outreach_generation: ['claude-3-5-sonnet', 'gpt-4o'], // Personal touch
    contact_lookup: ['gpt-4o-mini', 'gemini-1-5-flash'],
    data_extraction: ['gpt-4o-mini', 'gemini-1-5-flash']
  },
  real_estate: {
    outreach_generation: ['gpt-4o', 'claude-3-5-sonnet'],
    company_analysis: ['gpt-4o', 'claude-3-5-sonnet'],
    data_extraction: ['gpt-4o-mini', 'gemini-1-5-flash']
  }
};

/**
 * Check vertical-specific model preferences
 */
async function checkVerticalPreferences(taskType, vertical) {
  if (!vertical || !VERTICAL_MODEL_PREFERENCES[vertical]) {
    return null;
  }

  const preferences = VERTICAL_MODEL_PREFERENCES[vertical][taskType];
  if (!preferences || preferences.length === 0) {
    return null;
  }

  // Try each preferred model in order
  for (const modelSlug of preferences) {
    const model = await getModel(modelSlug);
    if (model) {
      return {
        ...model,
        selectionReason: `Vertical preference: ${vertical}/${taskType}`
      };
    }
  }

  return null;
}

// ============================================================================
// FALLBACK CHAIN
// ============================================================================

/**
 * Get fallback chain for a task
 */
async function getFallbackChain(taskType, vertical = null) {
  // Check for task/vertical specific chain
  let result = await pool.query(`
    SELECT fc.*, fcs.model_id, fcs.step_order, fcs.timeout_ms, fcs.max_retries,
           m.slug as model_slug, m.model_id as provider_model_id, p.provider_type
    FROM llm_fallback_chains fc
    JOIN llm_fallback_chain_steps fcs ON fcs.chain_id = fc.id
    JOIN llm_models m ON fcs.model_id = m.id
    JOIN llm_providers p ON m.provider_id = p.id
    WHERE fc.is_active = true
      AND (fc.task_type_id = (SELECT id FROM llm_task_types WHERE slug = $1) OR fc.task_type_id IS NULL)
      AND (fc.vertical = $2 OR fc.vertical IS NULL)
    ORDER BY fc.vertical NULLS LAST, fc.task_type_id NULLS LAST, fcs.step_order
  `, [taskType, vertical]);

  if (result.rows.length === 0) {
    // Fall back to default chain
    result = await pool.query(`
      SELECT fc.*, fcs.model_id, fcs.step_order, fcs.timeout_ms, fcs.max_retries,
             m.slug as model_slug, m.model_id as provider_model_id, p.provider_type
      FROM llm_fallback_chains fc
      JOIN llm_fallback_chain_steps fcs ON fcs.chain_id = fc.id
      JOIN llm_models m ON fcs.model_id = m.id
      JOIN llm_providers p ON m.provider_id = p.id
      WHERE fc.slug = 'default' AND fc.is_active = true
      ORDER BY fcs.step_order
    `);
  }

  return result.rows;
}

/**
 * Execute completion with fallback chain
 */
async function completeWithFallback(messages, options = {}) {
  const {
    taskType = 'chat_response',
    vertical,
    preferQuality = true,
    maxRetries = 3,
    ...completionOptions
  } = options;

  // Get fallback chain
  const chain = await getFallbackChain(taskType, vertical);

  if (chain.length === 0) {
    // No chain, use model selection
    const selectedModel = await selectModel(taskType, { vertical, preferQuality });
    return executeCompletion(selectedModel, messages, completionOptions);
  }

  // Execute chain
  let lastError = null;

  for (const step of chain) {
    for (let attempt = 0; attempt <= step.max_retries; attempt++) {
      try {
        console.log(`[LLMRouter] Trying ${step.model_slug} (attempt ${attempt + 1})`);

        const model = await getModel(step.model_slug);
        const result = await executeCompletionWithTimeout(
          model,
          messages,
          completionOptions,
          step.timeout_ms
        );

        // Record success
        await recordUsage(model.id, taskType, result, {
          vertical,
          wasFallback: step.step_order > 1
        });

        return {
          ...result,
          model: step.model_slug,
          wasFallback: step.step_order > 1,
          fallbackStep: step.step_order
        };

      } catch (error) {
        console.error(`[LLMRouter] ${step.model_slug} failed:`, error.message);
        lastError = error;

        // Check if rate limited
        const provider = getProviderInstance(step.provider_type);
        const rateLimitInfo = provider.parseRateLimitError(error);

        if (rateLimitInfo.isRateLimited && attempt < step.max_retries) {
          // Wait before retry
          await sleep(rateLimitInfo.retryAfterMs || 1000);
          continue;
        }

        // Record failure
        await recordUsage(step.model_id, taskType, null, {
          vertical,
          status: 'error',
          errorMessage: error.message
        });

        break; // Move to next model in chain
      }
    }
  }

  throw lastError || new Error('All models in fallback chain failed');
}

// ============================================================================
// COMPLETION EXECUTION
// ============================================================================

/**
 * Execute a completion
 */
async function executeCompletion(model, messages, options = {}) {
  const provider = getProviderInstance(model.provider_type);

  if (!provider.isReady()) {
    throw new Error(`Provider ${model.provider_type} is not configured`);
  }

  return provider.complete(model.model_id, messages, options);
}

/**
 * Execute completion with timeout
 */
async function executeCompletionWithTimeout(model, messages, options, timeoutMs) {
  return Promise.race([
    executeCompletion(model, messages, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
    )
  ]);
}

/**
 * Execute streaming completion
 */
async function* streamCompletion(model, messages, options = {}) {
  const provider = getProviderInstance(model.provider_type);

  if (!provider.isReady()) {
    throw new Error(`Provider ${model.provider_type} is not configured`);
  }

  yield* provider.streamComplete(model.model_id, messages, options);
}

// ============================================================================
// COST TRACKING
// ============================================================================

/**
 * Record LLM usage for cost tracking
 */
async function recordUsage(modelId, taskType, result, context = {}) {
  try {
    await pool.query(`
      SELECT record_llm_usage($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      modelId,
      taskType,
      result?.inputTokens || 0,
      result?.outputTokens || 0,
      result?.latencyMs || 0,
      context.status || 'success',
      context.vertical || null,
      context.wasFallback || false,
      context.fallbackReason || null,
      context.errorMessage || null
    ]);
  } catch (error) {
    console.error('[LLMRouter] Failed to record usage:', error.message);
  }
}

/**
 * Get cost summary for a period
 */
async function getCostSummary(startDate, endDate, groupBy = 'day') {
  const result = await pool.query(`
    SELECT
      DATE_TRUNC($3, created_at) as period,
      m.slug as model,
      p.name as provider,
      COUNT(*) as requests,
      SUM(total_tokens) as total_tokens,
      SUM(total_cost) as total_cost,
      AVG(latency_ms) as avg_latency
    FROM llm_usage_logs l
    JOIN llm_models m ON l.model_id = m.id
    JOIN llm_providers p ON m.provider_id = p.id
    WHERE l.created_at BETWEEN $1 AND $2
    GROUP BY DATE_TRUNC($3, created_at), m.slug, p.name
    ORDER BY period DESC, total_cost DESC
  `, [startDate, endDate, groupBy]);

  return result.rows;
}

// ============================================================================
// RESPONSE CACHING
// ============================================================================

/**
 * Generate cache key
 */
function generateCacheKey(modelId, messages, options) {
  const content = JSON.stringify({ modelId, messages, options });
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Check cache for response
 */
async function checkCache(modelId, messages, options) {
  const cacheKey = generateCacheKey(modelId, messages, options);

  const result = await pool.query(`
    UPDATE llm_response_cache
    SET hit_count = hit_count + 1, last_hit_at = NOW()
    WHERE cache_key = $1 AND expires_at > NOW()
    RETURNING response_text, response_tokens
  `, [cacheKey]);

  if (result.rows.length > 0) {
    return {
      content: result.rows[0].response_text,
      cached: true,
      tokens: result.rows[0].response_tokens
    };
  }

  return null;
}

/**
 * Store response in cache
 */
async function cacheResponse(modelId, messages, options, response, ttlMinutes = 60) {
  const cacheKey = generateCacheKey(modelId, messages, options);
  const promptHash = crypto.createHash('sha256')
    .update(JSON.stringify(messages))
    .digest('hex');
  const paramsHash = crypto.createHash('sha256')
    .update(JSON.stringify(options))
    .digest('hex');

  try {
    await pool.query(`
      INSERT INTO llm_response_cache
        (cache_key, model_id, prompt_hash, parameters_hash, response_text, response_tokens, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '${ttlMinutes} minutes')
      ON CONFLICT (cache_key) DO UPDATE SET
        response_text = EXCLUDED.response_text,
        response_tokens = EXCLUDED.response_tokens,
        expires_at = EXCLUDED.expires_at,
        hit_count = 0
    `, [cacheKey, modelId, promptHash, paramsHash, response.content, response.outputTokens]);
  } catch (error) {
    console.error('[LLMRouter] Failed to cache response:', error.message);
  }
}

/**
 * Complete with caching
 */
async function completeWithCache(messages, options = {}) {
  const { taskType = 'chat_response', useCache = true, cacheTtl = 60, ...restOptions } = options;

  // Select model first
  const model = await selectModel(taskType, restOptions);

  // Check cache
  if (useCache) {
    const cached = await checkCache(model.id, messages, restOptions);
    if (cached) {
      console.log('[LLMRouter] Cache hit');
      return {
        ...cached,
        model: model.slug,
        inputTokens: 0,
        outputTokens: cached.tokens || 0,
        latencyMs: 0
      };
    }
  }

  // Execute completion
  const result = await completeWithFallback(messages, { taskType, ...restOptions });

  // Cache response
  if (useCache && result.content) {
    await cacheResponse(model.id, messages, restOptions, result, cacheTtl);
  }

  return result;
}

// ============================================================================
// HEALTH & BENCHMARKS
// ============================================================================

/**
 * Check health of all providers
 */
async function checkAllProvidersHealth() {
  const providers = await getActiveProviders();
  const results = [];

  for (const provider of providers) {
    const instance = getProviderInstance(provider.provider_type);
    const health = await instance.healthCheck();
    results.push({
      provider: provider.slug,
      ...health
    });
  }

  return results;
}

/**
 * Get model benchmarks
 */
async function getModelBenchmarks(modelSlug = null) {
  const query = modelSlug
    ? `SELECT * FROM llm_model_benchmarks WHERE model_id = (SELECT id FROM llm_models WHERE slug = $1) ORDER BY benchmark_date DESC`
    : `SELECT b.*, m.slug as model_slug FROM llm_model_benchmarks b JOIN llm_models m ON b.model_id = m.id ORDER BY m.slug, benchmark_date DESC`;

  const result = await pool.query(query, modelSlug ? [modelSlug] : []);
  return result.rows;
}

/**
 * Record benchmark result
 */
async function recordBenchmark(modelSlug, taskType, metrics) {
  const model = await getModel(modelSlug);
  if (!model) throw new Error(`Model not found: ${modelSlug}`);

  await pool.query(`
    INSERT INTO llm_model_benchmarks
      (model_id, task_type_id, benchmark_name, score, latency_p50_ms, latency_p95_ms, latency_p99_ms, accuracy_score, relevance_score, coherence_score, cost_per_1k_tokens, tokens_per_second)
    VALUES
      ($1, (SELECT id FROM llm_task_types WHERE slug = $2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [
    model.id,
    taskType,
    metrics.benchmarkName || 'general',
    metrics.score,
    metrics.latencyP50,
    metrics.latencyP95,
    metrics.latencyP99,
    metrics.accuracy,
    metrics.relevance,
    metrics.coherence,
    metrics.costPer1k,
    metrics.tokensPerSecond
  ]);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // Model selection
  selectModel,
  selectModelWithCapability,

  // Completion
  executeCompletion,
  streamCompletion,
  completeWithFallback,
  completeWithCache,

  // Fallback chain
  getFallbackChain,

  // Routing
  checkRoutingRules,
  checkVerticalPreferences,
  VERTICAL_MODEL_PREFERENCES,

  // Cost tracking
  recordUsage,
  getCostSummary,

  // Caching
  checkCache,
  cacheResponse,

  // Health & benchmarks
  checkAllProvidersHealth,
  getModelBenchmarks,
  recordBenchmark,

  // Provider management
  getProviderInstance,
  getActiveProviders,
  getModel,
  getDefaultModel
};
