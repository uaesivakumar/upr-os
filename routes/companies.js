// routes/companies.js
// Cache buster: Force Docker rebuild to use correct code (no middleware/auth import)
const express = require("express");
const { pool } = require("../utils/db");
const { ok, bad } = require("../utils/respond");
const { computeQScore } = require("../utils/qscore");
const { isValidCompanyType, isValidCompanyStatus } = require("../utils/validators");
const { apolloMixedPeopleSearch } = require("../utils/providers/apollo");
const { generateCompanyPreview } = require("../services/companyPreview");

// Temporary auth stub - matches enrichment/unified.js approach
function authAny(req, res, next) {
  req.user = {
    tenant_id: req.body?.tenant_id || req.query?.tenant_id || "00000000-0000-0000-0000-000000000001",
    id: 'default-user',
    role: 'admin'
  };
  next();
}

/**
 * Enrich company with Apollo data
 * Returns enriched company profile with industry, size, locations, quality score
 */
async function enrichCompanyProfile(company) {
  const startTime = Date.now();

  try {
    console.log('[Enrichment] Starting enrichment for:', company.name);

    // Extract domain from company data
    const domain = company.domain || (company.website_url ? new URL(company.website_url).hostname.replace('www.', '') : null);

    if (!domain && !company.name) {
      console.log('[Enrichment] No domain or name available for enrichment');
      return createEnrichmentResponse(company, [], startTime);
    }

    // Fetch Apollo data - search for people at this company
    const apolloResults = await apolloMixedPeopleSearch({
      domain: domain,
      orgName: company.name,
      locations: [], // Can add UAE cities here if needed: ['Dubai', 'Abu Dhabi']
      titles: ['Director', 'Manager', 'VP', 'Head of', 'Chief'], // Senior roles for better data
      page: 1,
      perPage: 10
    });

    console.log('[Enrichment] Apollo returned', apolloResults.length, 'results');

    return createEnrichmentResponse(company, apolloResults, startTime);

  } catch (error) {
    console.error('[Enrichment] Error:', error.message);
    // Return basic company data on error
    return createEnrichmentResponse(company, [], startTime);
  }
}

/**
 * Create enrichment response from Apollo results
 */
function createEnrichmentResponse(company, apolloResults, startTime) {
  // Extract company info from Apollo results
  let industry = null;
  let size = null;
  let globalHq = null;
  let uaeLocations = null;
  let linkedinUrl = company.linkedin_url || null;

  if (apolloResults.length > 0) {
    const firstResult = apolloResults[0];

    // Extract from organization data
    if (firstResult.organization) {
      const org = firstResult.organization;
      industry = org.industry || org.primary_domain || null;

      // Employee count
      if (org.estimated_num_employees) {
        size = org.estimated_num_employees;
      }

      // HQ location
      if (org.city && org.country) {
        globalHq = `${org.city}, ${org.country}`;
      } else if (org.country) {
        globalHq = org.country;
      }

      // LinkedIn URL from org
      if (!linkedinUrl && org.linkedin_url) {
        linkedinUrl = org.linkedin_url;
      }
    }

    // Check for UAE locations in results
    const uaeLocationsSet = new Set();
    apolloResults.forEach(person => {
      const city = person.city || person.state;
      if (city && (city.includes('Dubai') || city.includes('Abu Dhabi') || city.includes('Sharjah'))) {
        uaeLocationsSet.add(city);
      }
    });

    if (uaeLocationsSet.size > 0) {
      uaeLocations = Array.from(uaeLocationsSet).join(', ');
    }
  }

  // Calculate quality score based on data completeness
  const quality = calculateQualityScore({
    name: company.name,
    domain: company.domain,
    website_url: company.website_url,
    linkedin_url: linkedinUrl,
    industry,
    size,
    globalHq,
    uaeLocations,
    apolloResults
  });

  const enrichedCompany = {
    id: company.id,
    name: company.name,
    domain: company.domain,
    website_url: company.website_url || (company.domain ? `https://${company.domain}` : null),
    linkedin_url: linkedinUrl,
    uae_locations: uaeLocations,
    global_hq: globalHq,
    industry: industry,
    size: size
  };

  return {
    company: enrichedCompany,
    quality: quality,
    timings: {
      total_ms: Date.now() - startTime
    }
  };
}

