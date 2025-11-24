/**
 * TimingScoreRuleEngineWrapper - Sprint 28
 *
 * Wraps the generic RuleEngine to execute timing_score_v1.0.json rules
 * Provides a consistent interface for shadow mode comparison in TimingScoreTool
 *
 * Usage:
 *   const engine = new TimingScoreRuleEngineWrapper();
 *   const result = await engine.execute(input);
 */

import { RuleEngine } from './rule-engine.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TimingScoreRuleEngineWrapper {
  constructor() {
    // Load the timing_score_v1.0.json rule file
    const rulesPath = path.join(__dirname, 'timing_score_v1.0.json');
    this.ruleEngine = new RuleEngine(rulesPath);
    this.version = 'v1.0';
  }

  /**
   * Execute the timing score rule
   * Adapts input format and output to match TimingScoreTool inline format
   */
  async execute(input) {
    const startTime = Date.now();

    try {
      // Prepare input for rule engine
      const ruleInput = this._prepareInput(input);

      // Execute the calculate_timing_score rule
      const ruleResult = await this.ruleEngine.execute('calculate_timing_score', ruleInput);

      if (ruleResult.error) {
        return {
          error: ruleResult.error,
          version: this.version,
          _meta: {
            latency_ms: Date.now() - startTime
          }
        };
      }

      // Transform rule engine output to match TimingScoreTool format
      const output = this._transformOutput(ruleResult, input);
      output._meta.latency_ms = Date.now() - startTime;

      return output;

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
   * Prepare input for rule engine execution
   * @private
   */
  _prepareInput(input) {
    // Extract fields needed by rule engine
    const currentDate = new Date(input.current_date || new Date());

    return {
      current_date: currentDate.toISOString().split('T')[0],
      current_date_month: currentDate.getMonth() + 1,
      current_date_day: currentDate.getDate(),
      signal_type: input.signal_type || 'other',
      signal_age: input.signal_age || null,
      fiscal_context: input.fiscal_context || {},
      ramadan_approaching: input.ramadan_approaching || false
    };
  }

  /**
   * Transform rule engine output to TimingScoreTool format
   * @private
   */
  _transformOutput(ruleResult, originalInput) {
    // Extract computed variables from rule engine result
    const variables = ruleResult.variables || {};

    const timingMultiplier = variables.timing_multiplier || 1.0;
    const calendarContext = variables.calendar_context || 'STANDARD';
    const signalFreshness = variables.signal_freshness || 'STANDARD';

    // Determine category from timing_multiplier
    let category = 'FAIR';
    if (timingMultiplier >= 1.3) {
      category = 'OPTIMAL';
    } else if (timingMultiplier >= 1.0) {
      category = 'GOOD';
    } else if (timingMultiplier >= 0.7) {
      category = 'FAIR';
    } else {
      category = 'POOR';
    }

    // Build reasoning from templates
    const reasoning = this._buildReasoning(
      category,
      calendarContext,
      signalFreshness,
      originalInput.signal_type || 'other',
      originalInput.signal_age || null
    );

    // Build key factors
    const keyFactors = this._buildKeyFactors(calendarContext, signalFreshness, originalInput.signal_type);

    // Calculate next optimal window if timing is poor/fair
    let nextOptimalWindow = null;
    if (category === 'POOR' || category === 'FAIR') {
      const currentMonth = new Date(originalInput.current_date || new Date()).getMonth() + 1;
      const currentYear = new Date(originalInput.current_date || new Date()).getFullYear();
      if (currentMonth > 3) {
        nextOptimalWindow = `${currentYear + 1}-01-15`;
      } else {
        nextOptimalWindow = `${currentYear}-01-15`;
      }
    }

    return {
      timing_multiplier: parseFloat(timingMultiplier.toFixed(2)),
      category,
      confidence: parseFloat(ruleResult.confidence.toFixed(2)),
      reasoning,
      timestamp: new Date().toISOString(),
      metadata: {
        calendar_context: calendarContext,
        signal_freshness: signalFreshness,
        key_factors: keyFactors,
        next_optimal_window: nextOptimalWindow
      },
      _meta: {
        tool_name: 'calculate_timing_score',
        tool_type: 'STRICT',
        policy_version: this.version,
        rule_engine_version: this.version
      }
    };
  }

  /**
   * Build natural language reasoning from templates
   * @private
   */
  _buildReasoning(category, calendarContext, signalFreshness, signalType, signalAge) {
    const templates = {
      'OPTIMAL': {
        calendar: `Excellent timing with ${calendarContext} providing strong calendar advantage.`,
        signal: `Signal is ${signalFreshness} (${signalAge || 'unknown'} days old), making this an ideal time to engage.`,
        combined: `Signal type: ${signalType}.`
      },
      'GOOD': {
        calendar: `Good timing with ${calendarContext} providing favorable conditions.`,
        signal: `Signal freshness is ${signalFreshness} (${signalAge || 'unknown'} days old), supporting timely outreach.`,
        combined: `Signal type: ${signalType}.`
      },
      'FAIR': {
        calendar: `Moderate timing with ${calendarContext}.`,
        signal: `Signal is ${signalFreshness} (${signalAge || 'unknown'} days old), outreach is still viable.`,
        combined: `Signal type: ${signalType}. Consider waiting for optimal window if possible.`
      },
      'POOR': {
        calendar: `Unfavorable timing with ${calendarContext} creating significant headwinds.`,
        signal: `Signal is ${signalFreshness} (${signalAge || 'unknown'} days old), reducing urgency.`,
        combined: `Signal type: ${signalType}. Strong recommendation to wait for better timing.`
      }
    };

    const template = templates[category];
    return `${template.calendar} ${template.signal} ${template.combined}`;
  }

  /**
   * Build key factors array from context
   * @private
   */
  _buildKeyFactors(calendarContext, signalFreshness, signalType) {
    const factors = [];

    // Calendar factors
    const calendarMap = {
      'RAMADAN': ['RAMADAN_PERIOD', 'VERY_LOW_ACTIVITY'],
      'POST_EID_RECOVERY': ['POST_EID', 'REDUCED_ACTIVITY'],
      'UAE_NATIONAL_DAY': ['UAE_NATIONAL_DAY', 'REDUCED_ACTIVITY'],
      'Q1_BUDGET_SEASON': ['Q1_BUDGET_SEASON', 'HIGH_ACTIVITY'],
      'Q2_PRE_RAMADAN_RUSH': ['Q2_PRE_RAMADAN', 'ELEVATED_ACTIVITY'],
      'Q2_STANDARD': ['Q2_STANDARD'],
      'Q3_EARLY_SUMMER': ['Q3_EARLY_SUMMER', 'SLIGHTLY_REDUCED'],
      'Q3_SUMMER_SLOWDOWN': ['Q3_SUMMER', 'VERY_LOW_ACTIVITY'],
      'Q3_STANDARD': ['Q3_STANDARD'],
      'Q4_EARLY_FREEZE': ['Q4_EARLY_FREEZE', 'REDUCED_ACTIVITY'],
      'Q4_BUDGET_FREEZE': ['Q4_BUDGET_FREEZE', 'VERY_LOW_ACTIVITY'],
      'STANDARD': ['STANDARD_PERIOD']
    };
    factors.push(...(calendarMap[calendarContext] || ['STANDARD_PERIOD']));

    // Signal freshness factors
    const freshnessMap = {
      'HOT': ['HOT_SIGNAL', 'HIGH_URGENCY'],
      'WARM': ['WARM_SIGNAL', 'ELEVATED_URGENCY'],
      'RECENT': ['RECENT_SIGNAL'],
      'STANDARD': ['STANDARD_SIGNAL'],
      'COOLING': ['COOLING_SIGNAL', 'REDUCED_URGENCY'],
      'COLD': ['COLD_SIGNAL', 'LOW_URGENCY'],
      'STALE': ['STALE_SIGNAL', 'MINIMAL_URGENCY']
    };
    factors.push(...(freshnessMap[signalFreshness] || ['STANDARD_SIGNAL']));

    // Signal type factors
    const signalTypeMap = {
      'hiring': ['HIRING_SIGNAL', 'FAST_DECAY'],
      'funding': ['FUNDING_SIGNAL', 'MEDIUM_DECAY'],
      'expansion': ['EXPANSION_SIGNAL', 'SLOW_DECAY'],
      'award': ['AWARD_SIGNAL', 'MEDIUM_DECAY'],
      'other': ['OTHER_SIGNAL', 'FAST_DECAY']
    };
    factors.push(...(signalTypeMap[signalType] || ['OTHER_SIGNAL', 'FAST_DECAY']));

    return factors;
  }
}
