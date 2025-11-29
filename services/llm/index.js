/**
 * LLM Service Index
 * Sprint 51: LLM Engine Routing
 *
 * Main entry point for LLM services
 */

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
  VERTICAL_MODEL_PREFERENCES,
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
