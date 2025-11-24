// server/lib/emailIntelligence/index.js
// Email Pattern Intelligence System - Main Export
// Production-grade email enrichment with pgvector RAG

/**
 * Email Pattern Intelligence System
 *
 * A self-learning email pattern discovery system that combines:
 * - RAG (Retrieval-Augmented Generation) with pgvector similarity search
 * - Heuristic rules based on industry and regional conventions
 * - LLM-gated pattern prediction (GPT-4o-mini)
 * - Smart permutation with NeverBounce verification
 *
 * Goal: Fast (8-12s), cheap ($0.03/company), self-learning via RAG + feedback loop
 *
 * Week 1: Database schema + module structure
 * Week 2: RAG implementation + LLM integration
 * Week 3: NeverBounce optimization + production deployment
 */

// Core modules
export { discoverEmailPattern, savePatternToDatabase, incrementPatternUsage } from './orchestrator.js';
export { findSimilarPattern, generateContextEmbedding, backfillPatternEmbeddings } from './rag.js';
export { predictPatternByRules, getRulesConfidenceThreshold, listRules } from './rules.js';
export {
  verifyEmailWithNeverBounce,
  isCatchAllDomain,
  bulkVerifyEmails,
  calculateNeverBounceCost
} from './nb.js';

// Utilities
export {
  calculateFinalConfidence,
  getConfidenceBand,
  meetsConfidenceThreshold,
  calculateWeightedConfidence,
  adjustConfidenceByValidation,
  getConfidenceEmoji
} from './confidence.js';

export {
  checkDomainHealth,
  batchCheckDomains,
  clearExpiredCache
} from './domainHealth.js';

export {
  normalizeName,
  parseName,
  applyPattern,
  generateEmail,
  generateEmailsFromPatterns,
  inferPattern,
  isValidEmailFormat,
  getSupportedPatterns
} from './names.js';

export {
  generatePatternDiscoveryPrompt,
  getSystemPrompt,
  parseLLMResponse,
  generatePatternValidationPrompt,
  calculateLLMCost
} from './prompt.js';

// Telemetry
export {
  recordEnrichmentTelemetry,
  getEnrichmentStats,
  getCostBreakdown,
  getDailyMetrics,
  calculateROI,
  getLayerPerformance
} from './telemetry.js';

// Default export for convenience
export { discoverEmailPattern as default } from './orchestrator.js';

/**
 * Example usage:
 *
 * import { discoverEmailPattern, savePatternToDatabase } from './emailIntelligence';
 *
 * const companyContext = {
 *   name: 'Emirates NBD',
 *   domain: 'emiratesnbd.com',
 *   sector: 'Banking',
 *   region: 'UAE',
 *   company_size: 'Large'
 * };
 *
 * const result = await discoverEmailPattern(companyContext);
 * // result: { pattern: '{first}{l}', confidence: 0.92, source: 'rag', reasoning: '...' }
 *
 * await savePatternToDatabase(companyContext.domain, result);
 */
