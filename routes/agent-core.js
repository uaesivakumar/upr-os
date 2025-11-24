/**
 * Agent Core API Routes - Sprint 20 Task 1 & 2
 *
 * REST API Layer for all 12 SIVA Tools + Database Persistence
 *
 * Tool Execution Endpoints:
 * - POST /api/agent-core/v1/tools/evaluate_company_quality (Tool 1)
 * - POST /api/agent-core/v1/tools/select_contact_tier (Tool 2)
 * - POST /api/agent-core/v1/tools/calculate_timing_score (Tool 3)
 * - POST /api/agent-core/v1/tools/check_edge_cases (Tool 4)
 * - POST /api/agent-core/v1/tools/match_banking_products (Tool 5)
 * - POST /api/agent-core/v1/tools/select_outreach_channel (Tool 6)
 * - POST /api/agent-core/v1/tools/generate_opening_context (Tool 7)
 * - POST /api/agent-core/v1/tools/generate_composite_score (Tool 8)
 * - POST /api/agent-core/v1/tools/generate_outreach_message (Tool 9)
 * - POST /api/agent-core/v1/tools/determine_followup_strategy (Tool 10)
 * - POST /api/agent-core/v1/tools/handle_objection (Tool 11)
 * - POST /api/agent-core/v1/tools/track_relationship_health (Tool 12)
 *
 * Decision Query & Analytics Endpoints:
 * - GET /api/agent-core/v1/decisions - List all decisions (paginated)
 * - GET /api/agent-core/v1/decisions/:id - Get single decision
 * - GET /api/agent-core/v1/decisions/company/:companyId - Company decision history
 * - POST /api/agent-core/v1/decisions/:id/override - Log human override
 * - GET /api/agent-core/v1/analytics/tool-performance - Per-tool performance metrics
 * - GET /api/agent-core/v1/analytics/override-analytics - Override patterns
 * - GET /api/agent-core/v1/analytics/low-confidence - Decisions needing review
 *
 * Health & Diagnostics:
 * - GET /api/agent-core/v1/health
 * - GET /api/agent-core/v1/__diag
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');
const agentPersistence = require('../server/services/agentPersistence');

// Import all 12 SIVA tools
const CompanyQualityTool = require('../server/siva-tools/CompanyQualityToolStandalone');
const ContactTierTool = require('../server/siva-tools/ContactTierToolStandalone');
const TimingScoreTool = require('../server/siva-tools/TimingScoreToolStandalone');
const EdgeCasesTool = require('../server/siva-tools/EdgeCasesToolStandalone');
const BankingProductMatchTool = require('../server/siva-tools/BankingProductMatchToolStandalone');
const OutreachChannelTool = require('../server/siva-tools/OutreachChannelToolStandalone');
const OpeningContextTool = require('../server/siva-tools/OpeningContextToolStandalone');
const CompositeScoreTool = require('../server/siva-tools/CompositeScoreToolStandalone');
const OutreachMessageGeneratorTool = require('../server/siva-tools/OutreachMessageGeneratorToolStandalone');
const FollowUpStrategyTool = require('../server/siva-tools/FollowUpStrategyToolStandalone');
const ObjectionHandlerTool = require('../server/siva-tools/ObjectionHandlerToolStandalone');
const RelationshipTrackerTool = require('../server/siva-tools/RelationshipTrackerToolStandalone');

// Initialize tool instances
const tools = {
  companyQuality: new CompanyQualityTool(),
  contactTier: new ContactTierTool(),
  timingScore: new TimingScoreTool(),
  edgeCases: new EdgeCasesTool(),
  bankingProductMatch: new BankingProductMatchTool(),
  outreachChannel: new OutreachChannelTool(),
  openingContext: new OpeningContextTool(),
  compositeScore: new CompositeScoreTool(),
  outreachMessage: new OutreachMessageGeneratorTool(),
  followUpStrategy: new FollowUpStrategyTool(),
  objectionHandler: new ObjectionHandlerTool(),
  relationshipTracker: new RelationshipTrackerTool()
};

// Rate limiter: 100 requests per minute per tool
const toolRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    success: false,
    error: 'Rate limit exceeded. Maximum 100 requests per minute per tool.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Tool layer mapping
const TOOL_LAYERS = {
  'CompanyQualityTool': 'foundation',
  'ContactTierTool': 'foundation',
  'TimingScoreTool': 'foundation',
  'EdgeCasesTool': 'foundation',
  'BankingProductMatchTool': 'strict',
  'OutreachChannelTool': 'strict',
  'OpeningContextTool': 'strict',
  'CompositeScoreTool': 'strict',
  'OutreachMessageGeneratorTool': 'delegated',
  'FollowUpStrategyTool': 'delegated',
  'ObjectionHandlerTool': 'delegated',
  'RelationshipTrackerTool': 'delegated'
};

// Primitive name mapping
const PRIMITIVE_NAMES = {
  'CompanyQualityTool': 'EVALUATE_COMPANY_QUALITY',
  'ContactTierTool': 'SELECT_CONTACT_TIER',
  'TimingScoreTool': 'CALCULATE_TIMING_SCORE',
  'EdgeCasesTool': 'CHECK_EDGE_CASES',
  'BankingProductMatchTool': 'MATCH_BANKING_PRODUCTS',
  'OutreachChannelTool': 'SELECT_OUTREACH_CHANNEL',
  'OpeningContextTool': 'GENERATE_OPENING_CONTEXT',
  'CompositeScoreTool': 'GENERATE_COMPOSITE_SCORE',
  'OutreachMessageGeneratorTool': 'GENERATE_OUTREACH_MESSAGE',
  'FollowUpStrategyTool': 'DETERMINE_FOLLOWUP_STRATEGY',
  'ObjectionHandlerTool': 'HANDLE_OBJECTION',
  'RelationshipTrackerTool': 'TRACK_RELATIONSHIP_HEALTH'
};

/**
 * Middleware: Tool execution wrapper with error handling and logging
 */
