/**
 * Monitoring Routes - Sprint 28
 *
 * Handles automated monitoring endpoints for:
 * - Rule performance checks (Cloud Scheduler triggered)
 * - A/B test analysis
 * - Shadow mode validation
 */

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * POST /api/monitoring/check-rule-performance
 *
 * Triggered by Cloud Scheduler every 6 hours
 * Runs automated rule performance monitoring script
 */
router.post('/check-rule-performance', async (req, res) => {
  console.log('📊 [Monitoring] Rule performance check triggered');
  console.log('Source:', req.body?.source || 'unknown');
  console.log('Scheduled at:', req.body?.scheduled_at || new Date().toISOString());

  try {
    // Run the monitoring script
    const { stdout, stderr } = await execAsync('node scripts/monitoring/checkRulePerformance.js', {
      cwd: '/app',
      timeout: 600000,  // 10 minutes
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
        SENTRY_DSN: process.env.SENTRY_DSN,
        SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL
      }
    });

    console.log('✅ [Monitoring] Rule performance check completed');

    // Parse output for summary
    const hasAlerts = stdout.includes('⚠️') || stdout.includes('❌');
    const criticalCount = (stdout.match(/🔴 Critical Alerts:/g) || []).length;
    const warningCount = (stdout.match(/🟡 Warning Alerts:/g) || []).length;

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        alerts_triggered: hasAlerts,
        critical_count: criticalCount,
        warning_count: warningCount
      },
      output: stdout,
      errors: stderr || null
    });

  } catch (error) {
    console.error('❌ [Monitoring] Rule performance check failed:', error.message);

    // Send partial results if available
    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      output: error.stdout || null,
      errors: error.stderr || null
    });
  }
});

/**
 * POST /api/monitoring/analyze-ab-test
 *
 * Triggered manually or by Cloud Scheduler
 * Runs A/B test analysis script
 */
router.post('/analyze-ab-test', async (req, res) => {
  console.log('🧪 [Monitoring] A/B test analysis triggered');
  console.log('Tool:', req.body?.tool || 'ALL');

  try {
    const toolFilter = req.body?.tool ? `--tool=${req.body.tool}` : '';
    const { stdout, stderr } = await execAsync(`node scripts/monitoring/analyzeABTest.js ${toolFilter}`, {
      cwd: '/app',
      timeout: 300000,  // 5 minutes
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL,
        SENTRY_DSN: process.env.SENTRY_DSN
      }
    });

    console.log('✅ [Monitoring] A/B test analysis completed');

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      output: stdout,
      errors: stderr || null
    });

  } catch (error) {
    console.error('❌ [Monitoring] A/B test analysis failed:', error.message);

    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      output: error.stdout || null,
      errors: error.stderr || null
    });
  }
});

/**
 * GET /api/monitoring/health
 *
 * Health check endpoint for monitoring
 */
router.get('/health', async (req, res) => {
  const db = require('../utils/db');

  try {
    // Check database connectivity
    await db.query('SELECT 1');

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * GET /api/monitoring/scoring-adjustments
 *
 * Get current scoring adjustments for all tools
 * Query params: ?tool=CompanyQualityTool&version=v2.0
 */
router.get('/scoring-adjustments', async (req, res) => {
  console.log('📊 [Monitoring] Scoring adjustments requested');

  const { tool, version } = req.query;

  try {
    const scoringAdjustments = require('../server/agent-core/scoring-adjustments.js');

    if (tool && version) {
      // Get specific tool adjustment
      const adjustment = await scoringAdjustments.getAdjustment(tool, version);
      const history = await scoringAdjustments.getAdjustmentHistory(tool, version, 30);

      res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        tool: tool,
        version: version,
        current_adjustment: adjustment,
        history: history
      });
    } else {
      // Get all tools adjustments
      const tools = [
        { name: 'CompanyQualityTool', version: 'v2.0' },
        { name: 'ContactTierTool', version: 'v2.0' },
        { name: 'TimingScoreTool', version: 'v2.0' },
        { name: 'BankingProductMatchTool', version: 'v1.0' }
      ];

      const adjustments = [];
      for (const t of tools) {
        const adjustment = await scoringAdjustments.getAdjustment(t.name, t.version);
        adjustments.push({
          tool: t.name,
          version: t.version,
          adjustment: adjustment
        });
      }

      res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        adjustments: adjustments,
        cache_stats: scoringAdjustments.getCacheStats()
      });
    }

  } catch (error) {
    console.error('❌ [Monitoring] Scoring adjustments error:', error.message);

    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * POST /api/monitoring/clear-adjustment-cache
 *
 * Clear scoring adjustments cache (force recalculation)
 */
router.post('/clear-adjustment-cache', async (req, res) => {
  console.log('🗑️ [Monitoring] Clearing adjustment cache');

  try {
    const scoringAdjustments = require('../server/agent-core/scoring-adjustments.js');

    const statsBefore = scoringAdjustments.getCacheStats();
    scoringAdjustments.clearCache();
    const statsAfter = scoringAdjustments.getCacheStats();

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'Adjustment cache cleared',
      cache_before: statsBefore,
      cache_after: statsAfter
    });

  } catch (error) {
    console.error('❌ [Monitoring] Clear cache error:', error.message);

    res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

module.exports = router;
