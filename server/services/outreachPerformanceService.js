/**
 * Outreach Performance Tracking Service
 * Sprint 45 - Comprehensive performance metrics and monitoring
 *
 * Capabilities:
 * - Track real-time performance metrics
 * - Generate performance reports
 * - Monitor trends and anomalies
 * - Calculate aggregated metrics
 * - Performance alerts
 */

import pg from 'pg';
const { Pool } = pg;

export class OutreachPerformanceService {
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
   * Calculate and store performance metrics
   */
  async calculateMetrics(options = {}) {
    const {
      date = new Date(),
      hour = null,
      aggregation_level = 'SYSTEM',
      aggregation_key = null
    } = options;

    const metricDate = typeof date === 'string' ? new Date(date) : date;
    const dateStr = metricDate.toISOString().split('T')[0];

    // Get quality scores for the period
    const qualityMetrics = await this.getQualityMetrics(dateStr, hour, aggregation_level, aggregation_key);

    // Get engagement metrics (from outreach_generations if available)
    const engagementMetrics = await this.getEngagementMetrics(dateStr, hour);

    // Get feedback metrics
    const feedbackMetrics = await this.getFeedbackMetrics(dateStr, hour);

    // Calculate rates
    const rates = this.calculateRates(qualityMetrics, engagementMetrics);

    // Store metrics
    const query = `
      INSERT INTO outreach_performance_metrics (
        metric_date,
        metric_hour,
        aggregation_level,
        aggregation_key,
        messages_generated,
        messages_sent,
        messages_delivered,
        messages_bounced,
        messages_opened,
        messages_clicked,
        messages_replied,
        messages_converted,
        delivery_rate,
        open_rate,
        click_rate,
        reply_rate,
        conversion_rate,
        avg_quality_score,
        avg_personalization_score,
        avg_relevance_score,
        avg_time_to_open,
        avg_time_to_reply,
        avg_time_to_conversion,
        feedback_count,
        avg_feedback_rating,
        positive_feedback_count,
        negative_feedback_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
      )
      ON CONFLICT (metric_date, COALESCE(metric_hour, -1), aggregation_level, COALESCE(aggregation_key, ''))
      DO UPDATE SET
        messages_generated = EXCLUDED.messages_generated,
        messages_sent = EXCLUDED.messages_sent,
        avg_quality_score = EXCLUDED.avg_quality_score,
        calculated_at = NOW()
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      dateStr,
      hour,
      aggregation_level,
      aggregation_key,
      qualityMetrics.messages_generated,
      engagementMetrics.messages_sent || 0,
      engagementMetrics.messages_delivered || 0,
      engagementMetrics.messages_bounced || 0,
      engagementMetrics.messages_opened || 0,
      engagementMetrics.messages_clicked || 0,
      engagementMetrics.messages_replied || 0,
      engagementMetrics.messages_converted || 0,
      rates.delivery_rate,
      rates.open_rate,
      rates.click_rate,
      rates.reply_rate,
      rates.conversion_rate,
      qualityMetrics.avg_quality_score,
      qualityMetrics.avg_personalization_score,
      qualityMetrics.avg_relevance_score,
      engagementMetrics.avg_time_to_open || 0,
      engagementMetrics.avg_time_to_reply || 0,
      engagementMetrics.avg_time_to_conversion || 0,
      feedbackMetrics.feedback_count,
      feedbackMetrics.avg_feedback_rating,
      feedbackMetrics.positive_feedback_count,
      feedbackMetrics.negative_feedback_count
    ]);

    return result.rows[0];
  }

  /**
   * Get quality metrics for a period
   */
  async getQualityMetrics(date, hour, level, key) {
    let query = `
      SELECT
        COUNT(*) as messages_generated,
        AVG(overall_quality) as avg_quality_score,
        AVG(personalization_score) as avg_personalization_score,
        AVG(relevance_score) as avg_relevance_score
      FROM outreach_quality_scores
      WHERE DATE(scored_at) = $1
    `;

    const params = [date];

    if (hour !== null) {
      query += ` AND EXTRACT(HOUR FROM scored_at) = $${params.length + 1}`;
      params.push(hour);
    }

    const result = await this.pool.query(query, params);
    const data = result.rows[0];

    return {
      messages_generated: parseInt(data.messages_generated) || 0,
      avg_quality_score: parseFloat(data.avg_quality_score || 0).toFixed(2),
      avg_personalization_score: parseFloat(data.avg_personalization_score || 0).toFixed(2),
      avg_relevance_score: parseFloat(data.avg_relevance_score || 0).toFixed(2)
    };
  }

  /**
   * Get engagement metrics (simplified - would integrate with real tracking)
   */
  async getEngagementMetrics(date, hour) {
    // This would integrate with actual email/message tracking
    // For now, return mock data structure
    return {
      messages_sent: 0,
      messages_delivered: 0,
      messages_bounced: 0,
      messages_opened: 0,
      messages_clicked: 0,
      messages_replied: 0,
      messages_converted: 0,
      avg_time_to_open: 0,
      avg_time_to_reply: 0,
      avg_time_to_conversion: 0
    };
  }

  /**
   * Get feedback metrics for a period
   */
  async getFeedbackMetrics(date, hour) {
    let query = `
      SELECT
        COUNT(*) as feedback_count,
        AVG(overall_rating) as avg_feedback_rating,
        COUNT(*) FILTER (WHERE overall_rating >= 4) as positive_feedback_count,
        COUNT(*) FILTER (WHERE overall_rating <= 2) as negative_feedback_count
      FROM outreach_feedback
      WHERE DATE(created_at) = $1
    `;

    const params = [date];

    if (hour !== null) {
      query += ` AND EXTRACT(HOUR FROM created_at) = $${params.length + 1}`;
      params.push(hour);
    }

    const result = await this.pool.query(query, params);
    const data = result.rows[0];

    return {
      feedback_count: parseInt(data.feedback_count) || 0,
      avg_feedback_rating: parseFloat(data.avg_feedback_rating || 0).toFixed(2),
      positive_feedback_count: parseInt(data.positive_feedback_count) || 0,
      negative_feedback_count: parseInt(data.negative_feedback_count) || 0
    };
  }

  /**
   * Calculate rate metrics
   */
  calculateRates(qualityMetrics, engagementMetrics) {
    const sent = engagementMetrics.messages_sent || 0;

    return {
      delivery_rate: sent > 0 ? parseFloat(((engagementMetrics.messages_delivered / sent) * 100).toFixed(2)) : 0,
      open_rate: sent > 0 ? parseFloat(((engagementMetrics.messages_opened / sent) * 100).toFixed(2)) : 0,
      click_rate: sent > 0 ? parseFloat(((engagementMetrics.messages_clicked / sent) * 100).toFixed(2)) : 0,
      reply_rate: sent > 0 ? parseFloat(((engagementMetrics.messages_replied / sent) * 100).toFixed(2)) : 0,
      conversion_rate: sent > 0 ? parseFloat(((engagementMetrics.messages_converted / sent) * 100).toFixed(2)) : 0
    };
  }

  /**
   * Get performance report
   */
  async getPerformanceReport(options = {}) {
    const {
      start_date,
      end_date = new Date(),
      aggregation_level = 'SYSTEM',
      aggregation_key = null
    } = options;

    const startStr = start_date instanceof Date ? start_date.toISOString().split('T')[0] : start_date;
    const endStr = end_date instanceof Date ? end_date.toISOString().split('T')[0] : end_date;

    let query = `
      SELECT
        metric_date,
        SUM(messages_generated) as total_generated,
        SUM(messages_sent) as total_sent,
        AVG(open_rate) as avg_open_rate,
        AVG(reply_rate) as avg_reply_rate,
        AVG(conversion_rate) as avg_conversion_rate,
        AVG(avg_quality_score) as avg_quality,
        AVG(avg_personalization_score) as avg_personalization,
        SUM(feedback_count) as total_feedback,
        AVG(avg_feedback_rating) as avg_rating
      FROM outreach_performance_metrics
      WHERE metric_date >= $1 AND metric_date <= $2
        AND aggregation_level = $3
    `;

    const params = [startStr, endStr, aggregation_level];

    if (aggregation_key) {
      params.push(aggregation_key);
      query += ` AND aggregation_key = $${params.length}`;
    }

    query += ` GROUP BY metric_date ORDER BY metric_date DESC`;

    const result = await this.pool.query(query, params);

    // Calculate summary statistics
    const summary = this.calculateSummary(result.rows);

    return {
      period: { start: startStr, end: endStr },
      daily_metrics: result.rows,
      summary
    };
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary(dailyMetrics) {
    if (dailyMetrics.length === 0) {
      return {
        total_generated: 0,
        total_sent: 0,
        avg_open_rate: 0,
        avg_reply_rate: 0,
        avg_conversion_rate: 0,
        avg_quality: 0
      };
    }

    const total_generated = dailyMetrics.reduce((sum, day) => sum + parseInt(day.total_generated || 0), 0);
    const total_sent = dailyMetrics.reduce((sum, day) => sum + parseInt(day.total_sent || 0), 0);

    return {
      total_generated,
      total_sent,
      avg_open_rate: parseFloat((dailyMetrics.reduce((sum, day) => sum + parseFloat(day.avg_open_rate || 0), 0) / dailyMetrics.length).toFixed(2)),
      avg_reply_rate: parseFloat((dailyMetrics.reduce((sum, day) => sum + parseFloat(day.avg_reply_rate || 0), 0) / dailyMetrics.length).toFixed(2)),
      avg_conversion_rate: parseFloat((dailyMetrics.reduce((sum, day) => sum + parseFloat(day.avg_conversion_rate || 0), 0) / dailyMetrics.length).toFixed(2)),
      avg_quality: parseFloat((dailyMetrics.reduce((sum, day) => sum + parseFloat(day.avg_quality || 0), 0) / dailyMetrics.length).toFixed(2)),
      avg_personalization: parseFloat((dailyMetrics.reduce((sum, day) => sum + parseFloat(day.avg_personalization || 0), 0) / dailyMetrics.length).toFixed(2)),
      total_feedback: dailyMetrics.reduce((sum, day) => sum + parseInt(day.total_feedback || 0), 0),
      days: dailyMetrics.length
    };
  }

  /**
   * Get performance trends
   */
  async getPerformanceTrends(days = 30) {
    const query = `
      SELECT
        metric_date,
        aggregation_level,
        AVG(avg_quality_score) as avg_quality,
        AVG(open_rate) as avg_open_rate,
        AVG(reply_rate) as avg_reply_rate,
        SUM(messages_generated) as total_generated
      FROM outreach_performance_metrics
      WHERE metric_date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY metric_date, aggregation_level
      ORDER BY metric_date DESC, aggregation_level
    `;

    const result = await this.pool.query(query);

    // Detect trends
    const trends = this.detectTrends(result.rows);

    return {
      data: result.rows,
      trends
    };
  }

  /**
   * Detect trends in performance data
   */
  detectTrends(data) {
    if (data.length < 7) {
      return { status: 'INSUFFICIENT_DATA' };
    }

    // Calculate week-over-week changes
    const recentWeek = data.slice(0, 7);
    const previousWeek = data.slice(7, 14);

    if (previousWeek.length < 7) {
      return { status: 'INSUFFICIENT_DATA' };
    }

    const avgQualityRecent = recentWeek.reduce((sum, d) => sum + parseFloat(d.avg_quality || 0), 0) / 7;
    const avgQualityPrevious = previousWeek.reduce((sum, d) => sum + parseFloat(d.avg_quality || 0), 0) / 7;

    const qualityChange = ((avgQualityRecent - avgQualityPrevious) / avgQualityPrevious) * 100;

    const volumeRecent = recentWeek.reduce((sum, d) => sum + parseInt(d.total_generated || 0), 0);
    const volumePrevious = previousWeek.reduce((sum, d) => sum + parseInt(d.total_generated || 0), 0);

    const volumeChange = ((volumeRecent - volumePrevious) / volumePrevious) * 100;

    return {
      quality_trend: qualityChange > 2 ? 'IMPROVING' : qualityChange < -2 ? 'DECLINING' : 'STABLE',
      quality_change: parseFloat(qualityChange.toFixed(2)),
      volume_trend: volumeChange > 10 ? 'INCREASING' : volumeChange < -10 ? 'DECREASING' : 'STABLE',
      volume_change: parseFloat(volumeChange.toFixed(2)),
      recent_avg_quality: parseFloat(avgQualityRecent.toFixed(2)),
      previous_avg_quality: parseFloat(avgQualityPrevious.toFixed(2))
    };
  }

  /**
   * Get real-time dashboard metrics
   */
  async getDashboardMetrics() {
    // Today's metrics
    const today = new Date().toISOString().split('T')[0];
    const todayMetrics = await this.pool.query(`
      SELECT
        SUM(messages_generated) as generated_today,
        AVG(avg_quality_score) as avg_quality_today,
        AVG(avg_personalization_score) as avg_personalization_today
      FROM outreach_performance_metrics
      WHERE metric_date = $1
    `, [today]);

    // Last 7 days
    const weekMetrics = await this.pool.query(`
      SELECT
        SUM(messages_generated) as generated_week,
        AVG(avg_quality_score) as avg_quality_week,
        AVG(open_rate) as avg_open_rate_week,
        AVG(reply_rate) as avg_reply_rate_week
      FROM outreach_performance_metrics
      WHERE metric_date >= CURRENT_DATE - INTERVAL '7 days'
    `);

    // Quality distribution
    const qualityDist = await this.pool.query(`
      SELECT
        quality_tier,
        COUNT(*) as count
      FROM outreach_quality_scores
      WHERE scored_at >= NOW() - INTERVAL '7 days'
      GROUP BY quality_tier
    `);

    return {
      today: todayMetrics.rows[0],
      last_7_days: weekMetrics.rows[0],
      quality_distribution: qualityDist.rows,
      generated_at: new Date()
    };
  }

  /**
   * Check for performance alerts
   */
  async checkPerformanceAlerts() {
    const alerts = [];

    // Get today's metrics
    const today = new Date().toISOString().split('T')[0];
    const todayResult = await this.pool.query(`
      SELECT * FROM outreach_performance_metrics
      WHERE metric_date = $1 AND aggregation_level = 'SYSTEM'
    `, [today]);

    if (todayResult.rows.length === 0) {
      return { alerts: [], status: 'NO_DATA' };
    }

    const metrics = todayResult.rows[0];

    // Check quality score
    if (parseFloat(metrics.avg_quality_score) < 60) {
      alerts.push({
        type: 'LOW_QUALITY',
        severity: 'HIGH',
        message: `Average quality score dropped to ${metrics.avg_quality_score}`,
        recommendation: 'Review recent messages and apply quality improvements'
      });
    }

    // Check reply rate
    if (parseFloat(metrics.reply_rate) < 2) {
      alerts.push({
        type: 'LOW_ENGAGEMENT',
        severity: 'MEDIUM',
        message: `Reply rate is ${metrics.reply_rate}% (below 2% threshold)`,
        recommendation: 'Test new subject lines and CTAs'
      });
    }

    // Check negative feedback
    if (parseInt(metrics.negative_feedback_count) > 5) {
      alerts.push({
        type: 'HIGH_NEGATIVE_FEEDBACK',
        severity: 'HIGH',
        message: `${metrics.negative_feedback_count} negative feedback items today`,
        recommendation: 'Review feedback and pause low-performing templates'
      });
    }

    return {
      alerts,
      status: alerts.length > 0 ? 'ALERTS_FOUND' : 'HEALTHY',
      checked_at: new Date()
    };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default OutreachPerformanceService;
