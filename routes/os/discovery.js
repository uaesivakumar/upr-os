/**
 * UPR OS Discovery Endpoint
 * Sprint 64: Unified OS API Layer
 * Sprint 76: SIVA Intelligence Integration
 * Sprint 77: INTELLIGENT LIVE DISCOVERY
 *
 * POST /api/os/discovery
 *
 * NEW ARCHITECTURE (Sprint 77):
 * - LIVE discovery: Fetch fresh data on-demand based on user context
 * - SIVA generates intelligent search queries
 * - Real-time signal extraction using Tool 13
 * - SIVA scoring before returning results
 *
 * Mode: live (default) | cached
 * - live: Fresh SERP search + real-time extraction
 * - cached: Read from hiring_signals table (legacy fallback)
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

// Sprint 77: Live discovery tools
import SerpTool from '../../server/tools/serp.js';
import HiringSignalExtractionTool from '../../server/siva-tools/HiringSignalExtractionToolStandalone.js';

const router = express.Router();

// Initialize live discovery tools
const hiringSignalExtractionTool = new HiringSignalExtractionTool();

// Initialize SIVA tools
const companyQualityTool = new CompanyQualityTool();

/**
 * Sprint 77: Load intelligent search queries from database
 * Templates are configurable via Super Admin UI
 * Matches by vertical/sub-vertical/region with fallback to universal templates
 */
async function loadQueryTemplates(context) {
  const { vertical, subVertical, region } = context;

  // Query templates from DB with priority-based matching:
  // 1. Exact match (vertical + sub-vertical + region)
  // 2. Vertical + sub-vertical (any region)
  // 3. Vertical only (any sub-vertical)
  // 4. Universal (NULL matches)
  const result = await pool.query(`
    SELECT query_template, query_type, priority, description
    FROM discovery_query_templates
    WHERE is_active = true
      AND (vertical_id IS NULL OR vertical_id = $1)
      AND (sub_vertical_id IS NULL OR sub_vertical_id = $2)
      AND (region_code IS NULL OR region_code = $3)
    ORDER BY
      -- Prefer more specific matches (lower priority = higher rank)
      CASE WHEN vertical_id = $1 AND sub_vertical_id = $2 AND region_code = $3 THEN 0
           WHEN vertical_id = $1 AND sub_vertical_id = $2 THEN 1
           WHEN vertical_id = $1 AND region_code = $3 THEN 2
           WHEN vertical_id = $1 THEN 3
           WHEN region_code = $3 THEN 4
           ELSE 5 END,
      priority ASC
    LIMIT 5
  `, [vertical || 'banking', subVertical || 'employee_banking', region || 'UAE']);

  if (result.rows.length === 0) {
    // Fallback if no templates found
    console.log('[OS:Discovery] No templates in DB, using fallback');
    return [
      `${region} companies hiring expansion`,
      `${region} new office opening news`,
      `${region} startup funding round`
    ];
  }

  // Replace {region} placeholder with actual region
  const queries = result.rows.map(row =>
    row.query_template.replace('{region}', region || 'UAE')
  );

  console.log(`[OS:Discovery] Loaded ${queries.length} templates from DB for ${vertical}/${subVertical}/${region}`);
  return queries;
}

/**
 * Sprint 77: Generate intelligent search queries based on user context
 * Loads from DB + personalizes based on work patterns
 */
async function generateIntelligentQueries(context) {
  const { region, workPatterns } = context;

  // Load templates from database (Super Admin configurable)
  const baseQueries = await loadQueryTemplates(context);

  // Personalize based on work patterns (sectors user has engaged with)
  if (workPatterns?.preferredSectors?.length > 0) {
    const sectorQueries = workPatterns.preferredSectors.slice(0, 2).map(
      sector => `${region} ${sector} companies hiring`
    );
    return [...sectorQueries, ...baseQueries.slice(0, 3)];
  }

  return baseQueries;
}

/**
 * Sprint 77: Perform LIVE discovery
 * 1. Search via SERP API
 * 2. Extract signals using Tool 13
 * 3. Return fresh signals
 */
