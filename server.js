// IMPORTANT: Import Sentry FIRST before anything else
require('./instrument.js');

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 8080;

// CRITICAL: Immediate health check BEFORE any middleware (for Cloud Run startup probe)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    port: PORT
  });
});

app.set('trust proxy', true);
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply general rate limiting to all API routes (Sprint 17 P1)
// Note: Health check endpoint is excluded (before this middleware)
(async () => {
  try {
    const { generalLimiter } = await import('./server/middleware/rateLimiter.js');
    app.use('/api/', generalLimiter);
    console.log('✅ General API rate limiting enabled (100 req/15min)');
  } catch (error) {
    console.warn('⚠️  Rate limiting middleware not loaded:', error.message);
  }
})();

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ready', database: 'connected' });
  } catch (error) {
    console.error('Readiness check failed:', error.message);
    res.status(503).json({ status: 'not ready', database: 'disconnected' });
  }
});

// Embedding health check endpoint (loaded async after RAG module)
let embeddingHealthHandler = null;

// API Routes - CommonJS (synchronous loading)
// NOTE: auth router moved to ES module section
const adminRouter = require('./routes/admin');
const agentCoreRouter = require('./routes/agent-core');  // Sprint 20: SIVA Tools API
const companiesRouter = require('./routes/companies');
const diagRouter = require('./routes/diag');
const emailRouter = require('./routes/email');
const enrichmentRouter = require('./routes/enrichment/unified');
// const housekeepingRouter = require('./routes/housekeeping'); // TODO: Create this route file
// NOTE: enrichRouter moved to ES module section (original enrichment system)
const hrLeadsRouter = require('./routes/hrLeads');
const newsRouter = require('./routes/news');
const outreachRouter = require('./routes/outreach');
const sourcingRouter = require('./routes/sourcing');
const statsRouter = require('./routes/stats');
const styleMemoryRouter = require('./routes/styleMemory');
const templatesRouter = require('./routes/templates');
const telemetryRouter = require('./routes/telemetry');
const monitoringRouter = require('./routes/monitoring');  // Sprint 28: Automated monitoring
const agentHubRouter = require('./routes/agent-hub');  // Sprint 29: Centralized Agentic Hub
const agentsActivityRouter = require('./routes/agents/activity');  // Sprint 50: SIVA Visualization
const chatRouter = require('./routes/chat');  // Sprint 53: AI Chat Interface

// Mount CommonJS routes immediately
// NOTE: /api/auth and /api/enrich mounted in ES module section
app.use('/api/admin', adminRouter);
app.use('/api/agent-core', agentCoreRouter);  // Sprint 20: 12 SIVA Tools API
app.use('/api/agents/activity', agentsActivityRouter);  // Sprint 50: Agent activity streaming
app.use('/api/companies', companiesRouter);  // Includes /resolve, /autocomplete, CRUD endpoints
app.use('/api/diag', diagRouter);
app.use('/api/email', emailRouter);

