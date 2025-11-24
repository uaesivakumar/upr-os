/**
 * Score Decay Service
 * Applies time-based decay to engagement scores for inactive leads
 * Decay Rate = min(0.75, Days Inactive × 0.0083)
 */

import pg from 'pg';
const { Pool } = pg;

export class ScoreDecayService {
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
   * Apply decay to a single opportunity
   */
  async applyDecay(opportunityId) {
    // Get current scores
    const currentScore = await this.getCurrentScore(opportunityId);

    if (!currentScore) {
      return {
        error: 'No score found for opportunity',
        opportunityId
      };
    }

    // Calculate days inactive
    const daysInactive = await this.calculateDaysInactive(opportunityId);

    // Calculate decay rate
    const decayRate = this.calculateDecayRate(daysInactive);

    // Apply decay to engagement score
    const originalEngagement = currentScore.engagement_score;
    const decayedEngagement = Math.round(originalEngagement * (1 - decayRate));

    // Recalculate lead score with decayed engagement
    const newLeadScore = Math.round(
      (currentScore.q_score * decayedEngagement * currentScore.fit_score) / 100
    );

    // Determine new grade
    const newGrade = this.determineGrade(newLeadScore);

    // Update in database if decay applied
    if (decayRate > 0) {
      await this.updateScoreWithDecay(opportunityId, {
        engagementScore: decayedEngagement,
        leadScore: newLeadScore,
        grade: newGrade,
        decayRate,
        decayApplied: true
      });
    }

    return {
      opportunityId,
      originalEngagement,
      decayedEngagement,
      originalLeadScore: currentScore.lead_score,
      newLeadScore,
      decayRate,
      daysInactive,
      decayApplied: decayRate > 0,
      gradeChange: currentScore.grade !== newGrade,
      previousGrade: currentScore.grade,
      newGrade,
      appliedAt: new Date()
    };
  }

