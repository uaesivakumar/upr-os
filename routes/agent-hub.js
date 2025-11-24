/**
 * Agent Hub REST API Routes
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 * Sprint 30 - JWT Auth + MCP + Agent-to-Agent Communication
 *
 * Purpose: HTTP endpoints for Agent Hub (tool execution, workflows, discovery, MCP, inter-agent)
 * Deployment: GCP Cloud Run
 *
 * Endpoints:
 * - POST /api/agent-hub/v1/auth/token - Generate JWT token (public)
 * - POST /api/agent-hub/v1/execute-tool - Execute single tool (protected)
 * - POST /api/agent-hub/v1/execute-workflow - Execute workflow (protected)
 * - POST /api/agent-hub/v1/mcp - MCP over HTTP (JSON-RPC 2.0) (protected) - Sprint 30
 * - POST /api/agent-hub/v1/agent-call - Agent-to-agent communication (protected) - Sprint 30
 * - GET /api/agent-hub/v1/tools - List available tools (public)
 * - GET /api/agent-hub/v1/workflows - List available workflows (public)
 * - GET /api/agent-hub/v1/health - Health check (public)
 *
 * Authentication:
 * - Protected endpoints require JWT token in Authorization header
 * - Format: "Authorization: Bearer <token>"
 * - Generate token via POST /api/agent-hub/v1/auth/token with valid API key
 * - Token expires in 1 hour
 *
 * MCP Protocol:
 * - POST /api/agent-hub/v1/mcp accepts JSON-RPC 2.0 requests
 * - Supports: tools/list, tools/call
 * - Enables remote AI agents (Claude Desktop, custom agents) to discover and execute tools
 *
 * Agent Protocol:
 * - POST /api/agent-hub/v1/agent-call enables agent-to-agent communication
 * - Actions: discover, execute-tool, execute-workflow, query-capabilities
 * - Supports agent chaining, distributed workflows, and federated intelligence
 */

const express = require('express');
const router = express.Router();
const Sentry = require('@sentry/node');

// Agent Hub components
const { ToolRegistry } = require('../server/agent-hub/ToolRegistry');
const { RequestRouter } = require('../server/agent-hub/RequestRouter');
const { ResponseAggregator } = require('../server/agent-hub/ResponseAggregator');
const { WorkflowEngine } = require('../server/agent-hub/WorkflowEngine');
const { MCPHttpAdapter } = require('../server/agent-hub/MCPHttpAdapter');
const { AgentCommunicationProtocol } = require('../server/agent-hub/AgentCommunicationProtocol');
const { TOOL_CONFIGS } = require('../server/agent-hub/config/tool-registry-config');
const { logger } = require('../server/agent-hub/logger');

// JWT utilities and rate limiters (loaded dynamically since they're ES6 modules)
let signJwt = null;
let agentHubAuth = null;
let agentHubLimiter = null;
let agentHubPublicLimiter = null;

// Load ES6 modules asynchronously
(async () => {
  try {
    const jwtModule = await import('../utils/jwt.js');
    signJwt = jwtModule.signJwt;

    const authModule = await import('../server/middleware/agentHubAuth.js');
    agentHubAuth = authModule.agentHubAuth;

    const rateLimiterModule = await import('../server/middleware/rateLimiter.js');
    agentHubLimiter = rateLimiterModule.agentHubLimiter;
    agentHubPublicLimiter = rateLimiterModule.agentHubPublicLimiter;

    logger.info('✅ JWT, auth, and rate limiter modules loaded');
  } catch (error) {
    logger.error('Failed to load JWT/auth/rate limiter modules', { error: error.message });
  }
})();

// Workflow definitions
const fullLeadScoringWorkflow = require('../server/agent-hub/workflows/full-lead-scoring');
const companyEvaluationWorkflow = require('../server/agent-hub/workflows/company-evaluation');
const outreachOptimizationWorkflow = require('../server/agent-hub/workflows/outreach-optimization');