async function performLiveDiscovery(queries, context, requestId) {
  const { region } = context;
  const allSignals = [];
  const searchMetadata = { queriesUsed: [], totalResults: 0, costUsd: 0 };

  console.log(`[OS:Discovery:LIVE] Running ${queries.length} intelligent queries...`);

  for (const query of queries) {
    try {
      // 1. SERP Search
      const searchResult = await SerpTool.search({
        query,
        location: region === 'UAE' ? 'United Arab Emirates' : region,
        engine: 'google',
        num: 10
      });

      searchMetadata.queriesUsed.push(query);
      searchMetadata.totalResults += searchResult.results?.length || 0;
      searchMetadata.costUsd += searchResult.metadata?.costUsd || 0.005;

      if (!searchResult.success || !searchResult.results?.length) {
        console.log(`[OS:Discovery:LIVE] Query "${query}" returned no results`);
        continue;
      }

      // 2. Extract signals from each search result
      for (const result of searchResult.results.slice(0, 5)) {
        if (!result.title || !result.snippet) continue;

        try {
          const extractionResult = await hiringSignalExtractionTool.execute({
            source: {
              url: result.link || 'https://search.google.com',
              domain: new URL(result.link || 'https://search.google.com').hostname.replace(/^www\./, '')
            },
            content: {
              title: result.title,
              body_text: result.snippet || result.title
            },
            context: {
              search_query: query,
              source_type: 'NEWS',
              request_id: requestId
            }
          });

          if (extractionResult.signals?.length > 0) {
            // Add source metadata to each signal
            const signalsWithMeta = extractionResult.signals.map(s => ({
              ...s,
              discoveredAt: new Date().toISOString(),
              sourceQuery: query,
              sourceUrl: result.link,
              discoveryMode: 'live'
            }));
            allSignals.push(...signalsWithMeta);
            console.log(`[OS:Discovery:LIVE] Extracted ${signalsWithMeta.length} signals from "${result.title?.slice(0, 50)}..."`);
          }
        } catch (extractError) {
          console.error(`[OS:Discovery:LIVE] Extraction error:`, extractError.message);
        }
      }
    } catch (searchError) {
      console.error(`[OS:Discovery:LIVE] Search error for query "${query}":`, searchError.message);
    }
  }

  console.log(`[OS:Discovery:LIVE] Total signals extracted: ${allSignals.length}`);

  return { signals: allSignals, metadata: searchMetadata };
}

/**
 * Transform extracted signals to company format with deduplication
 */
function transformSignalsToCompanies(signals, requestId) {
  const companiesMap = new Map();
  let companyIdCounter = 1;

  for (const signal of signals) {
    if (!signal.company_name || signal.company_name.length < 3) continue;

    // Filter out ambiguous UAE presence
    if (signal.uae_presence_confidence === 'AMBIGUOUS') continue;

    const companyKey = signal.company_name.toLowerCase().trim();

    if (!companiesMap.has(companyKey)) {
      companiesMap.set(companyKey, {
        id: `live-${requestId}-${companyIdCounter++}`,
        name: signal.company_name,
        domain: signal.company_domain || null,
        industry: signal.industry || 'Business Services',
        size: null,
        headcount: signal.employee_count_mentioned || null,
        city: signal.location || 'UAE',
        sector: signal.industry || null,
        location: signal.location || 'UAE',
        signals: [],
        signalCount: 0,
        latestSignalDate: new Date().toISOString(),
        hiringLikelihood: mapLikelihoodScore(signal.hiring_likelihood),
        hiringLikelihoodScore: signal.hiring_likelihood || 3,
        confidenceScore: signal.uae_presence_confidence === 'CONFIRMED' ? 0.9 : 0.7,
        geoStatus: signal.uae_presence_confidence === 'CONFIRMED' ? 'confirmed' : 'probable',
        discoveryMode: 'live'
      });
    }

    const company = companiesMap.get(companyKey);
    company.signals.push({
      type: signal.signal_type || 'Hiring Drive',
      title: signal.trigger_description || `${signal.signal_type || 'Hiring'} signal`,
      source: 'live_discovery',
      confidence: signal.uae_presence_confidence === 'CONFIRMED' ? 90 : 70,
      date: new Date().toISOString(),
      keyFacts: signal.key_facts || [],
      rolesMentioned: signal.roles_mentioned || []
    });
    company.signalCount++;

    // Update highest scores
    if (signal.hiring_likelihood > company.hiringLikelihoodScore) {
      company.hiringLikelihoodScore = signal.hiring_likelihood;
      company.hiringLikelihood = mapLikelihoodScore(signal.hiring_likelihood);
    }
  }

  return Array.from(companiesMap.values());
}

