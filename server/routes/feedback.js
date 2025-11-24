/**
 * Feedback Collection API Routes
 * Sprint 41: Feedback Loop & Learning System
 *
 * Endpoints for collecting user feedback on AI agent decisions
 */

import express from 'express';
import pg from 'pg';

const router = express.Router();
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

/**
 * POST /api/feedback/decision
 * Submit feedback on an agent decision
 *
 * Request body:
 * {
 *   decision_id: uuid,
 *   feedback_type: 'thumbs_up' | 'thumbs_down' | 'correction' | 'rating' | 'comment',
 *   rating: 1-5 (optional),
 *   comment: string (optional),
 *   correction_data: object (optional) - corrected values if user provided them,
 *   context: object (optional) - page, filters, user state when feedback given
 * }
 */
router.post('/decision', async (req, res) => {
  try {
    const {
      decision_id,
      feedback_type,
      rating,
      comment,
      correction_data,
      context
    } = req.body;

    // Validation
    if (!decision_id) {
      return res.status(400).json({
        ok: false,
        error: 'decision_id is required'
      });
    }

    if (!feedback_type) {
      return res.status(400).json({
        ok: false,
        error: 'feedback_type is required'
      });
    }

    const validFeedbackTypes = ['thumbs_up', 'thumbs_down', 'correction', 'rating', 'comment'];
    if (!validFeedbackTypes.includes(feedback_type)) {
      return res.status(400).json({
        ok: false,
        error: `feedback_type must be one of: ${validFeedbackTypes.join(', ')}`
      });
    }

    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return res.status(400).json({
        ok: false,
        error: 'rating must be between 1 and 5'
      });
    }

    // Get user_id from authenticated session
    const user_id = req.user?.id || null;

    // Insert feedback
    const result = await pool.query(`
      INSERT INTO agent_core.feedback (
        decision_id,
        user_id,
        feedback_type,
        rating,
        comment,
        correction_data,
        context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, decision_id, feedback_type, rating, created_at
    `, [
      decision_id,
      user_id,
      feedback_type,
      rating || null,
      comment || null,
      correction_data ? JSON.stringify(correction_data) : null,
      context ? JSON.stringify(context) : null
    ]);

    const feedback = result.rows[0];

    // Calculate updated quality score for this decision
    const scoreResult = await pool.query(`
      SELECT agent_core.calculate_quality_score($1) as quality_score
    `, [decision_id]);

    const quality_score = scoreResult.rows[0].quality_score;

    // Update or insert quality score
    await pool.query(`
      INSERT INTO agent_core.decision_quality_scores (
        decision_id,
        quality_score,
        feedback_count,
        calculated_at
      )
      SELECT
        $1,
        $2,
        COUNT(*),
        NOW()
      FROM agent_core.feedback
      WHERE decision_id = $1
      ON CONFLICT (decision_id) DO UPDATE
      SET
        quality_score = EXCLUDED.quality_score,
        feedback_count = EXCLUDED.feedback_count,
        calculated_at = EXCLUDED.calculated_at,
        updated_at = NOW()
    `, [decision_id, quality_score]);

    res.json({
      ok: true,
      feedback: {
        id: feedback.id,
        decision_id: feedback.decision_id,
        feedback_type: feedback.feedback_type,
        rating: feedback.rating,
        created_at: feedback.created_at,
        quality_score
      },
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to submit feedback',
      details: error.message
    });
  }
});

/**
 * POST /api/feedback/rating
 * Submit a rating for an AI suggestion
 *
 * Request body:
 * {
 *   decision_id: uuid,
 *   rating: 1-5,
 *   comment: string (optional)
 * }
 */
router.post('/rating', async (req, res) => {
  try {
    const { decision_id, rating, comment } = req.body;

    if (!decision_id || !rating) {
      return res.status(400).json({
        ok: false,
        error: 'decision_id and rating are required'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        ok: false,
        error: 'rating must be between 1 and 5'
      });
    }

    const user_id = req.user?.id || null;

    const result = await pool.query(`
      INSERT INTO agent_core.feedback (
        decision_id,
        user_id,
        feedback_type,
        rating,
        comment
      ) VALUES ($1, $2, 'rating', $3, $4)
      RETURNING id, decision_id, rating, created_at
    `, [decision_id, user_id, rating, comment || null]);

    // Update quality score
    const scoreResult = await pool.query(`
      SELECT agent_core.calculate_quality_score($1) as quality_score
    `, [decision_id]);

    const quality_score = scoreResult.rows[0].quality_score;

    await pool.query(`
      INSERT INTO agent_core.decision_quality_scores (decision_id, quality_score, feedback_count, calculated_at)
      SELECT $1, $2, COUNT(*), NOW()
      FROM agent_core.feedback WHERE decision_id = $1
      ON CONFLICT (decision_id) DO UPDATE
      SET quality_score = EXCLUDED.quality_score, feedback_count = EXCLUDED.feedback_count,
          calculated_at = EXCLUDED.calculated_at, updated_at = NOW()
    `, [decision_id, quality_score]);

    res.json({
      ok: true,
      feedback: result.rows[0],
      quality_score,
      message: 'Rating submitted successfully'
    });

  } catch (error) {
    console.error('Error submitting rating:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to submit rating',
      details: error.message
    });
  }
});

