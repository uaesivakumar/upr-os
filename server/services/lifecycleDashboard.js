/**
 * Lifecycle Dashboard
 * Provides real-time visual monitoring of lifecycle metrics
 */

import pg from 'pg';
const { Pool } = pg;

export class LifecycleDashboard {
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
   * Get complete dashboard data
   */
  async getDashboardData() {
    const [
      overview,
      stateDistribution,
      conversionFunnel,
      recentTransitions,
      trending,
      alerts
    ] = await Promise.all([
      this.getOverviewMetrics(),
      this.getStateDistribution(),
      this.getConversionFunnel(),
      this.getRecentTransitions(20),
      this.getTrendingMetrics(30),
      this.getAlerts()
    ]);

    return {
      generatedAt: new Date().toISOString(),
      overview,
      stateDistribution,
      conversionFunnel,
      recentTransitions,
      trending,
      alerts
    };
  }

  /**
   * Get overview metrics (cards)
   */
  async getOverviewMetrics() {
    // Total active opportunities (not CLOSED)
    const activeQuery = `
      SELECT COUNT(DISTINCT opportunity_id) as count
      FROM opportunity_lifecycle
      WHERE opportunity_id NOT IN (
        SELECT opportunity_id
        FROM opportunity_lifecycle
        WHERE state = 'CLOSED'
      )
    `;
    const activeResult = await this.pool.query(activeQuery);
    const totalActive = parseInt(activeResult.rows[0].count);

    // Current conversion rate (CLOSED.WON / Total CLOSED) last 30 days
    const conversionQuery = `
      WITH recent_closed AS (
        SELECT
          opportunity_id,
          sub_state
        FROM opportunity_lifecycle
        WHERE state = 'CLOSED'
          AND entered_at >= NOW() - INTERVAL '30 days'
      )
      SELECT
        COUNT(*) FILTER (WHERE sub_state = 'WON') as won,
        COUNT(*) as total
      FROM recent_closed
    `;
    const conversionResult = await this.pool.query(conversionQuery);
    const won = parseInt(conversionResult.rows[0].won) || 0;
    const totalClosed = parseInt(conversionResult.rows[0].total) || 0;
    const conversionRate = totalClosed > 0 ? ((won / totalClosed) * 100).toFixed(2) : 0;

    // Average time to close (DISCOVERED → CLOSED.WON) last 30 days
    const timeToCloseQuery = `
      WITH journey_times AS (
        SELECT
          ol1.opportunity_id,
          ol1.entered_at as discovered_at,
          ol2.entered_at as closed_at,
          EXTRACT(EPOCH FROM (ol2.entered_at - ol1.entered_at)) / 86400 as days_to_close
        FROM opportunity_lifecycle ol1
        JOIN opportunity_lifecycle ol2
          ON ol1.opportunity_id = ol2.opportunity_id
        WHERE ol1.state = 'DISCOVERED'
          AND ol2.state = 'CLOSED'
          AND ol2.sub_state = 'WON'
          AND ol2.entered_at >= NOW() - INTERVAL '30 days'
      )
      SELECT
        ROUND(AVG(days_to_close)::numeric, 1) as avg_days
      FROM journey_times
    `;
    const timeResult = await this.pool.query(timeToCloseQuery);
    const avgTimeToClose = parseFloat(timeResult.rows[0].avg_days) || 0;

    // Win rate last 30 days
    const winRate = conversionRate;

    return {
      totalActiveOpportunities: totalActive,
      currentConversionRate: parseFloat(conversionRate),
      avgTimeToClose: avgTimeToClose,
      winRateLast30Days: parseFloat(winRate)
    };
  }

  /**
   * Get state distribution for pie/donut chart
   */
  async getStateDistribution() {
    const query = `
      WITH current_states AS (
        SELECT DISTINCT ON (opportunity_id)
          opportunity_id,
          state,
          sub_state
        FROM opportunity_lifecycle
        ORDER BY opportunity_id, entered_at DESC
      )
      SELECT
        state,
        sub_state,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
      FROM current_states
      GROUP BY state, sub_state
      ORDER BY count DESC
    `;

    const result = await this.pool.query(query);

    return result.rows.map(row => ({
      state: row.state,
      subState: row.sub_state,
      count: parseInt(row.count),
      percentage: parseFloat(row.percentage)
    }));
  }