/**
 * Calculate quality score for enrichment preview
 */
function calculateQualityScore(data) {
  const explanation = [];
  let score = 0;

  // Base score for having company name
  if (data.name) {
    score += 0.15;
    explanation.push({ label: 'Company Name', value: 0.15 });
  }

  // Domain/Website (important for validation)
  if (data.domain || data.website_url) {
    score += 0.20;
    explanation.push({ label: 'Website/Domain', value: 0.20 });
  }

  // LinkedIn (good for verification)
  if (data.linkedin_url) {
    score += 0.15;
    explanation.push({ label: 'LinkedIn Profile', value: 0.15 });
  }

  // Industry (helps with targeting)
  if (data.industry) {
    score += 0.10;
    explanation.push({ label: 'Industry Info', value: 0.10 });
  }

  // Company size (helps with qualification)
  if (data.size) {
    score += 0.10;
    explanation.push({ label: 'Company Size', value: 0.10 });
  }

  // HQ location (helps with context)
  if (data.globalHq) {
    score += 0.10;
    explanation.push({ label: 'HQ Location', value: 0.10 });
  }

  // UAE presence (critical for UPR use case)
  if (data.uaeLocations) {
    score += 0.20;
    explanation.push({ label: 'UAE Presence', value: 0.20 });
  }

  // Bonus for Apollo data availability
  if (data.apolloResults && data.apolloResults.length > 0) {
    const bonus = Math.min(0.10, data.apolloResults.length * 0.02);
    score += bonus;
    explanation.push({ label: `Apollo Contacts (${data.apolloResults.length})`, value: bonus });
  }

  // Cap at 1.0
  score = Math.min(1.0, score);

  return {
    score: score,
    explanation: explanation
  };
}

const router = express.Router();

const ALLOWED_LOCATIONS = new Set(["Abu Dhabi", "Dubai", "Sharjah"]);
function normalizeLocations(loc) {
  if (!loc) return [];
  const arr = Array.isArray(loc) ? loc : String(loc).split(","); // allow comma-separated
  return Array.from(
    new Set(
      arr
        .map((s) => String(s).trim())
        .filter(Boolean)
        .filter((s) => ALLOWED_LOCATIONS.has(s))
    )
  );
}

function coalesceBodyAliases(body = {}) {
  // Accept both old and new keys
  return {
    name: body.name,
    type: body.type ?? body.company_type, // "ALE" | "NON ALE" | "Good Coded"
    locations: normalizeLocations(body.locations),
    website_url: body.website_url ?? body.website,
    linkedin_url: body.linkedin_url ?? body.linkedin,
    status: body.status,
    status_remarks: body.status_remarks,
    about_blurb: body.about_blurb,
  };
}

/**
 * POST /api/companies
 * Body: { name, type|company_type, locations[], website_url|website, linkedin_url|linkedin }
 */
