// services/campaignIntelligence.js
// Campaign Intelligence Service for matching campaigns to leads and contexts

import { pool } from '../utils/db.js';

/**
 * Get all campaign types from the database
 * @param {Object} filters - Optional filters (category, status)
 * @returns {Array} Campaign types
 */
export async function getAllCampaignTypes(filters = {}) {
  try {
    let query = 'SELECT * FROM campaign_types';
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (filters.category) {
      conditions.push(`category = $${paramIndex++}`);
      params.push(filters.category);
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    } else {
      // Default to active campaigns only
      conditions.push(`status = $${paramIndex++}`);
      params.push('active');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY category, name';

    const { rows } = await pool.query(query, params);
    return rows;
  } catch (error) {
    console.error('Error fetching campaign types:', error);
    throw error;
  }
}

/**
 * Get a single campaign type by ID
 * @param {string} campaignTypeId - UUID of campaign type
 * @returns {Object} Campaign type
 */
export async function getCampaignTypeById(campaignTypeId) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM campaign_types WHERE id = $1',
      [campaignTypeId]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error fetching campaign type by ID:', error);
    throw error;
  }
}

/**
 * Get campaign type by name
 * @param {string} name - Campaign type name
 * @returns {Object} Campaign type
 */
export async function getCampaignTypeByName(name) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM campaign_types WHERE name = $1',
      [name]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error fetching campaign type by name:', error);
    throw error;
  }
}

/**
 * Match best campaign for a given lead/context
 * Uses intelligent scoring based on industry, job title, company size, and detected lifecycle stage
 *
 * @param {Object} leadContext - Lead information
 * @param {string} leadContext.industry - Lead's industry
 * @param {string} leadContext.jobTitle - Lead's job title
 * @param {string} leadContext.companySize - Company size (e.g., "100-500")
 * @param {string} leadContext.lifecycleStage - Detected lifecycle stage
 * @param {string} leadContext.brief - User's campaign brief (optional)
 * @returns {Array} Top 5 matching campaigns with scores
 */
export async function matchBestCampaign(leadContext) {
  try {
    const campaigns = await getAllCampaignTypes();

    const scoredCampaigns = campaigns.map(campaign => {
      let score = 0;
      const targetAudience = campaign.target_audience || {};

      // 1. Industry match (30 points)
      if (leadContext.industry && targetAudience.industries) {
        const industries = Array.isArray(targetAudience.industries)
          ? targetAudience.industries
          : [];

        if (industries.includes('all') || industries.includes(leadContext.industry)) {
          score += 30;
        } else {
          // Partial match for related industries
          const industryKeywords = leadContext.industry.toLowerCase().split('_');
          const hasPartialMatch = industries.some(industry =>
            industryKeywords.some(keyword => industry.toLowerCase().includes(keyword))
          );
          if (hasPartialMatch) score += 15;
        }
      }

      // 2. Job title match (25 points)
      if (leadContext.jobTitle && targetAudience.job_titles) {
        const jobTitles = Array.isArray(targetAudience.job_titles)
          ? targetAudience.job_titles
          : [];

        const normalizedLeadTitle = leadContext.jobTitle.toLowerCase();
        const hasMatch = jobTitles.some(title =>
          normalizedLeadTitle.includes(title.toLowerCase()) ||
          title.toLowerCase().includes(normalizedLeadTitle)
        );
        if (hasMatch) score += 25;
      }

      // 3. Company size match (20 points)
      if (leadContext.companySize && targetAudience.company_sizes) {
        const companySizes = Array.isArray(targetAudience.company_sizes)
          ? targetAudience.company_sizes
          : [];

        if (companySizes.includes(leadContext.companySize)) {
          score += 20;
        } else {
          // Check if size range overlaps
          const leadSize = parseCompanySize(leadContext.companySize);
          const hasOverlap = companySizes.some(size => {
            const campaignSize = parseCompanySize(size);
            return leadSize && campaignSize && rangesOverlap(leadSize, campaignSize);
          });
          if (hasOverlap) score += 10;
        }
      }

      // 4. Lifecycle stage match (25 points)
      if (leadContext.lifecycleStage && targetAudience.lifecycle_stages) {
        const lifecycleStages = Array.isArray(targetAudience.lifecycle_stages)
          ? targetAudience.lifecycle_stages
          : [];

        if (lifecycleStages.includes(leadContext.lifecycleStage)) {
          score += 25;
        }
      }

      // 5. Brief keyword matching (bonus 10 points)
      if (leadContext.brief) {
        const briefLower = leadContext.brief.toLowerCase();
        const campaignNameLower = campaign.name.toLowerCase();
        const campaignDescLower = campaign.description.toLowerCase();

        // Extract keywords from campaign name
        const keywords = campaignNameLower.split(' ').filter(word => word.length > 3);
        const matchedKeywords = keywords.filter(keyword => briefLower.includes(keyword));

        if (matchedKeywords.length > 0) {
          score += Math.min(10, matchedKeywords.length * 3);
        } else if (briefLower.includes(campaign.category.replace('_', ' '))) {
          score += 5;
        }
      }

      // 6. Performance bonus (up to 5 points based on historical success)
      if (campaign.avg_response_rate > 0) {
        score += Math.min(5, campaign.avg_response_rate / 2);
      }

      return {
        ...campaign,
        matchScore: Math.round(score),
        matchReasons: generateMatchReasons(campaign, leadContext, score)
      };
    });

    // Sort by score and return top 5
    return scoredCampaigns
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

  } catch (error) {
    console.error('Error matching campaigns:', error);
    throw error;
  }
}

