/**
 * LLM Service Index
 * Sprint 51: LLM Engine Routing
 *
 * Main entry point for LLM services
 */

import { pool } from '../../utils/db.js';

// ============================================================================
// TASK-TO-MODEL MAPPINGS
// ============================================================================

/**
 * Get all task-to-model mappings from database
 */
export async function getTaskMappings(verticalSlug = null) {
  let sql = `
    SELECT
      vertical_slug,
      task_type,
      provider_slug,
      model_slug,
      fallback_provider_slug,
      fallback_model_slug,
      temperature,
      max_tokens,
      timeout_seconds,
      is_active,
      priority
    FROM vertical_model_preferences
    WHERE is_active = true
  `;
  const params = [];

  if (verticalSlug) {
    sql += ` AND vertical_slug = $1`;
    params.push(verticalSlug);
  }

  sql += ` ORDER BY vertical_slug, priority, task_type`;

  const result = await pool.query(sql, params);
  return result.rows;
}

// Re-export from router
export {
  selectModel,
  selectModelWithCapability,
  executeCompletion,
  streamCompletion,
  completeWithFallback,
  completeWithCache,
  getFallbackChain,
  checkRoutingRules,
  checkVerticalPreferences,
  loadVerticalModelPreferences,
  invalidateVerticalPreferencesCache,
  recordUsage,
  getCostSummary,
  checkCache,
  cacheResponse,
  checkAllProvidersHealth,
  getModelBenchmarks,
  recordBenchmark,
  getProviderInstance,
  getActiveProviders,
  getModel,
  getDefaultModel
} from './router.js';

// Re-export from journeyState
export {
  startJourney,
  getJourneyState,
  updateStep,
  completeJourney,
  addToHistory,
  getHistory,
  recordTokenUsage,
  pauseJourney,
  resumeJourney,
  canResume,
  abortJourney,
  cleanupJourney,
  forceAbortStale,
  listActiveJourneys,
  listPausedJourneys,
  getJourneyMetrics
} from './journeyState.js';

// Re-export providers
export {
  BaseLLMProvider,
  OpenAIProvider,
  AnthropicProvider,
  VertexAIProvider,
  createProvider,
  getAvailableProviders
} from './providers/index.js';
