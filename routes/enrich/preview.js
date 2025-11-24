// routes/enrich/preview.js
import { pool } from "../../utils/db.js";
import { enrichWithLLM } from "../../utils/llm.js";
import { qualityScore } from "./lib/quality.js";
import { searchSerpApi } from "./lib/retriever.js";
import { URL } from "url";
import { buildSerpQueries } from "./lib/search.js";
import { minimalCompanyFromDomain } from "./lib/minimal.js";
import { findLinkedInURL } from "../../utils/linkedinEnrichment.js";
import { enrichCompanyNews } from "../../utils/newsEnrichment.js";
import { getCompanyBusinessSignals, hasActiveHiringSignals } from "../../utils/dataHelpers/businessSignals.js";

// --- NEW: Database-backed Caching Layer ---
const TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

async function dbCacheGet(key) {
    try {
        const { rows } = await pool.query(
            "SELECT cache_value, created_at FROM enrichment_cache WHERE cache_key = $1",
            [key]
        );

        if (rows.length === 0) {
            return undefined; // Cache miss
        }

        const { cache_value, created_at } = rows[0];
        if (Date.now() - new Date(created_at).getTime() > TTL_MS) {
            // Entry is stale, treat as a miss but don't block. We can purge it later.
            return undefined;
        }
        
        return cache_value;
    } catch (e) {
        console.error(`[DBCache] Error getting key ${key}:`, e.message);
        return undefined; // On error, treat as a miss
    }
}

async function dbCacheSet(key, data) {
    try {
        await pool.query(
            `INSERT INTO enrichment_cache (cache_key, cache_value, created_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (cache_key) DO UPDATE SET
                cache_value = EXCLUDED.cache_value,
                created_at = NOW()`,
            [key, data]
        );
    } catch(e) {
        console.error(`[DBCache] Error setting key ${key}:`, e.message);
    }
}


// --- Helpers & Final Gates ---
function cleanStr(v) { return String(v ?? "").trim() || null; }
function apex(host){ host = (host || "").replace(/^www\./,''); const p = host.split('.'); return p.length > 1 ? p.slice(-2).join('.') : host; }
function normDomain(u) {
  try {
    const url = new URL(u.startsWith("http") ? u : `https://${u}`);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return String(u || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] || null;
  }
}

const EXTERNAL = new Set([
  "forbes.com","reuters.com","bloomberg.com","zawya.com","prnewswire.com", "globenewswire.com","medium.com","substack.com","techcrunch.com",
  "zoominfo.com","rocketreach.co","dnb.com","crunchbase.com","signalhire.com", "glassdoor.com","indeed.com","bayt.com", "aiwa.ae","yellowpages.ae",
  "yellowpages-uae.com","yello.ae","uaecontact.com", "atninfo.com","connect.ae","kompass.com","yellowplace.ae","uaebusinessdirectory.com",
  "yoys.ae","2gis.ae","securityworldmarket.com","yellowpages-uae.net","localsearch.ae","yalwa.ae", "yolasite.com","wixsite.com","wordpress.com",
  "wordpress.org","squarespace.com", "weebly.com","blogspot.com","sites.google.com","godaddysites.com","webnode.page", "netlify.app","github.io","about.me"
]);

const UAE_CITIES = ["abu dhabi","dubai","sharjah","ajman", "umm al quwain","ras al khaimah","fujirah"];
function hasUaePresence(v) {
  const s = String(v).toLowerCase().trim();
  return s && s !== "no offices found" && s !== "Unknown" && UAE_CITIES.some(c => s.includes(c));
}
const UAE_ONLY = (process.env.UAE_ONLY ?? "true").toLowerCase() !== "false";

async function guessSizeFromSerp({ name, domain, linkedin_url }) {
  const qs = [];
  if (linkedin_url) qs.push(linkedin_url);
  if (name) qs.push(`${name} site:linkedin.com/company`);
  if (domain) qs.push(`${domain} site:linkedin.com/company`);
  for (const q of qs) {
    const results = await searchSerpApi(q);
    for (const r of results || []) {
      const size = r.snippet?.match(/([0-9,]+\s*-\s*[0-9,]+|\d{1,3}(?:,\d{3})+\+?)\s*employees/i);
      if (size) return size[1].replace(/\s*-\s*/g, "–") + " employees";
    }
  }
  return null;
}

