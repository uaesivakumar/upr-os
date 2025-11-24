/**
 * Circuit Breaker Pattern Implementation
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Prevent cascading failures by monitoring tool health
 * States: CLOSED (normal) → OPEN (failure) → HALF_OPEN (recovery test)
 *
 * Reference: Agent Hub Architecture §9 - Error Handling & Resilience
 */

class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChangeTime = Date.now();

    // Configuration with defaults
    this.failureThreshold = config.failureThreshold || 5;      // Failures before opening
    this.successThreshold = config.successThreshold || 2;      // Successes to close from half-open
    this.timeout = config.timeout || 60000;                    // 60s before trying half-open
    this.halfOpenMaxAttempts = config.halfOpenMaxAttempts || 3;

    console.log(`[CircuitBreaker:${this.name}] Initialized with thresholds: failure=${this.failureThreshold}, success=${this.successThreshold}, timeout=${this.timeout}ms`);
  }

  /**
   * Execute function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise} Result from fn
   * @throws {Error} If circuit is open or fn fails
   */
  async execute(fn) {
    // Check circuit state
    if (this.state === 'OPEN') {
      // Check if timeout has elapsed
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this._transitionTo('HALF_OPEN');
      } else {
        const remainingMs = this.timeout - (Date.now() - this.lastFailureTime);
        throw new Error(
          `Circuit breaker ${this.name} is OPEN. ` +
          `Retry in ${Math.ceil(remainingMs / 1000)}s. ` +
          `Failure count: ${this.failureCount}/${this.failureThreshold}`
        );
      }
    }

    // Execute function
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   * @private
   */
  _onSuccess() {
    this.failureCount = 0; // Reset failure count on success

    if (this.state === 'HALF_OPEN') {
      this.successCount++;

      if (this.successCount >= this.successThreshold) {
        this._transitionTo('CLOSED');
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed execution
   * @private
   */
  _onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Any failure in half-open immediately reopens circuit
      this._transitionTo('OPEN');
      this.successCount = 0;
    } else if (this.state === 'CLOSED') {
      if (this.failureCount >= this.failureThreshold) {
        this._transitionTo('OPEN');
      }
    }
  }

  /**
   * Transition to new state
   * @private
   */
  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeTime = Date.now();

    let emoji;
    switch (newState) {
      case 'CLOSED':
        emoji = '✅';
        break;
      case 'OPEN':
        emoji = '❌';
        break;
      case 'HALF_OPEN':
        emoji = '🔄';
        break;
      default:
        emoji = '❓';
    }

    console.log(`${emoji} Circuit breaker ${this.name}: ${oldState} → ${newState}`);
  }

  /**
   * Get current state
   * @returns {string} Current state (CLOSED, OPEN, HALF_OPEN)
   */
  getState() {
    return this.state;
  }

  /**
   * Get circuit breaker stats
   * @returns {object} Statistics
   */
  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChangeTime: this.lastStateChangeTime,
      config: {
        failureThreshold: this.failureThreshold,
        successThreshold: this.successThreshold,
        timeout: this.timeout
      }
    };
  }

  /**
   * Manually reset circuit breaker (for testing or manual intervention)
   */
  reset() {
    console.log(`🔧 Circuit breaker ${this.name}: Manual reset to CLOSED`);
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChangeTime = Date.now();
  }
}

module.exports = { CircuitBreaker };
