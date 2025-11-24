/**
 * Lifecycle Transition Triggers
 * Manages conditions and rules that trigger automatic state transitions
 *
 * Responsibilities:
 * - Evaluate transition conditions
 * - Check if opportunities are eligible for transitions
 * - Apply transition rules
 * - Trigger automated transitions
 */

import { LifecycleStates } from './lifecycleStateEngine.js';

// Condition types for transitions
export const ConditionTypes = {
  TIME_BASED: 'time_based',       // Based on time in state
  EVENT_BASED: 'event_based',     // Based on specific events
  SCORE_BASED: 'score_based',     // Based on quality/engagement scores
  ACTIVITY_BASED: 'activity_based' // Based on activity/inactivity
};

/**
 * Lifecycle Transition Triggers service
 */
export class LifecycleTransitionTriggers {
  constructor(persistence) {
    this.persistence = persistence;
    this.customEvaluators = new Map();
  }

  /**
   * Register a custom condition evaluator
   */
  registerEvaluator(conditionType, evaluatorFn) {
    this.customEvaluators.set(conditionType, evaluatorFn);
  }

  /**
   * Evaluate a single rule against an opportunity
   */
  async evaluateRule(rule, opportunityState) {
    const { condition_type, condition_config } = rule;

    switch (condition_type) {
      case ConditionTypes.TIME_BASED:
        return this.evaluateTimeBased(condition_config, opportunityState);

      case ConditionTypes.ACTIVITY_BASED:
        return this.evaluateActivityBased(condition_config, opportunityState);

      case ConditionTypes.SCORE_BASED:
        return this.evaluateScoreBased(condition_config, opportunityState);

      case ConditionTypes.EVENT_BASED:
        return this.evaluateEventBased(condition_config, opportunityState);

      default:
        // Check custom evaluators
        if (this.customEvaluators.has(condition_type)) {
          const evaluator = this.customEvaluators.get(condition_type);
          return await evaluator(condition_config, opportunityState);
        }
        return false;
    }
  }

  /**
   * Evaluate time-based condition
   * Example: transition after N hours/days in state
   */
  evaluateTimeBased(config, opportunityState) {
    const { hours, days, minutes } = config;
    const secondsInState = opportunityState.seconds_in_state || 0;

    let thresholdSeconds = 0;

    if (minutes) {
      thresholdSeconds = minutes * 60;
    } else if (hours) {
      thresholdSeconds = hours * 3600;
    } else if (days) {
      thresholdSeconds = days * 86400;
    }

    return secondsInState >= thresholdSeconds;
  }

  /**
   * Evaluate activity-based condition
   * Example: no activity for N days
   */
  evaluateActivityBased(config, opportunityState) {
    const { days_inactive } = config;

    if (!days_inactive) {
      return false;
    }

    const secondsInState = opportunityState.seconds_in_state || 0;
    const thresholdSeconds = days_inactive * 86400;

    return secondsInState >= thresholdSeconds;
  }

  /**
   * Evaluate score-based condition
   * Example: quality_score >= 70
   */
  evaluateScoreBased(config, opportunityState) {
    const { score_field, min_score, max_score } = config;
    const metadata = opportunityState.metadata || {};

    const score = metadata[score_field];

    if (score === undefined || score === null) {
      return false;
    }

    if (min_score !== undefined && score < min_score) {
      return false;
    }

    if (max_score !== undefined && score > max_score) {
      return false;
    }

    return true;
  }

