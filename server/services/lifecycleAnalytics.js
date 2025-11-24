/**
 * Lifecycle Analytics Service
 * Advanced analytics for strategic decision-making
 */

import pg from 'pg';
const { Pool } = pg;

export class LifecycleAnalytics {
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
   * Cohort analysis - group opportunities by discovery date
   */
  async analyzeCohorts(options = {}) {
    const { groupBy = 'week', limit = 12 } = options; // Default to last 12 weeks

    const dateFormat = {
      'day': 'YYYY-MM-DD',
      'week': 'IYYY-IW',
      'month': 'YYYY-MM',
      'quarter': 'YYYY-Q'
    }[groupBy] || 'IYYY-IW';

    const query = `
      WITH cohorts AS (
        SELECT
          TO_CHAR(entered_at, '${dateFormat}') as cohort,
          opportunity_id,
          entered_at
        FROM opportunity_lifecycle
        WHERE state = 'DISCOVERED'
      ),
      cohort_progression AS (
        SELECT
          c.cohort,
          c.opportunity_id,
          ol.state,
          ol.entered_at as state_entered_at
        FROM cohorts c
        JOIN opportunity_lifecycle ol ON c.opportunity_id = ol.opportunity_id
      )
      SELECT
        cohort,
        COUNT(DISTINCT opportunity_id) as cohort_size,
        COUNT(DISTINCT CASE WHEN state = 'QUALIFIED' THEN opportunity_id END) as qualified,
        COUNT(DISTINCT CASE WHEN state = 'OUTREACH' THEN opportunity_id END) as outreach,
        COUNT(DISTINCT CASE WHEN state = 'ENGAGED' THEN opportunity_id END) as engaged,
        COUNT(DISTINCT CASE WHEN state = 'NEGOTIATING' THEN opportunity_id END) as negotiating,
        COUNT(DISTINCT CASE WHEN state = 'CLOSED' THEN opportunity_id END) as closed,
        COUNT(DISTINCT CASE WHEN state = 'DORMANT' THEN opportunity_id END) as dormant,
        ROUND(
          COUNT(DISTINCT CASE WHEN state = 'QUALIFIED' THEN opportunity_id END)::numeric /
          NULLIF(COUNT(DISTINCT opportunity_id), 0) * 100, 2
        ) as qualified_rate,
        ROUND(
          COUNT(DISTINCT CASE WHEN state = 'CLOSED' THEN opportunity_id END)::numeric /
          NULLIF(COUNT(DISTINCT opportunity_id), 0) * 100, 2
        ) as close_rate
      FROM cohort_progression
      GROUP BY cohort
      ORDER BY cohort DESC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);

    return result.rows.map(row => ({
      cohort: row.cohort,
      cohortSize: parseInt(row.cohort_size),
      qualified: parseInt(row.qualified),
      outreach: parseInt(row.outreach),
      engaged: parseInt(row.engaged),
      negotiating: parseInt(row.negotiating),
      closed: parseInt(row.closed),
      dormant: parseInt(row.dormant),
      qualifiedRate: parseFloat(row.qualified_rate),
      closeRate: parseFloat(row.close_rate)
    }));
  }

  /**
   * Path analysis - identify common transition patterns
   */
  async analyzePaths(options = {}) {
    const { minOccurrences = 5 } = options;

    const query = `
      WITH transitions AS (
        SELECT
          opportunity_id,
          state as from_state,
          LEAD(state) OVER (PARTITION BY opportunity_id ORDER BY entered_at) as to_state
        FROM opportunity_lifecycle
      ),
      paths AS (
        SELECT
          from_state || ' → ' || to_state as path,
          COUNT(*) as occurrence_count,
          AVG(EXTRACT(EPOCH FROM (
            t2.entered_at - t1.exited_at
          )) / 86400) as avg_transition_days
        FROM transitions t
        JOIN opportunity_lifecycle t1
          ON t.opportunity_id = t1.opportunity_id AND t.from_state = t1.state
        JOIN opportunity_lifecycle t2
          ON t.opportunity_id = t2.opportunity_id AND t.to_state = t2.state
          AND t2.entered_at > t1.entered_at
        WHERE t.to_state IS NOT NULL
          AND t1.exited_at IS NOT NULL
        GROUP BY from_state, to_state
        HAVING COUNT(*) >= $1
      ),
      successful_paths AS (
        SELECT
          p.path,
          p.occurrence_count,
          p.avg_transition_days,
          COUNT(DISTINCT CASE WHEN final.state = 'CLOSED' AND final.sub_state = 'WON'
            THEN t.opportunity_id END) as led_to_win,
          COUNT(DISTINCT CASE WHEN final.state = 'CLOSED' AND final.sub_state = 'LOST'
            THEN t.opportunity_id END) as led_to_loss
        FROM paths p
        JOIN transitions t ON p.path = t.from_state || ' → ' || t.to_state
        LEFT JOIN LATERAL (
          SELECT state, sub_state
          FROM opportunity_lifecycle
          WHERE opportunity_id = t.opportunity_id AND state = 'CLOSED'
          LIMIT 1
        ) final ON TRUE
        GROUP BY p.path, p.occurrence_count, p.avg_transition_days
      )
      SELECT
        path,
        occurrence_count,
        ROUND(avg_transition_days::numeric, 2) as avg_transition_days,
        led_to_win,
        led_to_loss,
        CASE WHEN (led_to_win + led_to_loss) > 0
          THEN ROUND((led_to_win::numeric / (led_to_win + led_to_loss)) * 100, 2)
          ELSE NULL
        END as win_rate
      FROM successful_paths
      ORDER BY occurrence_count DESC
    `;

    const result = await this.pool.query(query, [minOccurrences]);

    return result.rows.map(row => ({
      path: row.path,
      occurrenceCount: parseInt(row.occurrence_count),
      avgTransitionDays: parseFloat(row.avg_transition_days) || 0,
      ledToWin: parseInt(row.led_to_win),
      ledToLoss: parseInt(row.led_to_loss),
      winRate: row.win_rate ? parseFloat(row.win_rate) : null
    }));
  }

  /**
   * Detect bottlenecks - states with longest duration or highest drop-off
   */
  async detectBottlenecks() {
    const query = `
      WITH state_metrics AS (
        SELECT
          state,
          COUNT(*) as total_entered,
          AVG(EXTRACT(EPOCH FROM (
            COALESCE(exited_at, NOW()) - entered_at
          )) / 86400) as avg_days_in_state,
          PERCENTILE_CONT(0.90) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (
              COALESCE(exited_at, NOW()) - entered_at
            )) / 86400
          ) as p90_days_in_state,
          COUNT(CASE WHEN exited_at IS NULL THEN 1 END) as currently_in_state
        FROM opportunity_lifecycle
        WHERE state != 'CLOSED'
        GROUP BY state
      ),
      drop_offs AS (
        SELECT
          ol1.state,
          COUNT(DISTINCT ol1.opportunity_id) as entered,
          COUNT(DISTINCT ol2.opportunity_id) as progressed,
          COUNT(DISTINCT ol1.opportunity_id) - COUNT(DISTINCT ol2.opportunity_id) as dropped_off
        FROM opportunity_lifecycle ol1
        LEFT JOIN opportunity_lifecycle ol2
          ON ol1.opportunity_id = ol2.opportunity_id
          AND ol2.entered_at > ol1.entered_at
        WHERE ol1.state != 'CLOSED'
        GROUP BY ol1.state
      )
      SELECT
        sm.state,
        sm.total_entered,
        ROUND(sm.avg_days_in_state::numeric, 2) as avg_days_in_state,
        ROUND(sm.p90_days_in_state::numeric, 2) as p90_days_in_state,
        sm.currently_in_state,
        dropoffs.dropped_off,
        CASE WHEN dropoffs.entered > 0
          THEN ROUND((dropoffs.dropped_off::numeric / dropoffs.entered) * 100, 2)
          ELSE 0
        END as drop_off_rate,
        CASE
          WHEN sm.avg_days_in_state > 30 THEN 'time'
          WHEN (dropoffs.dropped_off::numeric / NULLIF(dropoffs.entered, 0)) > 0.3 THEN 'drop_off'
          ELSE 'normal'
        END as bottleneck_type
      FROM state_metrics sm
      JOIN drop_offs dropoffs ON sm.state = dropoffs.state
      ORDER BY
        CASE
          WHEN sm.avg_days_in_state > 30 THEN 1
          WHEN (dropoffs.dropped_off::numeric / NULLIF(dropoffs.entered, 0)) > 0.3 THEN 2
          ELSE 3
        END,
        sm.avg_days_in_state DESC
    `;

    const result = await this.pool.query(query);

    return result.rows.map(row => ({
      state: row.state,
      totalEntered: parseInt(row.total_entered),
      avgDaysInState: parseFloat(row.avg_days_in_state),
      p90DaysInState: parseFloat(row.p90_days_in_state),
      currentlyInState: parseInt(row.currently_in_state),
      droppedOff: parseInt(row.dropped_off),
      dropOffRate: parseFloat(row.drop_off_rate),
      bottleneckType: row.bottleneck_type,
      isBottleneck: row.bottleneck_type !== 'normal'
    }));
  }

  /**
   * Get performance benchmarks
   */
  async getBenchmarks(filters = {}) {
    const query = `
      WITH overall_metrics AS (
        SELECT
          AVG(EXTRACT(EPOCH FROM (
            closed.entered_at - discovered.entered_at
          )) / 86400) as avg_time_to_close,
          PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (
              closed.entered_at - discovered.entered_at
            )) / 86400
          ) as median_time_to_close,
          COUNT(DISTINCT CASE WHEN closed.sub_state = 'WON' THEN closed.opportunity_id END) as wins,
          COUNT(DISTINCT closed.opportunity_id) as total_closed
        FROM opportunity_lifecycle discovered
        JOIN opportunity_lifecycle closed
          ON discovered.opportunity_id = closed.opportunity_id
        WHERE discovered.state = 'DISCOVERED'
          AND closed.state = 'CLOSED'
          AND closed.sub_state IN ('WON', 'LOST')
      )
      SELECT
        ROUND(avg_time_to_close::numeric, 1) as avg_time_to_close_days,
        ROUND(median_time_to_close::numeric, 1) as median_time_to_close_days,
        wins,
        total_closed,
        CASE WHEN total_closed > 0
          THEN ROUND((wins::numeric / total_closed) * 100, 2)
          ELSE 0
        END as win_rate
      FROM overall_metrics
    `;

    const result = await this.pool.query(query);

    if (result.rows.length === 0) {
      return {
        avgTimeToCloseDays: 0,
        medianTimeToCloseDays: 0,
        wins: 0,
        totalClosed: 0,
        winRate: 0
      };
    }

    const row = result.rows[0];
    return {
      avgTimeToCloseDays: parseFloat(row.avg_time_to_close_days) || 0,
      medianTimeToCloseDays: parseFloat(row.median_time_to_close_days) || 0,
      wins: parseInt(row.wins),
      totalClosed: parseInt(row.total_closed),
      winRate: parseFloat(row.win_rate)
    };
  }

  /**
   * Forecast pipeline progression
   */
  async forecastPipeline(months = 3) {
    // Get historical progression rates
    const query = `
      WITH monthly_progression AS (
        SELECT
          DATE_TRUNC('month', entered_at) as month,
          COUNT(DISTINCT CASE WHEN state = 'DISCOVERED' THEN opportunity_id END) as discovered,
          COUNT(DISTINCT CASE WHEN state = 'QUALIFIED' THEN opportunity_id END) as qualified,
          COUNT(DISTINCT CASE WHEN state = 'CLOSED' AND sub_state = 'WON' THEN opportunity_id END) as won
        FROM opportunity_lifecycle
        WHERE entered_at >= NOW() - INTERVAL '6 months'
        GROUP BY month
        ORDER BY month DESC
      )
      SELECT
        AVG(discovered) as avg_monthly_discovered,
        AVG(qualified) as avg_monthly_qualified,
        AVG(won) as avg_monthly_won,
        CASE WHEN AVG(discovered) > 0
          THEN AVG(qualified) / AVG(discovered)
          ELSE 0
        END as discovery_to_qualified_rate,
        CASE WHEN AVG(qualified) > 0
          THEN AVG(won) / AVG(qualified)
          ELSE 0
        END as qualified_to_won_rate
      FROM monthly_progression
    `;

    const result = await this.pool.query(query);

    if (result.rows.length === 0) {
      return {
        forecastMonths: months,
        projections: []
      };
    }

    const row = result.rows[0];
    const avgDiscovered = parseFloat(row.avg_monthly_discovered) || 0;
    const avgQualified = parseFloat(row.avg_monthly_qualified) || 0;
    const avgWon = parseFloat(row.avg_monthly_won) || 0;
    const discoveryToQualifiedRate = parseFloat(row.discovery_to_qualified_rate) || 0;
    const qualifiedToWonRate = parseFloat(row.qualified_to_won_rate) || 0;

    // Generate forecast
    const projections = [];
    const currentDate = new Date();

    for (let i = 1; i <= months; i++) {
      const forecastDate = new Date(currentDate);
      forecastDate.setMonth(forecastDate.getMonth() + i);

      projections.push({
        month: forecastDate.toISOString().substring(0, 7), // YYYY-MM format
        projectedDiscovered: Math.round(avgDiscovered),
        projectedQualified: Math.round(avgDiscovered * discoveryToQualifiedRate),
        projectedWon: Math.round(avgQualified * qualifiedToWonRate)
      });
    }

    return {
      forecastMonths: months,
      historicalAverages: {
        avgMonthlyDiscovered: Math.round(avgDiscovered),
        avgMonthlyQualified: Math.round(avgQualified),
        avgMonthlyWon: Math.round(avgWon),
        discoveryToQualifiedRate: (discoveryToQualifiedRate * 100).toFixed(2) + '%',
        qualifiedToWonRate: (qualifiedToWonRate * 100).toFixed(2) + '%'
      },
      projections
    };
  }

  /**
   * Get recommendations based on analytics
   */
  async getRecommendations() {
    const [bottlenecks, benchmarks, paths] = await Promise.all([
      this.detectBottlenecks(),
      this.getBenchmarks(),
      this.analyzePaths({ minOccurrences: 3 })
    ]);

    const recommendations = [];

    // Bottleneck recommendations
    const timeBottlenecks = bottlenecks.filter(b => b.bottleneckType === 'time');
    const dropOffBottlenecks = bottlenecks.filter(b => b.bottleneckType === 'drop_off');

    if (timeBottlenecks.length > 0) {
      recommendations.push({
        type: 'bottleneck_time',
        priority: 'high',
        title: `Slow progression in ${timeBottlenecks.map(b => b.state).join(', ')}`,
        description: `Opportunities spend ${timeBottlenecks[0].avgDaysInState.toFixed(1)} days on average in ${timeBottlenecks[0].state}`,
        action: `Review and streamline processes in ${timeBottlenecks[0].state} state`
      });
    }

    if (dropOffBottlenecks.length > 0) {
      recommendations.push({
        type: 'bottleneck_dropoff',
        priority: 'high',
        title: `High drop-off rate in ${dropOffBottlenecks.map(b => b.state).join(', ')}`,
        description: `${dropOffBottlenecks[0].dropOffRate.toFixed(1)}% of opportunities drop off at ${dropOffBottlenecks[0].state}`,
        action: `Investigate and address reasons for drop-off in ${dropOffBottlenecks[0].state}`
      });
    }

    // Win rate recommendations
    if (benchmarks.winRate < 20) {
      recommendations.push({
        type: 'low_win_rate',
        priority: 'critical',
        title: `Low win rate: ${benchmarks.winRate.toFixed(1)}%`,
        description: 'Overall win rate is below industry standard (20%)',
        action: 'Review qualification criteria and sales process'
      });
    }

    // Path recommendations
    const highWinPaths = paths.filter(p => p.winRate && p.winRate > 50);
    if (highWinPaths.length > 0) {
      recommendations.push({
        type: 'successful_path',
        priority: 'info',
        title: 'Successful transition patterns identified',
        description: `Path "${highWinPaths[0].path}" has ${highWinPaths[0].winRate.toFixed(1)}% win rate`,
        action: 'Encourage similar transition patterns in opportunity management'
      });
    }

    return recommendations;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default LifecycleAnalytics;
