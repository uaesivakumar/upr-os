// routes/campaignTypes.js
// API routes for campaign types and campaign intelligence

import express from 'express';
import { ok, bad } from '../utils/respond.js';
import { adminOnly } from '../utils/adminOnly.js';
import {
  getAllCampaignTypes,
  getCampaignTypeById,
  getCampaignTypeByName,
  matchBestCampaign,
  detectLifecycleStage,
  getCampaignsByCategory,
  getCampaignAnalytics
} from '../services/campaignIntelligence.js';

const router = express.Router();

/**
 * GET /api/campaign-types
 * Get all campaign types with optional filtering
 * Query params: ?category=transaction_banking&status=active
 */
router.get('/', adminOnly, async (req, res) => {
  try {
    const { category, status } = req.query;
    const filters = {};

    if (category) filters.category = category;
    if (status) filters.status = status;

    const campaigns = await getAllCampaignTypes(filters);
    return ok(res, campaigns);
  } catch (error) {
    console.error('GET /api/campaign-types error:', error);
    return bad(res, 'Failed to fetch campaign types', 500);
  }
});

/**
 * GET /api/campaign-types/categories
 * Get all available campaign categories with counts
 */
router.get('/categories', adminOnly, async (req, res) => {
  try {
    const campaigns = await getAllCampaignTypes({ status: 'active' });

    // Group by category and count
    const categoryMap = {};
    campaigns.forEach(campaign => {
      if (!categoryMap[campaign.category]) {
        categoryMap[campaign.category] = {
          category: campaign.category,
          displayName: campaign.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          count: 0,
          campaigns: []
        };
      }
      categoryMap[campaign.category].count++;
      categoryMap[campaign.category].campaigns.push({
        id: campaign.id,
        name: campaign.name,
        description: campaign.description
      });
    });

    const categories = Object.values(categoryMap).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );

    return ok(res, categories);
  } catch (error) {
    console.error('GET /api/campaign-types/categories error:', error);
    return bad(res, 'Failed to fetch categories', 500);
  }
});

/**
 * GET /api/campaign-types/:id
 * Get a single campaign type by ID
 */
router.get('/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await getCampaignTypeById(id);

    if (!campaign) {
      return bad(res, 'Campaign type not found', 404);
    }

    return ok(res, campaign);
  } catch (error) {
    console.error('GET /api/campaign-types/:id error:', error);
    return bad(res, 'Failed to fetch campaign type', 500);
  }
});

/**
 * POST /api/campaign-types/match
 * Match best campaign for a given lead/context
 * Body: { industry, jobTitle, companySize, lifecycleStage, brief }
 */
router.post('/match', adminOnly, async (req, res) => {
  try {
    const leadContext = req.body;

    if (!leadContext.brief && !leadContext.industry && !leadContext.jobTitle) {
      return bad(res, 'At least one of brief, industry, or jobTitle is required', 400);
    }

    // Auto-detect lifecycle stage if not provided
    if (!leadContext.lifecycleStage && leadContext.brief) {
      leadContext.lifecycleStage = detectLifecycleStage(leadContext, leadContext.brief);
    }

    const matches = await matchBestCampaign(leadContext);

    return ok(res, {
      matches,
      detectedLifecycleStage: leadContext.lifecycleStage,
      totalMatches: matches.length
    });
  } catch (error) {
    console.error('POST /api/campaign-types/match error:', error);
    return bad(res, 'Failed to match campaigns', 500);
  }
});

/**
 * GET /api/campaign-types/category/:category
 * Get all campaigns in a specific category
 */
router.get('/category/:category', adminOnly, async (req, res) => {
  try {
    const { category } = req.params;
    const campaigns = await getCampaignsByCategory(category);
    return ok(res, campaigns);
  } catch (error) {
    console.error('GET /api/campaign-types/category/:category error:', error);
    return bad(res, 'Failed to fetch campaigns by category', 500);
  }
});

/**
 * GET /api/campaign-types/:id/analytics
 * Get performance analytics for a campaign type
 * Query params: ?from=2025-01-01&to=2025-12-31
 */
router.get('/:id/analytics', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;

    const dateRange = {};
    if (from) dateRange.from = new Date(from);
    if (to) dateRange.to = new Date(to);

    const analytics = await getCampaignAnalytics(id, dateRange);
    return ok(res, analytics);
  } catch (error) {
    console.error('GET /api/campaign-types/:id/analytics error:', error);
    return bad(res, 'Failed to fetch campaign analytics', 500);
  }
});

/**
 * POST /api/campaign-types/detect-lifecycle
 * Detect lifecycle stage from lead data and brief
 * Body: { industry, status, brief }
 */
router.post('/detect-lifecycle', adminOnly, async (req, res) => {
  try {
    const { brief, ...leadData } = req.body;
    const lifecycleStage = detectLifecycleStage(leadData, brief);

    return ok(res, {
      lifecycleStage,
      confidence: calculateLifecycleConfidence(lifecycleStage, brief, leadData)
    });
  } catch (error) {
    console.error('POST /api/campaign-types/detect-lifecycle error:', error);
    return bad(res, 'Failed to detect lifecycle stage', 500);
  }
});

/**
 * GET /api/campaign-types/name/:name
 * Get campaign type by exact name
 */
router.get('/name/:name', adminOnly, async (req, res) => {
  try {
    const { name } = req.params;
    const campaign = await getCampaignTypeByName(name);

    if (!campaign) {
      return bad(res, 'Campaign type not found', 404);
    }

    return ok(res, campaign);
  } catch (error) {
    console.error('GET /api/campaign-types/name/:name error:', error);
    return bad(res, 'Failed to fetch campaign type', 500);
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Calculate confidence score for lifecycle detection
 */
function calculateLifecycleConfidence(stage, brief, leadData) {
  let confidence = 0;

  // Base confidence
  confidence += 30;

  // Boost if brief contains stage-related keywords
  if (brief) {
    const briefLower = brief.toLowerCase();
    const stageKeywords = stage.toLowerCase().split('_');
    const keywordMatches = stageKeywords.filter(keyword =>
      briefLower.includes(keyword)
    ).length;
    confidence += keywordMatches * 15;
  }

  // Boost if lead data supports the stage
  if (leadData.industry && leadData.industry !== 'unknown') {
    confidence += 10;
  }

  if (leadData.companySize) {
    confidence += 10;
  }

  // Cap at 95% (never 100% certainty)
  return Math.min(95, confidence);
}

export default router;