// Sprint 30 - Task 3: Advanced Workflows
const conditionalLeadScoringWorkflow = require('../server/agent-hub/workflows/conditional-lead-scoring');
const batchCompanyEvaluationWorkflow = require('../server/agent-hub/workflows/batch-company-evaluation');
const fallbackWorkflow = require('../server/agent-hub/workflows/fallback-workflow');

// ═══════════════════════════════════════════════════════════
// INITIALIZE AGENT HUB (singleton)
// ═══════════════════════════════════════════════════════════

let agentHubInitialized = false;
let toolRegistry = null;
let requestRouter = null;
let workflowEngine = null;
let mcpHttpAdapter = null;
let agentProtocol = null;

async function initializeAgentHub() {
  if (agentHubInitialized) {
    return { toolRegistry, requestRouter, workflowEngine };
  }

  try {
    logger.info('Initializing Agent Hub for REST API...');

    // Initialize Tool Registry
    toolRegistry = new ToolRegistry();
    for (const config of TOOL_CONFIGS) {
      await toolRegistry.register(config);
    }

    // Initialize Response Aggregator
    const responseAggregator = new ResponseAggregator();

    // Initialize Workflow Engine
    workflowEngine = new WorkflowEngine(toolRegistry, responseAggregator);
    workflowEngine.registerWorkflow(fullLeadScoringWorkflow);
    workflowEngine.registerWorkflow(companyEvaluationWorkflow);
    workflowEngine.registerWorkflow(outreachOptimizationWorkflow);

    // Sprint 30 - Task 3: Advanced Workflows
    workflowEngine.registerWorkflow(conditionalLeadScoringWorkflow);
    workflowEngine.registerWorkflow(batchCompanyEvaluationWorkflow);
    workflowEngine.registerWorkflow(fallbackWorkflow);

    // Initialize Request Router
    requestRouter = new RequestRouter(toolRegistry, workflowEngine);

    // Sprint 30 - Task 4: Initialize MCP HTTP Adapter
    mcpHttpAdapter = new MCPHttpAdapter(toolRegistry, requestRouter);

    // Sprint 30 - Task 5: Initialize Agent Communication Protocol
    agentProtocol = new AgentCommunicationProtocol(toolRegistry, requestRouter, workflowEngine);

    // Start health checks
    toolRegistry.startHealthChecks();

    agentHubInitialized = true;

    logger.info('✅ Agent Hub initialized successfully', {
      tools: toolRegistry.listTools().length,
      workflows: workflowEngine.listWorkflows().length,
      mcp_http_enabled: true,
      agent_protocol_enabled: true,
      agent_id: agentProtocol.agentId
    });

    return { toolRegistry, requestRouter, workflowEngine, mcpHttpAdapter, agentProtocol };

  } catch (error) {
    logger.error('❌ Agent Hub initialization failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE: Initialize Agent Hub on first request
// ═══════════════════════════════════════════════════════════

router.use(async (req, res, next) => {
  try {
    if (!agentHubInitialized) {
      await initializeAgentHub();
    }
    next();
  } catch (error) {
    logger.error('Agent Hub initialization error', {
      error: error.message,
      path: req.path
    });
    return res.status(500).json({
      error: {
        code: 'AGENT_HUB_INIT_FAILED',
        message: 'Failed to initialize Agent Hub',
        details: error.message
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ENDPOINT: POST /api/agent-hub/v1/auth/token
// Generate JWT token for API access
// Sprint 30 - Task 1.3: Token generation endpoint
// ═══════════════════════════════════════════════════════════

router.post('/v1/auth/token', async (req, res) => {
  const startTime = Date.now();

  try {
    const { api_key, username, password } = req.body;

    // Wait for JWT module to load if not yet available
    if (!signJwt) {
      const jwtModule = await import('../utils/jwt.js');
      signJwt = jwtModule.signJwt;
    }

    // Validate API key (simple validation against environment variable)
    const validApiKey = process.env.AGENT_HUB_API_KEY;

    if (!validApiKey) {
      logger.error('AGENT_HUB_API_KEY not configured');
      return res.status(500).json({
        error: {
          code: 'SERVER_MISCONFIGURED',
          message: 'Authentication service not configured'
        }
      });
    }

    // Method 1: API Key authentication (recommended for server-to-server)
    if (api_key) {
      // Trim whitespace from both keys before comparison
      const trimmedApiKey = api_key.trim();
      const trimmedValidKey = validApiKey.trim();

      if (trimmedApiKey !== trimmedValidKey) {
        logger.warn('Invalid API key attempt', {
          ip: req.ip,
          api_key_prefix: api_key.substring(0, 8),
          api_key_length: api_key.length,
          valid_key_length: validApiKey.length
        });

        return res.status(401).json({
          error: {
            code: 'INVALID_API_KEY',
            message: 'Invalid API key'
          }
        });
      }

      // Generate JWT token
      const payload = {
        sub: 'api_client',
        role: 'agent_hub_api',
        permissions: ['execute_tool', 'execute_workflow', 'read_tools', 'read_workflows']
      };

      const token = signJwt(payload, '1h');
      const duration = Date.now() - startTime;

      logger.info('API token generated successfully', {
        method: 'api_key',
        duration_ms: duration
      });

      return res.json({
        success: true,
        token,
        expires_in: 3600, // 1 hour in seconds
        token_type: 'Bearer',
        metadata: {
          duration_ms: duration,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Method 2: Username/Password authentication (future enhancement)
    if (username && password) {
      // TODO: Implement user-based authentication in future sprint
      return res.status(501).json({
        error: {
          code: 'NOT_IMPLEMENTED',
          message: 'Username/password authentication not yet implemented. Use API key for now.'
        }
      });
    }

    // No valid credentials provided
    return res.status(400).json({
      error: {
        code: 'MISSING_CREDENTIALS',
        message: 'Provide either api_key or username/password'
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Token generation failed', {
      error: error.message,
      stack: error.stack,
      duration_ms: duration
    });

    Sentry.captureException(error, {
      tags: {
        endpoint: '/v1/auth/token'
      }
    });

    return res.status(500).json({
      error: {
        code: 'TOKEN_GENERATION_FAILED',
        message: 'Failed to generate token',
        duration_ms: duration
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ENDPOINT: POST /api/agent-hub/v1/execute-tool
// Execute a single tool
// ═══════════════════════════════════════════════════════════

router.post('/v1/execute-tool', async (req, res, next) => {
  // Apply authentication middleware
  if (agentHubAuth) {
    await agentHubAuth(req, res, () => {});
    if (res.headersSent) return; // Auth failed, response already sent
  }

  // Apply rate limiting (per-token or per-IP)
  if (agentHubLimiter) {
    await new Promise((resolve) => agentHubLimiter(req, res, resolve));
    if (res.headersSent) return; // Rate limit exceeded, response already sent
  }

  const startTime = Date.now();

  try {
    const { tool_name, input } = req.body;

    // Validate request
    if (!tool_name) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TOOL_NAME',
          message: 'tool_name is required'
        }
      });
    }

    if (!input) {
      return res.status(400).json({
        error: {
          code: 'MISSING_INPUT',
          message: 'input is required'
        }
      });
    }

    logger.info('REST API: Execute tool request', {
      tool_name,
      endpoint: '/v1/execute-tool'
    });

    // Route request through RequestRouter
    const result = await requestRouter.route({
      type: 'single-tool',
      tool_name,
      input
    });

    const duration = Date.now() - startTime;

    logger.info('REST API: Tool execution completed', {
      tool_name,
      duration_ms: duration
    });

    // Return result
    return res.json({
      success: true,
      result,
      metadata: {
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('REST API: Tool execution failed', {
      error: error.message,
      stack: error.stack,
      duration_ms: duration
    });

    Sentry.captureException(error, {
      tags: {
        endpoint: '/v1/execute-tool',
        tool_name: req.body?.tool_name
      }
    });

    return res.status(500).json({
      error: {
        code: 'TOOL_EXECUTION_FAILED',
        message: error.message,
        duration_ms: duration
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ENDPOINT: POST /api/agent-hub/v1/execute-workflow
// Execute a workflow
// ═══════════════════════════════════════════════════════════

router.post('/v1/execute-workflow', async (req, res, next) => {
  // Apply authentication middleware
  if (agentHubAuth) {
    await agentHubAuth(req, res, () => {});
    if (res.headersSent) return; // Auth failed, response already sent
  }

  // Apply rate limiting (per-token or per-IP)
  if (agentHubLimiter) {
    await new Promise((resolve) => agentHubLimiter(req, res, resolve));
    if (res.headersSent) return; // Rate limit exceeded, response already sent
  }

  const startTime = Date.now();

  try {
    const { workflow_name, input } = req.body;

    // Validate request
    if (!workflow_name) {
      return res.status(400).json({
        error: {
          code: 'MISSING_WORKFLOW_NAME',
          message: 'workflow_name is required'
        }
      });
    }

    if (!input) {
      return res.status(400).json({
        error: {
          code: 'MISSING_INPUT',
          message: 'input is required'
        }
      });
    }

    logger.info('REST API: Execute workflow request', {
      workflow_name,
      endpoint: '/v1/execute-workflow'
    });

    // Route request through RequestRouter
    const result = await requestRouter.route({
      type: 'workflow',
      workflow_name,
      input
    });

    const duration = Date.now() - startTime;

    logger.info('REST API: Workflow execution completed', {
      workflow_name,
      duration_ms: duration
    });

    // Return result
    return res.json({
      success: true,
      result,
      metadata: {
        duration_ms: duration,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('REST API: Workflow execution failed', {
      error: error.message,
      stack: error.stack,
      duration_ms: duration
    });

    Sentry.captureException(error, {
      tags: {
        endpoint: '/v1/execute-workflow',
        workflow_name: req.body?.workflow_name
      }
    });

    return res.status(500).json({
      error: {
        code: 'WORKFLOW_EXECUTION_FAILED',
        message: error.message,
        duration_ms: duration
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ENDPOINT: POST /api/agent-hub/v1/mcp
// MCP over HTTP endpoint (JSON-RPC 2.0)
// Sprint 30 - Task 4: Enable remote AI agent integration
// ═══════════════════════════════════════════════════════════

router.post('/v1/mcp', async (req, res, next) => {
  // Apply authentication middleware
  if (agentHubAuth) {
    await agentHubAuth(req, res, () => {});
    if (res.headersSent) return; // Auth failed, response already sent
  }

  // Apply rate limiting (per-token or per-IP)
  if (agentHubLimiter) {
    await new Promise((resolve) => agentHubLimiter(req, res, resolve));
    if (res.headersSent) return; // Rate limit exceeded, response already sent
  }

  const startTime = Date.now();

  try {
    const jsonRpcRequest = req.body;

    // Validate JSON-RPC 2.0 request format
    if (!jsonRpcRequest || typeof jsonRpcRequest !== 'object') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32600,
          message: 'Invalid Request',
          data: 'Request body must be a valid JSON-RPC 2.0 object'
        }
      });
    }

    logger.info('MCP HTTP request received', {
      method: jsonRpcRequest.method,
      id: jsonRpcRequest.id,
      endpoint: '/v1/mcp'
    });

    // Handle request via MCPHttpAdapter
    const jsonRpcResponse = await mcpHttpAdapter.handleRequest(jsonRpcRequest);

    const duration = Date.now() - startTime;

    logger.info('MCP HTTP request completed', {
      method: jsonRpcRequest.method,
      id: jsonRpcRequest.id,
      duration_ms: duration,
      has_error: !!jsonRpcResponse.error
    });

    // Return JSON-RPC 2.0 response
    // HTTP status is always 200 for JSON-RPC 2.0 (errors are in the response body)
    return res.json(jsonRpcResponse);

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('MCP HTTP endpoint failed', {
      error: error.message,
      stack: error.stack,
      duration_ms: duration
    });

    Sentry.captureException(error, {
      tags: {
        endpoint: '/v1/mcp'
      }
    });

    // Return JSON-RPC 2.0 error response
    return res.json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ENDPOINT: POST /api/agent-hub/v1/agent-call
// Agent-to-Agent Communication endpoint
// Sprint 30 - Task 5: Inter-agent communication protocol
// ═══════════════════════════════════════════════════════════

router.post('/v1/agent-call', async (req, res, next) => {
  // Apply authentication middleware
  if (agentHubAuth) {
    await agentHubAuth(req, res, () => {});
    if (res.headersSent) return; // Auth failed, response already sent
  }

  // Apply rate limiting (per-token or per-IP)
  if (agentHubLimiter) {
    await new Promise((resolve) => agentHubLimiter(req, res, resolve));
    if (res.headersSent) return; // Rate limit exceeded, response already sent
  }

  const startTime = Date.now();

  try {
    const agentRequest = req.body;

    // Validate request format
    if (!agentRequest || typeof agentRequest !== 'object') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request body must be a valid agent request object'
        }
      });
    }

    // Extract source agent from JWT (set by agentHubAuth middleware)
    const sourceAgent = req.user || { id: 'unknown', sub: 'unknown' };

    logger.info('Agent-to-agent request received', {
      action: agentRequest.action,
      target: agentRequest.target,
      source_agent: sourceAgent.id || sourceAgent.sub,
      endpoint: '/v1/agent-call'
    });

    // Handle request via AgentCommunicationProtocol
    const agentResponse = await agentProtocol.handleAgentRequest(agentRequest, sourceAgent);

    const duration = Date.now() - startTime;

    logger.info('Agent-to-agent request completed', {
      action: agentRequest.action,
      success: agentResponse.success,
      duration_ms: duration
    });

    // Return agent response
    return res.json(agentResponse);

  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('Agent-to-agent endpoint failed', {
      error: error.message,
      stack: error.stack,
      duration_ms: duration
    });

    Sentry.captureException(error, {
      tags: {
        endpoint: '/v1/agent-call'
      }
    });

    // Return error response
    return res.status(500).json({
      success: false,
      error: {
        code: 'AGENT_CALL_FAILED',
        message: error.message,
        duration_ms: duration
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ENDPOINT: GET /api/agent-hub/v1/tools
// List available tools
// ═══════════════════════════════════════════════════════════

router.get('/v1/tools', (req, res) => {
  try {
    const tools = toolRegistry.listTools();

    return res.json({
      success: true,
      tools: tools.map(t => ({
        name: t.name,
        display_name: t.displayName,
        version: t.version,
        primitive: t.primitive,
        type: t.type,
        status: t.status,
        sla: t.sla,
        capabilities: t.capabilities
      })),
      count: tools.length
    });

  } catch (error) {
    logger.error('REST API: List tools failed', {
      error: error.message
    });

    return res.status(500).json({
      error: {
        code: 'LIST_TOOLS_FAILED',
        message: error.message
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ENDPOINT: GET /api/agent-hub/v1/workflows
// List available workflows
// ═══════════════════════════════════════════════════════════

router.get('/v1/workflows', (req, res) => {
  try {
    const workflows = workflowEngine.listWorkflows();

    return res.json({
      success: true,
      workflows,
      count: workflows.length
    });

  } catch (error) {
    logger.error('REST API: List workflows failed', {
      error: error.message
    });

    return res.status(500).json({
      error: {
        code: 'LIST_WORKFLOWS_FAILED',
        message: error.message
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ENDPOINT: GET /api/agent-hub/v1/health
// Health check
// ═══════════════════════════════════════════════════════════

router.get('/v1/health', (req, res) => {
  try {
    const stats = toolRegistry.getStats();

    return res.json({
      success: true,
      status: 'healthy',
      agent_hub: {
        initialized: agentHubInitialized,
        tools_total: stats.total_tools,
        tools_healthy: stats.healthy,
        tools_degraded: stats.degraded,
        tools_offline: stats.offline,
        workflows_total: workflowEngine.listWorkflows().length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
