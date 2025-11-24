/**
 * CompositeScoreTool - SIVA Decision Primitive 8 (Standalone) - v1.0
 *
 * Implements: GENERATE_COMPOSITE_SCORE (STRICT)
 *
 * Purpose: Aggregate outputs from Tools 1-7 into final Q-Score and Lead Score
 * Type: STRICT (deterministic, no LLM calls)
 * SLA: ≤100ms P50, ≤200ms P95
 *
 * v1.0 Features:
 * - Aggregates 7 tool outputs into unified score
 * - Q-Score (0-100): Weighted composite quality score
 * - Lead Score Tier: HOT/WARM/COLD/DISQUALIFIED
 * - Natural language reasoning (NO formula exposed)
 * - Formula protection (scoring weights hidden)
 * - Sentry error tracking
 *
 * Phase 1 Reference: Decision Primitives §2, Primitive 8
 * Phase 2 Reference: MCP Tool Registry §1, Tool 8
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const { compositeScoreInputSchema, compositeScoreOutputSchema } = require('./schemas/compositeScoreSchemas');

class CompositeScoreToolStandalone {
  constructor() {
    this.agentName = 'CompositeScoreTool';
    this.POLICY_VERSION = 'v1.0';

    // Scoring weights (HIDDEN - never exposed in output)
    this.WEIGHTS = {
      company_quality: 0.25,
      contact_tier: 0.20,
      timing: 0.20,
      product_match: 0.15,
      channel_confidence: 0.10,
      context_confidence: 0.10
    };

    // Contact tier scoring (HIDDEN)
    this.TIER_SCORES = {
      'STRATEGIC': 100,
      'PRIMARY': 75,
      'SECONDARY': 50,
      'BACKUP': 25
    };

    // Timing category scoring (HIDDEN)
    this.TIMING_SCORES = {
      'OPTIMAL': 100,
      'GOOD': 75,
      'FAIR': 50,
      'POOR': 25
    };

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(compositeScoreInputSchema);
    this.validateOutput = ajv.compile(compositeScoreOutputSchema);
  }

  /**
   * Execute the tool with Sentry error tracking
   * @param {Object} input - Aggregated outputs from Tools 1-7
   * @returns {Promise<Object>} Composite score with natural language reasoning
   */
  async execute(input) {
    try {
      return await this._executeInternal(input);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'CompositeScoreTool',
          primitive: 'GENERATE_COMPOSITE_SCORE',
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

    // Extract inputs with defaults
    const {
      company_name,
      company_quality_score = 50,
      contact_tier = 'SECONDARY',
      timing_category = 'FAIR',
      timing_score = 50,
      has_blockers = false,
      blocker_count = 0,
      product_match_count = 0,
      top_product_fit_score = 0,
      primary_channel = 'EMAIL',
      channel_confidence = 0.8,
      opening_context_confidence = 0.8
    } = input;

    // ═══════════════════════════════════════════════════════
    // PHASE 1: COMPONENT SCORE NORMALIZATION (HIDDEN LOGIC)
    // ═══════════════════════════════════════════════════════

    // Normalize all component scores to 0-100 scale
    const normalizedScores = {
      company_quality: company_quality_score,
      contact_tier: this.TIER_SCORES[contact_tier] || 50,
      timing: timing_score || this.TIMING_SCORES[timing_category] || 50,
      product_match: this._calculateProductScore(product_match_count, top_product_fit_score),
      channel: channel_confidence * 100,
      context: opening_context_confidence * 100
    };

    // ═══════════════════════════════════════════════════════
    // PHASE 2: WEIGHTED Q-SCORE CALCULATION (HIDDEN FORMULA)
    // ═══════════════════════════════════════════════════════

    let qScore = 0;
    qScore += normalizedScores.company_quality * this.WEIGHTS.company_quality;
    qScore += normalizedScores.contact_tier * this.WEIGHTS.contact_tier;
    qScore += normalizedScores.timing * this.WEIGHTS.timing;
    qScore += normalizedScores.product_match * this.WEIGHTS.product_match;
    qScore += normalizedScores.channel * this.WEIGHTS.channel_confidence;
    qScore += normalizedScores.context * this.WEIGHTS.context_confidence;

    // Apply edge case penalties (HIDDEN)
    if (has_blockers) {
      const blockerPenalty = Math.min(blocker_count * 15, 40); // Max 40 point penalty
      qScore -= blockerPenalty;
    }

    // Ensure bounds
    qScore = Math.max(0, Math.min(100, qScore));

    // ═══════════════════════════════════════════════════════
    // PHASE 3: LEAD SCORE TIER CLASSIFICATION
    // ═══════════════════════════════════════════════════════

    const { tier, priority } = this._classifyLeadTier(
      qScore,
      timing_category,
      has_blockers,
      contact_tier
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 4: CONFIDENCE CALCULATION
    // ═══════════════════════════════════════════════════════

    let confidence = 1.0;

    // Count how many tools provided data
    let toolsWithData = 0;
    if (company_quality_score > 0) toolsWithData++;
    if (contact_tier) toolsWithData++;
    if (timing_score > 0) toolsWithData++;
    if (product_match_count > 0) toolsWithData++;
    if (channel_confidence > 0) toolsWithData++;
    if (opening_context_confidence > 0) toolsWithData++;

    // Reduce confidence if missing tool outputs
    if (toolsWithData < 6) {
      confidence *= (toolsWithData / 6);
    }

    // Reduce confidence for edge cases
    if (has_blockers) {
      confidence *= 0.9;
    }

    // Ensure confidence bounds
    confidence = Math.max(0.5, Math.min(1.0, confidence));

    // ═══════════════════════════════════════════════════════
    // PHASE 5: NATURAL LANGUAGE REASONING (NO FORMULA)
    // ═══════════════════════════════════════════════════════

    const { reasoning, keyStrengths, keyWeaknesses, recommendation } =
      this._buildNaturalReasoning({
        tier,
        qScore,
        company_name,
        contact_tier,
        timing_category,
        has_blockers,
        blocker_count,
        product_match_count,
        normalizedScores
      });

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      q_score: parseFloat(qScore.toFixed(1)),
      lead_score_tier: tier,
      priority,
      reasoning,
      confidence: parseFloat(confidence.toFixed(2)),
      timestamp: new Date().toISOString(),
      metadata: {
        confidenceLevel: confidence >= 0.9 ? 'HIGH' : confidence >= 0.75 ? 'MEDIUM' : 'LOW',
        key_strengths: keyStrengths,
        key_weaknesses: keyWeaknesses,
        recommendation
      },
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'generate_composite_score',
        tool_type: 'STRICT',
        policy_version: this.POLICY_VERSION,
        tools_aggregated: toolsWithData + 1 // +1 for edge cases tool
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
   * Calculate product match score (HIDDEN FORMULA)
   * @private
   */
  _calculateProductScore(matchCount, topFitScore) {
    if (matchCount === 0) return 0;

    // Base score from top product fit
    let score = topFitScore;

    // Bonus for multiple product matches (up to +20 points)
    const matchBonus = Math.min(matchCount * 5, 20);
    score += matchBonus;

    return Math.min(score, 100);
  }

  /**
   * Classify lead tier based on composite factors (HIDDEN LOGIC)
   * @private
   */
  _classifyLeadTier(qScore, timingCategory, hasBlockers, contactTier) {
    // DISQUALIFIED: Critical blockers or very low score
    if (hasBlockers && qScore < 40) {
      return { tier: 'DISQUALIFIED', priority: 4 };
    }

    // HOT: High score + optimal timing + strategic contact
    if (qScore >= 75 && !hasBlockers &&
        (timingCategory === 'OPTIMAL' || timingCategory === 'GOOD') &&
        (contactTier === 'STRATEGIC' || contactTier === 'PRIMARY')) {
      return { tier: 'HOT', priority: 1 };
    }

    // WARM: Medium score + decent timing
    if (qScore >= 50 && qScore < 75) {
      return { tier: 'WARM', priority: 2 };
    }

    // COLD: Low score or poor timing
    if (qScore >= 30 && qScore < 50) {
      return { tier: 'COLD', priority: 3 };
    }

    // DISQUALIFIED: Very low score
    return { tier: 'DISQUALIFIED', priority: 4 };
  }

  /**
   * Build natural language reasoning (NO FORMULA EXPOSED)
   * @private
   */
  _buildNaturalReasoning({
    tier,
    qScore,
    company_name,
    contact_tier,
    timing_category,
    has_blockers,
    blocker_count,
    product_match_count,
    normalizedScores
  }) {
    const keyStrengths = [];
    const keyWeaknesses = [];
    let reasoning = '';
    let recommendation = '';

    // Analyze strengths
    if (normalizedScores.company_quality >= 75) {
      keyStrengths.push('HIGH_QUALITY_COMPANY');
    }
    if (contact_tier === 'STRATEGIC' || contact_tier === 'PRIMARY') {
      keyStrengths.push('STRATEGIC_CONTACT');
    }
    if (timing_category === 'OPTIMAL' || timing_category === 'GOOD') {
      keyStrengths.push('FAVORABLE_TIMING');
    }
    if (product_match_count >= 3) {
      keyStrengths.push('MULTIPLE_PRODUCT_FIT');
    }

    // Analyze weaknesses
    if (has_blockers) {
      keyWeaknesses.push('EDGE_CASE_BLOCKERS');
    }
    if (normalizedScores.company_quality < 50) {
      keyWeaknesses.push('LOW_COMPANY_QUALITY');
    }
    if (contact_tier === 'BACKUP') {
      keyWeaknesses.push('LOW_TIER_CONTACT');
    }
    if (timing_category === 'POOR') {
      keyWeaknesses.push('POOR_TIMING');
    }
    if (product_match_count === 0) {
      keyWeaknesses.push('NO_PRODUCT_MATCH');
    }

    // Build reasoning based on tier
    if (tier === 'HOT') {
      reasoning = `${company_name} is a high-priority opportunity (Q-Score: ${qScore.toFixed(1)}). `;
      reasoning += `Strong fundamentals: ${keyStrengths.join(', ').toLowerCase().replace(/_/g, ' ')}. `;
      reasoning += `This lead combines quality company profile with strategic contact access and favorable timing.`;
      recommendation = 'PRIORITY_OUTREACH';

    } else if (tier === 'WARM') {
      reasoning = `${company_name} is a moderate-priority opportunity (Q-Score: ${qScore.toFixed(1)}). `;

      if (keyStrengths.length > 0) {
        reasoning += `Positive factors: ${keyStrengths.join(', ').toLowerCase().replace(/_/g, ' ')}. `;
      }

      if (keyWeaknesses.length > 0) {
        reasoning += `However, some limitations exist: ${keyWeaknesses.join(', ').toLowerCase().replace(/_/g, ' ')}. `;
      }

      reasoning += `This lead shows potential but may require more nurturing.`;
      recommendation = 'STANDARD_OUTREACH';

    } else if (tier === 'COLD') {
      reasoning = `${company_name} is a lower-priority opportunity (Q-Score: ${qScore.toFixed(1)}). `;
      reasoning += `Key challenges: ${keyWeaknesses.join(', ').toLowerCase().replace(/_/g, ' ')}. `;

      if (keyStrengths.length > 0) {
        reasoning += `Some positive signals present: ${keyStrengths.join(', ').toLowerCase().replace(/_/g, ' ')}.`;
      }

      recommendation = 'DEPRIORITIZE';

    } else { // DISQUALIFIED
      reasoning = `${company_name} does not meet minimum qualification criteria (Q-Score: ${qScore.toFixed(1)}). `;

      if (has_blockers) {
        reasoning += `Critical blockers detected (${blocker_count}). `;
      }

      reasoning += `Significant weaknesses: ${keyWeaknesses.join(', ').toLowerCase().replace(/_/g, ' ')}. `;
      reasoning += `This lead is not recommended for outreach at this time.`;
      recommendation = 'DISQUALIFY';
    }

    return {
      reasoning,
      keyStrengths,
      keyWeaknesses,
      recommendation
    };
  }
}

module.exports = CompositeScoreToolStandalone;
