/**
 * SIVA Intelligence API Routes
 * Sprint 76: Intelligent UI Integration
 *
 * Endpoints for proactive SIVA intelligence in the UI.
 *
 * Endpoints:
 * - POST /api/siva/insights - Get proactive insights for a company
 * - GET /api/siva/dashboard - Get dashboard insights for top companies
 * - POST /api/siva/analyze - Run full SIVA analysis on an entity
 * - GET /api/siva/health - Health check
 */

const express = require('express');
const router = express.Router();

const {
  generateProactiveInsights,
  getDashboardInsights,
  clearInsightCache
} = require('../server/services/sivaProactiveInsights');

const {
  getCompanyContext,
  searchCompanies,
  DEMO_TENANT_ID
} = require('../server/services/sivaEntityContext');

// ============================================================================
// POST /api/siva/insights - Get proactive insights for a company
// ============================================================================

router.post('/insights', async (req, res) => {
  const startTime = Date.now();

  try {
    const { company_id, company_name, domain } = req.body;
    const tenantId = req.user?.tenant_id || req.body.tenant_id || DEMO_TENANT_ID;

    if (!company_id && !company_name && !domain) {
      return res.status(400).json({
        success: false,
        error: 'company_id, company_name, or domain is required'
      });
    }

    console.log(`[SIVA] Generating insights for: ${company_name || company_id || domain}`);

    const insights = await generateProactiveInsights({
      companyId: company_id,
      companyName: company_name,
      tenantId
    });

    res.json({
      ...insights,
      api_latency_ms: Date.now() - startTime
    });

  } catch (error) {
    console.error('[SIVA] Insights error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET /api/siva/dashboard - Get dashboard insights for top companies
// ============================================================================

router.get('/dashboard', async (req, res) => {
  const startTime = Date.now();

  try {
    const tenantId = req.user?.tenant_id || req.query.tenant_id || DEMO_TENANT_ID;
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);

    console.log(`[SIVA] Generating dashboard insights for tenant: ${tenantId}`);

    const insights = await getDashboardInsights(tenantId, limit);

    res.json({
      ...insights,
      api_latency_ms: Date.now() - startTime
    });

  } catch (error) {
    console.error('[SIVA] Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// POST /api/siva/analyze - Full SIVA analysis on an entity
// ============================================================================

router.post('/analyze', async (req, res) => {
  const startTime = Date.now();

  try {
    const { company_id, company_name, include_outreach = false } = req.body;
    const tenantId = req.user?.tenant_id || req.body.tenant_id || DEMO_TENANT_ID;

    if (!company_id && !company_name) {
      return res.status(400).json({
        success: false,
        error: 'company_id or company_name is required'
      });
    }

    // Get full company context
    const companyContext = await getCompanyContext({
      companyId: company_id,
      companyName: company_name,
      tenantId
    });

    if (!companyContext) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    // Generate insights
    const insights = await generateProactiveInsights({
      companyId: companyContext.id,
      tenantId
    });

    // Full analysis response
    const response = {
      success: true,
      company: companyContext,
      analysis: {
        scores: insights.scores,
        insights: insights.insights,
        recommended_actions: insights.recommended_actions
      },
      signals: {
        total: companyContext.signal_count,
        types: companyContext.signal_types,
        details: companyContext.signals
      },
      api_latency_ms: Date.now() - startTime,
      analyzed_at: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error('[SIVA] Analyze error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// POST /api/siva/search - Search companies with SIVA context
// ============================================================================

router.post('/search', async (req, res) => {
  const startTime = Date.now();

  try {
    const { query, sector, location, min_score, limit = 20 } = req.body;
    const tenantId = req.user?.tenant_id || req.body.tenant_id || DEMO_TENANT_ID;

    const results = await searchCompanies({
      query,
      sector,
      location,
      minScore: min_score,
      tenantId,
      limit
    });

    res.json({
      success: true,
      results,
      total: results.length,
      api_latency_ms: Date.now() - startTime
    });

  } catch (error) {
    console.error('[SIVA] Search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// POST /api/siva/context - Get entity context for UI
// ============================================================================

router.post('/context', async (req, res) => {
  const startTime = Date.now();

  try {
    const { company_id, company_name, domain } = req.body;
    const tenantId = req.user?.tenant_id || req.body.tenant_id || DEMO_TENANT_ID;

    const context = await getCompanyContext({
      companyId: company_id,
      companyName: company_name,
      domain,
      tenantId
    });

    if (!context) {
      return res.status(404).json({
        success: false,
        error: 'Entity not found'
      });
    }

    res.json({
      success: true,
      context,
      api_latency_ms: Date.now() - startTime
    });

  } catch (error) {
    console.error('[SIVA] Context error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DELETE /api/siva/cache/:companyId - Clear cache for a company
// ============================================================================

router.delete('/cache/:companyId', (req, res) => {
  const { companyId } = req.params;
  clearInsightCache(companyId);
  res.json({
    success: true,
    message: `Cache cleared for ${companyId}`
  });
});

// ============================================================================
// GET /api/siva/health - Health check
// ============================================================================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'siva-intelligence',
    status: 'healthy',
    features: {
      proactive_insights: true,
      entity_context: true,
      dashboard_insights: true,
      tool_execution: true
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
