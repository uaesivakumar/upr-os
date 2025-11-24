/**
 * TimingScoreRuleEngineV1 - Sprint 25
 *
 * Implements cognitive rules for timing score calculation from timing_score_v1.0.json
 *
 * Features:
 * - Calendar-based multiplier (Ramadan, Eid, National Day, Q1/Q2/Q3/Q4 patterns)
 * - Signal recency multiplier (HOT, WARM, RECENT, STANDARD, COOLING, COLD, STALE)
 * - Signal type decay modifier (hiring, funding, expansion, award, other)
 * - Category classification (OPTIMAL, GOOD, FAIR, POOR)
 * - Next optimal window calculation
 * - Confidence adjustments based on data quality
 * - Full explainability with reasoning breakdown
 *
 * Usage:
 *   const engine = new TimingScoreRuleEngineV1();
 *   const result = await engine.execute(input);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TimingScoreRuleEngineV1 {
  constructor() {
    // Load cognitive rules
    const rulesPath = path.join(__dirname, 'timing_score_v1.0.json');
    this.rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    this.version = this.rules.version;
    this.ruleConfig = this.rules.rules.calculate_timing_score;
  }

  /**
   * Main execution method
   */
  async execute(input) {
    const startTime = Date.now();
    const breakdown = [];
    const reasoning = [];

    try {
      // Extract inputs
      const {
        signal_type = 'other',
        signal_age = null,
        current_date,
        fiscal_context = {}
      } = input;

      const currentDate = new Date(current_date);
      const month = currentDate.getMonth() + 1; // 1-12
      const day = currentDate.getDate();

      // Phase 1: Calculate calendar multiplier
      const calendarResult = this._calculateCalendarMultiplier(
        currentDate, month, day, fiscal_context, breakdown, reasoning
      );

      // Phase 2: Calculate signal recency multiplier
      const signalRecencyResult = this._calculateSignalRecencyMultiplier(
        signal_age, breakdown, reasoning
      );

      // Phase 3: Apply signal type decay modifier
      const signalTypeDecay = this._calculateSignalTypeDecay(
        signal_type, signal_age, breakdown, reasoning
      );

      // Phase 4: Calculate final timing multiplier
      const timingMultiplierRaw = calendarResult.multiplier *
                                   signalRecencyResult.multiplier *
                                   signalTypeDecay;

      // Clamp to [0.0, 2.0]
      const timingMultiplier = Math.max(0.0, Math.min(2.0, timingMultiplierRaw));

      breakdown.push({
        step: 'final_multiplier',
        calendar: calendarResult.multiplier,
        signal_recency: signalRecencyResult.multiplier,
        signal_decay: signalTypeDecay,
        raw: timingMultiplierRaw,
        clamped: timingMultiplier
      });

      // Phase 5: Classify category
      const category = this._classifyCategory(timingMultiplier, breakdown);

      // Phase 6: Build natural language reasoning
      const reasoningText = this._buildReasoning(
        category,
        calendarResult.context,
        signalRecencyResult.freshness,
        signal_type,
        signal_age
      );

      // Phase 7: Build key factors
      const keyFactors = this._buildKeyFactors(
        calendarResult.context,
        signalRecencyResult.freshness,
        signal_type
      );

      // Phase 8: Calculate next optimal window (if POOR or FAIR)
      let nextOptimalWindow = null;
      if (category === 'POOR' || category === 'FAIR') {
        nextOptimalWindow = this._findNextOptimalWindow(currentDate);
      }

      // Phase 9: Calculate confidence
      const confidence = this._calculateConfidence(
        fiscal_context,
        signal_age,
        signalRecencyResult,
        breakdown
      );

      const executionTime = Date.now() - startTime;

      return {
        timing_multiplier: parseFloat(timingMultiplier.toFixed(2)),
        category,
        confidence: parseFloat(confidence.toFixed(2)),
        reasoning: reasoningText,
        timestamp: new Date().toISOString(),
        metadata: {
          calendar_context: calendarResult.context,
          signal_freshness: signalRecencyResult.freshness,
          key_factors: keyFactors,
          next_optimal_window: nextOptimalWindow
        },
        _meta: {
          latency_ms: executionTime,
          tool_name: 'calculate_timing_score',
          tool_type: 'STRICT',
          policy_version: this.version,
          breakdown,
          reasoning_steps: reasoning
        }
      };

    } catch (error) {
      return {
        error: error.message,
        version: this.version,
        _meta: {
          latency_ms: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Phase 1: Calculate calendar-based multiplier
   */
  _calculateCalendarMultiplier(currentDate, month, day, fiscal_context, breakdown, reasoning) {
    const { uae_calendar_periods } = this.ruleConfig;

    // Check Ramadan (highest priority)
    const isRamadan = fiscal_context.is_ramadan !== undefined
      ? fiscal_context.is_ramadan
      : this._isInPeriod(currentDate, [uae_calendar_periods.ramadan_2025, uae_calendar_periods.ramadan_2026]);

    if (isRamadan) {
      breakdown.push({ step: 'calendar', context: 'RAMADAN', multiplier: 0.3 });
      reasoning.push('Ramadan period detected - very low business activity (multiplier: 0.3)');
      return { multiplier: 0.3, context: 'RAMADAN' };
    }

    // Check Post-Eid
    const isPostEid = fiscal_context.is_post_eid !== undefined
      ? fiscal_context.is_post_eid
      : this._isInPeriod(currentDate, [uae_calendar_periods.eid_2025, uae_calendar_periods.eid_2026]);

    if (isPostEid) {
      breakdown.push({ step: 'calendar', context: 'POST_EID_RECOVERY', multiplier: 0.8 });
      reasoning.push('Post-Eid recovery period - reduced activity (multiplier: 0.8)');
      return { multiplier: 0.8, context: 'POST_EID_RECOVERY' };
    }

    // Check UAE National Day (Dec 2-3)
    const isNationalDay = this._isNationalDay(month, day, uae_calendar_periods.national_day);
    if (isNationalDay) {
      breakdown.push({ step: 'calendar', context: 'UAE_NATIONAL_DAY', multiplier: 0.8 });
      reasoning.push('UAE National Day period - reduced activity (multiplier: 0.8)');
      return { multiplier: 0.8, context: 'UAE_NATIONAL_DAY' };
    }

    // Infer quarter
    const quarter = fiscal_context.quarter || this._inferQuarter(month);

    // Q1 Budget Season (Jan-Mar)
    if (quarter === 'Q1') {
      breakdown.push({ step: 'calendar', context: 'Q1_BUDGET_SEASON', multiplier: 1.3, quarter });
      reasoning.push('Q1 budget season - high activity and decision-making (multiplier: 1.3)');
      return { multiplier: 1.3, context: 'Q1_BUDGET_SEASON' };
    }

    // Q2 (Apr-Jun)
    if (quarter === 'Q2') {
      const ramadanApproaching = this._isRamadanApproaching(currentDate, [uae_calendar_periods.ramadan_2025, uae_calendar_periods.ramadan_2026]);
      if (ramadanApproaching) {
        breakdown.push({ step: 'calendar', context: 'Q2_PRE_RAMADAN_RUSH', multiplier: 1.2, quarter });
        reasoning.push('Q2 pre-Ramadan rush - elevated activity before slowdown (multiplier: 1.2)');
        return { multiplier: 1.2, context: 'Q2_PRE_RAMADAN_RUSH' };
      } else {
        breakdown.push({ step: 'calendar', context: 'Q2_STANDARD', multiplier: 1.0, quarter });
        reasoning.push('Q2 standard period - normal business activity (multiplier: 1.0)');
        return { multiplier: 1.0, context: 'Q2_STANDARD' };
      }
    }

    // Q3 Summer Slowdown (Jul-Sep)
    if (quarter === 'Q3') {
      const isSummer = fiscal_context.is_summer !== undefined
        ? fiscal_context.is_summer
        : (month >= 7 && month <= 8);

      if (month === 6) {
        breakdown.push({ step: 'calendar', context: 'Q3_EARLY_SUMMER', multiplier: 0.9, quarter });
        reasoning.push('Q3 early summer - slightly reduced activity (multiplier: 0.9)');
        return { multiplier: 0.9, context: 'Q3_EARLY_SUMMER' };
      } else if (isSummer) {
        breakdown.push({ step: 'calendar', context: 'Q3_SUMMER_SLOWDOWN', multiplier: 0.7, quarter });
        reasoning.push('Q3 summer slowdown - very low activity (multiplier: 0.7)');
        return { multiplier: 0.7, context: 'Q3_SUMMER_SLOWDOWN' };
      } else {
        breakdown.push({ step: 'calendar', context: 'Q3_STANDARD', multiplier: 0.9, quarter });
        reasoning.push('Q3 standard period - slightly reduced activity (multiplier: 0.9)');
        return { multiplier: 0.9, context: 'Q3_STANDARD' };
      }
    }

    // Q4 Budget Freeze (Oct-Dec)
    if (quarter === 'Q4') {
      if (month === 11) {
        breakdown.push({ step: 'calendar', context: 'Q4_EARLY_FREEZE', multiplier: 0.9, quarter });
        reasoning.push('Q4 early freeze (November) - reduced activity (multiplier: 0.9)');
        return { multiplier: 0.9, context: 'Q4_EARLY_FREEZE' };
      } else if (month === 12) {
        breakdown.push({ step: 'calendar', context: 'Q4_BUDGET_FREEZE', multiplier: 0.6, quarter });
        reasoning.push('Q4 budget freeze (December) - very low activity (multiplier: 0.6)');
        return { multiplier: 0.6, context: 'Q4_BUDGET_FREEZE' };
      }
    }

    // Default: Standard period
    breakdown.push({ step: 'calendar', context: 'STANDARD', multiplier: 1.0, quarter });
    reasoning.push('Standard calendar period - normal business activity (multiplier: 1.0)');
    return { multiplier: 1.0, context: 'STANDARD' };
  }

  /**
   * Phase 2: Calculate signal recency multiplier
   */
  _calculateSignalRecencyMultiplier(signal_age, breakdown, reasoning) {
    if (signal_age === null) {
      breakdown.push({ step: 'signal_recency', freshness: 'STANDARD', multiplier: 1.0, age: null });
      reasoning.push('Signal age not provided - assuming standard freshness (multiplier: 1.0, confidence penalty: -0.2)');
      return { multiplier: 1.0, freshness: 'STANDARD', confidence_penalty: 0.2 };
    }

    let multiplier, freshness;

    if (signal_age <= 7) {
      multiplier = 1.5;
      freshness = 'HOT';
    } else if (signal_age <= 14) {
      multiplier = 1.3;
      freshness = 'WARM';
    } else if (signal_age <= 30) {
      multiplier = 1.1;
      freshness = 'RECENT';
    } else if (signal_age <= 60) {
      multiplier = 1.0;
      freshness = 'STANDARD';
    } else if (signal_age <= 90) {
      multiplier = 0.8;
      freshness = 'COOLING';
    } else if (signal_age <= 180) {
      multiplier = 0.5;
      freshness = 'COLD';
    } else {
      multiplier = 0.3;
      freshness = 'STALE';
    }

    breakdown.push({ step: 'signal_recency', freshness, multiplier, age: signal_age });
    reasoning.push(`Signal is ${freshness} (${signal_age} days old) - base multiplier: ${multiplier}`);

    return { multiplier, freshness, confidence_penalty: 0 };
  }

  /**
   * Phase 3: Calculate signal type decay modifier
   */
  _calculateSignalTypeDecay(signal_type, signal_age, breakdown, reasoning) {
    if (signal_age === null) {
      breakdown.push({ step: 'signal_type_decay', type: signal_type, modifier: 1.0, reason: 'No signal age' });
      return 1.0;
    }

    const { decay_rates, default_decay_rate } = this.ruleConfig.computed_variables.signal_type_decay_modifier;
    const decayRate = decay_rates[signal_type] || default_decay_rate;
    const weeksSinceSignal = signal_age / 7;
    const modifier = Math.pow(decayRate, weeksSinceSignal);

    breakdown.push({
      step: 'signal_type_decay',
      type: signal_type,
      decay_rate: decayRate,
      weeks: weeksSinceSignal,
      modifier
    });
    reasoning.push(`Signal type "${signal_type}" decay modifier: ${modifier.toFixed(3)} (decay rate: ${decayRate}, weeks: ${weeksSinceSignal.toFixed(1)})`);

    return modifier;
  }

  /**
   * Phase 5: Classify category based on timing multiplier
   */
  _classifyCategory(timingMultiplier, breakdown) {
    const { category_classification } = this.ruleConfig;

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

    breakdown.push({ step: 'category', value: category, multiplier: timingMultiplier });

    return category;
  }

  /**
   * Phase 6: Build natural language reasoning
   */
  _buildReasoning(category, calendarContext, signalFreshness, signalType, signalAge) {
    const templates = this.ruleConfig.reasoning_templates[category];

    const calendarReason = templates.calendar_primary
      .replace('{calendar_context}', calendarContext.toLowerCase().replace(/_/g, ' '));

    const ageText = signalAge !== null ? signalAge : 'unknown';
    const signalReason = templates.signal_primary
      .replace('{signal_freshness}', signalFreshness.toLowerCase())
      .replace('{signal_age}', ageText);

    let reasoning = templates.combined
      .replace('{calendar_reason}', calendarReason)
      .replace('{signal_reason}', signalReason)
      .replace('{signal_type}', signalType);

    return reasoning;
  }

  /**
   * Phase 7: Build key factors array
   */
  _buildKeyFactors(calendarContext, signalFreshness, signalType) {
    const { key_factors_mapping } = this.ruleConfig;

    const factors = [];

    // Add calendar context factors
    if (key_factors_mapping.calendar_context[calendarContext]) {
      factors.push(...key_factors_mapping.calendar_context[calendarContext]);
    }

    // Add signal freshness factors
    if (key_factors_mapping.signal_freshness[signalFreshness]) {
      factors.push(...key_factors_mapping.signal_freshness[signalFreshness]);
    }

    // Add signal type factors
    if (key_factors_mapping.signal_type[signalType]) {
      factors.push(...key_factors_mapping.signal_type[signalType]);
    }

    return factors;
  }

  /**
   * Phase 8: Find next optimal window (Q1)
   */
  _findNextOptimalWindow(currentDate) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    // If we're past Q1, suggest next year's Q1
    if (month > 3) {
      return `${year + 1}-01-15`; // Mid-January next year
    } else {
      return `${year}-01-15`; // Mid-January this year
    }
  }

  /**
   * Phase 9: Calculate confidence with adjustments
   */
  _calculateConfidence(fiscal_context, signal_age, signalRecencyResult, breakdown) {
    let confidence = 1.0;
    const penalties = [];

    // No fiscal context provided
    if (!fiscal_context.quarter && fiscal_context.is_ramadan === undefined) {
      confidence -= 0.15;
      penalties.push({ reason: 'Inferred fiscal context', penalty: 0.15 });
    }

    // No signal age provided
    if (signal_age === null) {
      confidence -= 0.2;
      penalties.push({ reason: 'Signal age not provided', penalty: 0.2 });
    }

    // Apply signal recency confidence penalty (if any)
    if (signalRecencyResult.confidence_penalty) {
      confidence -= signalRecencyResult.confidence_penalty;
    }

    // Ensure confidence bounds [0.5, 1.0]
    confidence = Math.max(0.5, Math.min(1.0, confidence));

    if (penalties.length > 0) {
      breakdown.push({ step: 'confidence', base: 1.0, penalties, final: confidence });
    }

    return confidence;
  }

  /**
   * Helper: Check if date is in period
   */
  _isInPeriod(date, periods) {
    return periods.some(period => {
      const start = new Date(period.start);
      const end = new Date(period.end);
      return date >= start && date <= end;
    });
  }

  /**
   * Helper: Check if date is UAE National Day
   */
  _isNationalDay(month, day, nationalDayConfig) {
    return month === nationalDayConfig.month &&
           day >= nationalDayConfig.day &&
           day < nationalDayConfig.day + nationalDayConfig.duration_days;
  }

  /**
   * Helper: Check if Ramadan is approaching within 2 weeks
   */
  _isRamadanApproaching(currentDate, ramadanPeriods) {
    return ramadanPeriods.some(period => {
      const ramadanStart = new Date(period.start);
      const daysUntilRamadan = (ramadanStart - currentDate) / (1000 * 60 * 60 * 24);
      return daysUntilRamadan > 0 && daysUntilRamadan <= 14;
    });
  }

  /**
   * Helper: Infer quarter from month
   */
  _inferQuarter(month) {
    if (month >= 1 && month <= 3) return 'Q1';
    if (month >= 4 && month <= 6) return 'Q2';
    if (month >= 7 && month <= 9) return 'Q3';
    return 'Q4';
  }
}
