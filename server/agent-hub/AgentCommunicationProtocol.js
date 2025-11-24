/**
 * Agent-to-Agent Communication Protocol
 * Sprint 30 - Task 5: Inter-Agent Communication
 *
 * Purpose: Enable agents to discover and call other agents' capabilities
 * Protocol: Agent Request/Response over HTTP with JWT authentication
 *
 * Use Cases:
 * - Agent chaining: One agent calls another agent for specialized tasks
 * - Distributed workflows: Workflows spanning multiple agent instances
 * - Service discovery: Agents discover capabilities of other agents
 * - Federated intelligence: Multiple agents collaborate on complex tasks
 *
 * Architecture:
 * - Each agent exposes its capabilities via a standard protocol
 * - Agents authenticate using JWT tokens
 * - Requests include source agent info, target capability, and input
 * - Responses include result, execution metadata, and tracing info
 *
 * Reference: Agent Hub Architecture §8 - Agent-to-Agent Communication
 */

const { logger } = require('./logger');
const crypto = require('crypto');

class AgentCommunicationProtocol {
  constructor(toolRegistry, requestRouter, workflowEngine) {
    this.toolRegistry = toolRegistry;
    this.requestRouter = requestRouter;
    this.workflowEngine = workflowEngine;
    this.agentId = this._generateAgentId();
    this.agentMetadata = this._initializeMetadata();

    logger.info('AgentCommunicationProtocol initialized', {
      agent_id: this.agentId,
      agent_name: this.agentMetadata.name
    });
  }

  /**
   * Handle agent-to-agent request
   * @param {object} request - Agent request
   * @param {object} sourceAgent - Source agent metadata from JWT
   * @returns {object} Agent response
   */
  async handleAgentRequest(request, sourceAgent) {
    const startTime = Date.now();
    const requestId = this._generateRequestId();

    try {
      // Validate request format
      this._validateRequest(request);

      const { action, target, input, metadata } = request;

      logger.info('Agent request received', {
        request_id: requestId,
        action,
        target,
        source_agent: sourceAgent.id || sourceAgent.sub,
        metadata
      });

      let result;

      // Route based on action type
      switch (action) {
        case 'discover':
          result = await this._handleDiscover(target);
          break;

        case 'execute-tool':
          result = await this._handleExecuteTool(target, input, sourceAgent);
          break;

        case 'execute-workflow':
          result = await this._handleExecuteWorkflow(target, input, sourceAgent);
          break;

        case 'query-capabilities':
          result = await this._handleQueryCapabilities(target);
          break;

        default:
          throw new Error(
            `Unknown action: ${action}. ` +
            `Available actions: discover, execute-tool, execute-workflow, query-capabilities`
          );
      }

      const duration = Date.now() - startTime;

      logger.info('Agent request completed', {
        request_id: requestId,
        action,
        duration_ms: duration,
        source_agent: sourceAgent.id || sourceAgent.sub
      });

      // Return agent response
      return {
        success: true,
        request_id: requestId,
        action,
        result,
        agent: {
          id: this.agentId,
          name: this.agentMetadata.name,
          version: this.agentMetadata.version
        },
        execution: {
          duration_ms: duration,
          timestamp: new Date().toISOString(),
          source_agent: sourceAgent.id || sourceAgent.sub
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Agent request failed', {
        request_id: requestId,
        error: error.message,
        stack: error.stack,
        duration_ms: duration,
        source_agent: sourceAgent?.id || sourceAgent?.sub
      });

      // Return error response
      return {
        success: false,
        request_id: requestId,
        error: {
          code: 'AGENT_REQUEST_FAILED',
          message: error.message,
          timestamp: new Date().toISOString()
        },
        agent: {
          id: this.agentId,
          name: this.agentMetadata.name
        },
        execution: {
          duration_ms: duration
        }
      };
    }
  }

  /**
   * Discover available agents or capabilities
   * @private
   */
  async _handleDiscover(target) {
    if (!target || target === 'self') {
      // Return this agent's metadata
      return {
        agent: this.agentMetadata,
        capabilities: {
          tools: this.toolRegistry.listTools().map(t => ({
            name: t.name,
            display_name: t.displayName,
            version: t.version,
            status: t.status
          })),
          workflows: this.workflowEngine.listWorkflows().map(w => ({
            name: w.name,
            version: w.version,
            description: w.description
          })),
          actions: ['discover', 'execute-tool', 'execute-workflow', 'query-capabilities']
        }
      };
    }

    // Future: Discover other agents in the network
    throw new Error('Multi-agent discovery not yet implemented. Use target="self" for now.');
  }

