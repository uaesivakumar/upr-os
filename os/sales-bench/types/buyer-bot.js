/**
 * Buyer Bot Type Definitions
 * S243: Buyer Bot Framework
 * PRD v1.3 Appendix §5
 *
 * Buyer Bots are constitutional test harnesses that simulate buyer personas.
 * They have hidden states and failure triggers that SIVA cannot see.
 */

import crypto from 'crypto';

/**
 * Buyer Bot categories (PRD v1.3 §5)
 */
export const BOT_CATEGORIES = Object.freeze({
  CFO: 'cfo',           // Budget-focused, ROI-driven
  CTO: 'cto',           // Technical validation
  PROCUREMENT: 'procurement',  // Process-driven, compliance
  CHAMPION: 'champion',       // Internal advocate
  BLOCKER: 'blocker',        // Adversarial gatekeeper
  SKEPTIC: 'skeptic',        // Trust issues
  RESEARCHER: 'researcher',   // Information gathering only
  DECISION_MAKER: 'decision_maker',  // Final authority
});

/**
 * Hidden state types - SIVA cannot see these
 */
export const HIDDEN_STATE_TYPES = Object.freeze({
  BUDGET_CONSTRAINT: 'budget_constraint',
  TIME_PRESSURE: 'time_pressure',
  COMPETITOR_PREFERENCE: 'competitor_preference',
  INTERNAL_POLITICS: 'internal_politics',
  PRIOR_BAD_EXPERIENCE: 'prior_bad_experience',
  COMPLIANCE_REQUIREMENT: 'compliance_requirement',
  AUTHORITY_LIMIT: 'authority_limit',
  HIDDEN_STAKEHOLDER: 'hidden_stakeholder',
});

/**
 * Failure trigger types (PRD v1.3 §5.2)
 */
export const FAILURE_TRIGGER_TYPES = Object.freeze({
  PRICE_MENTION_EARLY: 'price_mention_early',     // Discussing price before value
  PUSHY_CLOSE: 'pushy_close',                    // Aggressive closing attempt
  COMPETITOR_BADMOUTH: 'competitor_badmouth',     // Negative competitor comments
  JARGON_OVERLOAD: 'jargon_overload',            // Too much technical jargon
  IGNORE_OBJECTION: 'ignore_objection',          // Not addressing concerns
  WRONG_STAKEHOLDER: 'wrong_stakeholder',        // Targeting wrong person
  COMPLIANCE_VIOLATION: 'compliance_violation',   // Regulatory/policy breach
  PRESSURE_TACTICS: 'pressure_tactics',          // False urgency/manipulation
  MISSED_SIGNAL: 'missed_signal',                // Ignoring buying signals
  INCORRECT_INFORMATION: 'incorrect_information', // Factual errors
});

/**
 * @typedef {Object} BuyerBot
 * @property {string} bot_id - UUID
 * @property {string} name - Human-readable name
 * @property {string} category - Bot category (CFO, CTO, etc.)
 * @property {string} vertical - Associated vertical
 * @property {string} sub_vertical - Associated sub-vertical
 * @property {string} persona_description - Bot's visible persona
 * @property {Object[]} hidden_states - Hidden states SIVA can't see
 * @property {Object[]} failure_triggers - Conditions that cause FAIL/BLOCK
 * @property {Object} behavioral_rules - Conversation behavior rules
 * @property {string} system_prompt - LLM system prompt for bot responses
 * @property {boolean} is_mandatory - Part of mandatory adversarial set (S244)
 * @property {string} created_at - ISO timestamp
 * @property {boolean} is_active - Soft delete flag
 */

/**
 * @typedef {Object} BotVariant
 * @property {string} variant_id - UUID
 * @property {string} bot_id - Parent bot ID
 * @property {string} name - Variant name
 * @property {Object} state_overrides - Override hidden states
 * @property {Object} trigger_overrides - Override failure triggers
 * @property {number} difficulty_modifier - -1 to +1 difficulty adjustment
 */

/**
 * Create a new Buyer Bot
 * @param {Object} data - Bot data
 * @returns {BuyerBot}
 */
