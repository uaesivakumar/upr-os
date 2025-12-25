/**
 * NBA Reasoning Enhancer
 *
 * S266-F3: NBA Reasoning Enhancement (NOT DECISION)
 *
 * ALLOWED changes:
 * - Tone of recommendation
 * - Urgency phrasing
 * - Follow-up framing
 * - Escalation hints (copy only)
 *
 * FORBIDDEN changes:
 * - Action selection logic
 * - Persona routing logic
 * - Scoring weights
 * - Multi-action output
 *
 * NBA must still return: { action: ONE, reasoning: TEXT }
 *
 * BTE context influences HOW we explain, not WHAT we recommend.
 */

import {
  URGENCY_LEVELS,
  MOMENTUM_TRENDS,
  EXECUTION_HEALTH,
} from './behavior-context.js';

// ============================================================
// REASONING TEMPLATES
// ============================================================

/**
 * Urgency prefixes based on urgency_level.
 * These modify the TONE, not the action.
 */
const URGENCY_PREFIXES = {
  [URGENCY_LEVELS.LOW]: '',
  [URGENCY_LEVELS.MEDIUM]: 'Time-sensitive: ',
  [URGENCY_LEVELS.HIGH]: 'URGENT: ',
};

/**
 * Urgency suffixes for follow-up framing.
 */
const URGENCY_SUFFIXES = {
  [URGENCY_LEVELS.LOW]: '',
  [URGENCY_LEVELS.MEDIUM]: ' Consider prioritizing this soon.',
  [URGENCY_LEVELS.HIGH]: ' Immediate attention recommended to avoid missed opportunity.',
};

/**
 * Hesitation acknowledgments.
 * Added when hesitation_flag is true.
 */
const HESITATION_ACKNOWLEDGMENTS = [
  'We noticed some uncertainty in recent actions.',
  'Take your time to evaluate this recommendation.',
  'If unsure, reviewing the supporting data may help.',
];

/**
 * Momentum encouragements.
 */
const MOMENTUM_PHRASES = {
  [MOMENTUM_TRENDS.POSITIVE]: ' You\'re building good momentum - keep it up!',
  [MOMENTUM_TRENDS.NEUTRAL]: '',
  [MOMENTUM_TRENDS.NEGATIVE]: ' This could help re-establish momentum.',
};

/**
 * Execution health notes.
 */
const HEALTH_NOTES = {
  [EXECUTION_HEALTH.GREEN]: '',
  [EXECUTION_HEALTH.YELLOW]: ' (Note: Recent execution patterns suggest room for improvement.)',
  [EXECUTION_HEALTH.RED]: ' (Alert: Execution metrics indicate attention needed.)',
};

// ============================================================
// ENHANCER FUNCTIONS
// ============================================================

/**
 * Enhance NBA reasoning with behavioral context.
 *
 * CRITICAL: This function NEVER changes the action.
 * It only modifies the reasoning text.
 *
 * @param {Object} nbaOutput - Original NBA output { action, reasoning }
 * @param {Object} behaviorContext - BTE behavior context
 * @returns {Object} Enhanced NBA output { action, reasoning }
 */
export function enhanceReasoning(nbaOutput, behaviorContext) {
  // Guard: If no context, return original unchanged
  if (!behaviorContext) {
    return nbaOutput;
  }

  // CRITICAL: Action is NEVER modified
  const action = nbaOutput.action;
  let reasoning = nbaOutput.reasoning;

  // Apply urgency prefix
  const urgencyLevel = behaviorContext.urgency_level || URGENCY_LEVELS.LOW;
  const urgencyPrefix = URGENCY_PREFIXES[urgencyLevel] || '';
  if (urgencyPrefix) {
    reasoning = urgencyPrefix + reasoning;
  }

  // Apply momentum phrase
  const momentum = behaviorContext.momentum || MOMENTUM_TRENDS.NEUTRAL;
  const momentumPhrase = MOMENTUM_PHRASES[momentum] || '';
  if (momentumPhrase) {
    reasoning = reasoning + momentumPhrase;
  }

  // Apply urgency suffix
  const urgencySuffix = URGENCY_SUFFIXES[urgencyLevel] || '';
  if (urgencySuffix) {
    reasoning = reasoning + urgencySuffix;
  }

  // Apply health note
  const health = behaviorContext.execution_health || EXECUTION_HEALTH.GREEN;
  const healthNote = HEALTH_NOTES[health] || '';
  if (healthNote) {
    reasoning = reasoning + healthNote;
  }

  // Apply hesitation acknowledgment (only if flag is true)
  if (behaviorContext.hesitation_flag === true) {
    const hesitationNote = HESITATION_ACKNOWLEDGMENTS[
      Math.floor(Date.now() / 86400000) % HESITATION_ACKNOWLEDGMENTS.length
    ];
    reasoning = reasoning + ' ' + hesitationNote;
  }

  return {
    action,  // UNCHANGED - this is the critical constraint
    reasoning,
    _enhanced: true,
    _context_applied: {
      urgency: urgencyLevel,
      hesitation: behaviorContext.hesitation_flag,
      momentum,
      health,
    },
  };
}

/**
 * Process NBA with optional behavior context.
 *
 * This is the main entry point for NBA processing with BTE integration.
 * It ensures:
 * 1. NBA core logic runs first (action selection)
 * 2. BTE context only modifies reasoning (enhancement)
 *
 * @param {Function} nbaCoreFunction - Core NBA function (input) => { action, reasoning }
 * @param {Object} nbaInput - NBA input (without behavior_context)
 * @param {Object} [behaviorContext] - Optional BTE behavior context
 * @returns {Promise<Object>} NBA output with enhanced reasoning
 */
export async function processNBAWithContext(nbaCoreFunction, nbaInput, behaviorContext) {
  // Step 1: Run core NBA logic (deterministic action selection)
  // BTE context is NOT passed to core logic
  const coreOutput = await nbaCoreFunction(nbaInput);

  // Step 2: Enhance reasoning with BTE context (optional)
  if (behaviorContext) {
    return enhanceReasoning(coreOutput, behaviorContext);
  }

  return coreOutput;
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Verify that enhancement did not change the action.
 *
 * Use this in tests to prove determinism.
 *
 * @param {Object} original - Original NBA output
 * @param {Object} enhanced - Enhanced NBA output
 * @returns {boolean} True if action is unchanged
 */
export function verifyActionUnchanged(original, enhanced) {
  return original.action === enhanced.action;
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  enhanceReasoning,
  processNBAWithContext,
  verifyActionUnchanged,
};