/**
 * Detect lifecycle stage from lead data and brief
 * @param {Object} leadData - Lead information
 * @param {string} brief - Campaign brief (optional)
 * @returns {string} Detected lifecycle stage
 */
export function detectLifecycleStage(leadData, brief = '') {
  const briefLower = (brief || '').toLowerCase();
  const industry = (leadData.industry || '').toLowerCase();
  const status = (leadData.status || '').toLowerCase();

  // Keywords for different lifecycle stages
  const stageKeywords = {
    onboarding: ['new joiners', 'new hires', 'onboarding', 'welcome', 'day-1', 'joining'],
    growth: ['growth', 'scaling', 'expansion', 'hiring', 'expanding'],
    scaling: ['scale', 'rapid growth', 'expansion', 'multi-location', 'international'],
    mature: ['established', 'mature', 'large', 'enterprise', 'optimize'],
    international_expansion: ['international', 'global', 'overseas', 'export', 'multi-country'],
    digital_transformation: ['digital', 'automation', 'api', 'mobile', 'technology', 'fintech'],
    stable: ['stable', 'consistent', 'regular', 'ongoing'],
    startup: ['startup', 'new company', 'recently founded', 'emerging'],
    family_workforce: ['family', 'children', 'school', 'dependents'],
    employee_wellness_focus: ['wellness', 'health', 'gym', 'fitness', 'wellbeing'],
    product_development: ['product', 'development', 'building', 'platform'],
    high_travel_activity: ['travel', 'frequent travel', 'international travel', 'business trips'],
    cash_flow_issues: ['cash flow', 'liquidity', 'working capital', 'payment delays'],
    modernization: ['modernize', 'upgrade', 'new equipment', 'technology upgrade'],
    complex: ['complex', 'multiple entities', 'conglomerate', 'diversified']
  };

  // Check brief and lead data for stage indicators
  for (const [stage, keywords] of Object.entries(stageKeywords)) {
    const hasMatch = keywords.some(keyword =>
      briefLower.includes(keyword) || industry.includes(keyword) || status.includes(keyword)
    );
    if (hasMatch) return stage;
  }

  // Default based on company size
  if (leadData.companySize) {
    const size = parseCompanySize(leadData.companySize);
    if (size && size.max) {
      if (size.max < 50) return 'startup';
      if (size.max < 200) return 'growth';
      if (size.max < 1000) return 'scaling';
      return 'mature';
    }
  }

  return 'stable'; // Default fallback
}

/**
 * Get campaigns by category
 * @param {string} category - Campaign category
 * @returns {Array} Campaigns in category
 */
export async function getCampaignsByCategory(category) {
  return getAllCampaignTypes({ category, status: 'active' });
}

/**
 * Track campaign performance
 * @param {Object} performanceData - Performance metrics
 * @returns {Object} Created performance record
 */
