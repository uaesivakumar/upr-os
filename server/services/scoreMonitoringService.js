/**
 * Score Monitoring Service
 * Tracks score changes, generates alerts, and provides historical analysis
 */

import pg from 'pg';
const { Pool } = pg;

export class ScoreMonitoringService {
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
   * Monitor score changes for an opportunity
   */
  async monitorScoreChanges(opportunityId, newScoreData) {
    const previousScore = await this.getPreviousScore(opportunityId);

    if (!previousScore) {
      return {
        isFirstScore: true,
        changes: null
      };
    }

    const changes = {
      leadScore: {
        previous: previousScore.lead_score,
        current: newScoreData.leadScore,
        change: newScoreData.leadScore - previousScore.lead_score,
        percentChange: this.calculatePercentChange(previousScore.lead_score, newScoreData.leadScore)
      },
      qScore: {
        previous: previousScore.q_score,
        current: newScoreData.qScore,
        change: newScoreData.qScore - previousScore.q_score
      },
      engagementScore: {
        previous: previousScore.engagement_score,
        current: newScoreData.engagementScore,
        change: newScoreData.engagementScore - previousScore.engagement_score
      },
      fitScore: {
        previous: previousScore.fit_score,
        current: newScoreData.fitScore,
        change: newScoreData.fitScore - previousScore.fit_score
      },
      gradeChange: previousScore.grade !== newScoreData.grade,
      previousGrade: previousScore.grade,
      currentGrade: newScoreData.grade
    };

    // Check if this is a significant change
    const isSignificant = Math.abs(changes.leadScore.change) >= 500 || changes.gradeChange;

    return {
      isFirstScore: false,
      changes,
      isSignificant,
      monitoredAt: new Date()
    };
  }

