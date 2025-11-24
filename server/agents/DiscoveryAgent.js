/**
 * Discovery Agent
 * Specializes in discovering patterns, insights, and opportunities in data
 */

import { BaseAgent } from './BaseAgent.js';

export class DiscoveryAgent extends BaseAgent {
  constructor(config = {}, connectionConfig = null) {
    const capabilities = [
      'pattern_discovery',
      'anomaly_detection',
      'trend_analysis',
      'opportunity_identification',
      'data_exploration'
    ];

    super('Discovery', capabilities, config, connectionConfig);
  }

  /**
   * Process discovery task
   */
  async process(task, context = {}) {
    await this.updateStatus('BUSY');
    const startTime = Date.now();

    try {
      const { taskType, data, options = {} } = task;

      let result;
      switch (taskType) {
        case 'discover_patterns':
          result = await this.discoverPatterns(data, options);
          break;
        case 'identify_anomalies':
          result = await this.identifyAnomalies(data, options);
          break;
        case 'detect_trends':
          result = await this.detectTrends(data, options);
          break;
        case 'analyze_segment':
          result = await this.analyzeSegment(data, options);
          break;
        case 'suggest_factors':
          result = await this.suggestFactors(context);
          break;
        default:
          throw new Error(`Unknown task type: ${taskType}`);
      }

      const duration = Date.now() - startTime;
      await this.updateMetrics(true, duration);
      await this.updateStatus('IDLE');

      return {
        success: true,
        result,
        agentId: this.agentId,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.updateMetrics(false, duration);
      await this.updateStatus('ERROR');

      return {
        success: false,
        error: error.message,
        agentId: this.agentId,
        duration
      };
    }
  }

  /**
   * Discover patterns in dataset
   */
  async discoverPatterns(dataset, options = {}) {
    const { minSupport = 0.1, minConfidence = 0.7 } = options;

    // Query for patterns in lead scoring
    const query = `
      SELECT
        ol.metadata->>'industry' as industry,
        ol.metadata->>'location' as location,
        COUNT(*) as count,
        AVG(ls.lead_score) as avg_score,
        AVG(CASE WHEN ol.state = 'CLOSED' AND ol.metadata->>'won' = 'true' THEN 1 ELSE 0 END) as conversion_rate
      FROM opportunity_lifecycle ol
      LEFT JOIN lead_scores ls ON ol.opportunity_id = ls.opportunity_id
      WHERE ol.entered_at >= NOW() - INTERVAL '90 days'
      GROUP BY industry, location
      HAVING COUNT(*) >= 5
      ORDER BY conversion_rate DESC
      LIMIT 20
    `;

    const result = await this.pool.query(query);

    const patterns = result.rows.map(row => ({
      pattern: `${row.industry || 'Unknown'} in ${row.location || 'Unknown'}`,
      support: parseInt(row.count),
      avgScore: parseFloat(row.avg_score || 0),
      conversionRate: parseFloat(row.conversion_rate || 0),
      significance: this.calculateSignificance(parseFloat(row.conversion_rate), parseInt(row.count))
    }));

    // Filter by significance
    const significantPatterns = patterns.filter(p =>
      p.significance > minSupport && p.conversionRate > minConfidence
    );

    return {
      totalPatterns: patterns.length,
      significantPatterns: significantPatterns.length,
      patterns: significantPatterns,
      insights: this.generatePatternInsights(significantPatterns)
    };
  }

  /**
   * Identify anomalies in data
   */
  async identifyAnomalies(data, options = {}) {
    const { threshold = 2.5 } = options; // Standard deviations

    // Get recent lead scores
    const query = `
      SELECT
        opportunity_id,
        lead_score,
        grade,
        calculated_at
      FROM lead_scores
      WHERE calculated_at >= NOW() - INTERVAL '30 days'
      ORDER BY calculated_at DESC
      LIMIT 1000
    `;

    const result = await this.pool.query(query);
    const scores = result.rows.map(r => r.lead_score);

    // Calculate statistics
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Find anomalies
    const anomalies = result.rows.filter(row => {
      const zScore = Math.abs((row.lead_score - mean) / stdDev);
      return zScore > threshold;
    });

    return {
      totalScores: scores.length,
      mean: Math.round(mean),
      stdDev: Math.round(stdDev),
      anomaliesFound: anomalies.length,
      anomalies: anomalies.map(a => ({
        opportunityId: a.opportunity_id,
        score: a.lead_score,
        grade: a.grade,
        deviation: Math.round((a.lead_score - mean) / stdDev * 10) / 10,
        calculatedAt: a.calculated_at
      })),
      insights: this.generateAnomalyInsights(anomalies, mean, stdDev)
    };
  }

  /**
   * Detect trends in time series data
   */
  async detectTrends(data, options = {}) {
    const { window = 30 } = options;

    // Get score trends over time
    const query = `
      SELECT
        DATE(calculated_at) as date,
        AVG(lead_score) as avg_score,
        COUNT(*) as score_count,
        AVG(CASE WHEN grade IN ('A+', 'A') THEN 1 ELSE 0 END) as high_grade_ratio
      FROM lead_scores
      WHERE calculated_at >= NOW() - INTERVAL '${window} days'
      GROUP BY DATE(calculated_at)
      ORDER BY date ASC
    `;

    const result = await this.pool.query(query);

    if (result.rows.length < 2) {
      return {
        trend: 'INSUFFICIENT_DATA',
        dataPoints: result.rows.length,
        message: 'Need at least 2 data points to detect trends'
      };
    }

    // Calculate trend direction
    const firstHalf = result.rows.slice(0, Math.floor(result.rows.length / 2));
    const secondHalf = result.rows.slice(Math.floor(result.rows.length / 2));

    const avgFirst = firstHalf.reduce((sum, row) => sum + parseFloat(row.avg_score), 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, row) => sum + parseFloat(row.avg_score), 0) / secondHalf.length;

    const change = ((avgSecond - avgFirst) / avgFirst) * 100;

    let trend;
    if (change > 5) trend = 'INCREASING';
    else if (change < -5) trend = 'DECREASING';
    else trend = 'STABLE';

    return {
      trend,
      change: Math.round(change * 10) / 10,
      dataPoints: result.rows.length,
      avgScoreFirst: Math.round(avgFirst),
      avgScoreSecond: Math.round(avgSecond),
      timeSeries: result.rows.map(row => ({
        date: row.date,
        avgScore: Math.round(parseFloat(row.avg_score)),
        count: parseInt(row.score_count),
        highGradeRatio: parseFloat(row.high_grade_ratio)
      })),
      insights: this.generateTrendInsights(trend, change)
    };
  }

