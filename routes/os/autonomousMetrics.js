/**
 * S70: Autonomous Observability Routes
 * Sprint 70: Cost & Token Tracking + Performance Metrics
 *
 * API endpoints for metrics collection and retrieval
 */

import express from 'express';
import * as autonomousMetrics from '../../services/autonomousMetrics.js';

const router = express.Router();

// =====================================================
// LLM COST METRICS
// =====================================================

/**
 * POST /api/os/metrics/llm/usage
 * Record LLM token usage
 */
router.post('/llm/usage', async (req, res) => {
  try {
    const result = await autonomousMetrics.recordTokenUsage(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/metrics/llm/cost
 * Compute LLM cost (without recording)
 */
router.post('/llm/cost', async (req, res) => {
  try {
    const result = await autonomousMetrics.computeLLMCost(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/metrics/llm/stats
 * Get LLM usage statistics
 */
router.get('/llm/stats', async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      service,
      provider,
      model,
      verticalSlug,
      territoryId,
      groupBy
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const stats = await autonomousMetrics.getLLMUsageStats({
      startDate,
      endDate,
      service,
      provider,
      model,
      verticalSlug,
      territoryId,
      groupBy
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/metrics/cost
 * Get cost summary
 */
router.get('/cost', async (req, res) => {
  try {
    const { startDate, endDate, verticalSlug, territoryId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const stats = await autonomousMetrics.getCostStats({
      startDate,
      endDate,
      verticalSlug,
      territoryId
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/metrics/cost/trend
 * Get cost trend over time
 */
router.get('/cost/trend', async (req, res) => {
  try {
    const { days = 30, service, verticalSlug } = req.query;

    const trend = await autonomousMetrics.getCostTrend({
      days: parseInt(days),
      service,
      verticalSlug
    });

    res.json({ success: true, data: trend });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/metrics/cost/alerts
 * Check cost threshold alerts
 */
router.get('/cost/alerts', async (req, res) => {
  try {
    const { verticalSlug, territoryId } = req.query;

    const result = await autonomousMetrics.checkCostThresholds({
      verticalSlug,
      territoryId
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// PERFORMANCE METRICS
// =====================================================

/**
 * POST /api/os/metrics/performance
 * Record performance event
 */
router.post('/performance', async (req, res) => {
  try {
    const result = await autonomousMetrics.recordPerformanceEvent(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/metrics/performance
 * Get performance statistics
 */
router.get('/performance', async (req, res) => {
  try {
    const { startDate, endDate, service, operation, verticalSlug, territoryId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const stats = await autonomousMetrics.getPerformanceStats({
      startDate,
      endDate,
      service,
      operation,
      verticalSlug,
      territoryId
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/metrics/performance/realtime
 * Get real-time performance (last 24h)
 */
router.get('/performance/realtime', async (req, res) => {
  try {
    const { service, verticalSlug } = req.query;

    const stats = await autonomousMetrics.getRealtimePerformance({
      service,
      verticalSlug
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/metrics/errors
 * Get error summary
 */
router.get('/errors', async (req, res) => {
  try {
    const { startDate, endDate, service, verticalSlug, limit } = req.query;

    const errors = await autonomousMetrics.getErrorSummary({
      startDate,
      endDate,
      service,
      verticalSlug,
      limit: limit ? parseInt(limit) : 20
    });

    res.json({ success: true, data: errors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// CONVERSION / OUTREACH METRICS
// =====================================================

/**
 * GET /api/os/metrics/outreach/funnel
 * Get outreach conversion funnel
 */
router.get('/outreach/funnel', async (req, res) => {
  try {
    const { startDate, endDate, verticalSlug, territoryId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const funnel = await autonomousMetrics.getOutreachFunnel({
      startDate,
      endDate,
      verticalSlug,
      territoryId
    });

    res.json({ success: true, data: funnel });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/os/metrics/outreach/conversion
 * Update outreach conversion status
 */
router.put('/outreach/conversion', async (req, res) => {
  try {
    const { correlationId, opened, clicked, replied, converted } = req.body;

    if (!correlationId) {
      return res.status(400).json({
        success: false,
        error: 'correlationId is required'
      });
    }

    const result = await autonomousMetrics.updateOutreachConversion({
      correlationId,
      opened,
      clicked,
      replied,
      converted
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// DAILY SUMMARIES
// =====================================================

/**
 * GET /api/os/metrics/daily
 * Get daily summary
 */
router.get('/daily', async (req, res) => {
  try {
    const { date, service, verticalSlug, territoryId } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'date is required'
      });
    }

    const summary = await autonomousMetrics.getDailySummary({
      date,
      service,
      verticalSlug,
      territoryId
    });

    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/metrics/daily/range
 * Get daily summaries for date range
 */
router.get('/daily/range', async (req, res) => {
  try {
    const { startDate, endDate, service, verticalSlug } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const summaries = await autonomousMetrics.getDailySummaries({
      startDate,
      endDate,
      service,
      verticalSlug
    });

    res.json({ success: true, data: summaries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/metrics/daily/aggregate
 * Trigger daily summary aggregation
 */
router.post('/daily/aggregate', async (req, res) => {
  try {
    const { date } = req.body;

    const result = await autonomousMetrics.aggregateDailySummary(date);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// MODEL PRICING
// =====================================================

/**
 * GET /api/os/metrics/pricing
 * Get model pricing
 */
router.get('/pricing', async (req, res) => {
  try {
    const { provider, model, activeOnly } = req.query;

    const pricing = await autonomousMetrics.getModelPricing({
      provider,
      model,
      activeOnly: activeOnly !== 'false'
    });

    res.json({ success: true, data: pricing });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/os/metrics/pricing
 * Update model pricing
 */
router.put('/pricing', async (req, res) => {
  try {
    const {
      provider,
      model,
      inputPricePerMillionMicros,
      outputPricePerMillionMicros,
      cachedInputPricePerMillionMicros,
      modelVersion,
      notes
    } = req.body;

    if (!provider || !model || !inputPricePerMillionMicros || !outputPricePerMillionMicros) {
      return res.status(400).json({
        success: false,
        error: 'provider, model, inputPricePerMillionMicros, and outputPricePerMillionMicros are required'
      });
    }

    const result = await autonomousMetrics.updateModelPricing({
      provider,
      model,
      inputPricePerMillionMicros,
      outputPricePerMillionMicros,
      cachedInputPricePerMillionMicros,
      modelVersion,
      notes
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// HEALTH
// =====================================================

/**
 * GET /api/os/metrics/health
 * Get metrics health overview
 */
router.get('/health', async (req, res) => {
  try {
    const { verticalSlug, territoryId } = req.query;

    const health = await autonomousMetrics.getMetricsHealth({
      verticalSlug,
      territoryId
    });

    res.json({ success: true, data: health });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