  /**
   * Get previous score
   */
  async getPreviousScore(opportunityId) {
    const query = 'SELECT * FROM lead_scores WHERE opportunity_id = $1';
    const result = await this.pool.query(query, [opportunityId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Calculate percent change
   */
  calculatePercentChange(oldVal, newVal) {
    if (oldVal === 0) return newVal > 0 ? 100 : 0;
    return ((newVal - oldVal) / oldVal) * 100;
  }

  /**
   * Get score history for an opportunity
   */
  async getScoreHistory(opportunityId, options = {}) {
    const { limit = 50, startDate = null, endDate = null } = options;

    let query = `
      SELECT *
      FROM lead_score_history
      WHERE opportunity_id = $1
    `;

    const params = [opportunityId];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      query += ` AND recorded_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND recorded_at <= $${paramCount}`;
      params.push(endDate);
    }

    query += ` ORDER BY recorded_at DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      opportunityId: row.opportunity_id,
      qScore: row.q_score,
      engagementScore: row.engagement_score,
      fitScore: row.fit_score,
      leadScore: row.lead_score,
      priorityScore: row.priority_score,
      grade: row.grade,
      changeReason: row.change_reason,
      metadata: row.metadata,
      recordedAt: row.recorded_at
    }));
  }

  /**
   * Detect significant score changes
   */
  async detectSignificantChanges(options = {}) {
    const {
      threshold = 500,
      days = 7,
      changeType = 'any' // 'any', 'increase', 'decrease'
    } = options;

    const query = `
      WITH recent_changes AS (
        SELECT
          h1.opportunity_id,
          h1.lead_score as current_score,
          h1.grade as current_grade,
          h1.recorded_at as current_time,
          h2.lead_score as previous_score,
          h2.grade as previous_grade,
          h2.recorded_at as previous_time,
          (h1.lead_score - h2.lead_score) as score_change,
          ROW_NUMBER() OVER (PARTITION BY h1.opportunity_id ORDER BY h1.recorded_at DESC) as rn
        FROM lead_score_history h1
        JOIN lead_score_history h2 ON h1.opportunity_id = h2.opportunity_id
          AND h2.recorded_at < h1.recorded_at
        WHERE h1.recorded_at >= NOW() - INTERVAL '${days} days'
      )
      SELECT *
      FROM recent_changes
      WHERE rn = 1
        AND ABS(score_change) >= $1
      ORDER BY ABS(score_change) DESC
    `;

    const result = await this.pool.query(query, [threshold]);

    let changes = result.rows;

    if (changeType === 'increase') {
      changes = changes.filter(c => c.score_change > 0);
    } else if (changeType === 'decrease') {
      changes = changes.filter(c => c.score_change < 0);
    }

    return changes.map(row => ({
      opportunityId: row.opportunity_id,
      currentScore: row.current_score,
      previousScore: row.previous_score,
      scoreChange: row.score_change,
      percentChange: this.calculatePercentChange(row.previous_score, row.current_score),
      currentGrade: row.current_grade,
      previousGrade: row.previous_grade,
      gradeChanged: row.current_grade !== row.previous_grade,
      currentTime: row.current_time,
      previousTime: row.previous_time
    }));
  }

  /**
   * Generate score alerts
   */
  async generateScoreAlerts(options = {}) {
    const { days = 1 } = options;

    const alerts = [];

    // Detect major score drops (>20% in last day)
    const drops = await this.detectSignificantChanges({
      threshold: 500,
      days,
      changeType: 'decrease'
    });

    drops.forEach(drop => {
      if (drop.percentChange <= -20) {
        alerts.push({
          type: 'MAJOR_DROP',
          severity: 'HIGH',
          opportunityId: drop.opportunityId,
          message: `Lead score dropped by ${Math.abs(drop.scoreChange)} points (${drop.percentChange.toFixed(1)}%)`,
          details: drop
        });
      }
    });

    // Detect major score increases
    const increases = await this.detectSignificantChanges({
      threshold: 500,
      days,
      changeType: 'increase'
    });

    increases.forEach(inc => {
      if (inc.percentChange >= 20) {
        alerts.push({
          type: 'MAJOR_INCREASE',
          severity: 'MEDIUM',
          opportunityId: inc.opportunityId,
          message: `Lead score increased by ${inc.scoreChange} points (${inc.percentChange.toFixed(1)}%)`,
          details: inc
        });
      }
    });

    // Detect grade changes
    const gradeChanges = [...drops, ...increases].filter(c => c.gradeChanged);
    gradeChanges.forEach(change => {
      alerts.push({
        type: 'GRADE_CHANGE',
        severity: change.scoreChange > 0 ? 'MEDIUM' : 'HIGH',
        opportunityId: change.opportunityId,
        message: `Grade changed from ${change.previousGrade} to ${change.currentGrade}`,
        details: change
      });
    });

    return alerts;
  }

  /**
   * Get score trends
   */
  async getScoreTrends(options = {}) {
    const { days = 30, granularity = 'day' } = options;

    const query = `
      SELECT
        DATE_TRUNC('${granularity}', recorded_at) as time_bucket,
        AVG(lead_score) as avg_score,
        AVG(q_score) as avg_q_score,
        AVG(engagement_score) as avg_engagement,
        AVG(fit_score) as avg_fit,
        COUNT(DISTINCT opportunity_id) as unique_opportunities,
        COUNT(*) as total_calculations
      FROM lead_score_history
      WHERE recorded_at >= NOW() - INTERVAL '${days} days'
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;

    const result = await this.pool.query(query);

    return result.rows.map(row => ({
      timeBucket: row.time_bucket,
      avgScore: parseFloat(row.avg_score),
      avgQScore: parseFloat(row.avg_q_score),
      avgEngagement: parseFloat(row.avg_engagement),
      avgFit: parseFloat(row.avg_fit),
      uniqueOpportunities: parseInt(row.unique_opportunities),
      totalCalculations: parseInt(row.total_calculations)
    }));
  }

  /**
   * Get opportunities with stagnant scores
   */
  async getStagnantScores(options = {}) {
    const { days = 30, minScore = 4000 } = options;

    const query = `
      SELECT
        ls.opportunity_id,
        ls.lead_score,
        ls.grade,
        ls.calculated_at,
        (SELECT MAX(recorded_at) FROM lead_score_history
         WHERE opportunity_id = ls.opportunity_id) as last_change,
        EXTRACT(EPOCH FROM (NOW() - ls.calculated_at)) / 86400 as days_unchanged
      FROM lead_scores ls
      WHERE ls.lead_score >= $1
        AND ls.calculated_at < NOW() - INTERVAL '${days} days'
        AND NOT EXISTS (
          SELECT 1 FROM lead_score_history
          WHERE opportunity_id = ls.opportunity_id
            AND recorded_at >= NOW() - INTERVAL '${days} days'
        )
      ORDER BY ls.lead_score DESC
    `;

    const result = await this.pool.query(query, [minScore]);

    return result.rows.map(row => ({
      opportunityId: row.opportunity_id,
      leadScore: row.lead_score,
      grade: row.grade,
      calculatedAt: row.calculated_at,
      lastChange: row.last_change,
      daysUnchanged: parseFloat(row.days_unchanged)
    }));
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default ScoreMonitoringService;