function mapLikelihoodScore(score) {
  if (score >= 5) return 'Very High';
  if (score >= 4) return 'High';
  if (score >= 3) return 'Medium';
  if (score >= 2) return 'Low';
  return 'Very Low';
}
const timingScoreTool = new TimingScoreTool();
const bankingProductMatchTool = new BankingProductMatchTool();

// Demo tenant ID with existing hiring signals data (RADAR Agent extracted)
const DEMO_TENANT_ID = 'e2d48fa8-f6d1-4b70-a939-29efb47b0dc9';

/**
 * Sprint 76: Score a company using real SIVA tools
 * Returns QTLE scores with natural language reasoning
 *
 * IMPORTANT: Must match tool schema requirements:
 * - CompanyQualityTool: requires domain pattern, uae_signals, size_bucket
 * - TimingScoreTool: requires news_age_days, hiring_recency_days
 * - BankingProductMatchTool: requires employee_count, industry
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

  const headcount = company.headcount || estimateHeadcount(company);
  const sizeBucket = getSizeBucket(headcount);
  const domain = normalizeDomain(company.domain);

  try {
    // Q-Score: Company Quality
    const qualityInput = {
      company_name: company.name,
      domain: domain || 'unknown.com',
      industry: company.industry || company.sector || 'Business Services',
      uae_signals: {
        has_ae_domain: domain?.endsWith('.ae') || false,
        has_uae_address: (company.location || '').toLowerCase().includes('uae') ||
                         (company.location || '').toLowerCase().includes('dubai') ||
                         (company.location || '').toLowerCase().includes('abu dhabi')
      },
      size_bucket: sizeBucket,
      size: headcount
    };

    const qualityResult = await companyQualityTool.execute(qualityInput);
    scores.quality = qualityResult.quality_score || 50;
    scores.qualityTier = mapScoreToTier(scores.quality);
    if (qualityResult.reasoning) {
      scores.reasoning.push(qualityResult.reasoning);
    }
  } catch (error) {
    console.error(`[OS:Discovery] Quality scoring error for ${company.name}:`, error.message);
  }

  try {
    // T-Score: Timing - use simple heuristic instead of strict schema
    const hasFunding = company.signals?.some(s =>
      s.type?.toLowerCase().includes('funding') || s.type?.toLowerCase().includes('investment')
    ) || false;
    const hasHiring = company.signals?.some(s =>
      s.type?.toLowerCase().includes('hiring') || s.type?.toLowerCase().includes('expansion')
    ) || false;
    const signalRecency = company.latestSignalDate ?
      Math.floor((Date.now() - new Date(company.latestSignalDate).getTime()) / (1000 * 60 * 60 * 24)) : 30;

    // Calculate timing score based on signals
    let timingScore = 50;
    if (hasFunding) timingScore += 20;
    if (hasHiring) timingScore += 15;
    if (signalRecency < 7) timingScore += 15;
    else if (signalRecency < 14) timingScore += 10;
    else if (signalRecency < 30) timingScore += 5;
    if (company.hiringLikelihoodScore >= 4) timingScore += 10;

    scores.timing = Math.min(100, timingScore);
    scores.urgency = scores.timing >= 75 ? 'High' : scores.timing >= 50 ? 'Medium' : 'Low';
    scores.reasoning.push(`Timing: ${hasFunding ? 'Recent funding detected. ' : ''}${hasHiring ? 'Active hiring signals. ' : ''}Signal age: ${signalRecency} days.`);
  } catch (error) {
    console.error(`[OS:Discovery] Timing scoring error for ${company.name}:`, error.message);
  }

  try {
    // Product Fit Score - use heuristic based on company profile
    let productFitScore = 50;
    const industry = (company.industry || company.sector || '').toLowerCase();

    // Industry fit for Employee Banking
    if (industry.includes('tech') || industry.includes('fintech')) productFitScore += 15;
    if (industry.includes('bank') || industry.includes('financial')) productFitScore += 20;
    if (industry.includes('healthcare') || industry.includes('pharma')) productFitScore += 10;

    // Size fit for payroll banking
    if (headcount >= 100 && headcount <= 1000) productFitScore += 15; // Sweet spot
    else if (headcount > 1000) productFitScore += 10;
    else if (headcount >= 50) productFitScore += 5;

    // Signal-based fit
    if (company.signalCount >= 3) productFitScore += 10;
    else if (company.signalCount >= 2) productFitScore += 5;

    scores.productFit = Math.min(100, productFitScore);
    scores.recommendedProducts = getRecommendedProducts(headcount, industry);
    scores.reasoning.push(`Product Fit: ${sizeBucket} company in ${industry || 'general'} sector. ${company.signalCount || 0} active signals.`);
  } catch (error) {
    console.error(`[OS:Discovery] Product fit scoring error for ${company.name}:`, error.message);
  }

  // Calculate overall score (weighted average)
  scores.overall = Math.round((scores.quality * 0.35 + scores.timing * 0.35 + scores.productFit * 0.30));

  // Determine tier based on overall score
  if (scores.overall >= 75) scores.tier = 'HOT';
  else if (scores.overall >= 50) scores.tier = 'WARM';
  else scores.tier = 'COOL';

  return scores;
}

/**
 * Normalize domain to valid format
 */