  /**
   * Execute a tool via agent protocol
   * @private
   */
  async _handleExecuteTool(toolName, input, sourceAgent) {
    if (!toolName) {
      throw new Error('Missing required field: target (tool name)');
    }

    logger.info('Agent executing tool', {
      tool_name: toolName,
      source_agent: sourceAgent.id || sourceAgent.sub
    });

    // Route through RequestRouter
    const result = await this.requestRouter.route({
      type: 'single-tool',
      tool_name: toolName,
      input: input || {}
    });

    return {
      tool_name: toolName,
      tool_result: result
    };
  }

  /**
   * Execute a workflow via agent protocol
   * @private
   */
  async _handleExecuteWorkflow(workflowName, input, sourceAgent) {
    if (!workflowName) {
      throw new Error('Missing required field: target (workflow name)');
    }

    logger.info('Agent executing workflow', {
      workflow_name: workflowName,
      source_agent: sourceAgent.id || sourceAgent.sub
    });

    // Route through RequestRouter
    const result = await this.requestRouter.route({
      type: 'workflow',
      workflow_name: workflowName,
      input: input || {}
    });

    return {
      workflow_name: workflowName,
      workflow_result: result
    };
  }

  /**
   * Query specific capabilities
   * @private
   */
  async _handleQueryCapabilities(target) {
    const parts = (target || '').split(':');
    const type = parts[0]; // 'tools' or 'workflows'
    const name = parts[1]; // specific tool/workflow name (optional)

    if (type === 'tools') {
      const tools = this.toolRegistry.listTools();

      if (name) {
        const tool = tools.find(t => t.name === name);
        if (!tool) {
          throw new Error(`Tool not found: ${name}`);
        }
        return { tool };
      }

      return { tools };
    }

    if (type === 'workflows') {
      const workflows = this.workflowEngine.listWorkflows();

      if (name) {
        const workflow = workflows.find(w => w.name === name);
        if (!workflow) {
          throw new Error(`Workflow not found: ${name}`);
        }
        return { workflow };
      }

      return { workflows };
    }

    throw new Error(
      `Invalid capability query: ${target}. ` +
      `Format: "tools" or "tools:ToolName" or "workflows" or "workflows:workflow_name"`
    );
  }

  /**
   * Validate agent request format
   * @private
   */
  _validateRequest(request) {
    if (!request || typeof request !== 'object') {
      throw new Error('Invalid request: must be an object');
    }

    if (!request.action) {
      throw new Error('Missing required field: action');
    }

    const validActions = ['discover', 'execute-tool', 'execute-workflow', 'query-capabilities'];
    if (!validActions.includes(request.action)) {
      throw new Error(
        `Invalid action: ${request.action}. ` +
        `Must be one of: ${validActions.join(', ')}`
      );
    }
  }

  /**
   * Generate unique agent ID
   * @private
   */
  _generateAgentId() {
    const hostname = process.env.HOSTNAME || 'local';
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `agent-${hostname}-${timestamp}-${random}`;
  }

  /**
   * Generate unique request ID
   * @private
   */
  _generateRequestId() {
    return `req-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  }

  /**
   * Initialize agent metadata
   * @private
   */
  _initializeMetadata() {
    return {
      id: this.agentId,
      name: 'siva-agent-hub',
      version: '1.0.0',
      description: 'SIVA Lead Scoring Agent Hub - Emirates NBD',
      type: 'specialized-agent',
      domain: 'banking-sales-intelligence',
      capabilities: {
        tools: ['CompanyQualityTool', 'ContactTierTool', 'TimingScoreTool', 'BankingProductMatchTool'],
        workflows: ['full_lead_scoring', 'company_evaluation', 'outreach_optimization'],
        protocols: ['rest', 'mcp', 'agent-protocol']
      },
      status: 'online',
      deployed_at: new Date().toISOString()
    };
  }

  /**
   * Get protocol stats
   * @returns {object} Statistics
   */
  getStats() {
    return {
      agent_id: this.agentId,
      agent_metadata: this.agentMetadata,
      protocol_version: '1.0.0',
      supported_actions: ['discover', 'execute-tool', 'execute-workflow', 'query-capabilities']
    };
  }
}

module.exports = { AgentCommunicationProtocol };
