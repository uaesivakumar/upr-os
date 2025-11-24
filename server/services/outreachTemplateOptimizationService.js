/**
 * Outreach Template Optimization Service
 * Sprint 45 - Continuous template improvement based on performance data
 *
 * Capabilities:
 * - Analyze template performance
 * - Generate optimization recommendations
 * - Track implementation status
 * - Measure improvement impact
 * - Identify underperforming templates
 */

import pg from 'pg';
const { Pool } = pg;

export class OutreachTemplateOptimizationService {
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
   * Analyze template performance and generate recommendations
   */
  async analyzeTemplate(templateId, options = {}) {
    const { days = 30, minMessages = 20 } = options;

    // Get template performance metrics
    const performance = await this.getTemplatePerformance(templateId, days);

    if (performance.total_messages < minMessages) {
      return {
        status: 'INSUFFICIENT_DATA',
        message: `Need at least ${minMessages} messages to analyze`,
        current_count: performance.total_messages
      };
    }

    // Identify performance gaps
    const gaps = await this.identifyPerformanceGaps(performance);

    // Generate recommendations
    const recommendations = this.generateRecommendations(performance, gaps);

    return {
      status: 'ANALYSIS_COMPLETE',
      template_id: templateId,
      performance,
      gaps,
      recommendations,
      analyzed_at: new Date()
    };
  }

  /**
   * Get template performance metrics
   */
  async getTemplatePerformance(templateId, days) {
    // This assumes we have a way to track which template was used
    // For now, we'll query from quality scores and generated messages
    const query = `
      SELECT
        COUNT(*) as total_messages,
        AVG(oqs.overall_quality) as avg_quality,
        AVG(oqs.personalization_score) as avg_personalization,
        AVG(oqs.relevance_score) as avg_relevance,
        AVG(oqs.clarity_score) as avg_clarity,
        AVG(oqs.engagement_potential) as avg_engagement,
        COUNT(*) FILTER (WHERE oqs.quality_tier = 'EXCELLENT') as excellent_count,
        COUNT(*) FILTER (WHERE oqs.quality_tier = 'GOOD') as good_count,
        COUNT(*) FILTER (WHERE oqs.quality_tier = 'FAIR') as fair_count,
        COUNT(*) FILTER (WHERE oqs.quality_tier = 'POOR') as poor_count
      FROM outreach_quality_scores oqs
      WHERE oqs.scored_at >= NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query);
    const data = result.rows[0];

    return {
      total_messages: parseInt(data.total_messages) || 0,
      avg_quality: parseFloat(data.avg_quality || 0).toFixed(2),
      avg_personalization: parseFloat(data.avg_personalization || 0).toFixed(2),
      avg_relevance: parseFloat(data.avg_relevance || 0).toFixed(2),
      avg_clarity: parseFloat(data.avg_clarity || 0).toFixed(2),
      avg_engagement: parseFloat(data.avg_engagement || 0).toFixed(2),
      tier_distribution: {
        excellent: parseInt(data.excellent_count) || 0,
        good: parseInt(data.good_count) || 0,
        fair: parseInt(data.fair_count) || 0,
        poor: parseInt(data.poor_count) || 0
      }
    };
  }

  /**
   * Identify performance gaps
   */
  async identifyPerformanceGaps(performance) {
    // Get target metrics from configuration
    const configResult = await this.pool.query(`
      SELECT config_value
      FROM outreach_config
      WHERE config_key = 'performance_targets'
    `);

    const targets = configResult.rows[0]?.config_value || {
      avg_quality: 75,
      avg_personalization: 75,
      avg_relevance: 75,
      avg_clarity: 80,
      avg_engagement: 70
    };

    const gaps = [];

    // Check each metric against targets
    const metrics = ['avg_quality', 'avg_personalization', 'avg_relevance', 'avg_clarity', 'avg_engagement'];

    for (const metric of metrics) {
      const actual = parseFloat(performance[metric]);
      const target = targets[metric] || 75;
      const gap = target - actual;

      if (gap > 5) { // More than 5 points below target
        gaps.push({
          metric,
          actual,
          target,
          gap: parseFloat(gap.toFixed(2)),
          severity: gap > 15 ? 'HIGH' : gap > 10 ? 'MEDIUM' : 'LOW'
        });
      }
    }

    return gaps;
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(performance, gaps) {
    const recommendations = [];

    // Recommendation priority: HIGH gaps first
    const sortedGaps = gaps.sort((a, b) => b.gap - a.gap);

    for (const gap of sortedGaps) {
      const rec = this.getRecommendationForGap(gap, performance);
      if (rec) {
        recommendations.push(rec);
      }
    }

    // Add general recommendations based on tier distribution
    const poorPercentage = (performance.tier_distribution.poor / performance.total_messages) * 100;
    if (poorPercentage > 20) {
      recommendations.push({
        type: 'QUALITY_IMPROVEMENT',
        priority: 'HIGH',
        title: 'High percentage of poor quality messages',
        description: `${poorPercentage.toFixed(1)}% of messages rated as POOR quality`,
        action: 'Review and update underperforming templates',
        expected_impact: 'Reduce poor quality messages by 50%'
      });
    }

    return recommendations;
  }

  /**
   * Get specific recommendation for a performance gap
   */
  getRecommendationForGap(gap, performance) {
    const recommendations = {
      avg_quality: {
        type: 'OVERALL_QUALITY',
        title: 'Improve overall message quality',
        description: `Overall quality is ${gap.gap} points below target`,
        action: 'Review all quality dimensions and apply best practices from high-performing messages',
        expected_impact: `Increase quality score to ${gap.target}+`
      },
      avg_personalization: {
        type: 'PERSONALIZATION',
        title: 'Increase personalization depth',
        description: `Personalization score is ${gap.gap} points below target`,
        action: 'Add more dynamic variables, industry-specific insights, and custom research facts',
        expected_impact: `Improve personalization by ${Math.min(gap.gap + 5, 25)} points`
      },
      avg_relevance: {
        type: 'RELEVANCE',
        title: 'Improve message relevance',
        description: `Relevance score is ${gap.gap} points below target`,
        action: 'Better align message content with recipient context (industry, company size, pain points)',
        expected_impact: `Increase relevance score by ${Math.min(gap.gap + 5, 20)} points`
      },
      avg_clarity: {
        type: 'CLARITY',
        title: 'Enhance message clarity',
        description: `Clarity score is ${gap.gap} points below target`,
        action: 'Simplify language, shorten sentences, add clear structure and strong CTAs',
        expected_impact: `Improve clarity by ${Math.min(gap.gap + 5, 15)} points`
      },
      avg_engagement: {
        type: 'ENGAGEMENT',
        title: 'Boost engagement potential',
        description: `Engagement potential is ${gap.gap} points below target`,
        action: 'Strengthen subject lines, add compelling questions, emphasize value propositions',
        expected_impact: `Increase engagement potential by ${Math.min(gap.gap + 5, 20)} points`
      }
    };

    const rec = recommendations[gap.metric];
    if (!rec) return null;

    return {
      ...rec,
      priority: gap.severity,
      metric: gap.metric,
      current_score: gap.actual,
      target_score: gap.target,
      gap: gap.gap
    };
  }

  /**
   * Create optimization recommendation record
   */
  async createOptimization(params) {
    const {
      template_id = null,
      template_type = null,
      optimization_type,
      priority = 'MEDIUM',
      current_performance,
      performance_gap,
      recommendation_title,
      recommendation_details,
      expected_improvement,
      evidence = {},
      examples = []
    } = params;

    const query = `
      INSERT INTO outreach_template_optimizations (
        template_id,
        template_type,
        optimization_type,
        priority,
        current_performance,
        performance_gap,
        recommendation_title,
        recommendation_details,
        expected_improvement,
        evidence,
        examples,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      template_id,
      template_type,
      optimization_type,
      priority,
      JSON.stringify(current_performance),
      performance_gap,
      recommendation_title,
      recommendation_details,
      expected_improvement,
      JSON.stringify(evidence),
      JSON.stringify(examples),
      'PENDING'
    ]);

