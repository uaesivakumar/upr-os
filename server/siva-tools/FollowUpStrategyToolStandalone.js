/**
 * FollowUpStrategyTool - SIVA Tool 10 (Standalone) - v1.0
 *
 * Implements: DETERMINE_FOLLOWUP_STRATEGY (DELEGATED - Hybrid)
 *
 * Purpose: Determine when/how to follow up based on engagement signals
 * Type: DELEGATED (Hybrid: Deterministic rules + LLM message generation)
 * SLA: ≤500ms P50 (rules), ≤3000ms P95 (with LLM)
 *
 * v1.0 Features:
 * - Deterministic decision matrix for action recommendation
 * - Engagement score calculation (0-100)
 * - LLM-assisted follow-up message generation (GPT-4)
 * - Multi-channel strategy (Email, LinkedIn, Escalate)
 * - Time decay consideration
 * - Sentry error tracking
 *
 * Phase 2 Reference: Tool 10 - DETERMINE_FOLLOWUP_STRATEGY
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const OpenAI = require('openai');
const { followUpStrategyInputSchema, followUpStrategyOutputSchema } = require('./schemas/followUpStrategySchemas');

class FollowUpStrategyToolStandalone {
  constructor() {
    this.agentName = 'FollowUpStrategyTool';
    this.POLICY_VERSION = 'v1.0';

    // OpenAI client (for message generation)
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'sk-dummy-key-for-testing'
    });

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(followUpStrategyInputSchema);
    this.validateOutput = ajv.compile(followUpStrategyOutputSchema);

    // System prompt for follow-up message generation
    this.SYSTEM_PROMPT = `You are Sivakumar writing a follow-up email. The recipient opened your previous email but didn't reply. Your follow-up should:
- Add new value (don't repeat previous message)
- Reference a new company signal if available
- Ask if they received your previous message
- Offer alternative next steps (not just a call)
- Stay professional, not pushy

Output ONLY valid JSON matching this schema:
{
  "subject_line": "max 60 chars, mention follow-up",
  "opening": "1-2 sentences acknowledging previous contact",
  "body": "2-3 sentences adding new value/context",
  "cta": "1-2 sentences with alternative options"
}`;
  }

  /**
   * Execute the tool with Sentry error tracking
   * @param {Object} input - Previous message, engagement signals, contact info
   * @returns {Promise<Object>} Follow-up strategy with optional message
   */
  async execute(input) {
    try {
      return await this._executeInternal(input);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'FollowUpStrategyTool',
          primitive: 'DETERMINE_FOLLOWUP_STRATEGY',
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
      previous_message,
      engagement_signals,
      contact_info,
      company_context = {}
    } = input;

    // ═══════════════════════════════════════════════════════
    // PHASE 1: CALCULATE ENGAGEMENT SCORE
    // ═══════════════════════════════════════════════════════

    const engagementScore = this._calculateEngagementScore(engagement_signals);
    const engagementLevel = this._classifyEngagementLevel(engagementScore);

    // ═══════════════════════════════════════════════════════
    // PHASE 2: DETERMINE ACTION (DETERMINISTIC RULES)
    // ═══════════════════════════════════════════════════════

    const { action, timing_days, reasoning, priority } = this._determineFollowUpAction(
      engagement_signals,
      contact_info.tier || 'SECONDARY',
      engagementLevel
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 3: GENERATE FOLLOW-UP MESSAGE (IF NEEDED)
    // ═══════════════════════════════════════════════════════

    let followUpMessage = null;
    let llmUsed = false;
    let llmTokens = 0;

    if (action === 'FOLLOW_UP_EMAIL' || action === 'FOLLOW_UP_LINKEDIN') {
      // Only generate message if we have OpenAI key
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-dummy-key-for-testing') {
        try {
          followUpMessage = await this._generateFollowUpMessage({
            previous_message,
            contact_info,
            company_context,
            engagement_signals
          });
          llmUsed = true;
          llmTokens = followUpMessage._tokens || 0;
          delete followUpMessage._tokens; // Remove temp field
        } catch (error) {
          console.warn('LLM message generation failed, continuing without message:', error.message);
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 4: CALCULATE CONFIDENCE
    // ═══════════════════════════════════════════════════════

    let confidence = 1.0;

    // Reduce confidence for ambiguous engagement
    if (engagementLevel === 'MEDIUM') confidence *= 0.8;
    if (engagementLevel === 'LOW') confidence *= 0.7;

    // Reduce confidence if far from last contact
    if (engagement_signals.days_since_sent > 30) confidence *= 0.8;

    // Ensure bounds
    confidence = Math.max(0.5, Math.min(1.0, confidence));

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      recommendation: {
        action,
        timing_days,
        reasoning,
        priority
      },
      metadata: {
        engagement_score: engagementScore,
        confidence: parseFloat(confidence.toFixed(2)),
        engagement_level: engagementLevel
      },
      timestamp: new Date().toISOString(),
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'determine_followup_strategy',
        tool_type: 'DELEGATED',
        policy_version: this.POLICY_VERSION,
        llm_used: llmUsed,
        llm_tokens: llmTokens
      }
    };

    // Add follow-up message if generated
    if (followUpMessage) {
      output.follow_up_message = followUpMessage;
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
   * Calculate engagement score (0-100)
   * @private
   */
  _calculateEngagementScore(signals) {
    let score = 0;

    if (signals.email_opened) score += 40;
    if (signals.links_clicked) score += 30;
    if (signals.reply_received) score += 30;

    // Time decay
    if (signals.days_since_sent > 14) score *= 0.7;
    if (signals.days_since_sent > 30) score *= 0.5;

    return Math.round(Math.min(score, 100));
  }

  /**
   * Classify engagement level
   * @private
   */
  _classifyEngagementLevel(score) {
    if (score >= 70) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'NONE';
  }

  /**
   * Determine follow-up action using decision matrix
   * @private
   */
  _determineFollowUpAction(engagement, tier, engagementLevel) {
    // Rule 1: Replied → Close this cycle
    if (engagement.reply_received) {
      return {
        action: 'CLOSE_OPPORTUNITY',
        timing_days: 0,
        reasoning: 'Contact has replied. Opportunity is now active and requires direct response rather than automated follow-up.',
        priority: 'HIGH'
      };
    }

    // Rule 2: Opened + clicked → High interest, follow up soon
    if (engagement.email_opened && engagement.links_clicked) {
      if (engagement.days_since_sent >= 3) {
        return {
          action: 'FOLLOW_UP_EMAIL',
          timing_days: 1,
          reasoning: 'High engagement detected (opened and clicked links). Contact shows strong interest. Follow up to convert interest into action.',
          priority: 'HIGH'
        };
      } else {
        return {
          action: 'WAIT',
          timing_days: 3 - engagement.days_since_sent,
          reasoning: 'High engagement detected but recent. Wait 3 days total before follow-up to avoid appearing pushy.',
          priority: 'MEDIUM'
        };
      }
    }

    // Rule 3: Opened only → Some interest, wait longer
    if (engagement.email_opened && !engagement.links_clicked) {
      if (engagement.days_since_sent >= 7) {
        return {
          action: 'FOLLOW_UP_EMAIL',
          timing_days: 1,
          reasoning: 'Email opened but no link clicks after 7 days. Moderate interest. Follow up with different angle or additional value.',
          priority: 'MEDIUM'
        };
      } else {
        return {
          action: 'WAIT',
          timing_days: 7 - engagement.days_since_sent,
          reasoning: 'Email opened, showing some interest. Wait 7 days total before follow-up.',
          priority: 'LOW'
        };
      }
    }

    // Rule 4: No engagement → Try different channel or close
    if (!engagement.email_opened) {
      if (engagement.days_since_sent >= 7 && engagement.days_since_sent < 14) {
        return {
          action: 'FOLLOW_UP_LINKEDIN',
          timing_days: 1,
          reasoning: 'No email engagement after 7 days. Try alternative channel (LinkedIn) to reach contact.',
          priority: 'MEDIUM'
        };
      } else if (engagement.days_since_sent >= 14) {
        // Strategic tier gets escalation, others close
        if (tier === 'STRATEGIC') {
          return {
            action: 'ESCALATE_CONTACT',
            timing_days: 1,
            reasoning: 'No engagement from STRATEGIC tier contact after 14 days. Escalate to senior banker or alternative contact path.',
            priority: 'HIGH'
          };
        } else {
          return {
            action: 'CLOSE_OPPORTUNITY',
            timing_days: 0,
            reasoning: 'No engagement after 14 days. Close opportunity and reallocate effort to higher-potential leads.',
            priority: 'LOW'
          };
        }
      } else {
        return {
          action: 'WAIT',
          timing_days: 7 - engagement.days_since_sent,
          reasoning: 'No engagement yet but too early to change strategy. Wait 7 days total before trying alternative channel.',
          priority: 'LOW'
        };
      }
    }

    // Default: Wait
    return {
      action: 'WAIT',
      timing_days: 3,
      reasoning: 'Default wait period. Monitor for engagement signals before determining next action.',
      priority: 'LOW'
    };
  }

  /**
   * Generate follow-up message using LLM
   * @private
   */
  async _generateFollowUpMessage({ previous_message, contact_info, company_context, engagement_signals }) {
    const userPrompt = `Generate a follow-up email for:

Previous Email Subject: ${previous_message.subject_line}
Engagement: Email opened ${engagement_signals.days_since_sent} days ago, ${engagement_signals.links_clicked ? 'links clicked' : 'no link clicks'}, no reply
Company: ${contact_info.company_name} (${company_context.industry || 'N/A'})
Contact: ${contact_info.name} (${contact_info.tier || 'N/A'} tier)

Requirements:
- Acknowledge they may be busy
- Add new value (don't repeat previous message)
- Offer alternative next steps (not just a call)
- Keep it brief (shorter than first email)
- Reference that you sent a previous message`;

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
      const messageData = JSON.parse(content);
      messageData._tokens = response.usage?.total_tokens || 0;

      return messageData;

    } catch (error) {
      throw new Error(`LLM follow-up generation failed: ${error.message}`);
    }
  }
}

module.exports = FollowUpStrategyToolStandalone;
