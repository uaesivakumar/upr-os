/**
 * Sales-Bench v1 Module
 * PRD v1.3 Appendix
 *
 * Behavioral evaluation system for SIVA.
 * Advisory only - never alters SIVA runtime behavior.
 *
 * @module os/sales-bench
 */

// Types
export {
  PATH_TYPES,
  SUCCESS_CONDITIONS,
  HARD_OUTCOMES,
  computeScenarioHash,
  verifyScenarioHash,
  validateScenario,
  createScenario,
} from './types/scenario.js';

export {
  generateRunSeed,
  createScenarioRun,
  addConversationTurn,
  completeRun,
  recordPolicyGate,
  recordFailureTrigger,
  validateReplay,
} from './types/scenario-run.js';

// S243: Buyer Bot types
export {
  BOT_CATEGORIES,
  HIDDEN_STATE_TYPES,
  FAILURE_TRIGGER_TYPES,
  createBuyerBot,
  createBotVariant,
  applyVariant,
  checkFailureTriggers,
  generateTurnSeed,
} from './types/buyer-bot.js';

// S243: Buyer Bot engine
export {
  generateBotResponse,
  shouldEndConversation,
  analyzeBuyingSignals,
} from './engine/buyer-bot-engine.js';

// S244: Mandatory Adversarial Bots
export {
  MANDATORY_ADVERSARIAL_BOTS,
  getMandatoryBotsForContext,
  seedMandatoryBots,
  validateMandatoryCoverage,
  getKillPathRequiredBots,
  getGoldenPathMinimumBots,
} from './bots/mandatory-adversarial.js';

// S245: CRS Foundation
export {
  CRS_DIMENSIONS,
  CRS_WEIGHTS,
  SCORE_RANGES,
  createCRSScore,
  getRating,
  calibrateCRSScore,
  compareCRSScores,
  calculateCRSAggregates,
  validateScoreThresholds,
} from './types/crs.js';

// S246: Dimension Scoring
export {
  scoreConversation,
  getDimensionInfo,
} from './engine/dimension-scorer.js';

// S247: Golden & Kill Path Execution
export {
  executeScenario,
  executeGoldenPath,
  executeKillPath,
  executeBatch,
} from './engine/path-executor.js';

// S248: Human Calibration
export {
  spearmanCorrelation,
  calculateCalibrationStats,
  prepareForCalibration,
  validateCalibrationSubmission,
  calculateInterRaterReliability,
  getCalibrationQuality,
  CALIBRATION_THRESHOLDS,
} from './calibration/calibration-engine.js';

// Guards
export {
  SALES_BENCH_CONTEXT,
  assertOperationAllowed,
  assertTableAccess,
  assertIsolatedContext,
  assertNoEnvelopeModification,
  assertNoPersonaModification,
  assertNoPolicyBypass,
  assertNoProductionImpact,
  assertCRSAdvisoryOnly,
  enforceAuthorityInvariance,
  withAuthorityGuard,
  AuthorityInvarianceError,
} from './guards/authority-invariance.js';

/**
 * Sales-Bench module metadata
 */
export const SALES_BENCH_META = Object.freeze({
  version: '1.0.0',
  prdVersion: '1.3',
  prdSection: 'Appendix',
  status: 'FOUNDATION',
  authorityRule: 'Sales-Bench is advisory only. CRS never alters SIVA runtime.',
  clarifications: {
    correlation: 'Spearman rank, same vertical+sub_vertical, n≥30, scenario-level',
    buyerBotDeterminism: 'Seed per ScenarioRun, persist seed, replay identical',
    advisoryRule: 'CRS never alters SIVA runtime behavior or decisioning',
  },
});

/**
 * Quick reference for PRD v1.3 compliance
 */
export const PRD_V13_COMPLIANCE = Object.freeze({
  '§0': 'Purpose & Scope - Sales-Bench is offline/simulated only',
  '§1.2': 'Authority Invariance - Cannot modify envelopes, personas, policies',
  '§2.1': 'SalesScenario - Versioned, immutable, replayable',
  '§3.1': 'Hard Outcomes - PASS/FAIL/BLOCK precedence',
  '§4.2': 'CRS Dimensions - 8 dimensions with fixed weights',
  '§5': 'Buyer Bots - Constitutional test harnesses',
  '§6': 'Golden/Kill Paths - Step-wise vs refusal',
  '§7.3': 'Cross-vertical aggregation forbidden',
  '§8': 'Governance - CRS is internal, advisory only',
});
