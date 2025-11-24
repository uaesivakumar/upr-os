// routes/enrich/index.js
import { Router } from "express";
import { pool } from "../../utils/db.js";
import previewHandler from "./preview.js";
import generateHandler from "./generate.js";
import aiLeadRouter from "./ai-lead.js";
import bulkLeadRouter from "./bulk.js"; // NEW: Import the bulk router
import contactsHandler from "./contacts.js"; // SIVA Phase 12: Import contacts endpoint
import { enrichWithLLM } from "../../utils/llm.js";
import { qualityScore as calculateQualityScore } from "./lib/quality.js";
import { URL } from "url";
import { fetchUrlMeta } from "./lib/http.js";
import { minimalCompanyFromDomain } from "./lib/minimal.js";
import { buildSerpQueries } from "./lib/search.js";
import { searchSerpApi } from "./lib/retriever.js";
import { findLinkedInURL } from "../../utils/linkedinEnrichment.js";
import { enrichCompanyNews } from "../../utils/newsEnrichment.js";

const router = Router();

// --- Main Endpoints ---
router.post("/preview", previewHandler);
router.post("/generate", generateHandler);
router.use(aiLeadRouter); // Handles /person
router.use(bulkLeadRouter); // NEW: Mount the bulk router to handle /bulk
router.post("/contacts", contactsHandler); // SIVA Phase 12: Contact enrichment with SIVA scoring

/**
 * POST /api/enrich/refine
 * The fully refactored endpoint using all new robust helpers.
 */
router.post("/refine", async (req, res) => {
    const started = Date.now();
    
    const qRaw = (req.body?.q ?? req.body?.query ?? "").toString().trim();
    const urlRaw = (req.body?.url ?? req.body?.userUrl ?? "").toString().trim();

    if (!urlRaw) {
        return res.status(400).json({ ok: false, error: "A URL is required for refinement." });
    }

    const q = qRaw || "(domain-only)";
    const userUrl = urlRaw;
    const reqId = req._reqid || "refine";
    console.log(`[${reqId}] Refining search for '${q}' with user-provided URL: ${userUrl}`);

    let meta = null;
    let company = null;
    let provider = "llm_refined";
    let llmResult = null;

    try {
        try {
            meta = await fetchUrlMeta(userUrl);
        } catch (e) {
            console.warn(`[http] URL probe failed for ${userUrl}: ${e.message}`);
        }

        if (!meta || !meta.ok) {
            console.log(`[${reqId}] URL probe failed, attempting deterministic fallback immediately.`);
            company = minimalCompanyFromDomain(userUrl, null);
            provider = "fallback";
        } else {
            const queries = buildSerpQueries(q, meta.finalUrl);
            const serpTasks = queries.map(query => searchSerpApi(query));
            const serpResultsArrays = await Promise.all(serpTasks);
            const serpResults = serpResultsArrays.flat();
            const candidates = serpResults.map(r => ({ link: r.link, title: r.title, snippet: r.snippet }));
            
            candidates.unshift({
                title: meta.title || new URL(meta.finalUrl).hostname,
                link: meta.finalUrl,
                snippet: `Official website provided by user for refinement.`
            });

            llmResult = await enrichWithLLM(candidates, q, { promptType: 'refine' });
            company = llmResult.company;

            if (!company || !company.name) {
                console.log(`[${reqId}] LLM failed, creating deterministic fallback for domain: ${meta.finalUrl}`);
                company = minimalCompanyFromDomain(meta.finalUrl, meta.title);
                provider = "fallback";
            }
        }

        if (!company) {
            return res.status(200).json({ ok: true, data: { summary: null, error_code: 'URL_UNREACHABLE' } });
        }

        let companyId = null;
        try {
            const sql = `
              INSERT INTO targeted_companies (name, domain, website_url, linkedin_url, locations, industry, size_range, updated_at) 
              VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
              ON CONFLICT (domain) DO UPDATE SET 
                  name = EXCLUDED.name, website_url = EXCLUDED.website_url, linkedin_url = EXCLUDED.linkedin_url, 
                  locations = EXCLUDED.locations, industry = EXCLUDED.industry, size_range = EXCLUDED.size_range, updated_at = NOW() 
              RETURNING id;`;
            const locs = company.uae_locations && company.uae_locations !== "Unknown" ? company.uae_locations.split(',').map(l => l.trim()) : [];
            if (company.global_hq && !locs.includes(company.global_hq)) locs.push(company.global_hq);
            
            const { rows } = await pool.query(sql, [company.name, company.domain, company.website_url, company.linkedin_url, locs.length ? [...new Set(locs)] : null, company.industry, company.size]);
            companyId = rows[0]?.id || null;
        } catch (dbErr) {
            console.warn(`[${reqId}] DB upsert failed during refine (non-fatal):`, dbErr.message);
        }

        const finalCompany = { ...company, id: companyId };
        const summary = {
            provider: provider,
            company: finalCompany,
            quality: calculateQualityScore(finalCompany, []),
            timings: { total_ms: Date.now() - started, llm_ms: provider === 'fallback' ? 0 : (llmResult?.llm_ms || 0) },
        };
        
        return res.status(200).json({ ok: true, data: { summary } });

    } catch (e) {
        console.error(`[${reqId}] Critical /refine error`, e?.stack || e);
        return res.status(500).json({ ok: false, error: "Refine pipeline crashed: " + (e?.message || "unknown") });
    }
});

router.post('/save', async (req, res) => {
  const { leads, company } = req.body || {};
  if (!company || !company.id || !Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ ok: false, error: 'company and leads[] are required' });
  }

  let saved = 0;
  try {
    await pool.query("BEGIN");
    for (const c of leads) {
      if (!c.name || !c.designation || !c.email) continue;
      try {
        const sql = `
          INSERT INTO hr_leads (
            company_id, name, designation, email, email_status, linkedin_url, 
            location, source, confidence, role_bucket, seniority, lead_source
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (linkedin_url) DO UPDATE SET
            email=EXCLUDED.email,
            email_status=EXCLUDED.email_status,
            updated_at=now()
          RETURNING 1;
        `;
        const result = await pool.query(sql, [
          company.id, c.name, c.designation, c.email, c.email_status, c.linkedin_url,
          c.location || c.emirate, 'enrichment', c.confidence, c.role_bucket, c.seniority, c.lead_source
        ]);

        if (result.rowCount > 0) {
            saved++;
        }
      } catch (rowErr) {
        console.error('Per-row save error:', rowErr.message);
      }
    }
    await pool.query("COMMIT");
  } catch (e) {
    try { await pool.query("ROLLBACK"); } catch {}
    console.error(`[${req._reqid}] enrich/save error`, e?.stack || e);
    return res.status(500).json({ ok: false, error: "bulk-insert-failed", saved });
  }

  return res.json({ ok: true, saved });
});

export default router;