router.post("/", async (req, res) => {
  try {
    const { name, type, locations, website_url, linkedin_url } = coalesceBodyAliases(req.body);
    if (!name) return bad(res, "name required");
    if (type && !isValidCompanyType(type)) return bad(res, "invalid type");

    const norm = name.trim();
    const exists = await pool.query(
      "SELECT id FROM targeted_companies WHERE LOWER(name)=LOWER($1)",
      [norm]
    );
    if (exists.rowCount) return ok(res, { id: exists.rows[0].id, existed: true });

    const ins = await pool.query(
      `INSERT INTO targeted_companies (name, type, locations, website_url, linkedin_url)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, name, type, locations, website_url, linkedin_url, status, status_remarks, about_blurb, qscore, created_at AS created`,
      [norm, type || null, locations, website_url || null, linkedin_url || null]
    );
    return ok(res, ins.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/**
 * GET /api/companies
 * Query: q|search, type, status, location, sort (name|qscore|created_at).(asc|desc)
 */
router.get("/", async (req, res) => {
  try {
    const search = req.query.q ?? req.query.search ?? "";
    const { type, status, location, sort = "created_at.desc" } = req.query;

    const params = [];
    const where = [];

    if (search) {
      params.push(`%${String(search).toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length}
                   OR LOWER(COALESCE(website_url,'')) LIKE $${params.length}
                   OR LOWER(COALESCE(linkedin_url,'')) LIKE $${params.length})`);
    }
    if (type) {
      params.push(type);
      where.push(`type=$${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status=$${params.length}`);
    }
    if (location) {
      params.push(location);
      where.push(`$${params.length} = ANY(locations)`);
    }

    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [col, dir] = String(sort).split(".");
    const orderCol = ["name", "qscore", "created_at"].includes(col) ? col : "created_at";
    const orderDir = dir === "asc" ? "asc" : "desc";

    const q = `
      SELECT
        id, name, type, locations, website_url, linkedin_url,
        status, status_remarks, about_blurb, qscore,
        created_at AS created, updated_at
      FROM targeted_companies
      ${clause}
      ORDER BY ${orderCol} ${orderDir}
      LIMIT 200
    `;
    const rows = await pool.query(q, params);
    return ok(res, rows.rows);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

// [NEW] Endpoint for company name autocomplete
/** GET /api/companies/autocomplete?q=... */
router.get("/autocomplete", async (req, res) => {
  try {
    const { q } = req.query;
    // Only search if 2 or more characters are provided
    if (!q || String(q).trim().length < 2) {
      return ok(res, []);
    }

    const searchTerm = `${String(q).trim()}%`;
    const { rows } = await pool.query(
      `SELECT id, name FROM targeted_companies WHERE name ILIKE $1 ORDER BY name ASC LIMIT 10`,
      [searchTerm]
    );
    return ok(res, rows);
  } catch (e) {
    console.error("Company autocomplete error:", e);
    return bad(res, "server error", 500);
  }
});


/**
 * GET /api/companies/resolve?q=<name|domain|linkedin>
 * Resolves company by domain → name fuzzy match → creates new
 * Tenant-scoped with rate limiting
 *
 * NOTE: Must be defined BEFORE /:id route to avoid route conflict
 */
router.get("/resolve", authAny, async (req, res) => {
  const { q } = req.query;
  const tenant_id = req.user.tenant_id;

  if (!q || q.trim().length === 0) {
    return bad(res, 'Query parameter "q" is required', 400);
  }

  const query = q.trim().toLowerCase();
  const client = await pool.connect();

  try {
    // STEP 1: Try domain match (exact)
    const domainMatch = await client.query(
      `SELECT id, name, domain, linkedin_url
       FROM targeted_companies
       WHERE tenant_id = $1 AND domain = $2
       LIMIT 1`,
      [tenant_id, query]
    );
    if (domainMatch.rows.length > 0) {
      const enriched = await enrichCompanyProfile(domainMatch.rows[0]);
      return ok(res, { ...enriched, matched_by: 'domain', provider: 'database_existing' });
    }

    // STEP 2: Try exact name match (normalized: lowercase, trimmed)
    const exactMatch = await client.query(
      `SELECT id, name, domain, linkedin_url
       FROM targeted_companies
       WHERE tenant_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))
       LIMIT 1`,
      [tenant_id, query]
    );
    if (exactMatch.rows.length > 0) {
      const enriched = await enrichCompanyProfile(exactMatch.rows[0]);
      return ok(res, { ...enriched, matched_by: 'name_exact', provider: 'database_existing' });
    }

    // STEP 3: Try fuzzy name match using ILIKE (basic fuzzy match)
    // TODO: Re-enable SIMILARITY once pg_trgm extension is enabled in database
    const nameMatch = await client.query(
      `SELECT id, name, domain, linkedin_url
       FROM targeted_companies
       WHERE tenant_id = $1 AND LOWER(name) LIKE LOWER($2)
       LIMIT 1`,
      [tenant_id, `%${query}%`]
    );
    if (nameMatch.rows.length > 0) {
      const enriched = await enrichCompanyProfile(nameMatch.rows[0]);
      return ok(res, { ...enriched, matched_by: 'name_fuzzy', provider: 'database_existing' });
    }

    // STEP 4: Rate limiting check (50 new companies per hour per tenant)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await client.query(
      `SELECT COUNT(*) as count
       FROM targeted_companies
       WHERE tenant_id = $1 AND created_at > $2`,
      [tenant_id, hourAgo]
    );

    if (parseInt(recentCount.rows[0].count) >= 50) {
      return bad(res, 'Maximum 50 new companies per hour. Please try again later.', 429);
    }

    // STEP 5: Try to insert new company
    // Note: No ON CONFLICT because constraint doesn't exist yet
    // Database may have duplicate prevention at trigger level
    try {
      const newCompany = await client.query(
        `INSERT INTO targeted_companies (tenant_id, name, created_at, updated_at)
         VALUES ($1, TRIM($2), NOW(), NOW())
         RETURNING id, name, domain, linkedin_url`,
        [tenant_id, query]
      );

      const enriched = await enrichCompanyProfile(newCompany.rows[0]);
      return ok(res, { ...enriched, created_new: true, provider: 'database_new' });
    } catch (insertError) {
      // If duplicate, try to fetch the existing company (check WITHOUT tenant_id first)
      if (insertError.code === '23505') { // Unique violation
        console.log('Duplicate detected, searching for existing company:', query);

        // First try: search by TRIM(name) globally (no tenant filter)
        const globalSearch = await client.query(
          `SELECT id, name, domain, linkedin_url, tenant_id
           FROM targeted_companies
           WHERE TRIM(name) = TRIM($1)
           LIMIT 1`,
          [query]
        );

        if (globalSearch.rows.length > 0) {
          const existing = globalSearch.rows[0];
          console.log('Found existing company with different tenant_id:', existing.tenant_id);
          // Return the existing company even if tenant_id doesn't match
          const enriched = await enrichCompanyProfile(existing);
          return ok(res, { ...enriched, matched_by: 'name_existing_global', provider: 'database_existing' });
        }

        // Second try: case-insensitive search
        const caseInsensitive = await client.query(
          `SELECT id, name, domain, linkedin_url, tenant_id
           FROM targeted_companies
           WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
           LIMIT 1`,
          [query]
        );

        if (caseInsensitive.rows.length > 0) {
          const existing = caseInsensitive.rows[0];
          console.log('Found existing company (case-insensitive):', existing.tenant_id);
          const enriched = await enrichCompanyProfile(existing);
          return ok(res, { ...enriched, matched_by: 'name_existing_ci', provider: 'database_existing' });
        }

        // If still not found, log the error
        console.error('Duplicate constraint violation but no matching record found for:', query);
        return bad(res, 'Duplicate detected but company not found', 500);
      }
      // Re-throw if not a duplicate error
      throw insertError;
    }
  } catch (error) {
    console.error('Error resolving company:', error);
    return bad(res, 'Internal server error', 500);
  } finally {
    // Always release the client connection
    client.release();
  }
});

/**
 * GET /api/companies/preview?q=<company_name>
 * Returns enriched company preview with Q-Score
 * Uses SerpAPI + LLM with 48h caching
 */
router.get('/preview', async (req, res) => {
  try {
    const companyName = (req.query.q || '').trim();

    if (!companyName) {
      return bad(res, 'Missing query parameter: q (company name)', 400);
    }

    if (companyName.length < 2) {
      return bad(res, 'Company name must be at least 2 characters', 400);
    }

    // Generate preview (with caching)
    const preview = await generateCompanyPreview(companyName);

    return res.json({
      ok: true,
      data: preview,
      meta: {
        cached: preview.cached,
        cost_usd: preview.cached ? 0 : 0.006,
        response_time_ms: preview.responseTime
      }
    });

  } catch (error) {
    console.error('[/preview ERROR]:', error);

    return bad(res, 'Failed to generate company preview: ' + error.message, 500);
  }
});

/**
 * POST /api/companies/preview/refine
 * User-initiated refinement with specific domain
 */
router.post('/preview/refine', async (req, res) => {
  try {
    const { company_name, domain } = req.body;

    if (!company_name || !domain) {
      return bad(res, 'Missing required fields: company_name, domain', 400);
    }

    // Force new search with site: operator
    const query = `${company_name} site:${domain}`;
    const preview = await generateCompanyPreview(query);

    // Cache with refined key
    const refinedKey = `preview:${company_name.toLowerCase()}:${domain}`;
    await pool.query(
      `INSERT INTO company_cache (cache_key, company_name, cache_data)
       VALUES ($1, $2, $3)
       ON CONFLICT (cache_key) DO UPDATE SET cache_data = $3`,
      [refinedKey, company_name, preview]
    );

    return res.json({
      ok: true,
      data: preview,
      meta: {
        refined: true,
        original_query: company_name,
        refined_domain: domain
      }
    });

  } catch (error) {
    console.error('[/preview/refine ERROR]:', error);
    return bad(res, 'Refinement failed: ' + error.message, 500);
  }
});

/**
 * GET /api/companies/cache/stats
 * Cache performance analytics
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = await pool.query('SELECT * FROM company_cache_stats');

    return ok(res, stats.rows[0] || {});
  } catch (error) {
    console.error('[/cache/stats ERROR]:', error);
    return bad(res, 'Failed to fetch cache stats', 500);
  }
});

/** GET /api/companies/:id */
router.get("/:id", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, type, locations, website_url, linkedin_url,
              status, status_remarks, about_blurb, qscore,
              created_at AS created, updated_at
       FROM targeted_companies WHERE id=$1`,
      [req.params.id]
    );
    if (!r.rowCount) return bad(res, "not found", 404);
    return ok(res, r.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/**
 * PATCH /api/companies/:id
 * Accepts same aliases as POST.
 */
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = coalesceBodyAliases(req.body);

    const sets = [];
    const params = [];

    const assign = (k, v) => {
      if (v !== undefined) {
        params.push(v);
        sets.push(`${k}=$${params.length}`);
      }
    };

    if (body.type) {
      if (!isValidCompanyType(body.type)) return bad(res, "invalid type");
      assign("type", body.type);
    }
    if (body.locations) assign("locations", body.locations);
    if (body.website_url !== undefined) assign("website_url", body.website_url || null);
    if (body.linkedin_url !== undefined) assign("linkedin_url", body.linkedin_url || null);

    if (body.status !== undefined) {
      if (!isValidCompanyStatus(body.status)) return bad(res, "invalid status");
      assign("status", body.status);
    }
    if (body.status_remarks !== undefined) assign("status_remarks", body.status_remarks || null);
    if (body.about_blurb !== undefined) assign("about_blurb", body.about_blurb || null);

    if (!sets.length) return bad(res, "no changes");

    params.push(id);
    const r = await pool.query(
      `UPDATE targeted_companies
         SET ${sets.join(", ")}, updated_at=now()
       WHERE id=$${params.length}
       RETURNING id, name, type, locations, website_url, linkedin_url,
                 status, status_remarks, about_blurb, qscore,
                 created_at AS created, updated_at`,
      params
    );
    return ok(res, r.rows[0]);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/** GET /api/companies/:id/news */
router.get("/:id/news", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM news_items WHERE company_id=$1 ORDER BY published_at DESC LIMIT 50`,
      [req.params.id]
    );
    return ok(res, r.rows);
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/** POST /api/companies/:id/recompute-qscore */
router.post("/:id/recompute-qscore", async (req, res) => {
  try {
    const { id } = req.params;
    const c = await pool.query("SELECT * FROM targeted_companies WHERE id=$1", [id]);
    if (!c.rowCount) return bad(res, "not found", 404);

    const company = c.rows[0];

    // Get news/signals for the company
    const n = await pool.query(
      "SELECT tags, published_at, date FROM news_items WHERE company_id=$1",
      [id]
    );

    // Compute new 5-component Q-Score
    const qscoreResult = computeQScore(company, n.rows);

    // Store the numeric value (for backward compatibility and sorting)
    // The full breakdown is available via the API response
    const qscoreValue = qscoreResult.value;

    const u = await pool.query(
      `UPDATE targeted_companies
         SET qscore=$1, updated_at=now()
       WHERE id=$2
       RETURNING id, name, type, locations, website_url, linkedin_url,
                 uae_locations, domain, industry, size,
                 status, status_remarks, about_blurb, qscore,
                 created_at AS created, updated_at`,
      [qscoreValue, id]
    );

    // Return enriched response with full Q-Score breakdown
    return ok(res, {
      ...u.rows[0],
      qscore_details: {
        value: qscoreResult.value,
        rating: qscoreResult.rating,
        breakdown: qscoreResult.breakdown
      }
    });
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

/**
 * GET /api/companies/signal/:signalId
 * Load company data WITH the signal that triggered discovery (signal mode)
 * Used when navigating from Hiring Signals page
 */
router.get('/signal/:signalId', async (req, res) => {
  try {
    const { signalId } = req.params;

    // Load signal data from hiring_signals table
    // Note: hiring_signals stores company data directly (no foreign key to targeted_companies)
    const result = await pool.query(`
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
        geo_hints,
        location,
        source_url,
        source_date,
        evidence_quote,
        evidence_note,
        role_cluster,
        created_at
      FROM hiring_signals
      WHERE id = $1
    `, [signalId]);

    if (result.rows.length === 0) {
      return bad(res, 'Signal not found', 404);
    }

    const signal = result.rows[0];

    // Check if signal has UAE presence based on geo data
    const hasUAEPresence = signal.geo_status === 'confirmed' ||
      (Array.isArray(signal.geo_hints) && signal.geo_hints.some(hint =>
        /abu dhabi|dubai|sharjah|uae|united arab emirates/i.test(hint)
      ));

    // Calculate Q-Score with signal present
    const qscore = {
      value: 0,
      rating: 'D',
      breakdown: {
        domain: signal.domain ? 25 : 0,
        linkedin: 0, // hiring_signals doesn't store LinkedIn
        signals: 20, // Signal exists (from hiring signals)
        uae_presence: hasUAEPresence ? 25 : 0,
        recency: signal.source_date ? 10 : 0
      }
    };

    // Recalculate total
    qscore.value = Object.values(qscore.breakdown).reduce((sum, val) => sum + val, 0);

    // Determine rating
    if (qscore.value >= 80) qscore.rating = 'A';
    else if (qscore.value >= 60) qscore.rating = 'B';
    else if (qscore.value >= 40) qscore.rating = 'C';

    // Format response to match preview endpoint structure
    const response = {
      name: signal.company,
      domain: signal.domain,
      website_url: signal.domain ? `https://${signal.domain}` : null,
      linkedin_url: null, // Not stored in hiring_signals
      industry: signal.sector,
      sector: signal.sector,
      employee_range: null,
      employee_count: null,
      hq_location: signal.location || (Array.isArray(signal.geo_hints) && signal.geo_hints.length > 0 ? signal.geo_hints[0] : null),
      description: signal.description,
      founded_year: null,
      uae_presence: hasUAEPresence,

      // SIGNAL DATA (the key difference from preview endpoint)
      signals: [{
        type: signal.trigger_type,
        headline: signal.evidence_quote || signal.description,
        url: signal.source_url,
        date: signal.source_date,
        confidence: signal.hiring_likelihood,
        score: signal.hiring_likelihood_score,
        tags: ['hiring'],
        note: signal.evidence_note
      }],

      recent_news: signal.source_url ? [{
        title: signal.evidence_quote || signal.description,
        url: signal.source_url,
        date: signal.source_date,
        snippet: signal.description
      }] : [],
      qscore,
      trust_score: 0.9, // High trust - from database
      data_sources: ['database', 'hiring_signals'],
      timestamp: new Date().toISOString(),
      cached: true, // From database
      responseTime: 0 // Instant
    };

    return ok(res, response);

  } catch (error) {
    console.error('[/signal/:signalId ERROR]:', error);
    return bad(res, 'Failed to load signal data', 500);
  }
});

module.exports = router;