async function executeToolWithTracking(req, res, toolInstance, toolName) {
  const startTime = Date.now();
  const sessionId = req.headers['x-session-id'] || null;
  const tenantId = req.user?.tenant_id || req.body.tenantId || null;

  try {
    // Execute tool
    const result = await toolInstance.execute(req.body);
    const executionTimeMs = Date.now() - startTime;

    // Log to database (async, don't wait)
    agentPersistence.logDecision({
      toolName,
      toolLayer: TOOL_LAYERS[toolName],
      primitiveName: PRIMITIVE_NAMES[toolName],
      input: req.body,
      output: result,
      executionTimeMs,
      companyId: req.body.companyId || req.body.company_id || null,
      contactId: req.body.contactId || req.body.contact_id || null,
      signalId: req.body.signalId || req.body.signal_id || null,
      sessionId,
      moduleCaller: req.headers['x-module-caller'] || null,
      tenantId,
      policyVersion: toolInstance.POLICY_VERSION || 'v2.0'
    }).catch(err => {
      // Silent fail - don't block response
      console.error('Failed to persist decision:', err.message);
    });

    // Success response
    res.json({
      success: true,
      tool: toolName,
      result,
      metadata: {
        executionTimeMs,
        timestamp: new Date().toISOString(),
        sessionId,
        tenantId
      }
    });

  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    // Log error to Sentry
    Sentry.captureException(error, {
      tags: {
        tool: toolName,
        layer: TOOL_LAYERS[toolName],
        sessionId
      },
      extra: {
        input: req.body,
        executionTimeMs
      }
    });

    // Error response
    res.status(400).json({
      success: false,
      tool: toolName,
      error: error.message,
      metadata: {
        executionTimeMs,
        timestamp: new Date().toISOString(),
        sessionId,
        tenantId
      }
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FOUNDATION LAYER (Tools 1-4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Tool 1: CompanyQualityTool
 * POST /api/agent-core/v1/tools/evaluate_company_quality
 *
 * Evaluates company fit based on size, industry, location, and exclusions
 * SLA: ≤300ms P50, ≤900ms P95
 */
router.post('/v1/tools/evaluate_company_quality', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.companyQuality, 'CompanyQualityTool');
});

/**
 * Tool 2: ContactTierTool
 * POST /api/agent-core/v1/tools/select_contact_tier
 *
 * Classifies contact as STRATEGIC/GROWTH/TRANSACTIONAL based on seniority
 * SLA: ≤200ms P50, ≤600ms P95
 */
router.post('/v1/tools/select_contact_tier', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.contactTier, 'ContactTierTool');
});

/**
 * Tool 3: TimingScoreTool
 * POST /api/agent-core/v1/tools/calculate_timing_score
 *
 * Calculates optimal timing score based on calendar, signal freshness, industry
 * SLA: ≤120ms P50, ≤300ms P95
 */
router.post('/v1/tools/calculate_timing_score', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.timingScore, 'TimingScoreTool');
});

/**
 * Tool 4: EdgeCasesTool
 * POST /api/agent-core/v1/tools/check_edge_cases
 *
 * Detects blockers (enterprise brands, government, sanctioned entities)
 * SLA: ≤120ms P50, ≤300ms P95
 */