  /**
   * Evaluate event-based condition
   * Example: max_attempts reached, no_response
   */
  evaluateEventBased(config, opportunityState) {
    const metadata = opportunityState.metadata || {};

    // Check all conditions in config
    for (const [key, expectedValue] of Object.entries(config)) {
      const actualValue = metadata[key];

      // Handle different comparison types
      if (key === 'max_attempts' && metadata.attempts_count) {
        if (metadata.attempts_count < expectedValue) {
          return false;
        }
      } else if (typeof expectedValue === 'boolean') {
        if (actualValue !== expectedValue) {
          return false;
        }
      } else if (actualValue !== expectedValue) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find opportunities eligible for a specific rule
   */
  async findEligibleOpportunities(rule) {
    const { from_state, condition_type, condition_config } = rule;

    // Get all opportunities in the from_state
    const opportunities = await this.persistence.getOpportunitiesInState(from_state);

    // Filter by condition
    const eligible = [];

    for (const opp of opportunities) {
      const isEligible = await this.evaluateRule(rule, opp);
      if (isEligible) {
        eligible.push(opp);
      }
    }

    return eligible;
  }

  /**
   * Get all active transition rules
   */
  async getActiveRules(fromState = null) {
    return await this.persistence.getTransitionRules(fromState);
  }

  /**
   * Check all rules and find all eligible opportunities
   * Returns: { rule, opportunities[] }[]
   */
  async checkAllRules() {
    const rules = await this.getActiveRules();
    const results = [];

    for (const rule of rules) {
      const eligible = await this.findEligibleOpportunities(rule);

      if (eligible.length > 0) {
        results.push({
          rule,
          opportunities: eligible,
          count: eligible.length
        });
      }
    }

    return results;
  }

  /**
   * Check specific state for transitions
   */
  async checkStateTransitions(state) {
    const rules = await this.getActiveRules(state);
    const results = [];

    for (const rule of rules) {
      const eligible = await this.findEligibleOpportunities(rule);

      if (eligible.length > 0) {
        results.push({
          rule,
          opportunities: eligible,
          count: eligible.length
        });
      }
    }

    return results;
  }

  /**
   * Get opportunities ready for QUALIFIED → OUTREACH (2h wait)
   */
  async getReadyForOutreach() {
    const opportunities = await this.persistence.getEligibleForAutoTransition(
      LifecycleStates.QUALIFIED,
      2 // hours
    );

    return opportunities;
  }

  /**
   * Get opportunities ready for ENGAGED → DORMANT (30 days inactive)
   */
  async getReadyForDormantFromEngaged() {
    const opportunities = await this.persistence.getEligibleForDormancy(
      LifecycleStates.ENGAGED,
      30 // days
    );

    return opportunities;
  }

  /**
   * Get opportunities ready for NEGOTIATING → DORMANT (14 days stalled)
   */
  async getReadyForDormantFromNegotiating() {
    const opportunities = await this.persistence.getEligibleForDormancy(
      LifecycleStates.NEGOTIATING,
      14 // days
    );

    return opportunities;
  }

  /**
   * Get opportunities ready for DORMANT → OUTREACH (60 days re-engagement)
   */
  async getReadyForReengagement() {
    const opportunities = await this.persistence.getEligibleForAutoTransition(
      LifecycleStates.DORMANT,
      60 * 24 // 60 days in hours
    );

    return opportunities;
  }

  /**
   * Get opportunities ready for OUTREACH → DORMANT (max attempts)
   */
  async getReadyForDormantFromOutreach() {
    const opportunities = await this.persistence.getOpportunitiesInState(
      LifecycleStates.OUTREACH
    );

    // Filter by max_attempts condition
    return opportunities.filter(opp => {
      const metadata = opp.metadata || {};
      const maxAttempts = 5; // Default
      return metadata.attempts_count >= maxAttempts && !metadata.has_response;
    });
  }

  /**
   * Get summary of all pending transitions
   */
  async getTransitionSummary() {
    const summary = {
      qualified_to_outreach: await this.getReadyForOutreach(),
      engaged_to_dormant: await this.getReadyForDormantFromEngaged(),
      negotiating_to_dormant: await this.getReadyForDormantFromNegotiating(),
      dormant_to_outreach: await this.getReadyForReengagement(),
      outreach_to_dormant: await this.getReadyForDormantFromOutreach()
    };

    return {
      total: Object.values(summary).reduce((sum, arr) => sum + arr.length, 0),
      by_transition: {
        qualified_to_outreach: summary.qualified_to_outreach.length,
        engaged_to_dormant: summary.engaged_to_dormant.length,
        negotiating_to_dormant: summary.negotiating_to_dormant.length,
        dormant_to_outreach: summary.dormant_to_outreach.length,
        outreach_to_dormant: summary.outreach_to_dormant.length
      },
      opportunities: summary
    };
  }

  /**
   * Validate if an opportunity meets transition criteria
   */
  async validateTransitionCriteria(opportunityId, toState) {
    const currentState = await this.persistence.getCurrentState(opportunityId);

    if (!currentState) {
      return {
        valid: false,
        reason: 'Opportunity has no current state'
      };
    }

    // Get rules for this transition
    const rules = await this.getActiveRules(currentState.state);
    const relevantRules = rules.filter(r => r.to_state === toState);

    if (relevantRules.length === 0) {
      return {
        valid: true,
        reason: 'No automatic rules apply - manual transition allowed'
      };
    }

    // Check if opportunity meets any rule criteria
    for (const rule of relevantRules) {
      const meetsCondition = await this.evaluateRule(rule, currentState);
      if (meetsCondition) {
        return {
          valid: true,
          reason: `Meets criteria for rule: ${rule.rule_name}`,
          rule: rule.rule_name
        };
      }
    }

    return {
      valid: false,
      reason: 'Does not meet automatic transition criteria',
      availableRules: relevantRules.map(r => r.rule_name)
    };
  }
}

export default LifecycleTransitionTriggers;
