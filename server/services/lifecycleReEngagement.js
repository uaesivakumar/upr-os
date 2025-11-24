/**
 * Lifecycle Re-Engagement Service
 * Automatically detects and re-engages dormant opportunities
 */

import pg from 'pg';
const { Pool } = pg;

export class LifecycleReEngagement {
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
   * Identify re-engagement candidates based on time dormant
   */
  async identifyReEngagementCandidates(options = {}) {
    const { minDaysDormant = 60, maxDaysDormant = null } = options;

    const query = `
      WITH current_dormant AS (
        SELECT DISTINCT ON (opportunity_id)
          opportunity_id,
          state,
          entered_at,
          EXTRACT(EPOCH FROM (NOW() - entered_at)) / 86400 as days_dormant
        FROM opportunity_lifecycle
        WHERE state = 'DORMANT'
        ORDER BY opportunity_id, entered_at DESC
      ),
      recent_attempts AS (
        SELECT
          opportunity_id,
          MAX(attempted_at) as last_attempt,
          COUNT(*) as attempt_count
        FROM re_engagement_attempts
        WHERE attempted_at >= NOW() - INTERVAL '30 days'
        GROUP BY opportunity_id
      )
      SELECT
        cd.opportunity_id,
        cd.days_dormant,
        cd.entered_at as dormant_since,
        ra.last_attempt,
        COALESCE(ra.attempt_count, 0) as recent_attempt_count,
        CASE
          WHEN cd.days_dormant >= 120 THEN 'critical'
          WHEN cd.days_dormant >= 90 THEN 'high'
          WHEN cd.days_dormant >= 60 THEN 'medium'
          ELSE 'low'
        END as priority
      FROM current_dormant cd
      LEFT JOIN recent_attempts ra ON cd.opportunity_id = ra.opportunity_id
      WHERE cd.days_dormant >= $1
        ${maxDaysDormant ? 'AND cd.days_dormant <= $2' : ''}
      ORDER BY cd.days_dormant DESC
    `;

    const params = maxDaysDormant ? [minDaysDormant, maxDaysDormant] : [minDaysDormant];
    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      opportunityId: row.opportunity_id,
      daysDormant: parseFloat(row.days_dormant),
      dormantSince: row.dormant_since,
      lastAttempt: row.last_attempt,
      recentAttemptCount: parseInt(row.recent_attempt_count),
      priority: row.priority
    }));
  }

  /**
   * Get recommended re-engagement template based on days dormant
   */
  getReEngagementTemplate(daysDormant) {
    if (daysDormant >= 120) {
      return {
        name: 'final_touch',
        subject: 'One last check-in',
        description: 'Final attempt before archiving',
        delay: 0
      };
    } else if (daysDormant >= 90) {
      return {
        name: 'value_add_content',
        subject: 'Thought you might find this useful',
        description: 'Share relevant industry insights or case studies',
        delay: 0
      };
    } else if (daysDormant >= 60) {
      return {
        name: 'gentle_checkin',
        subject: 'Just checking in',
        description: 'Soft re-engagement to gauge interest',
        delay: 0
      };
    } else {
      return {
        name: 'status_update',
        subject: "Haven't heard from you in a while",
        description: 'Ask if timing is better now',
        delay: 7 // Wait 7 days for recent dormant
      };
    }
  }

  /**
   * Schedule re-engagement outreach
   */
  async scheduleReEngagementOutreach(opportunityId, templateName, options = {}) {
    const {
      channel = 'email',
      scheduledFor = null,
      metadata = {}
    } = options;

    // Record the scheduled attempt
    const query = `
      INSERT INTO re_engagement_attempts (
        opportunity_id,
        attempted_at,
        template_used,
        channel,
        outcome,
        metadata
      ) VALUES ($1, COALESCE($2, NOW()), $3, $4, 'scheduled', $5)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      opportunityId,
      scheduledFor,
      templateName,
      channel,
      JSON.stringify(metadata)
    ]);

    return {
      attemptId: result.rows[0].id,
      opportunityId: result.rows[0].opportunity_id,
      attemptedAt: result.rows[0].attempted_at,
      template: templateName,
      channel,
      outcome: 'scheduled'
    };
  }

  /**
   * Execute re-engagement for a single opportunity
   */
  async executeReEngagement(opportunityId, options = {}) {
    // Get current state
    const stateQuery = `
      SELECT DISTINCT ON (opportunity_id)
        state,
        entered_at,
        EXTRACT(EPOCH FROM (NOW() - entered_at)) / 86400 as days_dormant
      FROM opportunity_lifecycle
      WHERE opportunity_id = $1
      ORDER BY opportunity_id, entered_at DESC
    `;

    const stateResult = await this.pool.query(stateQuery, [opportunityId]);

    if (stateResult.rows.length === 0) {
      throw new Error(`Opportunity ${opportunityId} not found`);
    }

    const { state, days_dormant } = stateResult.rows[0];

    if (state !== 'DORMANT') {
      return {
        success: false,
        message: `Opportunity is in ${state} state, not DORMANT`
      };
    }

    const daysDormant = parseFloat(days_dormant);

    // Get recommended template
    const template = this.getReEngagementTemplate(daysDormant);

    // Schedule the outreach
    const attempt = await this.scheduleReEngagementOutreach(
      opportunityId,
      template.name,
      options
    );

    return {
      success: true,
      opportunityId,
      daysDormant,
      template: template.name,
      attemptId: attempt.attemptId,
      scheduledFor: attempt.attemptedAt
    };
  }

  /**
   * Track re-engagement response
   */
  async trackReEngagementResponse(attemptId, outcome, options = {}) {
    const { responseAt = new Date(), metadata = {} } = options;

    const query = `
      UPDATE re_engagement_attempts
      SET
        response_received = $1,
        response_at = $2,
        outcome = $3,
        metadata = metadata || $4::jsonb
      WHERE id = $5
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      outcome === 'responded' || outcome === 'converted',
      responseAt,
      outcome,
      JSON.stringify(metadata),
      attemptId
    ]);

    if (result.rows.length === 0) {
      throw new Error(`Attempt ${attemptId} not found`);
    }

    return {
      attemptId: result.rows[0].id,
      opportunityId: result.rows[0].opportunity_id,
      outcome: result.rows[0].outcome,
      responseAt: result.rows[0].response_at
    };
  }

  /**
   * Get re-engagement statistics
   */
  async getReEngagementStats(options = {}) {
    const { startDate, endDate } = options;

    let query = `
      WITH stats AS (
        SELECT
          COUNT(*) as total_attempts,
          COUNT(*) FILTER (WHERE response_received = TRUE) as responses,
          COUNT(*) FILTER (WHERE outcome = 'converted') as conversions,
          COUNT(*) FILTER (WHERE outcome = 'opted_out') as opt_outs,
          COUNT(DISTINCT opportunity_id) as unique_opportunities,
          AVG(EXTRACT(EPOCH FROM (response_at - attempted_at)) / 3600)
            FILTER (WHERE response_at IS NOT NULL) as avg_response_hours
        FROM re_engagement_attempts
        WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (startDate) {
      query += ` AND attempted_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND attempted_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    query += `
      )
      SELECT
        total_attempts,
        responses,
        conversions,
        opt_outs,
        unique_opportunities,
        CASE WHEN total_attempts > 0
          THEN ROUND((responses::numeric / total_attempts) * 100, 2)
          ELSE 0
        END as response_rate,
        CASE WHEN total_attempts > 0
          THEN ROUND((conversions::numeric / total_attempts) * 100, 2)
          ELSE 0
        END as conversion_rate,
        ROUND(avg_response_hours::numeric, 1) as avg_response_hours
      FROM stats
    `;

    const result = await this.pool.query(query, params);

    if (result.rows.length === 0) {
      return {
        totalAttempts: 0,
        responses: 0,
        conversions: 0,
        optOuts: 0,
        uniqueOpportunities: 0,
        responseRate: 0,
        conversionRate: 0,
        avgResponseHours: 0
      };
    }

    const row = result.rows[0];
    return {
      totalAttempts: parseInt(row.total_attempts),
      responses: parseInt(row.responses),
      conversions: parseInt(row.conversions),
      optOuts: parseInt(row.opt_outs),
      uniqueOpportunities: parseInt(row.unique_opportunities),
      responseRate: parseFloat(row.response_rate),
      conversionRate: parseFloat(row.conversion_rate),
      avgResponseHours: parseFloat(row.avg_response_hours) || 0
    };
  }

  /**
   * Batch process re-engagement for multiple opportunities
   */
  async batchReEngage(options = {}) {
    const {
      minDaysDormant = 60,
      limit = 50,
      dryRun = false
    } = options;

    const candidates = await this.identifyReEngagementCandidates({
      minDaysDormant
    });

    const candidatesToProcess = candidates.slice(0, limit);

    if (dryRun) {
      return {
        dryRun: true,
        candidatesFound: candidates.length,
        wouldProcess: candidatesToProcess.length,
        candidates: candidatesToProcess
      };
    }

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (const candidate of candidatesToProcess) {
      try {
        const result = await this.executeReEngagement(candidate.opportunityId);
        results.push(result);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        results.push({
          success: false,
          opportunityId: candidate.opportunityId,
          error: error.message
        });
        failureCount++;
      }
    }

    return {
      dryRun: false,
      candidatesFound: candidates.length,
      processed: candidatesToProcess.length,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Get re-engagement history for an opportunity
   */
  async getReEngagementHistory(opportunityId) {
    const query = `
      SELECT *
      FROM re_engagement_attempts
      WHERE opportunity_id = $1
      ORDER BY attempted_at DESC
    `;

    const result = await this.pool.query(query, [opportunityId]);

    return result.rows.map(row => ({
      attemptId: row.id,
      attemptedAt: row.attempted_at,
      template: row.template_used,
      channel: row.channel,
      responseReceived: row.response_received,
      responseAt: row.response_at,
      outcome: row.outcome,
      metadata: row.metadata
    }));
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default LifecycleReEngagement;