router.post('/v1/tools/check_edge_cases', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.edgeCases, 'EdgeCasesTool');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRICT LAYER (Tools 5-8)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Tool 5: BankingProductMatchTool
 * POST /api/agent-core/v1/tools/match_banking_products
 *
 * Matches company to Emirates NBD products (38 products across 5 categories)
 * SLA: ≤250ms P50, ≤700ms P95
 */
router.post('/v1/tools/match_banking_products', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.bankingProductMatch, 'BankingProductMatchTool');
});

/**
 * Tool 6: OutreachChannelTool
 * POST /api/agent-core/v1/tools/select_outreach_channel
 *
 * Selects optimal outreach channel (EMAIL primary, LinkedIn fallback)
 * SLA: ≤150ms P50, ≤400ms P95
 */
router.post('/v1/tools/select_outreach_channel', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.outreachChannel, 'OutreachChannelTool');
});

/**
 * Tool 7: OpeningContextTool
 * POST /api/agent-core/v1/tools/generate_opening_context
 *
 * Generates personalized opening context based on signal type
 * SLA: ≤200ms P50, ≤500ms P95
 */
router.post('/v1/tools/generate_opening_context', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.openingContext, 'OpeningContextTool');
});

/**
 * Tool 8: CompositeScoreTool
 * POST /api/agent-core/v1/tools/generate_composite_score
 *
 * Generates unified Q-Score (0-100) and lead tier (HOT/WARM/COLD)
 * Aggregates outputs from Tools 1-7
 * SLA: ≤50ms P50, ≤100ms P95
 */
router.post('/v1/tools/generate_composite_score', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.compositeScore, 'CompositeScoreTool');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELEGATED LAYER (Tools 9-12)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Tool 9: OutreachMessageGeneratorTool
 * POST /api/agent-core/v1/tools/generate_outreach_message
 *
 * Generates personalized outreach email using GPT-4 Turbo
 * SLA: ≤2000ms P50, ≤4000ms P95
 */
router.post('/v1/tools/generate_outreach_message', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.outreachMessage, 'OutreachMessageGeneratorTool');
});

/**
 * Tool 10: FollowUpStrategyTool
 * POST /api/agent-core/v1/tools/determine_followup_strategy
 *
 * Determines follow-up strategy based on engagement level
 * Optional LLM enhancement for message generation
 * SLA: ≤100ms P50 (deterministic), ≤2500ms P95 (with LLM)
 */
router.post('/v1/tools/determine_followup_strategy', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.followUpStrategy, 'FollowUpStrategyTool');
});

/**
 * Tool 11: ObjectionHandlerTool
 * POST /api/agent-core/v1/tools/handle_objection
 *
 * Classifies objection and generates response strategy
 * Optional LLM enhancement for personalized responses
 * SLA: ≤100ms P50 (deterministic), ≤2500ms P95 (with LLM)
 */
router.post('/v1/tools/handle_objection', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.objectionHandler, 'ObjectionHandlerTool');
});

/**
 * Tool 12: RelationshipTrackerTool
 * POST /api/agent-core/v1/tools/track_relationship_health
 *
 * Tracks relationship health using RFM model (Recency, Frequency, Quality)
 * Optional LLM enhancement for nurture content
 * SLA: ≤50ms P50 (deterministic), ≤2500ms P95 (with LLM)
 */