  /**
   * Get conversion funnel data
   */
  async getConversionFunnel() {
    const funnelStates = ['DISCOVERED', 'QUALIFIED', 'OUTREACH', 'ENGAGED', 'NEGOTIATING', 'CLOSED'];

    const query = `
      WITH opportunity_max_state AS (
        SELECT
          opportunity_id,
          MAX(CASE
            WHEN state = 'DISCOVERED' THEN 1
            WHEN state = 'QUALIFIED' THEN 2
            WHEN state = 'OUTREACH' THEN 3
            WHEN state = 'ENGAGED' THEN 4
            WHEN state = 'NEGOTIATING' THEN 5
            WHEN state = 'CLOSED' THEN 6
            ELSE 0
          END) as max_stage
        FROM opportunity_lifecycle
        WHERE state = ANY($1)
        GROUP BY opportunity_id
      )
      SELECT
        CASE max_stage
          WHEN 1 THEN 'DISCOVERED'
          WHEN 2 THEN 'QUALIFIED'
          WHEN 3 THEN 'OUTREACH'
          WHEN 4 THEN 'ENGAGED'
          WHEN 5 THEN 'NEGOTIATING'
          WHEN 6 THEN 'CLOSED'
        END as state,
        COUNT(*) as count
      FROM opportunity_max_state
      WHERE max_stage >= 1
      GROUP BY max_stage
      ORDER BY max_stage
    `;

    const result = await this.pool.query(query, [funnelStates]);

    // Calculate drop-off rates
    const funnelData = result.rows.map((row, index, arr) => {
      const count = parseInt(row.count);
      const prevCount = index > 0 ? parseInt(arr[index - 1].count) : count;
      const dropOff = index > 0 ? prevCount - count : 0;
      const dropOffRate = index > 0 ? ((dropOff / prevCount) * 100).toFixed(2) : 0;
      const conversionRate = arr.length > 0
        ? ((count / parseInt(arr[0].count)) * 100).toFixed(2)
        : 100;

      return {
        state: row.state,
        count,
        conversionRate: parseFloat(conversionRate),
        dropOff,
        dropOffRate: parseFloat(dropOffRate)
      };
    });

    return funnelData;
  }

