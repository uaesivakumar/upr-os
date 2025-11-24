/**
 * ObjectionHandlerTool - SIVA Tool 11 (Standalone) - v1.0
 *
 * Implements: HANDLE_OBJECTION (DELEGATED)
 *
 * Purpose: Generate appropriate responses to objections while maintaining relationship
 * Type: DELEGATED (Hybrid: Pattern matching + LLM response generation)
 * SLA: ≤1000ms P50 (classification), ≤3000ms P95 (with LLM)
 *
 * v1.0 Features:
 * - Deterministic objection classification (6 types)
 * - LLM-assisted response generation (GPT-4)
 * - Conversion probability estimation
 * - Next-step strategy recommendations
 * - 4-part response structure (acknowledge, reframe, value-add, next-step)
 * - Sentry error tracking
 *
 * Phase 2 Reference: Tool 11 - HANDLE_OBJECTION
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const OpenAI = require('openai');
const { objectionHandlerInputSchema, objectionHandlerOutputSchema } = require('./schemas/objectionHandlerSchemas');

class ObjectionHandlerToolStandalone {
  constructor() {
    this.agentName = 'ObjectionHandlerTool';
    this.POLICY_VERSION = 'v1.0';

    // OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'sk-dummy-key-for-testing'
    });

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(objectionHandlerInputSchema);
    this.validateOutput = ajv.compile(objectionHandlerOutputSchema);

    // System prompt for response generation
    this.SYSTEM_PROMPT = `You are Sivakumar, a Senior Retail Banking Officer, responding to an objection with professionalism and empathy. Your goal is to:
- Validate their concern (never dismiss it)
- Offer a different perspective that adds value
- Suggest a low-friction next step
- Maintain the relationship even if they say no

Objection handling principles:
- Never be pushy or aggressive
- Acknowledge their existing setup
- Position as complementary, not competitive
- Focus on specific problem-solving (Emirates ID delays)
- Give them control of next steps

Output ONLY valid JSON matching this schema:
{
  "acknowledgment": "validate their concern",
  "reframe": "different perspective",
  "value_add": "additional benefit they may not know",
  "next_step": "suggested low-friction action"
}`;
  }

  /**
   * Execute the tool with Sentry error tracking
   * @param {Object} input - Objection text, conversation context, company info
   * @returns {Promise<Object>} Classification + response strategy
   */
  async execute(input) {
    try {
      return await this._executeInternal(input);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'ObjectionHandlerTool',
          primitive: 'HANDLE_OBJECTION',
          phase: 'Phase_2',
          layer: 'DELEGATED'
        },
        extra: {
          input: input,
          timestamp: new Date().toISOString()
        },
        level: 'error'
      });

      // Re-throw to maintain error propagation
      throw error;
    }
  }

  /**
   * Internal execution logic
   * @private
   */
  async _executeInternal(input) {
    // Validate input
    if (!this.validateInput(input)) {
      const errors = this.validateInput.errors.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      throw new Error(`Input validation failed: ${errors}`);
    }

    const startTime = Date.now();

    // Extract inputs
    const {
      objection,
      conversation_context,
      company_context = {}
    } = input;

    // ═══════════════════════════════════════════════════════
    // PHASE 1: CLASSIFY OBJECTION (DETERMINISTIC)
    // ═══════════════════════════════════════════════════════

    const classification = this._classifyObjection(objection.text);

    // ═══════════════════════════════════════════════════════
    // PHASE 2: GENERATE RESPONSE (LLM-ASSISTED)
    // ═══════════════════════════════════════════════════════

    let response;
    let llmUsed = false;
    let llmTokens = 0;

    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-dummy-key-for-testing') {
      try {
        response = await this._generateResponse({
          objection_text: objection.text,
          objection_type: classification.objection_type,
          conversation_context,
          company_context
        });
        llmUsed = true;
        llmTokens = response._tokens || 0;
        delete response._tokens;
      } catch (error) {
        console.warn('LLM response generation failed, using template:', error.message);
        response = this._getTemplateResponse(classification.objection_type);
      }
    } else {
      // Use template response without LLM
      response = this._getTemplateResponse(classification.objection_type);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: DETERMINE STRATEGY
    // ═══════════════════════════════════════════════════════

    const strategy = this._determineStrategy(
      classification,
      conversation_context.previous_messages_count || 0,
      conversation_context.relationship_stage
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 4: ESTIMATE CONVERSION PROBABILITY
    // ═══════════════════════════════════════════════════════

    const conversionProbability = this._estimateConversionProbability(
      classification,
      conversation_context,
      company_context
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 5: CALCULATE CONFIDENCE
    // ═══════════════════════════════════════════════════════

    let confidence = 1.0;

    // Reduce confidence for ambiguous objections
    if (classification.objection_type === 'OTHER') confidence *= 0.7;
    if (!classification.is_genuine) confidence *= 0.8;

    // Reduce confidence for high message count (fatigue)
    if (conversation_context.previous_messages_count > 3) confidence *= 0.85;

    confidence = Math.max(0.5, Math.min(1.0, confidence));

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      classification,
      response,
      strategy,
      metadata: {
        confidence: parseFloat(confidence.toFixed(2)),
        estimated_conversion_probability: conversionProbability
      },
      timestamp: new Date().toISOString(),
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'handle_objection',
        tool_type: 'DELEGATED',
        policy_version: this.POLICY_VERSION,
        llm_used: llmUsed,
        llm_tokens: llmTokens
      }
    };

    // Validate output
    if (!this.validateOutput(output)) {
      const errors = this.validateOutput.errors.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      console.warn(`Output validation failed: ${errors}`);
    }

    return output;
  }

  /**
   * Classify objection using pattern matching
   * @private
   */
  _classifyObjection(objectionText) {
    const text = objectionText.toLowerCase();

    // Pattern matching for objection types
    if (text.match(/already have|current bank|existing partner|work with.*bank/i)) {
      return {
        objection_type: 'ALREADY_HAVE_BANK',
        severity: 'MEDIUM',
        is_genuine: true
      };
    }

    if (text.match(/not interested|no thanks|don't need|not looking/i)) {
      return {
        objection_type: 'NOT_INTERESTED',
        severity: 'HIGH',
        is_genuine: false // Usually polite brush-off
      };
    }

    if (text.match(/discuss|team|approval|decision|get back/i)) {
      return {
        objection_type: 'NEED_APPROVAL',
        severity: 'LOW',
        is_genuine: true
      };
    }

    if (text.match(/cost|rate|fee|price|expensive|charge/i)) {
      return {
        objection_type: 'COST_CONCERN',
        severity: 'MEDIUM',
        is_genuine: true
      };
    }

    if (text.match(/busy|timing|later|next quarter|month|year/i)) {
      return {
        objection_type: 'TIMING_ISSUE',
        severity: 'LOW',
        is_genuine: true
      };
    }

    return {
      objection_type: 'OTHER',
      severity: 'MEDIUM',
      is_genuine: true
    };
  }

  /**
   * Generate response using LLM
   * @private
   */
  async _generateResponse({ objection_text, objection_type, conversation_context, company_context }) {
    const userPrompt = `Respond to this objection:

Objection: "${objection_text}"
Type: ${objection_type}
Company: ${conversation_context.company_name} (${company_context.industry || 'N/A'}, ${company_context.size || 'N/A'} employees)
Contact: ${conversation_context.contact_name}
Context: ${conversation_context.relationship_stage || 'Initial contact'}, ${conversation_context.previous_messages_count || 0} previous emails

Requirements:
- Be empathetic and professional
- Don't dismiss their concern
- Offer new perspective or value
- Suggest easy next step
- Keep it brief (4-5 sentences total)`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 400
      });

      const content = response.choices[0].message.content;
      const responseData = JSON.parse(content);
      responseData._tokens = response.usage?.total_tokens || 0;

      return responseData;

    } catch (error) {
      throw new Error(`LLM response generation failed: ${error.message}`);
    }
  }

  /**
   * Get template response (fallback without LLM)
   * @private
   */
  _getTemplateResponse(objection_type) {
    const templates = {
      ALREADY_HAVE_BANK: {
        acknowledgment: 'I completely understand you have an existing banking relationship.',
        reframe: 'Many companies work with multiple banks for different needs. My role would be specifically for employee onboarding support, not to replace your current partnership.',
        value_add: 'I\'ve helped companies streamline the Emirates ID wait issue, which their primary bank wasn\'t set up to handle. It\'s about adding convenience, not switching.',
        next_step: 'Would you be open to a brief call to understand your current setup? No pressure to change anything, just exploring if there\'s a complementary fit.'
      },
      NOT_INTERESTED: {
        acknowledgment: 'I appreciate you letting me know.',
        reframe: 'Many companies reach out to me when they\'re in the middle of hiring cycles or expansion. I\'m happy to stay in touch for when the timing is better.',
        value_add: 'In the meantime, I can share some insights on UAE banking regulations that might be relevant to your industry.',
        next_step: 'Can I follow up in 3 months to see if your situation has changed?'
      },
      NEED_APPROVAL: {
        acknowledgment: 'Absolutely, this should be a team decision.',
        reframe: 'Most companies I work with involve their HR lead, Finance head, and sometimes Admin team. I can share a brief overview document that makes it easier for you to present internally.',
        value_add: 'I can also join a 15-minute call with your team to answer any questions directly.',
        next_step: 'Would it help if I sent over a one-pager explaining how this works? Then you can decide if a team call makes sense.'
      },
      COST_CONCERN: {
        acknowledgment: 'I understand cost is an important consideration.',
        reframe: 'The banking services I\'m discussing are standard employee account openings, which don\'t have additional fees beyond what any UAE bank would charge. The value I bring is the convenience and speed of processing.',
        value_add: 'The real cost savings come from avoiding payroll delays when employees can\'t get accounts opened quickly. Companies typically see 3-6 weeks saved on onboarding time.',
        next_step: 'Let me share more details about the account types and associated terms. Then you can evaluate the full picture.'
      },
      TIMING_ISSUE: {
        acknowledgment: 'I completely understand timing is important.',
        reframe: 'Perfect timing would be when you have new hires joining or planning expansion. I\'m happy to reconnect when that aligns better for you.',
        value_add: 'In the meantime, I can keep you updated on any changes to UAE banking regulations or employee onboarding requirements that might affect your business.',
        next_step: 'When would be a better time for me to reach out? I can schedule a reminder to follow up then.'
      },
      OTHER: {
        acknowledgment: 'Thank you for sharing your concern.',
        reframe: 'I\'d like to better understand your specific situation so I can address your needs appropriately.',
        value_add: 'Many companies have unique requirements, and I\'m here to find solutions that work for your specific context.',
        next_step: 'Could we schedule a brief call to discuss your specific concerns in more detail?'
      }
    };

    return templates[objection_type] || templates.OTHER;
  }

  /**
   * Determine next-step strategy
   * @private
   */
  _determineStrategy(classification, messageCount, relationshipStage) {
    // High severity + polite brush-off → Close
    if (classification.severity === 'HIGH' && !classification.is_genuine) {
      return {
        recommended_action: 'CLOSE_OPPORTUNITY',
        follow_up_timing_days: 0,
        alternative_angle: 'N/A - Low conversion probability'
      };
    }

    // Genuine low-severity objection → Respond now
    if (classification.severity === 'LOW' && classification.is_genuine) {
      return {
        recommended_action: 'RESPOND_NOW',
        follow_up_timing_days: 0,
        alternative_angle: 'Address objection directly, then suggest next step'
      };
    }

    // Medium severity + early stage → Wait and nurture
    if (classification.severity === 'MEDIUM' && messageCount < 2) {
      return {
        recommended_action: 'WAIT_AND_NURTURE',
        follow_up_timing_days: 14,
        alternative_angle: 'Share valuable content, reconnect with different angle'
      };
    }

    // Fatigue (too many messages) → Close
    if (messageCount > 4) {
      return {
        recommended_action: 'CLOSE_OPPORTUNITY',
        follow_up_timing_days: 0,
        alternative_angle: 'High message count suggests low interest'
      };
    }

    // Default: Respond now
    return {
      recommended_action: 'RESPOND_NOW',
      follow_up_timing_days: 0,
      alternative_angle: 'Address objection, provide value, suggest low-friction next step'
    };
  }

  /**
   * Estimate conversion probability
   * @private
   */
  _estimateConversionProbability(classification, conversation_context, company_context) {
    let probability = 50; // baseline

    // Adjust based on objection type
    switch (classification.objection_type) {
      case 'NEED_APPROVAL':
        probability = 70; // Good sign, they're considering it
        break;
      case 'TIMING_ISSUE':
        probability = 60; // Real interest, just timing
        break;
      case 'ALREADY_HAVE_BANK':
        probability = 45; // Harder but possible (complementary angle)
        break;
      case 'COST_CONCERN':
        probability = 55; // Address with value proposition
        break;
      case 'NOT_INTERESTED':
        probability = classification.is_genuine ? 20 : 10; // Polite brush-off = very low
        break;
      default:
        probability = 40;
    }

    // Adjust for message fatigue
    const messageCount = conversation_context.previous_messages_count || 0;
    if (messageCount > 3) {
      probability *= 0.8;
    }

    // Adjust for company size (larger = need approvals, normal process)
    if (company_context.size > 500 && classification.objection_type === 'NEED_APPROVAL') {
      probability *= 1.2; // Large companies naturally need approvals
    }

    return Math.min(Math.round(probability), 100);
  }
}

module.exports = ObjectionHandlerToolStandalone;