router.post('/v1/tools/track_relationship_health', toolRateLimiter, async (req, res) => {
  await executeToolWithTracking(req, res, tools.relationshipTracker, 'RelationshipTrackerTool');
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DECISION QUERY & ANALYTICS (Sprint 20 Task 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * List all agent decisions (paginated)
 * GET /api/agent-core/v1/decisions?limit=50&offset=0&toolName=CompanyQualityTool&minConfidence=0.80
 *
 * Query params:
 * - limit: Max results (default: 50)
 * - offset: Pagination offset (default: 0)
 * - toolName: Filter by specific tool
 * - minConfidence: Filter by minimum confidence
 */
router.get('/v1/decisions', async (req, res) => {
  try {
    const { limit = 50, offset = 0, toolName, minConfidence } = req.query;

    let decisions;
    if (toolName) {
      // Query by tool name
      decisions = await agentPersistence.getToolDecisions(toolName, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        minConfidence: minConfidence ? parseFloat(minConfidence) : null
      });
    } else {
      // Query all decisions (need to add this method)
      const db = require('../utils/db');
      let query = 'SELECT * FROM agent_decisions';
      const values = [];

      if (minConfidence) {
        query += ' WHERE confidence >= $1';
        values.push(parseFloat(minConfidence));
      }

      query += ` ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
      values.push(parseInt(limit), parseInt(offset));

      const result = await db.query(query, values);
      decisions = result.rows;
    }

    res.json({
      success: true,
      total: decisions.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      decisions
    });

  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get single decision by ID
 * GET /api/agent-core/v1/decisions/:id
 */
router.get('/v1/decisions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = require('../utils/db');

    const query = `
      SELECT
        ad.*,
        ao.id as override_id,
        ao.human_result,
        ao.override_reason,
        ao.agreement,
        ao.user_email,
        ao.created_at as override_at
      FROM agent_decisions ad
      LEFT JOIN agent_overrides ao ON ao.decision_id = ad.id
      WHERE ad.id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Decision not found'
      });
    }

    res.json({
      success: true,
      decision: result.rows[0]
    });

  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get decision history for a company
 * GET /api/agent-core/v1/decisions/company/:companyId?limit=50&offset=0
 */
router.get('/v1/decisions/company/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const decisions = await agentPersistence.getCompanyDecisions(companyId, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      companyId,
      total: decisions.length,
      decisions
    });

  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Log human override of an AI decision
 * POST /api/agent-core/v1/decisions/:id/override
 *
 * Body:
 * {
 *   "humanResult": { ... },
 *   "overrideReason": "INCORRECT_CLASSIFICATION",
 *   "notes": "Company is actually a large enterprise",
 *   "userId": "uuid",
 *   "userEmail": "user@example.com"
 * }
 */
router.post('/v1/decisions/:id/override', async (req, res) => {
  try {
    const { id: decisionId } = req.params;
    const { humanResult, overrideReason, notes, userId, userEmail } = req.body;

    // Validate required fields
    if (!humanResult || !overrideReason) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: humanResult, overrideReason'
      });
    }

    // Get original decision
    const db = require('../utils/db');
    const decisionQuery = 'SELECT * FROM agent_decisions WHERE id = $1';
    const decisionResult = await db.query(decisionQuery, [decisionId]);

    if (decisionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Decision not found'
      });
    }

    const aiResult = decisionResult.rows[0].output_result;

    // Log override
    const overrideId = await agentPersistence.logOverride({
      decisionId,
      aiResult,
      humanResult,
      overrideReason,
      notes,
      userId,
      userEmail,
      tenantId: req.user?.tenant_id || null
    });

    res.json({
      success: true,
      overrideId,
      message: 'Override logged successfully'
    });

  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get per-tool performance metrics
 * GET /api/agent-core/v1/analytics/tool-performance
 *
 * Returns: latency (p50/p95/p99), confidence distribution, execution counts
 */
router.get('/v1/analytics/tool-performance', async (req, res) => {
  try {
    const metrics = await agentPersistence.getToolPerformance();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      metrics
    });

  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get override analytics
 * GET /api/agent-core/v1/analytics/override-analytics
 *
 * Returns: Override rates, disagreement patterns, score deltas by tool
 */
router.get('/v1/analytics/override-analytics', async (req, res) => {
  try {
    const analytics = await agentPersistence.getOverrideAnalytics();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      analytics
    });

  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get low-confidence decisions needing review
 * GET /api/agent-core/v1/analytics/low-confidence?threshold=0.60&limit=50
 *
 * Returns: Decisions below confidence threshold, sorted by confidence ASC
 */
router.get('/v1/analytics/low-confidence', async (req, res) => {
  try {
    const { threshold = 0.60, limit = 50 } = req.query;

    const decisions = await agentPersistence.getLowConfidenceDecisions(
      parseFloat(threshold),
      parseInt(limit)
    );

    res.json({
      success: true,
      threshold: parseFloat(threshold),
      total: decisions.length,
      decisions
    });

  } catch (error) {
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HEALTH & DIAGNOSTICS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Health check endpoint
 * GET /api/agent-core/v1/health
 *
 * Returns health status of all 12 SIVA tools
 */
router.get('/v1/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    tools: {
      foundation: {
        companyQuality: tools.companyQuality ? 'operational' : 'unavailable',
        contactTier: tools.contactTier ? 'operational' : 'unavailable',
        timingScore: tools.timingScore ? 'operational' : 'unavailable',
        edgeCases: tools.edgeCases ? 'operational' : 'unavailable'
      },
      strict: {
        bankingProductMatch: tools.bankingProductMatch ? 'operational' : 'unavailable',
        outreachChannel: tools.outreachChannel ? 'operational' : 'unavailable',
        openingContext: tools.openingContext ? 'operational' : 'unavailable',
        compositeScore: tools.compositeScore ? 'operational' : 'unavailable'
      },
      delegated: {
        outreachMessage: tools.outreachMessage ? 'operational' : 'unavailable',
        followUpStrategy: tools.followUpStrategy ? 'operational' : 'unavailable',
        objectionHandler: tools.objectionHandler ? 'operational' : 'unavailable',
        relationshipTracker: tools.relationshipTracker ? 'operational' : 'unavailable'
      }
    },
    totalTools: 12,
    operationalTools: Object.values(tools).filter(t => t).length
  };

  res.json(health);
});

/**
 * Internal diagnostics endpoint
 * GET /api/agent-core/v1/__diag
 *
 * Returns detailed diagnostics for debugging
 */
router.get('/v1/__diag', (req, res) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    tools: Object.entries(tools).map(([key, tool]) => ({
      name: key,
      className: tool.constructor.name,
      policyVersion: tool.POLICY_VERSION || 'unknown',
      hasExecuteMethod: typeof tool.execute === 'function'
    })),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: process.uptime()
    }
  };

  res.json(diagnostics);
});

