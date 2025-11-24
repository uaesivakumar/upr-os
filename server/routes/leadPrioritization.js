/**
 * Lead Prioritization API
 * RESTful endpoints for lead scoring and prioritization
 */

import express from 'express';
import { LeadScoreCalculator } from '../services/leadScoreCalculator.js';
import { PriorityRankingService } from '../services/priorityRankingService.js';
import { ScoreMonitoringService } from '../services/scoreMonitoringService.js';
import { ScoreDecayService } from '../services/scoreDecayService.js';

const router = express.Router();

// Initialize services (will use DATABASE_URL from env)
const calculator = new LeadScoreCalculator();
const priorityService = new PriorityRankingService();
const monitoringService = new ScoreMonitoringService();
const decayService = new ScoreDecayService();

/**
 * GET /api/leads/prioritized
 * Get prioritized lead queue
 */
router.get('/prioritized', async (req, res) => {
  try {
    const {
      limit = 20,
      grade = null,
      minScore = 0,
      state = null,
      userId = null
    } = req.query;

    // Parse limit and minScore as numbers
    const parsedLimit = Math.min(parseInt(limit) || 20, 100); // Max 100
    const parsedMinScore = parseInt(minScore) || 0;

    // Build filters
    const filters = {
      minScore: parsedMinScore,
      limit: parsedLimit
    };

    if (grade) filters.grade = grade;
    if (state) filters.state = state;

    // Get prioritized leads
    let leads;
    if (userId) {
      leads = await priorityService.getLeadQueue(userId, parsedLimit, filters);
    } else {
      leads = await priorityService.getMostActionable(parsedLimit, filters);
    }

    // Get total count (rough estimate from all leads)
    const allLeads = await priorityService.rankLeads({ minScore: parsedMinScore, limit: 1000 });

    res.json({
      leads,
      meta: {
        total: allLeads.length,
        returned: leads.length,
        filters: {
          limit: parsedLimit,
          grade: grade || 'all',
          minScore: parsedMinScore,
          state: state || 'all',
          userId: userId || 'none'
        },
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching prioritized leads:', error);
    res.status(500).json({
      error: 'Failed to fetch prioritized leads',
      message: error.message
    });
  }
});

/**
 * POST /api/leads/:id/recalculate-score
 * Recalculate score for a specific lead
 */
router.post('/:id/recalculate-score', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        error: 'Invalid opportunity ID',
        message: 'Opportunity ID must be a valid UUID'
      });
    }

    // Calculate lead score
    const scoreResult = await calculator.calculateLeadScore(id);

    // Calculate priority score
    const priorityResult = await priorityService.calculatePriorityScore(id);

    res.json({
      opportunityId: id,
      score: scoreResult,
      priority: priorityResult,
      recalculatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error recalculating score for ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to recalculate score',
      message: error.message
    });
  }
});

/**
 * GET /api/leads/:id/score-history
 * Get score history for a lead
 */
