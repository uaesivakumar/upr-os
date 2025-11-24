/**
 * RelationshipTrackerTool - SIVA Tool 12 (Standalone) - v1.0 - FINAL TOOL!
 *
 * Implements: TRACK_RELATIONSHIP_HEALTH (DELEGATED - Hybrid)
 *
 * Purpose: Track relationship health over time and suggest nurture actions
 * Type: DELEGATED (Hybrid: RFM scoring + LLM nurture suggestions)
 * SLA: ≤500ms P50 (scoring), ≤3000ms P95 (with LLM)
 *
 * v1.0 Features:
 * - RFM (Recency, Frequency, Quality) scoring model
 * - Health indicator classification (STRONG/NEUTRAL/WEAKENING/LOST)
 * - Trend analysis (IMPROVING/STABLE/DECLINING)
 * - Action recommendations (NURTURE/CHECK_IN/RE_ENGAGE/ESCALATE/ARCHIVE)
 * - LLM-assisted nurture content suggestions (GPT-4)
 * - Response rate tracking
 * - Sentry error tracking
 *
 * Phase 2 Reference: Tool 12 - TRACK_RELATIONSHIP_HEALTH
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const OpenAI = require('openai');
const { relationshipTrackerInputSchema, relationshipTrackerOutputSchema } = require('./schemas/relationshipTrackerSchemas');

class RelationshipTrackerToolStandalone {
  constructor() {
    this.agentName = 'RelationshipTrackerTool';
    this.POLICY_VERSION = 'v1.0';

    // OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'sk-dummy-key-for-testing'
    });

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(relationshipTrackerInputSchema);
    this.validateOutput = ajv.compile(relationshipTrackerOutputSchema);

    // Quality scores for interaction types
    this.QUALITY_SCORES = {
      'MEETING_HELD': 100,
      'CALL_COMPLETED': 80,
      'REPLY_RECEIVED': 60,
      'EMAIL_CLICKED': 40,
      'EMAIL_OPENED': 20,
      'EMAIL_SENT': 5
    };

    // System prompt for nurture content
    this.SYSTEM_PROMPT = `You are Sivakumar suggesting valuable content to nurture a relationship with a contact who hasn't engaged recently. Your suggestions should:
- Be genuinely helpful (not sales-focused)
- Relate to their industry or role
- Be brief and easy to consume
- Demonstrate thought leadership
- Provide a reason to re-connect

Output ONLY valid JSON matching this schema:
{
  "content_type": "ARTICLE|CASE_STUDY|INDUSTRY_UPDATE|HELPFUL_RESOURCE",
  "subject": "email subject line",
  "brief": "2-3 sentences explaining the content value"
}`;
  }

  /**
   * Execute the tool with Sentry error tracking
   * @param {Object} input - Interaction history, contact info, current stage
   * @returns {Promise<Object>} Relationship health assessment with recommendations
   */
  async execute(input) {
    try {
      return await this._executeInternal(input);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'RelationshipTrackerTool',
          primitive: 'TRACK_RELATIONSHIP_HEALTH',
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
      interaction_history,
      contact_info,
      current_stage
    } = input;

    // ═══════════════════════════════════════════════════════
    // PHASE 1: CALCULATE RFM SCORES
    // ═══════════════════════════════════════════════════════

    const daysSinceLastInteraction = this._calculateDaysSince(interaction_history[interaction_history.length - 1].timestamp);
    const recencyScore = this._calculateRecencyScore(daysSinceLastInteraction);

    const daysActive = this._calculateDaysSince(interaction_history[0].timestamp);
    const frequencyScore = this._calculateFrequencyScore(interaction_history.length, daysActive);

    const qualityScore = this._calculateQualityScore(interaction_history);

    const responseRate = this._calculateResponseRate(interaction_history);

    // ═══════════════════════════════════════════════════════
    // PHASE 2: CALCULATE RELATIONSHIP SCORE (WEIGHTED RFM)
    // ═══════════════════════════════════════════════════════

    const relationshipScore = Math.round(
      (recencyScore * 0.4) +
      (frequencyScore * 0.3) +
      (qualityScore * 0.3)
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 3: DETERMINE HEALTH INDICATOR & TREND
    // ═══════════════════════════════════════════════════════

    const trend = this._determineTrend(interaction_history);
    const healthIndicator = this._determineHealthIndicator(relationshipScore, trend);

    // ═══════════════════════════════════════════════════════
    // PHASE 4: RECOMMEND ACTION
    // ═══════════════════════════════════════════════════════

    const recommendation = this._recommendAction(
      healthIndicator,
      daysSinceLastInteraction,
      current_stage,
      contact_info.tier || 'SECONDARY'
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 5: GENERATE NURTURE CONTENT (IF NEEDED)
    // ═══════════════════════════════════════════════════════

    let nurtureContent = null;
    let llmUsed = false;
    let llmTokens = 0;

    if (recommendation.action === 'NURTURE_CONTENT') {
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-dummy-key-for-testing') {
        try {
          nurtureContent = await this._generateNurtureContent({
            contact_info,
            current_stage,
            days_since_last: daysSinceLastInteraction,
            interaction_summary: this._buildInteractionSummary(interaction_history)
          });
          llmUsed = true;
          llmTokens = nurtureContent._tokens || 0;
          delete nurtureContent._tokens;
        } catch (error) {
          console.warn('LLM nurture content generation failed:', error.message);
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 6: ESTIMATE CONVERSION PROBABILITY
    // ═══════════════════════════════════════════════════════

    const conversionProbability = this._estimateConversionProbability(
      relationshipScore,
      healthIndicator,
      current_stage,
      responseRate
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 7: CALCULATE CONFIDENCE
    // ═══════════════════════════════════════════════════════

    let confidence = 1.0;

    // Reduce confidence for sparse data
    if (interaction_history.length < 3) confidence *= 0.8;
    if (daysSinceLastInteraction > 60) confidence *= 0.85;

    confidence = Math.max(0.5, Math.min(1.0, confidence));

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      relationship_health: {
        score: relationshipScore,
        health_indicator: healthIndicator,
        trend,
        days_since_last_interaction: daysSinceLastInteraction
      },
      engagement_metrics: {
        recency_score: recencyScore,
        frequency_score: frequencyScore,
        quality_score: qualityScore,
        response_rate: parseFloat(responseRate.toFixed(2))
      },
      recommendation,
      metadata: {
        confidence: parseFloat(confidence.toFixed(2)),
        total_interactions: interaction_history.length,
        conversion_probability: conversionProbability
      },
      timestamp: new Date().toISOString(),
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'track_relationship_health',
        tool_type: 'DELEGATED',
        policy_version: this.POLICY_VERSION,
        llm_used: llmUsed,
        llm_tokens: llmTokens
      }
    };

    // Add nurture content if generated
    if (nurtureContent) {
      output.nurture_content = nurtureContent;
    }

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
   * Calculate days since a timestamp
   * @private
   */
  _calculateDaysSince(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate recency score (40% weight)
   * @private
   */
  _calculateRecencyScore(daysSince) {
    if (daysSince <= 7) return 100;
    if (daysSince <= 14) return 80;
    if (daysSince <= 30) return 60;
    if (daysSince <= 60) return 40;
    if (daysSince <= 90) return 20;
    return 10; // > 90 days
  }

  /**
   * Calculate frequency score (30% weight)
   * @private
   */
  _calculateFrequencyScore(interactionCount, daysActive) {
    if (daysActive === 0) return 50; // Edge case

    const interactionRate = interactionCount / (daysActive / 30); // per month

    if (interactionRate >= 4) return 100;  // Weekly+
    if (interactionRate >= 2) return 80;   // Bi-weekly
    if (interactionRate >= 1) return 60;   // Monthly
    if (interactionRate >= 0.5) return 40; // Every 2 months
    return 20; // Less than bi-monthly
  }

  /**
   * Calculate quality score (30% weight)
   * @private
   */
  _calculateQualityScore(interactions) {
    let totalQuality = 0;

    interactions.forEach(interaction => {
      totalQuality += this.QUALITY_SCORES[interaction.type] || 0;
    });

    const avgQuality = totalQuality / interactions.length;
    return Math.min(Math.round(avgQuality), 100);
  }

  /**
   * Calculate response rate
   * @private
   */
  _calculateResponseRate(interactions) {
    const sentCount = interactions.filter(i => i.type === 'EMAIL_SENT').length;
    const replyCount = interactions.filter(i => i.type === 'REPLY_RECEIVED').length;

    if (sentCount === 0) return 0;
    return Math.min(replyCount / sentCount, 1.0);
  }

  /**
   * Determine trend direction
   * @private
   */
  _determineTrend(interactions) {
    if (interactions.length < 3) return 'STABLE';

    // Compare recent quality (last 1/3) vs older quality (first 1/3)
    const splitPoint = Math.floor(interactions.length / 3);
    const oldInteractions = interactions.slice(0, splitPoint);
    const recentInteractions = interactions.slice(-splitPoint);

    const oldQuality = this._calculateQualityScore(oldInteractions);
    const recentQuality = this._calculateQualityScore(recentInteractions);

    if (recentQuality > oldQuality * 1.2) return 'IMPROVING';
    if (recentQuality < oldQuality * 0.8) return 'DECLINING';
    return 'STABLE';
  }

  /**
   * Determine health indicator
   * @private
   */
  _determineHealthIndicator(score, trend) {
    if (score >= 75) return 'STRONG';
    if (score >= 50) {
      return trend === 'DECLINING' ? 'WEAKENING' : 'NEUTRAL';
    }
    if (score >= 25) return 'WEAKENING';
    return 'LOST';
  }

  /**
   * Recommend action based on health
   * @private
   */
  _recommendAction(health, daysSince, stage, tier) {
    // STRONG relationships: Nurture with value
    if (health === 'STRONG') {
      return {
        action: 'NURTURE_CONTENT',
        timing_days: 14,
        suggested_message_angle: 'Share valuable industry insights or helpful resources',
        priority: 'MEDIUM'
      };
    }

    // NEUTRAL: Check in
    if (health === 'NEUTRAL' && daysSince >= 30) {
      return {
        action: 'CHECK_IN',
        timing_days: 1,
        suggested_message_angle: 'Casual check-in, ask how things are going',
        priority: 'MEDIUM'
      };
    }

    // WEAKENING: Re-engage urgently
    if (health === 'WEAKENING') {
      return {
        action: 'RE_ENGAGE',
        timing_days: 3,
        suggested_message_angle: 'Add new value, reference recent company news, low-friction ask',
        priority: 'HIGH'
      };
    }

    // LOST: Archive or escalate based on tier
    if (health === 'LOST') {
      if (tier === 'STRATEGIC') {
        return {
          action: 'ESCALATE',
          timing_days: 1,
          suggested_message_angle: 'Escalate to senior banker or try alternative contact',
          priority: 'HIGH'
        };
      } else {
        return {
          action: 'ARCHIVE',
          timing_days: 0,
          suggested_message_angle: 'Close and reallocate effort to higher-potential leads',
          priority: 'LOW'
        };
      }
    }

    // Default
    return {
      action: 'CHECK_IN',
      timing_days: 7,
      suggested_message_angle: 'Standard check-in',
      priority: 'LOW'
    };
  }

  /**
   * Build interaction summary for LLM
   * @private
   */
  _buildInteractionSummary(interactions) {
    const recentInteractions = interactions.slice(-3);
    return recentInteractions.map(i => `${i.type} (${this._calculateDaysSince(i.timestamp)} days ago)`).join(', ');
  }

  /**
   * Generate nurture content using LLM
   * @private
   */
  async _generateNurtureContent({ contact_info, current_stage, days_since_last, interaction_summary }) {
    const userPrompt = `Suggest nurture content for:

Contact: ${contact_info.name}
Company: ${contact_info.company_name} (${contact_info.industry || 'N/A'})
Last Interaction: ${days_since_last} days ago
Relationship Stage: ${current_stage}
Previous Interactions: ${interaction_summary}

Requirements:
- Content should be relevant to ${contact_info.industry || 'their industry'}
- Should provide genuine value, not just "checking in"
- Give them a reason to respond
- Keep it professional and helpful`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 300
      });

      const content = response.choices[0].message.content;
      const contentData = JSON.parse(content);
      contentData._tokens = response.usage?.total_tokens || 0;

      return contentData;

    } catch (error) {
      throw new Error(`LLM nurture content generation failed: ${error.message}`);
    }
  }

  /**
   * Estimate conversion probability
   * @private
   */
  _estimateConversionProbability(score, health, stage, responseRate) {
    let probability = score; // Start with relationship score

    // Adjust for health
    if (health === 'STRONG') probability *= 1.2;
    if (health === 'WEAKENING') probability *= 0.7;
    if (health === 'LOST') probability *= 0.3;

    // Adjust for stage
    const stageMultipliers = {
      'CONVERTED': 1.5,
      'OPPORTUNITY': 1.3,
      'ENGAGED': 1.1,
      'WARMING': 1.0,
      'COLD': 0.7,
      'DORMANT': 0.4
    };
    probability *= (stageMultipliers[stage] || 1.0);

    // Adjust for response rate
    probability *= (0.7 + (responseRate * 0.3)); // 0.7-1.0 multiplier

    return Math.min(Math.round(probability), 100);
  }
}

module.exports = RelationshipTrackerToolStandalone;