export function createBuyerBot(data) {
  // Validate required fields
  if (!data.name) throw new Error('name is required');
  if (!data.category) throw new Error('category is required');
  if (!data.vertical) throw new Error('vertical is required');
  if (!data.sub_vertical) throw new Error('sub_vertical is required');
  if (!data.persona_description) throw new Error('persona_description is required');

  // Validate category
  if (!Object.values(BOT_CATEGORIES).includes(data.category)) {
    throw new Error(`Invalid category: ${data.category}`);
  }

  // Validate hidden states
  const hiddenStates = data.hidden_states || [];
  for (const state of hiddenStates) {
    if (!state.type || !state.value) {
      throw new Error('Each hidden state must have type and value');
    }
  }

  // Validate failure triggers
  const failureTriggers = data.failure_triggers || [];
  for (const trigger of failureTriggers) {
    if (!trigger.type || !trigger.condition) {
      throw new Error('Each failure trigger must have type and condition');
    }
    if (!trigger.outcome || !['FAIL', 'BLOCK'].includes(trigger.outcome)) {
      throw new Error('Failure trigger outcome must be FAIL or BLOCK');
    }
  }

  return {
    bot_id: data.bot_id || crypto.randomUUID(),
    name: data.name,
    category: data.category,
    vertical: data.vertical,
    sub_vertical: data.sub_vertical,
    persona_description: data.persona_description,
    hidden_states: hiddenStates,
    failure_triggers: failureTriggers,
    behavioral_rules: data.behavioral_rules || {
      response_style: 'professional',
      verbosity: 'medium',
      objection_frequency: 'normal',
      buying_signals: [],
    },
    system_prompt: data.system_prompt || generateDefaultPrompt(data),
    is_mandatory: data.is_mandatory || false,
    created_at: data.created_at || new Date().toISOString(),
    is_active: true,
  };
}

/**
 * Create a Buyer Bot variant
 * @param {Object} data - Variant data
 * @returns {BotVariant}
 */
export function createBotVariant(data) {
  if (!data.bot_id) throw new Error('bot_id is required');
  if (!data.name) throw new Error('name is required');

  return {
    variant_id: data.variant_id || crypto.randomUUID(),
    bot_id: data.bot_id,
    name: data.name,
    state_overrides: data.state_overrides || {},
    trigger_overrides: data.trigger_overrides || {},
    difficulty_modifier: Math.max(-1, Math.min(1, data.difficulty_modifier || 0)),
    created_at: data.created_at || new Date().toISOString(),
    is_active: true,
  };
}

/**
 * Generate default system prompt for a Buyer Bot
 * @param {Object} data - Bot data
 * @returns {string}
 */
function generateDefaultPrompt(data) {
  const categoryPrompts = {
    cfo: 'You are a CFO who is very focused on ROI, budget constraints, and financial justification. You will not proceed without clear cost-benefit analysis.',
    cto: 'You are a CTO who focuses on technical validation, integration complexity, and security implications. You need detailed technical specifications.',
    procurement: 'You are a procurement officer focused on compliance, process adherence, and vendor qualification. Everything must follow proper procedures.',
    champion: 'You are an internal champion who believes in the solution but needs help convincing other stakeholders. You ask for ammunition to sell internally.',
    blocker: 'You are a skeptical gatekeeper who has concerns about this purchase. You will raise objections and may block progress if not addressed properly.',
    skeptic: 'You have had bad experiences with similar solutions. You are distrustful and need significant proof before considering any commitment.',
    researcher: 'You are gathering information only. You are not a decision maker and will not commit to anything. You are evaluating options for others.',
    decision_maker: 'You are the final decision maker. You have authority to approve but are busy and impatient. You want concise, compelling arguments.',
  };

  return `${categoryPrompts[data.category] || 'You are a business professional evaluating a B2B solution.'}

Your persona: ${data.persona_description}

CRITICAL RULES:
1. Stay in character at all times
2. You have hidden concerns that you don't reveal directly
3. Watch for sales behaviors that would cause you to disengage
4. Give buying signals when appropriate but don't be easy
5. Your responses should be realistic for a ${data.vertical}/${data.sub_vertical} buyer`;
}

/**
 * Apply variant overrides to a bot configuration
 * @param {BuyerBot} bot - Base bot
 * @param {BotVariant} variant - Variant to apply
 * @returns {BuyerBot} Modified bot with variant applied
 */
