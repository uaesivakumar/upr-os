/**
 * Outreach Analytics Dashboard Service
 * Sprint 45 - Comprehensive analytics and insights for outreach system
 *
 * Capabilities:
 * - Real-time dashboard metrics
 * - Performance analytics
 * - Quality analytics
 * - A/B test analytics
 * - Trend analysis
 * - Executive summaries
 */

import pg from 'pg';
const { Pool } = pg;

export class OutreachAnalyticsService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
  }

  /**
   * Get comprehensive dashboard
   */
  async getDashboard(options = {}) {
    const { timeRange = 30 } = options;

    const [
      overview,
      qualityMetrics,
      performanceMetrics,
      abTestSummary,
      recentActivity,
      topPerformers,
      alerts
    ] = await Promise.all([
      this.getOverview(timeRange),
      this.getQualityMetrics(timeRange),
      this.getPerformanceMetrics(timeRange),
      this.getABTestSummary(),
      this.getRecentActivity(10),
      this.getTopPerformers(timeRange),
      this.getActiveAlerts()
    ]);

    return {
      overview,
      quality: qualityMetrics,
      performance: performanceMetrics,
      ab_testing: abTestSummary,
      recent_activity: recentActivity,
      top_performers: topPerformers,
      alerts,
      generated_at: new Date(),
      time_range_days: timeRange
    };
  }

  /**
   * Get overview metrics
   */
  async getOverview(days) {
    const query = `
      SELECT
        COUNT(*) as total_messages,
        COUNT(*) FILTER (WHERE scored_at >= NOW() - INTERVAL '24 hours') as messages_today,
        COUNT(*) FILTER (WHERE scored_at >= NOW() - INTERVAL '7 days') as messages_week,
        AVG(overall_quality) as avg_quality,
        AVG(personalization_score) as avg_personalization,
        COUNT(*) FILTER (WHERE quality_tier = 'EXCELLENT') as excellent_count,
        COUNT(*) FILTER (WHERE quality_tier = 'GOOD') as good_count,
        COUNT(*) FILTER (WHERE quality_tier = 'FAIR') as fair_count,
        COUNT(*) FILTER (WHERE quality_tier = 'POOR') as poor_count
      FROM outreach_quality_scores
      WHERE scored_at >= NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query);
    const data = result.rows[0];

    return {
      total_messages: parseInt(data.total_messages) || 0,
      messages_today: parseInt(data.messages_today) || 0,
      messages_week: parseInt(data.messages_week) || 0,
      avg_quality: parseFloat(data.avg_quality || 0).toFixed(2),
      avg_personalization: parseFloat(data.avg_personalization || 0).toFixed(2),
      tier_distribution: {
        excellent: parseInt(data.excellent_count) || 0,
        good: parseInt(data.good_count) || 0,
        fair: parseInt(data.fair_count) || 0,
        poor: parseInt(data.poor_count) || 0
      },
      excellent_percentage: data.total_messages > 0
        ? ((parseInt(data.excellent_count) / parseInt(data.total_messages)) * 100).toFixed(1)
        : '0.0'
    };
  }

  /**
   * Get quality metrics with trends
   */
  async getQualityMetrics(days) {
    const query = `
      SELECT
        DATE(scored_at) as date,
        AVG(overall_quality) as avg_quality,
        AVG(personalization_score) as avg_personalization,
        AVG(relevance_score) as avg_relevance,
        AVG(clarity_score) as avg_clarity,
        AVG(engagement_potential) as avg_engagement,
        COUNT(*) as count
      FROM outreach_quality_scores
      WHERE scored_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(scored_at)
      ORDER BY date DESC
    `;

    const result = await this.pool.query(query);

    // Calculate trends
    const trends = this.calculateQualityTrends(result.rows);

    return {
      daily_metrics: result.rows.map(row => ({
        date: row.date,
        avg_quality: parseFloat(row.avg_quality).toFixed(2),
        avg_personalization: parseFloat(row.avg_personalization).toFixed(2),
        avg_relevance: parseFloat(row.avg_relevance).toFixed(2),
        avg_clarity: parseFloat(row.avg_clarity).toFixed(2),
        avg_engagement: parseFloat(row.avg_engagement).toFixed(2),
        count: parseInt(row.count)
      })),
      trends
    };
  }

  /**
   * Calculate quality trends
   */
  calculateQualityTrends(dailyData) {
    if (dailyData.length < 7) {
      return { status: 'INSUFFICIENT_DATA' };
    }

    const recent = dailyData.slice(0, 7);
    const previous = dailyData.slice(7, 14);

    if (previous.length < 7) {
      return { status: 'INSUFFICIENT_DATA' };
    }

    const recentAvg = recent.reduce((sum, d) => sum + parseFloat(d.avg_quality), 0) / 7;
    const previousAvg = previous.reduce((sum, d) => sum + parseFloat(d.avg_quality), 0) / 7;

    const change = ((recentAvg - previousAvg) / previousAvg) * 100;

    return {
      direction: change > 2 ? 'IMPROVING' : change < -2 ? 'DECLINING' : 'STABLE',
      change_percentage: parseFloat(change.toFixed(2)),
      recent_avg: parseFloat(recentAvg.toFixed(2)),
      previous_avg: parseFloat(previousAvg.toFixed(2))
    };
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(days) {
    const query = `
      SELECT
        SUM(messages_generated) as total_generated,
        SUM(messages_sent) as total_sent,
        AVG(open_rate) as avg_open_rate,
        AVG(click_rate) as avg_click_rate,
        AVG(reply_rate) as avg_reply_rate,
        AVG(conversion_rate) as avg_conversion_rate,
        SUM(feedback_count) as total_feedback,
        AVG(avg_feedback_rating) as avg_rating,
        SUM(positive_feedback_count) as positive_feedback,
        SUM(negative_feedback_count) as negative_feedback
      FROM outreach_performance_metrics
      WHERE metric_date >= CURRENT_DATE - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query);
    const data = result.rows[0];

    return {
      total_generated: parseInt(data.total_generated) || 0,
      total_sent: parseInt(data.total_sent) || 0,
      avg_open_rate: parseFloat(data.avg_open_rate || 0).toFixed(2),
      avg_click_rate: parseFloat(data.avg_click_rate || 0).toFixed(2),
      avg_reply_rate: parseFloat(data.avg_reply_rate || 0).toFixed(2),
      avg_conversion_rate: parseFloat(data.avg_conversion_rate || 0).toFixed(2),
      feedback: {
        total: parseInt(data.total_feedback) || 0,
        avg_rating: parseFloat(data.avg_rating || 0).toFixed(2),
        positive: parseInt(data.positive_feedback) || 0,
        negative: parseInt(data.negative_feedback) || 0,
        satisfaction_rate: data.total_feedback > 0
          ? ((parseInt(data.positive_feedback) / parseInt(data.total_feedback)) * 100).toFixed(1)
          : '0.0'
      }
    };
  }

  /**
   * Get A/B test summary
   */
  async getABTestSummary() {
    const query = `
      SELECT
        COUNT(*) as total_tests,
        COUNT(*) FILTER (WHERE status = 'RUNNING') as running,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE status = 'PAUSED') as paused,
        COUNT(*) FILTER (WHERE winner IS NOT NULL) as with_winner
      FROM outreach_ab_tests
    `;

    const result = await this.pool.query(query);
    const data = result.rows[0];

    // Get recent tests
    const recentTests = await this.pool.query(`
      SELECT test_name, status, winner, confidence_level
      FROM outreach_ab_tests
      ORDER BY created_at DESC
      LIMIT 5
    `);

    return {
      total: parseInt(data.total_tests) || 0,
      running: parseInt(data.running) || 0,
      completed: parseInt(data.completed) || 0,
      paused: parseInt(data.paused) || 0,
      with_winner: parseInt(data.with_winner) || 0,
      recent_tests: recentTests.rows
    };
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(limit = 10) {
    const activities = [];

    // Recent quality scores
    const qualityResult = await this.pool.query(`
      SELECT scored_at, overall_quality, quality_tier
      FROM outreach_quality_scores
      ORDER BY scored_at DESC
      LIMIT $1
    `, [limit]);

    qualityResult.rows.forEach(row => {
      activities.push({
        type: 'QUALITY_SCORE',
        timestamp: row.scored_at,
        data: {
          quality: row.overall_quality,
          tier: row.quality_tier
        }
      });
    });

    // Recent optimizations
    const optResult = await this.pool.query(`
      SELECT created_at, recommendation_title, priority, status
      FROM outreach_template_optimizations
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    optResult.rows.forEach(row => {
      activities.push({
        type: 'OPTIMIZATION',
        timestamp: row.created_at,
        data: {
          title: row.recommendation_title,
          priority: row.priority,
          status: row.status
        }
      });
    });

    // Sort by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return activities.slice(0, limit);
  }

  /**
   * Get top performers
   */
  async getTopPerformers(days) {
    // Top quality messages
    const topQuality = await this.pool.query(`
      SELECT message_id, overall_quality, quality_tier
      FROM outreach_quality_scores
      WHERE scored_at >= NOW() - INTERVAL '${days} days'
      ORDER BY overall_quality DESC
      LIMIT 5
    `);

    return {
      top_quality: topQuality.rows.map(row => ({
        message_id: row.message_id,
        quality: row.overall_quality,
        tier: row.quality_tier
      }))
    };
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts() {
    // Check for quality alerts
    const alerts = [];

    // Low quality alert
    const qualityCheck = await this.pool.query(`
      SELECT AVG(overall_quality) as avg_quality
      FROM outreach_quality_scores
      WHERE scored_at >= NOW() - INTERVAL '24 hours'
    `);

    const avgQuality = parseFloat(qualityCheck.rows[0]?.avg_quality || 100);

    if (avgQuality < 60) {
      alerts.push({
        type: 'LOW_QUALITY',
        severity: 'HIGH',
        message: `Average quality dropped to ${avgQuality.toFixed(2)}`,
        action_needed: 'Review recent messages'
      });
    }

    // Pending optimizations
    const pendingOpt = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM outreach_template_optimizations
      WHERE status = 'PENDING' AND priority = 'HIGH'
    `);

    const pendingCount = parseInt(pendingOpt.rows[0].count);

    if (pendingCount > 0) {
      alerts.push({
        type: 'PENDING_OPTIMIZATIONS',
        severity: 'MEDIUM',
        message: `${pendingCount} high-priority optimizations pending`,
        action_needed: 'Review and implement optimizations'
      });
    }

    return alerts;
  }

  /**
   * Generate executive summary
   */
  async getExecutiveSummary(days = 30) {
    const [overview, quality, performance, optimizations] = await Promise.all([
      this.getOverview(days),
      this.getQualityMetrics(days),
      this.getPerformanceMetrics(days),
      this.getOptimizationSummary(days)
    ]);

    const summary = {
      period: `Last ${days} days`,
      generated_at: new Date(),

      key_metrics: {
        total_messages: overview.total_messages,
        avg_quality: overview.avg_quality,
        excellent_rate: `${overview.excellent_percentage}%`,
        avg_reply_rate: performance.avg_reply_rate,
        satisfaction_rate: performance.feedback.satisfaction_rate
      },

      highlights: [],

      concerns: [],

      recommendations: optimizations.top_recommendations
    };

    // Add highlights
    if (parseFloat(overview.avg_quality) >= 75) {
      summary.highlights.push('Quality scores above target (75+)');
    }

    if (parseFloat(overview.excellent_percentage) >= 30) {
      summary.highlights.push(`${overview.excellent_percentage}% of messages rated EXCELLENT`);
    }

    // Add concerns
    if (parseFloat(overview.avg_quality) < 70) {
      summary.concerns.push('Quality scores below target');
    }

    if (quality.trends.direction === 'DECLINING') {
      summary.concerns.push(`Quality trending down (${quality.trends.change_percentage}%)`);
    }

    return summary;
  }

  /**
   * Get optimization summary
   */
  async getOptimizationSummary(days) {
    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'IMPLEMENTED') as implemented,
        COUNT(*) FILTER (WHERE priority = 'HIGH') as high_priority
      FROM outreach_template_optimizations
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query);
    const data = result.rows[0];

    // Get top recommendations
    const topRecs = await this.pool.query(`
      SELECT recommendation_title, priority, expected_improvement
      FROM outreach_template_optimizations
      WHERE status = 'PENDING' AND priority = 'HIGH'
      ORDER BY created_at DESC
      LIMIT 3
    `);

    return {
      total: parseInt(data.total) || 0,
      implemented: parseInt(data.implemented) || 0,
      high_priority: parseInt(data.high_priority) || 0,
      implementation_rate: data.total > 0
        ? ((parseInt(data.implemented) / parseInt(data.total)) * 100).toFixed(1)
        : '0.0',
      top_recommendations: topRecs.rows
    };
  }

  /**
   * Get analytics summary for period
   */
  async calculateAnalyticsSummary(options = {}) {
    const {
      period_type = 'DAILY',
      period_start,
      period_end,
      segment_type = 'ALL',
      segment_value = null
    } = options;

    const startDate = period_start instanceof Date ? period_start : new Date(period_start);
    const endDate = period_end instanceof Date ? period_end : new Date(period_end);

    // Get quality data
    const qualityData = await this.pool.query(`
      SELECT
        COUNT(*) as total_generated,
        AVG(overall_quality) as avg_quality_score,
        COUNT(*) FILTER (WHERE quality_tier = 'EXCELLENT') as excellent_count,
        COUNT(*) FILTER (WHERE quality_tier = 'GOOD') as good_count,
        COUNT(*) FILTER (WHERE quality_tier = 'FAIR') as fair_count,
        COUNT(*) FILTER (WHERE quality_tier = 'POOR') as poor_count
      FROM outreach_quality_scores
      WHERE scored_at >= $1 AND scored_at <= $2
    `, [startDate, endDate]);

    const quality = qualityData.rows[0];

    // Store in analytics summary table
    const query = `
      INSERT INTO outreach_analytics_summary (
        period_type,
        period_start,
        period_end,
        segment_type,
        segment_value,
        total_generated,
        avg_quality_score,
        excellent_count,
        good_count,
        fair_count,
        poor_count,
        trend_direction,
        trend_percentage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (period_type, period_start, segment_type, COALESCE(segment_value, ''))
      DO UPDATE SET
        total_generated = EXCLUDED.total_generated,
        avg_quality_score = EXCLUDED.avg_quality_score,
        calculated_at = NOW()
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      period_type,
      startDate,
      endDate,
      segment_type,
      segment_value,
      parseInt(quality.total_generated) || 0,
      parseFloat(quality.avg_quality_score || 0).toFixed(2),
      parseInt(quality.excellent_count) || 0,
      parseInt(quality.good_count) || 0,
      parseInt(quality.fair_count) || 0,
      parseInt(quality.poor_count) || 0,
      'STABLE',
      0.0
    ]);

    return result.rows[0];
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default OutreachAnalyticsService;