  /**
   * Get recent transitions
   */
  async getRecentTransitions(limit = 20) {
    const query = `
      SELECT
        opportunity_id,
        state,
        sub_state,
        entered_at,
        trigger_type,
        trigger_reason,
        metadata
      FROM opportunity_lifecycle
      ORDER BY entered_at DESC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);

    return result.rows.map(row => ({
      opportunityId: row.opportunity_id,
      state: row.state,
      subState: row.sub_state,
      enteredAt: row.entered_at,
      triggerType: row.trigger_type,
      triggerReason: row.trigger_reason,
      metadata: row.metadata
    }));
  }

  /**
   * Get trending metrics over time
   */
  async getTrendingMetrics(days = 30) {
    const query = `
      WITH daily_stats AS (
        SELECT
          DATE(entered_at) as date,
          COUNT(*) FILTER (WHERE state = 'DISCOVERED') as discovered,
          COUNT(*) FILTER (WHERE state = 'QUALIFIED') as qualified,
          COUNT(*) FILTER (WHERE state = 'CLOSED' AND sub_state = 'WON') as won,
          COUNT(*) FILTER (WHERE state = 'CLOSED' AND sub_state = 'LOST') as lost
        FROM opportunity_lifecycle
        WHERE entered_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(entered_at)
        ORDER BY date
      )
      SELECT
        date,
        discovered,
        qualified,
        won,
        lost,
        CASE WHEN (won + lost) > 0
          THEN ROUND((won::numeric / (won + lost)) * 100, 2)
          ELSE 0
        END as daily_win_rate
      FROM daily_stats
      ORDER BY date
    `;

    const result = await this.pool.query(query);

    return result.rows.map(row => ({
      date: row.date,
      discovered: parseInt(row.discovered),
      qualified: parseInt(row.qualified),
      won: parseInt(row.won),
      lost: parseInt(row.lost),
      dailyWinRate: parseFloat(row.daily_win_rate)
    }));
  }

  /**
   * Get alerts (stalled opportunities, high-value at risk, etc.)
   */
  async getAlerts() {
    const alerts = [];

    // Alert 1: Stalled opportunities (>30 days in one state)
    const stalledQuery = `
      WITH current_states AS (
        SELECT DISTINCT ON (opportunity_id)
          opportunity_id,
          state,
          entered_at,
          EXTRACT(EPOCH FROM (NOW() - entered_at)) / 86400 as days_in_state
        FROM opportunity_lifecycle
        WHERE state != 'CLOSED'
        ORDER BY opportunity_id, entered_at DESC
      )
      SELECT
        COUNT(*) as count,
        json_agg(json_build_object(
          'opportunityId', opportunity_id,
          'state', state,
          'daysInState', ROUND(days_in_state::numeric, 1)
        )) as opportunities
      FROM current_states
      WHERE days_in_state > 30
    `;
    const stalledResult = await this.pool.query(stalledQuery);
    const stalledCount = parseInt(stalledResult.rows[0].count) || 0;

    if (stalledCount > 0) {
      alerts.push({
        type: 'stalled_opportunities',
        severity: 'warning',
        message: `${stalledCount} opportunities stalled for more than 30 days`,
        count: stalledCount,
        opportunities: stalledResult.rows[0].opportunities || []
      });
    }

    // Alert 2: Dormant opportunities ready for re-engagement
    const dormantQuery = `
      WITH dormant_opps AS (
        SELECT DISTINCT ON (opportunity_id)
          opportunity_id,
          entered_at,
          EXTRACT(EPOCH FROM (NOW() - entered_at)) / 86400 as days_dormant
        FROM opportunity_lifecycle
        WHERE state = 'DORMANT'
        ORDER BY opportunity_id, entered_at DESC
      )
      SELECT
        COUNT(*) FILTER (WHERE days_dormant >= 60 AND days_dormant < 90) as ready_for_reengagement,
        COUNT(*) FILTER (WHERE days_dormant >= 90) as critical_reengagement
      FROM dormant_opps
    `;
    const dormantResult = await this.pool.query(dormantQuery);
    const readyCount = parseInt(dormantResult.rows[0].ready_for_reengagement) || 0;
    const criticalCount = parseInt(dormantResult.rows[0].critical_reengagement) || 0;

    if (readyCount > 0) {
      alerts.push({
        type: 're_engagement_ready',
        severity: 'info',
        message: `${readyCount} dormant opportunities ready for re-engagement`,
        count: readyCount
      });
    }

    if (criticalCount > 0) {
      alerts.push({
        type: 're_engagement_critical',
        severity: 'warning',
        message: `${criticalCount} dormant opportunities need urgent re-engagement (90+ days)`,
        count: criticalCount
      });
    }

    // Alert 3: High velocity opportunities (moving fast)
    const highVelocityQuery = `
      WITH recent_transitions AS (
        SELECT
          opportunity_id,
          COUNT(*) as transition_count,
          MAX(entered_at) as last_transition,
          EXTRACT(EPOCH FROM (MAX(entered_at) - MIN(entered_at))) / 86400 as journey_days
        FROM opportunity_lifecycle
        WHERE entered_at >= NOW() - INTERVAL '14 days'
          AND state != 'CLOSED'
        GROUP BY opportunity_id
        HAVING COUNT(*) >= 3
      )
      SELECT COUNT(*) as count
      FROM recent_transitions
      WHERE journey_days <= 7
    `;
    const velocityResult = await this.pool.query(highVelocityQuery);
    const velocityCount = parseInt(velocityResult.rows[0].count) || 0;

    if (velocityCount > 0) {
      alerts.push({
        type: 'high_velocity',
        severity: 'success',
        message: `${velocityCount} opportunities moving fast (3+ transitions in 7 days)`,
        count: velocityCount
      });
    }

    // Alert 4: Opportunities in NEGOTIATING state (need attention)
    const negotiatingQuery = `
      SELECT COUNT(DISTINCT opportunity_id) as count
      FROM opportunity_lifecycle
      WHERE state = 'NEGOTIATING'
        AND opportunity_id NOT IN (
          SELECT opportunity_id FROM opportunity_lifecycle WHERE state = 'CLOSED'
        )
    `;
    const negotiatingResult = await this.pool.query(negotiatingQuery);
    const negotiatingCount = parseInt(negotiatingResult.rows[0].count) || 0;

    if (negotiatingCount > 0) {
      alerts.push({
        type: 'negotiating',
        severity: 'info',
        message: `${negotiatingCount} opportunities in negotiation phase`,
        count: negotiatingCount
      });
    }

    return alerts;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default LifecycleDashboard;