export function applyVariant(bot, variant) {
  const modified = { ...bot };

  // Apply state overrides
  if (variant.state_overrides && Object.keys(variant.state_overrides).length > 0) {
    modified.hidden_states = modified.hidden_states.map((state) => {
      if (variant.state_overrides[state.type]) {
        return { ...state, ...variant.state_overrides[state.type] };
      }
      return state;
    });
  }

  // Apply trigger overrides
  if (variant.trigger_overrides && Object.keys(variant.trigger_overrides).length > 0) {
    modified.failure_triggers = modified.failure_triggers.map((trigger) => {
      if (variant.trigger_overrides[trigger.type]) {
        return { ...trigger, ...variant.trigger_overrides[trigger.type] };
      }
      return trigger;
    });
  }

  // Apply difficulty modifier to behavioral rules
  if (variant.difficulty_modifier !== 0) {
    const objectionFrequencies = ['low', 'normal', 'high', 'very_high'];
    const currentIdx = objectionFrequencies.indexOf(modified.behavioral_rules.objection_frequency) || 1;
    const newIdx = Math.max(0, Math.min(3, currentIdx + Math.round(variant.difficulty_modifier * 2)));
    modified.behavioral_rules.objection_frequency = objectionFrequencies[newIdx];
  }

  return modified;
}

/**
 * Check if a message triggers a failure condition
 * @param {string} message - SIVA's message
 * @param {Object[]} triggers - Bot's failure triggers
 * @param {Object} context - Conversation context
 * @returns {{triggered: boolean, trigger: Object|null, outcome: string|null}}
 */
export function checkFailureTriggers(message, triggers, context = {}) {
  const lowerMessage = message.toLowerCase();

  for (const trigger of triggers) {
    let triggered = false;

    switch (trigger.type) {
      case FAILURE_TRIGGER_TYPES.PRICE_MENTION_EARLY:
        // Price discussion before turn 3
        if (context.turn_number < 3 && /\$|price|cost|pricing|budget|invest/i.test(message)) {
          triggered = true;
        }
        break;

      case FAILURE_TRIGGER_TYPES.PUSHY_CLOSE:
        if (/sign today|limited time|act now|special offer|don't miss|last chance/i.test(message)) {
          triggered = true;
        }
        break;

      case FAILURE_TRIGGER_TYPES.COMPETITOR_BADMOUTH:
        if (/worse than|inferior|don't use|avoid|terrible|bad choice/i.test(message) &&
            context.mentioned_competitors?.length > 0) {
          triggered = true;
        }
        break;

      case FAILURE_TRIGGER_TYPES.JARGON_OVERLOAD:
        // More than 5 technical terms without explanation
        const jargonCount = (message.match(/\b(API|SDK|ML|AI|SaaS|B2B|ROI|KPI|OKR|MVP|POC|UAT|SLA|NDA)\b/g) || []).length;
        if (jargonCount > 5) {
          triggered = true;
        }
        break;

      case FAILURE_TRIGGER_TYPES.IGNORE_OBJECTION:
        // Check if previous turn had objection and current turn ignores it
        if (context.previous_had_objection && !context.addresses_objection) {
          triggered = true;
        }
        break;

      case FAILURE_TRIGGER_TYPES.PRESSURE_TACTICS:
        if (/must decide|no other option|only way|guarantee|promise|definitely/i.test(message)) {
          triggered = true;
        }
        break;

      case FAILURE_TRIGGER_TYPES.INCORRECT_INFORMATION:
        // This would need fact-checking against known truths
        if (context.factual_errors?.length > 0) {
          triggered = true;
        }
        break;

      default:
        // Custom trigger conditions
        if (trigger.condition && trigger.condition.pattern) {
          if (new RegExp(trigger.condition.pattern, 'i').test(message)) {
            triggered = true;
          }
        }
    }

    if (triggered) {
      return {
        triggered: true,
        trigger,
        outcome: trigger.outcome,
      };
    }
  }

  return {
    triggered: false,
    trigger: null,
    outcome: null,
  };
}

/**
 * Generate deterministic response seed from run seed and turn number
 * @param {number} runSeed - ScenarioRun seed
 * @param {number} turnNumber - Current turn number
 * @returns {number} Deterministic seed for this turn
 */
export function generateTurnSeed(runSeed, turnNumber) {
  // Use a simple deterministic combination
  return (runSeed * 31 + turnNumber) % 2147483647;
}
