/**
 * Lifecycle Report Generator
 * Generates comprehensive reports on opportunity lifecycle performance
 */

import pg from 'pg';
const { Pool } = pg;

export class LifecycleReportGenerator {
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
   * Generate state distribution report
   * Shows current count and percentage of opportunities in each state
   */
  async generateStateDistributionReport(options = {}) {
    const { startDate, endDate, industry, size } = options;

    let query = `
      WITH current_states AS (
        SELECT DISTINCT ON (opportunity_id)
          opportunity_id,
          state,
          sub_state,
          entered_at
        FROM opportunity_lifecycle
        ORDER BY opportunity_id, entered_at DESC
      )
      SELECT
        cs.state,
        cs.sub_state,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
      FROM current_states cs
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (startDate) {
      query += ` AND cs.entered_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND cs.entered_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    query += `
      GROUP BY cs.state, cs.sub_state
      ORDER BY count DESC
    `;

    const result = await this.pool.query(query, params);

    return {
      reportType: 'state_distribution',
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate, industry, size },
      data: result.rows,
      summary: {
        totalOpportunities: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
        uniqueStates: result.rows.length
      }
    };
  }

  /**
   * Generate conversion funnel report
   * Shows progression through standard states with drop-off rates
   */
  async generateConversionFunnelReport(options = {}) {
    const { startDate, endDate } = options;

    // Standard funnel states
    const funnelStates = ['DISCOVERED', 'QUALIFIED', 'OUTREACH', 'ENGAGED', 'NEGOTIATING', 'CLOSED'];

    let query = `
      WITH opportunity_states AS (
        SELECT DISTINCT ON (opportunity_id, state)
          opportunity_id,
          state,
          entered_at
        FROM opportunity_lifecycle
        WHERE state = ANY($1)
    `;

    const params = [funnelStates];
    let paramCount = 2;

    if (startDate) {
      query += ` AND entered_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND entered_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    query += `
        ORDER BY opportunity_id, state, entered_at
      ),
      state_counts AS (
        SELECT
          state,
          COUNT(DISTINCT opportunity_id) as count
        FROM opportunity_states
        GROUP BY state
      )
      SELECT
        state,
        count,
        ROUND(count * 100.0 / FIRST_VALUE(count) OVER (ORDER BY
          CASE state
            WHEN 'DISCOVERED' THEN 1
            WHEN 'QUALIFIED' THEN 2
            WHEN 'OUTREACH' THEN 3
            WHEN 'ENGAGED' THEN 4
            WHEN 'NEGOTIATING' THEN 5
            WHEN 'CLOSED' THEN 6
          END
        ), 2) as conversion_rate
      FROM state_counts
      ORDER BY
        CASE state
          WHEN 'DISCOVERED' THEN 1
          WHEN 'QUALIFIED' THEN 2
          WHEN 'OUTREACH' THEN 3
          WHEN 'ENGAGED' THEN 4
          WHEN 'NEGOTIATING' THEN 5
          WHEN 'CLOSED' THEN 6
        END
    `;

    const result = await this.pool.query(query, params);

    // Calculate drop-off rates
    const funnelData = result.rows.map((row, index, arr) => {
      const dropOff = index > 0
        ? arr[index - 1].count - row.count
        : 0;
      const dropOffRate = index > 0
        ? ((dropOff / arr[index - 1].count) * 100).toFixed(2)
        : 0;

      return {
        ...row,
        count: parseInt(row.count),
        conversionRate: parseFloat(row.conversion_rate),
        dropOff,
        dropOffRate: parseFloat(dropOffRate)
      };
    });

    return {
      reportType: 'conversion_funnel',
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate },
      data: funnelData,
      summary: {
        overallConversionRate: funnelData.length > 0
          ? funnelData[funnelData.length - 1].conversionRate
          : 0,
        biggestDropOff: funnelData.reduce((max, row) =>
          row.dropOffRate > max.dropOffRate ? row : max,
          { dropOffRate: 0, state: null }
        )
      }
    };
  }

  /**
   * Generate time-in-state report
   * Shows average, median, and percentile time spent in each state
   */
  async generateTimeInStateReport(options = {}) {
    const { startDate, endDate } = options;

    let query = `
      WITH state_durations AS (
        SELECT
          state,
          EXTRACT(EPOCH FROM (
            COALESCE(exited_at, NOW()) - entered_at
          )) / 86400 as days_in_state
        FROM opportunity_lifecycle
        WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (startDate) {
      query += ` AND entered_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND entered_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    query += `
      )
      SELECT
        state,
        COUNT(*) as transitions,
        ROUND(AVG(days_in_state)::numeric, 2) as avg_days,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_in_state)::numeric, 2) as median_days,
        ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY days_in_state)::numeric, 2) as p90_days,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY days_in_state)::numeric, 2) as p95_days,
        ROUND(MIN(days_in_state)::numeric, 2) as min_days,
        ROUND(MAX(days_in_state)::numeric, 2) as max_days
      FROM state_durations
      GROUP BY state
      ORDER BY avg_days DESC
    `;

    const result = await this.pool.query(query, params);

    return {
      reportType: 'time_in_state',
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate },
      data: result.rows.map(row => ({
        state: row.state,
        transitions: parseInt(row.transitions),
        avgDays: parseFloat(row.avg_days),
        medianDays: parseFloat(row.median_days),
        p90Days: parseFloat(row.p90_days),
        p95Days: parseFloat(row.p95_days),
        minDays: parseFloat(row.min_days),
        maxDays: parseFloat(row.max_days)
      })),
      summary: {
        averageTimeAcrossAllStates: result.rows.reduce((sum, row) =>
          sum + parseFloat(row.avg_days), 0
        ) / result.rows.length
      }
    };
  }

  /**
   * Generate transition velocity report
   * Measures speed of state transitions
   */
  async generateVelocityReport(options = {}) {
    const { startDate, endDate } = options;

    let query = `
      WITH transitions AS (
        SELECT
          ol1.opportunity_id,
          ol1.state as from_state,
          ol2.state as to_state,
          EXTRACT(EPOCH FROM (ol2.entered_at - ol1.exited_at)) / 86400 as transition_days
        FROM opportunity_lifecycle ol1
        JOIN opportunity_lifecycle ol2
          ON ol1.opportunity_id = ol2.opportunity_id
          AND ol2.entered_at > ol1.exited_at
        WHERE ol1.exited_at IS NOT NULL
    `;

    const params = [];
    let paramCount = 1;

    if (startDate) {
      query += ` AND ol1.entered_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND ol1.entered_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    query += `
      ),
      ranked_transitions AS (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY opportunity_id, from_state ORDER BY transition_days) as rn
        FROM transitions
      )
      SELECT
        from_state,
        to_state,
        COUNT(*) as transition_count,
        ROUND(AVG(transition_days)::numeric, 2) as avg_transition_days,
        ROUND(MIN(transition_days)::numeric, 2) as fastest_days,
        ROUND(MAX(transition_days)::numeric, 2) as slowest_days
      FROM ranked_transitions
      WHERE rn = 1
      GROUP BY from_state, to_state
      ORDER BY avg_transition_days
    `;

    const result = await this.pool.query(query, params);

    return {
      reportType: 'velocity',
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate },
      data: result.rows.map(row => ({
        fromState: row.from_state,
        toState: row.to_state,
        transitionCount: parseInt(row.transition_count),
        avgTransitionDays: parseFloat(row.avg_transition_days),
        fastestDays: parseFloat(row.fastest_days),
        slowestDays: parseFloat(row.slowest_days)
      })),
      summary: {
        fastestTransition: result.rows[0] || null,
        averageVelocity: result.rows.reduce((sum, row) =>
          sum + parseFloat(row.avg_transition_days), 0
        ) / result.rows.length || 0
      }
    };
  }

  /**
   * Generate outcome analysis report
   * Analyzes win/loss rates and reasons
   */
  async generateOutcomeReport(options = {}) {
    const { startDate, endDate } = options;

    let query = `
      WITH closed_opportunities AS (
        SELECT
          opportunity_id,
          sub_state,
          metadata,
          entered_at
        FROM opportunity_lifecycle
        WHERE state = 'CLOSED'
    `;

    const params = [];
    let paramCount = 1;

    if (startDate) {
      query += ` AND entered_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND entered_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    query += `
      )
      SELECT
        sub_state,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage,
        json_agg(
          DISTINCT metadata->>'reason'
        ) FILTER (WHERE metadata->>'reason' IS NOT NULL) as reasons
      FROM closed_opportunities
      GROUP BY sub_state
      ORDER BY count DESC
    `;

    const result = await this.pool.query(query, params);

    const wonCount = result.rows.find(r => r.sub_state === 'WON')?.count || 0;
    const totalClosed = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    const winRate = totalClosed > 0 ? ((wonCount / totalClosed) * 100).toFixed(2) : 0;

    return {
      reportType: 'outcome_analysis',
      generatedAt: new Date().toISOString(),
      filters: { startDate, endDate },
      data: result.rows.map(row => ({
        outcome: row.sub_state,
        count: parseInt(row.count),
        percentage: parseFloat(row.percentage),
        reasons: row.reasons || []
      })),
      summary: {
        totalClosed,
        winRate: parseFloat(winRate),
        wonCount,
        lostCount: result.rows.find(r => r.sub_state === 'LOST')?.count || 0,
        disqualifiedCount: result.rows.find(r => r.sub_state === 'DISQUALIFIED')?.count || 0
      }
    };
  }

  /**
   * Generate all reports
   */
  async generateAllReports(options = {}) {
    const [
      stateDistribution,
      conversionFunnel,
      timeInState,
      velocity,
      outcome
    ] = await Promise.all([
      this.generateStateDistributionReport(options),
      this.generateConversionFunnelReport(options),
      this.generateTimeInStateReport(options),
      this.generateVelocityReport(options),
      this.generateOutcomeReport(options)
    ]);

    return {
      reportType: 'all_reports',
      generatedAt: new Date().toISOString(),
      filters: options,
      reports: {
        stateDistribution,
        conversionFunnel,
        timeInState,
        velocity,
        outcome
      }
    };
  }

  /**
   * Export report to CSV format
   */
  exportReportToCSV(report) {
    if (!report.data || !Array.isArray(report.data)) {
      throw new Error('Report data must be an array');
    }

    if (report.data.length === 0) {
      return 'No data available';
    }

    // Get headers from first row
    const headers = Object.keys(report.data[0]);

    // Create CSV rows
    const csvRows = [
      headers.join(','),
      ...report.data.map(row =>
        headers.map(header => {
          const value = row[header];
          // Handle arrays and objects
          if (Array.isArray(value)) {
            return `"${value.join('; ')}"`;
          }
          if (typeof value === 'object' && value !== null) {
            return `"${JSON.stringify(value)}"`;
          }
          // Escape quotes and wrap in quotes if contains comma
          const stringValue = String(value || '');
          if (stringValue.includes(',') || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      )
    ];

    return csvRows.join('\n');
  }

  /**
   * Export report to JSON format
   */
  exportReportToJSON(report) {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report in specified format
   */
  exportReport(report, format = 'json') {
    switch (format.toLowerCase()) {
      case 'csv':
        return this.exportReportToCSV(report);
      case 'json':
        return this.exportReportToJSON(report);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default LifecycleReportGenerator;
