/**
 * Outreach Generator API Routes
 * Sprint 31 - Task 8: POST /generate-outreach
 */

const express = require('express');
const router = express.Router();
const { OutreachGeneratorService } = require('../services/outreachGeneratorService');

// Initialize service (pool will be injected by app.js)
let outreachService;

function initializeService(pool) {
  outreachService = new OutreachGeneratorService(pool);
}

/**
 * POST /generate-outreach
 * Generate personalized outreach message
 */
router.post('/generate-outreach', async (req, res) => {
  try {
    const {
      message_type = 'email',
      company,
      contact,
      context,
      tone
    } = req.body;

    // Validate required fields
    if (!company || !company.company_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: company.company_name'
      });
    }

    if (!contact || !contact.first_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: contact.first_name'
      });
    }

    // Generate outreach message
    const result = await outreachService.generateOutreach({
      message_type,
      company,
      contact,
      context: context || {},
      tone
    });

    res.json(result);

  } catch (error) {
    console.error('Outreach generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /outreach/templates
 * List available voice templates
 */
router.get('/templates', async (req, res) => {
  try {
    const {
      template_type,
      category,
      tone,
      limit = 50
    } = req.query;

    const templates = await outreachService.templateService.getTemplates({
      template_type,
      category,
      tone,
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      count: templates.length,
      templates
    });

  } catch (error) {
    console.error('Template listing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /outreach/stats
 * Get system statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await outreachService.templateService.getSystemStats();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = { router, initializeService };
