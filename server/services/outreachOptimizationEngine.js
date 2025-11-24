/**
 * Outreach Optimization Recommendations Engine
 * Sprint 45 - AI-driven optimization recommendations
 *
 * Integrates:
 * - Quality scores
 * - Performance metrics
 * - A/B test results
 * - Feedback insights
 * - Template optimization data
 *
 * Generates:
 * - Prioritized recommendations
 * - Actionable insights
 * - Predicted impact
 */

import pg from 'pg';
const { Pool } = pg;

export class OutreachOptimizationEngine {
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
   * Generate comprehensive optimization recommendations
   */
  async generateRecommendations(options = {}) {
    const { days = 30, minPriority = null } = options;

    // Gather data from all sources
    const [
      qualityAnalysis,
      performanceAnalysis,
      abTestInsights,
      feedbackInsights,
      templateInsights
    ] = await Promise.all([
      this.analyzeQualityScores(days),
      this.analyzePerformanceMetrics(days),
      this.analyzeABTests(),
      this.analyzeFeedback(days),
      this.analyzeTemplates(days)
    ]);

    // Generate recommendations
    const recommendations = [];

    // Quality-based recommendations
    recommendations.push(...this.generateQualityRecommendations(qualityAnalysis));

    // Performance-based recommendations
    recommendations.push(...this.generatePerformanceRecommendations(performanceAnalysis));

    // A/B test-based recommendations
    recommendations.push(...this.generateABTestRecommendations(abTestInsights));

    // Feedback-based recommendations
    recommendations.push(...this.generateFeedbackRecommendations(feedbackInsights));

    // Template-based recommendations
    recommendations.push(...this.generateTemplateRecommendations(templateInsights));

    // Prioritize and score recommendations
    const scoredRecommendations = this.scoreRecommendations(recommendations);

    // Filter by priority if specified
    let finalRecommendations = scoredRecommendations;
    if (minPriority) {
      const priorityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
      const minScore = priorityOrder[minPriority] || 1;
      finalRecommendations = scoredRecommendations.filter(r =>
        (priorityOrder[r.priority] || 0) >= minScore
      );
    }

    return {
      generated_at: new Date(),
      analysis_period: `${days} days`,
      total_recommendations: finalRecommendations.length,
      recommendations: finalRecommendations.slice(0, 20), // Top 20
      data_sources: {
        quality: qualityAnalysis.sample_size,
        performance: performanceAnalysis.data_points,
        ab_tests: abTestInsights.total_tests,
        feedback: feedbackInsights.total_feedback,
        templates: templateInsights.templates_analyzed
      }
    };
  }

  /**
   * Analyze quality scores
   */
  async analyzeQualityScores(days) {
    const query = `
      SELECT
        COUNT(*) as sample_size,
        AVG(overall_quality) as avg_quality,
        AVG(personalization_score) as avg_personalization,
        AVG(relevance_score) as avg_relevance,
        AVG(clarity_score) as avg_clarity,
        AVG(engagement_potential) as avg_engagement,
        COUNT(*) FILTER (WHERE quality_tier = 'POOR') as poor_count
      FROM outreach_quality_scores
      WHERE scored_at >= NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query);
    const data = result.rows[0];

    return {
      sample_size: parseInt(data.sample_size) || 0,
      avg_quality: parseFloat(data.avg_quality || 0),
      avg_personalization: parseFloat(data.avg_personalization || 0),
      avg_relevance: parseFloat(data.avg_relevance || 0),
      avg_clarity: parseFloat(data.avg_clarity || 0),
      avg_engagement: parseFloat(data.avg_engagement || 0),
      poor_count: parseInt(data.poor_count) || 0,
      poor_percentage: data.sample_size > 0
        ? ((parseInt(data.poor_count) / parseInt(data.sample_size)) * 100)
        : 0
    };
  }

  /**
   * Analyze performance metrics
   */
  async analyzePerformanceMetrics(days) {
    const query = `
      SELECT
        COUNT(*) as data_points,
        AVG(open_rate) as avg_open_rate,
        AVG(reply_rate) as avg_reply_rate,
        AVG(avg_feedback_rating) as avg_feedback_rating
      FROM outreach_performance_metrics
      WHERE metric_date >= CURRENT_DATE - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query);
    const data = result.rows[0];

