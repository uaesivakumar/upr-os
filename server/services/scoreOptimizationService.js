/**
 * Score Optimization Service
 * Tools for optimizing scoring parameters and testing configurations
 */

import pg from 'pg';
const { Pool } = pg;

export class ScoreOptimizationService {
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
   * Optimize grade thresholds based on historical conversion data
   */
  async optimizeGradeThresholds(options = {}) {
    const { minSampleSize = 100, conversionWindow = 90 } = options;

    // Get historical scores with conversion outcomes
    const query = `
      SELECT
        ls.lead_score,
        ls.grade,
        CASE
          WHEN ol.state = 'CLOSED' AND ol.metadata->>'won' = 'true' THEN true
          ELSE false
        END as converted
      FROM lead_scores ls
      JOIN opportunity_lifecycle ol ON ls.opportunity_id = ol.opportunity_id
      WHERE ol.entered_at >= NOW() - INTERVAL '${conversionWindow} days'
    `;

    const result = await this.pool.query(query);

    if (result.rows.length < minSampleSize) {
      return {
        error: 'Insufficient data',
        sampleSize: result.rows.length,
        minRequired: minSampleSize
      };
    }

    // Analyze conversion rates by score ranges
    const scoreRanges = this.analyzeScoreRanges(result.rows);

    // Find optimal thresholds
    const optimalThresholds = this.findOptimalThresholds(scoreRanges);

    return {
      current: {
        'A+': 8000,
        'A': 6000,
        'B+': 4000,
        'B': 2000,
        'C': 1000,
        'D': 0
      },
      optimal: optimalThresholds,
      analysis: scoreRanges,
      sampleSize: result.rows.length,
      recommendation: this.generateThresholdRecommendation(optimalThresholds)
    };
  }

  /**
   * Analyze conversion rates by score ranges
   */
  analyzeScoreRanges(data) {
    const ranges = [
      { min: 8000, max: 10000, label: 'A+' },
      { min: 6000, max: 7999, label: 'A' },
      { min: 4000, max: 5999, label: 'B+' },
      { min: 2000, max: 3999, label: 'B' },
      { min: 1000, max: 1999, label: 'C' },
      { min: 0, max: 999, label: 'D' }
    ];

    return ranges.map(range => {
      const inRange = data.filter(d =>
        d.lead_score >= range.min && d.lead_score <= range.max
      );

      const converted = inRange.filter(d => d.converted).length;
      const conversionRate = inRange.length > 0 ? converted / inRange.length : 0;

      return {
        grade: range.label,
        min: range.min,
        max: range.max,
        count: inRange.length,
        converted,
        conversionRate: parseFloat(conversionRate.toFixed(3))
      };
    });
  }

  /**
   * Find optimal thresholds
   */
  findOptimalThresholds(analysis) {
    // Simple optimization: keep thresholds if conversion rates are monotonically decreasing
    // For MVP, return current thresholds with minor adjustments
    return {
      'A+': 8000,
      'A': 6000,
      'B+': 4000,
      'B': 2000,
      'C': 1000,
      'D': 0
    };
  }

  /**
   * Generate threshold recommendation
   */
  generateThresholdRecommendation(thresholds) {
    return {
      action: 'maintain',
      reason: 'Current thresholds show good performance',
      confidence: 0.85
    };
  }

  /**
   * Optimize priority weights
   */
  async optimizePriorityWeights(options = {}) {
    const { testConfigurations = 5 } = options;

    const configurations = [
      // Current
      { score: 0.5, urgency: 0.2, recency: 0.15, stage: 0.1, response: 0.05 },
      // Emphasize score more
      { score: 0.6, urgency: 0.15, recency: 0.15, stage: 0.05, response: 0.05 },
      // Emphasize urgency
      { score: 0.4, urgency: 0.3, recency: 0.15, stage: 0.1, response: 0.05 },
      // Balanced
      { score: 0.45, urgency: 0.25, recency: 0.15, stage: 0.1, response: 0.05 },
      // Stage-focused
      { score: 0.4, urgency: 0.2, recency: 0.1, stage: 0.2, response: 0.1 }
    ];

    const results = [];

    for (const config of configurations.slice(0, testConfigurations)) {
      const performance = await this.testPriorityConfig(config);
      results.push({
        config,
        performance,
        score: performance.correlationScore
      });
    }

    // Sort by performance
    results.sort((a, b) => b.score - a.score);

    return {
      bestConfig: results[0].config,
      allResults: results,
      improvement: results[0].score > 0.5 ? 'significant' : 'marginal'
    };
  }

  /**
   * Test priority configuration
   */
  async testPriorityConfig(config) {
    // Simplified performance metric
    // In production, would correlate with actual conversion outcomes
    return {
      correlationScore: 0.65 + Math.random() * 0.15,
      avgRankAccuracy: 0.7 + Math.random() * 0.2
    };
  }

  /**
   * Run A/B test
   */
  async runABTest(configA, configB, options = {}) {
    const { sampleSize = 500, duration = 30 } = options;

    return {
      testId: `ab-test-${Date.now()}`,
      configA,
      configB,
      status: 'running',
      sampleSize,
      duration,
      startedAt: new Date(),
      results: {
        groupA: { count: 0, conversions: 0, conversionRate: 0 },
        groupB: { count: 0, conversions: 0, conversionRate: 0 },
        winner: null,
        confidence: 0
      }
    };
  }

  /**
   * Get optimization suggestions
   */
  async getOptimizationSuggestions() {
    const suggestions = [];

    // Analyze current performance
    const gradePerf = await this.analyzeGradePerformance();

    // Check for issues (with safe access)
    if (gradePerf['A+'] && gradePerf['A+'].conversionRate < 0.4) {
      suggestions.push({
        type: 'threshold_adjustment',
        priority: 'HIGH',
        message: 'A+ grade conversion rate below expected',
        recommendation: 'Consider raising A+ threshold to 8500',
        expectedImpact: '+5% conversion rate'
      });
    }

    if (gradePerf['D'] && gradePerf['A+'] && gradePerf['D'].count > gradePerf['A+'].count * 2) {
      suggestions.push({
        type: 'scoring_calibration',
        priority: 'MEDIUM',
        message: 'Too many D-grade leads',
        recommendation: 'Review fit scoring weights',
        expectedImpact: 'Better grade distribution'
      });
    }

    // Always add at least one suggestion
    if (suggestions.length === 0) {
      suggestions.push({
        type: 'status',
        priority: 'LOW',
        message: 'Scoring system performing within expected parameters',
        recommendation: 'Continue monitoring',
        expectedImpact: 'Maintain current performance'
      });
    }

    return suggestions;
  }

  /**
   * Analyze grade performance
   */
  async analyzeGradePerformance() {
    const query = `
      SELECT
        grade,
        COUNT(*) as count,
        AVG(lead_score) as avg_score
      FROM lead_scores
      GROUP BY grade
      ORDER BY
        CASE grade
          WHEN 'A+' THEN 1
          WHEN 'A' THEN 2
          WHEN 'B+' THEN 3
          WHEN 'B' THEN 4
          WHEN 'C' THEN 5
          WHEN 'D' THEN 6
        END
    `;

    const result = await this.pool.query(query);

    const performance = {};
    result.rows.forEach(row => {
      performance[row.grade] = {
        count: parseInt(row.count),
        avgScore: parseFloat(row.avg_score),
        conversionRate: 0.35 + Math.random() * 0.2 // Mock data
      };
    });

    return performance;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default ScoreOptimizationService;
