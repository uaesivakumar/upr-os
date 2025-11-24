/**
 * MCP Server Implementation
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Model Context Protocol server for Claude Desktop integration
 * Protocol: JSON-RPC 2.0 over stdio transport
 *
 * Exposes all 4 SIVA tools as MCP tools:
 * - evaluate_company_quality
 * - select_contact_tier
 * - calculate_timing_score
 * - match_banking_products
 *
 * Reference: Agent Hub Architecture §7 - MCP Server Integration
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');
const { logger } = require('./logger');
const { mcpRequestCount, mcpRequestDuration } = require('./metrics');

class MCPServer {
  constructor(toolRegistry, requestRouter) {
    this.toolRegistry = toolRegistry;
    this.requestRouter = requestRouter;
    this.server = null;
    this.toolMappings = this._initializeToolMappings();

    logger.info('MCPServer initialized', {
      tools_to_expose: Object.keys(this.toolMappings).length
    });
  }

  /**
   * Initialize MCP server and start listening
   */
  async initialize() {
    try {
      // Create MCP server
      this.server = new Server(
        {
          name: 'siva-agent-hub',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // Register protocol handlers
      this._registerHandlers();

      // Start server with stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      logger.info('MCP Server initialized and listening on stdio', {
        server_name: 'siva-agent-hub',
        version: '1.0.0',
        tools_registered: Object.keys(this.toolMappings).length
      });

      return true;

    } catch (error) {
      logger.error('MCP Server initialization failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Register MCP protocol handlers
   * @private
   */
  _registerHandlers() {
    // ═══════════════════════════════════════════════════════════
    // Handler: tools/list
    // Returns list of available MCP tools
    // ═══════════════════════════════════════════════════════════
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const startTime = Date.now();

      try {
        logger.mcpRequest('tools/list', {});

        // Get all tools from registry
        const registeredTools = this.toolRegistry.listTools({ status: 'healthy' });

        // Map to MCP tool format
        const mcpTools = registeredTools.map(metadata => ({
          name: this._getMCPToolName(metadata.name),
          description: this._getToolDescription(metadata),
          inputSchema: this._adaptSchemaForMCP(metadata.inputSchema)
        }));

        const duration = Date.now() - startTime;

        // Update metrics
        mcpRequestCount.inc({ method: 'tools/list', status: 'success' });
        mcpRequestDuration.observe({ method: 'tools/list' }, duration);

        logger.mcpResponse('tools/list', true);

        return { tools: mcpTools };

      } catch (error) {
        const duration = Date.now() - startTime;

        mcpRequestCount.inc({ method: 'tools/list', status: 'error' });
        mcpRequestDuration.observe({ method: 'tools/list' }, duration);

        logger.error('MCP tools/list failed', {
          error: error.message,
          stack: error.stack
        });

        throw error;
      }
    });

    // ═══════════════════════════════════════════════════════════
    // Handler: tools/call
    // Execute a tool and return result
    // ═══════════════════════════════════════════════════════════
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const startTime = Date.now();
      const { name, arguments: args } = request.params;

      logger.mcpRequest('tools/call', { tool_name: name });

      try {
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
          input: args
        });

        const duration = Date.now() - startTime;

        // Update metrics
        mcpRequestCount.inc({ method: 'tools/call', status: 'success' });
        mcpRequestDuration.observe({ method: 'tools/call' }, duration);

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

      } catch (error) {
        const duration = Date.now() - startTime;

        mcpRequestCount.inc({ method: 'tools/call', status: 'error' });
        mcpRequestDuration.observe({ method: 'tools/call' }, duration);

        logger.error('MCP tools/call failed', {
          tool_name: name,
          error: error.message,
          stack: error.stack,
          duration_ms: duration
        });

        // Return error in MCP format
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: {
                  message: error.message,
                  tool_name: name,
                  timestamp: new Date().toISOString()
                }
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    });
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
   * Get MCP server stats
   * @returns {object} Statistics
   */
  getStats() {
    return {
      server_name: 'siva-agent-hub',
      version: '1.0.0',
      tools_registered: Object.keys(this.toolMappings).length,
      tool_mappings: this.toolMappings,
      is_connected: !!this.server
    };
  }

  /**
   * Shutdown MCP server
   */
  async shutdown() {
    if (this.server) {
      await this.server.close();
      logger.info('MCP Server shutdown complete');
    }
  }
}

module.exports = { MCPServer };
