/**
 * SIVA Tool Registry (S143)
 *
 * Central registry for all OS tools. Tools are deterministic, composable,
 * and receive typed inputs/outputs. No inline agent logic.
 *
 * Every tool receives:
 * - SalesContext: Vertical, sub-vertical, region, persona
 * - PackRef: Reference to vertical pack configuration
 * - EvidenceRef: Optional evidence items for scoring
 *
 * @typedef {Object} SalesContext
 * @property {string} vertical - e.g., "banking"
 * @property {string} sub_vertical - e.g., "employee_banking"
 * @property {string} region - e.g., "UAE"
 * @property {string} [persona_slug] - e.g., "eb-rm"
 * @property {string} [tenant_id] - Optional tenant context
 *
 * @typedef {Object} PackRef
 * @property {string} pack_id
 * @property {string} version
 * @property {PackConfig} config
 *
 * @typedef {Object} PackConfig
 * @property {SignalTypeConfig[]} signal_types
 * @property {ScoringWeights} scoring_weights
 * @property {EdgeCaseConfig[]} edge_cases
 * @property {PersonaRules} [persona_rules]
 *
 * @typedef {Object} SignalTypeConfig
 * @property {string} slug
 * @property {string} name
 * @property {string} category
 * @property {number} weight
 * @property {number} decay_rate
 * @property {number} freshness_window_days
 *
 * @typedef {Object} ScoringWeights
 * @property {number} quality
 * @property {number} timing
 * @property {number} likelihood
 * @property {number} evidence
 *
 * @typedef {Object} EdgeCaseConfig
 * @property {string} type
 * @property {string} condition
 * @property {'BLOCK'|'WARN'|'BOOST'|'SKIP'} action
 * @property {'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'} severity
 * @property {number} [multiplier]
 *
 * @typedef {Object} EvidenceRef
 * @property {string} evidence_id
 * @property {string} signal_id
 * @property {string} source
 * @property {number} confidence
 * @property {Object} data
 *
 * @typedef {Object} ToolInput
 * @property {SalesContext} sales_context
 * @property {PackRef} pack_ref
 * @property {EvidenceRef[]} [evidence_refs]
 * @property {Object} [entity_data]
 * @property {Object} [options]
 *
 * @typedef {Object} ToolOutput
 * @property {boolean} success
 * @property {*} [data]
 * @property {string} [error]
 * @property {Object} metadata
 */

// =============================================================================
// TOOL REGISTRY
// =============================================================================

class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.toolMetrics = new Map();
  }

  /**
   * Register a tool in the registry
   * @param {Object} tool
   */
  register(tool) {
    if (this.tools.has(tool.name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
    this.toolMetrics.set(tool.name, { calls: 0, total_ms: 0, errors: 0 });

    console.log(
      `[ToolRegistry] Registered tool: ${tool.name} v${tool.version} (${tool.layer})`
    );
  }

  /**
   * Get a tool by name
   * @param {string} name
   * @returns {Object|undefined}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * Execute a tool with metrics tracking
   * @param {string} toolName
   * @param {ToolInput} input
   * @returns {Promise<ToolOutput>}
   */
  async execute(toolName, input) {
    const tool = this.get(toolName);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolName}`,
        metadata: {
          tool_name: toolName,
          execution_time_ms: 0,
          pack_version: input.pack_ref?.version || "unknown",
          confidence: 0,
        },
      };
    }

    // Validate input
    const validation = tool.validate(input);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors?.join(", ")}`,
        metadata: {
          tool_name: toolName,
          execution_time_ms: 0,
          pack_version: input.pack_ref?.version || "unknown",
          confidence: 0,
        },
      };
    }

    // Execute with timing
    const startTime = Date.now();
    const metrics = this.toolMetrics.get(toolName);

    try {
      const result = await tool.execute(input);
      const executionTime = Date.now() - startTime;

      // Update metrics
      metrics.calls++;
      metrics.total_ms += executionTime;

      // Check SLA
      if (executionTime > tool.sla.p95_ms) {
        console.warn(
          `[ToolRegistry] ${toolName} exceeded P95 SLA: ${executionTime}ms > ${tool.sla.p95_ms}ms`
        );
      }

      return result;
    } catch (error) {
      metrics.errors++;

      return {
        success: false,
        error: error.message || "Unknown error",
        metadata: {
          tool_name: toolName,
          execution_time_ms: Date.now() - startTime,
          pack_version: input.pack_ref?.version || "unknown",
          confidence: 0,
        },
      };
    }
  }

  /**
   * List all registered tools
   * @returns {Array}
   */
  list() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      version: tool.version,
      layer: tool.layer,
      description: tool.description,
    }));
  }

  /**
   * Get metrics for a tool
   * @param {string} toolName
   * @returns {Object|null}
   */
  getMetrics(toolName) {
    const metrics = this.toolMetrics.get(toolName);
    if (!metrics) return null;

    return {
      calls: metrics.calls,
      avg_ms: metrics.calls > 0 ? metrics.total_ms / metrics.calls : 0,
      errors: metrics.errors,
    };
  }

  /**
   * Get all metrics
   * @returns {Object}
   */
  getAllMetrics() {
    const result = {};

    for (const [name, metrics] of this.toolMetrics) {
      result[name] = {
        calls: metrics.calls,
        avg_ms: metrics.calls > 0 ? metrics.total_ms / metrics.calls : 0,
        errors: metrics.errors,
      };
    }

    return result;
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a standard tool output
 * @param {string} toolName
 * @param {string} packVersion
 * @param {*} data
 * @param {number} executionTimeMs
 * @param {number} confidence
 * @param {string[]} [reasoning]
 * @returns {ToolOutput}
 */
export function createToolOutput(
  toolName,
  packVersion,
  data,
  executionTimeMs,
  confidence,
  reasoning
) {
  return {
    success: true,
    data,
    metadata: {
      tool_name: toolName,
      execution_time_ms: executionTimeMs,
      pack_version: packVersion,
      confidence,
      reasoning,
    },
  };
}

/**
 * Create a tool error output
 * @param {string} toolName
 * @param {string} packVersion
 * @param {string} error
 * @param {number} executionTimeMs
 * @returns {ToolOutput}
 */
export function createToolError(toolName, packVersion, error, executionTimeMs) {
  return {
    success: false,
    error,
    metadata: {
      tool_name: toolName,
      execution_time_ms: executionTimeMs,
      pack_version: packVersion,
      confidence: 0,
    },
  };
}

/**
 * Load pack configuration from the pack system
 * @param {string} vertical
 * @param {string} subVertical
 * @returns {Promise<PackRef|null>}
 */
export async function loadPackRef(vertical, subVertical) {
  // This will be implemented to load from the pack engine
  try {
    const packPath = `../packs/${vertical}/${subVertical}.json`;
    // Dynamic import would go here
    return null;
  } catch {
    return null;
  }
}

export default toolRegistry;
