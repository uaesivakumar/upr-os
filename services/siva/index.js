/**
 * SIVA Services Index
 * VS2-VS4: AI + Security Services
 *
 * Exports all SIVA service modules for easy import.
 *
 * Authorization Code: VS1-VS9-APPROVED-20251213
 */

// VS2: AI Services
export {
  generateAIQScoreExplanation,
  generateAITScoreExplanation,
  generateAILScoreExplanation,
  generateAIEScoreExplanation,
  generateAICompositeExplanation,
  generateAllExplanations,
} from './aiExplanationService.js';

export {
  generateAIOutreach,
  generateBatchOutreach,
} from './aiOutreachService.js';

// VS3: Prompt Injection Defense
export {
  detectInjection,
  analyzeInputs,
  sanitizeInput,
  sanitizeObject,
  constructSafePrompt,
  promptInjectionMiddleware,
  PromptInjectionError,
} from './promptInjectionDefense.js';

// VS4: Sales Context Enforcement
export {
  validateSalesContext,
  normalizeContext,
  enforceSalesContext,
  withSalesContext,
  isVerticalActive,
  logContextEvent,
  salesContextMiddleware,
  SalesContextError,
  ACTIVE_VERTICALS,
  VALID_SUB_VERTICALS,
  ACTIVE_REGIONS,
} from './salesContextEnforcement.js';
