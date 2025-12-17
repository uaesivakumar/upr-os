/**
 * TimingScoreTool - SIVA Decision Primitive 3 (Standalone) - v2.0
 *
 * Implements: CALCULATE_TIMING_SCORE (STRICT)
 *
 * Purpose: Calculate timing multiplier from calendar, signal recency, and UAE business context
 * Type: STRICT (deterministic, no LLM calls)
 * SLA: ≤120ms P50, ≤300ms P95
 *
 * v2.0 Changes:
 * - Natural language reasoning (NO formula exposure - competitive algorithm protected)
 * - Removed numeric multipliers from metadata
 * - Added keyFactors array for context
 * - Sentry error tracking
 *
 * Phase 1 Reference: Decision Primitives §2, Primitive 3
 * Phase 2 Reference: MCP Tool Registry §1, Tool 3
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const { timingScoreInputSchema, timingScoreOutputSchema } = require('./schemas/timingScoreSchemas');
const { v4: uuidv4 } = require('uuid');

// Sprint 28: A/B Testing support
const { ABTestingHelper } = require('../agent-core/ab-testing.js');

// Sprint 28: Scoring adjustments based on feedback
const scoringAdjustments = require('../agent-core/scoring-adjustments.js');

class TimingScoreToolStandalone {
  constructor() {
    this.agentName = 'TimingScoreTool';
    this.POLICY_VERSION = 'v2.0';

    // Sprint 28: Initialize A/B testing helper
    this.abTesting = new ABTestingHelper('TimingScoreTool');

    // Sprint 28: Initialize rule engine for shadow mode comparison
    this.ruleEngine = null;
    this._initRuleEngine();

    // UAE-specific calendar periods for 2025-2026
    this.RAMADAN_PERIODS = [
      { start: new Date('2025-03-01'), end: new Date('2025-03-30'), year: 2025 },
      { start: new Date('2026-02-18'), end: new Date('2026-03-19'), year: 2026 }
    ];

    this.EID_PERIODS = [
      { start: new Date('2025-03-31'), end: new Date('2025-04-13'), year: 2025 }, // 2 weeks after Eid
      { start: new Date('2026-03-20'), end: new Date('2026-04-02'), year: 2026 }
    ];

    this.UAE_NATIONAL_DAY = { month: 12, day: 2, duration: 2 }; // Dec 2-3

    // Signal type decay rates (per week)
    this.SIGNAL_DECAY_RATES = {
      'hiring': 0.90,      // Fast decay - hiring needs are urgent
      'funding': 0.95,     // Medium decay - funding has longer impact
      'expansion': 0.98,   // Slow decay - expansion is long-term
      'award': 0.95,       // Medium decay
      'other': 0.90        // Fast decay (default)
    };

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(timingScoreInputSchema);
    this.validateOutput = ajv.compile(timingScoreOutputSchema);
  }

  /**
   * Initialize rule engine for shadow mode (Sprint 28)
   * @private
   */
  _initRuleEngine() {
    try {
      // Dynamic import for ES modules from CommonJS
      import('../agent-core/TimingScoreRuleEngineWrapper.js').then(module => {
        this.ruleEngine = new module.TimingScoreRuleEngineWrapper();
        console.log('[TimingScore] Rule engine v1.0 initialized for shadow mode');
      }).catch(err => {
        console.warn('[TimingScore] Rule engine not available:', err.message);
        this.ruleEngine = null;
      });
    } catch (error) {
      console.warn('[TimingScore] Rule engine initialization failed:', error.message);
      this.ruleEngine = null;
    }
  }

  /**
   * Execute the tool with Sentry error tracking + Shadow Mode (Sprint 23) + A/B Testing (Sprint 28)
   * @param {Object} input - Timing context data
   * @returns {Promise<Object>} Timing multiplier with natural language reasoning (v2.0)
   */
  async execute(input) {
    const decisionId = uuidv4();

    try {
      // PHASE 1: Execute inline logic (primary - production path)
      const inlineResult = await this._executeInternal(input);

      // PHASE 2: A/B Testing - Select rule version (Sprint 28)
      const entityId = input.signal_type || input.current_date || 'default';
      const selectedVersion = this.abTesting.selectVersion(entityId);
      const distribution = this.abTesting.getDistribution(selectedVersion);

      // PHASE 3: Execute rule engine in parallel (Sprint 28 - shadow mode)
      let ruleResult = null;
      let comparison = null;

      if (this.ruleEngine) {
        try {
          ruleResult = await this.ruleEngine.execute(input);
          ruleResult._meta = ruleResult._meta || {};
          ruleResult._meta.version = selectedVersion;
          comparison = this._compareResults(inlineResult, ruleResult);
        } catch (ruleError) {
          console.error('[TimingScore Rule Engine] Error:', ruleError.message);
          ruleResult = { error: ruleError.message };
          comparison = null;
        }
      }

      // PRD v1.2 Law 3: "SIVA never mutates the world"
      // Decision logging is handled by OS layer via agentDecisionLogger
      // See: os/persistence/agentDecisionLogger.js

      // PHASE 5: Return inline result (production path unchanged)
      inlineResult._meta.decision_id = decisionId;
      inlineResult._meta.shadow_mode_active = !!this.ruleEngine;
      inlineResult._meta.ab_test_group = distribution.group;
      inlineResult._meta.rule_version = selectedVersion;

      return inlineResult;
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'TimingScoreTool',
          primitive: 'CALCULATE_TIMING_SCORE',
          phase: 'Phase_1'
        },
        extra: {
          input: input,
          decisionId: decisionId,
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
      signal_type = 'other',
      signal_age = null,
      current_date,
      fiscal_context = {}
    } = input;

    const currentDate = new Date(current_date);
    const month = currentDate.getMonth() + 1; // 1-12
    const quarter = fiscal_context.quarter || this._inferQuarter(month);

    // ═══════════════════════════════════════════════════════
    // PHASE 1: CALENDAR-BASED MULTIPLIER
    // ═══════════════════════════════════════════════════════

    let calendarMultiplier = 1.0;
    let calendarContext = 'STANDARD';

    // Check Ramadan (highest priority)
    const isRamadan = fiscal_context.is_ramadan !== undefined
      ? fiscal_context.is_ramadan
      : this._isInRamadan(currentDate);

    if (isRamadan) {
      calendarMultiplier = 0.3;
      calendarContext = 'RAMADAN';
    }
    // Check Post-Eid
    else if (fiscal_context.is_post_eid !== undefined
      ? fiscal_context.is_post_eid
      : this._isPostEid(currentDate)) {
      calendarMultiplier = 0.8;
      calendarContext = 'POST_EID_RECOVERY';
    }
    // Check UAE National Day (Dec 2-3)
    else if (this._isNationalDay(currentDate)) {
      calendarMultiplier = 0.8;
      calendarContext = 'UAE_NATIONAL_DAY';
    }
    // Q1 Budget Season (Jan-Feb)
    else if (quarter === 'Q1') {
      calendarMultiplier = 1.3;
      calendarContext = 'Q1_BUDGET_SEASON';
    }
    // Q2 (Mar-May)
    else if (quarter === 'Q2') {
      // Check if Ramadan is approaching
      const ramadanApproaching = this._isRamadanApproaching(currentDate);
      if (ramadanApproaching) {
        calendarMultiplier = 1.2;
        calendarContext = 'Q2_PRE_RAMADAN_RUSH';
      } else {
        calendarMultiplier = 1.0;
        calendarContext = 'Q2_STANDARD';
      }
    }
    // Q3 Summer Slowdown (Jun-Aug)
    else if (quarter === 'Q3') {
      const isSummer = fiscal_context.is_summer !== undefined
        ? fiscal_context.is_summer
        : (month >= 6 && month <= 8);

      if (month === 6) {
        calendarMultiplier = 0.9;
        calendarContext = 'Q3_EARLY_SUMMER';
      } else if (isSummer) {
        calendarMultiplier = 0.7;
        calendarContext = 'Q3_SUMMER_SLOWDOWN';
      } else {
        calendarMultiplier = 0.9;
        calendarContext = 'Q3_STANDARD';
      }
    }
    // Q4 Budget Freeze (Nov-Dec)
    else if (quarter === 'Q4') {
      if (month === 11) {
        calendarMultiplier = 0.9;
        calendarContext = 'Q4_EARLY_FREEZE';
      } else if (month === 12) {
        calendarMultiplier = 0.6;
        calendarContext = 'Q4_BUDGET_FREEZE';
      }
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 2: SIGNAL RECENCY MULTIPLIER
    // ═══════════════════════════════════════════════════════

    let signalRecencyMultiplier = 1.0;
    let signalFreshness = 'STANDARD';

    if (signal_age !== null) {
      if (signal_age <= 7) {
        signalRecencyMultiplier = 1.5;
        signalFreshness = 'HOT';
      } else if (signal_age <= 14) {
        signalRecencyMultiplier = 1.3;
        signalFreshness = 'WARM';
      } else if (signal_age <= 30) {
        signalRecencyMultiplier = 1.1;
        signalFreshness = 'RECENT';
      } else if (signal_age <= 60) {
        signalRecencyMultiplier = 1.0;
        signalFreshness = 'STANDARD';
      } else if (signal_age <= 90) {
        signalRecencyMultiplier = 0.8;
        signalFreshness = 'COOLING';
      } else if (signal_age <= 180) {
        signalRecencyMultiplier = 0.5;
        signalFreshness = 'COLD';
      } else {
        signalRecencyMultiplier = 0.3;
        signalFreshness = 'STALE';
      }

      // Apply signal type decay modifier
      // Decay = decayRate ^ (weeks since signal)
      const weeksSinceSignal = signal_age / 7;
      const decayRate = this.SIGNAL_DECAY_RATES[signal_type] || this.SIGNAL_DECAY_RATES['other'];
      const signalTypeModifier = Math.pow(decayRate, weeksSinceSignal);

      signalRecencyMultiplier *= signalTypeModifier;
    } else {
      // No signal age provided - lower confidence
      confidence -= 0.2;
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: FINAL MULTIPLIER CALCULATION
    // ═══════════════════════════════════════════════════════

    let timingMultiplier = calendarMultiplier * signalRecencyMultiplier;

    // Clamp to 0.0-2.0 range
    timingMultiplier = Math.max(0.0, Math.min(2.0, timingMultiplier));

    // ═══════════════════════════════════════════════════════
    // PHASE 4: CATEGORY CLASSIFICATION
    // ═══════════════════════════════════════════════════════

    let category;
    if (timingMultiplier >= 1.3) {
      category = 'OPTIMAL';
    } else if (timingMultiplier >= 1.0) {
      category = 'GOOD';
    } else if (timingMultiplier >= 0.7) {
      category = 'FAIR';
    } else {
      category = 'POOR';
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 5: NATURAL LANGUAGE REASONING & KEY FACTORS (v2.0)
    // ═══════════════════════════════════════════════════════

    const { reasoning, keyFactors } = this._buildNaturalReasoning({
      category,
      calendarContext,
      signalFreshness,
      signal_type,
      signal_age
    });

    // Calculate next optimal window if timing is POOR/FAIR
    let nextOptimalWindow = null;
    if (category === 'POOR' || category === 'FAIR') {
      nextOptimalWindow = this._findNextOptimalWindow(currentDate);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 6: CONFIDENCE ADJUSTMENT
    // ═══════════════════════════════════════════════════════

    if (!fiscal_context.quarter && !fiscal_context.is_ramadan) {
      confidence -= 0.15; // Inferred fiscal context
    }

    // Ensure confidence bounds
    confidence = Math.max(0.5, Math.min(1.0, confidence));

    // ═══════════════════════════════════════════════════════
    // PHASE 6.5: APPLY SCORING ADJUSTMENTS (Sprint 28)
    // ═══════════════════════════════════════════════════════

    let baseConfidence = confidence;  // Store original confidence
    let adjustment = null;

    try {
      // Get adjustment based on feedback for this tool/version
      const ruleVersion = this.POLICY_VERSION;
      adjustment = await scoringAdjustments.getAdjustment(this.agentName, ruleVersion);

      if (adjustment && adjustment.factor !== 0.0) {
        // Apply adjustment to confidence score
        confidence = scoringAdjustments.applyAdjustment(baseConfidence, adjustment);
      }
    } catch (error) {
      console.warn('[TimingScoreTool] Scoring adjustment failed:', error.message);
      // Continue with base confidence if adjustment fails
    }

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      timing_multiplier: parseFloat(timingMultiplier.toFixed(2)),
      category,
      confidence: parseFloat(confidence.toFixed(2)),
      reasoning,
      timestamp: new Date().toISOString(),
      metadata: {
        calendar_context: calendarContext,
        signal_freshness: signalFreshness,
        key_factors: keyFactors,
        next_optimal_window: nextOptimalWindow,
        scoringAdjustment: adjustment ? {  // Sprint 28: Track scoring adjustments
          applied: adjustment.factor !== 0.0,
          base_confidence: baseConfidence,
          adjusted_confidence: confidence,
          adjustment_factor: adjustment.factor,
          adjustment_confidence: adjustment.confidence,
          metadata: adjustment.metadata
        } : null
      },
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'calculate_timing_score',
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
   * Infer quarter from month
   * @private
   */
  _inferQuarter(month) {
    if (month >= 1 && month <= 3) return 'Q1';
    if (month >= 4 && month <= 6) return 'Q2';
    if (month >= 7 && month <= 9) return 'Q3';
    return 'Q4';
  }

  /**
   * Check if date is during Ramadan
   * @private
   */
  _isInRamadan(date) {
    return this.RAMADAN_PERIODS.some(period =>
      date >= period.start && date <= period.end
    );
  }

  /**
   * Check if date is within 2 weeks after Eid
   * @private
   */
  _isPostEid(date) {
    return this.EID_PERIODS.some(period =>
      date >= period.start && date <= period.end
    );
  }

  /**
   * Check if date is UAE National Day
   * @private
   */
  _isNationalDay(date) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return month === this.UAE_NATIONAL_DAY.month &&
           day >= this.UAE_NATIONAL_DAY.day &&
           day < this.UAE_NATIONAL_DAY.day + this.UAE_NATIONAL_DAY.duration;
  }

  /**
   * Check if Ramadan is approaching within 2 weeks
   * @private
   */
  _isRamadanApproaching(date) {
    return this.RAMADAN_PERIODS.some(period => {
      const daysUntilRamadan = (period.start - date) / (1000 * 60 * 60 * 24);
      return daysUntilRamadan > 0 && daysUntilRamadan <= 14;
    });
  }

  /**
   * Find next optimal outreach window (Q1)
   * @private
   */
  _findNextOptimalWindow(currentDate) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    // If we're past Q1, suggest next year's Q1
    if (month > 3) {
      return `${year + 1}-01-15`; // Mid-January next year
    }

    // If we're before January, suggest upcoming January
    if (month < 1) {
      return `${year}-01-15`;
    }

    // If we're in Q1 but timing is still poor (e.g., Ramadan), suggest February
    if (month <= 2) {
      return `${year}-02-15`;
    }

    // Otherwise suggest next Q1
    return `${year + 1}-01-15`;
  }

  /**
   * Build natural language reasoning (v2.0 - NO formula exposure)
   * @private
   */
  _buildNaturalReasoning({ category, calendarContext, signalFreshness, signal_type, signal_age }) {
    const keyFactors = [];
    let reasoning = '';

    // Build reasoning based on category
    if (category === 'OPTIMAL') {
      const factors = [];

      if (calendarContext === 'Q1_BUDGET_SEASON') {
        factors.push('Q1 budget season');
        keyFactors.push('NEW_BUDGETS_UNLOCKED');
      }

      if (calendarContext === 'Q2_PRE_RAMADAN_RUSH') {
        factors.push('pre-Ramadan rush period');
        keyFactors.push('PRE_RAMADAN_URGENCY');
      }

      if (signalFreshness === 'HOT' || signalFreshness === 'WARM') {
        factors.push('fresh signal');
        keyFactors.push('FRESH_SIGNAL');
      }

      if (signal_type === 'expansion' || signal_type === 'funding') {
        factors.push(`${signal_type} opportunity`);
        keyFactors.push('HIGH_GROWTH_SIGNAL');
      }

      keyFactors.push('HIGH_DECISION_VELOCITY');

      reasoning = `Optimal timing: ${factors.join(' with ')}. High likelihood of decision-maker availability and budget approval readiness.`;

    } else if (category === 'GOOD') {
      const factors = [];

      if (calendarContext.includes('Q2') || calendarContext.includes('Q3_EARLY')) {
        factors.push('standard business period');
        keyFactors.push('STANDARD_BUSINESS_PERIOD');
      }

      if (signalFreshness === 'RECENT' || signalFreshness === 'STANDARD') {
        factors.push('reasonable signal freshness');
        keyFactors.push('MODERATE_SIGNAL_AGE');
      }

      if (signal_type === 'hiring') {
        factors.push('hiring activity');
        keyFactors.push('HIRING_INDICATOR');
      }

      keyFactors.push('NORMAL_CONVERSION_LIKELIHOOD');

      reasoning = `Good timing: ${factors.join(' with ')}. Normal conversion likelihood with standard outreach approach.`;

    } else if (category === 'FAIR') {
      const constraints = [];

      if (calendarContext === 'Q3_SUMMER_SLOWDOWN') {
        constraints.push('summer vacation period');
        keyFactors.push('SUMMER_SLOWDOWN');
      }

      if (calendarContext === 'Q4_EARLY_FREEZE') {
        constraints.push('approaching budget freeze');
        keyFactors.push('BUDGET_CONSTRAINTS');
      }

      if (signalFreshness === 'COOLING' || signalFreshness === 'COLD') {
        constraints.push('aging signals');
        keyFactors.push('SIGNAL_DECAY');
      }

      keyFactors.push('LOWER_PRIORITY_TIMING');

      reasoning = `Moderate timing: ${constraints.join(' and ')}. Consider prioritizing other opportunities or waiting for better window.`;

    } else { // POOR
      const issues = [];

      if (calendarContext === 'RAMADAN') {
        issues.push('Ramadan business slowdown');
        keyFactors.push('RAMADAN_PERIOD');
      } else if (calendarContext === 'POST_EID_RECOVERY') {
        issues.push('post-Eid recovery period');
        keyFactors.push('POST_EID_RECOVERY');
      } else if (calendarContext === 'Q4_BUDGET_FREEZE') {
        issues.push('year-end budget freeze');
        keyFactors.push('BUDGET_FREEZE');
      }

      if (signalFreshness === 'STALE') {
        issues.push('very old signals');
        keyFactors.push('STALE_SIGNAL');
      }

      keyFactors.push('UNFAVORABLE_CONDITIONS');

      reasoning = `Poor timing: ${issues.join(' and ')}. Strongly recommend waiting for more favorable conditions or fresh signals.`;
    }

    return { reasoning, keyFactors };
  }

  /**
   * Compare inline result with rule engine result (Sprint 28)
   * @private
   */
  _compareResults(inlineResult, ruleResult) {
    if (!ruleResult || ruleResult.error) {
      return {
        match: false,
        reason: 'Rule engine error or unavailable',
        inline_timing_multiplier: inlineResult.timing_multiplier,
        rule_timing_multiplier: null
      };
    }

    const multiplierMatch = Math.abs(inlineResult.timing_multiplier - ruleResult.timing_multiplier) < 0.1;
    const categoryMatch = inlineResult.category === ruleResult.category;
    const confidenceDiff = Math.abs(inlineResult.confidence - ruleResult.confidence);

    return {
      match: multiplierMatch && categoryMatch,
      multiplier_match: multiplierMatch,
      category_match: categoryMatch,
      inline_timing_multiplier: inlineResult.timing_multiplier,
      rule_timing_multiplier: ruleResult.timing_multiplier,
      inline_category: inlineResult.category,
      rule_category: ruleResult.category,
      multiplier_diff: Math.abs(inlineResult.timing_multiplier - ruleResult.timing_multiplier),
      confidence_diff: confidenceDiff,
      reason: multiplierMatch && categoryMatch ? 'Results match' : 'Results differ'
    };
  }

  // NOTE: _logDecision method REMOVED per PRD v1.2 Law 3
  // "SIVA never mutates the world" - OS layer handles persistence
}

module.exports = TimingScoreToolStandalone;