// ═══════════════════════════════════════════════════════════════════════════
// Sprint 22: Feedback Collection & Rule Comparison APIs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/agent-core/v1/feedback
 *
 * Submit feedback on a decision's real-world outcome (Sprint 22 → Sprint 26 Enhanced)
 *
 * Request Body:
 * {
 *   "decision_id": "uuid",
 *   "outcome_positive": true,
 *   "outcome_type": "converted",  // converted|engaged|ignored|bounced|error
 *   "outcome_value": 25000.00,
 *   "notes": "Deal closed after 3 follow-ups",
 *   "metadata": { "campaign_id": "Q4_2025_UAE" }
 * }
 *
 * Response:
 * {
 *   "feedback_id": "uuid",
 *   "status": "recorded",
 *   "current_performance": {
 *     "tool_name": "CompanyQualityTool",
 *     "rule_version": "v2.2",
 *     "success_rate": 0.88,
 *     "total_decisions": 309,
 *     "decisions_with_feedback": 125
 *   }
 * }
 */
router.post('/v1/feedback', async (req, res) => {
  try {
    const {
      decision_id,
      outcome_positive,
      outcome_type,
      outcome_value,
      notes,
      metadata
    } = req.body;

    // Validation
    if (!decision_id) {
      return res.status(400).json({
        success: false,
        error: 'decision_id is required'
      });
    }

    // outcome_positive can be true, false, or null (pending)
    if (outcome_positive !== null && typeof outcome_positive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'outcome_positive must be boolean or null'
      });
    }

    // Validate outcome_type enum
    const validOutcomeTypes = ['converted', 'engaged', 'ignored', 'bounced', 'error'];
    if (outcome_type && !validOutcomeTypes.includes(outcome_type)) {
      return res.status(400).json({
        success: false,
        error: `outcome_type must be one of: ${validOutcomeTypes.join(', ')}`
      });
    }

    // Validate outcome_value (must be non-negative)
    if (outcome_value !== null && outcome_value !== undefined && outcome_value < 0) {
      return res.status(400).json({
        success: false,
        error: 'outcome_value must be non-negative'
      });
    }

    // Check if decision exists and get decision details
    const decisionCheck = await agentPersistence.pool.query(`
      SELECT decision_id, tool_name, rule_name, rule_version
      FROM agent_core.agent_decisions
      WHERE decision_id = $1
    `, [decision_id]);

    if (decisionCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Decision not found'
      });
    }

    const decision = decisionCheck.rows[0];

    // Insert feedback
    const { v4: uuidv4 } = require('uuid');
    const feedbackResult = await agentPersistence.pool.query(`
      INSERT INTO agent_core.decision_feedback (
        feedback_id,
        decision_id,
        outcome_positive,
        outcome_type,
        outcome_value,
        notes,
        metadata,
        feedback_source,
        feedback_by,
        feedback_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING feedback_id, feedback_at
    `, [
      uuidv4(),
      decision_id,
      outcome_positive,
      outcome_type || null,
      outcome_value || null,
      notes || null,
      metadata ? JSON.stringify(metadata) : null,
      'api',  // feedback_source
      req.user?.email || req.body.feedback_by || 'anonymous'  // feedback_by
    ]);

    // Get current performance metrics for this tool/version
    const performanceQuery = await agentPersistence.pool.query(`
      SELECT
        d.tool_name,
        d.rule_version,
        COUNT(DISTINCT d.decision_id) as total_decisions,
        COUNT(DISTINCT f.feedback_id) as decisions_with_feedback,
        AVG(CASE WHEN f.outcome_positive = true THEN 1.0 ELSE 0.0 END) as success_rate,
        AVG(d.confidence_score) as avg_confidence
      FROM agent_core.agent_decisions d
      LEFT JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
      WHERE d.tool_name = $1
        AND d.rule_version = $2
        AND d.decided_at >= NOW() - INTERVAL '7 days'
      GROUP BY d.tool_name, d.rule_version
    `, [decision.tool_name, decision.rule_version]);

    const performance = performanceQuery.rows[0] || {
      tool_name: decision.tool_name,
      rule_version: decision.rule_version,
      total_decisions: 0,
      decisions_with_feedback: 0,
      success_rate: null,
      avg_confidence: null
    };

    // Check if automated trigger conditions are met
    const alerts = [];
    if (performance.success_rate !== null && performance.success_rate < 0.85) {
      alerts.push({
        severity: 'warning',
        message: `Success rate below threshold: ${(performance.success_rate * 100).toFixed(1)}% < 85%`,
        action: 'review_failed_decisions'
      });
    }

    res.status(201).json({
      success: true,
      feedback_id: feedbackResult.rows[0].feedback_id,
      status: 'recorded',
      feedback_at: feedbackResult.rows[0].feedback_at,
      current_performance: {
        tool_name: performance.tool_name,
        rule_version: performance.rule_version,
        success_rate: performance.success_rate !== null ? parseFloat(performance.success_rate.toFixed(4)) : null,
        avg_confidence: performance.avg_confidence !== null ? parseFloat(performance.avg_confidence.toFixed(4)) : null,
        total_decisions: parseInt(performance.total_decisions),
        decisions_with_feedback: parseInt(performance.decisions_with_feedback)
      },
      alerts: alerts.length > 0 ? alerts : undefined
    });

  } catch (error) {
    console.error('Feedback submission error:', error);
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: 'Failed to record feedback'
    });
  }
});

