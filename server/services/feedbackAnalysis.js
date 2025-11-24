/**
 * Feedback Analysis Service
 * Sprint 41: Feedback Loop & Learning System
 *
 * Analyzes feedback patterns to identify improvement opportunities
 * Generates insights for model retraining and quality improvements
 */

import pg from 'pg';
const { Pool } = pg;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || '34.121.0.240',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'upr_production',
  user: process.env.DB_USER || 'upr_app',
  password: process.env.DB_PASSWORD || 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: process.env.DB_SSL === 'true'
});

class FeedbackAnalysisService {
  /**
   * Analyze decision quality for a specific decision
   * Calculates quality score and updates decision_quality_scores table
   */
  async analyzeDecisionQuality(decisionId) {
    try {
      // Calculate quality score using the database function
      const scoreResult = await pool.query(`
        SELECT agent_core.calculate_quality_score($1) as quality_score
      `, [decisionId]);

      const quality_score = scoreResult.rows[0].quality_score;

      if (quality_score === null) {
        return {
          decision_id: decisionId,
          quality_score: null,
          message: 'No feedback yet for this decision'
        };
      }

      // Get feedback breakdown
      const feedbackBreakdown = await pool.query(`
        SELECT
          COUNT(*) as total_feedback,
          COUNT(*) FILTER (WHERE feedback_type = 'thumbs_up' OR (rating >= 4)) as positive_count,
          COUNT(*) FILTER (WHERE feedback_type = 'thumbs_down' OR (rating <= 2)) as negative_count,
          AVG(rating) FILTER (WHERE rating IS NOT NULL) as avg_rating,
          COUNT(DISTINCT user_id) as unique_users
        FROM agent_core.feedback
        WHERE decision_id = $1
      `, [decisionId]);

      const breakdown = feedbackBreakdown.rows[0];

      // Calculate positive ratio
      const positive_ratio = breakdown.total_feedback > 0
        ? (parseInt(breakdown.positive_count) / parseInt(breakdown.total_feedback) * 100).toFixed(2)
        : 0;

      // Get agent decision details
      const decisionDetails = await pool.query(`
        SELECT tool_name, primitive_type, confidence_score, decided_at
        FROM agent_core.agent_decisions
        WHERE decision_id = $1
      `, [decisionId]);

      const decision = decisionDetails.rows[0];

      // Update decision_quality_scores table
      await pool.query(`
        INSERT INTO agent_core.decision_quality_scores (
          decision_id,
          quality_score,
          confidence_adjusted_score,
          feedback_count,
          positive_count,
          negative_count,
          positive_ratio,
          calculated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (decision_id) DO UPDATE
        SET
          quality_score = EXCLUDED.quality_score,
          confidence_adjusted_score = EXCLUDED.confidence_adjusted_score,
          feedback_count = EXCLUDED.feedback_count,
          positive_count = EXCLUDED.positive_count,
          negative_count = EXCLUDED.negative_count,
          positive_ratio = EXCLUDED.positive_ratio,
          calculated_at = EXCLUDED.calculated_at,
          updated_at = NOW()
      `, [
        decisionId,
        quality_score,
        decision ? quality_score * decision.confidence_score : quality_score,
        breakdown.total_feedback,
        breakdown.positive_count,
        breakdown.negative_count,
        positive_ratio
      ]);

      return {
        decision_id: decisionId,
        quality_score: parseFloat(quality_score),
        confidence_adjusted_score: decision
          ? parseFloat((quality_score * decision.confidence_score).toFixed(2))
          : parseFloat(quality_score),
        feedback_count: parseInt(breakdown.total_feedback),
        positive_count: parseInt(breakdown.positive_count),
        negative_count: parseInt(breakdown.negative_count),
        positive_ratio: parseFloat(positive_ratio),
        avg_rating: breakdown.avg_rating ? parseFloat(breakdown.avg_rating).toFixed(2) : null,
        agent_type: decision?.tool_name,
        agent_confidence: decision?.confidence_score,
        analyzed_at: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error analyzing decision quality:', error);
      throw error;
    }
  }

  /**
   * Identify patterns in feedback data
   * Finds common characteristics of good and bad decisions
   */
  async identifyPatterns(options = {}) {
    const {
      timeWindow = '30 days',
      minFeedbackCount = 3,
      qualityThreshold = 50
    } = options;

    try {
      // Find consistently poor-performing decision types
      const poorPerformers = await pool.query(`
        SELECT
          d.tool_name as agent_type,
          d.primitive_type as decision_type,
          COUNT(DISTINCT q.decision_id) as decision_count,
          AVG(q.quality_score) as avg_quality_score,
          AVG(q.positive_ratio) as avg_positive_ratio,
          SUM(q.feedback_count) as total_feedback,
          ARRAY_AGG(q.decision_id) FILTER (WHERE q.quality_score < $1) as poor_decision_ids
        FROM agent_core.decision_quality_scores q
        JOIN agent_core.agent_decisions d ON q.decision_id = d.decision_id
        WHERE q.calculated_at >= NOW() - INTERVAL '${timeWindow}'
        AND q.feedback_count >= $2
        GROUP BY d.tool_name, d.primitive_type
        HAVING AVG(q.quality_score) < $1
        ORDER BY avg_quality_score ASC
        LIMIT 10
      `, [qualityThreshold, minFeedbackCount]);

      // Find consistently high-performing decision types
      const topPerformers = await pool.query(`
        SELECT
          d.tool_name as agent_type,
          d.primitive_type as decision_type,
          COUNT(DISTINCT q.decision_id) as decision_count,
          AVG(q.quality_score) as avg_quality_score,
          AVG(q.positive_ratio) as avg_positive_ratio,
          SUM(q.feedback_count) as total_feedback,
          ARRAY_AGG(q.decision_id) FILTER (WHERE q.quality_score >= 80) as excellent_decision_ids
        FROM agent_core.decision_quality_scores q
        JOIN agent_core.agent_decisions d ON q.decision_id = d.decision_id
        WHERE q.calculated_at >= NOW() - INTERVAL '${timeWindow}'
        AND q.feedback_count >= $1
        GROUP BY d.tool_name, d.primitive_type
        HAVING AVG(q.quality_score) >= 80
        ORDER BY avg_quality_score DESC
        LIMIT 10
      `, [minFeedbackCount]);

      // Find edge cases (high variance in feedback)
      const edgeCases = await pool.query(`
        SELECT
          d.decision_id,
          d.tool_name as agent_type,
          d.primitive_type as decision_type,
          q.quality_score,
          q.positive_count,
          q.negative_count,
          q.feedback_count,
          d.confidence_score as agent_confidence
        FROM agent_core.decision_quality_scores q
        JOIN agent_core.agent_decisions d ON q.decision_id = d.decision_id
        WHERE q.calculated_at >= NOW() - INTERVAL '${timeWindow}'
        AND q.feedback_count >= $1
        AND q.positive_count > 0
        AND q.negative_count > 0
        AND ABS(q.positive_count - q.negative_count) <= 1  -- High variance/disagreement
        ORDER BY q.feedback_count DESC
        LIMIT 20
      `, [minFeedbackCount]);

      // Identify correction patterns
      const correctionPatterns = await pool.query(`
        SELECT
          d.tool_name as agent_type,
          d.primitive_type as decision_type,
          COUNT(*) as correction_count,
          COUNT(DISTINCT f.decision_id) as affected_decisions,
          ARRAY_AGG(f.decision_id ORDER BY f.created_at DESC) as recent_decision_ids
        FROM agent_core.feedback f
        JOIN agent_core.agent_decisions d ON f.decision_id = d.decision_id
        WHERE f.feedback_type = 'correction'
        AND f.created_at >= NOW() - INTERVAL '${timeWindow}'
        GROUP BY d.tool_name, d.primitive_type
        HAVING COUNT(*) >= 2
        ORDER BY correction_count DESC
        LIMIT 10
      `);

      return {
        analysis_period: timeWindow,
        analyzed_at: new Date().toISOString(),
        poor_performers: poorPerformers.rows.map(row => ({
          agent_type: row.agent_type,
          decision_type: row.decision_type,
          decision_count: parseInt(row.decision_count),
          avg_quality_score: parseFloat(row.avg_quality_score).toFixed(2),
          avg_positive_ratio: parseFloat(row.avg_positive_ratio).toFixed(2),
          total_feedback: parseInt(row.total_feedback),
          example_decision_ids: row.poor_decision_ids?.slice(0, 3) || []
        })),
        top_performers: topPerformers.rows.map(row => ({
          agent_type: row.agent_type,
          decision_type: row.decision_type,
          decision_count: parseInt(row.decision_count),
          avg_quality_score: parseFloat(row.avg_quality_score).toFixed(2),
          avg_positive_ratio: parseFloat(row.avg_positive_ratio).toFixed(2),
          total_feedback: parseInt(row.total_feedback),
          example_decision_ids: row.excellent_decision_ids?.slice(0, 3) || []
        })),
        edge_cases: edgeCases.rows.map(row => ({
          decision_id: row.decision_id,
          agent_type: row.agent_type,
          decision_type: row.decision_type,
          quality_score: parseFloat(row.quality_score),
          positive_count: parseInt(row.positive_count),
          negative_count: parseInt(row.negative_count),
          feedback_count: parseInt(row.feedback_count),
          agent_confidence: parseFloat(row.agent_confidence),
          variance_indicator: 'high_disagreement'
        })),
        correction_patterns: correctionPatterns.rows.map(row => ({
          agent_type: row.agent_type,
          decision_type: row.decision_type,
          correction_count: parseInt(row.correction_count),
          affected_decisions: parseInt(row.affected_decisions),
          recent_examples: row.recent_decision_ids?.slice(0, 3) || []
        }))
      };

    } catch (error) {
      console.error('Error identifying patterns:', error);
      throw error;
    }
  }

  /**
   * Generate improvement recommendations based on feedback analysis
   */
  async generateImprovementPlan(options = {}) {
    const {
      timeWindow = '30 days',
      minImpact = 10  // Minimum number of decisions affected
    } = options;

    try {
      const patterns = await this.identifyPatterns({ timeWindow, minFeedbackCount: 3 });

      const recommendations = [];

      // Recommendation 1: Address poor performers
      if (patterns.poor_performers.length > 0) {
        patterns.poor_performers.forEach(performer => {
          if (performer.decision_count >= minImpact) {
            recommendations.push({
              priority: 'high',
              type: 'poor_performance',
              agent_type: performer.agent_type,
              decision_type: performer.decision_type,
              issue: `Low quality score (${performer.avg_quality_score}) across ${performer.decision_count} decisions`,
              recommendation: 'Retrain model with corrected examples or adjust decision thresholds',
              impact: `${performer.decision_count} decisions affected`,
              example_decision_ids: performer.example_decision_ids,
              estimated_improvement: `Potential +${(100 - parseFloat(performer.avg_quality_score)).toFixed(0)}% quality increase`
            });
          }
        });
      }

      // Recommendation 2: Learn from top performers
      if (patterns.top_performers.length > 0) {
        patterns.top_performers.forEach(performer => {
          if (performer.decision_count >= 5) {
            recommendations.push({
              priority: 'medium',
              type: 'success_pattern',
              agent_type: performer.agent_type,
              decision_type: performer.decision_type,
              issue: `High quality score (${performer.avg_quality_score}) - success pattern identified`,
              recommendation: 'Extract features and patterns from these decisions to improve other agent types',
              impact: `Model for ${performer.decision_count} successful decisions`,
              example_decision_ids: performer.example_decision_ids,
              estimated_improvement: 'Can be used as training data for underperforming agents'
            });
          }
        });
      }

      // Recommendation 3: Resolve edge cases
      if (patterns.edge_cases.length > 0) {
        const highConfidenceDisagreements = patterns.edge_cases.filter(
          ec => ec.agent_confidence > 0.8 && ec.variance_indicator === 'high_disagreement'
        );

        if (highConfidenceDisagreements.length > 0) {
          recommendations.push({
            priority: 'high',
            type: 'edge_case_resolution',
            issue: `${highConfidenceDisagreements.length} decisions with high agent confidence but split user feedback`,
            recommendation: 'Review these edge cases to understand confidence vs. actual quality mismatch',
            impact: 'Could indicate overconfidence or unclear decision criteria',
            example_decision_ids: highConfidenceDisagreements.slice(0, 5).map(ec => ec.decision_id),
            estimated_improvement: 'Better calibrated confidence scores'
          });
        }
      }

      // Recommendation 4: Address correction patterns
      if (patterns.correction_patterns.length > 0) {
        patterns.correction_patterns.forEach(pattern => {
          if (pattern.correction_count >= 3) {
            recommendations.push({
              priority: 'critical',
              type: 'frequent_corrections',
              agent_type: pattern.agent_type,
              decision_type: pattern.decision_type,
              issue: `${pattern.correction_count} user corrections for this decision type`,
              recommendation: 'High priority for retraining - users are actively correcting these decisions',
              impact: `${pattern.affected_decisions} decisions need correction`,
              example_decision_ids: pattern.recent_examples,
              estimated_improvement: 'Direct user-provided corrections available as training data'
            });
          }
        });
      }

      // Sort by priority
      const priorityOrder = { critical: 1, high: 2, medium: 3, low: 4 };
      recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

      return {
        generated_at: new Date().toISOString(),
        analysis_period: timeWindow,
        total_recommendations: recommendations.length,
        recommendations,
        summary: {
          critical_issues: recommendations.filter(r => r.priority === 'critical').length,
          high_priority: recommendations.filter(r => r.priority === 'high').length,
          medium_priority: recommendations.filter(r => r.priority === 'medium').length,
          low_priority: recommendations.filter(r => r.priority === 'low').length
        }
      };

    } catch (error) {
      console.error('Error generating improvement plan:', error);
      throw error;
    }
  }

  /**
   * Get feedback trends over time
   */
  async getFeedbackTrends(options = {}) {
    const {
      agentType = null,
      days = 30,
      groupBy = 'day'  // 'hour', 'day', 'week'
    } = options;

    try {
      const intervalMap = {
        hour: '1 hour',
        day: '1 day',
        week: '1 week'
      };

      const interval = intervalMap[groupBy] || '1 day';

      let whereClause = `WHERE f.created_at >= NOW() - INTERVAL '${days} days'`;
      const params = [];
      let paramCount = 1;

      if (agentType) {
        whereClause += ` AND d.tool_name = $${paramCount}`;
        params.push(agentType);
        paramCount++;
      }

      const trendsQuery = `
        SELECT
          DATE_TRUNC('${groupBy}', f.created_at) as time_bucket,
          COUNT(DISTINCT f.id) as total_feedback,
          COUNT(*) FILTER (WHERE f.feedback_type = 'thumbs_up') as thumbs_up,
          COUNT(*) FILTER (WHERE f.feedback_type = 'thumbs_down') as thumbs_down,
          COUNT(*) FILTER (WHERE f.feedback_type = 'correction') as corrections,
          AVG(f.rating) FILTER (WHERE f.rating IS NOT NULL) as avg_rating,
          COUNT(DISTINCT f.decision_id) as unique_decisions,
          COUNT(DISTINCT f.user_id) as unique_users
        FROM agent_core.feedback f
        LEFT JOIN agent_core.agent_decisions d ON f.decision_id = d.decision_id
        ${whereClause}
        GROUP BY time_bucket
        ORDER BY time_bucket ASC
      `;

      const result = await pool.query(trendsQuery, params);

      return {
        period_days: days,
        group_by: groupBy,
        agent_type: agentType || 'all',
        data_points: result.rows.length,
        trends: result.rows.map(row => ({
          timestamp: row.time_bucket,
          total_feedback: parseInt(row.total_feedback),
          thumbs_up: parseInt(row.thumbs_up),
          thumbs_down: parseInt(row.thumbs_down),
          corrections: parseInt(row.corrections),
          avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(2) : null,
          unique_decisions: parseInt(row.unique_decisions),
          unique_users: parseInt(row.unique_users),
          sentiment_score: row.total_feedback > 0
            ? ((parseInt(row.thumbs_up) - parseInt(row.thumbs_down)) / parseInt(row.total_feedback) * 100).toFixed(2)
            : 0
        }))
      };

    } catch (error) {
      console.error('Error getting feedback trends:', error);
      throw error;
    }
  }

  /**
   * Store identified pattern in feedback_patterns table for tracking
   */
  async storePattern(pattern) {
    try {
      const result = await pool.query(`
        INSERT INTO agent_core.feedback_patterns (
          pattern_type,
          agent_type,
          description,
          frequency,
          severity,
          example_decisions,
          identified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id, pattern_type, severity, identified_at
      `, [
        pattern.type,
        pattern.agent_type || null,
        pattern.description,
        pattern.frequency || 1,
        pattern.severity || 'medium',
        pattern.example_decision_ids || []
      ]);

      return result.rows[0];

    } catch (error) {
      console.error('Error storing pattern:', error);
      throw error;
    }
  }

  /**
   * Close database connection pool
   */
  async close() {
    await pool.end();
  }
}

export default FeedbackAnalysisService;
