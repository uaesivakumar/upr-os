/**
 * Outreach Intent Mapper
 * Maps user actions/intents to lifecycle state transitions
 *
 * Responsibilities:
 * - Map outreach actions to state transitions
 * - Validate actions against current state
 * - Execute intent-driven transitions
 * - Track intent history
 */

import { LifecycleStates, TriggerTypes } from './lifecycleStateEngine.js';

// Define intent to state mappings
export const INTENT_MAPPINGS = {
  // Research & Discovery
  'add_company': {
    targetState: LifecycleStates.DISCOVERED,
    validFromStates: null, // Can be initial action
    description: 'Add a new company to track',
    metadata: { source: 'manual_add' }
  },

  'import_companies': {
    targetState: LifecycleStates.DISCOVERED,
    validFromStates: null,
    description: 'Import companies in bulk',
    metadata: { source: 'bulk_import' }
  },

  // Qualification
  'qualify_company': {
    targetState: LifecycleStates.QUALIFIED,
    validFromStates: [LifecycleStates.DISCOVERED],
    description: 'Mark company as qualified',
    requiresValidation: true
  },

  'requalify': {
    targetState: LifecycleStates.QUALIFIED,
    validFromStates: [LifecycleStates.DORMANT],
    description: 'Re-qualify dormant opportunity',
    metadata: { requalification: true }
  },

  // Outreach Actions
  'start_outreach': {
    targetState: LifecycleStates.OUTREACH,
    validFromStates: [LifecycleStates.QUALIFIED, LifecycleStates.DORMANT],
    description: 'Begin outreach to opportunity'
  },

  'send_outreach_message': {
    targetState: LifecycleStates.OUTREACH,
    validFromStates: [LifecycleStates.QUALIFIED, LifecycleStates.DORMANT],
    description: 'Send initial outreach message',
    trackAction: true
  },

  'send_followup': {
    targetState: LifecycleStates.OUTREACH,
    validFromStates: [LifecycleStates.OUTREACH],
    description: 'Send follow-up message',
    trackAction: true,
    updateMetadata: (current) => ({
      ...current,
      attempts_count: (current.attempts_count || 0) + 1,
      last_outreach: new Date().toISOString()
    })
  },

  // Engagement
  'log_response': {
    targetState: LifecycleStates.ENGAGED,
    validFromStates: [LifecycleStates.OUTREACH],
    description: 'Log prospect response',
    metadata: { has_response: true }
  },

  'log_meeting': {
    targetState: LifecycleStates.ENGAGED,
    validFromStates: [LifecycleStates.OUTREACH, LifecycleStates.ENGAGED],
    description: 'Log meeting with prospect',
    trackAction: true
  },

  'log_call': {
    targetState: LifecycleStates.ENGAGED,
    validFromStates: [LifecycleStates.OUTREACH, LifecycleStates.ENGAGED],
    description: 'Log phone call with prospect',
    trackAction: true
  },

  'log_positive_interaction': {
    targetState: LifecycleStates.ENGAGED,
    validFromStates: [LifecycleStates.OUTREACH],
    description: 'Log positive interaction',
    updateMetadata: (current) => ({
      ...current,
      engagement_score: Math.min(100, (current.engagement_score || 50) + 10)
    })
  },

  // Negotiation
  'send_proposal': {
    targetState: LifecycleStates.NEGOTIATING,
    validFromStates: [LifecycleStates.ENGAGED],
    description: 'Send proposal to prospect',
    trackAction: true
  },

  'start_negotiation': {
    targetState: LifecycleStates.NEGOTIATING,
    validFromStates: [LifecycleStates.ENGAGED],
    description: 'Begin contract negotiation',
    trackAction: true
  },

  'update_proposal': {
    targetState: LifecycleStates.NEGOTIATING,
    validFromStates: [LifecycleStates.NEGOTIATING],
    description: 'Update proposal terms',
    trackAction: true
  },

  // Closure - Success
  'mark_as_won': {
    targetState: LifecycleStates.CLOSED,
    subState: 'WON',
    validFromStates: [LifecycleStates.NEGOTIATING],
    description: 'Mark deal as won',
    requiresReason: true
  },

  'close_deal': {
    targetState: LifecycleStates.CLOSED,
    subState: 'WON',
    validFromStates: [LifecycleStates.NEGOTIATING],
    description: 'Close deal successfully',
    trackAction: true
  },

  // Closure - Lost
  'mark_as_lost': {
    targetState: LifecycleStates.CLOSED,
    subState: 'LOST',
    validFromStates: [LifecycleStates.NEGOTIATING, LifecycleStates.ENGAGED],
    description: 'Mark deal as lost',
    requiresReason: true
  },

  // Closure - Disqualified
  'disqualify': {
    targetState: LifecycleStates.CLOSED,
    subState: 'DISQUALIFIED',
    validFromStates: [
      LifecycleStates.DISCOVERED,
      LifecycleStates.QUALIFIED,
      LifecycleStates.OUTREACH,
      LifecycleStates.ENGAGED
    ],
    description: 'Disqualify opportunity',
    requiresReason: true
  },

  'mark_not_interested': {
    targetState: LifecycleStates.CLOSED,
    subState: 'DISQUALIFIED',
    validFromStates: [LifecycleStates.OUTREACH, LifecycleStates.ENGAGED],
    description: 'Prospect not interested',
    metadata: { disqualification_reason: 'not_interested' }
  },

  // Dormancy
  'pause_outreach': {
    targetState: LifecycleStates.DORMANT,
    validFromStates: [LifecycleStates.OUTREACH, LifecycleStates.ENGAGED],
    description: 'Pause outreach temporarily',
    metadata: { paused: true }
  },

  'mark_no_response': {
    targetState: LifecycleStates.DORMANT,
    validFromStates: [LifecycleStates.OUTREACH],
    description: 'No response after multiple attempts',
    metadata: { no_response: true }
  }
};

