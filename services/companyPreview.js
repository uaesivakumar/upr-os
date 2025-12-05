/**
 * Company Preview Service - SerpAPI + LLM Architecture
 * Purpose: Generate rich company previews using Google search + AI extraction
 * Cost: $0.006 per new company (vs $0.50 with Apollo)
 * Speed: 0.7s cold / 0.1s cached
 */

const { pool } = require('../utils/db');
const OpenAI = require('openai');
const { findLinkedInURL } = require('../utils/linkedinEnrichment');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SERPAPI_KEY = process.env.SERPAPI_KEY;

// ============================================================================
// SCORING CONFIG CACHE (S73: Config Migration)
// ============================================================================
let scoringConfigCache = {
  weights: null,
  grades: null,
  loadedAt: null,
  ttlMs: 5 * 60 * 1000 // 5 minutes cache
};

// Default fallbacks if DB unavailable
const DEFAULT_QSCORE_WEIGHTS = {
  domain: 25,
  linkedin: 20,
  signals: 20,
  uaeContext: 25,
  recency: 10
};

const DEFAULT_QSCORE_GRADES = {
  A: { min: 80, max: 100 },
  B: { min: 60, max: 79 },
  C: { min: 40, max: 59 },
  D: { min: 0, max: 39 }
};

/**
 * Load Q-Score weights from database with caching
 * @param {string} vertical - Vertical (defaults to 'banking')
 * @returns {Promise<Object>} Weights object
 */
async function loadQScoreWeights(vertical = 'banking') {
  // Check cache validity
  if (
    scoringConfigCache.weights &&
    scoringConfigCache.loadedAt &&
    (Date.now() - scoringConfigCache.loadedAt) < scoringConfigCache.ttlMs
  ) {
    return scoringConfigCache.weights;
  }

  try {
    const result = await pool.query(`
      SELECT config
      FROM scoring_config
      WHERE vertical = $1
        AND config_type = 'qscore_weights'
        AND is_active = true
      ORDER BY sub_vertical NULLS LAST
      LIMIT 1
    `, [vertical]);

    if (result.rows.length > 0) {
      scoringConfigCache.weights = result.rows[0].config;
      scoringConfigCache.loadedAt = Date.now();
      console.log('[QScore] Loaded weights from DB:', scoringConfigCache.weights);
      return scoringConfigCache.weights;
    }
  } catch (error) {
    console.log('[QScore] DB unavailable, using defaults:', error.message);
  }

  // Fallback to defaults
  return DEFAULT_QSCORE_WEIGHTS;
}

/**
 * Load Q-Score grade thresholds from database with caching
 * @param {string} vertical - Vertical (defaults to 'banking')
 * @returns {Promise<Object>} Grades object
 */
async function loadQScoreGrades(vertical = 'banking') {
  // Check cache validity
  if (
    scoringConfigCache.grades &&
    scoringConfigCache.loadedAt &&
    (Date.now() - scoringConfigCache.loadedAt) < scoringConfigCache.ttlMs
  ) {
    return scoringConfigCache.grades;
  }

  try {
    const result = await pool.query(`
      SELECT config
      FROM scoring_config
      WHERE vertical = $1
        AND config_type = 'qscore_grades'
        AND is_active = true
      ORDER BY sub_vertical NULLS LAST
      LIMIT 1
    `, [vertical]);

    if (result.rows.length > 0) {
      scoringConfigCache.grades = result.rows[0].config;
      console.log('[QScore] Loaded grades from DB:', scoringConfigCache.grades);
      return scoringConfigCache.grades;
    }
  } catch (error) {
    console.log('[QScore] DB unavailable for grades, using defaults');
  }

  // Fallback to defaults
  return DEFAULT_QSCORE_GRADES;
}

/**
 * Invalidate scoring config cache (called when Super Admin updates config)
 */
