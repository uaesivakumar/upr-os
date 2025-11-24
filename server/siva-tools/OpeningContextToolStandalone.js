/**
 * OpeningContextTool - SIVA Decision Primitive 7 (Standalone) - v1.0
 *
 * Implements: GENERATE_OPENING_CONTEXT (STRICT)
 *
 * Purpose: Generate opening 2-3 sentences that reference company signal in user's voice
 * Type: STRICT (template-based, no LLM calls)
 * SLA: ≤100ms P50, ≤200ms P95
 *
 * v1.0 Features:
 * - 5 signal-based templates (expansion, hiring, funding, news, generic)
 * - Mixed style based on signal type
 * - Value proposition contextual selection
 * - Formula protection (NO template selection logic exposed)
 * - Sentry error tracking
 *
 * Phase 1 Reference: Decision Primitives §2, Primitive 7
 * Phase 2 Reference: MCP Tool Registry §1, Tool 7
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const { openingContextInputSchema, openingContextOutputSchema } = require('./schemas/openingContextSchemas');

class OpeningContextToolStandalone {
  constructor() {
    this.agentName = 'OpeningContextTool';
    this.POLICY_VERSION = 'v1.0';

    // Template library (hidden selection logic)
    this.TEMPLATES = {
      expansion: {
        id: 'expansion_template',
        text: 'I noticed {{company_name}} recently {{signal_headline}} in {{city}}. Many expanding {{industry}} companies face onboarding delays while new employees await Emirates IDs—I can serve as your dedicated banking contact to streamline this process.',
        value_prop: 'dedicated banking contact',
        fallback: 'I noticed {{company_name}} recently expanded operations in {{city}}. Many expanding companies face employee onboarding challenges with Emirates ID wait periods—I can serve as your dedicated banking contact to streamline this.'
      },
      hiring: {
        id: 'hiring_template',
        text: 'I saw {{company_name}} is actively hiring{{roles}}. With new employees joining, you\'ll need a banking partner who can facilitate quick account openings despite the Emirates ID wait period.',
        value_prop: 'banking partner',
        fallback: 'I saw {{company_name}} is actively hiring in the {{industry}} sector. With new employees joining, you\'ll need a banking partner who can facilitate quick account openings despite the Emirates ID wait period.'
      },
      funding: {
        id: 'funding_template',
        text: 'Congratulations on {{company_name}}\'s recent {{funding_details}} funding round. As you scale your UAE operations, I can act as your trusted banking partner to support rapid employee onboarding.',
        value_prop: 'trusted banking partner',
        fallback: 'Congratulations on {{company_name}}\'s recent funding round. As you scale your UAE operations, I can act as your trusted banking partner to support rapid employee onboarding.'
      },
      news: {
        id: 'news_template',
        text: 'I came across news about {{company_name}}\'s {{achievement}} in {{city}}. If you\'re looking to streamline your employee banking experience, I\'d be happy to serve as your point of contact at Emirates NBD.',
        value_prop: 'point of contact',
        fallback: 'I came across news about {{company_name}} in {{city}}. If you\'re looking to streamline your employee banking experience, I\'d be happy to serve as your point of contact at Emirates NBD.'
      },
      generic: {
        id: 'generic_template',
        text: 'I understand {{company_name}} operates in the {{industry}} sector in {{city}}. Many companies in this space appreciate having a dedicated banking contact to simplify employee onboarding—I can provide that support for your team.',
        value_prop: 'dedicated banking contact',
        fallback: 'I understand {{company_name}} operates in {{city}}. Many companies appreciate having a dedicated banking contact to simplify employee onboarding—I can provide that support for your team.'
      }
    };

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(openingContextInputSchema);
    this.validateOutput = ajv.compile(openingContextOutputSchema);
  }

  /**
   * Execute the tool with Sentry error tracking
   * @param {Object} input - Company and signal context
   * @returns {Promise<Object>} Generated opening context (formula protected)
   */
  async execute(input) {
    try {
      return await this._executeInternal(input);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'OpeningContextTool',
          primitive: 'GENERATE_OPENING_CONTEXT',
          phase: 'Phase_1'
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
    let confidence = 1.0;

    // Extract inputs
    const {
      company_name,
      signal_type,
      signal_headline = '',
      industry = '',
      city = 'UAE',
      additional_context = ''
    } = input;

    // ═══════════════════════════════════════════════════════
    // PHASE 1: TEMPLATE SELECTION (HIDDEN LOGIC)
    // ═══════════════════════════════════════════════════════

    const template = this.TEMPLATES[signal_type] || this.TEMPLATES['generic'];

    // ═══════════════════════════════════════════════════════
    // PHASE 2: CONTEXT GENERATION
    // ═══════════════════════════════════════════════════════

    let openingContext;
    try {
      openingContext = this._generateContext(template, {
        company_name,
        signal_headline,
        industry,
        city,
        additional_context
      });
    } catch (error) {
      // Fallback to generic template if specific template fails
      openingContext = this._generateContext(this.TEMPLATES['generic'], {
        company_name,
        industry,
        city
      });
      confidence *= 0.8;
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: CONFIDENCE ADJUSTMENT
    // ═══════════════════════════════════════════════════════

    // Reduce confidence if missing contextual information
    if (!signal_headline && signal_type !== 'generic') {
      confidence *= 0.85;
    }

    if (!industry && signal_type !== 'generic') {
      confidence *= 0.9;
    }

    if (!city || city === 'UAE') {
      confidence *= 0.95;
    }

    // Ensure confidence bounds
    confidence = Math.max(0.6, Math.min(1.0, confidence));

    // ═══════════════════════════════════════════════════════
    // PHASE 4: SIGNAL FRESHNESS (ESTIMATED)
    // ═══════════════════════════════════════════════════════

    let signalFreshness = 'recent';
    if (signal_headline.toLowerCase().includes('recent') ||
        signal_headline.toLowerCase().includes('today') ||
        signal_headline.toLowerCase().includes('announce')) {
      signalFreshness = 'fresh';
    }

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      opening_context: openingContext,
      confidence: parseFloat(confidence.toFixed(2)),
      template_id: template.id,
      timestamp: new Date().toISOString(),
      metadata: {
        confidenceLevel: confidence >= 0.9 ? 'HIGH' : confidence >= 0.75 ? 'MEDIUM' : 'LOW',
        signal_freshness: signalFreshness,
        value_proposition: template.value_prop
      },
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'generate_opening_context',
        tool_type: 'STRICT',
        policy_version: this.POLICY_VERSION
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
   * Generate context from template (FORMULA PROTECTED)
   * @private
   */
  _generateContext(template, context) {
    let text = template.text;

    // Replace placeholders
    text = text.replace(/{{company_name}}/g, context.company_name);

    if (context.signal_headline) {
      text = text.replace(/{{signal_headline}}/g, context.signal_headline);
      text = text.replace(/{{funding_details}}/g, context.signal_headline);
      text = text.replace(/{{achievement}}/g, context.signal_headline);

      // Extract roles if hiring signal
      if (context.signal_headline.toLowerCase().includes('hiring')) {
        const roles = this._extractRoles(context.signal_headline);
        text = text.replace(/{{roles}}/g, roles ? ` for ${roles}` : '');
      } else {
        text = text.replace(/{{roles}}/g, '');
      }
    } else {
      // Use fallback template if no signal headline
      text = template.fallback;
      text = text.replace(/{{company_name}}/g, context.company_name);
    }

    if (context.industry) {
      text = text.replace(/{{industry}}/g, context.industry);
    } else {
      text = text.replace(/ in the {{industry}} sector/g, '');
      text = text.replace(/ {{industry}}/g, '');
    }

    if (context.city) {
      text = text.replace(/{{city}}/g, context.city);
    } else {
      text = text.replace(/ in {{city}}/g, ' in the UAE');
    }

    // Clean up any remaining placeholders
    text = text.replace(/{{[^}]+}}/g, '');

    // Clean up double spaces
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Extract role information from headline
   * @private
   */
  _extractRoles(headline) {
    // Simple extraction: look for common role keywords
    const roleKeywords = ['engineer', 'developer', 'manager', 'director', 'analyst', 'designer', 'specialist'];
    const lower = headline.toLowerCase();

    for (const keyword of roleKeywords) {
      if (lower.includes(keyword)) {
        // Try to extract the full role title
        const match = headline.match(new RegExp(`\\b[\\w\\s]*${keyword}s?\\b`, 'i'));
        if (match) {
          return match[0].toLowerCase();
        }
      }
    }

    return null;
  }
}

module.exports = OpeningContextToolStandalone;