/**
 * POST /api/feedback/correction
 * Submit a correction for an AI decision
 *
 * Request body:
 * {
 *   decision_id: uuid,
 *   correction_data: object - the corrected values,
 *   comment: string (optional) - explanation of correction
 * }
 */
router.post('/correction', async (req, res) => {
  try {
    const { decision_id, correction_data, comment } = req.body;

    if (!decision_id || !correction_data) {
      return res.status(400).json({
        ok: false,
        error: 'decision_id and correction_data are required'
      });
    }

    const user_id = req.user?.id || null;

    const result = await pool.query(`
      INSERT INTO agent_core.feedback (
        decision_id,
        user_id,
        feedback_type,
        rating,
        comment,
        correction_data
      ) VALUES ($1, $2, 'correction', 1, $3, $4)
      RETURNING id, decision_id, correction_data, created_at
    `, [decision_id, user_id, comment || null, JSON.stringify(correction_data)]);

    // Update quality score (corrections are treated as negative feedback)
    const scoreResult = await pool.query(`
      SELECT agent_core.calculate_quality_score($1) as quality_score
    `, [decision_id]);

    const quality_score = scoreResult.rows[0].quality_score;

    await pool.query(`
      INSERT INTO agent_core.decision_quality_scores (decision_id, quality_score, feedback_count, calculated_at)
      SELECT $1, $2, COUNT(*), NOW()
      FROM agent_core.feedback WHERE decision_id = $1
      ON CONFLICT (decision_id) DO UPDATE
      SET quality_score = EXCLUDED.quality_score, feedback_count = EXCLUDED.feedback_count,
          calculated_at = EXCLUDED.calculated_at, updated_at = NOW()
    `, [decision_id, quality_score]);

    // Create training sample from correction
    const decisionResult = await pool.query(`
      SELECT tool_name, input_data, output_data
      FROM agent_core.agent_decisions
      WHERE decision_id = $1
    `, [decision_id]);

    if (decisionResult.rows.length > 0) {
      const decision = decisionResult.rows[0];

      await pool.query(`
        INSERT INTO agent_core.training_samples (
          model_type,
          input_data,
          expected_output,
          source,
          source_id,
          quality_score
        ) VALUES ($1, $2, $3, 'user_feedback', $4, 100)
      `, [
        decision.tool_name,
        decision.input_data,
        JSON.stringify(correction_data),
        result.rows[0].id
      ]);
    }

    res.json({
      ok: true,
      feedback: result.rows[0],
      quality_score,
      message: 'Correction submitted successfully and added to training data'
    });

  } catch (error) {
    console.error('Error submitting correction:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to submit correction',
      details: error.message
    });
  }
});

/**
 * GET /api/feedback/stats
 * Get feedback statistics and analytics
 *
 * Query params:
 * - agent_type: filter by agent type (optional)
 * - decision_type: filter by decision type (optional)
 * - days: number of days to look back (default: 7)
 */