function invalidateScoringConfigCache() {
  scoringConfigCache.weights = null;
  scoringConfigCache.grades = null;
  scoringConfigCache.loadedAt = null;
  console.log('[QScore] Cache invalidated');
}

/**
 * Main preview generation function
 * @param {string} companyName - Company name to search
 * @returns {Promise<Object>} Enriched company profile with Q-Score
 */
async function generateCompanyPreview(companyName) {
  const startTime = Date.now();
  const cacheKey = `preview:${companyName.toLowerCase().trim()}`;

  try {
    // 1️⃣ CHECK CACHE FIRST
    const cached = await checkCache(cacheKey);
    if (cached) {
      // 🔥 CACHE VALIDATION: Invalidate old cache missing Phase 2a fields
      if (!cached.id || (cached.location === undefined && cached.hq_location === undefined)) {
        console.log(`[CACHE INVALID] ${companyName} - missing id or location fields, refetching...`);
        // Don't return cached data - continue to fresh fetch
      } else {
        console.log(`[CACHE HIT] ${companyName} - ${Date.now() - startTime}ms`);
        return {
          ...cached,
          cached: true,
          responseTime: Date.now() - startTime
        };
      }
    }

    // 2️⃣ FETCH FROM SERP API
    const serpData = await fetchSerpAPI(companyName);

    // 3️⃣ EXTRACT WITH LLM
    const extracted = await extractWithLLM(serpData, companyName);

    // 4️⃣ ENRICH LINKEDIN URL (with dual-purpose SerpAPI fallback)
    let linkedinUrl = extractLinkedIn(serpData);
    if (!linkedinUrl) {
      console.log(`[LinkedIn] Not found in SERP results for "${companyName}", trying dual-purpose enrichment...`);
      try {
        linkedinUrl = await findLinkedInURL(extracted.name || companyName, extracted.domain);
        if (linkedinUrl) {
          console.log(`[LinkedIn] ✅ Enriched via dual-purpose query: ${linkedinUrl}`);
        } else {
          console.log(`[LinkedIn] ⚠️  Still not found after dual-purpose query`);
        }
      } catch (err) {
        console.error(`[LinkedIn] Enrichment error:`, err.message);
      }
    } else {
      console.log(`[LinkedIn] ✅ Found in SERP results: ${linkedinUrl}`);
    }

    //  🔥 5.5️⃣ DATABASE UPSERT (Phase 2a fix)
    let companyId = null;
    try {
      const domain = extracted.domain || extractDomain(serpData);
      if (domain) {
        const companySql = `
          INSERT INTO targeted_companies (name, domain, website_url, linkedin_url, industry, size_range)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (domain) DO UPDATE
          SET name = EXCLUDED.name, website_url = EXCLUDED.website_url, linkedin_url = EXCLUDED.linkedin_url,
              industry = EXCLUDED.industry, size_range = EXCLUDED.size_range, updated_at = NOW()
          RETURNING id;
        `;
        const { rows } = await pool.query(companySql, [
          extracted.name || companyName,
          domain,
          extracted.website_url || null,
          linkedinUrl,
          extracted.industry || null,
          extracted.employee_range || null
        ]);
        companyId = rows?.[0]?.id || null;
        console.log(`[companyPreview] Upserted company: id=${companyId}, domain=${domain}`);
      }
    } catch (dbErr) {
      console.warn(`[companyPreview] Company upsert failed (non-fatal):`, dbErr.message);
    }

    // 🔥 HIRING SIGNALS QUERY - Separate try-catch to ensure it always runs
    let dbHiringSignals = [];
    try {
      console.log('═══════════════════════════════════════════════════');
      console.log('[companyPreview] HIRING SIGNALS QUERY START');
      console.log('[companyPreview] Original search input:', companyName);
      console.log('[companyPreview] LLM extracted name:', extracted.name);

      const queryName = extracted.name || companyName;
      console.log('[companyPreview] Final query name (will use in WHERE clause):', queryName);
      console.log('[companyPreview] Query will search: LOWER(company) = LOWER($1) with param:', queryName);

      if (queryName) {
        const signalsSql = `
          SELECT
            trigger_type as signal_type,
            description as signal_text,
            source_date as signal_date,
            hiring_likelihood_score as confidence_score,
            source_url as source
          FROM hiring_signals
          WHERE LOWER(company) = LOWER($1)
          AND (source_date IS NULL OR source_date >= CURRENT_DATE - INTERVAL '90 days')
          ORDER BY source_date DESC NULLS LAST, detected_at DESC
          LIMIT 50
        `;
        const signalsResult = await pool.query(signalsSql, [queryName]);
        dbHiringSignals = signalsResult.rows;

        console.log('[companyPreview] Database returned:', dbHiringSignals.length, 'signals');

        if (dbHiringSignals.length > 0) {
          console.log('[companyPreview] Sample signal:', JSON.stringify(dbHiringSignals[0], null, 2));
          console.log('[companyPreview] Signal types:', dbHiringSignals.map(s => s.signal_type).join(', '));
        } else {
          console.log('[companyPreview] ⚠️ NO SIGNALS FOUND in database for:', queryName);
        }

        console.log('[companyPreview] These signals will be returned in field: dbHiringSignals');
        console.log('[companyPreview] LLM-scraped signals (signals field):', extracted.signals?.length || 0);
      } else {
        console.log('[companyPreview] ⚠️ No queryName available, skipping signal query');
      }

      console.log('[companyPreview] HIRING SIGNALS QUERY END');
      console.log('═══════════════════════════════════════════════════');
    } catch (signalsErr) {
      console.error(`[companyPreview] ❌ Hiring signals query failed:`, signalsErr.message);
    }

    // 5️⃣ COMPUTE Q-SCORE (AFTER signals query, using dbHiringSignals)
    const qscore = await computeQScore(extracted, serpData, linkedinUrl, dbHiringSignals);

    // 6️⃣ BUILD FINAL PROFILE
    const profile = {
      id: companyId,  // ← ADD company ID
      name: extracted.name || companyName,
      domain: extracted.domain || extractDomain(serpData),
      website_url: extracted.website_url || null,
      linkedin_url: linkedinUrl,
      industry: extracted.industry || null,
      sector: extracted.sector || null,
      employee_range: extracted.employee_range || null,
      employee_count: extracted.employee_count || null,
      location: extracted.hq_location || null,  // ← ADD location field for UAE Context
      hq_location: extracted.hq_location || null,
      headquarters: extracted.hq_location || null,  // ← Alternative field name
      description: extracted.description || null,
      founded_year: extracted.founded_year || null,
      uae_presence: detectUAEPresence(extracted, serpData),
      signals: extracted.signals || [],  // LLM-scraped signals
      dbHiringSignals: dbHiringSignals,  // ← ADD database signals
      recent_news: extractRecentNews(serpData),
      qscore: qscore,
      trust_score: calculateTrustScore(serpData),
      data_sources: ['serp', 'llm'],
      timestamp: new Date().toISOString(),
      cached: false,
      responseTime: Date.now() - startTime
    };

    // 7️⃣ CACHE RESULT
    await saveToCache(cacheKey, companyName, profile);

    console.log(`[NEW PREVIEW] ${companyName} - ${Date.now() - startTime}ms - Score: ${qscore.value}`);
    return profile;

  } catch (error) {
    console.error(`[PREVIEW ERROR] ${companyName}:`, error.message);

    // FALLBACK TO APOLLO (existing logic)
    console.log(`[FALLBACK] Attempting Apollo API for ${companyName}`);
    try {
      const { enrichCompanyProfile } = require('../routes/companies');
      const apolloResult = await enrichCompanyProfile({ name: companyName });

      return {
        ...apolloResult.company,
        qscore: {
          value: Math.round((apolloResult.quality?.score || 0.5) * 100),
          rating: 'C',
          breakdown: { apollo_fallback: 50 }
        },
        data_sources: ['apollo_fallback'],
        cached: false,
        fallback: true,
        responseTime: Date.now() - startTime
      };
    } catch (apolloError) {
      console.error(`[APOLLO FALLBACK FAILED]:`, apolloError.message);
      throw new Error('Both SerpAPI and Apollo failed');
    }
  }
}