  /**
   * Get current score
   */
  async getCurrentScore(opportunityId) {
    const query = 'SELECT * FROM lead_scores WHERE opportunity_id = $1';
    const result = await this.pool.query(query, [opportunityId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Calculate days since last activity
   */
  async calculateDaysInactive(opportunityId) {
    const query = `
      SELECT
        COALESCE(
          EXTRACT(EPOCH FROM (NOW() - MAX(occurred_at))) / 86400,
          EXTRACT(EPOCH FROM (NOW() - ls.calculated_at)) / 86400
        ) as days_inactive
      FROM lead_scores ls
      LEFT JOIN opportunity_touchpoints ot ON ls.opportunity_id = ot.opportunity_id
      WHERE ls.opportunity_id = $1
      GROUP BY ls.calculated_at
    `;

    const result = await this.pool.query(query, [opportunityId]);

    if (result.rows.length === 0) {
      return 0;
    }

    return parseFloat(result.rows[0].days_inactive) || 0;
  }

  /**
   * Calculate decay rate based on days inactive
   * Decay Rate = min(0.75, Days Inactive × 0.0083)
   *
   * Thresholds:
   * - 7 days: 5.8% decay
   * - 14 days: 11.6% decay
   * - 30 days: 24.9% decay
   * - 60 days: 49.8% decay
   * - 90 days: 74.7% decay (max 75%)
   */
  calculateDecayRate(daysInactive) {
    if (daysInactive < 7) {
      return 0; // No decay for first week
    }

    return Math.min(0.75, daysInactive * 0.0083);
  }

  /**
   * Update score with decay
   */
  async updateScoreWithDecay(opportunityId, decayData) {
    const { engagementScore, leadScore, grade, decayRate, decayApplied } = decayData;

    const query = `
      UPDATE lead_scores
      SET
        engagement_score = $2,
        lead_score = $3,
        grade = $4,
        decay_rate = $5,
        decay_applied = $6,
        updated_at = NOW()
      WHERE opportunity_id = $1
      RETURNING *
    `;

    await this.pool.query(query, [
      opportunityId,
      engagementScore,
      leadScore,
      grade,
      decayRate,
      decayApplied
    ]);

    // Record in history
    await this.recordDecayHistory(opportunityId, decayData);
  }

  /**
   * Record decay in history
   */
  async recordDecayHistory(opportunityId, decayData) {
    const currentScore = await this.getCurrentScore(opportunityId);

    const query = `
      INSERT INTO lead_score_history (
        opportunity_id,
        q_score,
        engagement_score,
        fit_score,
        lead_score,
        grade,
        change_reason,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.pool.query(query, [
      opportunityId,
      currentScore.q_score,
      decayData.engagementScore,
      currentScore.fit_score,
      decayData.leadScore,
      decayData.grade,
      'decay_applied',
      JSON.stringify({ decayRate: decayData.decayRate })
    ]);
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
   * Batch apply decay to multiple opportunities
   */
  async batchApplyDecay(options = {}) {
    const {
      dryRun = false,
      minDaysInactive = 7,
      limit = null,
      concurrency = 10
    } = options;

    // Get opportunities eligible for decay
    const eligibleQuery = `
      SELECT
        ls.opportunity_id,
        ls.engagement_score,
        COALESCE(
          EXTRACT(EPOCH FROM (NOW() - MAX(ot.occurred_at))) / 86400,
          EXTRACT(EPOCH FROM (NOW() - ls.calculated_at)) / 86400
        ) as days_inactive
      FROM lead_scores ls
      LEFT JOIN opportunity_touchpoints ot ON ls.opportunity_id = ot.opportunity_id
      WHERE ls.engagement_score > 0
      GROUP BY ls.opportunity_id, ls.engagement_score, ls.calculated_at
      HAVING COALESCE(
        EXTRACT(EPOCH FROM (NOW() - MAX(ot.occurred_at))) / 86400,
        EXTRACT(EPOCH FROM (NOW() - ls.calculated_at)) / 86400
      ) >= $1
      ORDER BY days_inactive DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const result = await this.pool.query(eligibleQuery, [minDaysInactive]);
    const opportunities = result.rows.map(row => row.opportunity_id);

    console.log(`Found ${opportunities.length} opportunities eligible for decay`);

    if (dryRun) {
      console.log('DRY RUN: No changes will be applied');
      return {
        dryRun: true,
        eligible: opportunities.length,
        opportunities: result.rows
      };
    }

    // Process in batches
    const results = [];

    for (let i = 0; i < opportunities.length; i += concurrency) {
      const batch = opportunities.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(id => this.applyDecay(id))
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

      console.log(`Processed ${Math.min(i + concurrency, opportunities.length)} / ${opportunities.length}`);
    }

    // Summary statistics
    const successful = results.filter(r => !r.error);
    const decayApplied = successful.filter(r => r.decayApplied);
    const gradeChanges = successful.filter(r => r.gradeChange);

    return {
      total: opportunities.length,
      processed: successful.length,
      decayApplied: decayApplied.length,
      gradeChanges: gradeChanges.length,
      failed: results.filter(r => r.error).length,
      results,
      summary: {
        avgDecayRate: decayApplied.reduce((sum, r) => sum + r.decayRate, 0) / decayApplied.length,
        avgDaysInactive: decayApplied.reduce((sum, r) => sum + r.daysInactive, 0) / decayApplied.length,
        avgScoreDrop: decayApplied.reduce((sum, r) => sum + (r.originalLeadScore - r.newLeadScore), 0) / decayApplied.length
      }
    };
  }

  /**
   * Get decay candidates (opportunities that should have decay applied)
   */
  async getDecayCandidates(options = {}) {
    const { minDaysInactive = 7, limit = 100 } = options;

    const query = `
      SELECT
        ls.opportunity_id,
        ls.lead_score,
        ls.grade,
        ls.engagement_score,
        ls.decay_applied,
        ls.calculated_at,
        COALESCE(
          EXTRACT(EPOCH FROM (NOW() - MAX(ot.occurred_at))) / 86400,
          EXTRACT(EPOCH FROM (NOW() - ls.calculated_at)) / 86400
        ) as days_inactive,
        (SELECT MAX(occurred_at) FROM opportunity_touchpoints
         WHERE opportunity_id = ls.opportunity_id) as last_activity
      FROM lead_scores ls
      LEFT JOIN opportunity_touchpoints ot ON ls.opportunity_id = ot.opportunity_id
      WHERE ls.engagement_score > 0
      GROUP BY ls.opportunity_id, ls.lead_score, ls.grade, ls.engagement_score,
               ls.decay_applied, ls.calculated_at
      HAVING COALESCE(
        EXTRACT(EPOCH FROM (NOW() - MAX(ot.occurred_at))) / 86400,
        EXTRACT(EPOCH FROM (NOW() - ls.calculated_at)) / 86400
      ) >= $1
      ORDER BY days_inactive DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [minDaysInactive, limit]);

    return result.rows.map(row => ({
      opportunityId: row.opportunity_id,
      leadScore: row.lead_score,
      grade: row.grade,
      engagementScore: row.engagement_score,
      decayApplied: row.decay_applied,
      calculatedAt: row.calculated_at,
      daysInactive: parseFloat(row.days_inactive),
      lastActivity: row.last_activity,
      projectedDecayRate: this.calculateDecayRate(parseFloat(row.days_inactive)),
      projectedEngagement: Math.round(
        row.engagement_score * (1 - this.calculateDecayRate(parseFloat(row.days_inactive)))
      )
    }));
  }

  /**
   * Reset decay for an opportunity (after new activity)
   */
  async resetDecay(opportunityId) {
    const query = `
      UPDATE lead_scores
      SET
        decay_applied = FALSE,
        decay_rate = 0,
        updated_at = NOW()
      WHERE opportunity_id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [opportunityId]);

    if (result.rows.length > 0) {
      await this.recordDecayHistory(opportunityId, {
        engagementScore: result.rows[0].engagement_score,
        leadScore: result.rows[0].lead_score,
        grade: result.rows[0].grade,
        decayRate: 0
      });
    }

    return {
      opportunityId,
      decayReset: true,
      resetAt: new Date()
    };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default ScoreDecayService;
