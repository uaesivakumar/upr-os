/**
 * Prometheus Metrics Configuration
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Performance monitoring for Agent Hub components
 * Metrics: Tool execution duration/count, workflow duration/count, circuit breaker state
 *
 * Reference: Agent Hub Architecture §12 - Monitoring & Observability
 */

const prometheus = require('prom-client');

// Create custom registry (separate from default)
const register = new prometheus.Registry();

// Default metrics (CPU, memory, etc.)
prometheus.collectDefaultMetrics({ register });

// ═══════════════════════════════════════════════════════════
// TOOL METRICS
// ═══════════════════════════════════════════════════════════

/**
 * Tool execution duration histogram
 * Tracks: How long each tool takes to execute
 * Labels: tool_name, status (success/error)
 */
const toolExecutionDuration = new prometheus.Histogram({
  name: 'agent_hub_tool_execution_duration_ms',
  help: 'Tool execution duration in milliseconds',
  labelNames: ['tool_name', 'status'],
  buckets: [50, 100, 200, 500, 1000, 2000, 5000] // ms buckets
});

/**
 * Tool execution count counter
 * Tracks: Total number of tool executions
 * Labels: tool_name, status (success/error)
 */
const toolExecutionCount = new prometheus.Counter({
  name: 'agent_hub_tool_executions_total',
  help: 'Total number of tool executions',
  labelNames: ['tool_name', 'status']
});

// ═══════════════════════════════════════════════════════════
// WORKFLOW METRICS
// ═══════════════════════════════════════════════════════════

/**
 * Workflow execution duration histogram
 * Tracks: How long each workflow takes to execute
 * Labels: workflow_name, status (success/error)
 */
const workflowExecutionDuration = new prometheus.Histogram({
  name: 'agent_hub_workflow_execution_duration_ms',
  help: 'Workflow execution duration in milliseconds',
  labelNames: ['workflow_name', 'status'],
  buckets: [500, 1000, 2000, 3000, 5000, 10000] // ms buckets
});

/**
 * Workflow execution count counter
 * Tracks: Total number of workflow executions
 * Labels: workflow_name, status (success/error)
 */
const workflowExecutionCount = new prometheus.Counter({
  name: 'agent_hub_workflow_executions_total',
  help: 'Total number of workflow executions',
  labelNames: ['workflow_name', 'status']
});

/**
 * Workflow step execution count counter
 * Tracks: Total number of workflow steps executed
 * Labels: workflow_name, step_id, status
 */
const workflowStepCount = new prometheus.Counter({
  name: 'agent_hub_workflow_steps_total',
  help: 'Total number of workflow steps executed',
  labelNames: ['workflow_name', 'step_id', 'status']
});

// ═══════════════════════════════════════════════════════════
// CIRCUIT BREAKER METRICS
// ═══════════════════════════════════════════════════════════

/**
 * Circuit breaker state gauge
 * Tracks: Current state of each circuit breaker
 * Values: 0 = CLOSED, 1 = HALF_OPEN, 2 = OPEN
 * Labels: tool_name
 */
const circuitBreakerState = new prometheus.Gauge({
  name: 'agent_hub_circuit_breaker_state',
  help: 'Circuit breaker state (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
  labelNames: ['tool_name']
});

/**
 * Circuit breaker state change counter
 * Tracks: Number of state transitions
 * Labels: tool_name, from_state, to_state
 */
const circuitBreakerStateChanges = new prometheus.Counter({
  name: 'agent_hub_circuit_breaker_state_changes_total',
  help: 'Total number of circuit breaker state changes',
  labelNames: ['tool_name', 'from_state', 'to_state']
});

// ═══════════════════════════════════════════════════════════
// MCP METRICS
// ═══════════════════════════════════════════════════════════

/**
 * MCP request count counter
 * Tracks: Total number of MCP requests
 * Labels: method (tools/list, tools/call, etc.)
 */
const mcpRequestCount = new prometheus.Counter({
  name: 'agent_hub_mcp_requests_total',
  help: 'Total number of MCP requests',
  labelNames: ['method', 'status']
});

/**
 * MCP request duration histogram
 * Tracks: MCP request processing time
 * Labels: method
 */
const mcpRequestDuration = new prometheus.Histogram({
  name: 'agent_hub_mcp_request_duration_ms',
  help: 'MCP request processing duration in milliseconds',
  labelNames: ['method'],
  buckets: [10, 50, 100, 500, 1000, 2000]
});

// ═══════════════════════════════════════════════════════════
// TOOL REGISTRY METRICS
// ═══════════════════════════════════════════════════════════

/**
 * Tool registry size gauge
 * Tracks: Number of registered tools
 */
const toolRegistrySize = new prometheus.Gauge({
  name: 'agent_hub_tool_registry_size',
  help: 'Number of tools registered in the Tool Registry'
});

/**
 * Tool health check failures counter
 * Tracks: Number of health check failures per tool
 * Labels: tool_name
 */
const toolHealthCheckFailures = new prometheus.Counter({
  name: 'agent_hub_tool_health_check_failures_total',
  help: 'Total number of tool health check failures',
  labelNames: ['tool_name']
});

// ═══════════════════════════════════════════════════════════
// REGISTER ALL METRICS
// ═══════════════════════════════════════════════════════════

register.registerMetric(toolExecutionDuration);
register.registerMetric(toolExecutionCount);
register.registerMetric(workflowExecutionDuration);
register.registerMetric(workflowExecutionCount);
register.registerMetric(workflowStepCount);
register.registerMetric(circuitBreakerState);
register.registerMetric(circuitBreakerStateChanges);
register.registerMetric(mcpRequestCount);
register.registerMetric(mcpRequestDuration);
register.registerMetric(toolRegistrySize);
register.registerMetric(toolHealthCheckFailures);

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Convert circuit breaker state to numeric value for Prometheus
 */
function getCircuitBreakerStateValue(state) {
  switch (state) {
    case 'CLOSED':
      return 0;
    case 'HALF_OPEN':
      return 1;
    case 'OPEN':
      return 2;
    default:
      return -1;
  }
}

module.exports = {
  register,
  toolExecutionDuration,
  toolExecutionCount,
  workflowExecutionDuration,
  workflowExecutionCount,
  workflowStepCount,
  circuitBreakerState,
  circuitBreakerStateChanges,
  mcpRequestCount,
  mcpRequestDuration,
  toolRegistrySize,
  toolHealthCheckFailures,
  getCircuitBreakerStateValue
};
