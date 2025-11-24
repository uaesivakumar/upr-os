/**
 * SIVA Phase 12: Lead Scoring Engine Integration
 *
 * Replaces old scoring logic with centralized SIVA MCP tools
 *
 * Uses:
 * - Tool 1: CompanyQualityTool (company fit 0-100)
 * - Tool 2: ContactTierTool (contact classification)
 * - Tool 8: CompositeScoreTool (final Q-Score 0-100)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load SIVA tools (CommonJS modules)
const CompanyQualityTool = require('../../../server/siva-tools/CompanyQualityToolStandalone.js');
const ContactTierTool = require('../../../server/siva-tools/ContactTierToolStandalone.js');
const CompositeScoreTool = require('../../../server/siva-tools/CompositeScoreToolStandalone.js');

// Initialize SIVA tools (singleton instances)
const companyQualityTool = new CompanyQualityTool();
const contactTierTool = new ContactTierTool();
const compositeScoreTool = new CompositeScoreTool();

/**
 * SIVA Phase 12: Calculate lead score using centralized SIVA framework
 *
 * @param {Object} lead - Lead object {name, designation, email, email_status, linkedin_url, etc}
 * @param {Object} company - Company object {name, domain, industry, size, locations, etc}
 * @returns {Promise<Object>} {confidence: 0-1, qScore: 0-100, tier, reasoning}
 */
export async function calculateSIVALeadScore(lead, company) {
  try {
    // Skip if no lead or company data
    if (!lead) {
      console.warn('[SIVA Phase 12] No lead data provided');
      return {
        confidence: 0.5,
        qScore: 50,
        tier: 'UNKNOWN',
        reasoning: 'No lead data for SIVA scoring',
        source: 'fallback'
      };
    }

    if (!company) {
      console.warn('[SIVA Phase 12] No company data provided for lead:', lead.name);
      return {
        confidence: 0.5,
        qScore: 50,
        tier: 'UNKNOWN',
        reasoning: 'No company data for SIVA scoring',
        source: 'fallback'
      };
    }

    // STEP 1: Evaluate company quality using SIVA Tool 1
    const companyQualityInput = prepareCompanyInput(company);
    console.log('[SIVA Phase 12] Company input prepared:', JSON.stringify(companyQualityInput, null, 2));
    const companyQualityResult = await companyQualityTool.execute(companyQualityInput);

    // STEP 2: Classify contact tier using SIVA Tool 2
    const contactTierInput = prepareContactInput(lead, company);
    const contactTierResult = await contactTierTool.execute(contactTierInput);

    // STEP 3: Generate composite Q-Score using SIVA Tool 8
    // Note: For now we'll use simplified inputs since we don't have all SIVA tools wired yet
    // Full integration will include TimingScore, ProductMatch, ChannelConfidence, ContextConfidence
    const compositeInput = {
      company_name: company.name || company.company_name || 'Unknown Company', // REQUIRED by schema
      company_quality_score: companyQualityResult.quality_score,
      contact_tier: contactTierResult.tier,
      timing_score: 75, // Default: GOOD timing (will be replaced with Tool 3 later)
      timing_category: 'GOOD',
      // Tool 4: EdgeCasesTool (will be replaced later)
      has_blockers: false,
      blocker_count: 0,
      // Tool 5: BankingProductMatchTool (will be replaced later)
      product_match_count: 1,
      top_product_fit_score: 70,
      // Tool 6: OutreachChannelTool
      primary_channel: 'EMAIL',
      channel_confidence: getChannelConfidence(lead.email_status) / 100, // Convert 0-100 to 0-1 scale
      // Tool 7: OpeningContextTool
      opening_context_confidence: 0.8 // Default: good context (0-1 scale)
    };

    const compositeResult = await compositeScoreTool.execute(compositeInput);

    // Convert Q-Score (0-100) to confidence (0-1) for compatibility with old system
    const confidence = Math.min(0.98, compositeResult.q_score / 100);

    return {
      confidence, // 0-1 for database compatibility
      qScore: compositeResult.q_score, // 0-100 SIVA score
      tier: compositeResult.lead_score_tier, // HOT/WARM/COLD/DISQUALIFIED (correct schema field)
      reasoning: compositeResult.reasoning, // Natural language explanation
      companyQuality: companyQualityResult.quality_score,
      contactTier: contactTierResult.tier,
      source: 'siva_phase12',
      metadata: {
        company_quality_confidence: companyQualityResult.confidence,
        contact_tier_confidence: contactTierResult.confidence,
        composite_confidence: compositeResult.confidence,
        key_factors: compositeResult.key_factors || compositeResult.metadata?.key_strengths || []
      }
    };

  } catch (error) {
    console.error('[SIVA Phase 12] Lead scoring error:', error);

    // Fallback to simple scoring if SIVA tools fail
    return {
      confidence: calculateFallbackScore(lead),
      qScore: calculateFallbackScore(lead) * 100,
      tier: 'UNKNOWN',
      reasoning: `SIVA scoring failed: ${error.message}. Using fallback.`,
      source: 'fallback_error',
      error: error.message
    };
  }
}

/**
 * Prepare company data for SIVA CompanyQualityTool
 */
