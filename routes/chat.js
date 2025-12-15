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

// Import Entity Context Service for REAL data
const {
  getCompanyContext,
  getLeadContext,
  getSignalsForCompany,
  getTopCompaniesForAnalysis,
  searchCompanies,
  DEMO_TENANT_ID
} = require('../server/services/sivaEntityContext');

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
// SIVA Tool Execution with REAL Data
// ============================================================================

/**
 * Resolve entity context from various sources:
 * 1. Direct entity_id/company_id in context
 * 2. Company name extracted from entities
 * 3. Search by query if no direct match
 */
async function resolveEntityContext(context, tenantId) {
  const { entity_id, company_id, companyData, entities } = context;

  // 1. Direct ID lookup
  if (entity_id || company_id) {
    const companyContext = await getCompanyContext({
      companyId: entity_id || company_id,
      tenantId
    });
    if (companyContext) {
      console.log(`[Chat] Resolved entity by ID: ${companyContext.name}`);
      return companyContext;
    }
  }

  // 2. If companyData already provided (from UI), enrich it with DB data
  if (companyData?.name) {
    const companyContext = await getCompanyContext({
      companyName: companyData.name,
      tenantId
    });
    if (companyContext) {
      console.log(`[Chat] Resolved entity by name: ${companyContext.name}`);
      return { ...companyData, ...companyContext };
    }
  }

  // 3. Extract company name from NLU entities
  if (entities && Array.isArray(entities)) {
    const companyEntity = entities.find(e =>
      e.type === 'company_name' || e.type === 'company' || e.type === 'organization'
    );
    if (companyEntity?.value) {
      const companyContext = await getCompanyContext({
        companyName: companyEntity.value,
        tenantId
      });
      if (companyContext) {
        console.log(`[Chat] Resolved entity from NLU: ${companyContext.name}`);
        return companyContext;
      }
    }
  }

  // 4. No specific entity - get top companies for general queries
  console.log(`[Chat] No specific entity, using top companies`);
  const topCompanies = await getTopCompaniesForAnalysis(tenantId, 1);
  return topCompanies[0] || null;
}

/**
 * Execute SIVA tools with REAL data from database
 */
