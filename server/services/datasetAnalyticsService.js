/**
 * Dataset Analytics Service
 *
 * Comprehensive analytics and insights for training datasets including:
 * - Quality metrics and trends
 * - Distribution analysis
 * - Coverage reports
 * - Performance predictions
 * - Anomaly detection
 */

const pool = require('../config/database');

class DatasetAnalyticsService {
  /**
   * Generate comprehensive analytics report for dataset
   */
  static async generateReport(datasetId) {
    console.log(`[DatasetAnalytics] Generating report for dataset: ${datasetId}`);

    const report = {
      datasetId,
      generatedAt: new Date(),
      summary: await this._generateSummary(datasetId),
      qualityMetrics: await this._analyzeQuality(datasetId),
      distribution: await this._analyzeDistribution(datasetId),
      coverage: await this._analyzeCoverage(datasetId),
      trends: await this._analyzeTrends(datasetId),
      recommendations: []
    };

    // Generate recommendations based on analysis
    report.recommendations = this._generateRecommendations(report);

    // Save analytics to database
    await this._saveAnalytics(datasetId, report);

    console.log(`[DatasetAnalytics] Report generated successfully`);

    return report;
  }

  /**
   * Generate summary statistics
   */
  static async _generateSummary(datasetId) {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_examples,
        COUNT(DISTINCT example_type) as example_types,
        AVG(quality_score) as avg_quality_score,
        MIN(created_at) as first_example_at,
        MAX(created_at) as last_example_at,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated_count,
        COUNT(*) FILTER (WHERE validation_status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE validation_status = 'rejected') as rejected_count
      FROM training.examples
      WHERE dataset_id = $1`,
      [datasetId]
    );

    const stats = result.rows[0];

    return {
      totalExamples: parseInt(stats.total_examples),
      exampleTypes: parseInt(stats.example_types),
      avgQualityScore: parseFloat(stats.avg_quality_score || 0).toFixed(2),
      validatedCount: parseInt(stats.validated_count),
      pendingCount: parseInt(stats.pending_count),
      rejectedCount: parseInt(stats.rejected_count),
      firstExampleAt: stats.first_example_at,
      lastExampleAt: stats.last_example_at,
      validationRate: ((parseInt(stats.validated_count) / parseInt(stats.total_examples)) * 100).toFixed(1)
    };
  }

  /**
   * Analyze quality metrics
   */
  static async _analyzeQuality(datasetId) {
    const result = await pool.query(
      `SELECT
        MIN(quality_score) as min_score,
        MAX(quality_score) as max_score,
        AVG(quality_score) as avg_score,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY quality_score) as p25,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY quality_score) as median,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY quality_score) as p75,
        STDDEV(quality_score) as std_dev,
        COUNT(*) FILTER (WHERE quality_score >= 90) as gold_count,
        COUNT(*) FILTER (WHERE quality_score >= 75 AND quality_score < 90) as silver_count,
        COUNT(*) FILTER (WHERE quality_score >= 60 AND quality_score < 75) as bronze_count,
        COUNT(*) FILTER (WHERE quality_score < 60) as low_quality_count
      FROM training.examples
      WHERE dataset_id = $1`,
      [datasetId]
    );

    const stats = result.rows[0];

    return {
      min: parseFloat(stats.min_score || 0),
      max: parseFloat(stats.max_score || 0),
      avg: parseFloat(stats.avg_score || 0).toFixed(2),
      median: parseFloat(stats.median || 0).toFixed(2),
      p25: parseFloat(stats.p25 || 0).toFixed(2),
      p75: parseFloat(stats.p75 || 0).toFixed(2),
      stdDev: parseFloat(stats.std_dev || 0).toFixed(2),
      tiers: {
        gold: parseInt(stats.gold_count),
        silver: parseInt(stats.silver_count),
        bronze: parseInt(stats.bronze_count),
        lowQuality: parseInt(stats.low_quality_count)
      }
    };
  }

  /**
   * Analyze example type distribution
   */
  static async _analyzeDistribution(datasetId) {
    const byType = await pool.query(
      `SELECT
        example_type,
        COUNT(*) as count,
        AVG(quality_score) as avg_quality,
        MIN(quality_score) as min_quality,
        MAX(quality_score) as max_quality
      FROM training.examples
      WHERE dataset_id = $1
      GROUP BY example_type
      ORDER BY count DESC`,
      [datasetId]
    );

    const byQualityTier = await pool.query(
      `SELECT tier, COUNT(*) as count
      FROM (
        SELECT
          CASE
            WHEN quality_score >= 90 THEN 'Gold'
            WHEN quality_score >= 75 THEN 'Silver'
            WHEN quality_score >= 60 THEN 'Bronze'
            ELSE 'Low Quality'
          END as tier
        FROM training.examples
        WHERE dataset_id = $1
      ) tiers
      GROUP BY tier
      ORDER BY
        CASE tier
          WHEN 'Gold' THEN 1
          WHEN 'Silver' THEN 2
          WHEN 'Bronze' THEN 3
          ELSE 4
        END`,
      [datasetId]
    );

    return {
      byType: byType.rows.map(row => ({
        type: row.example_type,
        count: parseInt(row.count),
        avgQuality: parseFloat(row.avg_quality || 0).toFixed(2),
        minQuality: parseFloat(row.min_quality || 0),
        maxQuality: parseFloat(row.max_quality || 0)
      })),
      byQualityTier: byQualityTier.rows.reduce((acc, row) => {
        acc[row.tier] = parseInt(row.count);
        return acc;
      }, {})
    };
  }

  /**
   * Analyze dataset coverage
   */
  static async _analyzeCoverage(datasetId) {
    // Check field completeness
    const completeness = await pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(input_data) FILTER (WHERE input_data IS NOT NULL AND input_data != '{}') as has_input,
        COUNT(expected_output) FILTER (WHERE expected_output IS NOT NULL AND expected_output != '{}') as has_output,
        COUNT(quality_score) FILTER (WHERE quality_score IS NOT NULL) as has_quality,
        COUNT(labels) FILTER (WHERE labels IS NOT NULL AND labels != '{}') as has_labels,
        COUNT(source_decision_id) FILTER (WHERE source_decision_id IS NOT NULL) as has_source
      FROM training.examples
      WHERE dataset_id = $1`,
      [datasetId]
    );

    const stats = completeness.rows[0];
    const total = parseInt(stats.total);

    return {
      fieldCompleteness: {
        inputData: ((parseInt(stats.has_input) / total) * 100).toFixed(1),
        expectedOutput: ((parseInt(stats.has_output) / total) * 100).toFixed(1),
        qualityScore: ((parseInt(stats.has_quality) / total) * 100).toFixed(1),
        labels: ((parseInt(stats.has_labels) / total) * 100).toFixed(1),
        sourceDecision: ((parseInt(stats.has_source) / total) * 100).toFixed(1)
      },
      overallCompleteness: (
        ((parseInt(stats.has_input) +
          parseInt(stats.has_output) +
          parseInt(stats.has_quality)) / (total * 3)) * 100
      ).toFixed(1)
    };
  }

  /**
   * Analyze trends over time
   */
  static async _analyzeTrends(datasetId) {
    const dailyStats = await pool.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as examples_added,
        AVG(quality_score) as avg_quality
      FROM training.examples
      WHERE dataset_id = $1
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30`,
      [datasetId]
    );

    return {
      dailyGrowth: dailyStats.rows.map(row => ({
        date: row.date,
        examplesAdded: parseInt(row.examples_added),
        avgQuality: parseFloat(row.avg_quality || 0).toFixed(2)
      })),
      totalDays: dailyStats.rows.length,
      avgDailyGrowth: dailyStats.rows.length > 0
        ? (dailyStats.rows.reduce((sum, row) => sum + parseInt(row.examples_added), 0) / dailyStats.rows.length).toFixed(1)
        : 0
    };
  }

  /**
   * Generate recommendations based on analytics
   */
  static _generateRecommendations(report) {
    const recommendations = [];

    // Quality recommendations
    if (parseFloat(report.qualityMetrics.avg) < 75) {
      recommendations.push({
        priority: 'high',
        category: 'quality',
        issue: `Low average quality score (${report.qualityMetrics.avg})`,
        recommendation: 'Increase quality threshold for example extraction or improve validation process',
        impact: 'Better model performance and reduced overfitting'
      });
    }

    // Distribution recommendations
    const typeDistribution = report.distribution.byType;
    if (typeDistribution.length > 1) {
      const counts = typeDistribution.map(t => t.count);
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      if (max / min > 5) {
        recommendations.push({
          priority: 'medium',
          category: 'distribution',
          issue: `Severe class imbalance detected (${(max/min).toFixed(1)}:1 ratio)`,
          recommendation: 'Extract more examples from underrepresented types to balance dataset',
          impact: 'Improved model performance on minority classes'
        });
      }
    }

    // Validation recommendations
    const validationRate = parseFloat(report.summary.validationRate);
    if (validationRate < 50) {
      recommendations.push({
        priority: 'high',
        category: 'validation',
        issue: `Low validation rate (${validationRate}%)`,
        recommendation: 'Run validation workflow to review and validate pending examples',
        impact: 'Higher confidence in dataset quality'
      });
    }

    // Coverage recommendations
    const completeness = parseFloat(report.coverage.overallCompleteness);
    if (completeness < 95) {
      recommendations.push({
        priority: 'medium',
        category: 'coverage',
        issue: `Incomplete data (${completeness}% completeness)`,
        recommendation: 'Review and fill missing fields in examples',
        impact: 'More robust training data'
      });
    }

    return recommendations;
  }

  /**
   * Save analytics to database for historical tracking
   */
  static async _saveAnalytics(datasetId, report) {
    const metrics = [
      { name: 'total_examples', value: { count: report.summary.totalExamples } },
      { name: 'quality_metrics', value: report.qualityMetrics },
      { name: 'distribution', value: report.distribution },
      { name: 'coverage', value: report.coverage }
    ];

    for (const metric of metrics) {
      await pool.query(
        `INSERT INTO training.dataset_analytics (dataset_id, metric_name, metric_value, time_period)
         VALUES ($1, $2, $3, $4)`,
        [datasetId, metric.name, JSON.stringify(metric.value), 'daily']
      );
    }
  }

  /**
   * Get historical analytics
   */
  static async getHistoricalAnalytics(datasetId, metricName, days = 30) {
    const result = await pool.query(
      `SELECT metric_value, computed_at
       FROM training.dataset_analytics
       WHERE dataset_id = $1
         AND metric_name = $2
         AND computed_at > NOW() - INTERVAL '${days} days'
       ORDER BY computed_at DESC`,
      [datasetId, metricName]
    );

    return result.rows.map(row => ({
      value: row.metric_value,
      computedAt: row.computed_at
    }));
  }
}

module.exports = DatasetAnalyticsService;