    return result.rows[0];
  }

  /**
   * Mark optimization as implemented
   */
  async implementOptimization(optimizationId, implementedBy) {
    const query = `
      UPDATE outreach_template_optimizations
      SET
        status = 'IMPLEMENTED',
        implemented_at = NOW(),
        implemented_by = $2
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [optimizationId, implementedBy]);
    return result.rows[0];
  }

  /**
   * Validate optimization results
   */
  async validateOptimization(optimizationId, actualImprovement, notes) {
    const query = `
      UPDATE outreach_template_optimizations
      SET
        actual_improvement = $2,
        validated = TRUE,
        validation_notes = $3
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      optimizationId,
      JSON.stringify(actualImprovement),
      notes
    ]);

    return result.rows[0];
  }

  /**
   * Get pending optimizations
   */
  async getPendingOptimizations(options = {}) {
    const { priority = null, limit = 20 } = options;

    let query = `
      SELECT * FROM outreach_template_optimizations
      WHERE status = 'PENDING'
    `;

    const params = [];

    if (priority) {
      params.push(priority);
      query += ` AND priority = $${params.length}`;
    }

    query += ` ORDER BY
      CASE priority
        WHEN 'HIGH' THEN 1
        WHEN 'MEDIUM' THEN 2
        WHEN 'LOW' THEN 3
      END,
      created_at DESC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get optimization history
   */
  async getOptimizationHistory(options = {}) {
    const { template_id = null, status = null, limit = 50 } = options;

    let query = 'SELECT * FROM outreach_template_optimizations WHERE 1=1';
    const params = [];

    if (template_id) {
      params.push(template_id);
      query += ` AND template_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get optimization statistics
   */
  async getOptimizationStats(days = 30) {
    const query = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'IMPLEMENTED') as implemented,
        COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected,
        COUNT(*) FILTER (WHERE validated = TRUE) as validated,
        COUNT(*) FILTER (WHERE priority = 'HIGH') as high_priority,
        AVG(CASE WHEN validated = TRUE THEN 1 ELSE 0 END) as validation_rate
      FROM outreach_template_optimizations
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `;

    const result = await this.pool.query(query);
    return result.rows[0];
  }

  /**
   * Compare templates
   */
  async compareTemplates(templateIds, days = 30) {
    const comparisons = [];

    for (const templateId of templateIds) {
      const performance = await this.getTemplatePerformance(templateId, days);
      comparisons.push({
        template_id: templateId,
        ...performance
      });
    }

    // Rank templates
    comparisons.sort((a, b) => parseFloat(b.avg_quality) - parseFloat(a.avg_quality));

    return {
      templates: comparisons,
      best_performer: comparisons[0],
      worst_performer: comparisons[comparisons.length - 1],
      avg_across_all: {
        avg_quality: (comparisons.reduce((sum, t) => sum + parseFloat(t.avg_quality), 0) / comparisons.length).toFixed(2),
        avg_personalization: (comparisons.reduce((sum, t) => sum + parseFloat(t.avg_personalization), 0) / comparisons.length).toFixed(2)
      }
    };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default OutreachTemplateOptimizationService;