/**
 * GET /api/agent-core/v1/feedback/summary
 *
 * Get aggregated feedback analytics (Sprint 26)
 *
 * Query Parameters:
 * - tool_name (optional): Filter by specific tool
 * - rule_version (optional): Filter by rule version
 * - date_from (optional): Start date (YYYY-MM-DD)
 * - date_to (optional): End date (YYYY-MM-DD)
 * - group_by (optional): day|week|month|rule_version (default: rule_version)
 *
 * Example: GET /api/agent-core/v1/feedback/summary?tool_name=CompanyQualityTool&group_by=rule_version
 *
 * Response:
 * {
 *   "tool_name": "CompanyQualityTool",
 *   "date_range": { "from": "2025-11-01", "to": "2025-11-16" },
 *   "summary": [{
 *     "rule_version": "v2.2",
 *     "total_decisions": 309,
 *     "decisions_with_feedback": 125,
 *     "success_rate": 0.88,
 *     "avg_confidence": 0.85,
 *     "avg_latency_ms": 7,
 *     "avg_outcome_value": 18500.00,
 *     "outcome_breakdown": {
 *       "converted": 45, "engaged": 60, "ignored": 15, "bounced": 5
 *     }
 *   }],
 *   "alerts": [{ "severity": "warning", "message": "...", "recommendation": "..." }]
 * }
 */
