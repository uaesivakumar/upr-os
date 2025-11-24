// routes/radar.js
// API routes for RADAR discovery module
import express from "express";
import { pool } from "../utils/db.js";
import { ok, bad } from "../utils/respond.js";
import authAny from "../server/middleware/authAny.js";
import RadarService from "../server/services/radar.js";

const router = express.Router();

/**
 * GET /api/radar/health
 * Health check for RADAR module (no auth required)
 */
router.get("/health", async (req, res) => {
  try {
    const tenantId = process.env.TENANT_ID;
    const radarEnabled = process.env.RADAR_ENABLED !== 'false';
    const serpApiConfigured = !!process.env.SERPAPI_KEY;
    const openaiConfigured = !!process.env.OPENAI_API_KEY;

    // Quick DB check
    const sourcesCount = await pool.query('SELECT COUNT(*) FROM discovery_sources');

    return ok(res, {
      status: 'healthy',
      radar_enabled: radarEnabled,
      tenant_configured: !!tenantId,
      serpapi_configured: serpApiConfigured,
      openai_configured: openaiConfigured,
      sources_available: parseInt(sourcesCount.rows[0].count),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("[Radar] Health check failed:", err);
    return bad(res, "Health check failed.", 500);
  }
});

/**
 * POST /api/radar/run
 * Scheduled RADAR run endpoint (no auth required - called by Cloud Scheduler)
 * Accepts: source, budgetLimitUsd, notify
 */
router.post("/run", async (req, res) => {
  try {
    const tenantId = process.env.TENANT_ID;
    const { source = 'scheduled', budgetLimitUsd = 5, notify = true } = req.body;

    console.log(`🤖 Scheduled RADAR scan triggered`);
    console.log('[Radar] POST /run - Debug:', {
      source,
      budgetLimitUsd,
      notify,
      tenantId
    });

    // Create run record
    const run = await RadarService.createRun({
      tenantId,
      trigger: source,
      promptVersion: 'v1.1-uae-heuristic',
      budgetLimitUsd
    });

    console.log('[Radar] Scheduled run record created:', run.run_id);

    // Track run start in Sentry
    if (process.env.SENTRY_DSN) {
      const Sentry = await import('@sentry/node');
      Sentry.captureMessage(`Scheduled RADAR run started: ${run.run_id}`, {
        level: 'info',
        tags: {
          tool: 'radar',
          phase: 'scheduled-run',
          run_id: run.run_id
        }
      });
    }

    // Import and start job function in background
    const { runRadarScan } = await import('../jobs/radarJob.js');

    // Run scan in background
    runRadarScan(source, tenantId, {
      runId: run.run_id,
      promptVersion: 'v1.1-uae-heuristic',
      budgetLimitUsd
    })
      .then(async (result) => {
        console.log('✅ Scheduled radar scan completed:', result);

        // Send email notification if requested
        if (notify && result.discovered_count > 0) {
          try {
            const { sendEmail } = await import('../utils/email.js');
            const summary = await RadarService.getRunSummary(run.run_id);

            await sendEmail({
              to: process.env.ADMIN_EMAIL || 'admin@example.com',
              subject: `🎯 RADAR Daily Digest: ${result.discovered_count} new signals`,
              html: `
                <h2>RADAR Daily Discovery Report</h2>
                <p><strong>Run ID:</strong> ${run.run_id}</p>
                <p><strong>Discovered:</strong> ${result.discovered_count} new signals</p>
                <p><strong>Budget Used:</strong> $${summary.budget_used || 0}</p>
                <p><strong>Sources Scanned:</strong> ${summary.sources_scanned || 0}</p>
                <h3>Top Signals:</h3>
                <ul>
                  ${result.top_signals?.map(s => `<li>${s.company_name} - ${s.signal_type}</li>`).join('') || '<li>No signals</li>'}
                </ul>
                <p><a href="${process.env.APP_URL}/radar/runs/${run.run_id}">View Full Report</a></p>
              `
            });
            console.log('📧 Email notification sent');
          } catch (emailError) {
            console.error('❌ Failed to send email notification:', emailError);
          }
        }
      })
      .catch(async (error) => {
        console.error('❌ Scheduled radar scan failed:', error);

        // Report error to Sentry
        if (process.env.SENTRY_DSN) {
          const Sentry = await import('@sentry/node');
          Sentry.captureException(error, {
            tags: {
              tool: 'radar',
              phase: 'scheduled-run-error',
              run_id: run.run_id
            },
            extra: {
              budgetLimitUsd,
              source
            }
          });
        }
      });

    // Return immediately
    return ok(res, {
      run_id: run.run_id,
      status: 'queued',
      message: 'Scheduled radar scan started',
      budget_limit: budgetLimitUsd
    });

  } catch (err) {
    console.error("[Radar] Error starting scheduled run:", err);

    // Report error to Sentry
    if (process.env.SENTRY_DSN) {
      const Sentry = await import('@sentry/node');
      Sentry.captureException(err, {
        tags: {
          tool: 'radar',
          phase: 'scheduled-run-init-error'
        }
      });
    }

    return bad(res, "Failed to start scheduled run.", 500);
  }
});

// All routes below require authentication
router.use(authAny);

/**
 * GET /api/radar/runs
 * Get recent discovery runs for the tenant
 */
router.get("/runs", async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || process.env.TENANT_ID;
    const limit = parseInt(req.query.limit) || 20;

    console.log('[Radar] GET /runs - Debug:', {
      userExists: !!req.user,
      userTenantId: req.user?.tenant_id,
      envTenantId: process.env.TENANT_ID,
      finalTenantId: tenantId,
      limit
    });

    const runs = await RadarService.getRecentRuns(tenantId, limit);

    console.log('[Radar] GET /runs - Query result:', {
      runsCount: runs.length,
      firstRunId: runs[0]?.run_id
    });

    return ok(res, { runs });
  } catch (err) {
    console.error("[Radar] Error fetching runs:", err);
    return bad(res, "Failed to fetch runs.", 500);
  }
});