function prepareCompanyInput(company) {
  // Determine size bucket
  const size = company.size || extractSizeFromRange(company.size_range);
  let size_bucket;

  if (!size || size < 50) {
    size_bucket = 'startup'; // Default to startup if no size
  } else if (size >= 50 && size < 200) {
    size_bucket = 'scaleup';
  } else if (size >= 200 && size <= 1000) {
    size_bucket = 'midsize';
  } else {
    size_bucket = 'enterprise'; // size > 1000
  }

  // Determine salary indicators
  const salary_level = size >= 100 ? 'high' : (size >= 50 ? 'medium' : 'low');

  // UAE signals
  let domain = company.domain || company.website_url || '';

  // Clean domain: extract hostname and lowercase
  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    try {
      domain = new URL(domain).hostname.toLowerCase();
    } catch {
      domain = domain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    }
  } else {
    domain = domain.toLowerCase();
  }

  // Ensure domain has valid format (remove www., trailing slashes, etc)
  domain = domain.replace(/^www\./, '').replace(/\/$/, '');

  const has_ae_domain = domain.includes('.ae');
  const locations = Array.isArray(company.locations) ? company.locations : [];
  const has_uae_address = locations.some(loc =>
    loc && (loc.includes('Dubai') || loc.includes('Abu Dhabi') || loc.includes('UAE'))
  );

  return {
    company_name: company.name || company.company_name || 'Unknown Company',
    domain: domain || 'unknown.com',
    industry: company.industry || 'Unknown',
    uae_signals: {
      has_ae_domain,
      has_uae_address,
      linkedin_location: 'Unknown' // Default to 'Unknown' if not available
    },
    size_bucket,
    size: size || 100,
    salary_indicators: {
      salary_level,
      avg_salary: salary_level === 'high' ? 15000 : (salary_level === 'medium' ? 10000 : 7000)
    },
    license_type: determineLicenseType(company)
  };
}

/**
 * Prepare contact data for SIVA ContactTierTool
 */
function prepareContactInput(lead, company) {
  const size = company.size || extractSizeFromRange(company.size_range) || 100;

  return {
    title: lead.designation || lead.title || 'Unknown',
    company_size: size,
    hiring_velocity_monthly: 5 // Default: moderate hiring (can be enhanced later)
  };
}

/**
 * Map contact tier to numeric score for CompositeScoreTool
 */
function getTierScore(tier) {
  const scores = {
    'STRATEGIC': 100,
    'PRIMARY': 75,
    'SECONDARY': 50,
    'BACKUP': 25
  };
  return scores[tier] || 50;
}

/**
 * Get channel confidence based on email verification status
 */
function getChannelConfidence(emailStatus) {
  const confidenceMap = {
    'valid': 100,
    'validated': 100,
    'validated_user': 95,
    'accept_all': 70,
    'patterned': 60,
    'unknown': 50,
    'invalid': 20,
    'bounced': 10
  };
  return confidenceMap[emailStatus] || 50;
}

/**
 * Determine license type from company data
 */
function determineLicenseType(company) {
  const locations = Array.isArray(company.locations) ? company.locations.join(' ') : '';
  if (locations.includes('DIFC') || locations.includes('DMCC') || locations.includes('Free Zone')) {
    return 'Free Zone';
  }
  if (locations.includes('Mainland')) {
    return 'Mainland';
  }
  return 'Unknown';
}

/**
 * Extract numeric size from range string like "100-500"
 */
function extractSizeFromRange(sizeRange) {
  if (!sizeRange) return null;
  const match = sizeRange.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Fallback scoring if SIVA tools fail
 */
function calculateFallbackScore(lead) {
  let score = 0.5; // Base score

  // Email verification bonus
  if (lead.email_status === 'validated' || lead.email_status === 'valid') {
    score += 0.2;
  } else if (lead.email_status === 'accept_all') {
    score += 0.1;
  }

  // LinkedIn bonus
  if (lead.linkedin_url) {
    score += 0.1;
  }

  // Title/designation bonus
  if (lead.designation || lead.title) {
    score += 0.1;
  }

  return Math.min(0.95, score);
}

/**
 * Backward-compatible wrapper for old finalizeScore function
 * Now uses SIVA scoring but maintains same interface
 *
 * @param {number|Object} previewScoreOrLead - Either old 0-1 score or lead object
 * @param {string|Object} emailStatusOrCompany - Either email status or company object
 * @returns {Promise<number>|number} Confidence score 0-1
 */
export async function sivaFinalizeScore(previewScoreOrLead, emailStatusOrCompany) {
  // Detect if being called with new interface (lead + company objects)
  if (typeof previewScoreOrLead === 'object' && typeof emailStatusOrCompany === 'object') {
    const lead = previewScoreOrLead;
    const company = emailStatusOrCompany;

    const result = await calculateSIVALeadScore(lead, company);
    return result.confidence;
  }

  // Old interface (score + email_status) - use fallback
  let finalScore = previewScoreOrLead || 0.5;
  const emailStatus = emailStatusOrCompany;

  if (emailStatus === 'validated' || emailStatus === 'validated_user') {
    finalScore += 0.1;
  } else if (emailStatus === 'accept_all') {
    finalScore += 0.02;
  }

  return Math.min(0.98, finalScore);
}

export default {
  calculateSIVALeadScore,
  sivaFinalizeScore
};
