/**
 * ErrorHandler - Centralized error handling for agents
 *
 * Features:
 * - Error classification (TRANSIENT, FATAL, DEGRADABLE)
 * - Retry logic with exponential backoff
 * - Dead letter queue for failed operations
 * - Graceful degradation strategies
 * - Error recovery and circuit breaking
 *
 * Part of SIVA-AGENTIC-CORE Phase 4
 */

import pool from '../db.js';

const ERROR_TYPES = {
  TRANSIENT: 'TRANSIENT',     // Retry (network timeout, rate limit)
  FATAL: 'FATAL',             // Don't retry (validation error, auth failure)
  DEGRADABLE: 'DEGRADABLE'    // Can return partial results
};

const BACKOFF_BASE_MS = 1000;  // 1 second base
const BACKOFF_MAX_MS = 30000;  // 30 seconds max

class ErrorHandler {
  /**
   * @param {Object} config - Error handler configuration
   * @param {string} config.agentName - Agent identifier
   * @param {number} config.maxRetries - Maximum retry attempts (default: 3)
   * @param {boolean} config.enableDeadLetter - Enable dead letter queue (default: true)
   * @param {Function} config.classifyError - Custom error classification function
   */
  constructor(config) {
    const {
      agentName,
      maxRetries = 3,
      enableDeadLetter = true,
      classifyError = null
    } = config;

    if (!agentName) {
      throw new Error('ErrorHandler: agentName is required');
    }

    this.agentName = agentName;
    this.maxRetries = maxRetries;
    this.enableDeadLetter = enableDeadLetter;
    this.customClassifier = classifyError;

    // Circuit breaker state
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      state: 'CLOSED' // CLOSED (normal), OPEN (failing), HALF_OPEN (testing)
    };
  }

  /**
   * Execute function with retry logic
   *
   * @param {Function} fn - Async function to execute
   * @param {Object} context - Execution context (runId, tenantId, input)
   * @returns {Promise<any>} Function result
   */
  async executeWithRetry(fn, context = {}) {
    let lastError = null;
    let attempt = 0;

    while (attempt < this.maxRetries) {
      try {
        // Check circuit breaker
        if (this.circuitBreaker.state === 'OPEN') {
          const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailureTime;
          if (timeSinceFailure < 60000) { // 1 minute
            throw new Error(`Circuit breaker OPEN for ${this.agentName}. Too many failures.`);
          } else {
            // Try half-open
            this.circuitBreaker.state = 'HALF_OPEN';
            console.log(`[ErrorHandler][${this.agentName}] Circuit breaker HALF_OPEN (testing)`);
          }
        }

        // Execute function
        const result = await fn();

        // Success - reset circuit breaker
        if (this.circuitBreaker.state === 'HALF_OPEN') {
          this.circuitBreaker.state = 'CLOSED';
          this.circuitBreaker.failures = 0;
          console.log(`[ErrorHandler][${this.agentName}] Circuit breaker CLOSED (recovered)`);
        }

        return result;

      } catch (error) {
        lastError = error;
        attempt++;

        // Classify error
        const errorType = this._classifyError(error);

        console.error(
          `[ErrorHandler][${this.agentName}] Attempt ${attempt}/${this.maxRetries} failed:`,
          error.message,
          `(Type: ${errorType})`
        );

        // Fatal errors - don't retry
        if (errorType === ERROR_TYPES.FATAL) {
          console.error(`[ErrorHandler][${this.agentName}] Fatal error, no retry`);
          throw error;
        }

        // Last attempt - throw error
        if (attempt >= this.maxRetries) {
          console.error(`[ErrorHandler][${this.agentName}] Max retries exceeded`);
          this._updateCircuitBreaker();
          throw error;
        }

        // Transient error - retry with backoff
        if (errorType === ERROR_TYPES.TRANSIENT) {
          const backoffMs = this._calculateBackoff(attempt);
          console.log(`[ErrorHandler][${this.agentName}] Retrying in ${backoffMs}ms...`);
          await this._sleep(backoffMs);
        } else {
          // Degradable error - try immediate retry once more
          console.log(`[ErrorHandler][${this.agentName}] Degradable error, immediate retry`);
        }
      }
    }

    // Should never reach here, but just in case
    throw lastError;
  }

  /**
   * Classify error type
   * @private
   */
  _classifyError(error) {
    // Use custom classifier if provided
    if (this.customClassifier) {
      const customType = this.customClassifier(error);
      if (customType) return customType;
    }

    const message = error.message.toLowerCase();

    // Fatal errors
    if (
      message.includes('validation failed') ||
      message.includes('invalid input') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found') ||
      message.includes('budget limit exceeded')
    ) {
      return ERROR_TYPES.FATAL;
    }

    // Transient errors
    if (
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('socket hang up') ||
      message.includes('network error') ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND'
    ) {
      return ERROR_TYPES.TRANSIENT;
    }

    // Degradable errors
    if (
      message.includes('partial') ||
      message.includes('incomplete') ||
      message.includes('no results') ||
      message.includes('empty response')
    ) {
      return ERROR_TYPES.DEGRADABLE;
    }

    // Default: treat as transient (safe default)
    return ERROR_TYPES.TRANSIENT;
  }

  /**
   * Calculate exponential backoff delay
   * @private
   */
  _calculateBackoff(attempt) {
    const exponential = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, attempt - 1),
      BACKOFF_MAX_MS
    );

    // Add jitter (±20%)
    const jitter = exponential * (0.8 + Math.random() * 0.4);

    return Math.floor(jitter);
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update circuit breaker state
   * @private
   */
  _updateCircuitBreaker() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    // Open circuit after 5 consecutive failures
    if (this.circuitBreaker.failures >= 5) {
      this.circuitBreaker.state = 'OPEN';
      console.warn(`[ErrorHandler][${this.agentName}] Circuit breaker OPEN (too many failures)`);
    }
  }

  /**
   * Create dead letter record for failed operation
   *
   * @param {Object} params - Dead letter parameters
   * @param {string} params.runId - Run ID
   * @param {string} params.tenantId - Tenant ID
   * @param {string} params.agentName - Agent name
   * @param {Object} params.input - Agent input
   * @param {string} params.error - Error message
   * @param {string} params.stack - Error stack trace
   */
  async createDeadLetter(params) {
    if (!this.enableDeadLetter) return;

    const {
      runId,
      tenantId,
      agentName = this.agentName,
      input,
      error,
      stack
    } = params;

    try {
      await pool.query(
        `INSERT INTO dead_letters (
          run_id,
          tenant_id,
          agent_name,
          raw_data,
          failure_reason,
          stack_trace,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          runId,
          tenantId,
          agentName,
          JSON.stringify(input),
          error,
          stack
        ]
      );

      console.log(`[ErrorHandler][${agentName}] Dead letter created for run ${runId}`);
    } catch (err) {
      console.error(`[ErrorHandler][${agentName}] Failed to create dead letter:`, err.message);
      // Non-fatal - continue
    }
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      ...this.circuitBreaker,
      timeSinceLastFailure: this.circuitBreaker.lastFailureTime
        ? Date.now() - this.circuitBreaker.lastFailureTime
        : null
    };
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker() {
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      state: 'CLOSED'
    };
    console.log(`[ErrorHandler][${this.agentName}] Circuit breaker reset`);
  }

  /**
   * Check if error is retryable
   *
   * @param {Error} error - The error to check
   * @returns {boolean} True if retryable
   */
  isRetryable(error) {
    const errorType = this._classifyError(error);
    return errorType === ERROR_TYPES.TRANSIENT || errorType === ERROR_TYPES.DEGRADABLE;
  }

  /**
   * Check if error is degradable
   *
   * @param {Error} error - The error to check
   * @returns {boolean} True if degradable
   */
  isDegradable(error) {
    const errorType = this._classifyError(error);
    return errorType === ERROR_TYPES.DEGRADABLE;
  }

  /**
   * Get error summary
   */
  getSummary() {
    return {
      agentName: this.agentName,
      maxRetries: this.maxRetries,
      enableDeadLetter: this.enableDeadLetter,
      circuitBreaker: this.getCircuitBreakerStatus()
    };
  }
}

// Export error types for external use
ErrorHandler.ERROR_TYPES = ERROR_TYPES;

export default ErrorHandler;
