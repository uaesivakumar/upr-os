/**
 * LinkedIn Signal Routes
 * Sprint 18, Task 5: LinkedIn Signal Source
 *
 * API endpoints for LinkedIn signal detection and import
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import LinkedInSignalService from '../server/services/linkedinSignals.js';
import pool from '../server/db.js';

const router = express.Router();

/**
 * POST /api/linkedin/detect
 * Detect signals from LinkedIn company URL
 *
 * Body:
 * {
 *   "companyLinkedInUrl": "https://www.linkedin.com/company/example",
 *   "tenantId": "uuid",
 *   "apiProvider": "rapidapi" | "phantombuster" | "manual",
 *   "limit": 20
 * }
 */
router.post('/detect', async (req, res) => {
  try {
    const {
      companyLinkedInUrl,
      tenantId,
      apiProvider = 'rapidapi',
      limit = 20
    } = req.body;

    // Validate inputs
    if (!companyLinkedInUrl) {
      return res.status(400).json({
        error: 'Missing companyLinkedInUrl'
      });
    }

    if (!LinkedInSignalService.isValidLinkedInUrl(companyLinkedInUrl)) {
      return res.status(400).json({
        error: 'Invalid LinkedIn company URL'
      });
    }

    if (!tenantId) {
      return res.status(400).json({
        error: 'Missing tenantId'
      });
    }

    // Detect signals
    const signals = await LinkedInSignalService.detectSignals({
      companyLinkedInUrl,
      apiProvider,
      limit
    });

    // Save signals to database
    let savedSignals = [];

    for (const signal of signals) {
      try {
        const result = await pool.query(
          `INSERT INTO hiring_signals (
            tenant_id,
            company,
            domain,
            sector,
            trigger_type,
            description,
            source_url,
            source_date,
            evidence_quote,
            evidence_note,
            location,
            geo_status,
            geo_hints,
            confidence_score,
            source_type,
            review_status,
            notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', $16)
          ON CONFLICT DO NOTHING
          RETURNING *`,
          [
            tenantId,
            signal.company,
            signal.domain,
            signal.sector,
            signal.trigger_type,
            signal.description,
            signal.source_url,
            signal.source_date,
            signal.evidence_quote,
            signal.evidence_note,
            signal.location,
            signal.geo_status,
            signal.geo_hints || [],
            signal.confidence_score || 0.65, // Default LinkedIn confidence
            signal.source_type,
            JSON.stringify({
              source: 'linkedin',
              api_provider: apiProvider,
              raw_data: signal.raw_data
            })
          ]
        );

        if (result.rows.length > 0) {
          savedSignals.push(result.rows[0]);
        }
      } catch (error) {
        console.error('Error saving signal:', error);
        // Continue with next signal
      }
    }

    res.json({
      success: true,
      signals_detected: signals.length,
      signals_saved: savedSignals.length,
      signals: savedSignals
    });
  } catch (error) {
    console.error('LinkedIn detect error:', error);
    Sentry.captureException(error, {
      tags: {
        route: '/api/linkedin/detect'
      }
    });

    res.status(500).json({
      error: 'Failed to detect LinkedIn signals',
      message: error.message
    });
  }
});

/**
 * POST /api/linkedin/import-csv
 * Import LinkedIn signals from CSV file
 *
 * Body:
 * {
 *   "csvContent": "company,description,date,...",
 *   "tenantId": "uuid"
 * }
 */
router.post('/import-csv', async (req, res) => {
  try {
    const { csvContent, tenantId } = req.body;

    if (!csvContent || !tenantId) {
      return res.status(400).json({
        error: 'Missing csvContent or tenantId'
      });
    }

    // Parse CSV
    const signals = LinkedInSignalService.parseCSV(csvContent);

    // Save to database
    let savedSignals = [];

    for (const signal of signals) {
      try {
        const result = await pool.query(
          `INSERT INTO hiring_signals (
            tenant_id,
            company,
            domain,
            sector,
            trigger_type,
            description,
            source_url,
            source_date,
            evidence_quote,
            evidence_note,
            location,
            geo_status,
            geo_hints,
            confidence_score,
            source_type,
            review_status,
            notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pending', $16)
          ON CONFLICT DO NOTHING
          RETURNING *`,
          [
            tenantId,
            signal.company,
            signal.domain,
            signal.sector,
            signal.trigger_type,
            signal.description,
            signal.source_url,
            signal.source_date,
            signal.evidence_quote,
            signal.evidence_note,
            signal.location,
            signal.geo_status,
            signal.geo_hints || [],
            signal.confidence_score || 0.65,
            signal.source_type,
            JSON.stringify({
              source: 'linkedin_csv_import',
              imported_at: new Date().toISOString()
            })
          ]
        );

        if (result.rows.length > 0) {
          savedSignals.push(result.rows[0]);
        }
      } catch (error) {
        console.error('Error saving CSV signal:', error);
      }
    }

    res.json({
      success: true,
      signals_parsed: signals.length,
      signals_saved: savedSignals.length,
      signals: savedSignals
    });
  } catch (error) {
    console.error('LinkedIn CSV import error:', error);
    Sentry.captureException(error, {
      tags: {
        route: '/api/linkedin/import-csv'
      }
    });

    res.status(500).json({
      error: 'Failed to import LinkedIn CSV',
      message: error.message
    });
  }
});

/**
 * GET /api/linkedin/test
 * Test LinkedIn API connectivity
 */
router.get('/test', async (req, res) => {
  try {
    const { apiProvider = 'rapidapi' } = req.query;

    // Check if API keys are configured
    let configured = false;
    let message = '';

    if (apiProvider === 'rapidapi') {
      configured = !!process.env.RAPIDAPI_KEY;
      message = configured
        ? 'RapidAPI key is configured'
        : 'RAPIDAPI_KEY environment variable not set';
    } else if (apiProvider === 'phantombuster') {
      configured = !!process.env.PHANTOMBUSTER_API_KEY;
      message = configured
        ? 'PhantomBuster API key is configured'
        : 'PHANTOMBUSTER_API_KEY environment variable not set';
    }

    res.json({
      success: true,
      apiProvider,
      configured,
      message
    });
  } catch (error) {
    res.status(500).json({
      error: 'Test failed',
      message: error.message
    });
  }
});

/**
 * GET /api/linkedin/stats
 * Get LinkedIn signal statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { tenantId } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        error: 'Missing tenantId'
      });
    }

    // Get LinkedIn signal stats
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_signals,
        COUNT(*) FILTER (WHERE source_type = 'SOCIAL_MEDIA') as linkedin_signals,
        AVG(confidence_score) as avg_confidence,
        COUNT(DISTINCT trigger_type) as unique_trigger_types,
        json_agg(DISTINCT trigger_type) as trigger_types
      FROM hiring_signals
      WHERE tenant_id = $1
        AND source_type = 'SOCIAL_MEDIA'`,
      [tenantId]
    );

    const stats = result.rows[0];

    res.json({
      success: true,
      stats: {
        total_linkedin_signals: parseInt(stats.linkedin_signals) || 0,
        avg_confidence: parseFloat(stats.avg_confidence) || 0,
        unique_trigger_types: parseInt(stats.unique_trigger_types) || 0,
        trigger_types: stats.trigger_types || []
      }
    });
  } catch (error) {
    console.error('LinkedIn stats error:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

export default router;
