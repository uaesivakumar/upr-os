/**
 * MCP HTTP Adapter
 * Sprint 30 - Task 4: MCP over HTTP
 *
 * Purpose: HTTP transport adapter for Model Context Protocol
 * Protocol: JSON-RPC 2.0 over HTTP
 *
 * Enables remote AI agents to interact with Agent Hub via HTTP instead of stdio.
 * This allows Claude Desktop, custom AI agents, and other MCP clients to call
 * Agent Hub tools over the network.
 *
 * Endpoints handled:
 * - tools/list: List available MCP tools
 * - tools/call: Execute a tool
 *
 * Reference: MCP Specification - JSON-RPC 2.0 Transport
 */

const { logger } = require('./logger');
const { mcpRequestCount, mcpRequestDuration } = require('./metrics');

class MCPHttpAdapter {
  constructor(toolRegistry, requestRouter) {
    this.toolRegistry = toolRegistry;
    this.requestRouter = requestRouter;
    this.toolMappings = this._initializeToolMappings();

    logger.info('MCPHttpAdapter initialized', {
      tools_to_expose: Object.keys(this.toolMappings).length
    });
  }

  /**
   * Handle incoming JSON-RPC 2.0 request over HTTP
   * @param {object} jsonRpcRequest - JSON-RPC 2.0 request object
   * @returns {object} JSON-RPC 2.0 response object
   */
  async handleRequest(jsonRpcRequest) {
    const startTime = Date.now();

    // Validate JSON-RPC 2.0 format
    if (!jsonRpcRequest.jsonrpc || jsonRpcRequest.jsonrpc !== '2.0') {
      return this._createErrorResponse(
        jsonRpcRequest.id,
        -32600,
        'Invalid Request',
        'Missing or invalid jsonrpc version (must be "2.0")'
      );
    }

    if (!jsonRpcRequest.method) {
      return this._createErrorResponse(
        jsonRpcRequest.id,
        -32600,
        'Invalid Request',
        'Missing method field'
      );
    }

    const { method, params, id } = jsonRpcRequest;

    try {
      logger.info('MCP HTTP request received', {
        method,
        id,
        has_params: !!params
      });

      // Route to appropriate handler
      let result;
      switch (method) {
        case 'tools/list':
          result = await this._handleToolsList(params);
          break;

        case 'tools/call':
          result = await this._handleToolsCall(params);
          break;

        default:
          return this._createErrorResponse(
            id,
            -32601,
            'Method not found',
            `Unknown method: ${method}. Available: tools/list, tools/call`
          );
      }

      const duration = Date.now() - startTime;

      // Update metrics
      mcpRequestCount.inc({ method, status: 'success' });
      mcpRequestDuration.observe({ method }, duration);

      logger.info('MCP HTTP request completed', {
        method,
        id,
        duration_ms: duration
      });

      // Return JSON-RPC 2.0 success response
      return {
        jsonrpc: '2.0',
        id,
        result
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      // Update metrics
      mcpRequestCount.inc({ method, status: 'error' });
      mcpRequestDuration.observe({ method }, duration);

      logger.error('MCP HTTP request failed', {
        method,
        id,
        error: error.message,
        stack: error.stack,
        duration_ms: duration
      });

      // Return JSON-RPC 2.0 error response
      return this._createErrorResponse(
        id,
        -32603,
        'Internal error',
        error.message
      );
    }
  }

  /**
   * Handle tools/list request
   * @private
   */
  async _handleToolsList(params) {
    logger.mcpRequest('tools/list', params || {});

    // Get all healthy tools from registry
    const registeredTools = this.toolRegistry.listTools({ status: 'healthy' });

    // Map to MCP tool format
    const mcpTools = registeredTools.map(metadata => ({
      name: this._getMCPToolName(metadata.name),
      description: this._getToolDescription(metadata),
      inputSchema: this._adaptSchemaForMCP(metadata.inputSchema)
    }));

    logger.mcpResponse('tools/list', true);

    return { tools: mcpTools };
  }

  /**
   * Handle tools/call request
   * @private
   */
  async _handleToolsCall(params) {
    if (!params || !params.name) {
      throw new Error('Missing required parameter: name');
    }

    const { name, arguments: args } = params;

    logger.mcpRequest('tools/call', { tool_name: name });

    // Map MCP tool name to SIVA tool name
    const sivaToolName = this._getSIVAToolName(name);

    if (!sivaToolName) {
      throw new Error(
        `Unknown MCP tool: ${name}. ` +
        `Available tools: ${Object.keys(this.toolMappings).join(', ')}`
      );
    }

    // Route request through RequestRouter
    const result = await this.requestRouter.route({
      type: 'single-tool',
      tool_name: sivaToolName,
      input: args || {}
    });

    logger.mcpResponse('tools/call', true);

    // Format response for MCP
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  /**
   * Create JSON-RPC 2.0 error response
   * @private
   */
  _createErrorResponse(id, code, message, data) {
    return {
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code,
        message,
        data
      }
    };
  }

  /**
   * Initialize tool name mappings (MCP ↔ SIVA)
   * @private
   */
  _initializeToolMappings() {
    return {
      // MCP tool name → SIVA tool name
      'evaluate_company_quality': 'CompanyQualityTool',
      'select_contact_tier': 'ContactTierTool',
      'calculate_timing_score': 'TimingScoreTool',
      'match_banking_products': 'BankingProductMatchTool'
    };
  }

  /**
   * Map SIVA tool name to MCP tool name
   * @private
   */
  _getMCPToolName(sivaToolName) {
    const reverseMapping = Object.entries(this.toolMappings).find(
      ([_, siva]) => siva === sivaToolName
    );
    return reverseMapping ? reverseMapping[0] : sivaToolName.toLowerCase();
  }

  /**
   * Map MCP tool name to SIVA tool name
   * @private
   */
  _getSIVAToolName(mcpToolName) {
    return this.toolMappings[mcpToolName];
  }

  /**
   * Get tool description for MCP
   * @private
   */
  _getToolDescription(metadata) {
    const descriptions = {
      'CompanyQualityTool': 'Evaluates a company\'s quality and fit for Emirates NBD sales outreach. Returns quality score (0-100), tier classification (Tier 1-5), confidence level, and key factors driving the score. Analyzes UAE presence signals, industry, company size, and salary indicators.',

      'ContactTierTool': 'Maps company profile to target job titles and tier classification (Tier 1-3). Identifies decision-makers for outreach based on title, department, seniority, company size, and hiring velocity. Returns tier classification, target titles, and confidence level.',

      'TimingScoreTool': 'Calculates optimal timing score (0-100) for sales outreach based on hiring signals, fiscal context, and calendar factors. Analyzes signal freshness, calendar context (fiscal quarters, holidays), and signal types. Returns timing score, category (Excellent/Good/Fair/Poor), and key factors.',

      'BankingProductMatchTool': 'Matches appropriate Emirates NBD banking products (salary accounts, business accounts, credit cards) based on company profile. Analyzes company size, industry, average salary, signals (expansion, hiring), and free zone license status. Returns recommended products with fit scores and reasoning.'
    };

    return descriptions[metadata.name] || metadata.displayName;
  }

  /**
   * Adapt SIVA schema for MCP format
   * MCP uses standard JSON Schema - SIVA schemas are already compliant
   * @private
   */
  _adaptSchemaForMCP(schema) {
    // SIVA schemas are already JSON Schema compliant
    // Just ensure we're returning a clean copy
    return JSON.parse(JSON.stringify(schema));
  }

  /**
   * Get adapter stats
   * @returns {object} Statistics
   */
  getStats() {
    return {
      adapter_name: 'mcp-http-adapter',
      version: '1.0.0',
      transport: 'http',
      protocol: 'json-rpc-2.0',
      tools_registered: Object.keys(this.toolMappings).length,
      tool_mappings: this.toolMappings
    };
  }
}

module.exports = { MCPHttpAdapter };