router.get('/v1/feedback/summary', async (req, res) => {
  try {
    const {
      tool_name,
      rule_version,
      date_from,
      date_to,
      group_by = 'rule_version'
    } = req.query;

    // Validate group_by
    const validGroupBy = ['day', 'week', 'month', 'rule_version'];
    if (!validGroupBy.includes(group_by)) {
      return res.status(400).json({
        success: false,
        error: `group_by must be one of: ${validGroupBy.join(', ')}`
      });
    }

    // Build date range (default: last 30 days)
    const dateFrom = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateTo = date_to || new Date().toISOString().split('T')[0];

    // Build WHERE clause
    const whereClauses = [`d.decided_at >= $1::date AND d.decided_at <= $2::date`];
    const params = [dateFrom, dateTo];

    if (tool_name) {
      whereClauses.push(`d.tool_name = $${params.length + 1}`);
      params.push(tool_name);
    }

    if (rule_version) {
      whereClauses.push(`d.rule_version = $${params.length + 1}`);
      params.push(rule_version);
    }

    // Build GROUP BY clause
    let groupByClause;
    let selectFields;
    if (group_by === 'rule_version') {
      groupByClause = 'd.rule_version, d.tool_name';
      selectFields = 'd.rule_version, d.tool_name';
    } else if (group_by === 'day') {
      groupByClause = 'DATE(d.decided_at), d.tool_name';
      selectFields = 'DATE(d.decided_at) as decision_date, d.tool_name';
    } else if (group_by === 'week') {
      groupByClause = 'DATE_TRUNC(\'week\', d.decided_at), d.tool_name';
      selectFields = 'DATE_TRUNC(\'week\', d.decided_at)::date as decision_week, d.tool_name';
    } else if (group_by === 'month') {
      groupByClause = 'DATE_TRUNC(\'month\', d.decided_at), d.tool_name';
      selectFields = 'DATE_TRUNC(\'month\', d.decided_at)::date as decision_month, d.tool_name';
    }

    // Main aggregation query
    const summaryQuery = await agentPersistence.pool.query(`
      SELECT
        ${selectFields},
        COUNT(DISTINCT d.decision_id) as total_decisions,
        COUNT(DISTINCT f.feedback_id) as decisions_with_feedback,
        AVG(CASE WHEN f.outcome_positive = true THEN 1.0
                 WHEN f.outcome_positive = false THEN 0.0
                 ELSE NULL END) as success_rate,
        AVG(d.confidence_score) as avg_confidence,
        AVG(d.latency_ms) as avg_latency_ms,
        AVG(f.outcome_value) as avg_outcome_value,
        COUNT(CASE WHEN f.outcome_type = 'converted' THEN 1 END) as converted_count,
        COUNT(CASE WHEN f.outcome_type = 'engaged' THEN 1 END) as engaged_count,
        COUNT(CASE WHEN f.outcome_type = 'ignored' THEN 1 END) as ignored_count,
        COUNT(CASE WHEN f.outcome_type = 'bounced' THEN 1 END) as bounced_count,
        COUNT(CASE WHEN f.outcome_type = 'error' THEN 1 END) as error_count
      FROM agent_core.agent_decisions d
      LEFT JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY ${groupByClause}
      ORDER BY total_decisions DESC
    `, params);

    // Generate alerts based on performance
    const alerts = [];
    summaryQuery.rows.forEach(row => {
      // Alert 1: Success rate below threshold
      if (row.success_rate !== null && row.success_rate < 0.85) {
        alerts.push({
          severity: 'warning',
          tool: row.tool_name,
          rule_version: row.rule_version || 'N/A',
          message: `Success rate below threshold: ${(row.success_rate * 100).toFixed(1)}% < 85%`,
          recommendation: 'Review failed decisions and consider rule adjustment'
        });
      }

      // Alert 2: Low confidence
      if (row.avg_confidence !== null && row.avg_confidence < 0.75) {
        alerts.push({
          severity: 'info',
          tool: row.tool_name,
          rule_version: row.rule_version || 'N/A',
          message: `Average confidence below threshold: ${row.avg_confidence.toFixed(2)} < 0.75`,
          recommendation: 'Increase confidence thresholds or improve rule clarity'
        });
      }

      // Alert 3: Low feedback coverage
      const feedbackCoverage = row.total_decisions > 0
        ? row.decisions_with_feedback / row.total_decisions
        : 0;
      if (feedbackCoverage < 0.2 && row.total_decisions >= 50) {
        alerts.push({
          severity: 'info',
          tool: row.tool_name,
          rule_version: row.rule_version || 'N/A',
          message: `Low feedback coverage: ${(feedbackCoverage * 100).toFixed(1)}% (${row.decisions_with_feedback}/${row.total_decisions})`,
          recommendation: 'Solicit more user feedback for this tool'
        });
      }
    });

    // Format summary results
    const summary = summaryQuery.rows.map(row => ({
      ...(row.rule_version && { rule_version: row.rule_version }),
      ...(row.decision_date && { date: row.decision_date }),
      ...(row.decision_week && { week: row.decision_week }),
      ...(row.decision_month && { month: row.decision_month }),
      tool_name: row.tool_name,
      total_decisions: parseInt(row.total_decisions),
      decisions_with_feedback: parseInt(row.decisions_with_feedback),
      success_rate: row.success_rate !== null ? parseFloat(row.success_rate.toFixed(4)) : null,
      avg_confidence: row.avg_confidence !== null ? parseFloat(row.avg_confidence.toFixed(4)) : null,
      avg_latency_ms: row.avg_latency_ms !== null ? parseFloat(row.avg_latency_ms.toFixed(2)) : null,
      avg_outcome_value: row.avg_outcome_value !== null ? parseFloat(row.avg_outcome_value.toFixed(2)) : null,
      outcome_breakdown: {
        converted: parseInt(row.converted_count),
        engaged: parseInt(row.engaged_count),
        ignored: parseInt(row.ignored_count),
        bounced: parseInt(row.bounced_count),
        error: parseInt(row.error_count)
      }
    }));

    res.json({
      success: true,
      tool_name: tool_name || 'all',
      date_range: {
        from: dateFrom,
        to: dateTo
      },
      group_by,
      summary,
      alerts: alerts.length > 0 ? alerts : undefined
    });

  } catch (error) {
    console.error('Feedback summary error:', error);
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feedback summary'
    });
  }
});

