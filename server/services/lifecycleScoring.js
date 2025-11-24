/**
 * Lifecycle Scoring Service
 * Calculates engagement, velocity, quality, and composite scores for opportunities
 */

import pg from 'pg';
const { Pool } = pg;

export class LifecycleScoring {
  constructor(connectionConfig = null) {
    // Accept either connection string or config object
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
  }

  /**
   * Calculate engagement score (0-100)
   * Based on activity frequency, response time, meetings, content engagement
   */
  async calculateEngagementScore(opportunityId) {
    let score = 50; // Base score

    // Get touchpoint data
    const touchpointQuery = `
      WITH response_times AS (
        SELECT
          EXTRACT(EPOCH FROM (
            LEAD(occurred_at) OVER (ORDER BY occurred_at) - occurred_at
          )) / 3600 as hours_to_next
        FROM opportunity_touchpoints
        WHERE opportunity_id = $1
      )
      SELECT
        COUNT(*) as total_touchpoints,
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '30 days') as recent_touchpoints,
        COUNT(*) FILTER (WHERE touchpoint_type = 'meeting') as meetings,
        COUNT(*) FILTER (WHERE touchpoint_type = 'email' AND outcome = 'response') as email_responses,
        COUNT(*) FILTER (WHERE outcome = 'positive') as positive_outcomes,
        (SELECT AVG(hours_to_next) FROM response_times WHERE hours_to_next IS NOT NULL) as avg_response_hours
      FROM opportunity_touchpoints
      WHERE opportunity_id = $1
    `;

    const result = await this.pool.query(touchpointQuery, [opportunityId]);

    if (result.rows.length === 0 || result.rows[0].total_touchpoints === 0) {
      return 50; // Default score for no activity
    }

    const {
      total_touchpoints,
      recent_touchpoints,
      meetings,
      email_responses,
      positive_outcomes,
      avg_response_hours
    } = result.rows[0];

    // Activity frequency: +10 per touchpoint (max +30)
    score += Math.min(parseInt(total_touchpoints) * 2, 30);

    // Recent activity: +15 for recent engagement
    if (parseInt(recent_touchpoints) > 0) {
      score += Math.min(parseInt(recent_touchpoints) * 3, 15);
    }

    // Meetings: +20 per meeting attended (max +20)
    score += Math.min(parseInt(meetings) * 10, 20);

    // Email responses: +15 for responsiveness
    if (parseInt(email_responses) > 0) {
      score += Math.min(parseInt(email_responses) * 5, 15);
    }

    // Positive outcomes: +15 for positive interactions
    if (parseInt(positive_outcomes) > 0) {
      score += Math.min(parseInt(positive_outcomes) * 5, 15);
    }

    // Fast response time: +10 for quick responses (< 24h avg)
    if (avg_response_hours && parseFloat(avg_response_hours) < 24) {
      score += 10;
    } else if (avg_response_hours && parseFloat(avg_response_hours) > 72) {
      score -= 5; // Penalty for slow responses
    }

    // Cap at 100
    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Calculate velocity score (0-100)
   * Based on speed of progression through states
   */
  async calculateVelocityScore(opportunityId) {
    let score = 50; // Base score

    // Get transition history
    const transitionQuery = `
      WITH transitions AS (
        SELECT
          state,
          entered_at,
          exited_at,
          EXTRACT(EPOCH FROM (
            COALESCE(exited_at, NOW()) - entered_at
          )) / 86400 as days_in_state,
          LAG(state) OVER (ORDER BY entered_at) as previous_state
        FROM opportunity_lifecycle
        WHERE opportunity_id = $1
        ORDER BY entered_at
      ),
      state_averages AS (
        SELECT
          state,
          AVG(EXTRACT(EPOCH FROM (
            COALESCE(exited_at, NOW()) - entered_at
          )) / 86400) as avg_days
        FROM opportunity_lifecycle
        WHERE exited_at IS NOT NULL
        GROUP BY state
      )
      SELECT
        t.state,
        t.days_in_state,
        t.previous_state,
        sa.avg_days,
        CASE
          WHEN t.days_in_state < sa.avg_days THEN 'fast'
          WHEN t.days_in_state > sa.avg_days * 1.5 THEN 'slow'
          ELSE 'average'
        END as velocity_category
      FROM transitions t
      LEFT JOIN state_averages sa ON t.state = sa.state
      WHERE t.exited_at IS NOT NULL
    `;

    const result = await this.pool.query(transitionQuery, [opportunityId]);

    if (result.rows.length === 0) {
      return 50; // Default for new opportunities
    }

    let fastTransitions = 0;
    let slowTransitions = 0;
    let forwardMoves = 0;
    let backwardMoves = 0;

    const stateOrder = {
      'DISCOVERED': 1,
      'QUALIFIED': 2,
      'OUTREACH': 3,
      'ENGAGED': 4,
      'NEGOTIATING': 5,
      'CLOSED': 6
    };

    result.rows.forEach(row => {
      // Count fast/slow transitions
      if (row.velocity_category === 'fast') {
        fastTransitions++;
      } else if (row.velocity_category === 'slow') {
        slowTransitions++;
      }

      // Count forward/backward moves
      if (row.previous_state && stateOrder[row.state] && stateOrder[row.previous_state]) {
        if (stateOrder[row.state] > stateOrder[row.previous_state]) {
          forwardMoves++;
        } else if (stateOrder[row.state] < stateOrder[row.previous_state]) {
          backwardMoves++;
        }
      }
    });

    // Fast transitions: +20 each (max +40)
    score += Math.min(fastTransitions * 20, 40);

    // Slow transitions: -10 each (max -30)
    score -= Math.min(slowTransitions * 10, 30);

    // Forward momentum: +15 per forward move (max +30)
    score += Math.min(forwardMoves * 15, 30);

    // Backward moves: -20 each
    score -= backwardMoves * 20;

    // Cap at 0-100
    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Get quality score (from existing quality evaluation)
   * This should integrate with Sprint 22's quality scoring
   */
  async getQualityScore(opportunityId) {
    // For now, return a simulated score
    // In production, this should call the quality evaluation service
    // from Sprint 22: evaluateCompanyQuality

    // Placeholder: calculate based on available data
    const query = `
      SELECT metadata
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1
        AND metadata->>'quality_score' IS NOT NULL
      ORDER BY entered_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [opportunityId]);

    if (result.rows.length > 0 && result.rows[0].metadata?.quality_score) {
      return parseInt(result.rows[0].metadata.quality_score);
    }

    // Default quality score if not available
    return 70;
  }

  /**
   * Calculate composite lifecycle score (0-100)
   * Weighted combination: Engagement 40%, Velocity 30%, Quality 30%
   */
  async calculateCompositeScore(opportunityId) {
    const [engagement, velocity, quality] = await Promise.all([
      this.calculateEngagementScore(opportunityId),
      this.calculateVelocityScore(opportunityId),
      this.getQualityScore(opportunityId)
    ]);

    const composite = Math.round(
      (engagement * 0.40) +
      (velocity * 0.30) +
      (quality * 0.30)
    );

    return {
      engagementScore: engagement,
      velocityScore: velocity,
      qualityScore: quality,
      compositeScore: composite
    };
  }

  /**
   * Predict time to close based on current velocity and state
   */
  async predictTimeToClose(opportunityId) {
    // Get current state
    const stateQuery = `
      SELECT state, entered_at
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1
      ORDER BY entered_at DESC
      LIMIT 1
    `;
    const stateResult = await this.pool.query(stateQuery, [opportunityId]);

    if (stateResult.rows.length === 0) {
      return null;
    }

    const currentState = stateResult.rows[0].state;

    if (currentState === 'CLOSED') {
      return { estimatedDays: 0, estimatedDate: new Date() };
    }

    // Get average time from current state to CLOSED.WON
    const avgQuery = `
      WITH journeys AS (
        SELECT
          ol1.opportunity_id,
          ol1.entered_at as state_entered,
          ol2.entered_at as closed_at,
          EXTRACT(EPOCH FROM (ol2.entered_at - ol1.entered_at)) / 86400 as days_to_close
        FROM opportunity_lifecycle ol1
        JOIN opportunity_lifecycle ol2
          ON ol1.opportunity_id = ol2.opportunity_id
        WHERE ol1.state = $1
          AND ol2.state = 'CLOSED'
          AND ol2.sub_state = 'WON'
      )
      SELECT
        AVG(days_to_close) as avg_days,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_to_close) as median_days
      FROM journeys
    `;

    const avgResult = await this.pool.query(avgQuery, [currentState]);

    if (avgResult.rows.length === 0 || !avgResult.rows[0].avg_days) {
      // Default estimates based on state
      const defaultDays = {
        'DISCOVERED': 90,
        'QUALIFIED': 75,
        'OUTREACH': 60,
        'ENGAGED': 45,
        'NEGOTIATING': 20,
        'DORMANT': 120
      };

      const estimatedDays = defaultDays[currentState] || 60;
      const estimatedDate = new Date();
      estimatedDate.setDate(estimatedDate.getDate() + estimatedDays);

      return { estimatedDays, estimatedDate };
    }

    const estimatedDays = Math.round(parseFloat(avgResult.rows[0].median_days));
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + estimatedDays);

    return { estimatedDays, estimatedDate };
  }

  /**
   * Predict win probability based on scores and historical data
   */
  async predictWinProbability(opportunityId) {
    const scores = await this.calculateCompositeScore(opportunityId);

    // Get current state
    const stateQuery = `
      SELECT state, sub_state
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1
      ORDER BY entered_at DESC
      LIMIT 1
    `;
    const stateResult = await this.pool.query(stateQuery, [opportunityId]);

    if (stateResult.rows.length === 0) {
      return 0;
    }

    const currentState = stateResult.rows[0].state;
    const subState = stateResult.rows[0].sub_state;

    // If already closed, return definitive probability
    if (currentState === 'CLOSED') {
      return subState === 'WON' ? 100 : 0;
    }

    // Base probability based on state
    const stateProbability = {
      'DISCOVERED': 10,
      'QUALIFIED': 20,
      'OUTREACH': 30,
      'ENGAGED': 50,
      'NEGOTIATING': 75,
      'DORMANT': 5
    };

    let probability = stateProbability[currentState] || 20;

    // Adjust based on composite score
    const scoreAdjustment = (scores.compositeScore - 50) * 0.5;
    probability += scoreAdjustment;

    // Cap at 0-100
    return Math.min(Math.max(Math.round(probability), 0), 100);
  }

  /**
   * Identify churn risk (low/medium/high)
   */
  async identifyChurnRisk(opportunityId) {
    const scores = await this.calculateCompositeScore(opportunityId);

    // Get time in current state
    const stateQuery = `
      SELECT
        state,
        EXTRACT(EPOCH FROM (NOW() - entered_at)) / 86400 as days_in_state
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1
      ORDER BY entered_at DESC
      LIMIT 1
    `;
    const result = await this.pool.query(stateQuery, [opportunityId]);

    if (result.rows.length === 0) {
      return 'medium';
    }

    const { state, days_in_state } = result.rows[0];
    const daysInState = parseFloat(days_in_state);

    // High risk conditions
    if (state === 'DORMANT') {
      return 'high';
    }

    if (scores.compositeScore < 40) {
      return 'high';
    }

    if (daysInState > 45 && state !== 'CLOSED') {
      return 'high';
    }

    // Medium risk conditions
    if (scores.compositeScore < 60) {
      return 'medium';
    }

    if (daysInState > 30 && state !== 'CLOSED' && state !== 'NEGOTIATING') {
      return 'medium';
    }

    // Low risk
    return 'low';
  }

  /**
   * Score a single opportunity and save to database
   */
  async scoreOpportunity(opportunityId) {
    const scores = await this.calculateCompositeScore(opportunityId);
    const timeToClose = await this.predictTimeToClose(opportunityId);
    const winProbability = await this.predictWinProbability(opportunityId);
    const churnRisk = await this.identifyChurnRisk(opportunityId);

    // Save to database
    const upsertQuery = `
      INSERT INTO lifecycle_scores (
        opportunity_id,
        engagement_score,
        velocity_score,
        quality_score,
        composite_score,
        win_probability,
        estimated_close_date,
        churn_risk,
        calculated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (opportunity_id)
      DO UPDATE SET
        engagement_score = EXCLUDED.engagement_score,
        velocity_score = EXCLUDED.velocity_score,
        quality_score = EXCLUDED.quality_score,
        composite_score = EXCLUDED.composite_score,
        win_probability = EXCLUDED.win_probability,
        estimated_close_date = EXCLUDED.estimated_close_date,
        churn_risk = EXCLUDED.churn_risk,
        calculated_at = NOW()
    `;

    await this.pool.query(upsertQuery, [
      opportunityId,
      scores.engagementScore,
      scores.velocityScore,
      scores.qualityScore,
      scores.compositeScore,
      winProbability,
      timeToClose?.estimatedDate || null,
      churnRisk
    ]);

    return {
      opportunityId,
      ...scores,
      winProbability,
      estimatedCloseDate: timeToClose?.estimatedDate,
      estimatedDaysToClose: timeToClose?.estimatedDays,
      churnRisk,
      calculatedAt: new Date()
    };
  }

  /**
   * Score all active opportunities
   */
  async scoreAllOpportunities(options = {}) {
    const { limit = 100, offset = 0 } = options;

    // Get all active opportunities (not CLOSED)
    const query = `
      SELECT DISTINCT opportunity_id
      FROM opportunity_lifecycle
      WHERE opportunity_id NOT IN (
        SELECT opportunity_id
        FROM opportunity_lifecycle
        WHERE state = 'CLOSED'
      )
      LIMIT $1 OFFSET $2
    `;

    const result = await this.pool.query(query, [limit, offset]);

    const scoringResults = [];
    let successCount = 0;
    let failureCount = 0;

    for (const row of result.rows) {
      try {
        const scores = await this.scoreOpportunity(row.opportunity_id);
        scoringResults.push(scores);
        successCount++;
      } catch (error) {
        console.error(`Failed to score opportunity ${row.opportunity_id}:`, error.message);
        failureCount++;
      }
    }

    return {
      totalProcessed: result.rows.length,
      successCount,
      failureCount,
      results: scoringResults
    };
  }

  /**
   * Get high-risk opportunities
   */
  async getHighRiskOpportunities() {
    const query = `
      SELECT
        ls.*,
        (SELECT state FROM opportunity_lifecycle
         WHERE opportunity_id = ls.opportunity_id
         ORDER BY entered_at DESC LIMIT 1) as current_state
      FROM lifecycle_scores ls
      WHERE churn_risk = 'high'
        AND opportunity_id NOT IN (
          SELECT opportunity_id FROM opportunity_lifecycle WHERE state = 'CLOSED'
        )
      ORDER BY composite_score ASC
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Get top scoring opportunities
   */
  async getTopOpportunities(limit = 10) {
    const query = `
      SELECT
        ls.*,
        (SELECT state FROM opportunity_lifecycle
         WHERE opportunity_id = ls.opportunity_id
         ORDER BY entered_at DESC LIMIT 1) as current_state
      FROM lifecycle_scores ls
      WHERE opportunity_id NOT IN (
        SELECT opportunity_id FROM opportunity_lifecycle WHERE state = 'CLOSED'
      )
      ORDER BY composite_score DESC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);
    return result.rows;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default LifecycleScoring;
