/**
 * Lifecycle State Engine
 * Core state machine engine for managing opportunity lifecycle states
 *
 * Responsibilities:
 * - Define state machine structure (7 states)
 * - Validate state transitions
 * - Execute state transitions with business logic
 * - Track transition history
 * - Emit events for state changes
 */

import { EventEmitter } from 'events';

// Define all valid lifecycle states
export const LifecycleStates = {
  DISCOVERED: 'DISCOVERED',
  QUALIFIED: 'QUALIFIED',
  OUTREACH: 'OUTREACH',
  ENGAGED: 'ENGAGED',
  NEGOTIATING: 'NEGOTIATING',
  DORMANT: 'DORMANT',
  CLOSED: 'CLOSED'
};

// Define sub-states for CLOSED
export const ClosedSubStates = {
  WON: 'WON',
  LOST: 'LOST',
  DISQUALIFIED: 'DISQUALIFIED'
};

// Define trigger types
export const TriggerTypes = {
  AUTO: 'auto',
  MANUAL: 'manual',
  EVENT: 'event'
};

// Define valid state transitions (adjacency list)
const VALID_TRANSITIONS = {
  DISCOVERED: ['QUALIFIED', 'CLOSED'],
  QUALIFIED: ['OUTREACH', 'CLOSED'],
  OUTREACH: ['ENGAGED', 'DORMANT', 'CLOSED'],
  ENGAGED: ['NEGOTIATING', 'DORMANT', 'CLOSED'],
  NEGOTIATING: ['ENGAGED', 'DORMANT', 'CLOSED'],
  DORMANT: ['OUTREACH', 'QUALIFIED', 'CLOSED'],
  CLOSED: ['QUALIFIED'] // Re-open with manual override
};

// State metadata configuration
const STATE_CONFIG = {
  DISCOVERED: {
    name: 'Discovered',
    description: 'Opportunity identified but not yet qualified',
    isEntry: true,
    isTerminal: false,
    autoActions: ['run_research', 'calculate_quality', 'schedule_qualification'],
    color: '#94a3b8' // slate-400
  },
  QUALIFIED: {
    name: 'Qualified',
    description: 'Opportunity meets quality criteria',
    isEntry: false,
    isTerminal: false,
    autoActions: ['identify_contacts', 'generate_strategy', 'calculate_tiers'],
    color: '#60a5fa' // blue-400
  },
  OUTREACH: {
    name: 'Outreach',
    description: 'Active outreach in progress',
    isEntry: false,
    isTerminal: false,
    autoActions: ['generate_messages', 'track_attempts', 'schedule_followups'],
    color: '#f59e0b' // amber-500
  },
  ENGAGED: {
    name: 'Engaged',
    description: 'Prospect has responded and showing interest',
    isEntry: false,
    isTerminal: false,
    autoActions: ['track_engagement', 'update_score', 'suggest_next_steps'],
    color: '#10b981' // emerald-500
  },
  NEGOTIATING: {
    name: 'Negotiating',
    description: 'Active deal negotiation',
    isEntry: false,
    isTerminal: false,
    autoActions: ['track_stage', 'monitor_timeline', 'alert_stalls', 'calculate_probability'],
    color: '#8b5cf6' // violet-500
  },
  DORMANT: {
    name: 'Dormant',
    description: 'Inactive opportunity with re-engagement potential',
    isEntry: false,
    isTerminal: false,
    autoActions: ['calculate_reengagement_score', 'schedule_reengagement', 'monitor_triggers'],
    color: '#6b7280' // gray-500
  },
  CLOSED: {
    name: 'Closed',
    description: 'Terminal state - opportunity concluded',
    isEntry: false,
    isTerminal: true,
    autoActions: ['record_reason', 'calculate_metrics', 'archive_data', 'update_analytics'],
    color: '#ef4444' // red-500
  }
};

/**
 * Lifecycle State Engine class
 */
export class LifecycleStateEngine extends EventEmitter {
  constructor(persistence = null) {
    super();
    this.persistence = persistence;
    this.transitionHistory = [];
  }

