/**
 * Priority Ranking Service
 * Implements "most actionable" logic for lead prioritization
 *
 * Priority Score Formula:
 * Priority = (Lead Score × 0.5) + (State Urgency × 0.2) +
 *            (Recency Factor × 0.15) + (Stage Boost × 0.1) +
 *            (Response Boost × 0.05)
 */

import pg from 'pg';
const { Pool } = pg;

export class PriorityRankingService {
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
   * Calculate priority score for an opportunity
   */
  async calculatePriorityScore(opportunityId) {
    const leadScore = await this.getLeadScore(opportunityId);

    if (!leadScore) {
      return {
        error: 'No lead score found',
        opportunityId
      };
    }

    const lifecycleData = await this.getLifecycleData(opportunityId);
    const activityData = await this.getActivityData(opportunityId);

    // Calculate components (0.5 + 0.2 + 0.15 + 0.1 + 0.05 = 1.0)
    const components = {
      leadScoreFactor: Math.round(leadScore.lead_score * 0.5),
      stateUrgency: this.calculateStateUrgency(lifecycleData),
      recencyFactor: this.calculateRecencyFactor(activityData),
      stageBoost: this.calculateStageBoost(lifecycleData.state),
      responseBoost: this.calculateResponseBoost(activityData)
    };

    const priorityScore = Object.values(components).reduce((sum, val) => sum + val, 0);

    // Update in database
    await this.updatePriorityScore(opportunityId, priorityScore);

    return {
      opportunityId,
      priorityScore,
      breakdown: components,
      leadScore: leadScore.lead_score,
      grade: leadScore.grade,
      currentState: lifecycleData.state,
      calculatedAt: new Date()
    };
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
   * Get lifecycle data
   */
  async getLifecycleData(opportunityId) {
    const query = `
      SELECT
        state,
        entered_at,
        EXTRACT(EPOCH FROM (NOW() - entered_at)) / 86400 as days_in_state
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1
      ORDER BY entered_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [opportunityId]);

    if (result.rows.length === 0) {
      return { state: 'UNKNOWN', daysInState: 0 };
    }

    return {
      state: result.rows[0].state,
      daysInState: parseFloat(result.rows[0].days_in_state),
      enteredAt: result.rows[0].entered_at
    };
  }

  /**
   * Get activity data
   */
  async getActivityData(opportunityId) {
    const query = `
      SELECT
        MAX(occurred_at) as last_contact,
        EXTRACT(EPOCH FROM (NOW() - MAX(occurred_at))) / 86400 as days_since_contact,
        COUNT(*) as total_touchpoints,
        COUNT(*) FILTER (WHERE outcome = 'positive') as positive_outcomes,
        COUNT(*) FILTER (WHERE outcome = 'negative') as negative_outcomes,
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '7 days') as recent_touchpoints
      FROM opportunity_touchpoints
      WHERE opportunity_id = $1
    `;

    const result = await this.pool.query(query, [opportunityId]);

    if (result.rows.length === 0 || !result.rows[0].last_contact) {
      return {
        lastContact: null,
        daysSinceContact: 999,
        totalTouchpoints: 0,
        positiveOutcomes: 0,
        negativeOutcomes: 0,
        recentTouchpoints: 0,
        responseRate: 0
      };
    }

    const row = result.rows[0];
    const responseRate = parseInt(row.total_touchpoints) > 0
      ? parseInt(row.positive_outcomes) / parseInt(row.total_touchpoints)
      : 0;

    return {
      lastContact: row.last_contact,
      daysSinceContact: parseFloat(row.days_since_contact) || 0,
      totalTouchpoints: parseInt(row.total_touchpoints),
      positiveOutcomes: parseInt(row.positive_outcomes),
      negativeOutcomes: parseInt(row.negative_outcomes),
      recentTouchpoints: parseInt(row.recent_touchpoints),
      responseRate
    };
  }

  /**
   * Calculate state urgency (20% weight)
   * Longer in state = higher urgency
   */
  calculateStateUrgency(lifecycleData) {
    const daysInState = lifecycleData.daysInState;

    // Urgency increases with time in state
    // Cap at 100 points (10 days × 10 = 100)
    const urgency = Math.min(daysInState * 10, 100);

    return Math.round(urgency * 0.2);
  }

  /**
   * Calculate recency factor (15% weight)
   * Longer since last contact = higher priority for re-engagement
   */
  calculateRecencyFactor(activityData) {
    const daysSinceContact = activityData.daysSinceContact;

    if (daysSinceContact === 999) {
      // Never contacted - medium priority
      return Math.round(50 * 0.15);
    }

    // Priority increases with time since contact
    // 0 days = 0 points, 30+ days = 100 points
    const recencyScore = Math.min((daysSinceContact / 30) * 100, 100);

    return Math.round(recencyScore * 0.15);
  }

  /**
   * Calculate stage boost (10% weight)
   */
  calculateStageBoost(state) {
    const boosts = {
      'NEGOTIATING': 100,
      'ENGAGED': 50,
      'OUTREACH': 25,
      'QUALIFIED': 10,
      'DISCOVERED': 0,
      'DORMANT': -50,
      'LOST': -100
    };

    const boost = boosts[state] || 0;
    return Math.round(boost * 0.1);
  }

  /**
   * Calculate response boost (5% weight)
   */
  calculateResponseBoost(activityData) {
    const responseRate = activityData.responseRate;

    if (responseRate >= 0.7) {
      // High response rate: +20 boost
      return Math.round(20 * 0.05);
    } else if (responseRate >= 0.4) {
      // Medium response rate: +10 boost
      return Math.round(10 * 0.05);
    } else if (responseRate < 0.2 && activityData.totalTouchpoints > 3) {
      // Low response rate with multiple attempts: -10 penalty
      return Math.round(-10 * 0.05);
    }

    return 0;
  }

  /**
   * Update priority score in database
   */
  async updatePriorityScore(opportunityId, priorityScore) {
    const query = `
      UPDATE lead_scores
      SET
        priority_score = $2,
        updated_at = NOW()
      WHERE opportunity_id = $1
      RETURNING *
    `;

    await this.pool.query(query, [opportunityId, priorityScore]);

    // Record in history
    await this.recordPriorityHistory(opportunityId, priorityScore);
  }

  /**
   * Record priority in history
   */
  async recordPriorityHistory(opportunityId, priorityScore) {
    const currentScore = await this.getLeadScore(opportunityId);

    const query = `
      INSERT INTO lead_score_history (
        opportunity_id,
        q_score,
        engagement_score,
        fit_score,
        lead_score,
        priority_score,
        grade,
        change_reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.pool.query(query, [
      opportunityId,
      currentScore.q_score,
      currentScore.engagement_score,
      currentScore.fit_score,
      currentScore.lead_score,
      priorityScore,
      currentScore.grade,
      'priority_updated'
    ]);
  }

  /**
   * Rank all leads by priority
   */
  async rankLeads(filters = {}) {
    const {
      minScore = 0,
      grade = null,
      state = null,
      limit = 100
    } = filters;

    let query = `
      SELECT
        ls.opportunity_id,
        ls.lead_score,
        ls.priority_score,
        ls.grade,
        ls.q_score,
        ls.engagement_score,
        ls.fit_score,
        ls.calculated_at,
        ls.last_activity_at,
        (SELECT state FROM opportunity_lifecycle
         WHERE opportunity_id = ls.opportunity_id
         ORDER BY entered_at DESC LIMIT 1) as current_state,
        (SELECT EXTRACT(EPOCH FROM (NOW() - entered_at)) / 86400
         FROM opportunity_lifecycle
         WHERE opportunity_id = ls.opportunity_id
         ORDER BY entered_at DESC LIMIT 1) as days_in_state
      FROM lead_scores ls
      WHERE ls.lead_score >= $1
    `;

    const params = [minScore];
    let paramCount = 1;

    if (grade) {
      paramCount++;
      query += ` AND ls.grade = $${paramCount}`;
      params.push(grade);
    }

    if (state) {
      query += ` AND EXISTS (
        SELECT 1 FROM opportunity_lifecycle
        WHERE opportunity_id = ls.opportunity_id
          AND state = $${paramCount + 1}
        ORDER BY entered_at DESC LIMIT 1
      )`;
      paramCount++;
      params.push(state);
    }

    query += `
      ORDER BY ls.priority_score DESC NULLS LAST, ls.lead_score DESC
      LIMIT $${paramCount + 1}
    `;
    params.push(limit);

    const result = await this.pool.query(query, params);

    return result.rows.map((row, index) => ({
      rank: index + 1,
      opportunityId: row.opportunity_id,
      leadScore: row.lead_score,
      priorityScore: row.priority_score,
      grade: row.grade,
      qScore: row.q_score,
      engagementScore: row.engagement_score,
      fitScore: row.fit_score,
      currentState: row.current_state,
      daysInState: parseFloat(row.days_in_state) || 0,
      calculatedAt: row.calculated_at,
      lastActivityAt: row.last_activity_at
    }));
  }

  /**
   * Get most actionable leads
   */
  async getMostActionable(limit = 50, filters = {}) {
    const leads = await this.rankLeads({ ...filters, limit });

    // Add actionability reasons
    return leads.map(lead => {
      const reasons = [];
      const actions = [];

      // Determine why this lead is actionable
      if (lead.grade === 'A+' || lead.grade === 'A') {
        reasons.push('High quality lead');
        actions.push('Prioritize immediate contact');
      }

      if (lead.currentState === 'NEGOTIATING') {
        reasons.push('In negotiation stage');
        actions.push('Schedule follow-up call');
      } else if (lead.currentState === 'ENGAGED') {
        reasons.push('Currently engaged');
        actions.push('Send proposal or demo invite');
      } else if (lead.currentState === 'OUTREACH') {
        reasons.push('Active outreach');
        actions.push('Continue nurturing sequence');
      }

      if (lead.daysInState >= 7) {
        reasons.push(`${Math.round(lead.daysInState)} days in current state`);
        actions.push('Check in to move forward');
      }

      if (lead.engagementScore >= 80) {
        reasons.push('High engagement');
        actions.push('Capitalize on interest');
      }

      return {
        ...lead,
        mostActionableReason: reasons.join(' • ') || 'Standard follow-up',
        recommendedActions: actions.length > 0 ? actions : ['Standard outreach']
      };
    });
  }

  /**
   * Get personalized lead queue for a user
   */
  async getLeadQueue(userId, limit = 20, filters = {}) {
    // This would integrate with user assignments/territories
    // For now, return top leads
    return this.getMostActionable(limit, filters);
  }

  /**
   * Batch calculate priority scores
   */
  async batchCalculatePriority(opportunityIds, options = {}) {
    const { concurrency = 10 } = options;
    const results = [];

    for (let i = 0; i < opportunityIds.length; i += concurrency) {
      const batch = opportunityIds.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(id => this.calculatePriorityScore(id))
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
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default PriorityRankingService;