// --- Main Handler ---
export default async function previewHandler(req, res) {
  const started = Date.now();
  const q = cleanStr(req.body?.q);
  if (!q) return res.status(200).json({ ok: true, data: { results: [], summary: {} } });
  
  const qKey = `q:${q.toLowerCase()}`;
  const reqId = req._reqid || "preview";
  console.log(`[${reqId}] Preview pipeline starting for q="${q}"`);

  try {
    console.log(`[${reqId}/DEBUG] 🔍 Checking cache for qKey: "${qKey}"`);
    let candidates = await dbCacheGet(qKey);
    if (!candidates) {
      console.log(`[${reqId}] No cache hit for "${q}". Running smarter SERP search.`);
      console.log(`[${reqId}/DEBUG] ❌ Cache MISS - will run SERP search`);
      const queries = buildSerpQueries(q);
      const serpTasks = queries.map(query => searchSerpApi(query));
      const serpResultsArrays = await Promise.all(serpTasks);
      const serpResults = serpResultsArrays.flat();
      const uniqueResults = [...new Map(serpResults.map(item => [item["link"], item])).values()];
      candidates = uniqueResults.map(r => {
        try {
          return { link: r.link, title: r.title, snippet: r.snippet, domain: new URL(r.link).hostname.toLowerCase() };
        } catch { return null; }
      }).filter(Boolean);
      console.log(`[${reqId}/DEBUG] ✅ SERP search found ${candidates.length} candidates`);
      await dbCacheSet(qKey, candidates);
    } else {
      console.log(`[${reqId}/DEBUG] ✅ Cache HIT - using cached candidates (${candidates.length} results)`);
    }
    
    if (!candidates || candidates.length === 0) {
      return res.status(200).json({ ok: true, data: { summary: null, error_code: 'NOT_FOUND' } });
    }

    console.log(`[${reqId}/DEBUG] 🤖 Calling enrichWithLLM with ${candidates.slice(0, 20).length} candidates`);
    const llmResult = await enrichWithLLM(candidates.slice(0, 20), q);
    let company = llmResult.company;
    let provider = "llm";
    console.log(`[${reqId}/DEBUG] 📊 LLM returned company: ${JSON.stringify({name: company?.name, domain: company?.domain, linkedin_url: company?.linkedin_url})}`);

    if (!company || !company.name) {
      const plausibleDomain = llmResult.company?.website_url || llmResult.company?.domain;
      if (plausibleDomain) {
        console.log(`[${reqId}] LLM failed to fully enrich, creating fallback for domain: ${plausibleDomain}`);
        console.log(`[${reqId}/DEBUG] ⚠️  Using fallback for domain: ${plausibleDomain}`);
        company = minimalCompanyFromDomain(plausibleDomain, null);
        provider = "fallback";
        console.log(`[${reqId}/DEBUG] 📊 Fallback company: ${JSON.stringify({name: company?.name, domain: company?.domain, linkedin_url: company?.linkedin_url})}`);
      }
    }

    if (!company) {
      console.warn(`[${reqId}] LLM and fallback failed to find a confident match for "${q}".`);
      console.log(`[${reqId}/DEBUG] ❌ No company found, returning NOT_FOUND`);
      return res.status(200).json({ ok: true, data: { summary: null, error_code: 'NOT_FOUND' } });
    }

    const finalDomain = normDomain(company.website_url);
    if (!finalDomain || EXTERNAL.has(apex(finalDomain))) {
        console.warn(`[${reqId}] Veto: AI or fallback picked an invalid/external domain: ${finalDomain}`);
        return res.status(200).json({ ok: true, data: { summary: null, error_code: 'NOT_FOUND' } });
    }

    company.domain = finalDomain;
    
    if (UAE_ONLY && !hasUaePresence(company.uae_locations) && !hasUaePresence(company.global_hq)) {
      return res.status(200).json({ ok: true, data: { summary: null, error_code: 'NO_UAE_PRESENCE' } });
    }
    
    // --- Secondary Enrichment Steps to Restore Richness ---
    if (!company.size) company.size = await guessSizeFromSerp(company);

    // FIX 5: Enhanced LinkedIn URL enrichment with SerpAPI fallback + diagnostic logging
    console.log(`[${reqId}] 🔗 Company LinkedIn URL from LLM: ${company.linkedin_url || 'NOT PROVIDED'}`);
    console.log(`[${reqId}/DEBUG] 🔗 Checking LinkedIn enrichment conditions:`);
    console.log(`[${reqId}/DEBUG]   - company.linkedin_url: ${company.linkedin_url || 'null'}`);
    console.log(`[${reqId}/DEBUG]   - company.name: ${company.name || 'null'}`);
    console.log(`[${reqId}/DEBUG]   - company.domain: ${company.domain || 'null'}`);

    if (!company.linkedin_url && company.name) {
      console.log(`[${reqId}] 🔵 Enriching LinkedIn URL for "${company.name}" (domain: ${company.domain})...`);
      console.log(`[${reqId}/DEBUG] ✅ Conditions met - calling findLinkedInURL()`);
      try {
        const enrichedUrl = await findLinkedInURL(company.name, company.domain);
        company.linkedin_url = enrichedUrl;
        console.log(`[${reqId}] ✅ LinkedIn URL enriched: ${company.linkedin_url || 'NOT FOUND'}`);
        console.log(`[${reqId}/DEBUG] 📤 findLinkedInURL returned: ${enrichedUrl || 'null'}`);
      } catch (err) {
        console.error(`[${reqId}] ❌ LinkedIn enrichment error:`, err.message);
        console.log(`[${reqId}/DEBUG] ❌ findLinkedInURL threw error: ${err.stack}`);
      }
    } else if (company.linkedin_url) {
      console.log(`[${reqId}] ✅ LinkedIn URL already provided by LLM, skipping enrichment`);
      console.log(`[${reqId}/DEBUG] ⏭️  Skipping because company.linkedin_url already exists: ${company.linkedin_url}`);
    } else {
      console.log(`[${reqId}] ⚠️  Skipping LinkedIn enrichment - no company name available`);
      console.log(`[${reqId}/DEBUG] ⏭️  Skipping because company.name is missing`);
    }

    // FIX BUG 7: Enrich company with recent news articles
    if (company.name) {
      console.log(`[${reqId}] 🔵 Enriching recent news for "${company.name}"...`);
      try {
        const newsArticles = await enrichCompanyNews(company.name, company.domain);
        company.recentNews = newsArticles;
        company.recentNewsCount = newsArticles.length;
        console.log(`[${reqId}] ✅ Found ${newsArticles.length} recent news articles`);
      } catch (err) {
        console.error(`[${reqId}] News enrichment error:`, err.message);
        company.recentNews = [];
        company.recentNewsCount = 0;
      }
    }

    // Calculate AI Confidence (boosts with signals, LinkedIn, news)
    let aiConfidence = 85; // Base confidence
    if (company.signals && company.signals.length > 0) {
      aiConfidence = Math.min(aiConfidence + 10, 100);
    }
    if (company.linkedin_url) {
      aiConfidence = Math.min(aiConfidence + 3, 100);
    }
    if (company.recentNews && company.recentNews.length > 0) {
      aiConfidence = Math.min(aiConfidence + 2, 100);
    }
    company.ai_confidence = aiConfidence;
    console.log(`[${reqId}] 🎯 AI Confidence: ${aiConfidence}% (signals: ${company.signals?.length || 0}, LinkedIn: ${company.linkedin_url ? 'yes' : 'no'}, news: ${company.recentNews?.length || 0})`);

    // --- DB Upsert & Final Response ---
    let companyId = null;
    try {
        const companySql = `INSERT INTO targeted_companies (name, domain, website_url, linkedin_url, locations, industry, size_range) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (domain) DO UPDATE SET name = EXCLUDED.name, website_url = EXCLUDED.website_url, linkedin_url = EXCLUDED.linkedin_url, locations = EXCLUDED.locations, industry = EXCLUDED.industry, size_range = EXCLUDED.size_range, updated_at = NOW() RETURNING id;`;
        const locationsArr = [];
        if (company.global_hq) locationsArr.push(company.global_hq);
        if (company.uae_locations && company.uae_locations !== "No offices found" && company.uae_locations !== "Unknown") {
            locationsArr.push(...company.uae_locations.split(",").map(x => x.trim()).filter(Boolean));
        }
        const { rows } = await pool.query(companySql, [company.name, company.domain, company.website_url, company.linkedin_url, locationsArr.length ? [...new Set(locationsArr)] : null, company.industry, company.size]);
        companyId = rows?.[0]?.id || null;
    } catch (dbErr) { console.warn(`[${reqId}] DB upsert failed (non-fatal):`, dbErr.message); }

    // Query hiring signals from database using centralized helper
    if (companyId) {
      try {
        const hiringSignals = await getCompanyBusinessSignals(companyId);
        company.dbHiringSignals = hiringSignals;
        company.hasActiveHiring = hasActiveHiringSignals(hiringSignals);
        console.log(`[${reqId}] 🔥 Hiring signals from DB: ${hiringSignals.length} signals, active=${company.hasActiveHiring}`);
      } catch (err) {
        console.warn(`[${reqId}] Failed to fetch hiring signals:`, err.message);
        company.dbHiringSignals = [];
        company.hasActiveHiring = false;
      }
    }

    // DEBUG: Compare LLM signals vs DB signals to diagnose sync issue
    console.log(`[${reqId}] 🔍 === SIGNAL COMPARISON ===`);
    console.log(`[${reqId}]   LLM signals (company.signals): ${company.signals?.length || 0}`);
    console.log(`[${reqId}]   DB signals (company.dbHiringSignals): ${company.dbHiringSignals?.length || 0}`);
    if (company.signals && company.signals.length > 0) {
      console.log(`[${reqId}]   LLM signals data:`, JSON.stringify(company.signals, null, 2));
    }
    if (company.dbHiringSignals && company.dbHiringSignals.length > 0) {
      console.log(`[${reqId}]   DB signals data:`, JSON.stringify(company.dbHiringSignals, null, 2));
    }
    console.log(`[${reqId}] 🔍 === END COMPARISON ===`);

    const summary = {
      provider: provider,
      company: { ...company, id: companyId },
      quality: qualityScore(company, []),
      timings: { total_ms: Date.now() - started, llm_ms: provider === 'fallback' ? 0 : llmResult.llm_ms },
    };

    const companyCacheKey = `c:${summary.company.domain}`;
    await dbCacheSet(companyCacheKey, summary);
    
    return res.status(200).json({ ok: true, data: { results: [], summary }, took_ms: Date.now() - started });
  } catch (e) {
    console.error(`[${reqId}] enrich/preview error`, e?.stack || e);
    return res.status(500).json({ ok: false, error: "Preview pipeline crashed: " + (e?.message || "unknown") });
  }
}