  /**
   * Get all valid states
   */
  getStates() {
    return Object.values(LifecycleStates);
  }

  /**
   * Get state configuration
   */
  getStateConfig(state) {
    return STATE_CONFIG[state] || null;
  }

  /**
   * Validate if a state is valid
   */
  isValidState(state) {
    return Object.values(LifecycleStates).includes(state);
  }

  /**
   * Validate if a sub-state is valid for CLOSED
   */
  isValidSubState(subState) {
    return Object.values(ClosedSubStates).includes(subState);
  }

  /**
   * Check if transition from one state to another is valid
   */
  isValidTransition(fromState, toState) {
    // Validate states exist
    if (!this.isValidState(fromState) || !this.isValidState(toState)) {
      return false;
    }

    // Check if transition is in valid transitions list
    const validNextStates = VALID_TRANSITIONS[fromState] || [];
    return validNextStates.includes(toState);
  }

  /**
   * Get all valid next states for a given state
   */
  getValidNextStates(currentState) {
    if (!this.isValidState(currentState)) {
      return [];
    }
    return VALID_TRANSITIONS[currentState] || [];
  }

  /**
   * Validate transition request
   */
  validateTransition(fromState, toState, triggerType, subState = null) {
    const errors = [];

    // Validate states
    if (!this.isValidState(fromState)) {
      errors.push(`Invalid from_state: ${fromState}`);
    }

    if (!this.isValidState(toState)) {
      errors.push(`Invalid to_state: ${toState}`);
    }

    // Validate trigger type
    if (!Object.values(TriggerTypes).includes(triggerType)) {
      errors.push(`Invalid trigger_type: ${triggerType}`);
    }

    // Validate transition is allowed
    if (!this.isValidTransition(fromState, toState)) {
      errors.push(`Transition from ${fromState} to ${toState} is not allowed`);
    }

    // Validate sub_state for CLOSED
    if (toState === LifecycleStates.CLOSED && subState) {
      if (!this.isValidSubState(subState)) {
        errors.push(`Invalid sub_state for CLOSED: ${subState}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute a state transition
   */
  async transition(opportunityId, toState, options = {}) {
    const {
      triggerType = TriggerTypes.MANUAL,
      triggerReason = '',
      triggeredBy = null,
      subState = null,
      metadata = {}
    } = options;

    try {
      // Get current state from persistence
      const currentState = this.persistence
        ? await this.persistence.getCurrentState(opportunityId)
        : null;

      const fromState = currentState?.state || LifecycleStates.DISCOVERED;

      // Validate transition
      const validation = this.validateTransition(fromState, toState, triggerType, subState);

      if (!validation.valid) {
        throw new Error(`Invalid transition: ${validation.errors.join(', ')}`);
      }

      // Execute transition
      const transition = {
        opportunityId,
        fromState,
        toState,
        subState,
        triggerType,
        triggerReason,
        triggeredBy,
        metadata,
        timestamp: new Date().toISOString()
      };

      // Close previous state if persistence available
      if (this.persistence && currentState) {
        await this.persistence.closeState(currentState.id, toState);
      }

      // Create new state
      let newStateId = null;
      if (this.persistence) {
        newStateId = await this.persistence.createState({
          opportunityId,
          state: toState,
          subState,
          triggerType,
          triggerReason,
          triggeredBy,
          previousState: fromState,
          metadata
        });
      }

      // Add to in-memory history
      this.transitionHistory.push(transition);

      // Emit transition event
      this.emit('transition', transition);

      // Emit state-specific events
      this.emit(`entered:${toState}`, { opportunityId, fromState, metadata });

      if (currentState) {
        this.emit(`exited:${fromState}`, { opportunityId, toState, metadata });
      }

      // Execute auto-actions for new state
      await this.executeAutoActions(toState, opportunityId, metadata);

      return {
        success: true,
        stateId: newStateId,
        transition: {
          from: fromState,
          to: toState,
          subState,
          timestamp: transition.timestamp
        }
      };

    } catch (error) {
      console.error('Transition error:', error);
      throw error;
    }
  }

  /**
   * Execute automated actions for a state
   */
  async executeAutoActions(state, opportunityId, metadata = {}) {
    const config = this.getStateConfig(state);
    if (!config || !config.autoActions) {
      return;
    }

    // Emit event for each auto-action
    // Services can listen to these events and execute appropriate actions
    for (const action of config.autoActions) {
      this.emit('auto_action', {
        action,
        state,
        opportunityId,
        metadata,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get transition history for an opportunity (from memory)
   */
  getHistory(opportunityId) {
    return this.transitionHistory.filter(t => t.opportunityId === opportunityId);
  }

  /**
   * Get full state machine graph (for visualization)
   */
  getStateMachineGraph() {
    const nodes = Object.entries(STATE_CONFIG).map(([state, config]) => ({
      id: state,
      label: config.name,
      description: config.description,
      color: config.color,
      isEntry: config.isEntry,
      isTerminal: config.isTerminal
    }));

    const edges = Object.entries(VALID_TRANSITIONS).flatMap(([from, toStates]) =>
      toStates.map(to => ({
        from,
        to,
        label: this.getTransitionLabel(from, to)
      }))
    );

    return { nodes, edges };
  }

  /**
   * Get label for a transition (for visualization)
   */
  getTransitionLabel(fromState, toState) {
    const labels = {
      'DISCOVERED_QUALIFIED': 'Quality ≥ 70',
      'DISCOVERED_CLOSED': 'Disqualify',
      'QUALIFIED_OUTREACH': '2h auto',
      'QUALIFIED_CLOSED': 'Disqualify',
      'OUTREACH_ENGAGED': 'Response',
      'OUTREACH_DORMANT': 'Max attempts',
      'OUTREACH_CLOSED': 'Negative',
      'ENGAGED_NEGOTIATING': 'Proposal',
      'ENGAGED_DORMANT': '30d inactive',
      'ENGAGED_CLOSED': 'Lost interest',
      'NEGOTIATING_ENGAGED': 'Back to discussion',
      'NEGOTIATING_DORMANT': '14d stalled',
      'NEGOTIATING_CLOSED': 'Won/Lost',
      'DORMANT_OUTREACH': '60d re-engage',
      'DORMANT_QUALIFIED': 'Re-activate',
      'DORMANT_CLOSED': 'Disqualify',
      'CLOSED_QUALIFIED': 'Re-open'
    };

    const key = `${fromState}_${toState}`;
    return labels[key] || '';
  }

  /**
   * Calculate time spent in each state for an opportunity
   */
  async getStateTimings(opportunityId) {
    if (!this.persistence) {
      return [];
    }

    const history = await this.persistence.getLifecycleHistory(opportunityId);

    return history.map(entry => ({
      state: entry.state,
      subState: entry.sub_state,
      enteredAt: entry.entered_at,
      exitedAt: entry.exited_at,
      durationSeconds: entry.duration_seconds,
      triggerType: entry.trigger_type
    }));
  }

  /**
   * Get current state for an opportunity
   */
  async getCurrentState(opportunityId) {
    if (!this.persistence) {
      return null;
    }

    return await this.persistence.getCurrentState(opportunityId);
  }

  /**
   * Check if opportunity is in a specific state
   */
  async isInState(opportunityId, state) {
    const currentState = await this.getCurrentState(opportunityId);
    return currentState?.state === state;
  }

  /**
   * Get opportunities in a specific state
   */
  async getOpportunitiesInState(state) {
    if (!this.persistence) {
      return [];
    }

    return await this.persistence.getOpportunitiesInState(state);
  }

  /**
   * Get analytics for state machine
   */
  async getAnalytics() {
    if (!this.persistence) {
      return null;
    }

    return await this.persistence.getStateAnalytics();
  }
}

export default LifecycleStateEngine;
