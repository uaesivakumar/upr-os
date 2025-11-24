const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { adminOnly } = require('../utils/adminOnly');

/**
 * POST /api/telemetry/track
 * Track user interactions for ML training and analytics
 */
router.post('/track', async (req, res) => {
  try {
    const {
      session_id,
      event_type,
      event_context,
      page_path,
    } = req.body;

    // Validate required fields
    if (!session_id || !event_type) {
      return res.status(400).json({
        error: 'Missing required fields: session_id, event_type',
      });
    }

    // Get user_id from session if authenticated
    const user_id = req.user?.id || null;

    // Insert telemetry record
    const result = await db.query(
      `INSERT INTO user_interactions
       (user_id, session_id, event_type, event_context, page_path, timestamp)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [user_id, session_id, event_type, event_context, page_path]
    );

    // Fire and forget - return immediately
    res.status(201).json({
      success: true,
      interaction_id: result.rows[0].id,
    });
  } catch (error) {
    console.error('Telemetry tracking error:', error);
    // Don't expose internal errors to client
    res.status(500).json({ error: 'Tracking failed' });
  }
});

/**
 * GET /api/telemetry/analytics
 * Get analytics summary (admin only)
 */
router.get('/analytics', adminOnly, async (req, res) => {
  try {
    // TODO: Add admin authentication check

    const { timeframe = '7d', event_type } = req.query;

    // Calculate time window
    const daysAgo = parseInt(timeframe) || 7;

    const query = `
      SELECT
        event_type,
        COUNT(*) as event_count,
        COUNT(DISTINCT session_id) as unique_sessions,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(CAST(event_context->>'duration_ms' AS NUMERIC)) as avg_duration_ms
      FROM user_interactions
      WHERE timestamp > NOW() - INTERVAL '${daysAgo} days'
      ${event_type ? `AND event_type = $1` : ''}
      GROUP BY event_type
      ORDER BY event_count DESC
    `;

    const result = await db.query(
      query,
      event_type ? [event_type] : []
    );

    res.json({
      timeframe: `${daysAgo}d`,
      analytics: result.rows,
    });
  } catch (error) {
    console.error('Analytics query error:', error);
    res.status(500).json({ error: 'Analytics query failed' });
  }
});

module.exports = router;
