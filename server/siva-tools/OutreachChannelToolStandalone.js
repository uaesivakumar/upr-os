/**
 * OutreachChannelTool - SIVA Decision Primitive 6 (Standalone) - v1.0
 *
 * Implements: SELECT_OUTREACH_CHANNEL (STRICT)
 *
 * Purpose: Determine primary outreach channel (EMAIL for v1.0, LinkedIn in v2.0)
 * Type: STRICT (deterministic, no LLM calls)
 * SLA: ≤50ms P50, ≤100ms P95
 *
 * v1.0 Features:
 * - Simplified: Always EMAIL primary channel
 * - Confidence based on email deliverability
 * - Outcome only (NO reasoning - formula protected)
 * - LinkedIn support coming in v2.0
 * - Sentry error tracking
 *
 * Phase 1 Reference: Decision Primitives §2, Primitive 6
 * Phase 2 Reference: MCP Tool Registry §1, Tool 6
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const { outreachChannelInputSchema, outreachChannelOutputSchema } = require('./schemas/outreachChannelSchemas');

class OutreachChannelToolStandalone {
  constructor() {
    this.agentName = 'OutreachChannelTool';
    this.POLICY_VERSION = 'v1.0';

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(outreachChannelInputSchema);
    this.validateOutput = ajv.compile(outreachChannelOutputSchema);
  }

  /**
   * Execute the tool with Sentry error tracking
   * @param {Object} input - Contact and channel context
   * @returns {Promise<Object>} Channel selection (outcome only - NO reasoning)
   */
  async execute(input) {
    try {
      return await this._executeInternal(input);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'OutreachChannelTool',
          primitive: 'SELECT_OUTREACH_CHANNEL',
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

    // Extract inputs
    const {
      contact_tier,
      email_deliverability,
      has_linkedin_profile = false,
      company_size,
      industry
    } = input;

    // ═══════════════════════════════════════════════════════
    // PHASE 1: CHANNEL SELECTION (v1.0 - SIMPLIFIED)
    // ═══════════════════════════════════════════════════════

    // v1.0: Always EMAIL primary
    // v2.0: Will add LinkedIn logic based on tier, company size, deliverability
    const primaryChannel = 'EMAIL';
    const fallbackChannel = 'LINKEDIN'; // For v2.0 implementation
    const priority = 1;

    // ═══════════════════════════════════════════════════════
    // PHASE 2: CONFIDENCE CALCULATION
    // ═══════════════════════════════════════════════════════

    let confidence = 1.0;

    // Reduce confidence if email deliverability is low
    if (email_deliverability < 0.6) {
      confidence = 0.7;
    } else if (email_deliverability < 0.8) {
      confidence = 0.85;
    }

    // Slight boost for STRATEGIC tier (high-value contacts)
    if (contact_tier === 'STRATEGIC' && email_deliverability >= 0.8) {
      confidence = Math.min(1.0, confidence * 1.05);
    }

    // Ensure confidence bounds
    confidence = Math.max(0.5, Math.min(1.0, confidence));

    // ═══════════════════════════════════════════════════════
    // PHASE 3: CONFIDENCE LEVEL CLASSIFICATION
    // ═══════════════════════════════════════════════════════

    const confidenceLevel = confidence >= 0.9 ? 'HIGH' :
                            confidence >= 0.75 ? 'MEDIUM' : 'LOW';

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      primary_channel: primaryChannel,
      fallback_channel: fallbackChannel,
      priority,
      confidence: parseFloat(confidence.toFixed(2)),
      timestamp: new Date().toISOString(),
      metadata: {
        confidenceLevel
      },
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'select_outreach_channel',
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
}

module.exports = OutreachChannelToolStandalone;
