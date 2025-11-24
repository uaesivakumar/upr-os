/**
 * Outreach Feedback Integration Service
 * Sprint 45 - Feedback loop for continuous improvement
 *
 * Capabilities:
 * - Capture feedback from multiple sources
 * - Process and analyze feedback
 * - Generate actionable insights
 * - Auto-improve based on feedback
 * - Sentiment analysis
 */

import pg from 'pg';
const { Pool } = pg;

export class OutreachFeedbackService {
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
   * Capture feedback
   */
  async captureFeedback(params) {
    const {
      message_id,
      feedback_type, // HUMAN, AUTO, RECIPIENT
      feedback_source,
      overall_rating = null,
      personalization_rating = null,
      relevance_rating = null,
      tone_rating = null,
      feedback_text = null,
      improvement_suggestions = null,
      was_sent = false,
      recipient_responded = false,
      positive_outcome = null
    } = params;

    // Analyze sentiment if text provided
    let sentiment = null;
    let sentiment_score = null;

    if (feedback_text) {
      const sentimentAnalysis = this.analyzeSentiment(feedback_text);
      sentiment = sentimentAnalysis.sentiment;
      sentiment_score = sentimentAnalysis.score;
    }

    const query = `
      INSERT INTO outreach_feedback (
        message_id,
        feedback_type,
        feedback_source,
        overall_rating,
        personalization_rating,
        relevance_rating,
        tone_rating,
        feedback_text,
        improvement_suggestions,
        was_sent,
        recipient_responded,
        positive_outcome,
        sentiment,
        sentiment_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      message_id,
      feedback_type,
      feedback_source,
      overall_rating,
      personalization_rating,
      relevance_rating,
      tone_rating,
      feedback_text,
      improvement_suggestions,
      was_sent,
      recipient_responded,
      positive_outcome,
      sentiment,
      sentiment_score
    ]);

    return result.rows[0];
  }

  /**
   * Analyze sentiment (simplified - in production would use AI)
   */
  analyzeSentiment(text) {
    const lowerText = text.toLowerCase();

    // Positive keywords
    const positiveWords = ['great', 'excellent', 'good', 'helpful', 'clear', 'relevant', 'perfect', 'love'];
    const negativeWords = ['poor', 'bad', 'confusing', 'irrelevant', 'spam', 'terrible', 'hate', 'useless'];

    let positiveCount = 0;
    let negativeCount = 0;

    positiveWords.forEach(word => {
      if (lowerText.includes(word)) positiveCount++;
    });

    negativeWords.forEach(word => {
      if (lowerText.includes(word)) negativeCount++;
    });

    const totalWords = positiveCount + negativeCount;

    if (totalWords === 0) {
      return { sentiment: 'NEUTRAL', score: 0 };
    }

    const score = ((positiveCount - negativeCount) / totalWords).toFixed(2);

    let sentiment;
    if (score > 0.3) sentiment = 'POSITIVE';
    else if (score < -0.3) sentiment = 'NEGATIVE';
    else sentiment = 'NEUTRAL';

    return { sentiment, score: parseFloat(score) };
  }

  /**
   * Process unprocessed feedback
   */
  async processFeedback(options = {}) {
    const { limit = 50 } = options;

    // Get unprocessed feedback
    const query = `
      SELECT * FROM outreach_feedback
      WHERE processed_at IS NULL
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);
    const feedbacks = result.rows;

    const processed = [];
    const actions = [];

    for (const feedback of feedbacks) {
      // Analyze feedback and determine actions
      const feedbackActions = await this.determineFeedbackActions(feedback);

      actions.push(...feedbackActions);

      // Mark as processed
      await this.pool.query(`
        UPDATE outreach_feedback
        SET
          processed_at = NOW(),
          actions_taken = $2,
          incorporated = TRUE
        WHERE id = $1
      `, [feedback.id, JSON.stringify(feedbackActions)]);

      processed.push(feedback.id);
    }