/**
 * GET /api/agent-core/v1/rule-comparison
 *
 * Compare performance of inline vs rule engine implementations (Sprint 22)
 */
router.get('/v1/rule-comparison', async (req, res) => {
  try {
    const {
      tool_name,
      version_a = 'v1.0_inline',
      version_b = 'v2.0',
      limit = 100
    } = req.query;

    if (!tool_name) {
      return res.status(400).json({ error: 'tool_name is required' });
    }

    // Query decision_performance view
    const result = await agentPersistence.pool.query(`
      SELECT
        rule_version,
        total_decisions,
        positive_outcomes,
        negative_outcomes,
        ROUND((positive_outcomes::DECIMAL / NULLIF(total_decisions, 0)) * 100, 2) as success_rate_pct,
        ROUND(AVG(execution_time_ms), 2) as avg_execution_time_ms
      FROM agent_core.decision_performance
      WHERE tool_name = $1
        AND rule_version IN ($2, $3)
      GROUP BY rule_version, total_decisions, positive_outcomes, negative_outcomes
      LIMIT $4
    `, [tool_name, version_a, version_b, limit]);

    // Calculate confidence interval (simple approach)
    const versionAData = result.rows.find(r => r.rule_version === version_a);
    const versionBData = result.rows.find(r => r.rule_version === version_b);

    const response = {
      tool_name,
      comparison: {
        version_a: {
          version: version_a,
          total_decisions: versionAData?.total_decisions || 0,
          positive_outcomes: versionAData?.positive_outcomes || 0,
          negative_outcomes: versionAData?.negative_outcomes || 0,
          success_rate_pct: versionAData?.success_rate_pct || 0,
          avg_execution_time_ms: versionAData?.avg_execution_time_ms || 0
        },
        version_b: {
          version: version_b,
          total_decisions: versionBData?.total_decisions || 0,
          positive_outcomes: versionBData?.positive_outcomes || 0,
          negative_outcomes: versionBData?.negative_outcomes || 0,
          success_rate_pct: versionBData?.success_rate_pct || 0,
          avg_execution_time_ms: versionBData?.avg_execution_time_ms || 0
        }
      },
      winner: null
    };

    // Determine winner (if enough data)
    if (versionAData && versionBData &&
        versionAData.total_decisions >= 30 && versionBData.total_decisions >= 30) {
      const aDelta = parseFloat(versionAData.success_rate_pct);
      const bDelta = parseFloat(versionBData.success_rate_pct);

      if (Math.abs(aDelta - bDelta) >= 5) { // 5% difference threshold
        response.winner = aDelta > bDelta ? version_a : version_b;
        response.confidence = 'medium';
      }
    }

    res.json(response);

  } catch (error) {
    console.error('Rule comparison error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to fetch rule comparison data' });
  }
});

/**
 * GET /api/agent-core/v1/shadow-mode-stats
 *
 * Get shadow mode execution statistics (Sprint 22)
 */
router.get('/v1/shadow-mode-stats', async (req, res) => {
  try {
    const stats = await agentPersistence.pool.query(`
      SELECT
        tool_name,
        COUNT(*) as total_executions,
        COUNT(CASE WHEN comparison->>'match' = 'true' THEN 1 END) as matching_executions,
        COUNT(CASE WHEN comparison->>'match' = 'false' THEN 1 END) as mismatching_executions,
        ROUND(AVG((comparison->>'score_diff')::DECIMAL), 2) as avg_score_diff,
        ROUND(AVG((comparison->>'confidence_diff')::DECIMAL), 4) as avg_confidence_diff,
        ROUND(AVG(execution_time_ms), 2) as avg_execution_time_ms
      FROM agent_core.agent_decisions
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND rule_version = 'v2.0'
      GROUP BY tool_name
      ORDER BY total_executions DESC
    `);

    res.json({
      period: 'last_7_days',
      tools: stats.rows,
      overall_match_rate_pct: stats.rows.length > 0
        ? Math.round((stats.rows.reduce((sum, r) => sum + parseInt(r.matching_executions), 0) /
                      stats.rows.reduce((sum, r) => sum + parseInt(r.total_executions), 0)) * 100)
        : 0
    });

  } catch (error) {
    console.error('Shadow mode stats error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to fetch shadow mode statistics' });
  }
});

module.exports = router;
