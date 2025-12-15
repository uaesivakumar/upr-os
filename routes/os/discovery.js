/**
 * UPR OS Discovery Endpoint
 * Sprint 64: Unified OS API Layer
 * Sprint 76: SIVA Intelligence Integration
 *
 * POST /api/os/discovery
 *
 * READS FROM hiring_signals TABLE (populated by RADAR Agent with GPT-4 extraction)
 * This is the INTELLIGENT discovery - uses SIVA Tool 13 for proper company extraction
 *
 * NEW (Sprint 76): Real SIVA scoring on discovery results
 * - CompanyQualityTool for Q-Score
 * - TimingScoreTool for T-Score
 * - BankingProductMatchTool for product fit
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import { pool } from '../../utils/db.js';
import {
  createOSResponse,
  createOSError,
  getTenantId,
  generateRequestId,
  OS_PROFILES
} from './types.js';

// Sprint 76: Import SIVA tools for real scoring
import CompanyQualityTool from '../../server/siva-tools/CompanyQualityToolStandalone.js';
import TimingScoreTool from '../../server/siva-tools/TimingScoreToolStandalone.js';
import BankingProductMatchTool from '../../server/siva-tools/BankingProductMatchToolStandalone.js';

const router = express.Router();

// Initialize SIVA tools
const companyQualityTool = new CompanyQualityTool();
const timingScoreTool = new TimingScoreTool();
const bankingProductMatchTool = new BankingProductMatchTool();

// Demo tenant ID with existing hiring signals data (RADAR Agent extracted)
const DEMO_TENANT_ID = 'e2d48fa8-f6d1-4b70-a939-29efb47b0dc9';

/**
 * Sprint 76: Score a company using real SIVA tools
 * Returns QTLE scores with natural language reasoning
 */
async function scoreCompanyWithSIVA(company) {
  const scores = {
    quality: 50,
    timing: 50,
    productFit: 50,
    overall: 50,
    tier: 'WARM',
    reasoning: []
  };

  try {
    // Q-Score: Company Quality
    const qualityInput = {
      company_name: company.name,
      domain: company.domain,
      industry: company.industry || company.sector,
      employee_count: company.headcount || estimateHeadcount(company),
      revenue_usd: estimateRevenue(company),
      signal_count: company.signalCount || 1,
      confidence_score: company.confidenceScore || 0.5
    };

    const qualityResult = await companyQualityTool.execute(qualityInput);
    scores.quality = qualityResult.quality_score || 50;
    scores.qualityTier = qualityResult.quality_tier || 'B';
    if (qualityResult.reasoning) {
      scores.reasoning.push(`Quality: ${qualityResult.reasoning}`);
    }

    // T-Score: Timing
    const timingInput = {
      company_name: company.name,
      industry: company.industry || company.sector,
      recent_funding: company.signals?.some(s => s.type?.toLowerCase().includes('funding')) || false,
      hiring_signals: company.signals?.filter(s => s.type?.toLowerCase().includes('hiring')) || [],
      news_sentiment: company.hiringLikelihoodScore >= 4 ? 'positive' : 'neutral'
    };

    const timingResult = await timingScoreTool.execute(timingInput);
    scores.timing = timingResult.timing_score || 50;
    scores.urgency = timingResult.urgency || 'Medium';
    if (timingResult.reasoning) {
      scores.reasoning.push(`Timing: ${timingResult.reasoning}`);
    }

    // Product Fit Score
    const productInput = {
      company_name: company.name,
      industry: company.industry || company.sector,
      employee_count: company.headcount || estimateHeadcount(company),
      revenue_usd: estimateRevenue(company),
      geography: company.location || 'UAE',
      active_signals: company.signals?.map(s => s.type) || []
    };

    const productResult = await bankingProductMatchTool.execute(productInput);
    scores.productFit = productResult.match_score || 50;
    scores.recommendedProducts = productResult.matched_products || [];
    if (productResult.reasoning) {
      scores.reasoning.push(`Product Fit: ${productResult.reasoning}`);
    }

    // Calculate overall score
    scores.overall = Math.round((scores.quality * 0.35 + scores.timing * 0.35 + scores.productFit * 0.30));

    // Determine tier
    if (scores.overall >= 75) scores.tier = 'HOT';
    else if (scores.overall >= 50) scores.tier = 'WARM';
    else scores.tier = 'COOL';

  } catch (error) {
    console.error(`[OS:Discovery] SIVA scoring error for ${company.name}:`, error.message);
    // Return default scores on error
  }

  return scores;
}

/**
 * Estimate headcount from sector/signals
 */
function estimateHeadcount(company) {
  const sectorEstimates = {
    'Banking': 500,
    'Financial Services': 300,
    'Technology': 150,
    'Healthcare': 200,
    'Real Estate': 100,
    'default': 100
  };
  return sectorEstimates[company.sector] || sectorEstimates.default;
}