async function executeTools(toolNames, context, tenantId) {
  const results = [];

  // Resolve entity context from DB FIRST
  const entityContext = await resolveEntityContext(context, tenantId);

  if (!entityContext) {
    console.warn(`[Chat] No entity context available, tools may use limited data`);
  } else {
    console.log(`[Chat] Entity context resolved: ${entityContext.name} (${entityContext.signal_count || 0} signals)`);
  }

  for (const toolName of toolNames) {
    const tool = tools[toolName];
    if (!tool) {
      console.warn(`[Chat] Tool not found: ${toolName}`);
      continue;
    }

    try {
      const startTime = Date.now();

      // Build tool input from REAL entity context
      const input = buildToolInput(toolName, entityContext, context);

      // Execute tool
      const output = await tool.execute(input);

      results.push({
        tool: toolName,
        input,
        output,
        entity: entityContext ? {
          name: entityContext.name,
          id: entityContext.id,
          signal_count: entityContext.signal_count
        } : null,
        latency_ms: Date.now() - startTime,
        success: true
      });

      console.log(`[Chat] Tool ${toolName} executed on "${entityContext?.name || 'unknown'}" in ${Date.now() - startTime}ms`);

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

/**
 * Build tool input from REAL entity context (no more mock data!)
 */
function buildToolInput(toolName, entityContext, rawContext = {}) {
  const { leadData } = rawContext;

  // Use real entity context or minimal fallback
  const company = entityContext || {
    name: 'Unknown Company',
    industry: 'Business Services',
    employee_count: 100,
    revenue_usd: 15000000,
    location: 'UAE'
  };

  switch (toolName) {
    case 'CompanyQualityTool':
      return {
        company_name: company.name,
        domain: company.domain,
        industry: company.industry || company.sector,
        employee_count: company.employee_count,
        revenue_usd: company.revenue_usd,
        founded_year: company.founded_year,
        // Include signal data for richer analysis
        hiring_signals: company.signals?.map(s => s.type) || [],
        signal_count: company.signal_count || 0,
        confidence_score: company.confidence_score,
        quality_score: company.quality_score
      };

    case 'ContactTierTool':
      return {
        title: leadData?.title || inferTargetTitle(company),
        seniority: leadData?.seniority || inferSeniority(leadData?.title),
        department: leadData?.department || inferDepartment(leadData?.title),
        company_size: company.employee_count,
        industry: company.industry || company.sector
      };

    case 'TimingScoreTool':
      return {
        company_name: company.name,
        industry: company.industry || company.sector,
        // Use REAL signal data
        recent_funding: company.signals?.some(s =>
          s.type?.toLowerCase().includes('funding') || s.type?.toLowerCase().includes('investment')
        ) || false,
        hiring_signals: company.signals?.filter(s =>
          s.type?.toLowerCase().includes('hiring') || s.type?.toLowerCase().includes('expansion')
        ).map(s => ({
          type: s.type,
          date: s.source_date,
          confidence: s.confidence
        })) || [],
        news_sentiment: company.hiring_likelihood_score >= 4 ? 'positive' :
                        company.hiring_likelihood_score >= 3 ? 'neutral' : 'negative',
        signal_freshness_days: calculateSignalFreshness(company.latest_signal_date)
      };

    case 'BankingProductMatchTool':
      return {
        company_name: company.name,
        industry: company.industry || company.sector,
        employee_count: company.employee_count,
        revenue_usd: company.revenue_usd,
        geography: company.location,
        // Include signal types for product matching
        active_signals: company.signal_types || [],
        hiring_likelihood: company.hiring_likelihood
      };

    case 'CompositeScoreTool':
      // Use real scores if available
      return {
        company_quality_score: Math.round((company.quality_score || 0.5) * 100),
        timing_score: Math.round((company.confidence_score || 0.5) * 100),
        contact_tier_score: company.hiring_likelihood_score ? company.hiring_likelihood_score * 20 : 60,
        signal_count: company.signal_count || 0
      };

    case 'OutreachMessageGeneratorTool':
    case 'OpeningContextTool':
      return {
        company_name: company.name,
        contact_name: leadData?.name || 'Decision Maker',
        contact_title: leadData?.title || inferTargetTitle(company),
        industry: company.industry || company.sector,
        location: company.location,
        // Include real signals for personalized outreach
        key_signals: company.signals?.slice(0, 3).map(s => ({
          type: s.type,
          description: s.description,
          date: s.source_date
        })) || [],
        pain_points: inferPainPoints(company)
      };

    default:
      return {
        company_name: company.name,
        industry: company.industry || company.sector,
        signals: company.signals?.slice(0, 5) || []
      };
  }
}

/**
 * Helper: Infer target title based on company sector
 */
function inferTargetTitle(company) {
  const sector = (company.sector || company.industry || '').toLowerCase();
  if (sector.includes('bank') || sector.includes('financial')) return 'Head of Corporate Banking';
  if (sector.includes('tech')) return 'CTO';
  if (sector.includes('retail')) return 'CFO';
  return 'CEO';
}

/**
 * Helper: Infer seniority from title
 */
function inferSeniority(title) {
  if (!title) return 'Director';
  const t = title.toLowerCase();
  if (t.includes('ceo') || t.includes('cto') || t.includes('cfo') || t.includes('chief')) return 'C-Level';
  if (t.includes('vp') || t.includes('vice president')) return 'VP';
  if (t.includes('director') || t.includes('head')) return 'Director';
  if (t.includes('manager')) return 'Manager';
  return 'Director';
}

/**
 * Helper: Infer department from title
 */
function inferDepartment(title) {
  if (!title) return 'Executive';
  const t = title.toLowerCase();
  if (t.includes('finance') || t.includes('cfo')) return 'Finance';
  if (t.includes('hr') || t.includes('human')) return 'HR';
  if (t.includes('tech') || t.includes('cto')) return 'Technology';
  if (t.includes('sales')) return 'Sales';
  return 'Executive';
}

/**
 * Helper: Calculate signal freshness in days
 */
function calculateSignalFreshness(latestSignalDate) {
  if (!latestSignalDate) return 90; // Default to 90 days
  const signalDate = new Date(latestSignalDate);
  const now = new Date();
  return Math.floor((now - signalDate) / (1000 * 60 * 60 * 24));
}

/**
 * Helper: Infer pain points from company signals
 */
function inferPainPoints(company) {
  const painPoints = [];
  const signals = company.signals || [];
  const signalTypes = company.signal_types || [];

  if (signalTypes.some(t => t?.toLowerCase().includes('hiring') || t?.toLowerCase().includes('expansion'))) {
    painPoints.push('scaling operations');
  }
  if (signalTypes.some(t => t?.toLowerCase().includes('funding'))) {
    painPoints.push('capital deployment');
  }
  if (signalTypes.some(t => t?.toLowerCase().includes('office') || t?.toLowerCase().includes('relocation'))) {
    painPoints.push('growth infrastructure');
  }
  if (company.employee_count > 200) {
    painPoints.push('enterprise efficiency');
  }
  if (painPoints.length === 0) {
    painPoints.push('business growth', 'operational efficiency');
  }

  return painPoints;
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

    // 3. Execute SIVA tools based on intent (with REAL data from DB)
    const toolsToRun = nluService.getToolsForIntent(intentResult.intent);
    let toolResults = [];

    if (toolsToRun.length > 0) {
      console.log(`[Chat] Executing tools: ${toolsToRun.join(', ')}`);
      // Pass tenantId for entity context resolution
      toolResults = await executeTools(toolsToRun, {
        ...context,
        entities: intentResult.entities
      }, tenantId || DEMO_TENANT_ID);
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