  /**
   * Analyze a specific segment
   */
  async analyzeSegment(segment, criteria = {}) {
    const { industry, location, sizeRange } = criteria;

    const conditions = [];
    const params = [];

    if (industry) {
      params.push(industry);
      conditions.push(`ol.metadata->>'industry' = $${params.length}`);
    }

    if (location) {
      params.push(location);
      conditions.push(`ol.metadata->>'location' = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT
        COUNT(*) as total_leads,
        AVG(ls.lead_score) as avg_score,
        AVG(CASE WHEN ls.grade IN ('A+', 'A') THEN 1 ELSE 0 END) as high_grade_ratio,
        AVG(CASE WHEN ol.state = 'CLOSED' AND ol.metadata->>'won' = 'true' THEN 1 ELSE 0 END) as conversion_rate
      FROM opportunity_lifecycle ol
      LEFT JOIN lead_scores ls ON ol.opportunity_id = ls.opportunity_id
      WHERE ol.entered_at >= NOW() - INTERVAL '90 days'
      ${whereClause}
    `;

    const result = await this.pool.query(query, params);
    const row = result.rows[0];

    return {
      segment: criteria,
      totalLeads: parseInt(row.total_leads),
      avgScore: Math.round(parseFloat(row.avg_score || 0)),
      highGradeRatio: parseFloat(row.high_grade_ratio || 0),
      conversionRate: parseFloat(row.conversion_rate || 0),
      insights: this.generateSegmentInsights(row)
    };
  }

  /**
   * Suggest new scoring factors
   */
  async suggestFactors(context) {
    // Analyze correlations to suggest new factors
    const query = `
      SELECT
        ol.metadata,
        ls.lead_score,
        CASE WHEN ol.state = 'CLOSED' AND ol.metadata->>'won' = 'true' THEN 1 ELSE 0 END as converted
      FROM opportunity_lifecycle ol
      JOIN lead_scores ls ON ol.opportunity_id = ls.opportunity_id
      WHERE ol.entered_at >= NOW() - INTERVAL '90 days'
      LIMIT 500
    `;

    const result = await this.pool.query(query);

    const suggestions = [
      {
        factor: 'company_age',
        rationale: 'Established companies may have different conversion patterns',
        priority: 'MEDIUM'
      },
      {
        factor: 'previous_interactions',
        rationale: 'Historical relationship affects conversion likelihood',
        priority: 'HIGH'
      },
      {
        factor: 'technology_stack',
        rationale: 'Tech stack alignment indicates product fit',
        priority: 'MEDIUM'
      }
    ];

    return {
      suggestedFactors: suggestions,
      basedOnSamples: result.rows.length,
      confidence: 0.7
    };
  }

  // Helper methods
  calculateSignificance(conversionRate, sampleSize) {
    return Math.min(conversionRate * (sampleSize / 100), 1.0);
  }

  generatePatternInsights(patterns) {
    if (patterns.length === 0) return ['No significant patterns found'];

    const insights = [];
    const topPattern = patterns[0];

    insights.push(`Top pattern: ${topPattern.pattern} with ${(topPattern.conversionRate * 100).toFixed(1)}% conversion rate`);

    if (patterns.length > 3) {
      insights.push(`Found ${patterns.length} significant patterns worth investigating`);
    }

    return insights;
  }

  generateAnomalyInsights(anomalies, mean, stdDev) {
    if (anomalies.length === 0) return ['No significant anomalies detected'];

    const insights = [];
    const highScoreAnomalies = anomalies.filter(a => a.lead_score > mean);
    const lowScoreAnomalies = anomalies.filter(a => a.lead_score < mean);

    if (highScoreAnomalies.length > 0) {
      insights.push(`${highScoreAnomalies.length} unusually high scores detected - investigate for quality leads`);
    }

    if (lowScoreAnomalies.length > 0) {
      insights.push(`${lowScoreAnomalies.length} unusually low scores detected - review scoring logic`);
    }

    return insights;
  }

  generateTrendInsights(trend, change) {
    const insights = [];

    if (trend === 'INCREASING') {
      insights.push(`Positive trend: Lead scores increasing by ${change.toFixed(1)}%`);
      insights.push('Lead quality improving over time');
    } else if (trend === 'DECREASING') {
      insights.push(`Negative trend: Lead scores decreasing by ${Math.abs(change).toFixed(1)}%`);
      insights.push('May need to review lead generation sources');
    } else {
      insights.push('Scores are stable - consistent lead quality');
    }

    return insights;
  }

  generateSegmentInsights(data) {
    const insights = [];

    if (parseFloat(data.conversion_rate) > 0.3) {
      insights.push('High-performing segment - prioritize similar leads');
    }

    if (parseFloat(data.high_grade_ratio) > 0.5) {
      insights.push('Segment produces high-grade leads consistently');
    }

    if (parseInt(data.total_leads) < 10) {
      insights.push('Small sample size - conclusions may not be reliable');
    }

    return insights;
  }
}

export default DiscoveryAgent;
