/**
 * Prompt Analytics API
 * Sprint 32 - Task 8
 *
 * Provides analytics endpoints for prompt usage, performance, and A/B testing
 */

const express = require('express');
const { PromptABTestingService } = require('../services/promptABTestingService');
const pool = require('../db');

const router = express.Router();
const abTestService = new PromptABTestingService(pool);

// ═══════════════════════════════════════════════════════════
// USAGE ANALYTICS
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/prompt-analytics/usage
 * Get prompt usage statistics
 */
router.get('/usage', async (req, res) => {
  try {
    const { time_range = '7d', prompt_name } = req.query;

    const timeRangeMap = {
      '1d': '1 day',
      '7d': '7 days',
      '30d': '30 days',
      '90d': '90 days'
    };

    const interval = timeRangeMap[time_range] || '7 days';

    let query = `
      SELECT
        prompt_name,
        COUNT(*) as total_executions,
        COUNT(DISTINCT DATE(created_at)) as days_active,
        COUNT(*) FILTER (WHERE success = true) as successful,
        COUNT(*) FILTER (WHERE success = false) as failed,
        ROUND(AVG(execution_time_ms)::numeric, 2) as avg_execution_time,
        MIN(created_at) as first_execution,
        MAX(created_at) as last_execution
      FROM prompt_executions
      WHERE created_at >= NOW() - INTERVAL '${interval}'
    `;

    const params = [];
    if (prompt_name) {
      query += ` AND prompt_name = $1`;
      params.push(prompt_name);
    }

    query += ` GROUP BY prompt_name ORDER BY total_executions DESC`;

    const result = await pool.query(query, params);

    res.json({
      time_range,
      interval,
      prompts: result.rows
    });

  } catch (error) {
    console.error('Error fetching usage analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// PERFORMANCE METRICS
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/prompt-analytics/performance/:prompt_name
 * Get detailed performance metrics for a specific prompt
 */
router.get('/performance/:prompt_name', async (req, res) => {
  try {
    const { prompt_name } = req.params;

    const metrics = await abTestService.getPromptPerformance(prompt_name);

    if (metrics.length === 0) {
      return res.status(404).json({ error: 'No performance data found' });
    }

    res.json({
      prompt_name,
      versions: metrics,
      best_version: metrics.sort((a, b) =>
        parseFloat(b.response_rate) - parseFloat(a.response_rate)
      )[0]
    });

  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// CONVERSION TRACKING
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/prompt-analytics/conversions
 * Get conversion funnel metrics
 */
router.get('/conversions', async (req, res) => {
  try {
    const { prompt_name, time_range = '30d' } = req.query;

    const timeRangeMap = {
      '7d': '7 days',
      '30d': '30 days',
      '90d': '90 days'
    };

    const interval = timeRangeMap[time_range] || '30 days';

    let query = `
      SELECT
        prompt_name,
        prompt_version,
        COUNT(*) as total_generated,
        COUNT(*) FILTER (WHERE message_sent = true) as sent,
        COUNT(*) FILTER (WHERE message_opened = true) as opened,
        COUNT(*) FILTER (WHERE message_responded = true) as responded,

        -- Conversion rates
        ROUND((COUNT(*) FILTER (WHERE message_sent = true)::numeric / NULLIF(COUNT(*), 0) * 100), 2) as send_rate,
        ROUND((COUNT(*) FILTER (WHERE message_opened = true)::numeric / NULLIF(COUNT(*) FILTER (WHERE message_sent = true), 0) * 100), 2) as open_rate,
        ROUND((COUNT(*) FILTER (WHERE message_responded = true)::numeric / NULLIF(COUNT(*) FILTER (WHERE message_sent = true), 0) * 100), 2) as response_rate

      FROM prompt_executions
      WHERE created_at >= NOW() - INTERVAL '${interval}'
    `;

    const params = [];
    if (prompt_name) {
      query += ` AND prompt_name = $1`;
      params.push(prompt_name);
    }

    query += `
      GROUP BY prompt_name, prompt_version
      ORDER BY response_rate DESC NULLS LAST
    `;

    const result = await pool.query(query, params);

    res.json({
      time_range,
      conversions: result.rows
    });

  } catch (error) {
    console.error('Error fetching conversion metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// A/B TEST DASHBOARD
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/prompt-analytics/ab-tests
 * Get A/B test dashboard summary
 */
router.get('/ab-tests', async (req, res) => {
  try {
    const { status } = req.query;

    const dashboard = await abTestService.getDashboard();

    let filtered = dashboard;
    if (status) {
      filtered = dashboard.filter(test => test.status === status);
    }

    res.json({
      total_tests: filtered.length,
      tests: filtered
    });

  } catch (error) {
    console.error('Error fetching A/B test dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/prompt-analytics/ab-tests/:prompt_name
 * Get detailed A/B test results for a specific prompt
 */
router.get('/ab-tests/:prompt_name', async (req, res) => {
  try {
    const { prompt_name } = req.params;

    const test = await abTestService.getABTest(prompt_name);
    if (!test) {
      return res.status(404).json({ error: 'A/B test not found' });
    }

    const metrics = await abTestService.getPromptPerformance(prompt_name);
    const winnerAnalysis = await abTestService.determineWinner(prompt_name);

    res.json({
      test,
      metrics,
      winner_analysis: winnerAnalysis
    });

  } catch (error) {
    console.error('Error fetching A/B test details:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// QUALITY TRENDS
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/prompt-analytics/quality-trends
 * Get quality score trends over time
 */
router.get('/quality-trends', async (req, res) => {
  try {
    const { prompt_name, group_by = 'day' } = req.query;

    const groupByMap = {
      'hour': 'hour',
      'day': 'day',
      'week': 'week',
      'month': 'month'
    };

    const groupByPeriod = groupByMap[group_by] || 'day';

    let query = `
      SELECT
        prompt_name,
        DATE_TRUNC('${groupByPeriod}', created_at) as period,
        COUNT(*) as executions,
        ROUND(AVG(output_quality_score)::numeric, 2) as avg_quality_score,
        ROUND(AVG(execution_time_ms)::numeric, 2) as avg_execution_time,
        COUNT(*) FILTER (WHERE success = true) as successful
      FROM prompt_executions
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND output_quality_score IS NOT NULL
    `;

    const params = [];
    if (prompt_name) {
      query += ` AND prompt_name = $1`;
      params.push(prompt_name);
    }

    query += `
      GROUP BY prompt_name, period
      ORDER BY period DESC
    `;

    const result = await pool.query(query, params);

    res.json({
      group_by: groupByPeriod,
      trends: result.rows
    });

  } catch (error) {
    console.error('Error fetching quality trends:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// SUMMARY DASHBOARD
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/prompt-analytics/dashboard
 * Get overall analytics dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Overall stats (last 30 days)
    const overallStats = await pool.query(`
      SELECT
        COUNT(DISTINCT prompt_name) as total_prompts,
        COUNT(*) as total_executions,
        COUNT(*) FILTER (WHERE success = true) as successful_executions,
        ROUND(AVG(execution_time_ms)::numeric, 2) as avg_execution_time,
        ROUND(AVG(output_quality_score)::numeric, 2) as avg_quality_score
      FROM prompt_executions
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);

    // Top performing prompts
    const topPrompts = await pool.query(`
      SELECT
        prompt_name,
        COUNT(*) as executions,
        ROUND(AVG(output_quality_score)::numeric, 2) as avg_quality,
        COUNT(*) FILTER (WHERE message_responded = true)::numeric /
          NULLIF(COUNT(*) FILTER (WHERE message_sent = true), 0) * 100 as response_rate
      FROM prompt_executions
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY prompt_name
      ORDER BY response_rate DESC NULLS LAST
      LIMIT 5
    `);

    // Active A/B tests
    const activeTests = await abTestService.listABTests({ test_enabled: true });

    res.json({
      period: 'Last 30 days',
      overall_stats: overallStats.rows[0],
      top_prompts: topPrompts.rows,
      active_ab_tests: activeTests.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
