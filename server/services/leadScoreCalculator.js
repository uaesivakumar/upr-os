/**
 * Lead Score Calculator
 * Calculates comprehensive lead scores: Q-Score × Engagement × Fit
 */

import pg from 'pg';
const { Pool } = pg;

export class LeadScoreCalculator {
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
   * Calculate complete lead score for an opportunity
   */
  async calculateLeadScore(opportunityId) {
    const [qScore, engagementScore, fitScore] = await Promise.all([
      this.calculateQScore(opportunityId),
      this.calculateEngagementScore(opportunityId),
      this.calculateFitScore(opportunityId)
    ]);

    // Lead Score = (Q × Engagement × Fit) / 100
    // This normalizes to 0-10000 range
    const leadScore = Math.round((qScore * engagementScore * fitScore) / 100);
    const grade = this.determineGrade(leadScore);
    const segment = this.determineSegment(grade);

    // Save to database
    await this.saveLeadScore({
      opportunityId,
      qScore,
      engagementScore,
      fitScore,
      leadScore,
      grade,
      segment
    });

    return {
      opportunityId,
      qScore,
      engagementScore,
      fitScore,
      leadScore,
      grade,
      segment,
      calculatedAt: new Date()
    };
  }

  /**
   * Calculate Q-Score (quality score from Sprint 22)
   */
  async calculateQScore(opportunityId) {
    // Check if quality score exists in lifecycle metadata
    const query = `
      SELECT metadata->>'quality_score' as quality_score
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1
        AND metadata->>'quality_score' IS NOT NULL
      ORDER BY entered_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [opportunityId]);

    if (result.rows.length > 0 && result.rows[0].quality_score) {
      return parseInt(result.rows[0].quality_score);
    }

    // Default: use fit score as proxy for quality
    return 70; // Default quality score
  }

  /**
   * Calculate Engagement Score (from Sprint 34)
   */
  async calculateEngagementScore(opportunityId) {
    // Use lifecycle_scores table if available from Sprint 34
    const scoreQuery = `
      SELECT engagement_score
      FROM lifecycle_scores
      WHERE opportunity_id = $1
    `;

    const result = await this.pool.query(scoreQuery, [opportunityId]);

    if (result.rows.length > 0 && result.rows[0].engagement_score) {
      return parseInt(result.rows[0].engagement_score);
    }

    // Fallback: calculate basic engagement from touchpoints
    const touchpointQuery = `
      SELECT
        COUNT(*) as total_touchpoints,
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '30 days') as recent_touchpoints,
        COUNT(*) FILTER (WHERE outcome = 'positive') as positive_outcomes
      FROM opportunity_touchpoints
      WHERE opportunity_id = $1
    `;

    const tpResult = await this.pool.query(touchpointQuery, [opportunityId]);

    if (tpResult.rows.length === 0 || parseInt(tpResult.rows[0].total_touchpoints) === 0) {
      return 50; // Default for no engagement
    }

    const { total_touchpoints, recent_touchpoints, positive_outcomes } = tpResult.rows[0];
    let score = 50;
    score += Math.min(parseInt(total_touchpoints) * 3, 30);
    score += Math.min(parseInt(recent_touchpoints) * 5, 20);
    score += Math.min(parseInt(positive_outcomes) * 5, 20);

    return Math.min(score, 100);
  }

  /**
   * Calculate Fit Score
   */
  async calculateFitScore(opportunityId) {
    // This would integrate with FitScoringService
    // For now, return a basic fit score
    // Full implementation in fitScoringService.js

    const query = `
      SELECT metadata
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1
      ORDER BY entered_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [opportunityId]);

    if (result.rows.length === 0) {
      return 70; // Default
    }

    const metadata = result.rows[0].metadata || {};
    let fitScore = 50; // Base score

    // Industry fit (simplified)
    if (metadata.industry) {
      const targetIndustries = ['technology', 'software', 'saas', 'fintech'];
      if (targetIndustries.some(ind => metadata.industry.toLowerCase().includes(ind))) {
        fitScore += 20;
      }
    }

    // Size fit
    if (metadata.size || metadata.employee_count) {
      const size = metadata.size || metadata.employee_count;
      if (size >= 50 && size <= 500) {
        fitScore += 15;
      } else if (size >= 10 && size < 50 || size > 500 && size <= 1000) {
        fitScore += 10;
      }
    }

    // Location fit
    if (metadata.location || metadata.country) {
      const location = (metadata.location || metadata.country || '').toLowerCase();
      if (location.includes('uae') || location.includes('dubai') || location.includes('abu dhabi')) {
        fitScore += 15;
      } else if (location.includes('ksa') || location.includes('saudi')) {
        fitScore += 10;
      }
    }

    return Math.min(fitScore, 100);
  }

  /**
   * Determine grade from score
   */
  determineGrade(score) {
    if (score >= 8000) return 'A+';
    if (score >= 6000) return 'A';
    if (score >= 4000) return 'B+';
    if (score >= 2000) return 'B';
    if (score >= 1000) return 'C';
    return 'D';
  }

  /**
   * Determine segment from grade
   */
  determineSegment(grade) {
    const segments = {
      'A+': 'Hot Leads',
      'A': 'Strong Leads',
      'B+': 'Good Leads',
      'B': 'Decent Leads',
      'C': 'Marginal Leads',
      'D': 'Poor Leads'
    };
    return segments[grade] || 'Unknown';
  }

  /**
   * Save lead score to database
   */
  async saveLeadScore(scoreData) {
    const {
      opportunityId,
      qScore,
      engagementScore,
      fitScore,
      leadScore,
      grade,
      segment
    } = scoreData;

    // Get last activity time
    const activityQuery = `
      SELECT MAX(occurred_at) as last_activity
      FROM opportunity_touchpoints
      WHERE opportunity_id = $1
    `;
    const activityResult = await this.pool.query(activityQuery, [opportunityId]);
    const lastActivity = activityResult.rows[0]?.last_activity || null;

    const upsertQuery = `
      INSERT INTO lead_scores (
        opportunity_id,
        q_score,
        engagement_score,
        fit_score,
        lead_score,
        grade,
        segment,
        last_activity_at,
        calculated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (opportunity_id)
      DO UPDATE SET
        q_score = EXCLUDED.q_score,
        engagement_score = EXCLUDED.engagement_score,
        fit_score = EXCLUDED.fit_score,
        lead_score = EXCLUDED.lead_score,
        grade = EXCLUDED.grade,
        segment = EXCLUDED.segment,
        last_activity_at = EXCLUDED.last_activity_at,
        calculated_at = NOW()
      RETURNING *
    `;

    await this.pool.query(upsertQuery, [
      opportunityId,
      qScore,
      engagementScore,
      fitScore,
      leadScore,
      grade,
      segment,
      lastActivity
    ]);

    // Record in history
    await this.recordScoreHistory(opportunityId, scoreData, 'calculated');
  }

  /**
   * Record score in history
   */
  async recordScoreHistory(opportunityId, scoreData, reason = 'update') {
    const query = `
      INSERT INTO lead_score_history (
        opportunity_id,
        q_score,
        engagement_score,
        fit_score,
        lead_score,
        grade,
        change_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    await this.pool.query(query, [
      opportunityId,
      scoreData.qScore,
      scoreData.engagementScore,
      scoreData.fitScore,
      scoreData.leadScore,
      scoreData.grade,
      reason
    ]);
  }

  /**
   * Batch calculate scores
   */
  async batchCalculateScores(opportunityIds, options = {}) {
    const { concurrency = 10 } = options;
    const results = [];

    // Process in batches
    for (let i = 0; i < opportunityIds.length; i += concurrency) {
      const batch = opportunityIds.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(id => this.calculateLeadScore(id))
      );

      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            opportunityId: batch[index],
            error: result.reason.message
          });
        }
      });
    }

    return results;
  }

  /**
   * Get lead score
   */
  async getLeadScore(opportunityId) {
    const query = 'SELECT * FROM lead_scores WHERE opportunity_id = $1';
    const result = await this.pool.query(query, [opportunityId]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get score distribution
   */
  async getScoreDistribution() {
    const query = 'SELECT * FROM score_distribution_view';
    const result = await this.pool.query(query);

    return result.rows.map(row => ({
      grade: row.grade,
      count: parseInt(row.count),
      avgScore: parseFloat(row.avg_score),
      minScore: parseFloat(row.min_score),
      maxScore: parseFloat(row.max_score),
      avgQScore: parseFloat(row.avg_q_score),
      avgEngagement: parseFloat(row.avg_engagement),
      avgFit: parseFloat(row.avg_fit)
    }));
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default LeadScoreCalculator;
