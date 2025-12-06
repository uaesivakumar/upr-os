/**
 * UPR OS LLM Router API
 * Sprint 51: LLM Engine Routing
 *
 * Endpoints for LLM model selection, completion, routing,
 * cost tracking, and journey management.
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import {
  createOSResponse,
  createOSError,
  getTenantId,
  generateRequestId
} from './types.js';
import * as llmService from '../../services/llm/index.js';

const router = express.Router();

// ============================================================================
// MODEL SELECTION ENDPOINTS
// ============================================================================

/**
 * POST /api/os/llm/select
 * Select the best model for a task (selectModel Runtime API)
 *
 * Request body:
 * {
 *   "task_type": "outreach_generation",
 *   "vertical": "banking",
 *   "prefer_quality": true,
 *   "max_cost_per_1k": 0.05,
 *   "requires_vision": false,
 *   "requires_functions": false
 * }
 */
router.post('/select', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const {
      task_type,
      vertical,
      prefer_quality = true,
      max_cost_per_1k,
      requires_vision,
      requires_functions,
      requires_json
    } = req.body;

    if (!task_type) {
      return res.status(400).json(createOSError({
        error: 'task_type is required',
        code: 'OS_LLM_INVALID_INPUT',
        endpoint: '/api/os/llm/select',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const selectedModel = await llmService.selectModel(task_type, {
      vertical,
      preferQuality: prefer_quality,
      maxCostPer1k: max_cost_per_1k,
      requiresVision: requires_vision,
      requiresFunctions: requires_functions,
      requiresJson: requires_json
    });

    res.json(createOSResponse({
      success: true,
      data: {
        model: {
          slug: selectedModel.slug,
          name: selectedModel.name,
          provider: selectedModel.provider_type,
          model_id: selectedModel.model_id,
          quality_score: selectedModel.quality_score,
          input_cost_per_million: selectedModel.input_cost_per_million,
          output_cost_per_million: selectedModel.output_cost_per_million
        },
        selection_reason: selectedModel.selectionReason
      },
      reason: `Selected ${selectedModel.slug} for ${task_type}`,
      confidence: 95,
      endpoint: '/api/os/llm/select',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error selecting model:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_SELECT_ERROR',
      endpoint: '/api/os/llm/select',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/llm/models
 * List all available models
 */
router.get('/models', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const providers = await llmService.getActiveProviders();

    res.json(createOSResponse({
      success: true,
      data: {
        providers: providers.map(p => ({
          slug: p.slug,
          name: p.name,
          type: p.provider_type,
          models: p.model_slugs?.filter(Boolean) || []
        })),
        total_providers: providers.length
      },
      reason: `Found ${providers.length} active providers`,
      confidence: 100,
      endpoint: '/api/os/llm/models',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error listing models:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_MODELS_ERROR',
      endpoint: '/api/os/llm/models',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/llm/models/:slug
 * Get model details
 */
router.get('/models/:slug', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const model = await llmService.getModel(slug);

    if (!model) {
      return res.status(404).json(createOSError({
        error: `Model not found: ${slug}`,
        code: 'OS_LLM_MODEL_NOT_FOUND',
        endpoint: `/api/os/llm/models/${slug}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: model,
      reason: `Model details for ${slug}`,
      confidence: 100,
      endpoint: `/api/os/llm/models/${slug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error getting model:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_MODEL_ERROR',
      endpoint: `/api/os/llm/models/${req.params.slug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// COMPLETION ENDPOINTS
// ============================================================================

/**
 * POST /api/os/llm/complete
 * Execute a completion with automatic model selection and fallback
 *
 * Request body:
 * {
 *   "messages": [{"role": "user", "content": "Hello"}],
 *   "task_type": "chat_response",
 *   "vertical": "banking",
 *   "options": {
 *     "temperature": 0.7,
 *     "max_tokens": 1000,
 *     "use_cache": true
 *   }
 * }
 */
router.post('/complete', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const {
      messages,
      task_type = 'chat_response',
      vertical,
      model: preferredModel,
      options = {}
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json(createOSError({
        error: 'messages array is required',
        code: 'OS_LLM_INVALID_INPUT',
        endpoint: '/api/os/llm/complete',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    let result;

    if (preferredModel) {
      // Use specific model
      const model = await llmService.getModel(preferredModel);
      if (!model) {
        return res.status(404).json(createOSError({
          error: `Model not found: ${preferredModel}`,
          code: 'OS_LLM_MODEL_NOT_FOUND',
          endpoint: '/api/os/llm/complete',
          executionTimeMs: Date.now() - startTime,
          requestId
        }));
      }
      result = await llmService.executeCompletion(model, messages, options);
      result.model = preferredModel;
    } else {
      // Use automatic selection with fallback
      result = await llmService.completeWithCache(messages, {
        taskType: task_type,
        vertical,
        useCache: options.use_cache !== false,
        ...options
      });
    }

    res.json(createOSResponse({
      success: true,
      data: {
        content: result.content,
        model: result.model,
        usage: {
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          total_tokens: result.inputTokens + result.outputTokens
        },
        latency_ms: result.latencyMs,
        cached: result.cached || false,
        was_fallback: result.wasFallback || false
      },
      reason: result.cached ? 'Response from cache' : `Completed with ${result.model}`,
      confidence: 100,
      endpoint: '/api/os/llm/complete',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error completing:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_COMPLETE_ERROR',
      endpoint: '/api/os/llm/complete',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// FALLBACK CHAIN ENDPOINTS
// ============================================================================

/**
 * GET /api/os/llm/fallback-chains
 * List fallback chains
 */
router.get('/fallback-chains', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { task_type, vertical } = req.query;
    const chain = await llmService.getFallbackChain(task_type, vertical);

    res.json(createOSResponse({
      success: true,
      data: {
        chain: chain.map(step => ({
          step_order: step.step_order,
          model: step.model_slug,
          provider: step.provider_type,
          timeout_ms: step.timeout_ms,
          max_retries: step.max_retries
        })),
        total_steps: chain.length
      },
      reason: `Fallback chain with ${chain.length} steps`,
      confidence: 100,
      endpoint: '/api/os/llm/fallback-chains',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error getting fallback chains:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_CHAINS_ERROR',
      endpoint: '/api/os/llm/fallback-chains',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// TASK-TO-MODEL MAPPING ENDPOINTS
// ============================================================================

/**
 * GET /api/os/llm/task-mappings
 * Get vertical model preferences (Task-to-Model Mapping) from database
 */
router.get('/task-mappings', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const mappings = await llmService.getTaskMappings();

    res.json(createOSResponse({
      success: true,
      data: {
        mappings,
        total: mappings.length,
        verticals: [...new Set(mappings.map(m => m.vertical_slug))]
      },
      reason: `Found ${mappings.length} task mappings`,
      confidence: 100,
      endpoint: '/api/os/llm/task-mappings',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error getting task mappings:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_MAPPINGS_ERROR',
      endpoint: '/api/os/llm/task-mappings',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// COST TRACKING ENDPOINTS
// ============================================================================

/**
 * GET /api/os/llm/costs
 * Get cost summary
 */
router.get('/costs', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const {
      start_date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end_date = new Date().toISOString(),
      group_by = 'day'
    } = req.query;

    const summary = await llmService.getCostSummary(
      new Date(start_date),
      new Date(end_date),
      group_by
    );

    const totalCost = summary.reduce((sum, row) => sum + parseFloat(row.total_cost || 0), 0);
    const totalTokens = summary.reduce((sum, row) => sum + parseInt(row.total_input_tokens || 0) + parseInt(row.total_output_tokens || 0), 0);

    res.json(createOSResponse({
      success: true,
      data: {
        summary,
        totals: {
          cost: totalCost,
          tokens: totalTokens,
          requests: summary.reduce((sum, row) => sum + parseInt(row.request_count || 0), 0)
        },
        period: {
          start: start_date,
          end: end_date,
          group_by
        }
      },
      reason: `Cost summary from ${start_date} to ${end_date}`,
      confidence: 100,
      endpoint: '/api/os/llm/costs',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error getting costs:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_COSTS_ERROR',
      endpoint: '/api/os/llm/costs',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// BENCHMARK ENDPOINTS
// ============================================================================

/**
 * GET /api/os/llm/benchmarks
 * Get model benchmarks
 */
router.get('/benchmarks', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { model } = req.query;
    const benchmarks = await llmService.getModelBenchmarks(model);

    res.json(createOSResponse({
      success: true,
      data: {
        benchmarks,
        total: benchmarks.length
      },
      reason: model ? `Benchmarks for ${model}` : 'All model benchmarks',
      confidence: 100,
      endpoint: '/api/os/llm/benchmarks',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error getting benchmarks:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_BENCHMARKS_ERROR',
      endpoint: '/api/os/llm/benchmarks',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/llm/benchmarks
 * Record a benchmark result
 */
router.post('/benchmarks', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { model, task_type, metrics } = req.body;

    if (!model || !metrics) {
      return res.status(400).json(createOSError({
        error: 'model and metrics are required',
        code: 'OS_LLM_INVALID_INPUT',
        endpoint: '/api/os/llm/benchmarks',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    await llmService.recordBenchmark(model, task_type, metrics);

    res.json(createOSResponse({
      success: true,
      data: { recorded: true },
      reason: `Recorded benchmark for ${model}`,
      confidence: 100,
      endpoint: '/api/os/llm/benchmarks',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error recording benchmark:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_BENCHMARK_ERROR',
      endpoint: '/api/os/llm/benchmarks',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// JOURNEY ENDPOINTS
// ============================================================================

/**
 * POST /api/os/llm/journeys
 * Start a new journey
 */
router.post('/journeys', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { journey_id, initial_step, state_data, model } = req.body;

    if (!journey_id || !initial_step) {
      return res.status(400).json(createOSError({
        error: 'journey_id and initial_step are required',
        code: 'OS_LLM_INVALID_INPUT',
        endpoint: '/api/os/llm/journeys',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const journey = await llmService.startJourney({
      journeyId: journey_id,
      initialStep: initial_step,
      stateData: state_data,
      modelSlug: model
    });

    res.json(createOSResponse({
      success: true,
      data: journey,
      reason: `Started journey ${journey_id}`,
      confidence: 100,
      endpoint: '/api/os/llm/journeys',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error starting journey:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_JOURNEY_START_ERROR',
      endpoint: '/api/os/llm/journeys',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/llm/journeys/:journeyId
 * Get journey state
 */
router.get('/journeys/:journeyId', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { journeyId } = req.params;
    const journey = await llmService.getJourneyState(journeyId);

    if (!journey) {
      return res.status(404).json(createOSError({
        error: `Journey not found: ${journeyId}`,
        code: 'OS_LLM_JOURNEY_NOT_FOUND',
        endpoint: `/api/os/llm/journeys/${journeyId}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: journey,
      reason: `Journey state for ${journeyId}`,
      confidence: 100,
      endpoint: `/api/os/llm/journeys/${journeyId}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error getting journey:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_JOURNEY_ERROR',
      endpoint: `/api/os/llm/journeys/${req.params.journeyId}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/llm/journeys/:journeyId/pause
 * Pause a journey
 */
router.post('/journeys/:journeyId/pause', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { journeyId } = req.params;
    const { reason } = req.body;

    const journey = await llmService.pauseJourney(journeyId, reason);

    res.json(createOSResponse({
      success: true,
      data: journey,
      reason: `Paused journey ${journeyId}`,
      confidence: 100,
      endpoint: `/api/os/llm/journeys/${journeyId}/pause`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error pausing journey:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_JOURNEY_PAUSE_ERROR',
      endpoint: `/api/os/llm/journeys/${req.params.journeyId}/pause`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/llm/journeys/:journeyId/resume
 * Resume a paused journey
 */
router.post('/journeys/:journeyId/resume', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { journeyId } = req.params;
    const { from_checkpoint = true, override_step } = req.body;

    const journey = await llmService.resumeJourney(journeyId, {
      fromCheckpoint: from_checkpoint,
      overrideStep: override_step
    });

    res.json(createOSResponse({
      success: true,
      data: journey,
      reason: `Resumed journey ${journeyId}`,
      confidence: 100,
      endpoint: `/api/os/llm/journeys/${journeyId}/resume`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error resuming journey:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_JOURNEY_RESUME_ERROR',
      endpoint: `/api/os/llm/journeys/${req.params.journeyId}/resume`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/llm/journeys/:journeyId/abort
 * Abort a journey
 */
router.post('/journeys/:journeyId/abort', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { journeyId } = req.params;
    const { reason, cleanup = true } = req.body;

    if (!reason) {
      return res.status(400).json(createOSError({
        error: 'reason is required',
        code: 'OS_LLM_INVALID_INPUT',
        endpoint: `/api/os/llm/journeys/${journeyId}/abort`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const journey = await llmService.abortJourney(journeyId, reason, { cleanup });

    res.json(createOSResponse({
      success: true,
      data: journey,
      reason: `Aborted journey ${journeyId}`,
      confidence: 100,
      endpoint: `/api/os/llm/journeys/${journeyId}/abort`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Error aborting journey:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_LLM_JOURNEY_ABORT_ERROR',
      endpoint: `/api/os/llm/journeys/${req.params.journeyId}/abort`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// HEALTH ENDPOINT
// ============================================================================

/**
 * GET /api/os/llm/health
 * Health check for LLM services
 */
router.get('/health', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { check_providers = 'false' } = req.query;

    let providerHealth = null;
    if (check_providers === 'true') {
      providerHealth = await llmService.checkAllProvidersHealth();
    }

    res.json(createOSResponse({
      success: true,
      data: {
        status: 'healthy',
        service: 'os-llm',
        providers: providerHealth
      },
      reason: 'LLM service healthy',
      confidence: 100,
      endpoint: '/api/os/llm/health',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:LLM] Health check error:', error);

    res.status(503).json(createOSError({
      error: error.message,
      code: 'OS_LLM_HEALTH_ERROR',
      endpoint: '/api/os/llm/health',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

export default router;
