// routes/intelligence.js
// Company Intelligence API

import express from 'express';
import intelligenceSummarizer from '../services/intelligenceSummarizer.js';

const router = express.Router();

/**
 * GET /api/intelligence/:companyId
 *
 * Get or generate intelligence report for a company
 */
router.get('/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { maxAge } = req.query; // Optional: max age in days (default 7)

    const maxAgeDays = parseInt(maxAge) || 7;

    const report = await intelligenceSummarizer.getOrGenerateReport(
      companyId,
      maxAgeDays
    );

    res.json({
      ok: true,
      report
    });

  } catch (error) {
    console.error('[intelligence] Error:', error);

    res.status(500).json({
      ok: false,
      error: 'report_generation_failed',
      message: error.message
    });
  }
});

/**
 * POST /api/intelligence/:companyId/regenerate
 *
 * Force regenerate intelligence report
 */
router.post('/:companyId/regenerate', async (req, res) => {
  try {
    const { companyId } = req.params;

    const report = await intelligenceSummarizer.generateIntelligenceReport(companyId);

    res.json({
      ok: true,
      report,
      cached: false
    });

  } catch (error) {
    console.error('[intelligence] Regeneration error:', error);

    res.status(500).json({
      ok: false,
      error: 'regeneration_failed',
      message: error.message
    });
  }
});

export default router;