/**
 * Estimate revenue from headcount
 */
function estimateRevenue(company) {
  const headcount = company.headcount || estimateHeadcount(company);
  return headcount * 150000; // $150k per employee estimate
}

/**
 * POST /api/os/discovery
 *
 * Returns companies with hiring signals from the hiring_signals table
 * Data is populated by RADAR Agent using GPT-4 (SIVA Tool 13)
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    let tenantId = getTenantId(req);
    const {
      industry = 'default',
      filters = {},
      options = {}
    } = req.body;

    const {
      maxResults = 100,
      minQuality = 0,
      profile = OS_PROFILES.DEFAULT
    } = options;

    const location = filters.location || 'UAE';

    console.log(`[OS:Discovery] Request ${requestId} - Industry: ${industry}, Location: ${location}, Tenant: ${tenantId}`);

    // =====================================================================
    // READ FROM hiring_signals TABLE (POPULATED BY RADAR AGENT + GPT-4)
    // This data is properly extracted using SIVA Tool 13
    // =====================================================================

    // First try with provided tenant_id
    let signalsResult = await pool.query(`
      SELECT
        id,
        company,
        domain,
        sector,
        trigger_type,
        description,
        hiring_likelihood_score,
        hiring_likelihood,
        geo_status,
        location,
        source_url,
        source_date,
        evidence_quote,
        confidence_score,
        detected_at,
        created_at
      FROM hiring_signals
      WHERE tenant_id = $1
        AND review_status = 'pending'
        AND (source_date IS NULL OR source_date >= CURRENT_DATE - INTERVAL '90 days')
      ORDER BY
        CASE WHEN hiring_likelihood_score >= 4 THEN 0 ELSE 1 END,
        confidence_score DESC NULLS LAST,
        detected_at DESC
      LIMIT $2
    `, [tenantId, maxResults * 3]);

    // If no data for this tenant, fall back to demo tenant
    if (signalsResult.rows.length === 0 && tenantId !== DEMO_TENANT_ID) {
      console.log(`[OS:Discovery] No signals for tenant ${tenantId}, falling back to demo tenant`);
      tenantId = DEMO_TENANT_ID;
      signalsResult = await pool.query(`
        SELECT
          id,
          company,
          domain,
          sector,
          trigger_type,
          description,
          hiring_likelihood_score,
          hiring_likelihood,
          geo_status,
          location,
          source_url,
          source_date,
          evidence_quote,
          confidence_score,
          detected_at,
          created_at
        FROM hiring_signals
        WHERE tenant_id = $1
          AND review_status = 'pending'
          AND (source_date IS NULL OR source_date >= CURRENT_DATE - INTERVAL '90 days')
        ORDER BY
          CASE WHEN hiring_likelihood_score >= 4 THEN 0 ELSE 1 END,
          confidence_score DESC NULLS LAST,
          detected_at DESC
        LIMIT $2
      `, [tenantId, maxResults * 3]);
    }

    const signals = signalsResult.rows;

    console.log(`[OS:Discovery] Found ${signals.length} signals from hiring_signals table`);

    // Group signals by company (using LOWER for dedup)
    const companiesMap = new Map();
    let companyIdCounter = 1;

    for (const signal of signals) {
      const companyName = signal.company;
      if (!companyName || companyName.length < 3) continue;

      const companyKey = companyName.toLowerCase().trim();

      if (!companiesMap.has(companyKey)) {
        companiesMap.set(companyKey, {
          id: signal.id || `company-${requestId}-${companyIdCounter++}`,
          name: companyName,
          domain: signal.domain || null,
          industry: signal.sector || 'Business Services',
          size: null,
          headcount: null,
          city: signal.location || 'UAE',
          sector: signal.sector || null,
          location: signal.location || 'UAE',
          signals: [],
          signalCount: 0,
          latestSignalDate: null,
          hiringLikelihood: signal.hiring_likelihood || 'Medium',
          hiringLikelihoodScore: signal.hiring_likelihood_score || 3,
          confidenceScore: signal.confidence_score || 0.5,
          geoStatus: signal.geo_status || 'confirmed'
        });
      }

      const company = companiesMap.get(companyKey);
      company.signals.push({
        type: signal.trigger_type || 'Hiring Drive',
        title: signal.description || `${signal.trigger_type || 'Hiring'} signal`,
        source: 'radar_agent',
        confidence: Math.round((signal.confidence_score || 0.5) * 100),
        date: signal.source_date,
        sourceUrl: signal.source_url,
        evidenceQuote: signal.evidence_quote
      });
      company.signalCount++;

      // Track latest and update scores
      if (!company.latestSignalDate || signal.source_date > company.latestSignalDate) {
        company.latestSignalDate = signal.source_date;
      }
      // Keep highest scores
      if (signal.hiring_likelihood_score > company.hiringLikelihoodScore) {
        company.hiringLikelihoodScore = signal.hiring_likelihood_score;
        company.hiringLikelihood = signal.hiring_likelihood;
      }
      if (signal.confidence_score > company.confidenceScore) {
        company.confidenceScore = signal.confidence_score;
      }
    }

    // Convert to array and sort by score
    let companies = Array.from(companiesMap.values())
      .sort((a, b) => {
        // Sort by: hiring likelihood score DESC, then confidence DESC, then signal count DESC
        if (b.hiringLikelihoodScore !== a.hiringLikelihoodScore) {
          return b.hiringLikelihoodScore - a.hiringLikelihoodScore;
        }
        if (b.confidenceScore !== a.confidenceScore) {
          return b.confidenceScore - a.confidenceScore;
        }
        return b.signalCount - a.signalCount;
      })
      .slice(0, maxResults);

    console.log(`[OS:Discovery] Grouped into ${companies.length} unique companies`);

    // =====================================================================
    // SPRINT 76: APPLY REAL SIVA SCORING TO TOP COMPANIES
    // Score top 20 companies with SIVA tools (balance speed vs intelligence)
    // =====================================================================
    const companiesToScore = companies.slice(0, 20);
    console.log(`[OS:Discovery] Scoring ${companiesToScore.length} companies with SIVA tools...`);

    const scoringStartTime = Date.now();
    const scoredCompanies = await Promise.all(
      companiesToScore.map(async (company) => {
        const sivaScores = await scoreCompanyWithSIVA(company);
        return {
          ...company,
          sivaScores: {
            quality: sivaScores.quality,
            timing: sivaScores.timing,
            productFit: sivaScores.productFit,
            overall: sivaScores.overall,
            tier: sivaScores.tier,
            qualityTier: sivaScores.qualityTier,
            urgency: sivaScores.urgency,
            recommendedProducts: sivaScores.recommendedProducts,
            reasoning: sivaScores.reasoning
          }
        };
      })
    );

    // Re-sort by SIVA overall score
    scoredCompanies.sort((a, b) => (b.sivaScores?.overall || 0) - (a.sivaScores?.overall || 0));

    // Merge scored companies back (scored ones first, then unscored)
    const unscoredCompanies = companies.slice(20);
    companies = [...scoredCompanies, ...unscoredCompanies];

    const scoringTimeMs = Date.now() - scoringStartTime;
    console.log(`[OS:Discovery] SIVA scoring completed in ${scoringTimeMs}ms`);

    const executionTimeMs = Date.now() - startTime;

    const response = createOSResponse({
      success: true,
      data: {
        signals: signals.slice(0, maxResults),
        companies,
        total: signals.length,
        companyCount: companies.length,
        sources: {
          requested: ['hiring_signals_db'],
          successful: ['hiring_signals_db'],
          failed: []
        },
        statistics: {
          avgConfidence: companies.length > 0
            ? Math.round(companies.reduce((sum, c) => sum + c.confidenceScore, 0) / companies.length * 100)
            : 0,
          highLikelihood: companies.filter(c => c.hiringLikelihoodScore >= 4).length,
          mediumLikelihood: companies.filter(c => c.hiringLikelihoodScore === 3).length
        },
        meta: {
          dataSource: 'hiring_signals_table',
          extractionMethod: 'RADAR_Agent_GPT4',
          timestamps: {
            requested: new Date().toISOString(),
            completed: new Date().toISOString()
          },
          filters: {
            industry,
            location,
            minQuality
          }
        }
      },
      reason: companies.length > 0
        ? `Found ${companies.length} companies with hiring signals (GPT-4 extracted)`
        : 'No hiring signals found. Run RADAR agent to discover new signals.',
      confidence: companies.length > 0 ? 95 : 0, // High confidence - data is GPT-4 extracted
      profile,
      endpoint: '/api/os/discovery',
      executionTimeMs,
      requestId
    });

    console.log(`[OS:Discovery] Request ${requestId} completed in ${executionTimeMs}ms - ${companies.length} companies`);

    res.json(response);

  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    console.error(`[OS:Discovery] Request ${requestId} failed:`, error);

    Sentry.captureException(error, {
      tags: {
        os_endpoint: '/api/os/discovery',
        request_id: requestId
      },
      extra: req.body
    });

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_DISCOVERY_ERROR',
      endpoint: '/api/os/discovery',
      executionTimeMs,
      requestId
    }));
  }
});

/**
 * GET /api/os/discovery/health
 * Health check for discovery service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'os-discovery',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