/**
 * Outreach Intent Mapper class
 */
export class OutreachIntentMapper {
  constructor(engine, persistence) {
    this.engine = engine;
    this.persistence = persistence;
    this.intentHistory = [];
  }

  /**
   * Get intent configuration
   */
  getIntent(intentName) {
    return INTENT_MAPPINGS[intentName] || null;
  }

  /**
   * Get all available intents
   */
  getAllIntents() {
    return Object.entries(INTENT_MAPPINGS).map(([name, config]) => ({
      name,
      ...config
    }));
  }

  /**
   * Get valid intents for current state
   */
  async getValidIntents(opportunityId) {
    const currentState = await this.persistence.getCurrentState(opportunityId);

    if (!currentState) {
      // If no current state, only allow initial actions
      return this.getAllIntents().filter(intent => intent.validFromStates === null);
    }

    const validIntents = this.getAllIntents().filter(intent => {
      if (intent.validFromStates === null) {
        return false; // Initial actions not valid once in lifecycle
      }
      return intent.validFromStates.includes(currentState.state);
    });

    return validIntents;
  }

  /**
   * Validate if intent is allowed for current state
   */
  async validateIntent(opportunityId, intentName) {
    const intent = this.getIntent(intentName);

    if (!intent) {
      return {
        valid: false,
        reason: `Unknown intent: ${intentName}`
      };
    }

    const currentState = await this.persistence.getCurrentState(opportunityId);

    // Handle initial actions (no current state)
    if (!currentState && intent.validFromStates === null) {
      return {
        valid: true,
        reason: 'Initial action allowed'
      };
    }

    if (!currentState) {
      return {
        valid: false,
        reason: 'Opportunity has no lifecycle state'
      };
    }

    // Check if current state is in valid from states
    if (intent.validFromStates === null) {
      return {
        valid: false,
        reason: 'Intent is only valid as initial action'
      };
    }

    if (!intent.validFromStates.includes(currentState.state)) {
      return {
        valid: false,
        reason: `Intent '${intentName}' not valid from state '${currentState.state}'`,
        currentState: currentState.state,
        validFromStates: intent.validFromStates
      };
    }

    return {
      valid: true,
      reason: 'Intent is valid for current state'
    };
  }

  /**
   * Execute an intent (map to state transition)
   */
  async executeIntent(opportunityId, intentName, options = {}) {
    const {
      reason = null,
      metadata = {},
      userId = null
    } = options;

    try {
      // Get intent configuration
      const intent = this.getIntent(intentName);

      if (!intent) {
        throw new Error(`Unknown intent: ${intentName}`);
      }

      // Validate intent
      const validation = await this.validateIntent(opportunityId, intentName);

      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      // Check if reason is required
      if (intent.requiresReason && !reason) {
        throw new Error(`Intent '${intentName}' requires a reason`);
      }

      // Get current state for metadata updates
      let currentState = await this.persistence.getCurrentState(opportunityId);
      let currentMetadata = currentState ? currentState.metadata || {} : {};

      // Build metadata
      let finalMetadata = {
        ...currentMetadata,
        ...(intent.metadata || {}),
        ...metadata,
        intent: intentName,
        intent_executed_at: new Date().toISOString()
      };

      // Apply metadata updates if configured
      if (intent.updateMetadata && typeof intent.updateMetadata === 'function') {
        finalMetadata = intent.updateMetadata(finalMetadata);
      }

      // Execute transition
      const result = await this.engine.transition(
        opportunityId,
        intent.targetState,
        {
          triggerType: TriggerTypes.EVENT,
          triggerReason: reason || `Intent: ${intent.description}`,
          triggeredBy: userId,
          subState: intent.subState || null,
          metadata: finalMetadata
        }
      );

      // Track intent execution
      this.intentHistory.push({
        opportunityId,
        intent: intentName,
        timestamp: new Date().toISOString(),
        success: true
      });

      return {
        success: true,
        intent: intentName,
        transition: result.transition,
        message: intent.description
      };

    } catch (error) {
      // Track failed intent
      this.intentHistory.push({
        opportunityId,
        intent: intentName,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Batch execute multiple intents
   */
  async executeIntents(intents) {
    const results = [];

    for (const { opportunityId, intent, options } of intents) {
      try {
        const result = await this.executeIntent(opportunityId, intent, options);
        results.push({ opportunityId, ...result });
      } catch (error) {
        results.push({
          opportunityId,
          success: false,
          intent,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get intent history
   */
  getIntentHistory(opportunityId = null) {
    if (opportunityId) {
      return this.intentHistory.filter(h => h.opportunityId === opportunityId);
    }
    return this.intentHistory;
  }

  /**
   * Get intent statistics
   */
  getIntentStats() {
    const total = this.intentHistory.length;
    const successful = this.intentHistory.filter(h => h.success).length;
    const failed = this.intentHistory.filter(h => !h.success).length;

    const intentCounts = {};
    this.intentHistory.forEach(h => {
      intentCounts[h.intent] = (intentCounts[h.intent] || 0) + 1;
    });

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(2) + '%' : '0%',
      byIntent: intentCounts
    };
  }

  /**
   * Clear intent history
   */
  clearHistory() {
    this.intentHistory = [];
  }
}

export default OutreachIntentMapper;
