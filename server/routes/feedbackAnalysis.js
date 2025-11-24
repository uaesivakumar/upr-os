/**
 * Feedback Analysis API Routes
 * Sprint 41: Feedback Loop & Learning System
 *
 * Endpoints for analyzing feedback patterns and generating insights
 */

import express from 'express';
import FeedbackAnalysisService from '../services/feedbackAnalysis.js';

const router = express.Router();
const analysisService = new FeedbackAnalysisService();

/**
 * POST /api/feedback-analysis/decision/:decision_id
 * Analyze quality for a specific decision
 */
router.post('/decision/:decision_id', async (req, res) => {
  try {
    const { decision_id } = req.params;

    const analysis = await analysisService.analyzeDecisionQuality(decision_id);

    res.json({
      ok: true,
      analysis
    });

  } catch (error) {
    console.error('Error analyzing decision:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to analyze decision quality',
      details: error.message
    });
  }
});

/**
 * GET /api/feedback-analysis/patterns
 * Identify patterns in feedback data
 *
 * Query params:
 * - timeWindow: '7 days', '30 days', etc. (default: '30 days')
 * - minFeedbackCount: minimum feedback count to consider (default: 3)
 * - qualityThreshold: quality score threshold for poor performers (default: 50)
 */
router.get('/patterns', async (req, res) => {
  try {
    const {
      timeWindow = '30 days',
      minFeedbackCount = 3,
      qualityThreshold = 50
    } = req.query;

    const patterns = await analysisService.identifyPatterns({
      timeWindow,
      minFeedbackCount: parseInt(minFeedbackCount),
      qualityThreshold: parseFloat(qualityThreshold)
    });

    res.json({
      ok: true,
      patterns
    });

  } catch (error) {
    console.error('Error identifying patterns:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to identify patterns',
      details: error.message
    });
  }
});

/**
 * GET /api/feedback-analysis/improvement-plan
 * Generate improvement recommendations
 *
 * Query params:
 * - timeWindow: '7 days', '30 days', etc. (default: '30 days')
 * - minImpact: minimum number of decisions affected (default: 10)
 */
router.get('/improvement-plan', async (req, res) => {
  try {
    const {
      timeWindow = '30 days',
      minImpact = 10
    } = req.query;

    const plan = await analysisService.generateImprovementPlan({
      timeWindow,
      minImpact: parseInt(minImpact)
    });

    res.json({
      ok: true,
      plan
    });

  } catch (error) {
    console.error('Error generating improvement plan:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to generate improvement plan',
      details: error.message
    });
  }
});

/**
 * GET /api/feedback-analysis/trends
 * Get feedback trends over time
 *
 * Query params:
 * - agentType: filter by agent type (optional)
 * - days: number of days to analyze (default: 30)
 * - groupBy: 'hour', 'day', 'week' (default: 'day')
 */
router.get('/trends', async (req, res) => {
  try {
    const {
      agentType = null,
      days = 30,
      groupBy = 'day'
    } = req.query;

    const trends = await analysisService.getFeedbackTrends({
      agentType,
      days: parseInt(days),
      groupBy
    });

    res.json({
      ok: true,
      trends
    });

  } catch (error) {
    console.error('Error getting feedback trends:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to get feedback trends',
      details: error.message
    });
  }
});

/**
 * POST /api/feedback-analysis/store-pattern
 * Store an identified pattern for tracking
 *
 * Request body:
 * {
 *   type: 'failure_mode' | 'success_factor' | 'edge_case',
 *   agent_type: string (optional),
 *   description: string,
 *   frequency: number,
 *   severity: 'low' | 'medium' | 'high' | 'critical',
 *   example_decision_ids: uuid[]
 * }
 */
router.post('/store-pattern', async (req, res) => {
  try {
    const pattern = req.body;

    if (!pattern.type || !pattern.description) {
      return res.status(400).json({
        ok: false,
        error: 'pattern type and description are required'
      });
    }

    const stored = await analysisService.storePattern(pattern);

    res.json({
      ok: true,
      pattern: stored,
      message: 'Pattern stored successfully'
    });

  } catch (error) {
    console.error('Error storing pattern:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to store pattern',
      details: error.message
    });
  }
});

/**
 * GET /api/feedback-analysis/batch-analyze
 * Analyze quality for all decisions with feedback in a time window
 *
 * Query params:
 * - timeWindow: '7 days', '30 days', etc. (default: '7 days')
 * - minFeedbackCount: minimum feedback count (default: 1)
 */
router.get('/batch-analyze', async (req, res) => {
  try {
    const {
      timeWindow = '7 days',
      minFeedbackCount = 1
    } = req.query;

    // Get all decisions with feedback in the time window
    const decisionsQuery = `
      SELECT DISTINCT f.decision_id
      FROM agent_core.feedback f
      WHERE f.created_at >= NOW() - INTERVAL '${timeWindow}'
      GROUP BY f.decision_id
      HAVING COUNT(*) >= $1
      ORDER BY COUNT(*) DESC
      LIMIT 100
    `;

    const decisionsResult = await analysisService.pool?.query(decisionsQuery, [parseInt(minFeedbackCount)]);

    if (!decisionsResult || decisionsResult.rows.length === 0) {
      return res.json({
        ok: true,
        message: 'No decisions found with sufficient feedback',
        analyzed_count: 0,
        results: []
      });
    }

    // Analyze each decision
    const results = [];
    for (const row of decisionsResult.rows) {
      try {
        const analysis = await analysisService.analyzeDecisionQuality(row.decision_id);
        results.push(analysis);
      } catch (err) {
        console.error(`Error analyzing decision ${row.decision_id}:`, err.message);
      }
    }

    res.json({
      ok: true,
      analyzed_count: results.length,
      time_window: timeWindow,
      results: results.sort((a, b) => (a.quality_score || 0) - (b.quality_score || 0))
    });

  } catch (error) {
    console.error('Error in batch analysis:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to perform batch analysis',
      details: error.message
    });
  }
});

export default router;