    return {
      data_points: parseInt(data.data_points) || 0,
      avg_open_rate: parseFloat(data.avg_open_rate || 0),
      avg_reply_rate: parseFloat(data.avg_reply_rate || 0),
      avg_feedback_rating: parseFloat(data.avg_feedback_rating || 0)
    };
  }

  /**
   * Analyze A/B tests
   */
  async analyzeABTests() {
    const query = `
      SELECT
        COUNT(*) as total_tests,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND winner IS NOT NULL) as completed_with_winner
      FROM outreach_ab_tests
    `;

    const result = await this.pool.query(query);
    const data = result.rows[0];

    // Get recent winners
    const winners = await this.pool.query(`
      SELECT test_name, winner, results_summary
      FROM outreach_ab_tests
      WHERE status = 'COMPLETED' AND winner IS NOT NULL
      ORDER BY ended_at DESC
      LIMIT 5
    `);

    return {
      total_tests: parseInt(data.total_tests) || 0,
      completed_with_winner: parseInt(data.completed_with_winner) || 0,
      recent_winners: winners.rows
    };
  }

  /**
   * Analyze feedback
   */
  async analyzeFeedback(days) {
    const query = `
      SELECT
        COUNT(*) as total_feedback,
        AVG(overall_rating) as avg_rating,
        COUNT(*) FILTER (WHERE sentiment = 'NEGATIVE') as negative_count
      FROM outreach_feedback
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query);
    const data = result.rows[0];

    return {
      total_feedback: parseInt(data.total_feedback) || 0,
      avg_rating: parseFloat(data.avg_rating || 0),
      negative_count: parseInt(data.negative_count) || 0
    };
  }

  /**
   * Analyze templates
   */
  async analyzeTemplates(days) {
    // Simplified - would integrate with voice_templates table
    return {
      templates_analyzed: 0,
      underperforming: 0
    };
  }

  /**
   * Generate quality-based recommendations
   */
  generateQualityRecommendations(analysis) {
    const recommendations = [];

    if (analysis.avg_quality < 70) {
      recommendations.push({
        type: 'QUALITY_IMPROVEMENT',
        title: 'Improve Overall Quality',
        description: `Average quality score is ${analysis.avg_quality.toFixed(1)}, below target of 75`,
        priority: 'HIGH',
        category: 'quality',
        actions: [
          'Review top-performing messages and identify patterns',
          'Update templates to match quality standards',
          'Increase use of proven frameworks'
        ],
        expected_impact: {
          metric: 'overall_quality',
          current: analysis.avg_quality,
          target: 75,
          improvement: `+${(75 - analysis.avg_quality).toFixed(1)} points`
        },
        effort: 'MEDIUM',
        timeframe: '2-3 weeks'
      });
    }

    if (analysis.avg_personalization < 70) {
      recommendations.push({
        type: 'PERSONALIZATION',
        title: 'Enhance Personalization',
        description: `Personalization score is ${analysis.avg_personalization.toFixed(1)}, below target`,
        priority: 'HIGH',
        category: 'quality',
        actions: [
          'Add more dynamic variables (industry, company size, pain points)',
          'Include research-based custom insights',
          'Leverage AI enrichment for deeper context'
        ],
        expected_impact: {
          metric: 'personalization_score',
          current: analysis.avg_personalization,
          target: 75,
          improvement: `+${(75 - analysis.avg_personalization).toFixed(1)} points`
        },
        effort: 'LOW',
        timeframe: '1 week'
      });
    }

    if (analysis.poor_percentage > 15) {
      recommendations.push({
        type: 'REDUCE_POOR_QUALITY',
        title: 'Reduce Poor Quality Messages',
        description: `${analysis.poor_percentage.toFixed(1)}% of messages rated as POOR`,
        priority: 'HIGH',
        category: 'quality',
        actions: [
          'Identify and pause underperforming templates',
          'Implement minimum quality thresholds',
          'Add quality gates before sending'
        ],
        expected_impact: {
          metric: 'poor_percentage',
          current: analysis.poor_percentage,
          target: 5,
          improvement: `-${(analysis.poor_percentage - 5).toFixed(1)}%`
        },
        effort: 'MEDIUM',
        timeframe: '1-2 weeks'
      });
    }

    return recommendations;
  }

  /**
   * Generate performance-based recommendations
   */
  generatePerformanceRecommendations(analysis) {
    const recommendations = [];

    if (analysis.avg_reply_rate < 5) {
      recommendations.push({
        type: 'IMPROVE_ENGAGEMENT',
        title: 'Boost Reply Rates',
        description: `Reply rate is ${analysis.avg_reply_rate.toFixed(2)}%, below 5% target`,
        priority: 'HIGH',
        category: 'performance',
        actions: [
          'Test compelling subject lines',
          'Add clear CTAs',
          'Include specific questions',
          'Improve value propositions'
        ],
        expected_impact: {
          metric: 'reply_rate',
          current: analysis.avg_reply_rate,
          target: 5,
          improvement: `+${(5 - analysis.avg_reply_rate).toFixed(2)}%`
        },
        effort: 'MEDIUM',
        timeframe: '2-4 weeks'
      });
    }

    return recommendations;
  }

  /**
   * Generate A/B test-based recommendations
   */
  generateABTestRecommendations(insights) {
    const recommendations = [];

    if (insights.recent_winners.length > 0) {
      recommendations.push({
        type: 'DEPLOY_WINNERS',
        title: 'Deploy A/B Test Winners',
        description: `${insights.completed_with_winner} completed tests with clear winners`,
        priority: 'MEDIUM',
        category: 'optimization',
        actions: insights.recent_winners.map(w =>
          `Deploy winning variant from "${w.test_name}"`
        ),
        expected_impact: {
          metric: 'various',
          improvement: 'Apply proven improvements from testing'
        },
        effort: 'LOW',
        timeframe: '1 week'
      });
    }

    return recommendations;
  }

  /**
   * Generate feedback-based recommendations
   */
  generateFeedbackRecommendations(insights) {
    const recommendations = [];

    if (insights.avg_rating < 3.5) {
      recommendations.push({
        type: 'ADDRESS_FEEDBACK',
        title: 'Address Low Satisfaction',
        description: `Average feedback rating is ${insights.avg_rating.toFixed(2)}/5`,
        priority: 'HIGH',
        category: 'feedback',
        actions: [
          'Review negative feedback themes',
          'Implement suggested improvements',
          'Test revised approaches'
        ],
        expected_impact: {
          metric: 'avg_feedback_rating',
          current: insights.avg_rating,
          target: 4.0,
          improvement: `+${(4.0 - insights.avg_rating).toFixed(2)} points`
        },
        effort: 'MEDIUM',
        timeframe: '2-3 weeks'
      });
    }

    return recommendations;
  }

  /**
   * Generate template-based recommendations
   */
  generateTemplateRecommendations(insights) {
    return []; // Would be populated from template analysis
  }

  /**
   * Score and prioritize recommendations
   */
  scoreRecommendations(recommendations) {
    // Calculate priority score for each recommendation
    const scored = recommendations.map(rec => {
      let score = 0;

      // Priority weight
      const priorityWeights = { 'HIGH': 30, 'MEDIUM': 20, 'LOW': 10 };
      score += priorityWeights[rec.priority] || 0;

      // Effort weight (inverse - lower effort = higher score)
      const effortWeights = { 'LOW': 20, 'MEDIUM': 10, 'HIGH': 5 };
      score += effortWeights[rec.effort] || 0;

      // Impact weight
      if (rec.expected_impact && rec.expected_impact.improvement) {
        score += 15; // Has quantified impact
      }

      // Urgency based on current vs target
      if (rec.expected_impact && rec.expected_impact.current && rec.expected_impact.target) {
        const gap = Math.abs(rec.expected_impact.target - rec.expected_impact.current);
        if (gap > 20) score += 15;
        else if (gap > 10) score += 10;
        else if (gap > 5) score += 5;
      }

      return {
        ...rec,
        priority_score: score
      };
    });

    // Sort by priority score
    return scored.sort((a, b) => b.priority_score - a.priority_score);
  }

  /**
   * Get recommendation by ID
   */
  async getRecommendation(recommendationId) {
    const query = `
      SELECT * FROM outreach_template_optimizations
      WHERE id = $1
    `;

    const result = await this.pool.query(query, [recommendationId]);
    return result.rows[0];
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default OutreachOptimizationEngine;