/**
 * Check cache for existing preview
 */
async function checkCache(cacheKey) {
  const result = await pool.query(
    `UPDATE company_cache
     SET hit_count = hit_count + 1, updated_at = now()
     WHERE cache_key = $1 AND expires_at > now()
     RETURNING cache_data`,
    [cacheKey]
  );

  return result.rows[0]?.cache_data || null;
}

/**
 * Save preview to cache (48h TTL)
 */
async function saveToCache(cacheKey, companyName, profile) {
  await pool.query(
    `INSERT INTO company_cache (cache_key, company_name, cache_data, serp_cost_usd, llm_cost_usd, hit_count)
     VALUES ($1, $2, $3, 0.005, 0.001, 0)
     ON CONFLICT (cache_key)
     DO UPDATE SET
       cache_data = $3,
       updated_at = now(),
       expires_at = now() + INTERVAL '48 hours'`,
    [cacheKey, companyName, profile]
  );
}

/**
 * Fetch data from SerpAPI with retry logic
 */
async function fetchSerpAPI(companyName, retries = 2) {
  const query = `${companyName} UAE`;
  const url = `https://serpapi.com/search.json?` + new URLSearchParams({
    q: query,
    engine: 'google',
    api_key: SERPAPI_KEY,
    num: 10,
    gl: 'ae',  // Geolocation: UAE
    hl: 'en'   // Language: English
  });

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { timeout: 10000 });

      if (!response.ok) {
        throw new Error(`SerpAPI error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.organic_results || data.organic_results.length === 0) {
        throw new Error('No SERP results found');
      }

      return data;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      console.log(`[SERP RETRY] Attempt ${attempt + 1} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

/**
 * Extract structured data using GPT-4o-mini with deterministic rules
 */
async function extractWithLLM(serpData, companyName, retries = 2) {
  const prompt = `Extract company information from Google search results and return ONLY valid JSON.

Company Search Query: "${companyName} UAE"

Search Results:
${JSON.stringify(serpData.organic_results.slice(0, 5), null, 2)}

News Results:
${JSON.stringify(serpData.news_results?.slice(0, 3) || [], null, 2)}

Knowledge Graph:
${JSON.stringify(serpData.knowledge_graph || {}, null, 2)}

EXTRACTION RULES:

1. COMPANY NAME
   - Use the most authoritative form (from knowledge graph > official website > consistent mentions)
   - Example: "ADNOC" or "Abu Dhabi National Oil Company (ADNOC)"

2. DOMAIN & WEBSITE
   - Extract the primary company domain from the first official result
   - Look for company's main website (NOT social media, NOT job boards, NOT news sites)
   - Format: domain as "company.com", website_url as "https://company.com"
   - If no official website found in results, return null for both

3. INDUSTRY & SECTOR
   - Industry: Specific business type (e.g., "Real Estate Technology", "Oil & Gas")
   - Sector: Broader category (e.g., "Technology", "Energy", "Finance")
   - Extract from knowledge graph, about pages, or consistent descriptions
   - If not clearly stated, return null (do not guess)

4. EMPLOYEE DATA
   - employee_range: Extract if stated (e.g., "100-500", "5,000+", "10K-50K")
   - employee_count: Extract exact number if stated (e.g., 5000, 50000)
   - Look in: knowledge graph, about pages, LinkedIn mentions, news articles
   - If not found, return null (do not estimate)

5. HQ LOCATION
   - Extract the global headquarters location
   - Format: "City, Country" (e.g., "Dubai, UAE" or "Seattle, USA")
   - Extract from: knowledge graph, footer addresses, about pages
   - Include UAE regional HQ if mentioned separately
   - If not stated, return null

6. DESCRIPTION
   - Write 2-3 factual sentences summarizing what the company does
   - Base on: knowledge graph description, website taglines, news summaries
   - Be objective and fact-based
   - If insufficient data, return null

7. FOUNDED YEAR
   - Extract year as integer if stated (e.g., 2015)
   - Only include if explicitly mentioned
   - If not found, return null

8. SIGNALS (business activity indicators)
   - Detect these patterns in news/results:
     * "hiring" - job postings, recruitment drives, "we're hiring", careers page
     * "expansion" - new office, entering market, growing operations, opening location
     * "funding" - raised capital, investment round, Series A/B/C, acquired
     * "contract" - won deal, awarded contract, partnership announced
     * "product" - launched product, new service, platform release
   - Only include signals with clear evidence in the results
   - Return empty array if no signals detected

OUTPUT FORMAT (JSON only, no markdown, no explanation):
{
  "name": "string or null",
  "domain": "string or null",
  "website_url": "string or null",
  "industry": "string or null",
  "sector": "string or null",
  "employee_range": "string or null",
  "employee_count": number or null,
  "hq_location": "string or null",
  "description": "string or null",
  "founded_year": number or null,
  "signals": ["string"] or []
}

CRITICAL REQUIREMENTS:
- Return ONLY the JSON object (no markdown code blocks, no explanations)
- Every field must be present in the response (use null if data not found)
- Be factual - extract only what is clearly stated in the search results
- Do not infer, guess, or hallucinate data
- If a field has no clear evidence, use null
- Signals array can be empty if no business activity detected`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a data extraction system. Extract structured company information from search results with 100% accuracy. Return ONLY valid JSON with no additional text or formatting.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0].message.content.trim();

      const parsed = JSON.parse(content);

      // Validate response structure
      const requiredFields = [
        'name', 'domain', 'website_url', 'industry', 'sector',
        'employee_range', 'employee_count', 'hq_location',
        'description', 'founded_year', 'signals'
      ];

      const missingFields = requiredFields.filter(field => !(field in parsed));
      if (missingFields.length > 0) {
        throw new Error(`LLM response missing required fields: ${missingFields.join(', ')}`);
      }

      return parsed;

    } catch (parseError) {
      if (attempt === retries - 1) {
        console.error('LLM extraction failed:', {
          error: parseError.message,
          attempt: attempt + 1
        });
        throw new Error(`LLM extraction failed: ${parseError.message}`);
      }
      console.log(`[LLM RETRY] Attempt ${attempt + 1} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

/**
 * Extract domain from SERP results
 */
function extractDomain(serpData) {
  const firstResult = serpData.organic_results?.[0];
  if (!firstResult?.link) return null;

  try {
    const url = new URL(firstResult.link);
    return url.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

/**
 * Extract LinkedIn company URL
 */
function extractLinkedIn(serpData) {
  const linkedinResult = serpData.organic_results?.find(r =>
    r.link?.includes('linkedin.com/company/')
  );
  return linkedinResult?.link || null;
}

/**
 * Extract recent news
 */
function extractRecentNews(serpData) {
  return (serpData.news_results || []).slice(0, 3).map(news => ({
    title: news.title,
    link: news.link,
    date: news.date,
    source: news.source
  }));
}

/**
 * Detect UAE presence from multiple signals
 */
function detectUAEPresence(extracted, serpData) {
  const uaeKeywords = /(uae|dubai|abu dhabi|sharjah|middle east|gcc|mena)/i;

  const checks = [
    uaeKeywords.test(extracted.hq_location || ''),
    uaeKeywords.test(extracted.description || ''),
    extracted.domain?.endsWith('.ae'),
    serpData.organic_results?.some(r => r.link?.includes('.ae')),
    serpData.organic_results?.some(r => uaeKeywords.test(r.snippet || ''))
  ];

  return checks.filter(Boolean).length >= 2;
}

/**
 * Compute Q-Score (0-100) with configurable weights from DB
 * NOW USES DATABASE SIGNALS AND DATABASE WEIGHTS (S73: Config Migration)
 * @param {Object} extracted - Extracted company data
 * @param {Object} serpData - SERP API response
 * @param {string|null} linkedinUrl - LinkedIn URL if found
 * @param {Array} dbHiringSignals - Hiring signals from database
 * @param {string} vertical - Vertical for weight lookup (defaults to 'banking')
 */
async function computeQScore(extracted, serpData, linkedinUrl = null, dbHiringSignals = [], vertical = 'banking') {
  console.log('[computeQScore] CALCULATING Q-SCORE for vertical:', vertical);
  console.log('[computeQScore] dbHiringSignals param:', Array.isArray(dbHiringSignals) ? `Array(${dbHiringSignals.length})` : typeof dbHiringSignals);

  // Load weights from database (with caching)
  const weights = await loadQScoreWeights(vertical);
  const grades = await loadQScoreGrades(vertical);

  const metrics = {
    domain: extracted.domain ? 1 : 0,
    linkedin: linkedinUrl ? 1 : 0,
    signals: (dbHiringSignals?.length || 0) > 0 ? 1 : 0,  // ✅ USE DATABASE SIGNALS
    uaeContext: detectUAEPresence(extracted, serpData) ? 1 : 0,
    recency: (serpData.news_results?.length || 0) > 0 ? 1 : 0
  };

  console.log('[computeQScore] Metrics calculated:', JSON.stringify(metrics, null, 2));
  console.log('[computeQScore] Using weights:', JSON.stringify(weights, null, 2));

  // Weighted scoring using DB config
  const score = Math.round(
    metrics.domain * (weights.domain || 25) +
    metrics.linkedin * (weights.linkedin || 20) +
    metrics.signals * (weights.signals || 20) +
    metrics.uaeContext * (weights.uaeContext || 25) +
    metrics.recency * (weights.recency || 10)
  );

  // Determine rating using DB grade thresholds
  let rating = 'D';
  if (score >= (grades.A?.min || 80)) rating = 'A';
  else if (score >= (grades.B?.min || 60)) rating = 'B';
  else if (score >= (grades.C?.min || 40)) rating = 'C';

  const result = {
    value: score,
    rating,
    breakdown: {
      domain: metrics.domain * (weights.domain || 25),
      linkedin: metrics.linkedin * (weights.linkedin || 20),
      signals: metrics.signals * (weights.signals || 20),
      uae_presence: metrics.uaeContext * (weights.uaeContext || 25),
      recency: metrics.recency * (weights.recency || 10)
    },
    weightsUsed: weights  // Include for debugging/transparency
  };

  console.log('[computeQScore] Final Q-Score:', score);
  console.log('[computeQScore] Breakdown:', JSON.stringify(result.breakdown, null, 2));
  console.log('[computeQScore] CALCULATION COMPLETE');

  return result;
}

/**
 * Calculate trust score based on data quality
 */
function calculateTrustScore(serpData) {
  let trust = 0.5; // Base trust

  if (serpData.knowledge_graph) trust += 0.2;
  if (serpData.organic_results?.length >= 5) trust += 0.1;
  if (serpData.news_results?.length > 0) trust += 0.1;
  if (serpData.organic_results?.[0]?.link?.startsWith('https://')) trust += 0.1;

  return Math.min(1.0, trust);
}

module.exports = {
  generateCompanyPreview,
  // S73: Scoring config utilities for Super Admin
  loadQScoreWeights,
  loadQScoreGrades,
  invalidateScoringConfigCache,
  computeQScore
};