export async function trackCampaignPerformance(performanceData) {
  try {
    const {
      campaignTypeId,
      templateId,
      leadId,
      leadIndustry,
      leadSize,
      leadScore,
      variant = 'A'
    } = performanceData;

    const { rows } = await pool.query(
      `INSERT INTO campaign_performance
       (campaign_type_id, template_id, lead_id, lead_industry, lead_size, lead_score, variant)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [campaignTypeId, templateId, leadId, leadIndustry, leadSize, leadScore, variant]
    );

    // Update campaign total_sent count
    await pool.query(
      'UPDATE campaign_types SET total_sent = total_sent + 1 WHERE id = $1',
      [campaignTypeId]
    );

    return rows[0];
  } catch (error) {
    console.error('Error tracking campaign performance:', error);
    throw error;
  }
}

/**
 * Update campaign performance metrics
 * @param {string} performanceId - Performance record ID
 * @param {string} event - Event type: 'opened', 'clicked', 'responded', 'converted'
 * @returns {Object} Updated performance record
 */
export async function updateCampaignPerformance(performanceId, event) {
  try {
    const validEvents = ['opened', 'clicked', 'responded', 'converted'];
    if (!validEvents.includes(event)) {
      throw new Error(`Invalid event type: ${event}`);
    }

    const columnName = `${event}_at`;

    const { rows } = await pool.query(
      `UPDATE campaign_performance
       SET ${columnName} = NOW()
       WHERE id = $1
       RETURNING *`,
      [performanceId]
    );

    if (rows.length > 0) {
      // Recalculate campaign type metrics
      await recalculateCampaignMetrics(rows[0].campaign_type_id);
    }

    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error updating campaign performance:', error);
    throw error;
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Parse company size string to min/max range
 * @param {string} sizeStr - Size string like "100-500" or "1000+"
 * @returns {Object} {min, max} or null
 */
function parseCompanySize(sizeStr) {
  if (!sizeStr) return null;

  if (sizeStr.includes('+')) {
    const min = parseInt(sizeStr.replace('+', ''));
    return { min, max: Infinity };
  }

  if (sizeStr.includes('-')) {
    const [min, max] = sizeStr.split('-').map(s => parseInt(s.trim()));
    return { min, max };
  }

  const num = parseInt(sizeStr);
  if (!isNaN(num)) {
    return { min: num, max: num };
  }

  return null;
}

/**
 * Check if two numeric ranges overlap
 */
function rangesOverlap(range1, range2) {
  return range1.min <= range2.max && range2.min <= range1.max;
}

/**
 * Generate human-readable match reasons
 */
function generateMatchReasons(campaign, leadContext, score) {
  const reasons = [];

  if (score > 70) {
    reasons.push('Strong match for your lead profile');
  } else if (score > 50) {
    reasons.push('Good match based on industry and role');
  } else if (score > 30) {
    reasons.push('Potential match - consider for testing');
  } else {
    reasons.push('Low match - not recommended');
  }

  const targetAudience = campaign.target_audience || {};

  if (leadContext.industry && targetAudience.industries?.includes(leadContext.industry)) {
    reasons.push(`Targeted for ${leadContext.industry} industry`);
  }

  if (leadContext.jobTitle && targetAudience.job_titles) {
    const hasMatch = targetAudience.job_titles.some(title =>
      leadContext.jobTitle.toLowerCase().includes(title.toLowerCase())
    );
    if (hasMatch) {
      reasons.push(`Designed for ${leadContext.jobTitle} role`);
    }
  }

  if (campaign.avg_response_rate > 5) {
    reasons.push(`Strong historical performance (${campaign.avg_response_rate}% response rate)`);
  }

  return reasons;
}

/**
 * Recalculate aggregate metrics for a campaign type
 */
async function recalculateCampaignMetrics(campaignTypeId) {
  try {
    const { rows } = await pool.query(
      `SELECT
        COUNT(*) as total_sent,
        COUNT(opened_at) as total_opened,
        COUNT(responded_at) as total_responded
       FROM campaign_performance
       WHERE campaign_type_id = $1`,
      [campaignTypeId]
    );

    if (rows.length > 0) {
      const { total_sent, total_opened, total_responded } = rows[0];
      const avgOpenRate = total_sent > 0 ? (total_opened / total_sent) * 100 : 0;
      const avgResponseRate = total_sent > 0 ? (total_responded / total_sent) * 100 : 0;

      await pool.query(
        `UPDATE campaign_types
         SET avg_open_rate = $1,
             avg_response_rate = $2,
             total_sent = $3
         WHERE id = $4`,
        [avgOpenRate.toFixed(2), avgResponseRate.toFixed(2), total_sent, campaignTypeId]
      );
    }
  } catch (error) {
    console.error('Error recalculating campaign metrics:', error);
    // Don't throw - this is a background calculation
  }
}

/**
 * Get campaign performance analytics
 * @param {string} campaignTypeId - Campaign type ID
 * @param {Object} dateRange - Optional date range {from, to}
 * @returns {Object} Analytics data
 */
export async function getCampaignAnalytics(campaignTypeId, dateRange = {}) {
  try {
    let query = `
      SELECT
        COUNT(*) as total_sent,
        COUNT(opened_at) as total_opened,
        COUNT(clicked_at) as total_clicked,
        COUNT(responded_at) as total_responded,
        COUNT(converted_at) as total_converted,
        AVG(EXTRACT(EPOCH FROM (responded_at - sent_at))/3600) as avg_response_time_hours
      FROM campaign_performance
      WHERE campaign_type_id = $1
    `;

    const params = [campaignTypeId];

    if (dateRange.from) {
      query += ` AND sent_at >= $${params.length + 1}`;
      params.push(dateRange.from);
    }

    if (dateRange.to) {
      query += ` AND sent_at <= $${params.length + 1}`;
      params.push(dateRange.to);
    }

    const { rows } = await pool.query(query, params);

    const stats = rows[0];
    const totalSent = parseInt(stats.total_sent) || 0;

    return {
      totalSent,
      totalOpened: parseInt(stats.total_opened) || 0,
      totalClicked: parseInt(stats.total_clicked) || 0,
      totalResponded: parseInt(stats.total_responded) || 0,
      totalConverted: parseInt(stats.total_converted) || 0,
      openRate: totalSent > 0 ? ((stats.total_opened / totalSent) * 100).toFixed(2) : '0.00',
      clickRate: totalSent > 0 ? ((stats.total_clicked / totalSent) * 100).toFixed(2) : '0.00',
      responseRate: totalSent > 0 ? ((stats.total_responded / totalSent) * 100).toFixed(2) : '0.00',
      conversionRate: totalSent > 0 ? ((stats.total_converted / totalSent) * 100).toFixed(2) : '0.00',
      avgResponseTimeHours: parseFloat(stats.avg_response_time_hours || 0).toFixed(1)
    };
  } catch (error) {
    console.error('Error fetching campaign analytics:', error);
    throw error;
  }
}
