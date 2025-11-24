/**
 * AgentProtocol - Base class for all UPR agents
 *
 * Provides standardized:
 * - Input/output contract validation (JSON Schema)
 * - State machine integration
 * - Error handling framework
 * - Cost tracking
 * - Metadata tracking (latency, tokens, provider)
 * - Lifecycle hooks (beforeRun, afterRun, onError)
 * - Graceful degradation
 *
 * Part of SIVA-AGENTIC-CORE Phase 4
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import StateMachine from './StateMachine.js';
import ErrorHandler from './ErrorHandler.js';
import pool from '../db.js';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

class AgentProtocol {
  /**
   * @param {Object} config - Agent configuration
   * @param {string} config.agentName - Agent identifier (e.g., "RadarAgent")
   * @param {string} config.agentVersion - Agent version (e.g., "1.0.0")
   * @param {Object} config.inputSchema - JSON schema for input validation
   * @param {Object} config.outputSchema - JSON schema for output validation
   * @param {Object} config.options - Optional configuration
   * @param {boolean} config.options.enableStateMachine - Enable state tracking (default: true)
   * @param {boolean} config.options.enableCostTracking - Enable cost tracking (default: true)
   * @param {boolean} config.options.enableDeadLetter - Enable dead letter queue (default: true)
   * @param {number} config.options.maxRetries - Max retry attempts (default: 3)
   * @param {number} config.options.budgetLimitUsd - Budget limit per run (default: 5.00)
   */
  constructor(config) {
    const {
      agentName,
      agentVersion = '1.0.0',
      inputSchema,
      outputSchema,
      options = {}
    } = config;

    if (!agentName) {
      throw new Error('AgentProtocol: agentName is required');
    }

    this.agentName = agentName;
    this.agentVersion = agentVersion;
    this.inputSchema = inputSchema;
    this.outputSchema = outputSchema;

    // Options with defaults
    this.options = {
      enableStateMachine: options.enableStateMachine !== false,
      enableCostTracking: options.enableCostTracking !== false,
      enableDeadLetter: options.enableDeadLetter !== false,
      maxRetries: options.maxRetries || 3,
      budgetLimitUsd: options.budgetLimitUsd || 5.00
    };

    // Compile schemas for validation
    this.validateInput = inputSchema ? ajv.compile(inputSchema) : null;
    this.validateOutput = outputSchema ? ajv.compile(outputSchema) : null;

    // Initialize state machine
    this.stateMachine = this.options.enableStateMachine
      ? new StateMachine({ agentName: this.agentName })
      : null;

    // Initialize error handler
    this.errorHandler = new ErrorHandler({
      agentName: this.agentName,
      maxRetries: this.options.maxRetries,
      enableDeadLetter: this.options.enableDeadLetter
    });

    // Cost accumulator for current run
    this.currentRunCost = 0;

    // Metadata for current run
    this.currentRunMetadata = {
      startTime: null,
      endTime: null,
      latencyMs: null,
      tokensUsed: 0,
      apiCalls: 0,
      errors: []
    };
  }

  /**
   * Execute agent run with full protocol enforcement
   *
   * @param {Object} input - Agent input data
   * @param {Object} context - Execution context (runId, tenantId, etc.)
   * @returns {Promise<Object>} Agent output with metadata
   */
  async execute(input, context = {}) {
    const { runId, tenantId, sessionId } = context;

    // Reset run tracking
    this.currentRunCost = 0;
    this.currentRunMetadata = {
      startTime: Date.now(),
      endTime: null,
      latencyMs: null,
      tokensUsed: 0,
      apiCalls: 0,
      errors: [],
      runId,
      tenantId,
      sessionId
    };

    try {
      // Transition to RUNNING state
      if (this.stateMachine) {
        await this.stateMachine.transition('RUNNING', {
          runId,
          tenantId,
          input: this._sanitizeForLogging(input)
        });
      }

      // 1. Validate input
      this._validateInput(input);

      // 2. Call beforeRun hook
      await this.beforeRun(input, context);

      // 3. Execute agent logic with retry + error handling
      const output = await this.errorHandler.executeWithRetry(
        async () => await this.run(input, context),
        {
          runId,
          tenantId,
          input: this._sanitizeForLogging(input)
        }
      );

      // 4. Validate output
      this._validateOutput(output);

      // 5. Call afterRun hook
      await this.afterRun(output, context);

      // 6. Finalize metadata
      this.currentRunMetadata.endTime = Date.now();
      this.currentRunMetadata.latencyMs = this.currentRunMetadata.endTime - this.currentRunMetadata.startTime;

      // 7. Track usage if enabled
      if (this.options.enableCostTracking && this.currentRunCost > 0) {
        await this._trackUsage(context);
      }

      // 8. Transition to COMPLETED state
      if (this.stateMachine) {
        await this.stateMachine.transition('COMPLETED', {
          output: this._sanitizeForLogging(output),
          metadata: this.currentRunMetadata
        });
      }

      // Return output with metadata
      return {
        success: true,
        data: output,
        metadata: {
          agentName: this.agentName,
          agentVersion: this.agentVersion,
          ...this.currentRunMetadata,
          costUsd: parseFloat(this.currentRunCost.toFixed(4))
        }
      };

    } catch (error) {
      // Call onError hook
      await this.onError(error, input, context);

      // Record error
      this.currentRunMetadata.errors.push({
        message: error.message,
        type: error.name,
        timestamp: Date.now()
      });

      // Determine if we can degrade gracefully
      const canDegrade = await this.canDegradeGracefully(error, input, context);

      if (canDegrade) {
        // Transition to DEGRADED state
        if (this.stateMachine) {
          await this.stateMachine.transition('DEGRADED', {
            error: error.message,
            degradationStrategy: canDegrade.strategy
          });
        }

        // Attempt graceful degradation
        const degradedOutput = await this.degradeGracefully(error, input, context);

        // Return degraded result
        return {
          success: false,
          degraded: true,
          data: degradedOutput,
          error: {
            message: error.message,
            type: error.name,
            degradationStrategy: canDegrade.strategy
          },
          metadata: {
            agentName: this.agentName,
            agentVersion: this.agentVersion,
            ...this.currentRunMetadata,
            costUsd: parseFloat(this.currentRunCost.toFixed(4))
          }
        };
      } else {
        // Transition to FAILED state
        if (this.stateMachine) {
          await this.stateMachine.transition('FAILED', {
            error: error.message,
            stack: error.stack
          });
        }

        // Create dead letter if enabled
        if (this.options.enableDeadLetter) {
          await this.errorHandler.createDeadLetter({
            runId,
            tenantId,
            agentName: this.agentName,
            input: this._sanitizeForLogging(input),
            error: error.message,
            stack: error.stack
          });
        }

        // Return failure
        throw error;
      }
    }
  }

  /**
   * Validate input against schema
   * @private
   */
  _validateInput(input) {
    if (!this.validateInput) return; // No schema defined

    const valid = this.validateInput(input);
    if (!valid) {
      const errors = this.validateInput.errors.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      throw new Error(`[${this.agentName}] Input validation failed: ${errors}`);
    }
  }

  /**
   * Validate output against schema
   * @private
   */
  _validateOutput(output) {
    if (!this.validateOutput) return; // No schema defined

    const valid = this.validateOutput(output);
    if (!valid) {
      const errors = this.validateOutput.errors.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      console.warn(`[${this.agentName}] Output validation failed: ${errors}`);
      // Don't throw - just warn (output validation is advisory)
    }
  }

  /**
   * Sanitize data for logging (remove sensitive fields)
   * @private
   */
  _sanitizeForLogging(data) {
    if (!data) return data;

    const sanitized = { ...data };
    const sensitiveFields = ['apiKey', 'password', 'token', 'secret', 'credentials'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Track API usage and cost
   * @private
   */
  async _trackUsage(context) {
    const { runId, tenantId } = context;

    try {
      await pool.query(
        `INSERT INTO usage_events (tenant_id, event_type, cost_usd, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          tenantId,
          this.agentName.toLowerCase(),
          this.currentRunCost,
          JSON.stringify({
            agent: this.agentName,
            version: this.agentVersion,
            run_id: runId,
            tokens: this.currentRunMetadata.tokensUsed,
            api_calls: this.currentRunMetadata.apiCalls,
            latency_ms: this.currentRunMetadata.latencyMs
          })
        ]
      );
    } catch (err) {
      console.error(`[${this.agentName}] Failed to track usage:`, err.message);
      // Non-fatal - continue
    }
  }

  /**
   * Track cost for current run
   *
   * @param {number} costUsd - Cost in USD
   * @param {Object} details - Cost details (provider, model, tokens, etc.)
   */
  trackCost(costUsd, details = {}) {
    this.currentRunCost += costUsd;
    this.currentRunMetadata.apiCalls += 1;

    if (details.tokens) {
      this.currentRunMetadata.tokensUsed += details.tokens;
    }

    // Check budget limit
    if (this.currentRunCost >= this.options.budgetLimitUsd) {
      console.warn(`[${this.agentName}] Budget limit reached: $${this.currentRunCost.toFixed(4)} / $${this.options.budgetLimitUsd}`);
      throw new Error(`Budget limit exceeded: $${this.currentRunCost.toFixed(4)}`);
    }
  }

  /**
   * Get current agent state
   */
  getState() {
    return this.stateMachine ? this.stateMachine.getState() : null;
  }

  /**
   * Get current run metadata
   */
  getMetadata() {
    return {
      ...this.currentRunMetadata,
      costUsd: parseFloat(this.currentRunCost.toFixed(4)),
      state: this.getState()
    };
  }

  // ===========================================
  // LIFECYCLE HOOKS (Override in subclasses)
  // ===========================================

  /**
   * Main agent logic - MUST be implemented by subclass
   *
   * @param {Object} input - Validated input
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Agent output
   */
  async run(input, context) {
    throw new Error(`[${this.agentName}] run() method must be implemented by subclass`);
  }

  /**
   * Hook called before run() execution
   *
   * @param {Object} input - Validated input
   * @param {Object} context - Execution context
   */
  async beforeRun(input, context) {
    // Default: no-op
    // Override in subclass for custom logic
  }

  /**
   * Hook called after successful run() execution
   *
   * @param {Object} output - Agent output
   * @param {Object} context - Execution context
   */
  async afterRun(output, context) {
    // Default: no-op
    // Override in subclass for custom logic
  }

  /**
   * Hook called when error occurs
   *
   * @param {Error} error - The error that occurred
   * @param {Object} input - Agent input
   * @param {Object} context - Execution context
   */
  async onError(error, input, context) {
    console.error(`[${this.agentName}] Error:`, error.message);
    // Override in subclass for custom error handling
  }

  /**
   * Determine if agent can degrade gracefully
   *
   * @param {Error} error - The error that occurred
   * @param {Object} input - Agent input
   * @param {Object} context - Execution context
   * @returns {Promise<Object|null>} Degradation strategy or null if cannot degrade
   */
  async canDegradeGracefully(error, input, context) {
    // Default: no graceful degradation
    // Override in subclass to implement degradation logic
    return null;
  }

  /**
   * Perform graceful degradation
   *
   * @param {Error} error - The error that occurred
   * @param {Object} input - Agent input
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Degraded output (partial results)
   */
  async degradeGracefully(error, input, context) {
    // Default: return empty result
    // Override in subclass to implement fallback logic
    return {
      partial: true,
      results: [],
      error: error.message
    };
  }
}

export default AgentProtocol;