router.get('/stats', async (req, res) => {
  try {
    const { agent_type, decision_type, days = 7 } = req.query;

    let whereClause = `WHERE f.created_at >= NOW() - INTERVAL '${parseInt(days)} days'`;
    const params = [];
    let paramCount = 1;

    if (agent_type) {
      whereClause += ` AND d.tool_name = $${paramCount}`;
      params.push(agent_type);
      paramCount++;
    }

    if (decision_type) {
      whereClause += ` AND d.primitive_type = $${paramCount}`;
      params.push(decision_type);
      paramCount++;
    }

    const statsQuery = `
      SELECT
        COUNT(DISTINCT f.id) as total_feedback,
        COUNT(DISTINCT f.decision_id) as decisions_with_feedback,
        COUNT(*) FILTER (WHERE f.feedback_type = 'thumbs_up') as thumbs_up_count,
        COUNT(*) FILTER (WHERE f.feedback_type = 'thumbs_down') as thumbs_down_count,
        COUNT(*) FILTER (WHERE f.feedback_type = 'correction') as correction_count,
        COUNT(*) FILTER (WHERE f.rating IS NOT NULL) as rating_count,
        AVG(f.rating) FILTER (WHERE f.rating IS NOT NULL) as avg_rating,
        COUNT(DISTINCT f.user_id) as unique_users,
        MIN(f.created_at) as oldest_feedback,
        MAX(f.created_at) as newest_feedback
      FROM agent_core.feedback f
      LEFT JOIN agent_core.agent_decisions d ON f.decision_id = d.decision_id
      ${whereClause}
    `;

    const statsResult = await pool.query(statsQuery, params);
    const stats = statsResult.rows[0];

    // Get quality score distribution
    const qualityDistQuery = `
      SELECT
        CASE
          WHEN quality_score >= 80 THEN 'excellent'
          WHEN quality_score >= 60 THEN 'good'
          WHEN quality_score >= 40 THEN 'fair'
          ELSE 'poor'
        END as quality_tier,
        COUNT(*) as count
      FROM agent_core.decision_quality_scores
      GROUP BY quality_tier
      ORDER BY
        CASE quality_tier
          WHEN 'excellent' THEN 1
          WHEN 'good' THEN 2
          WHEN 'fair' THEN 3
          WHEN 'poor' THEN 4
        END
    `;

    const qualityDistResult = await pool.query(qualityDistQuery);

    // Get feedback trends by agent type
    const trendQuery = `
      SELECT
        d.tool_name as agent_type,
        COUNT(f.id) as feedback_count,
        AVG(f.rating) FILTER (WHERE f.rating IS NOT NULL) as avg_rating,
        COUNT(*) FILTER (WHERE f.feedback_type IN ('thumbs_up', 'rating') AND f.rating >= 4) as positive_count,
        COUNT(*) FILTER (WHERE f.feedback_type IN ('thumbs_down', 'rating') AND f.rating <= 2) as negative_count
      FROM agent_core.feedback f
      JOIN agent_core.agent_decisions d ON f.decision_id = d.decision_id
      ${whereClause}
      GROUP BY d.tool_name
      ORDER BY feedback_count DESC
      LIMIT 10
    `;

    const trendResult = await pool.query(trendQuery, params);

    res.json({
      ok: true,
      stats: {
        period_days: parseInt(days),
        total_feedback: parseInt(stats.total_feedback),
        decisions_with_feedback: parseInt(stats.decisions_with_feedback),
        thumbs_up: parseInt(stats.thumbs_up_count),
        thumbs_down: parseInt(stats.thumbs_down_count),
        corrections: parseInt(stats.correction_count),
        ratings: parseInt(stats.rating_count),
        avg_rating: stats.avg_rating ? parseFloat(stats.avg_rating).toFixed(2) : null,
        unique_users: parseInt(stats.unique_users),
        date_range: {
          from: stats.oldest_feedback,
          to: stats.newest_feedback
        }
      },
      quality_distribution: qualityDistResult.rows,
      agent_trends: trendResult.rows.map(row => ({
        agent_type: row.agent_type,
        feedback_count: parseInt(row.feedback_count),
        avg_rating: row.avg_rating ? parseFloat(row.avg_rating).toFixed(2) : null,
        positive_count: parseInt(row.positive_count),
        negative_count: parseInt(row.negative_count),
        sentiment_ratio: row.positive_count > 0
          ? (row.positive_count / (row.positive_count + row.negative_count)).toFixed(2)
          : '0.00'
      }))
    });

  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch feedback statistics',
      details: error.message
    });
  }
});

/**
 * GET /api/feedback/decision/:decision_id
 * Get all feedback for a specific decision
 */
router.get('/decision/:decision_id', async (req, res) => {
  try {
    const { decision_id } = req.params;

    const feedbackResult = await pool.query(`
      SELECT
        f.id,
        f.feedback_type,
        f.rating,
        f.comment,
        f.correction_data,
        f.context,
        f.created_at,
        q.quality_score
      FROM agent_core.feedback f
      LEFT JOIN agent_core.decision_quality_scores q ON q.decision_id = f.decision_id
      WHERE f.decision_id = $1
      ORDER BY f.created_at DESC
    `, [decision_id]);

    res.json({
      ok: true,
      decision_id,
      feedback: feedbackResult.rows,
      count: feedbackResult.rows.length
    });

  } catch (error) {
    console.error('Error fetching decision feedback:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch decision feedback',
      details: error.message
    });
  }
});

/**
 * GET /api/feedback/quality/:decision_id
 * Get quality score for a specific decision
 */
router.get('/quality/:decision_id', async (req, res) => {
  try {
    const { decision_id } = req.params;

    const result = await pool.query(`
      SELECT
        q.quality_score,
        q.confidence_adjusted_score,
        q.feedback_count,
        q.positive_count,
        q.negative_count,
        q.positive_ratio,
        q.calculated_at,
        d.tool_name as agent_type,
        d.confidence_score as agent_confidence
      FROM agent_core.decision_quality_scores q
      JOIN agent_core.agent_decisions d ON q.decision_id = d.decision_id
      WHERE q.decision_id = $1
    `, [decision_id]);

    if (result.rows.length === 0) {
      return res.json({
        ok: true,
        decision_id,
        quality_score: null,
        message: 'No feedback yet for this decision'
      });
    }

    res.json({
      ok: true,
      decision_id,
      quality: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching quality score:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch quality score',
      details: error.message
    });
  }
});

export default router;
