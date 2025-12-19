/**
 * Buyer Bot Engine
 * S243: Buyer Bot Framework
 * PRD v1.3 Appendix §5
 *
 * Generates deterministic Buyer Bot responses using:
 * - Bot configuration (persona, hidden states, triggers)
 * - Seeded randomness for reproducibility
 * - LLM for natural language generation
 */

import {
  checkFailureTriggers,
  generateTurnSeed,
  applyVariant,
} from '../types/buyer-bot.js';
import { HARD_OUTCOMES } from '../types/scenario.js';

/**
 * Seeded random number generator for deterministic behavior
 * Uses mulberry32 algorithm
 */
function seededRandom(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @typedef {Object} BotResponseResult
 * @property {string} content - Bot's response text
 * @property {boolean} triggered_failure - Whether a failure trigger was hit
 * @property {Object|null} trigger - The trigger that was hit (if any)
 * @property {'PASS'|'FAIL'|'BLOCK'|null} outcome - Outcome if triggered
 * @property {Object} metadata - Response generation metadata
 */

/**
 * Generate a Buyer Bot response
 * @param {Object} options - Generation options
 * @param {Object} options.bot - Buyer Bot configuration
 * @param {Object} options.variant - Optional variant to apply
 * @param {string} options.siva_message - SIVA's message to respond to
 * @param {Object[]} options.conversation - Previous conversation turns
 * @param {number} options.run_seed - Scenario run seed for determinism
 * @param {Function} options.llm_invoke - LLM invocation function
 * @returns {Promise<BotResponseResult>}
 */
export async function generateBotResponse({
  bot,
  variant,
  siva_message,
  conversation,
  run_seed,
  llm_invoke,
}) {
  // Apply variant if provided
  const effectiveBot = variant ? applyVariant(bot, variant) : bot;

  // Generate deterministic seed for this turn
  const turnNumber = conversation.length + 1;
  const turnSeed = generateTurnSeed(run_seed, turnNumber);
  const random = seededRandom(turnSeed);

  // Build conversation context
  const context = buildConversationContext(conversation, siva_message, effectiveBot);

  // Check for failure triggers in SIVA's message
  const triggerResult = checkFailureTriggers(siva_message, effectiveBot.failure_triggers, context);

  if (triggerResult.triggered) {
    // Generate a response that reflects the triggered failure
    const failureResponse = await generateFailureResponse({
      bot: effectiveBot,
      trigger: triggerResult.trigger,
      siva_message,
      context,
      random,
      llm_invoke,
    });

    return {
      content: failureResponse,
      triggered_failure: true,
      trigger: triggerResult.trigger,
      outcome: triggerResult.outcome,
      metadata: {
        turn_seed: turnSeed,
        failure_type: triggerResult.trigger.type,
        bot_category: effectiveBot.category,
      },
    };
  }

  // Generate normal response
  const response = await generateNormalResponse({
    bot: effectiveBot,
    siva_message,
    conversation,
    context,
    random,
    llm_invoke,
  });

  return {
    content: response,
    triggered_failure: false,
    trigger: null,
    outcome: null,
    metadata: {
      turn_seed: turnSeed,
      bot_category: effectiveBot.category,
      objection_added: context.should_object,
    },
  };
}

/**
 * Build conversation context for trigger checking
 * @param {Object[]} conversation - Previous turns
 * @param {string} sivaMessage - Current SIVA message
 * @param {Object} bot - Bot configuration
 * @returns {Object} Context object
 */
function buildConversationContext(conversation, sivaMessage, bot) {
  const turnNumber = conversation.length + 1;

  // Check if previous turn had an objection
  const previousBotTurn = conversation
    .filter((t) => t.speaker === 'BUYER_BOT')
    .pop();

  const previousHadObjection = previousBotTurn
    ? /concern|worried|not sure|question|issue|problem|but|however/i.test(previousBotTurn.content)
    : false;

  // Check if current message addresses objection
  const addressesObjection = previousHadObjection
    ? /understand|hear you|good point|let me address|regarding your concern/i.test(sivaMessage)
    : false;

  // Extract mentioned competitors
  const mentionedCompetitors = extractCompetitors(sivaMessage);

  return {
    turn_number: turnNumber,
    previous_had_objection: previousHadObjection,
    addresses_objection: addressesObjection,
    mentioned_competitors: mentionedCompetitors,
    factual_errors: [], // Would need external fact-checking
    hidden_states: bot.hidden_states,
    should_object: Math.random() < getObjectionProbability(bot.behavioral_rules.objection_frequency),
  };
}

/**
 * Get objection probability from frequency setting
 * @param {string} frequency - Objection frequency
 * @returns {number} Probability 0-1
 */
function getObjectionProbability(frequency) {
  const probabilities = {
    low: 0.1,
    normal: 0.25,
    high: 0.5,
    very_high: 0.75,
  };
  return probabilities[frequency] || 0.25;
}

/**
 * Extract competitor mentions from text
 * @param {string} text - Text to analyze
 * @returns {string[]} Competitor names found
 */
function extractCompetitors(text) {
  // This would be enhanced with actual competitor database
  const competitors = [];
  const knownCompetitors = ['salesforce', 'hubspot', 'outreach', 'gong', 'chorus'];

  for (const comp of knownCompetitors) {
    if (text.toLowerCase().includes(comp)) {
      competitors.push(comp);
    }
  }

  return competitors;
}

/**
 * Generate response when a failure trigger is hit
 * @param {Object} options - Generation options
 * @returns {Promise<string>} Response text
 */
async function generateFailureResponse({
  bot,
  trigger,
  siva_message,
  context,
  random,
  llm_invoke,
}) {
  const failurePrompts = {
    price_mention_early: 'Express discomfort that price was brought up before you understand the value. Indicate you need to understand more before discussing budget.',
    pushy_close: 'React negatively to the pressure tactics. Express that you feel rushed and are reconsidering the conversation.',
    competitor_badmouth: 'Defend the competitor mentioned. Express that you have a good relationship with them and find the negative comments unprofessional.',
    jargon_overload: 'Express confusion and frustration at the technical jargon. Ask for plain English explanation or consider ending the conversation.',
    ignore_objection: 'Point out that your concern was not addressed. Express frustration that you are not being heard.',
    pressure_tactics: 'React strongly against manipulation. Consider ending the conversation due to the pressure tactics.',
    incorrect_information: 'Point out the factual error you noticed. Question the credibility of the presenter.',
  };

  const failureInstruction = failurePrompts[trigger.type] || 'React negatively to the sales approach used.';

  const prompt = `${bot.system_prompt}

CURRENT SITUATION:
The salesperson just said: "${siva_message}"

YOUR REACTION (${trigger.outcome} outcome):
${failureInstruction}

${trigger.outcome === 'BLOCK' ? 'This is a conversation-ending situation. Firmly end the conversation.' : 'Express your concern but give them one more chance.'}

Respond naturally as your persona would. Keep response under 100 words.`;

  if (llm_invoke) {
    try {
      return await llm_invoke(prompt);
    } catch (error) {
      console.error('[BUYER_BOT_ENGINE] LLM invocation failed:', error);
      // Fall back to template response
    }
  }

  // Template fallback responses
  const fallbackResponses = {
    BLOCK: [
      "I'm going to have to stop you there. This conversation is over.",
      "I've heard enough. We won't be moving forward.",
      "I need to end this call. This isn't going to work for us.",
    ],
    FAIL: [
      "I have to say, I'm not comfortable with how this is going.",
      "Let me be direct - that approach isn't working for me.",
      "I'm concerned about what I'm hearing here.",
    ],
  };

  const responses = fallbackResponses[trigger.outcome] || fallbackResponses.FAIL;
  const idx = Math.floor(random() * responses.length);
  return responses[idx];
}

/**
 * Generate normal (non-failure) response
 * @param {Object} options - Generation options
 * @returns {Promise<string>} Response text
 */
async function generateNormalResponse({
  bot,
  siva_message,
  conversation,
  context,
  random,
  llm_invoke,
}) {
  // Build hidden state hints for the prompt
  const hiddenStateHints = bot.hidden_states
    .map((s) => `- ${s.type}: ${s.value}`)
    .join('\n');

  // Determine if we should add an objection
  const shouldObject = context.should_object;

  let responseInstruction = '';
  if (shouldObject) {
    responseInstruction = 'Raise a concern or objection based on your hidden states, without revealing them directly.';
  } else if (context.turn_number < 3) {
    responseInstruction = 'Ask clarifying questions to understand the offering better.';
  } else {
    responseInstruction = 'Respond naturally to their message. Show appropriate interest or skepticism.';
  }

  const conversationHistory = conversation
    .slice(-6) // Last 6 turns
    .map((t) => `${t.speaker}: ${t.content}`)
    .join('\n');

  const prompt = `${bot.system_prompt}

CONVERSATION SO FAR:
${conversationHistory}

SIVA JUST SAID: "${siva_message}"

YOUR HIDDEN CONCERNS (DO NOT REVEAL DIRECTLY):
${hiddenStateHints || 'None specified'}

INSTRUCTION: ${responseInstruction}

Respond naturally as your persona would. Keep response under 100 words.`;

  if (llm_invoke) {
    try {
      return await llm_invoke(prompt);
    } catch (error) {
      console.error('[BUYER_BOT_ENGINE] LLM invocation failed:', error);
      // Fall back to template response
    }
  }

  // Template fallback responses based on context
  const templates = {
    early: [
      "That's interesting. Can you tell me more about how this works?",
      "I see. What makes you different from other solutions we've looked at?",
      "Before we go further, help me understand your core value proposition.",
    ],
    objection: [
      "I appreciate what you're saying, but I'm concerned about implementation complexity.",
      "That sounds good in theory, but how does this work in practice for companies like ours?",
      "I need to think about this. We've been burned by similar promises before.",
    ],
    engaged: [
      "That's helpful context. What would next steps look like?",
      "I'm tracking with you. Who else from my team should be involved?",
      "Makes sense. What kind of timeline are we looking at?",
    ],
  };

  let category = 'engaged';
  if (context.turn_number < 3) category = 'early';
  if (shouldObject) category = 'objection';

  const responses = templates[category];
  const idx = Math.floor(random() * responses.length);
  return responses[idx];
}

/**
 * Determine if scenario should end based on bot state
 * @param {Object} bot - Buyer Bot configuration
 * @param {Object[]} conversation - Conversation so far
 * @param {number} maxTurns - Maximum turns allowed
 * @returns {{shouldEnd: boolean, reason: string|null}}
 */
export function shouldEndConversation(bot, conversation, maxTurns) {
  // Check turn limit
  if (conversation.length >= maxTurns * 2) {
    return {
      shouldEnd: true,
      reason: 'Max turns reached',
    };
  }

  // Check for conversation enders in last bot message
  const lastBotTurn = conversation
    .filter((t) => t.speaker === 'BUYER_BOT')
    .pop();

  if (lastBotTurn) {
    const endPhrases = [
      'conversation is over',
      "we're done here",
      'end this call',
      "won't be moving forward",
      'not interested',
      'remove me from',
    ];

    for (const phrase of endPhrases) {
      if (lastBotTurn.content.toLowerCase().includes(phrase)) {
        return {
          shouldEnd: true,
          reason: 'Buyer Bot ended conversation',
        };
      }
    }
  }

  return {
    shouldEnd: false,
    reason: null,
  };
}

/**
 * Analyze conversation for buying signals
 * @param {Object[]} conversation - Conversation turns
 * @returns {Object} Signal analysis
 */
export function analyzeBuyingSignals(conversation) {
  const buyerTurns = conversation.filter((t) => t.speaker === 'BUYER_BOT');

  const positiveSignals = [];
  const negativeSignals = [];

  for (const turn of buyerTurns) {
    const content = turn.content.toLowerCase();

    // Positive signals
    if (/next steps|interested|sounds good|makes sense|like to learn more/i.test(content)) {
      positiveSignals.push({
        turn: turn.turn_number,
        signal: 'interest',
      });
    }
    if (/timeline|when can|how soon|implementation/i.test(content)) {
      positiveSignals.push({
        turn: turn.turn_number,
        signal: 'urgency',
      });
    }
    if (/team|colleagues|stakeholders|decision maker/i.test(content)) {
      positiveSignals.push({
        turn: turn.turn_number,
        signal: 'stakeholder_involvement',
      });
    }

    // Negative signals
    if (/not sure|concerned|worried|hesitant/i.test(content)) {
      negativeSignals.push({
        turn: turn.turn_number,
        signal: 'uncertainty',
      });
    }
    if (/budget|expensive|cost|afford/i.test(content)) {
      negativeSignals.push({
        turn: turn.turn_number,
        signal: 'price_concern',
      });
    }
    if (/competitor|alternative|other options/i.test(content)) {
      negativeSignals.push({
        turn: turn.turn_number,
        signal: 'comparison_shopping',
      });
    }
  }

  return {
    positive: positiveSignals,
    negative: negativeSignals,
    net_score: positiveSignals.length - negativeSignals.length,
    recommendation: positiveSignals.length > negativeSignals.length * 2 ? 'ADVANCE' : 'NURTURE',
  };
}
