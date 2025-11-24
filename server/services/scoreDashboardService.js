/**
 * Score Dashboard Service
 * Real-time analytics and metrics for lead scoring
 * Sprint 44 Enhancement: Integrated with alerts, A/B tests, queue, assignments
 */

import pg from 'pg';
const { Pool } = pg;
import { ScoreAlertService } from './scoreAlertService.js';
import { ABTestingService } from './abTestingService.js';
import { RealtimeScoreService } from './realtimeScoreService.js';
import { DecaySchedulerService } from './decaySchedulerService.js';

export class ScoreDashboardService {
  constructor(connectionConfig = null) {
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }

    // Initialize Sprint 44 services
    this.alertService = new ScoreAlertService(connectionConfig || process.env.DATABASE_URL);
    this.abService = new ABTestingService(connectionConfig || process.env.DATABASE_URL);
    this.realtimeService = new RealtimeScoreService(connectionConfig || process.env.DATABASE_URL);
    this.decayScheduler = new DecaySchedulerService(connectionConfig || process.env.DATABASE_URL);
  }

  /**
   * Get complete dashboard data
   */
  async getDashboard(options = {}) {
    const { timeRange = 30 } = options;

    const [
      distribution,
      trends,
      topMovers,
      conversionMetrics,
      health
    ] = await Promise.all([
      this.getScoreDistribution({ timeRange }),
      this.getScoreTrends({ days: timeRange }),
      this.getTopMovers({ limit: 10 }),
      this.getConversionMetrics(),
      this.getSystemHealth()
    ]);

    return {
      distribution,
      trends,
      topMovers,
      conversionMetrics,
      health,
      generatedAt: new Date()
    };
  }

  /**
   * Get score distribution
   */
  async getScoreDistribution(options = {}) {
    const { timeRange = 30 } = options;

    const query = `
      SELECT
        grade,
        COUNT(*) as count,
        AVG(lead_score) as avg_score,
        MIN(lead_score) as min_score,
        MAX(lead_score) as max_score
      FROM lead_scores
      WHERE calculated_at >= NOW() - INTERVAL '${timeRange} days'
      GROUP BY grade
      ORDER BY
        CASE grade
          WHEN 'A+' THEN 1
          WHEN 'A' THEN 2
          WHEN 'B+' THEN 3
          WHEN 'B' THEN 4
          WHEN 'C' THEN 5
          WHEN 'D' THEN 6
        END
    `;

    const result = await this.pool.query(query);

    const totalLeads = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const totalScore = result.rows.reduce((sum, row) =>
      sum + (parseFloat(row.avg_score) * parseInt(row.count)), 0
    );

    const distribution = result.rows.map(row => ({
      grade: row.grade,
      count: parseInt(row.count),
      percentage: parseFloat(((parseInt(row.count) / totalLeads) * 100).toFixed(1)),
      avgScore: Math.round(parseFloat(row.avg_score)),
      minScore: parseInt(row.min_score),
      maxScore: parseInt(row.max_score)
    }));

    // Get previous period for trend
    const prevQuery = `
      SELECT AVG(lead_score) as prev_avg
      FROM lead_scores
      WHERE calculated_at >= NOW() - INTERVAL '${timeRange * 2} days'
        AND calculated_at < NOW() - INTERVAL '${timeRange} days'
    `;

    const prevResult = await this.pool.query(prevQuery);
    const prevAvg = prevResult.rows[0]?.prev_avg || totalScore / totalLeads;
    const currentAvg = totalScore / totalLeads;
    const trend = prevAvg > 0 ? (((currentAvg - prevAvg) / prevAvg) * 100).toFixed(1) : '0.0';

    return {
      distribution,
      totalLeads,
      avgScore: Math.round(currentAvg),
      trend: `${trend > 0 ? '+' : ''}${trend}%`
    };
  }

  /**
   * Get score trends over time
   */
  async getScoreTrends(options = {}) {
    const { days = 30, granularity = 'day' } = options;

    const query = `
      SELECT
        DATE_TRUNC('${granularity}', calculated_at) as time_bucket,
        AVG(lead_score) as avg_score,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE grade IN ('A+', 'A')) as high_grade_count
      FROM lead_scores
      WHERE calculated_at >= NOW() - INTERVAL '${days} days'
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;

    const result = await this.pool.query(query);

    const timeSeries = result.rows.map(row => ({
      date: row.time_bucket,
      avgScore: Math.round(parseFloat(row.avg_score)),
      count: parseInt(row.count),
      highGradeCount: parseInt(row.high_grade_count)
    }));

    return {
      timeSeries,
      period: `${days} days`,
      granularity
    };
  }

  /**
   * Get top movers (biggest score changes)
   */
  async getTopMovers(options = {}) {
    const { limit = 10, days = 7 } = options;

    const query = `
      WITH recent_changes AS (
        SELECT
          h1.opportunity_id,
          h1.lead_score as current_score,
          h1.grade as current_grade,
          h2.lead_score as previous_score,
          h2.grade as previous_grade,
          (h1.lead_score - h2.lead_score) as score_change,
          h1.recorded_at,
          h1.change_reason,
          ROW_NUMBER() OVER (PARTITION BY h1.opportunity_id ORDER BY h1.recorded_at DESC) as rn
        FROM lead_score_history h1
        JOIN lead_score_history h2 ON h1.opportunity_id = h2.opportunity_id
          AND h2.recorded_at < h1.recorded_at
        WHERE h1.recorded_at >= NOW() - INTERVAL '${days} days'
      )
      SELECT *
      FROM recent_changes
      WHERE rn = 1
      ORDER BY ABS(score_change) DESC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);

    return result.rows.map(row => ({
      opportunityId: row.opportunity_id,
      currentScore: row.current_score,
      previousScore: row.previous_score,
      scoreChange: row.score_change,
      percentChange: ((row.score_change / row.previous_score) * 100).toFixed(1),
      currentGrade: row.current_grade,
      previousGrade: row.previous_grade,
      gradeChanged: row.current_grade !== row.previous_grade,
      reason: row.change_reason,
      changedAt: row.recorded_at
    }));
  }

  /**
   * Get conversion metrics
   */
  async getConversionMetrics(options = {}) {
    // Mock data for now - would integrate with actual conversion tracking
    return {
      byGrade: [
        { grade: 'A+', conversionRate: 0.45, avgDaysToClose: 15, count: 45 },
        { grade: 'A', conversionRate: 0.32, avgDaysToClose: 22, count: 67 },
        { grade: 'B+', conversionRate: 0.22, avgDaysToClose: 35, count: 89 },
        { grade: 'B', conversionRate: 0.15, avgDaysToClose: 45, count: 112 },
        { grade: 'C', conversionRate: 0.08, avgDaysToClose: 60, count: 78 },
        { grade: 'D', conversionRate: 0.03, avgDaysToClose: 75, count: 56 }
      ],
      scoreVsConversion: {
        correlation: 0.78,
        r2: 0.61,
        pValue: 0.001
      },
      overallConversionRate: 0.18,
      avgDaysToClose: 38
    };
  }

  /**
   * Get system health metrics
   */
  async getSystemHealth() {
    const query = `
      SELECT
        COUNT(*) as total_scored,
        COUNT(*) FILTER (WHERE calculated_at >= NOW() - INTERVAL '24 hours') as scored_today,
        COUNT(*) FILTER (WHERE decay_applied = true) as with_decay,
        COUNT(*) FILTER (WHERE priority_score IS NOT NULL) as with_priority,
        AVG(lead_score) as avg_score
      FROM lead_scores
    `;

    const result = await this.pool.query(query);
    const row = result.rows[0];

    return {
      totalScored: parseInt(row.total_scored),
      scoredToday: parseInt(row.scored_today),
      withDecay: parseInt(row.with_decay),
      withPriority: parseInt(row.with_priority),
      avgScore: Math.round(parseFloat(row.avg_score)),
      status: 'healthy',
      lastUpdated: new Date()
    };
  }

  /**
   * Get detailed lead insights
   */
  async getLeadInsights(options = {}) {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE grade IN ('A+', 'A')) as hot_leads,
        COUNT(*) FILTER (WHERE decay_applied = true AND decay_rate > 0.3) as high_decay,
        COUNT(*) FILTER (WHERE engagement_score < 50) as low_engagement,
        COUNT(*) FILTER (WHERE fit_score >= 80) as perfect_fit,
        COUNT(*) FILTER (WHERE calculated_at < NOW() - INTERVAL '7 days') as stale_scores
      FROM lead_scores
    `;

    const result = await this.pool.query(query);
    const row = result.rows[0];

    return {
      hotLeads: parseInt(row.hot_leads),
      highDecay: parseInt(row.high_decay),
      lowEngagement: parseInt(row.low_engagement),
      perfectFit: parseInt(row.perfect_fit),
      staleScores: parseInt(row.stale_scores),
      recommendations: this.generateInsightRecommendations(row)
    };
  }

  /**
   * Generate insight recommendations
   */
  generateInsightRecommendations(data) {
    const recommendations = [];

    if (parseInt(data.hot_leads) > 0) {
      recommendations.push({
        priority: 'HIGH',
        message: `${data.hot_leads} hot leads (A+/A grade) need immediate attention`,
        action: 'Review and prioritize follow-up'
      });
    }

    if (parseInt(data.high_decay) > 10) {
      recommendations.push({
        priority: 'MEDIUM',
        message: `${data.high_decay} leads experiencing high decay`,
        action: 'Re-engage before scores drop further'
      });
    }

    if (parseInt(data.stale_scores) > 50) {
      recommendations.push({
        priority: 'LOW',
        message: `${data.stale_scores} scores not updated in 7+ days`,
        action: 'Run batch recalculation'
      });
    }

    return recommendations;
  }

  /**
   * Get Sprint 44 activation metrics
   */
  async getActivationMetrics() {
    const [
      alertMetrics,
      queueMetrics,
      abTestMetrics,
      decayMetrics,
      assignmentMetrics
    ] = await Promise.all([
      this.getAlertMetrics(),
      this.getQueueMetrics(),
      this.getABTestMetrics(),
      this.getDecayMetrics(),
      this.getAssignmentMetrics()
    ]);

    return {
      alerts: alertMetrics,
      queue: queueMetrics,
      abTesting: abTestMetrics,
      decay: decayMetrics,
      assignments: assignmentMetrics,
      generatedAt: new Date()
    };
  }

  /**
   * Get alert metrics
   */
  async getAlertMetrics() {
    const stats = await this.alertService.getAlertStats({ days: 7 });
    const recent = await this.alertService.getRecentAlerts({ limit: 5, acknowledged: false });

    const totalAlerts = stats.reduce((sum, s) => sum + parseInt(s.count), 0);
    const pendingAlerts = stats.reduce((sum, s) => sum + parseInt(s.pending_count), 0);
    const criticalAlerts = stats.filter(s => s.severity === 'CRITICAL')
      .reduce((sum, s) => sum + parseInt(s.pending_count), 0);

    return {
      total: totalAlerts,
      pending: pendingAlerts,
      critical: criticalAlerts,
      recentCount: recent.length
    };
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics() {
    const status = await this.realtimeService.getQueueStatus();

    return {
      pending: status.pending.count,
      processing: status.processing.count,
      completed: status.completed.count,
      failed: status.failed.count
    };
  }

  /**
   * Get A/B testing metrics
   */
  async getABTestMetrics() {
    const allTests = await this.abService.listTests({ limit: 100 });

    return {
      total: allTests.length,
      running: allTests.filter(t => t.status === 'RUNNING').length,
      completed: allTests.filter(t => t.status === 'COMPLETED').length
    };
  }

  /**
   * Get decay metrics
   */
  async getDecayMetrics() {
    const stats = await this.decayScheduler.getDecayStatistics({ days: 30 });

    return {
      totalRuns: stats.totalRuns,
      totalDecayApplied: stats.totalDecayApplied,
      totalGradeChanges: stats.totalGradeChanges,
      daysSinceLastRun: stats.lastRun ?
        ((new Date() - new Date(stats.lastRun)) / (1000 * 60 * 60 * 24)).toFixed(1) : null
    };
  }

  /**
   * Get assignment metrics
   */
  async getAssignmentMetrics() {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE priority_level = 'URGENT') as urgent
      FROM lead_assignments
    `;

    const result = await this.pool.query(query);
    const row = result.rows[0];

    return {
      active: parseInt(row.active),
      completed: parseInt(row.completed),
      urgent: parseInt(row.urgent)
    };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.alertService.close();
    await this.abService.close();
    await this.realtimeService.close();
    await this.decayScheduler.close();
    await this.pool.end();
  }
}

export default ScoreDashboardService;