/**
 * GET /api/radar/runs/:runId
 * Get specific run details with summary
 */
router.get("/runs/:runId", async (req, res) => {
  try {
    const { runId } = req.params;

    const run = await RadarService.getRun(runId);

    if (!run) {
      return bad(res, "Run not found.", 404);
    }

    const summary = await RadarService.getRunSummary(runId);

    return ok(res, { run, summary });
  } catch (err) {
    console.error("[Radar] Error fetching run:", err);
    return bad(res, "Failed to fetch run.", 500);
  }
});

/**
 * POST /api/radar/runs
 * Trigger a new manual discovery run (async)
 */
router.post("/runs", async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || process.env.TENANT_ID;
    const { promptVersion, budgetLimitUsd } = req.body;

    console.log('[Radar] POST /runs - Debug:', {
      userExists: !!req.user,
      userTenantId: req.user?.tenant_id,
      envTenantId: process.env.TENANT_ID,
      finalTenantId: tenantId
    });

    console.log(`🎯 Manual RADAR scan triggered by user ${req.user?.username || 'unknown'}`);

    // Create run record immediately so we can return run_id
    const run = await RadarService.createRun({
      tenantId,
      trigger: 'manual',
      promptVersion: promptVersion || 'v1.1-uae-heuristic',
      budgetLimitUsd: budgetLimitUsd || 2.00
    });

    console.log('[Radar] Run record created:', run.run_id);

    // Import and start job function in background
    const { runRadarScan } = await import('../jobs/radarJob.js');

    // Run scan in background (pass existing run_id)
    runRadarScan('manual', tenantId, {
      runId: run.run_id,  // Pass existing run_id
      promptVersion: promptVersion || 'v1.1-uae-heuristic',
      budgetLimitUsd: budgetLimitUsd || 2.00
    })
      .then(result => {
        console.log('✅ Radar scan completed:', result);
      })
      .catch(error => {
        console.error('❌ Radar scan failed:', error);
      });

    // Return run_id immediately
    return ok(res, {
      run_id: run.run_id,
      status: 'queued',
      message: 'Radar scan started'
    });

  } catch (err) {
    console.error("[Radar] Error starting run:", err);
    return bad(res, "Failed to start run.", 500);
  }
});

/**
 * GET /api/radar/sources
 * Get all discovery sources
 */
router.get("/sources", async (req, res) => {
  try {
    const sources = await RadarService.getSources();

    return ok(res, { sources });
  } catch (err) {
    console.error("[Radar] Error fetching sources:", err);
    return bad(res, "Failed to fetch sources.", 500);
  }
});

/**
 * GET /api/radar/sources/performance
 * Get source performance metrics
 */
router.get("/sources/performance", async (req, res) => {
  try {
    const { sourceId } = req.query;

    const performance = await RadarService.getSourcePerformance(sourceId || null);

    return ok(res, { performance });
  } catch (err) {
    console.error("[Radar] Error fetching source performance:", err);
    return bad(res, "Failed to fetch source performance.", 500);
  }
});

/**
 * GET /api/radar/stats
 * Get tenant statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || process.env.TENANT_ID;

    const stats = await RadarService.getTenantStats(tenantId);

    return ok(res, { stats });
  } catch (err) {
    console.error("[Radar] Error fetching stats:", err);
    return bad(res, "Failed to fetch stats.", 500);
  }
});

/**
 * GET /api/radar/stats/daily
 * Get daily stats for last N days
 */
router.get("/stats/daily", async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id || process.env.TENANT_ID;
    const days = parseInt(req.query.days) || 30;

    const dailyStats = await RadarService.getDailyStats(tenantId, days);

    return ok(res, { dailyStats });
  } catch (err) {
    console.error("[Radar] Error fetching daily stats:", err);
    return bad(res, "Failed to fetch daily stats.", 500);
  }
});

/**
 * GET /api/radar/dead-letters
 * Get dead letter queue entries
 */
router.get("/dead-letters", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const deadLetters = await RadarService.getDeadLetters(limit);

    return ok(res, { deadLetters });
  } catch (err) {
    console.error("[Radar] Error fetching dead letters:", err);
    return bad(res, "Failed to fetch dead letters.", 500);
  }
});

/**
 * PATCH /api/radar/dead-letters/:id/resolve
 * Resolve a dead letter entry
 */
router.patch("/dead-letters/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    await RadarService.resolveDeadLetter(id, {
      resolvedBy: req.user?.username || 'unknown',
      notes: notes || 'Resolved manually'
    });

    return ok(res, { message: "Dead letter resolved successfully" });
  } catch (err) {
    console.error("[Radar] Error resolving dead letter:", err);
    return bad(res, "Failed to resolve dead letter.", 500);
  }
});

export default router;