    return {
      processed_count: processed.length,
      actions_generated: actions.length,
      actions
    };
  }

  /**
   * Determine actions from feedback
   */
  async determineFeedbackActions(feedback) {
    const actions = [];

    // Low overall rating
    if (feedback.overall_rating && feedback.overall_rating <= 2) {
      actions.push({
        type: 'REVIEW_MESSAGE',
        priority: 'HIGH',
        message_id: feedback.message_id,
        reason: `Low overall rating (${feedback.overall_rating}/5)`,
        recommendation: 'Review message quality and template'
      });
    }

    // Low personalization rating
    if (feedback.personalization_rating && feedback.personalization_rating <= 2) {
      actions.push({
        type: 'IMPROVE_PERSONALIZATION',
        priority: 'HIGH',
        message_id: feedback.message_id,
        reason: `Low personalization rating (${feedback.personalization_rating}/5)`,
        recommendation: 'Add more dynamic variables and context'
      });
    }

    // Negative sentiment
    if (feedback.sentiment === 'NEGATIVE') {
      actions.push({
        type: 'TEMPLATE_REVIEW',
        priority: 'HIGH',
        reason: 'Negative sentiment detected',
        recommendation: 'Review and potentially pause template'
      });
    }

    // Improvement suggestions provided
    if (feedback.improvement_suggestions) {
      actions.push({
        type: 'APPLY_SUGGESTIONS',
        priority: 'MEDIUM',
        suggestions: feedback.improvement_suggestions,
        recommendation: 'Incorporate suggestions into templates'
      });
    }

    // Positive outcome
    if (feedback.positive_outcome) {
      actions.push({
        type: 'REPLICATE_SUCCESS',
        priority: 'LOW',
        message_id: feedback.message_id,
        recommendation: 'Analyze successful patterns and replicate'
      });
    }

    return actions;
  }

  /**
   * Get feedback insights
   */
  async getFeedbackInsights(options = {}) {
    const { days = 30, feedback_type = null } = options;

    let query = `
      SELECT
        COUNT(*) as total_feedback,
        AVG(overall_rating) as avg_overall_rating,
        AVG(personalization_rating) as avg_personalization_rating,
        AVG(relevance_rating) as avg_relevance_rating,
        AVG(tone_rating) as avg_tone_rating,
        COUNT(*) FILTER (WHERE sentiment = 'POSITIVE') as positive_count,
        COUNT(*) FILTER (WHERE sentiment = 'NEGATIVE') as negative_count,
        COUNT(*) FILTER (WHERE sentiment = 'NEUTRAL') as neutral_count,
        COUNT(*) FILTER (WHERE positive_outcome = TRUE) as positive_outcomes,
        COUNT(*) FILTER (WHERE recipient_responded = TRUE) as responses,
        COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed
      FROM outreach_feedback
      WHERE created_at >= NOW() - INTERVAL '${days} days'
    `;

    const params = [];

    if (feedback_type) {
      params.push(feedback_type);
      query += ` AND feedback_type = $${params.length}`;
    }

    const result = await this.pool.query(query, params);
    const data = result.rows[0];

    return {
      total: parseInt(data.total_feedback) || 0,
      ratings: {
        overall: parseFloat(data.avg_overall_rating || 0).toFixed(2),
        personalization: parseFloat(data.avg_personalization_rating || 0).toFixed(2),
        relevance: parseFloat(data.avg_relevance_rating || 0).toFixed(2),
        tone: parseFloat(data.avg_tone_rating || 0).toFixed(2)
      },
      sentiment: {
        positive: parseInt(data.positive_count) || 0,
        negative: parseInt(data.negative_count) || 0,
        neutral: parseInt(data.neutral_count) || 0,
        positive_percentage: data.total_feedback > 0
          ? ((parseInt(data.positive_count) / parseInt(data.total_feedback)) * 100).toFixed(1)
          : '0.0'
      },
      outcomes: {
        positive: parseInt(data.positive_outcomes) || 0,
        responses: parseInt(data.responses) || 0,
        success_rate: data.total_feedback > 0
          ? ((parseInt(data.positive_outcomes) / parseInt(data.total_feedback)) * 100).toFixed(1)
          : '0.0'
      },
      processing: {
        total: parseInt(data.total_feedback) || 0,
        processed: parseInt(data.processed) || 0,
        pending: parseInt(data.total_feedback) - parseInt(data.processed),
        processing_rate: data.total_feedback > 0
          ? ((parseInt(data.processed) / parseInt(data.total_feedback)) * 100).toFixed(1)
          : '0.0'
      }
    };
  }

  /**
   * Get common feedback themes
   */
  async getFeedbackThemes(days = 30) {
    const query = `
      SELECT
        feedback_text,
        improvement_suggestions,
        sentiment,
        overall_rating
      FROM outreach_feedback
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND (feedback_text IS NOT NULL OR improvement_suggestions IS NOT NULL)
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const result = await this.pool.query(query);

    // Analyze themes (simplified - in production would use NLP)
    const themes = this.extractThemes(result.rows);

    return themes;
  }

  /**
   * Extract feedback themes (simplified)
   */
  extractThemes(feedbacks) {
    const themeKeywords = {
      personalization: ['personalize', 'generic', 'name', 'company', 'specific'],
      relevance: ['relevant', 'industry', 'apply', 'context'],
      clarity: ['clear', 'confusing', 'understand', 'simple'],
      tone: ['tone', 'formal', 'casual', 'professional'],
      length: ['long', 'short', 'concise', 'brief', 'detailed']
    };

    const themeCounts = {};

    Object.keys(themeKeywords).forEach(theme => {
      themeCounts[theme] = 0;
    });

    feedbacks.forEach(feedback => {
      const text = (feedback.feedback_text || '') + ' ' + (feedback.improvement_suggestions || '');
      const lowerText = text.toLowerCase();

      Object.entries(themeKeywords).forEach(([theme, keywords]) => {
        keywords.forEach(keyword => {
          if (lowerText.includes(keyword)) {
            themeCounts[theme]++;
          }
        });
      });
    });

    // Convert to array and sort
    const themes = Object.entries(themeCounts)
      .map(([theme, count]) => ({
        theme,
        mentions: count,
        percentage: ((count / feedbacks.length) * 100).toFixed(1)
      }))
      .filter(t => t.mentions > 0)
      .sort((a, b) => b.mentions - a.mentions);

    return themes;
  }

  /**
   * Get feedback for specific message
   */
  async getMessageFeedback(messageId) {
    const query = `
      SELECT * FROM outreach_feedback
      WHERE message_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [messageId]);
    return result.rows;
  }

  /**
   * Generate improvement plan from feedback
   */
  async generateImprovementPlan(days = 30) {
    const insights = await this.getFeedbackInsights({ days });
    const themes = await this.getFeedbackThemes(days);

    const plan = {
      analysis_period: `${days} days`,
      total_feedback: insights.total,
      avg_rating: insights.ratings.overall,

      priorities: [],

      recommendations: []
    };

    // Identify priorities based on low ratings
    if (parseFloat(insights.ratings.personalization) < 3.5) {
      plan.priorities.push({
        area: 'Personalization',
        current_rating: insights.ratings.personalization,
        target_rating: 4.0,
        urgency: 'HIGH'
      });

      plan.recommendations.push({
        category: 'Personalization',
        action: 'Increase use of dynamic variables and industry-specific insights',
        expected_impact: 'Improve personalization rating to 4.0+'
      });
    }

    if (parseFloat(insights.ratings.relevance) < 3.5) {
      plan.priorities.push({
        area: 'Relevance',
        current_rating: insights.ratings.relevance,
        target_rating: 4.0,
        urgency: 'HIGH'
      });

      plan.recommendations.push({
        category: 'Relevance',
        action: 'Better match message content to recipient context',
        expected_impact: 'Improve relevance rating to 4.0+'
      });
    }

    // Add theme-based recommendations
    themes.slice(0, 3).forEach(theme => {
      plan.recommendations.push({
        category: theme.theme,
        action: `Address ${theme.theme} concerns (${theme.mentions} mentions)`,
        expected_impact: `Reduce ${theme.theme} related feedback by 50%`
      });
    });

    return plan;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default OutreachFeedbackService;
