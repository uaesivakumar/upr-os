/**
 * Lifecycle Journey Tracking
 * Enhanced tracking of complete opportunity journey with multi-touch attribution
 */

import pg from 'pg';
const { Pool } = pg;

export class LifecycleJourneyTracking {
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
   * Record a touchpoint
   */
  async recordTouchpoint(touchpoint) {
    const {
      opportunityId,
      touchpointType,
      channel,
      outcome = 'neutral',
      contentSummary = '',
      metadata = {}
    } = touchpoint;

    const query = `
      INSERT INTO opportunity_touchpoints (
        opportunity_id,
        touchpoint_type,
        channel,
        outcome,
        content_summary,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      opportunityId,
      touchpointType,
      channel,
      outcome,
      contentSummary,
      JSON.stringify(metadata)
    ]);

    return {
      touchpointId: result.rows[0].id,
      opportunityId: result.rows[0].opportunity_id,
      touchpointType: result.rows[0].touchpoint_type,
      occurredAt: result.rows[0].occurred_at
    };
  }

  /**
   * Get journey timeline for an opportunity
   */
  async getJourneyTimeline(opportunityId) {
    const query = `
      WITH lifecycle_events AS (
        SELECT
          'lifecycle' as event_type,
          id,
          state as event_name,
          sub_state as event_detail,
          entered_at as occurred_at,
          trigger_type,
          trigger_reason,
          metadata
        FROM opportunity_lifecycle
        WHERE opportunity_id = $1
      ),
      touchpoint_events AS (
        SELECT
          'touchpoint' as event_type,
          id,
          touchpoint_type as event_name,
          outcome as event_detail,
          occurred_at,
          channel as trigger_type,
          content_summary as trigger_reason,
          metadata
        FROM opportunity_touchpoints
        WHERE opportunity_id = $1
      )
      SELECT * FROM lifecycle_events
      UNION ALL
      SELECT * FROM touchpoint_events
      ORDER BY occurred_at ASC
    `;

    const result = await this.pool.query(query, [opportunityId]);

    return result.rows.map(row => ({
      eventType: row.event_type,
      eventId: row.id,
      eventName: row.event_name,
      eventDetail: row.event_detail,
      occurredAt: row.occurred_at,
      trigger: {
        type: row.trigger_type,
        reason: row.trigger_reason
      },
      metadata: row.metadata
    }));
  }

  /**
   * Calculate attribution weights using specified model
   */
  async calculateAttribution(opportunityId, model = 'linear') {
    const query = `SELECT * FROM get_attribution_weights($1, $2)`;
    const result = await this.pool.query(query, [opportunityId, model]);

    // Update touchpoints with weights
    for (const row of result.rows) {
      await this.pool.query(
        'UPDATE opportunity_touchpoints SET attribution_weight = $1 WHERE id = $2',
        [row.weight, row.touchpoint_id]
      );
    }

    return result.rows.map(row => ({
      touchpointId: row.touchpoint_id,
      weight: parseFloat(row.weight)
    }));
  }

  /**
   * Analyze channel effectiveness
   */
  async analyzeChannelEffectiveness(filters = {}) {
    const query = `
      WITH channel_touchpoints AS (
        SELECT
          t.channel,
          COUNT(*) as total_touchpoints,
          COUNT(DISTINCT t.opportunity_id) as unique_opportunities,
          COUNT(*) FILTER (WHERE t.outcome = 'positive') as positive_outcomes,
          COUNT(*) FILTER (WHERE t.outcome = 'response') as responses,
          AVG(t.attribution_weight) as avg_attribution_weight,
          COUNT(DISTINCT CASE WHEN ol.state = 'CLOSED' AND ol.sub_state = 'WON'
            THEN t.opportunity_id END) as led_to_wins
        FROM opportunity_touchpoints t
        LEFT JOIN opportunity_lifecycle ol
          ON t.opportunity_id = ol.opportunity_id AND ol.state = 'CLOSED'
        GROUP BY t.channel
      )
      SELECT
        channel,
        total_touchpoints,
        unique_opportunities,
        positive_outcomes,
        responses,
        ROUND(avg_attribution_weight::numeric, 4) as avg_attribution,
        led_to_wins,
        CASE WHEN total_touchpoints > 0
          THEN ROUND((positive_outcomes::numeric / total_touchpoints) * 100, 2)
          ELSE 0
        END as positive_rate,
        CASE WHEN unique_opportunities > 0
          THEN ROUND((led_to_wins::numeric / unique_opportunities) * 100, 2)
          ELSE 0
        END as win_contribution
      FROM channel_touchpoints
      ORDER BY total_touchpoints DESC
    `;

    const result = await this.pool.query(query);

    return result.rows.map(row => ({
      channel: row.channel,
      totalTouchpoints: parseInt(row.total_touchpoints),
      uniqueOpportunities: parseInt(row.unique_opportunities),
      positiveOutcomes: parseInt(row.positive_outcomes),
      responses: parseInt(row.responses),
      avgAttribution: parseFloat(row.avg_attribution) || 0,
      ledToWins: parseInt(row.led_to_wins),
      positiveRate: parseFloat(row.positive_rate),
      winContribution: parseFloat(row.win_contribution)
    }));
  }

  /**
   * Get engagement score for an opportunity
   */
  async getEngagementScore(opportunityId) {
    const query = `SELECT calculate_engagement_score($1) as score`;
    const result = await this.pool.query(query, [opportunityId]);
    return parseInt(result.rows[0].score) || 0;
  }

  /**
   * Export journey for reporting
   */
  async exportJourney(opportunityId, format = 'json') {
    const timeline = await this.getJourneyTimeline(opportunityId);
    const channelAnalysis = await this.analyzeChannelEffectiveness();

    const journey = {
      opportunityId,
      timeline,
      summary: {
        totalEvents: timeline.length,
        lifecycleStates: timeline.filter(e => e.eventType === 'lifecycle').length,
        touchpoints: timeline.filter(e => e.eventType === 'touchpoint').length,
        channels: [...new Set(timeline.map(e => e.trigger.type))],
        duration: timeline.length > 0
          ? Math.round((new Date(timeline[timeline.length - 1].occurredAt) -
              new Date(timeline[0].occurredAt)) / (1000 * 60 * 60 * 24))
          : 0
      },
      channelEffectiveness: channelAnalysis
    };

    if (format === 'json') {
      return JSON.stringify(journey, null, 2);
    } else if (format === 'object') {
      return journey;
    }

    return journey;
  }

  /**
   * Get journey summary for multiple opportunities
   */
  async getJourneySummaries(options = {}) {
    const { limit = 50, offset = 0 } = options;

    const query = `
      SELECT * FROM opportunity_journey_summary
      ORDER BY journey_started DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await this.pool.query(query, [limit, offset]);

    return result.rows.map(row => ({
      opportunityId: row.opportunity_id,
      journeyStarted: row.journey_started,
      lastStateChange: row.last_state_change,
      statesVisited: parseInt(row.states_visited),
      totalTransitions: parseInt(row.total_transitions),
      currentState: row.current_state,
      touchpointCount: parseInt(row.touchpoint_count),
      compositeScore: row.composite_score ? parseInt(row.composite_score) : null,
      winProbability: row.win_probability ? parseFloat(row.win_probability) : null,
      churnRisk: row.churn_risk
    }));
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default LifecycleJourneyTracking;
