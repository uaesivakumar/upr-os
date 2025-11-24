/**
 * Winston Logger Configuration
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Structured logging for Agent Hub components
 * Format: JSON with timestamps, service metadata, and error stacks
 *
 * Reference: Agent Hub Architecture §12 - Monitoring & Observability
 */

const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'agent-hub',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport with colorization for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, service, ...meta }) => {
          let metaStr = '';
          if (Object.keys(meta).length > 0) {
            metaStr = ` ${JSON.stringify(meta)}`;
          }
          return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
        })
      )
    })
  ]
});

/**
 * Log tool execution start
 */
logger.toolExecutionStart = (toolName, input) => {
  logger.info('Tool execution started', {
    event: 'tool_execution_start',
    tool_name: toolName,
    input_size: JSON.stringify(input).length
  });
};

/**
 * Log tool execution success
 */
logger.toolExecutionSuccess = (toolName, durationMs) => {
  logger.info('Tool execution succeeded', {
    event: 'tool_execution_success',
    tool_name: toolName,
    duration_ms: durationMs
  });
};

/**
 * Log tool execution failure
 */
logger.toolExecutionError = (toolName, error, durationMs) => {
  logger.error('Tool execution failed', {
    event: 'tool_execution_error',
    tool_name: toolName,
    error_message: error.message,
    error_stack: error.stack,
    duration_ms: durationMs
  });
};

/**
 * Log workflow execution start
 */
logger.workflowExecutionStart = (workflowName, input) => {
  logger.info('Workflow execution started', {
    event: 'workflow_execution_start',
    workflow_name: workflowName,
    input_size: JSON.stringify(input).length
  });
};

/**
 * Log workflow execution success
 */
logger.workflowExecutionSuccess = (workflowName, stepsExecuted, durationMs) => {
  logger.info('Workflow execution succeeded', {
    event: 'workflow_execution_success',
    workflow_name: workflowName,
    steps_executed: stepsExecuted,
    duration_ms: durationMs
  });
};

/**
 * Log workflow execution failure
 */
logger.workflowExecutionError = (workflowName, error, durationMs) => {
  logger.error('Workflow execution failed', {
    event: 'workflow_execution_error',
    workflow_name: workflowName,
    error_message: error.message,
    error_stack: error.stack,
    duration_ms: durationMs
  });
};

/**
 * Log MCP request
 */
logger.mcpRequest = (method, params) => {
  logger.info('MCP request received', {
    event: 'mcp_request',
    method: method,
    params_size: JSON.stringify(params).length
  });
};

/**
 * Log MCP response
 */
logger.mcpResponse = (method, success) => {
  logger.info('MCP response sent', {
    event: 'mcp_response',
    method: method,
    success: success
  });
};

module.exports = { logger };