// Apply enrichment rate limiter to unified enrichment endpoint (Sprint 17 P1)
// Note: Specific rate limiter will be applied once ES modules load
app.use('/api/enrichment', enrichmentRouter);  // Unified enrichment: start, status, leads
// app.use('/api/housekeeping', housekeepingRouter);  // TODO: Create housekeeping route file
// NOTE: /api/enrich mounted in ES module section below
app.use('/api/hr-leads', hrLeadsRouter);
app.use('/api/news', newsRouter);
app.use('/api/outreach', outreachRouter);
app.use('/api/sourcing', sourcingRouter);
app.use('/api/stats', statsRouter);
app.use('/api/style-memory', styleMemoryRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/telemetry', telemetryRouter);
app.use('/api/monitoring', monitoringRouter);  // Sprint 28: Rule performance monitoring
app.use('/api/agent-hub', agentHubRouter);  // Sprint 29: Centralized Agentic Hub REST API
app.use('/api/chat', chatRouter);  // Sprint 53: AI Chat Interface

// ES Module routes - Load asynchronously
async function loadESModuleRoutes() {
  try {
    console.log('📦 Loading ES module routes...');

    // Load Sprint 19 routes first to test
    console.log('Loading orchestration...');
    const { default: orchestrationRouter } = await import('./routes/orchestration.js');
    console.log('Loading discovery...');
    const { default: discoveryRouter } = await import('./routes/discovery.js');
    console.log('Loading OS routes (Sprint 64)...');
    const { default: osRouter } = await import('./routes/os/index.js');
    console.log('Loading other routes...');

    const [
      { default: authRouter },
      { default: aiWelcomeRouter },
      { default: campaignTypesRouter },
      { default: enrichRouter },
      { default: experimentsRouter },
      { default: feedbackRouter },
      { default: feedbackAnalysisRouter },
      { default: hiringEnrichRouter },
      { default: hiringSignalsRouter },
      { default: intelligenceRouter },
      { default: knowledgeGraphRouter },
      { default: linkedinRouter },
      { default: metricsRouter },
      { default: radarRouter },
      { default: templateDraftRouter },
      { default: toolsRouter },
      rateLimiters
    ] = await Promise.all([
      import('./routes/auth.js'),
      import('./server/routes/aiWelcome.js'),  // Sprint 41: AI Welcome Dashboard
      import('./routes/campaignTypes.js'),
      import('./routes/enrich/index.js'),  // ORIGINAL enrichment system (Apollo, LLM, email validation)
      import('./routes/experiments.js'),
      import('./server/routes/feedback.js'),  // Sprint 41: Feedback collection endpoints
      import('./server/routes/feedbackAnalysis.js'),  // Sprint 41: Feedback analysis service
      import('./routes/hiringEnrich.js'),  // NEW hiring signals enrichment (mock leads)
      import('./routes/hiringSignals.js'),
      import('./routes/intelligence.js'),
      import('./routes/knowledgeGraph.js'),
      import('./routes/linkedin.js'),  // Sprint 18 Task 5: LinkedIn signal source
      import('./routes/metrics.js'),
      import('./routes/radar.js'),
      import('./routes/templateDraft.js'),
      import('./routes/tools.js'),
      import('./server/middleware/rateLimiter.js')  // Sprint 17 P1: Rate limiting
    ]);

    // Sprint 18 Task 6: Initialize webhook worker
    try {
      await import('./server/workers/webhookWorker.js');
      console.log('✅ Webhook worker initialized with retry logic');
    } catch (error) {
      console.warn('⚠️  Webhook worker not loaded:', error.message);
    }

    // Mount ES module routes with specific rate limiters (Sprint 17 P1)
    app.use('/api/auth', rateLimiters.authLimiter, authRouter);  // JWT-based authentication (5 attempts/15min)
    app.use('/api/ai-welcome', aiWelcomeRouter);  // Sprint 41: AI Welcome Dashboard
    app.use('/api/feedback', feedbackRouter);  // Sprint 41: Feedback collection endpoints
    app.use('/api/feedback-analysis', feedbackAnalysisRouter);  // Sprint 41: Feedback analysis service
    app.use('/api/campaign-types', campaignTypesRouter);
    app.use('/api/discovery', rateLimiters.radarLimiter, discoveryRouter);  // Sprint 19 Task 5: Unified signal pipeline (5 req/hour)
    app.use('/api/enrich', rateLimiters.enrichmentLimiter, enrichRouter);  // ORIGINAL enrichment system (20 req/15min)
    app.use('/api/experiments', experimentsRouter);
    app.use('/api/hiring-enrich', rateLimiters.enrichmentLimiter, hiringEnrichRouter);  // NEW hiring signals enrichment (20 req/15min)
    app.use('/api/hiring-signals', hiringSignalsRouter);  // Hiring signals (RADAR recall-mode)
    app.use('/api/intelligence', intelligenceRouter);
    app.use('/api/knowledge-graph', knowledgeGraphRouter);
    app.use('/api/linkedin', linkedinRouter);  // Sprint 18 Task 5: LinkedIn signal source
    app.use('/api/metrics', metricsRouter);
    app.use('/api/orchestration', orchestrationRouter);  // Sprint 19 Task 1: Multi-source orchestration
    app.use('/api/radar', rateLimiters.radarLimiter, radarRouter);  // RADAR discovery module (5 req/hour)
    app.use('/api/templates/draft', templateDraftRouter);  // AI template generation at /api/templates/draft
    app.use('/api/tools', toolsRouter);

    // Sprint 18 Task 6: Mount webhook routes
    const webhooksRouter = require('./routes/webhooks');
    app.use('/api/webhooks', webhooksRouter);  // Webhook delivery management

    // Sprint 64: Mount OS routes (Unified OS API Layer)
    app.use('/api/os', osRouter);
    console.log('✅ OS routes mounted at /api/os (Sprint 64: Unified OS API Layer)');

    console.log('✅ Original enrichment routes mounted at /api/enrich (rate limit: 20 req/15min)');
    console.log('✅ Hiring signals enrichment routes mounted at /api/hiring-enrich (rate limit: 20 req/15min)');
    console.log('✅ RADAR routes mounted at /api/radar (rate limit: 5 req/hour)');
    console.log('✅ Auth routes mounted at /api/auth (rate limit: 5 attempts/15min)');
    console.log('✅ AI Welcome Dashboard routes mounted at /api/ai-welcome (Sprint 41)');
    console.log('✅ Webhook routes mounted at /api/webhooks (Sprint 18 Task 6)');
    console.log('✅ LinkedIn routes mounted at /api/linkedin (Sprint 18 Task 5)');
    console.log('✅ Orchestration routes mounted at /api/orchestration (Sprint 19 Task 1)');
    console.log('✅ Discovery routes mounted at /api/discovery (Sprint 19 Task 5)');

    // Load RAG module for embedding health check
    const { default: rag } = await import('./server/lib/emailIntelligence/rag.js');
    const { getDb } = await import('./server/lib/emailIntelligence/db.js');

    // Register embedding health check endpoint
    app.get('/health/embeddings', async (req, res) => {
      const embeddingDb = getDb();
      const checks = {
        timestamp: new Date().toISOString(),
        status: 'unknown',
        checks: {},
        metrics: {}
      };

      try {
        // 1. Check database connection
        await embeddingDb.query('SELECT 1');
        checks.checks.database = { status: 'ok' };

        // 2. Check embedding dimensions in database
        // Use format_type() to correctly extract vector dimensions (384)
        const dimensionCheck = await embeddingDb.query(`
          SELECT
            (SELECT CAST(
              SUBSTRING(
                format_type(a.atttypid, a.atttypmod)
                FROM '\\(([0-9]+)\\)'
              ) AS INTEGER
            ) FROM pg_attribute a
             WHERE a.attrelid = 'pattern_failures'::regclass AND a.attname = 'embedding') as pf_dim,
            (SELECT CAST(
              SUBSTRING(
                format_type(a.atttypid, a.atttypmod)
                FROM '\\(([0-9]+)\\)'
              ) AS INTEGER
            ) FROM pg_attribute a
             WHERE a.attrelid = 'email_patterns'::regclass AND a.attname = 'embedding') as ep_dim,
            (SELECT CAST(
              SUBSTRING(
                format_type(a.atttypid, a.atttypmod)
                FROM '\\(([0-9]+)\\)'
              ) AS INTEGER
            ) FROM pg_attribute a
             WHERE a.attrelid = 'kb_chunks'::regclass AND a.attname = 'embedding') as kb_dim
        `);

        const dims = dimensionCheck.rows[0];
        const expectedDim = 384;
        const dimensionsCorrect =
          dims.pf_dim === expectedDim &&
          dims.ep_dim === expectedDim &&
          dims.kb_dim === expectedDim;

        checks.checks.dimensions = {
          status: dimensionsCorrect ? 'ok' : 'error',
          expected: expectedDim,
          actual: {
            pattern_failures: dims.pf_dim,
            email_patterns: dims.ep_dim,
            kb_chunks: dims.kb_dim
          }
        };

        // 3. Check embedding_meta table
        try {
          const metaCheck = await embeddingDb.query(`
            SELECT id, model_name, dimension, cost_per_1m_tokens, applied_at, applied_by, notes
            FROM embedding_meta
            ORDER BY applied_at DESC
            LIMIT 1
          `);

          if (metaCheck.rows.length > 0) {
            checks.checks.embedding_meta = {
              status: 'ok',
              current_config: metaCheck.rows[0]
            };
          } else {
            checks.checks.embedding_meta = {
              status: 'warning',
              message: 'No embedding configuration found'
            };
          }
        } catch (error) {
          checks.checks.embedding_meta = {
            status: 'warning',
            message: 'embedding_meta table not found (migration not run yet)'
          };
        }

        // 4. Test vector query performance
        const vectorTestStart = Date.now();
        const vectorTest = await embeddingDb.query(`
          SELECT COUNT(*) as count
          FROM email_patterns
          WHERE embedding IS NOT NULL
        `);
        const vectorTestLatency = Date.now() - vectorTestStart;

        checks.checks.vector_queries = {
          status: vectorTestLatency < 100 ? 'ok' : 'warning',
          latency_ms: vectorTestLatency,
          patterns_with_embeddings: vectorTest.rows[0].count
        };

        // 5. Get metrics from embeddingMetrics
        checks.metrics = rag.metrics.getMetrics();

        // Overall status
        const hasErrors = Object.values(checks.checks).some(c => c.status === 'error');
        const hasWarnings = Object.values(checks.checks).some(c => c.status === 'warning');

        if (hasErrors) {
          checks.status = 'error';
          res.status(500).json(checks);
        } else if (hasWarnings) {
          checks.status = 'warning';
          res.status(200).json(checks);
        } else {
          checks.status = 'ok';
          res.status(200).json(checks);
        }

      } catch (error) {
        checks.status = 'error';
        checks.error = error.message;
        console.error('[Health Check] Embedding health check failed:', error);
        res.status(500).json(checks);
      }
    });

    console.log('✅ Embedding health check endpoint registered at /health/embeddings');
    console.log('✅ ES module routes loaded successfully');
  } catch (error) {
    console.error('❌ Failed to load ES module routes:', error);
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);
    console.warn('⚠️  Application will continue without these routes');
  }
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Graceful startup
let server;

async function startServer() {
  try {
    console.log('🚀 Starting UPR server...');
    console.log(`📍 PORT from env: ${process.env.PORT}`);
    console.log(`📍 NODE_ENV: ${process.env.NODE_ENV}`);

    // Test DB connection (non-blocking)
    try {
      console.log('🔌 Testing database connection...');
      await Promise.race([
        db.query('SELECT NOW()'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 5000))
      ]);
      console.log('✅ Database connected');
    } catch (dbError) {
      console.warn('⚠️  Database connection issue:', dbError.message);
      console.log('⚠️  Starting server anyway (will retry on requests)');
    }

    // Load ES module routes FIRST
    console.log('📦 About to load ES module routes...');
    await loadESModuleRoutes();
    console.log('✅ ES module routes loaded');

    // Sentry test endpoint - throws error for testing
    app.get('/debug-sentry', (req, res) => {
      const Sentry = require('@sentry/node');
      const error = new Error('Sentry test error - monitoring is working! 🎉');
      Sentry.captureException(error);
      res.status(500).json({
        error: 'Sentry test error triggered',
        message: 'Check Sentry dashboard'
      });
    });

    // Global error handler
    app.use((err, req, res, next) => {
      // Capture error in Sentry
      const Sentry = require('@sentry/node');
      Sentry.captureException(err);

      console.error('Express error handler:', err);
      res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
      });
    });

    // CRITICAL: Register catch-all routes AFTER ES modules are loaded
    // Serve dashboard static files
    app.use(express.static(path.join(__dirname, 'dashboard/dist')));

    // Catch-all route for SPA (must be last!)
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(__dirname, 'dashboard/dist/index.html'));
    });

    // Start listening on 0.0.0.0 (required for Cloud Run)
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log('='.repeat(50));
      console.log(`✅ UPR Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(50));
    });

    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n📛 Received ${signal}, shutting down...`);
  if (server) {
    server.close(async () => {
      console.log('✅ Server closed');
      try {
        await db.end();
        console.log('✅ Database closed');
      } catch (err) {
        console.error('Error closing database:', err);
      }
      process.exit(0);
    });
    setTimeout(() => {
      console.error('⏰ Forced shutdown');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  shutdown('uncaughtException');
});

startServer();

module.exports = app;