function normalizeDomain(domain) {
  if (!domain) return null;
  // Remove protocol, www, and trailing slashes
  let normalized = domain.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .trim();
  // Validate pattern
  if (/^[a-z0-9-]+\.[a-z]{2,}$/.test(normalized)) {
    return normalized;
  }
  return null;
}

/**
 * Get size bucket from headcount
 */
function getSizeBucket(headcount) {
  if (headcount < 50) return 'startup';
  if (headcount < 200) return 'scaleup';
  if (headcount < 1000) return 'midsize';
  return 'enterprise';
}

/**
 * Map score to tier label
 */
function mapScoreToTier(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

/**
 * Get recommended banking products based on profile
 */
function getRecommendedProducts(headcount, industry) {
  const products = [];

  if (headcount >= 50) {
    products.push('Payroll Banking');
  }
  if (headcount >= 200) {
    products.push('Corporate Treasury');
  }
  if (industry.includes('trade') || industry.includes('import') || industry.includes('export')) {
    products.push('Trade Finance');
  }
  if (headcount >= 100) {
    products.push('Employee Benefits');
  }
  if (products.length === 0) {
    products.push('Business Banking', 'Corporate Accounts');
  }

  return products;
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
 * Sprint 77: INTELLIGENT LIVE DISCOVERY
 * - mode: 'live' (default) | 'cached'
 * - live: Fresh SERP search + real-time extraction (SIVA-powered)
 * - cached: Read from hiring_signals table (legacy fallback)
 *
 * Request body:
 * {
 *   vertical: 'banking',
 *   subVertical: 'employee_banking',
 *   region: 'UAE',
 *   mode: 'live' | 'cached',
 *   workPatterns: { preferredSectors: [...] },
 *   options: { maxResults: 50 }
 * }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    let tenantId = getTenantId(req);
    const {
      vertical = 'banking',
      subVertical = 'employee_banking',
      region_code,
      industry = 'default',
      filters = {},
      options = {},
      workPatterns = null,
      mode = 'live' // Default to live discovery
    } = req.body;

    const {
      maxResults = 50,
      minQuality = 0,
      profile = OS_PROFILES.DEFAULT
    } = options;

    const region = region_code || filters.location || 'UAE';

    console.log(`[OS:Discovery] Request ${requestId} - Mode: ${mode}, Vertical: ${vertical}, SubVertical: ${subVertical}, Region: ${region}`);

    // =====================================================================
    // SPRINT 77: INTELLIGENT LIVE DISCOVERY (DEFAULT)
    // Fetch fresh data on-demand using SIVA-generated queries
    // =====================================================================

    let companies = [];
    let discoveryMetadata = {};

    if (mode === 'live') {
      console.log(`[OS:Discovery:LIVE] Starting intelligent live discovery...`);

      // Build context for SIVA
      const context = {
        vertical,
        subVertical,
        region,
        tenantId,
        workPatterns
      };

      // 1. Generate intelligent queries (from DB templates)
      const queries = await generateIntelligentQueries(context);
      console.log(`[OS:Discovery:LIVE] Generated ${queries.length} queries:`, queries);

      // 2. Perform live discovery (SERP + extraction)
      const liveResult = await performLiveDiscovery(queries, context, requestId);

      // 3. Transform signals to companies
      companies = transformSignalsToCompanies(liveResult.signals, requestId);

      discoveryMetadata = {
        mode: 'live',
        queriesUsed: liveResult.metadata.queriesUsed,
        totalSearchResults: liveResult.metadata.totalResults,
        signalsExtracted: liveResult.signals.length,
        costUsd: liveResult.metadata.costUsd,
        freshness: 'real-time'
      };

      console.log(`[OS:Discovery:LIVE] Extracted ${companies.length} companies from ${liveResult.signals.length} signals`);

      // If live discovery returns nothing, fall back to cached
      if (companies.length === 0) {
        console.log(`[OS:Discovery:LIVE] No results, falling back to cached mode...`);
        // Continue to cached mode below
      }
    }

    // =====================================================================
    // CACHED MODE (Legacy fallback)
    // Read from hiring_signals table
    // =====================================================================

    if (mode === 'cached' || companies.length === 0) {
      console.log(`[OS:Discovery:CACHED] Reading from hiring_signals table...`);

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
      console.log(`[OS:Discovery:CACHED] Found ${signals.length} signals from hiring_signals table`);

      discoveryMetadata = {
        mode: 'cached',
        dataSource: 'hiring_signals_table',
        freshness: signals.length > 0 ? `${Math.floor((Date.now() - new Date(signals[0]?.detected_at).getTime()) / (1000 * 60 * 60 * 24))} days` : 'unknown'
      };

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
            geoStatus: signal.geo_status || 'confirmed',
            discoveryMode: 'cached'
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
        if (signal.hiring_likelihood_score > company.hiringLikelihoodScore) {
          company.hiringLikelihoodScore = signal.hiring_likelihood_score;
          company.hiringLikelihood = signal.hiring_likelihood;
        }
        if (signal.confidence_score > company.confidenceScore) {
          company.confidenceScore = signal.confidence_score;
        }
      }

      // Convert to array and sort
      companies = Array.from(companiesMap.values())
        .sort((a, b) => {
          if (b.hiringLikelihoodScore !== a.hiringLikelihoodScore) {
            return b.hiringLikelihoodScore - a.hiringLikelihoodScore;
          }
          if (b.confidenceScore !== a.confidenceScore) {
            return b.confidenceScore - a.confidenceScore;
          }
          return b.signalCount - a.signalCount;
        })
        .slice(0, maxResults);

      console.log(`[OS:Discovery:CACHED] Grouped into ${companies.length} unique companies`);
    }

    // =====================================================================
    // APPLY SIVA SCORING TO ALL COMPANIES (both live and cached)
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

    // Merge scored companies back
    const unscoredCompanies = companies.slice(20);
    companies = [...scoredCompanies, ...unscoredCompanies];

    const scoringTimeMs = Date.now() - scoringStartTime;
    console.log(`[OS:Discovery] SIVA scoring completed in ${scoringTimeMs}ms`);

    const executionTimeMs = Date.now() - startTime;

    const response = createOSResponse({
      success: true,
      data: {
        companies,
        companyCount: companies.length,
        discovery: discoveryMetadata,
        sources: {
          mode: discoveryMetadata.mode,
          queriesUsed: discoveryMetadata.queriesUsed || [],
          successful: discoveryMetadata.mode === 'live' ? ['serp_api', 'siva_extraction'] : ['hiring_signals_db'],
          failed: []
        },
        statistics: {
          avgConfidence: companies.length > 0
            ? Math.round(companies.reduce((sum, c) => sum + (c.confidenceScore || 0.5), 0) / companies.length * 100)
            : 0,
          highLikelihood: companies.filter(c => c.hiringLikelihoodScore >= 4).length,
          mediumLikelihood: companies.filter(c => c.hiringLikelihoodScore === 3).length,
          hotLeads: companies.filter(c => c.sivaScores?.tier === 'HOT').length,
          warmLeads: companies.filter(c => c.sivaScores?.tier === 'WARM').length
        },
        meta: {
          discoveryMode: discoveryMetadata.mode,
          freshness: discoveryMetadata.freshness,
          timestamps: {
            requested: new Date().toISOString(),
            completed: new Date().toISOString()
          },
          context: {
            vertical,
            subVertical,
            region
          }
        }
      },
      reason: companies.length > 0
        ? `Found ${companies.length} companies via ${discoveryMetadata.mode} discovery (SIVA-powered)`
        : 'No companies found. Try different search parameters or check query templates.',
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