router.get('/:id/score-history', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, startDate = null, endDate = null } = req.query;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        error: 'Invalid opportunity ID',
        message: 'Opportunity ID must be a valid UUID'
      });
    }

    const options = {
      limit: Math.min(parseInt(limit) || 50, 200), // Max 200
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null
    };

    const history = await monitoringService.getScoreHistory(id, options);

    // Get current score
    const currentScore = await calculator.getLeadScore(id);

    res.json({
      opportunityId: id,
      currentScore,
      history,
      meta: {
        count: history.length,
        limit: options.limit,
        startDate: options.startDate,
        endDate: options.endDate
      }
    });
  } catch (error) {
    console.error(`Error fetching score history for ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to fetch score history',
      message: error.message
    });
  }
});

/**
 * GET /api/leads/score-distribution
 * Get distribution of scores across all leads
 */
router.get('/score-distribution', async (req, res) => {
  try {
    const distribution = await calculator.getScoreDistribution();

    // Calculate totals
    const totals = {
      totalLeads: distribution.reduce((sum, d) => sum + d.count, 0),
      avgScore: distribution.reduce((sum, d) => sum + (d.avgScore * d.count), 0) /
                distribution.reduce((sum, d) => sum + d.count, 0) || 0,
      grades: distribution.map(d => ({
        grade: d.grade,
        count: d.count,
        percentage: 0 // Will calculate below
      }))
    };

    // Calculate percentages
    totals.grades.forEach(g => {
      g.percentage = ((g.count / totals.totalLeads) * 100).toFixed(1);
    });

    res.json({
      distribution,
      totals,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching score distribution:', error);
    res.status(500).json({
      error: 'Failed to fetch score distribution',
      message: error.message
    });
  }
});

/**
 * POST /api/leads/batch-recalculate
 * Batch recalculate scores (admin only)
 */
router.post('/batch-recalculate', async (req, res) => {
  try {
    const { opportunityIds, concurrency = 10 } = req.body;

    if (!Array.isArray(opportunityIds) || opportunityIds.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'opportunityIds must be a non-empty array'
      });
    }

    if (opportunityIds.length > 100) {
      return res.status(400).json({
        error: 'Too many opportunities',
        message: 'Maximum 100 opportunities per batch'
      });
    }

    // Batch calculate scores
    const results = await calculator.batchCalculateScores(
      opportunityIds,
      { concurrency: Math.min(parseInt(concurrency) || 10, 20) }
    );

    // Calculate priorities
    const priorityResults = await priorityService.batchCalculatePriority(
      opportunityIds.filter(id => !results.find(r => r.opportunityId === id && r.error)),
      { concurrency: Math.min(parseInt(concurrency) || 10, 20) }
    );

    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);

    res.json({
      summary: {
        total: opportunityIds.length,
        successful: successful.length,
        failed: failed.length
      },
      results,
      priorityResults,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error batch recalculating scores:', error);
    res.status(500).json({
      error: 'Failed to batch recalculate scores',
      message: error.message
    });
  }
});

/**
 * GET /api/leads/:id/decay-status
 * Get decay status for a lead
 */
router.get('/:id/decay-status', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        error: 'Invalid opportunity ID',
        message: 'Opportunity ID must be a valid UUID'
      });
    }

    const decayResult = await decayService.applyDecay(id);

    res.json({
      opportunityId: id,
      decay: decayResult,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error checking decay status for ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to check decay status',
      message: error.message
    });
  }
});

/**
 * POST /api/leads/apply-decay
 * Apply decay to all eligible leads (admin only)
 */
router.post('/apply-decay', async (req, res) => {
  try {
    const {
      dryRun = false,
      minDaysInactive = 7,
      limit = null,
      concurrency = 10
    } = req.body;

    const results = await decayService.batchApplyDecay({
      dryRun,
      minDaysInactive: parseInt(minDaysInactive) || 7,
      limit: limit ? parseInt(limit) : null,
      concurrency: Math.min(parseInt(concurrency) || 10, 20)
    });

    res.json({
      dryRun,
      results,
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error applying decay:', error);
    res.status(500).json({
      error: 'Failed to apply decay',
      message: error.message
    });
  }
});

/**
 * GET /api/leads/monitoring/alerts
 * Get recent score alerts
 */
router.get('/monitoring/alerts', async (req, res) => {
  try {
    const { days = 1 } = req.query;

    const alerts = await monitoringService.generateScoreAlerts({
      days: Math.min(parseInt(days) || 1, 30) // Max 30 days
    });

    res.json({
      alerts,
      count: alerts.length,
      period: `${days} days`,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating alerts:', error);
    res.status(500).json({
      error: 'Failed to generate alerts',
      message: error.message
    });
  }
});

/**
 * GET /api/leads/monitoring/trends
 * Get score trends
 */
router.get('/monitoring/trends', async (req, res) => {
  try {
    const { days = 30, granularity = 'day' } = req.query;

    const validGranularities = ['hour', 'day', 'week'];
    const selectedGranularity = validGranularities.includes(granularity) ? granularity : 'day';

    const trends = await monitoringService.getScoreTrends({
      days: Math.min(parseInt(days) || 30, 90), // Max 90 days
      granularity: selectedGranularity
    });

    res.json({
      trends,
      meta: {
        period: `${days} days`,
        granularity: selectedGranularity,
        dataPoints: trends.length
      },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching trends:', error);
    res.status(500).json({
      error: 'Failed to fetch trends',
      message: error.message
    });
  }
});

export default router;
