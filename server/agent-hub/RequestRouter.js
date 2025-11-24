/**
 * Request Router
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Route requests to appropriate tools or workflows
 * Pattern: Router pattern with validation, timeout management, circuit breaker integration
 *
 * Reference: Agent Hub Architecture §5 - Request Router
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const { logger } = require('./logger');
const {
  toolExecutionDuration,
  toolExecutionCount,
  workflowExecutionDuration,
  workflowExecutionCount
} = require('./metrics');

class RequestRouter {
  constructor(toolRegistry, workflowEngine) {
    this.toolRegistry = toolRegistry;
    this.workflowEngine = workflowEngine;

    // Request validation
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateRequest = ajv.compile(this._getRequestSchema());

    logger.info('RequestRouter initialized');
  }

  /**
   * Route request to appropriate handler
   * @param {object} request - Request object
   * @returns {Promise<object>} Result from tool or workflow
   */
  async route(request) {
    const startTime = Date.now();
    const requestType = request.type;

    try {
      // Validate request structure
      if (!this.validateRequest(request)) {
        const errors = this.validateRequest.errors.map(e =>
          `${e.instancePath} ${e.message}`
        ).join(', ');
        throw new Error(`Invalid request: ${errors}`);
      }

      // Route based on request type
      let result;
      if (requestType === 'single-tool') {
        result = await this._executeSingleTool(request);
      } else if (requestType === 'workflow') {
        result = await this._executeWorkflow(request);
      } else {
        throw new Error(`Unknown request type: ${requestType}`);
      }

      // Add routing metadata
      result._routing = {
        type: requestType,
        duration_ms: Date.now() - startTime,
        routed_at: new Date().toISOString(),
        router_version: '1.0.0'
      };

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Log error
      logger.error('Request routing failed', {
        request_type: requestType,
        tool_name: request.tool_name,
        workflow_name: request.workflow_name,
        error: error.message,
        stack: error.stack,
        duration_ms: duration
      });

      // Capture in Sentry
      Sentry.captureException(error, {
        tags: {
          component: 'RequestRouter',
          request_type: requestType,
          tool_name: request.tool_name,
          workflow_name: request.workflow_name
        },
        extra: {
          request,
          duration_ms: duration
        }
      });

      throw error;
    }
  }

  /**
   * Execute single tool
   * @private
   */
  async _executeSingleTool(request) {
    const { tool_name, input } = request;
    const startTime = Date.now();

    logger.toolExecutionStart(tool_name, input);

    try {
      // Get tool from registry
      const { metadata, instance, circuitBreaker } = this.toolRegistry.getTool(tool_name);

      // Validate input against tool schema
      this._validateInput(input, metadata.inputSchema, tool_name);

      // Calculate timeout (2x P95 SLA)
      const timeout = metadata.sla.p95LatencyMs * 2;

      // Execute with circuit breaker and timeout
      const result = await circuitBreaker.execute(async () => {
        return await this._executeWithTimeout(
          () => instance.execute(input),
          timeout,
          tool_name
        );
      });

      // Validate output
      this._validateOutput(result, metadata.outputSchema, tool_name);

      const duration = Date.now() - startTime;

      // Update metrics
      toolExecutionDuration.observe({ tool_name, status: 'success' }, duration);
      toolExecutionCount.inc({ tool_name, status: 'success' });

      logger.toolExecutionSuccess(tool_name, duration);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Update metrics
      toolExecutionDuration.observe({ tool_name, status: 'error' }, duration);
      toolExecutionCount.inc({ tool_name, status: 'error' });

      logger.toolExecutionError(tool_name, error, duration);

      throw error;
    }
  }

  /**
   * Execute workflow
   * @private
   */
  async _executeWorkflow(request) {
    const { workflow_name, input } = request;
    const startTime = Date.now();

    logger.workflowExecutionStart(workflow_name, input);

    try {
      if (!this.workflowEngine) {
        throw new Error('WorkflowEngine not initialized. Cannot execute workflows.');
      }

      // Delegate to workflow engine
      const result = await this.workflowEngine.execute(workflow_name, input);

      const duration = Date.now() - startTime;

      // Update metrics
      const stepsExecuted = result.metadata?.tools_executed?.length || 0;
      workflowExecutionDuration.observe({ workflow_name, status: 'success' }, duration);
      workflowExecutionCount.inc({ workflow_name, status: 'success' });

      logger.workflowExecutionSuccess(workflow_name, stepsExecuted, duration);

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Update metrics
      workflowExecutionDuration.observe({ workflow_name, status: 'error' }, duration);
      workflowExecutionCount.inc({ workflow_name, status: 'error' });

      logger.workflowExecutionError(workflow_name, error, duration);

      throw error;
    }
  }

  /**
   * Validate input against schema
   * @private
   */
  _validateInput(input, schema, toolName) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    if (!validate(input)) {
      const errors = validate.errors.map(e =>
        `${e.instancePath} ${e.message} (${JSON.stringify(e.params)})`
      ).join(', ');

      throw new Error(
        `Invalid input for ${toolName}: ${errors}`
      );
    }
  }

  /**
   * Validate output against schema
   * @private
   */
  _validateOutput(output, schema, toolName) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    if (!validate(output)) {
      const errors = validate.errors.map(e =>
        `${e.instancePath} ${e.message}`
      ).join(', ');

      logger.warn(`Invalid output from ${toolName} (non-blocking)`, {
        tool_name: toolName,
        errors: errors
      });

      // Don't throw - log and continue to avoid blocking production
      // The tool executed successfully, just output doesn't match schema
    }
  }

  /**
   * Execute function with timeout
   * @private
   */
  async _executeWithTimeout(fn, timeoutMs, toolName) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(
            `Tool ${toolName} timed out after ${timeoutMs}ms. ` +
            `This may indicate a performance issue or deadlock.`
          )),
          timeoutMs
        )
      )
    ]);
  }

  /**
   * Request schema validation
   * @private
   */
  _getRequestSchema() {
    return {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['single-tool', 'workflow']
        },
        tool_name: {
          type: 'string',
          minLength: 1
        },
        workflow_name: {
          type: 'string',
          minLength: 1
        },
        input: {
          type: 'object'
        }
      },
      required: ['type', 'input'],
      oneOf: [
        {
          properties: { type: { const: 'single-tool' } },
          required: ['tool_name']
        },
        {
          properties: { type: { const: 'workflow' } },
          required: ['workflow_name']
        }
      ]
    };
  }

  /**
   * Get router statistics
   * @returns {object} Statistics
   */
  getStats() {
    return {
      tool_registry_stats: this.toolRegistry.getStats(),
      workflow_engine_initialized: !!this.workflowEngine
    };
  }
}

module.exports = { RequestRouter };
