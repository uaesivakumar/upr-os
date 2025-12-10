/**
 * Chat Router - AI Brain Entry Point
 * Sprint 53 - AI Chat Interface
 *
 * Endpoints:
 * - POST /api/chat - Send message and receive response
 * - GET /api/chat/stream - SSE streaming endpoint
 * - GET /api/chat/sessions - Get user's chat sessions
 * - GET /api/chat/sessions/:id - Get specific session with messages
 * - DELETE /api/chat/sessions/:id - Delete a session
 * - GET /api/chat/health - Health check
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { pool } = require('../utils/db');
const { ChatNLUService, INTENT_DEFINITIONS } = require('../server/services/chatNLUService');

// Import SIVA tools
const CompanyQualityTool = require('../server/siva-tools/CompanyQualityToolStandalone');
const ContactTierTool = require('../server/siva-tools/ContactTierToolStandalone');
const TimingScoreTool = require('../server/siva-tools/TimingScoreToolStandalone');
const BankingProductMatchTool = require('../server/siva-tools/BankingProductMatchToolStandalone');
const CompositeScoreTool = require('../server/siva-tools/CompositeScoreToolStandalone');
const OutreachMessageGeneratorTool = require('../server/siva-tools/OutreachMessageGeneratorToolStandalone');
const OpeningContextTool = require('../server/siva-tools/OpeningContextToolStandalone');

// Initialize services
const nluService = new ChatNLUService();

// Initialize SIVA tools
const tools = {
  CompanyQualityTool: new CompanyQualityTool(),
  ContactTierTool: new ContactTierTool(),
  TimingScoreTool: new TimingScoreTool(),
  BankingProductMatchTool: new BankingProductMatchTool(),
  CompositeScoreTool: new CompositeScoreTool(),
  OutreachMessageGeneratorTool: new OutreachMessageGeneratorTool(),
  OpeningContextTool: new OpeningContextTool(),
};

// SSE connected clients
const sseClients = new Map(); // sessionId -> response

// ============================================================================
// Rate Limiting (Server-side)
// ============================================================================

const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: {
    success: false,
    error: 'Rate limit exceeded. Please wait before sending more messages.',
    retry_after_ms: 60000
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP with IPv6 handling
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    // For IPv6, use /64 subnet to prevent easy bypass
    const safeIp = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') + '::/64' : ip;
    return req.user?.id || safeIp;
  },
  validate: false, // Disable all validation (we handle IPv6 manually)
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      retry_after_ms: 60000,
      limit: 30,
      window_ms: 60000
    });
  }
});

// ============================================================================
// Database Helpers
// ============================================================================

async function getOrCreateSession(userId, tenantId, context = {}) {
  // Try to find active session
  const existing = await pool.query(
    `SELECT * FROM chat_sessions
     WHERE user_id = $1 AND tenant_id = $2 AND is_active = true
     ORDER BY updated_at DESC LIMIT 1`,
    [userId, tenantId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  // Create new session
  const result = await pool.query(
    `INSERT INTO chat_sessions (user_id, tenant_id, context)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, tenantId, JSON.stringify(context)]
  );

  return result.rows[0];
}

async function saveMessage(sessionId, message) {
  const result = await pool.query(
    `INSERT INTO chat_messages (
       session_id, role, content, intent, intent_confidence,
       entities, tools_used, reasoning, citations,
       model, tokens_input, tokens_output, latency_ms, cost_usd, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      sessionId,
      message.role,
      message.content,
      message.intent || null,
      message.intent_confidence || null,
      JSON.stringify(message.entities || []),
      JSON.stringify(message.tools_used || []),
      message.reasoning || null,
      JSON.stringify(message.citations || []),
      message.model || null,
      message.tokens_input || null,
      message.tokens_output || null,
      message.latency_ms || null,
      message.cost_usd || null,
      message.status || 'sent'
    ]
  );

  return result.rows[0];
}

async function getSessionHistory(sessionId, limit = 20) {
  const result = await pool.query(
    `SELECT * FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, limit]
  );

  return result.rows.reverse(); // Return in chronological order
}

// ============================================================================
// SIVA Tool Execution
// ============================================================================

async function executeTools(toolNames, context) {
  const results = [];

  for (const toolName of toolNames) {
    const tool = tools[toolName];
    if (!tool) {
      console.warn(`[Chat] Tool not found: ${toolName}`);
      continue;
    }

    try {
      const startTime = Date.now();

      // Build tool input from context
      const input = buildToolInput(toolName, context);

      // Execute tool
      const output = await tool.execute(input);

      results.push({
        tool: toolName,
        input,
        output,
        latency_ms: Date.now() - startTime,
        success: true
      });

      console.log(`[Chat] Tool ${toolName} executed in ${Date.now() - startTime}ms`);

    } catch (error) {
      console.error(`[Chat] Tool ${toolName} failed:`, error.message);
      results.push({
        tool: toolName,
        error: error.message,
        success: false
      });
    }
  }

  return results;
}

function buildToolInput(toolName, context) {
  // Extract company/lead data from context for tool execution
  const { companyData, leadData, entities } = context;

  // Default test data if no context provided
  const defaultCompany = {
    name: 'Tech Innovations LLC',
    domain: 'techinnovations.ae',
    industry: 'Technology',
    employee_count: 150,
    revenue: 25000000,
    founded_year: 2018,
    location: 'Dubai, UAE'
  };

  const company = companyData || defaultCompany;

  switch (toolName) {
    case 'CompanyQualityTool':
      return {
        company_name: company.name,
        domain: company.domain,
        industry: company.industry,
        employee_count: company.employee_count,
        revenue_usd: company.revenue,
        founded_year: company.founded_year
      };

    case 'ContactTierTool':
      return {
        title: leadData?.title || 'CEO',
        seniority: leadData?.seniority || 'C-Level',
        department: leadData?.department || 'Executive',
        company_size: company.employee_count
      };

    case 'TimingScoreTool':
      return {
        company_name: company.name,
        industry: company.industry,
        recent_funding: company.recent_funding || false,
        hiring_signals: company.hiring_signals || [],
        news_sentiment: company.news_sentiment || 'neutral'
      };

    case 'BankingProductMatchTool':
      return {
        company_name: company.name,
        industry: company.industry,
        employee_count: company.employee_count,
        revenue_usd: company.revenue,
        geography: company.location
      };

    case 'CompositeScoreTool':
      return {
        company_quality_score: 75,
        timing_score: 80,
        contact_tier_score: 85
      };

    case 'OutreachMessageGeneratorTool':
    case 'OpeningContextTool':
      return {
        company_name: company.name,
        contact_name: leadData?.name || 'Decision Maker',
        contact_title: leadData?.title || 'CEO',
        industry: company.industry,
        pain_points: ['growth', 'efficiency', 'digital transformation']
      };

    default:
      return { company_name: company.name };
  }
}

// ============================================================================
// POST /api/chat - Main Chat Endpoint
// ============================================================================

router.post('/', chatRateLimiter, async (req, res) => {
  const startTime = Date.now();

  try {
    const { message, session_id, context = {}, stream = false } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Get user info (from auth middleware)
    const userId = req.user?.id || 1;
    const tenantId = req.user?.tenant_id || 1;

    // Get or create session
    let session;
    if (session_id) {
      const result = await pool.query(
        'SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2',
        [session_id, userId]
      );
      session = result.rows[0];
    }

    if (!session) {
      session = await getOrCreateSession(userId, tenantId, context);
    }

    // Get chat history for context
    const history = await getSessionHistory(session.id, 10);

    // 1. Recognize intent
    console.log(`[Chat] Processing message: "${message.slice(0, 50)}..."`);
    const intentResult = await nluService.recognizeIntent(message, context);
    console.log(`[Chat] Intent: ${intentResult.intent} (${(intentResult.confidence * 100).toFixed(0)}%)`);

    // 2. Save user message
    await saveMessage(session.id, {
      role: 'user',
      content: message,
      intent: intentResult.intent,
      intent_confidence: intentResult.confidence,
      entities: intentResult.entities,
      latency_ms: intentResult.latency_ms
    });

    // 3. Execute SIVA tools based on intent
    const toolsToRun = nluService.getToolsForIntent(intentResult.intent);
    let toolResults = [];

    if (toolsToRun.length > 0) {
      console.log(`[Chat] Executing tools: ${toolsToRun.join(', ')}`);
      toolResults = await executeTools(toolsToRun, {
        ...context,
        entities: intentResult.entities
      });
    }

    // 4. Generate response
    const response = await nluService.generateResponse(
      message,
      intentResult,
      toolResults,
      history
    );

    // 5. Save assistant message
    const assistantMessage = await saveMessage(session.id, {
      role: 'assistant',
      content: response.content,
      tools_used: toolResults.map(t => ({
        tool: t.tool,
        success: t.success,
        latency_ms: t.latency_ms
      })),
      reasoning: response.reasoning,
      citations: response.citations,
      model: response.metadata?.model,
      tokens_input: response.metadata?.tokens?.input,
      tokens_output: response.metadata?.tokens?.output,
      latency_ms: response.metadata?.latency_ms,
      cost_usd: response.metadata?.cost_usd
    });

    // 6. Return response
    const totalLatency = Date.now() - startTime;
    console.log(`[Chat] Response generated in ${totalLatency}ms`);

    res.json({
      success: true,
      data: {
        message: {
          id: assistantMessage.id,
          role: 'assistant',
          content: response.content,
          timestamp: assistantMessage.created_at
        },
        session_id: session.id,
        intent: {
          name: intentResult.intent,
          confidence: intentResult.confidence,
          entities: intentResult.entities
        },
        tools_executed: toolResults.map(t => ({
          tool: t.tool,
          success: t.success,
          latency_ms: t.latency_ms
        })),
        citations: response.citations,
        metadata: {
          total_latency_ms: totalLatency,
          model: response.metadata?.model,
          tokens: response.metadata?.tokens,
          cost_usd: response.metadata?.cost_usd
        }
      }
    });

  } catch (error) {
    console.error('[Chat] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      message: error.message
    });
  }
});

// ============================================================================
// GET /api/chat/stream - SSE Streaming Endpoint
// ============================================================================

router.get('/stream', chatRateLimiter, async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const userId = req.user?.id || req.query.user_id || 1;
  const sessionId = req.query.session_id;

  // Send connection confirmation
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    message: 'Connected to SIVA chat stream',
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Store client connection
  sseClients.set(sessionId || `user_${userId}`, res);

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(sessionId || `user_${userId}`);
    console.log(`[Chat] SSE client disconnected`);
  });
});

// POST /api/chat/stream - Send message with streaming response
router.post('/stream', chatRateLimiter, async (req, res) => {
  const { message, session_id, context = {} } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, error: 'Message required' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const userId = req.user?.id || 1;
  const tenantId = req.user?.tenant_id || 1;

  try {
    // Get/create session
    let session;
    if (session_id) {
      const result = await pool.query(
        'SELECT * FROM chat_sessions WHERE id = $1',
        [session_id]
      );
      session = result.rows[0];
    }
    if (!session) {
      session = await getOrCreateSession(userId, tenantId, context);
    }

    // Send session info
    res.write(`data: ${JSON.stringify({
      type: 'session',
      session_id: session.id
    })}\n\n`);

    // Recognize intent
    const intentResult = await nluService.recognizeIntent(message, context);

    res.write(`data: ${JSON.stringify({
      type: 'intent',
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      entities: intentResult.entities
    })}\n\n`);

    // Save user message
    await saveMessage(session.id, {
      role: 'user',
      content: message,
      intent: intentResult.intent,
      intent_confidence: intentResult.confidence
    });

    // Execute tools
    const toolsToRun = nluService.getToolsForIntent(intentResult.intent);
    let toolResults = [];

    if (toolsToRun.length > 0) {
      res.write(`data: ${JSON.stringify({
        type: 'tools_start',
        tools: toolsToRun
      })}\n\n`);

      for (const toolName of toolsToRun) {
        try {
          const startTime = Date.now();
          const input = buildToolInput(toolName, context);
          const output = await tools[toolName]?.execute(input);

          const result = {
            tool: toolName,
            output,
            latency_ms: Date.now() - startTime,
            success: true
          };
          toolResults.push(result);

          res.write(`data: ${JSON.stringify({
            type: 'tool_result',
            ...result
          })}\n\n`);

        } catch (error) {
          res.write(`data: ${JSON.stringify({
            type: 'tool_error',
            tool: toolName,
            error: error.message
          })}\n\n`);
        }
      }
    }

    // Stream response
    res.write(`data: ${JSON.stringify({ type: 'response_start' })}\n\n`);

    const history = await getSessionHistory(session.id, 10);
    let fullContent = '';

    for await (const chunk of nluService.streamResponse(message, intentResult, toolResults, history)) {
      if (chunk.type === 'text') {
        fullContent += chunk.content;
        res.write(`data: ${JSON.stringify({
          type: 'text',
          content: chunk.content
        })}\n\n`);
      } else if (chunk.type === 'done') {
        // Save complete message
        await saveMessage(session.id, {
          role: 'assistant',
          content: fullContent,
          tools_used: toolResults,
          model: chunk.metadata?.model,
          tokens_input: chunk.metadata?.tokens?.input,
          tokens_output: chunk.metadata?.tokens?.output,
          latency_ms: chunk.metadata?.latency_ms
        });

        res.write(`data: ${JSON.stringify({
          type: 'done',
          metadata: chunk.metadata
        })}\n\n`);
      } else if (chunk.type === 'error') {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: chunk.error
        })}\n\n`);
      }
    }

    res.end();

  } catch (error) {
    console.error('[Chat Stream] Error:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: error.message
    })}\n\n`);
    res.end();
  }
});

// ============================================================================
// Session Management Endpoints
// ============================================================================

// GET /api/chat/sessions - List user's sessions
router.get('/sessions', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT id, title, context, message_count, created_at, updated_at, last_message_at
       FROM chat_sessions
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Get preview for each session
    const sessions = await Promise.all(result.rows.map(async (session) => {
      const preview = await pool.query(
        `SELECT content FROM chat_messages
         WHERE session_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [session.id]
      );

      return {
        ...session,
        preview: preview.rows[0]?.content?.slice(0, 100) || 'No messages'
      };
    }));

    res.json({
      success: true,
      data: sessions,
      pagination: { limit, offset }
    });

  } catch (error) {
    console.error('[Chat] Get sessions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/chat/sessions/:id - Get session with messages
router.get('/sessions/:id', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const sessionId = req.params.id;

    const session = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (session.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const messages = await pool.query(
      `SELECT id, role, content, intent, intent_confidence, tools_used,
              reasoning, citations, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );

    res.json({
      success: true,
      data: {
        session: session.rows[0],
        messages: messages.rows
      }
    });

  } catch (error) {
    console.error('[Chat] Get session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/chat/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
  try {
    const userId = req.user?.id || 1;
    const sessionId = req.params.id;

    await pool.query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    res.json({ success: true, message: 'Session deleted' });

  } catch (error) {
    console.error('[Chat] Delete session error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Health Check
// ============================================================================

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'chat',
    features: {
      nlu: 'anthropic',
      streaming: true,
      tools_available: Object.keys(tools).length,
      rate_limit: '30/min'
    },
    connected_clients: sseClients.size,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
