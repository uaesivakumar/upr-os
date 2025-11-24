/**
 * StateMachine - Agent lifecycle state management
 *
 * Manages agent states and transitions with validation
 *
 * States:
 * - IDLE: Agent initialized, ready to run
 * - RUNNING: Agent currently executing
 * - COMPLETED: Agent finished successfully
 * - DEGRADED: Agent finished with degraded output (partial success)
 * - FAILED: Agent failed with error
 *
 * Valid transitions:
 * - IDLE → RUNNING
 * - RUNNING → COMPLETED
 * - RUNNING → DEGRADED
 * - RUNNING → FAILED
 * - COMPLETED → IDLE (reset)
 * - DEGRADED → IDLE (reset)
 * - FAILED → IDLE (reset)
 *
 * Part of SIVA-AGENTIC-CORE Phase 4
 */

import pool from '../db.js';

const STATES = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  DEGRADED: 'DEGRADED',
  FAILED: 'FAILED'
};

const VALID_TRANSITIONS = {
  IDLE: ['RUNNING'],
  RUNNING: ['COMPLETED', 'DEGRADED', 'FAILED'],
  COMPLETED: ['IDLE'],
  DEGRADED: ['IDLE'],
  FAILED: ['IDLE']
};

class StateMachine {
  /**
   * @param {Object} config - State machine configuration
   * @param {string} config.agentName - Agent identifier
   * @param {boolean} config.enablePersistence - Persist state to database (default: false)
   * @param {string} config.initialState - Initial state (default: IDLE)
   */
  constructor(config) {
    const {
      agentName,
      enablePersistence = false,
      initialState = STATES.IDLE
    } = config;

    if (!agentName) {
      throw new Error('StateMachine: agentName is required');
    }

    this.agentName = agentName;
    this.enablePersistence = enablePersistence;
    this.currentState = initialState;

    // State history for debugging
    this.stateHistory = [
      {
        state: initialState,
        timestamp: Date.now(),
        metadata: { reason: 'initialized' }
      }
    ];

    // Event listeners
    this.listeners = new Map();
  }

  /**
   * Transition to a new state
   *
   * @param {string} newState - Target state
   * @param {Object} metadata - Metadata for the transition
   * @throws {Error} If transition is invalid
   */
  async transition(newState, metadata = {}) {
    // Validate state exists
    if (!STATES[newState]) {
      throw new Error(`StateMachine: Invalid state "${newState}"`);
    }

    // Validate transition is allowed
    const allowedTransitions = VALID_TRANSITIONS[this.currentState];
    if (!allowedTransitions.includes(newState)) {
      throw new Error(
        `StateMachine: Invalid transition from "${this.currentState}" to "${newState}". ` +
        `Allowed: ${allowedTransitions.join(', ')}`
      );
    }

    const previousState = this.currentState;
    this.currentState = newState;

    // Record in history
    const transition = {
      from: previousState,
      to: newState,
      timestamp: Date.now(),
      metadata
    };

    this.stateHistory.push(transition);

    // Emit event
    this._emit('transition', transition);
    this._emit(`transition:${newState}`, transition);

    // Persist if enabled
    if (this.enablePersistence) {
      await this._persistState(transition);
    }

    console.log(`[StateMachine][${this.agentName}] ${previousState} → ${newState}`);

    return transition;
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Check if in specific state
   */
  isState(state) {
    return this.currentState === state;
  }

  /**
   * Check if agent is running
   */
  isRunning() {
    return this.currentState === STATES.RUNNING;
  }

  /**
   * Check if agent is idle
   */
  isIdle() {
    return this.currentState === STATES.IDLE;
  }

  /**
   * Check if agent completed successfully
   */
  isCompleted() {
    return this.currentState === STATES.COMPLETED;
  }

  /**
   * Check if agent failed
   */
  isFailed() {
    return this.currentState === STATES.FAILED;
  }

  /**
   * Check if agent is in degraded state
   */
  isDegraded() {
    return this.currentState === STATES.DEGRADED;
  }

  /**
   * Reset to IDLE state
   */
  async reset(metadata = {}) {
    const validResetStates = [STATES.COMPLETED, STATES.DEGRADED, STATES.FAILED];

    if (!validResetStates.includes(this.currentState)) {
      throw new Error(
        `StateMachine: Cannot reset from "${this.currentState}". ` +
        `Must be in COMPLETED, DEGRADED, or FAILED state.`
      );
    }

    await this.transition(STATES.IDLE, { ...metadata, reason: 'reset' });
  }

  /**
   * Get state history
   */
  getHistory() {
    return this.stateHistory;
  }

  /**
   * Get last transition
   */
  getLastTransition() {
    return this.stateHistory[this.stateHistory.length - 1];
  }

  /**
   * Get duration in current state (ms)
   */
  getStateDuration() {
    const lastTransition = this.getLastTransition();
    return Date.now() - lastTransition.timestamp;
  }

  /**
   * Register event listener
   *
   * @param {string} event - Event name (e.g., 'transition', 'transition:COMPLETED')
   * @param {Function} handler - Event handler function
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  /**
   * Unregister event listener
   */
  off(event, handler) {
    if (!this.listeners.has(event)) return;

    const handlers = this.listeners.get(event);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit event to listeners
   * @private
   */
  _emit(event, data) {
    if (!this.listeners.has(event)) return;

    const handlers = this.listeners.get(event);
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[StateMachine] Event handler error:`, err);
      }
    }
  }

  /**
   * Persist state transition to database
   * @private
   */
  async _persistState(transition) {
    try {
      await pool.query(
        `INSERT INTO agent_state_history (
          agent_name,
          from_state,
          to_state,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, NOW())`,
        [
          this.agentName,
          transition.from,
          transition.to,
          JSON.stringify(transition.metadata)
        ]
      );
    } catch (err) {
      console.error(`[StateMachine] Failed to persist state:`, err.message);
      // Non-fatal - continue without persistence
    }
  }

  /**
   * Create state summary for debugging
   */
  getSummary() {
    const lastTransition = this.getLastTransition();

    return {
      agentName: this.agentName,
      currentState: this.currentState,
      stateDurationMs: this.getStateDuration(),
      transitionCount: this.stateHistory.length,
      lastTransition: {
        from: lastTransition.from,
        to: lastTransition.to,
        timestamp: lastTransition.timestamp,
        metadata: lastTransition.metadata
      },
      history: this.stateHistory.map(h => ({
        state: h.state || h.to,
        timestamp: h.timestamp
      }))
    };
  }
}

// Export states for external use
StateMachine.STATES = STATES;

export default StateMachine;
