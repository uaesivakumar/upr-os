/**
 * Tool Registry
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Dynamic tool discovery, registration, and health monitoring
 * Pattern: Registry pattern with lazy initialization and circuit breaker integration
 *
 * Reference: Agent Hub Architecture §4 - Tool Registry
 */

const { CircuitBreaker } = require('./CircuitBreaker');
const { logger } = require('./logger');
const { toolRegistrySize, toolHealthCheckFailures } = require('./metrics');

class ToolRegistry {
  constructor() {
    this.tools = new Map();           // name -> { metadata, instance, circuitBreaker }
    this.healthCheckInterval = 60000; // 60s
    this.healthCheckTimer = null;
    this.initialized = false;

    logger.info('ToolRegistry initialized');
  }

  /**
   * Register a tool with metadata
   * @param {object} config - Tool configuration from tool-registry-config.js
   */
  async register(config) {
    try {
      // Load tool instance
      const instance = await this._loadTool(config.path);

      // Validate tool implements execute()
      if (typeof instance.execute !== 'function') {
        throw new Error(`Tool ${config.name} must implement execute() method`);
      }

      // Create circuit breaker for this tool
      const circuitBreaker = new CircuitBreaker(config.name, {
        failureThreshold: 5,
        successThreshold: 2,
        timeout: 60000 // 60s
      });

      // Build metadata
      const metadata = {
        // Identity
        name: config.name,
        displayName: config.displayName,
        version: config.version,
        primitive: config.primitive,
        phase: config.phase,
        type: config.type,

        // Schemas
        inputSchema: config.inputSchema,
        outputSchema: config.outputSchema,

        // SLA
        sla: config.sla,

        // Capabilities
        capabilities: config.capabilities,

        // Dependencies
        dependencies: config.dependencies || [],

        // Health
        status: 'healthy',
        lastHealthCheck: null,
        healthCheckFailures: 0
      };

      // Store tool
      this.tools.set(config.name, {
        metadata,
        instance,
        circuitBreaker,
        config, // Store original config for health checks
        registeredAt: new Date()
      });

      // Update metrics
      toolRegistrySize.set(this.tools.size);

      logger.info(`Tool registered: ${config.name} v${config.version}`, {
        tool_name: config.name,
        version: config.version,
        primitive: config.primitive
      });

      return metadata;

    } catch (error) {
      logger.error(`Failed to register tool: ${config.name}`, {
        tool_name: config.name,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get tool by name
   * @param {string} name - Tool name
   * @returns {object} Tool data with metadata, instance, circuitBreaker
   * @throws {Error} If tool not found or offline
   */
  getTool(name) {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`Tool not found: ${name}. Available tools: ${Array.from(this.tools.keys()).join(', ')}`);
    }

    if (tool.metadata.status === 'offline') {
      throw new Error(
        `Tool offline: ${name}. ` +
        `Status: ${tool.metadata.status}, ` +
        `Last health check: ${tool.metadata.lastHealthCheck}, ` +
        `Failures: ${tool.metadata.healthCheckFailures}`
      );
    }

    return tool;
  }

  /**
   * List all registered tools
   * @param {object} filters - Optional filters (status, phase, type)
   * @returns {array} Array of tool metadata
   */
  listTools(filters = {}) {
    let tools = Array.from(this.tools.values()).map(t => t.metadata);

    // Apply filters
    if (filters.status) {
      tools = tools.filter(t => t.status === filters.status);
    }
    if (filters.phase) {
      tools = tools.filter(t => t.phase === filters.phase);
    }
    if (filters.type) {
      tools = tools.filter(t => t.type === filters.type);
    }

    return tools;
  }

  /**
   * Health check all tools
   * Runs periodically to verify tools are operational
   */
  async performHealthChecks() {
    logger.info('Starting health checks for all tools', {
      tool_count: this.tools.size
    });

    const promises = [];

    for (const [name, tool] of this.tools.entries()) {
      promises.push(this._healthCheckTool(name, tool));
    }

    await Promise.allSettled(promises);

    logger.info('Health checks completed', {
      tool_count: this.tools.size,
      healthy: Array.from(this.tools.values()).filter(t => t.metadata.status === 'healthy').length,
      degraded: Array.from(this.tools.values()).filter(t => t.metadata.status === 'degraded').length,
      offline: Array.from(this.tools.values()).filter(t => t.metadata.status === 'offline').length
    });
  }

  /**
   * Health check single tool
   * @private
   */
  async _healthCheckTool(name, tool) {
    try {
      // Get health check input
      const healthInput = tool.config.healthCheckInput;

      // Execute tool with timeout (use P95 SLA * 2)
      const timeout = tool.metadata.sla.p95LatencyMs * 2;
      const startTime = Date.now();

      await Promise.race([
        tool.instance.execute(healthInput),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Health check timeout after ${timeout}ms`)),
            timeout
          )
        )
      ]);

      const duration = Date.now() - startTime;

      // Health check passed
      tool.metadata.status = 'healthy';
      tool.metadata.lastHealthCheck = new Date();
      tool.metadata.healthCheckFailures = 0;

      logger.info(`Health check passed: ${name}`, {
        tool_name: name,
        duration_ms: duration
      });

    } catch (error) {
      // Health check failed
      tool.metadata.healthCheckFailures++;
      tool.metadata.lastHealthCheck = new Date();

      // Update metrics
      toolHealthCheckFailures.inc({ tool_name: name });

      if (tool.metadata.healthCheckFailures >= 3) {
        tool.metadata.status = 'offline';
      } else {
        tool.metadata.status = 'degraded';
      }

      logger.error(`Health check failed: ${name}`, {
        tool_name: name,
        failure_count: tool.metadata.healthCheckFailures,
        status: tool.metadata.status,
        error: error.message
      });
    }
  }

  /**
   * Dynamic tool loading (supports both CommonJS and ES modules)
   * @private
   */
  async _loadTool(toolPath) {
    try {
      // Try CommonJS first (most SIVA tools use this)
      const ToolClass = require(toolPath);
      return new ToolClass();
    } catch (error) {
      // Fallback to ES module if CommonJS fails
      try {
        const module = await import(toolPath);
        const ToolClass = module.default || module;
        return new ToolClass();
      } catch (esError) {
        throw new Error(
          `Failed to load tool from ${toolPath}. ` +
          `CommonJS error: ${error.message}. ` +
          `ES module error: ${esError.message}`
        );
      }
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.healthCheckTimer) {
      logger.warn('Health checks already running');
      return;
    }

    logger.info('Starting periodic health checks', {
      interval_ms: this.healthCheckInterval
    });

    this.healthCheckTimer = setInterval(
      () => this.performHealthChecks(),
      this.healthCheckInterval
    );

    // Run initial health check
    this.performHealthChecks();
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      logger.info('Stopped periodic health checks');
    }
  }

  /**
   * Get registry statistics
   * @returns {object} Statistics
   */
  getStats() {
    const stats = {
      total_tools: this.tools.size,
      healthy: 0,
      degraded: 0,
      offline: 0,
      tools: []
    };

    for (const [name, tool] of this.tools.entries()) {
      stats[tool.metadata.status]++;

      stats.tools.push({
        name: name,
        version: tool.metadata.version,
        status: tool.metadata.status,
        circuit_breaker_state: tool.circuitBreaker.getState(),
        last_health_check: tool.metadata.lastHealthCheck,
        failure_count: tool.metadata.healthCheckFailures
      });
    }

    return stats;
  }

  /**
   * Manually reset tool health (for testing or manual intervention)
   */
  resetToolHealth(toolName) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    tool.metadata.status = 'healthy';
    tool.metadata.healthCheckFailures = 0;
    tool.metadata.lastHealthCheck = new Date();
    tool.circuitBreaker.reset();

    logger.info(`Manual health reset: ${toolName}`);
  }

  /**
   * Shutdown registry (cleanup)
   */
  shutdown() {
    this.stopHealthChecks();
    this.tools.clear();
    toolRegistrySize.set(0);
    logger.info('ToolRegistry shutdown complete');
  }
}

module.exports = { ToolRegistry };
