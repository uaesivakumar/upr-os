/**
 * OutreachMessageGeneratorTool - SIVA Tool 9 (Standalone) - v3.0
 *
 * Implements: GENERATE_OUTREACH_MESSAGE (DELEGATED)
 *
 * Purpose: Generate complete outreach email messages using LLM with persona-driven voice
 * Type: DELEGATED (LLM-assisted with schema-locked output)
 * SLA: ≤3000ms P50, ≤5000ms P95
 *
 * v3.0 Features (Sprint 71):
 * - Persona-driven system prompt generation
 * - Dynamic tone from persona.outreach_doctrine
 * - NEVER/ALWAYS rules from persona config
 * - sub_vertical_slug input for persona loading
 * - Persona identity (name, role, org) injected into prompt
 *
 * v1.0 Features:
 * - GPT-4 Turbo message generation
 * - Schema-locked JSON output
 * - Spam score calculation
 * - Compliance checking (NEVER rules from persona)
 * - Few-shot examples for consistency
 * - Temperature controlled (0.7)
 * - Sentry error tracking
 *
 * Phase 2 Reference: Tool 9 - GENERATE_OUTREACH_MESSAGE
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const OpenAI = require('openai');
const { outreachMessageGeneratorInputSchema, outreachMessageGeneratorOutputSchema } = require('./schemas/outreachMessageGeneratorSchemas');
const personaLoader = require('./helpers/personaLoader');

class OutreachMessageGeneratorToolStandalone {
  constructor() {
    this.agentName = 'OutreachMessageGeneratorTool';
    this.POLICY_VERSION = 'v3.0';

    // OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'sk-dummy-key-for-testing'
    });

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(outreachMessageGeneratorInputSchema);
    this.validateOutput = ajv.compile(outreachMessageGeneratorOutputSchema);

    // Default system prompt (EB fallback)
    this.DEFAULT_SYSTEM_PROMPT = `You are Sivakumar, a Senior Retail Banking Officer at Emirates NBD with 10+ years UAE banking experience. You write professional, research-based outreach emails that position you as a "trusted banking partner" for employee onboarding.

Your writing style:
- Professional but approachable
- Always reference specific company signals/news
- Frame benefit as time saved (Emirates ID delays)
- Low-friction CTA (15-minute call)
- Never mention pricing or use pressure language
- Position as "point of contact" not salesperson

Output ONLY valid JSON matching this schema:
{
  "subject_line": "max 60 chars",
  "greeting": "Dear [Name], or Hi [Name],",
  "opening_paragraph": "2-3 sentences referencing company signal",
  "value_proposition": "2-3 sentences explaining benefits",
  "call_to_action": "1-2 sentences with low-friction ask",
  "signature": "Best regards,\\nSivakumar\\nSenior Retail Banking Officer\\nEmirates NBD"
}`;
  }

  /**
   * Build persona-driven system prompt (v3.0)
   * @private
   */
  _buildSystemPrompt(persona) {
    if (!persona) {
      return this.DEFAULT_SYSTEM_PROMPT;
    }

    const doctrine = persona.outreach_doctrine || {};
    const identity = {
      name: persona.persona_name || 'Sales Professional',
      role: persona.persona_role || 'Sales Officer',
      org: persona.persona_organization || 'Your Organization'
    };

    // Build ALWAYS rules
    const alwaysRules = (doctrine.always || [])
      .map(rule => `- ${rule}`)
      .join('\n');

    // Build NEVER rules
    const neverRules = (doctrine.never || [])
      .map(rule => `- Never ${rule.toLowerCase()}`)
      .join('\n');

    // Tone and formality
    const tone = doctrine.tone || 'professional';
    const formality = doctrine.formality || 'formal';

    return `You are ${identity.name}, a ${identity.role} at ${identity.org}. You write ${tone}, research-based outreach emails.

Your writing style:
- Tone: ${tone}
- Formality: ${formality}
${alwaysRules ? `\nALWAYS:\n${alwaysRules}` : ''}
${neverRules ? `\nNEVER:\n${neverRules}` : ''}

Output ONLY valid JSON matching this schema:
{
  "subject_line": "max 60 chars",
  "greeting": "Dear [Name], or Hi [Name],",
  "opening_paragraph": "2-3 sentences referencing company signal",
  "value_proposition": "2-3 sentences explaining benefits",
  "call_to_action": "1-2 sentences with low-friction ask",
  "signature": "Best regards,\\n${identity.name}\\n${identity.role}\\n${identity.org}"
}`;
  }

  /**
   * Execute the tool with Sentry error tracking
   * @param {Object} input - Company context, contact info, products
   * @returns {Promise<Object>} Generated outreach message with compliance checks
   */
  async execute(input) {
    try {
      return await this._executeInternal(input);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'OutreachMessageGeneratorTool',
          primitive: 'GENERATE_OUTREACH_MESSAGE',
          phase: 'Phase_2',
          layer: 'DELEGATED'
        },
        extra: {
          input: input,
          llm_model: 'gpt-4-turbo-preview',
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
      company_context,
      opening_context = '',
      recommended_products = [],
      contact_info,
      message_type,
      tone_preference = 'PROFESSIONAL',
      sub_vertical_slug = null  // v3.0: Persona selection
    } = input;

    // ═══════════════════════════════════════════════════════
    // PHASE 0.5: PERSONA LOADING (v3.0)
    // ═══════════════════════════════════════════════════════

    let persona = null;
    let personaLoaded = false;
    let systemPrompt = this.DEFAULT_SYSTEM_PROMPT;

    try {
      if (sub_vertical_slug) {
        persona = await personaLoader.loadPersona(sub_vertical_slug);
        personaLoaded = true;
        systemPrompt = this._buildSystemPrompt(persona);
      }
    } catch (error) {
      console.warn(`[OutreachMessageGenerator] Persona loading failed: ${error.message}, using default prompt`);
      // Continue with default prompt
    }

    // Get persona tone preference (override input if persona specifies)
    const effectiveTone = persona?.outreach_doctrine?.tone?.toUpperCase() || tone_preference;

    // ═══════════════════════════════════════════════════════
    // PHASE 1: BUILD USER PROMPT
    // ═══════════════════════════════════════════════════════

    const userPrompt = this._buildUserPrompt({
      company_context,
      opening_context,
      recommended_products,
      contact_info,
      message_type,
      tone_preference: effectiveTone,
      persona  // v3.0: Pass persona for context
    });

    // ═══════════════════════════════════════════════════════
    // PHASE 2: CALL GPT-4 WITH SCHEMA-LOCKED OUTPUT
    // ═══════════════════════════════════════════════════════

    let messageData;
    let llmTokens = 0;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },  // Schema-locked
        temperature: 0.7,                          // Creative but controlled
        max_tokens: 500,
        presence_penalty: 0.3,                     // Avoid repetition
        frequency_penalty: 0.3
      });

      const content = response.choices[0].message.content;
      messageData = JSON.parse(content);
      llmTokens = response.usage?.total_tokens || 0;

    } catch (error) {
      throw new Error(`LLM generation failed: ${error.message}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: VALIDATE MESSAGE STRUCTURE
    // ═══════════════════════════════════════════════════════

    if (!this._validateMessageStructure(messageData)) {
      throw new Error('LLM output missing required fields');
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 4: CALCULATE SPAM SCORE
    // ═══════════════════════════════════════════════════════

    const fullMessage = this._buildFullMessage(messageData);
    const spamScore = this._calculateSpamScore(fullMessage, company_context.company_name);

    // ═══════════════════════════════════════════════════════
    // PHASE 5: CHECK COMPLIANCE (v3.0: Persona-driven)
    // ═══════════════════════════════════════════════════════

    const complianceFlags = this._checkCompliance(fullMessage, company_context.company_name, persona);

    // ═══════════════════════════════════════════════════════
    // PHASE 6: CALCULATE METADATA
    // ═══════════════════════════════════════════════════════

    const estimatedReadTime = Math.round(fullMessage.split(' ').length / 3); // ~180 wpm

    // Confidence based on compliance and spam score
    let confidence = 1.0;
    if (complianceFlags.length > 0) confidence *= 0.7;
    if (spamScore > 0.3) confidence *= 0.8;
    confidence = Math.max(0.5, Math.min(1.0, confidence));

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      message: messageData,
      metadata: {
        tone_used: effectiveTone,
        estimated_read_time_seconds: estimatedReadTime,
        spam_score: parseFloat(spamScore.toFixed(2)),
        compliance_flags: complianceFlags,
        confidence: parseFloat(confidence.toFixed(2)),
        // v3.0: Persona metadata
        persona_loaded: personaLoaded,
        persona_name: persona?.persona_name || null,
        sub_vertical_slug: sub_vertical_slug
      },
      timestamp: new Date().toISOString(),
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'generate_outreach_message',
        tool_type: 'DELEGATED',
        policy_version: this.POLICY_VERSION,
        llm_model: 'gpt-4-turbo-preview',
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
   * Build user prompt for LLM
   * @private
   */
  _buildUserPrompt({ company_context, opening_context, recommended_products, contact_info, message_type, tone_preference }) {
    const products = recommended_products.length > 0
      ? recommended_products.slice(0, 2).map(p => p.product_name).join(', ')
      : 'employee banking services';

    return `Generate an email for:

Company: ${company_context.company_name} (${company_context.industry})
Signal: ${company_context.signal_headline || 'N/A'}
Location: ${company_context.city || 'UAE'}
Contact: ${contact_info.contact_name} (${contact_info.title || 'N/A'})
Opening Context: ${opening_context || 'Standard outreach'}
Recommended Products: ${products}
Message Type: ${message_type}

Requirements:
- Reference the signal naturally in opening
- Position as "trusted banking partner" for employee onboarding
- Mention Emirates ID delay pain point
- Suggest 15-minute call
- Tone: ${tone_preference}
- Keep subject line under 60 characters
- NO pricing mentions
- NO pressure language`;
  }

  /**
   * Validate LLM output has required fields
   * @private
   */
  _validateMessageStructure(messageData) {
    return (
      messageData &&
      messageData.subject_line &&
      messageData.greeting &&
      messageData.opening_paragraph &&
      messageData.value_proposition &&
      messageData.call_to_action &&
      messageData.signature
    );
  }

  /**
   * Build full message text for analysis
   * @private
   */
  _buildFullMessage(messageData) {
    return `${messageData.subject_line}\n${messageData.greeting}\n${messageData.opening_paragraph}\n${messageData.value_proposition}\n${messageData.call_to_action}\n${messageData.signature}`;
  }

  /**
   * Calculate spam score (heuristic)
   * @private
   */
  _calculateSpamScore(message, companyName) {
    let score = 0.0;
    const lower = message.toLowerCase();

    // Bad signals
    if (lower.includes('limited time')) score += 0.2;
    if (lower.includes('act now')) score += 0.2;
    if (lower.includes('free')) score += 0.15;
    if (lower.match(/\$|aed|\d+% off/i)) score += 0.15;
    if (lower.includes('!!!')) score += 0.1;
    if (lower.match(/urgent|hurry|expires/i)) score += 0.15;

    // Good signals (reduce score)
    if (lower.includes(companyName.toLowerCase())) score -= 0.1;
    if (lower.match(/i noticed|i saw/i)) score -= 0.05;
    if (lower.includes('emirates id')) score -= 0.05;

    return Math.max(0, Math.min(score, 1.0));
  }

  /**
   * Check compliance with NEVER rules from persona (v3.0)
   * @private
   */
  _checkCompliance(message, companyName, persona = null) {
    const flags = [];
    const lower = message.toLowerCase();

    // Get NEVER rules from persona or use defaults
    const neverRules = persona?.outreach_doctrine?.never || [
      'Mention pricing',
      'Use pressure language'
    ];

    // Check persona NEVER rules dynamically
    for (const rule of neverRules) {
      const ruleLower = rule.toLowerCase();

      // Pricing detection
      if (ruleLower.includes('pricing') || ruleLower.includes('price')) {
        if (lower.match(/price|cost|rate|fee|charge|payment/i)) {
          flags.push('PERSONA_NEVER_PRICING');
        }
      }

      // Pressure language detection
      if (ruleLower.includes('pressure')) {
        if (lower.match(/limited time|hurry|urgent|expires|act now|don't miss/i)) {
          flags.push('PERSONA_NEVER_PRESSURE');
        }
      }
    }

    // Universal rules (always checked)

    // Must reference company name
    if (!lower.includes(companyName.toLowerCase())) {
      flags.push('MISSING_COMPANY_REFERENCE');
    }

    // Don't make unsubstantiated claims
    if (lower.match(/guaranteed|best in market|#1|leading|top-rated/i)) {
      flags.push('UNSUBSTANTIATED_CLAIM');
    }

    return flags;
  }
}

module.exports = OutreachMessageGeneratorToolStandalone;
