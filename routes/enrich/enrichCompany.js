import express from "express";
import { nanoid } from "nanoid";
import {
  compactApolloKeywords, apolloPeopleByDomain,
  deriveLocation
} from "./lib/apollo.js";
import { qualityScore } from "./lib/quality.js";
import { scoreCandidate, roleBucket, bucketSeniority } from "./lib/person.js"; // <-- MODIFIED
import { emirateFromLocation, isUAE } from "./lib/geo.js";
import {
  inferPatternFromSamples, applyPattern, isProviderPlaceholderEmail,
  loadPatternFromCache, savePatternToCache, verifyEmail
} from "./lib/email.js";

export default function buildEnrichCompanyRouter({ pool }) {
  const router = express.Router();
  const jobs = new Map();

  // POST /api/enrich  { company_id, max_contacts? }
  router.post("/", async (req, res) => {
    const { company_id, max_contacts = 3 } = req.body || {};
    if (!company_id) return res.status(400).json({ status: "error", error: "company_id_required" });

    const job_id = `enrich_${Date.now()}_${nanoid(6)}`;
    jobs.set(job_id, { status: "queued", company_id, results: [], summary: {} });

    try {
      const company = await getCompany(pool, company_id);
      if (!company) {
        const payload = { job_id, status: "error", error: "company_not_found" };
        jobs.set(job_id, payload);
        return res.status(404).json(payload);
      }

      if (!company.domain && company.website_url) {
        try {
          const u = new URL(company.website_url.startsWith("http") ? company.website_url : `https://${company.website_url}`);
          company.domain = u.hostname.replace(/^www\\./, "");
        } catch {}
      }

      if (!company.domain) {
        const payload = { job_id, status: "error", error: "no_domain" };
        jobs.set(job_id, payload);
        return res.status(400).json(payload);
      }

      res.status(202).json({ job_id, status: "running" });

      jobs.set(job_id, { status: "running", company_id });
      const rawPeople = await apolloPeopleByDomain(company.domain, 20);

      const candidates = [];
      const emailSamples = [];
      const seen = new Set();
      for (const p of rawPeople) {
        const key = `${String(p.first_name).trim()} ${String(p.last_name).trim()}`.toLowerCase();
        if (!p.first_name || !p.last_name || seen.has(key)) continue;
        seen.add(key);

        const cand = {
          name: `${p.first_name} ${p.last_name}`,
          designation: p.title,
          linkedin_url: p.linkedin_url,
          location: deriveLocation(p),
          email: p.email,
        };
        if (cand.email && !isProviderPlaceholderEmail(cand.email)) {
          emailSamples.push({ name: cand.name, email: cand.email });
        }
        candidates.push(cand);
      }

      // Geo-tag emirates
      for (const c of candidates) {
        c.emirate = emirateFromLocation(c.location);
      }

      // Filter to UAE contacts in relevant roles
      const uaeContacts = candidates.filter(c => isUAE(c.location) && roleBucket(c.designation) !== "other");

      // Infer email pattern
      const domainPattern = await loadPatternFromCache(pool, company.domain);
      let pattern = domainPattern?.pattern;
      if (!pattern && emailSamples.length > 2) {
        pattern = inferPatternFromSamples(emailSamples, company.domain);
        if (pattern) await savePatternToCache(pool, company.domain, pattern, emailSamples[0]?.email);
      }

      const finalLeads = [];
      for (const c of uaeContacts) {
        const lead = { ...c };
        lead.role_bucket = roleBucket(c.designation);
        lead.seniority = bucketSeniority(c.designation);

        if (!lead.email) {
          const guess = applyPattern(lead, company.domain, pattern);
          if (guess) {
            lead.email = guess;
            lead.email_status = "patterned";
          }
        }
        
        if (lead.email && lead.email_status !== "patterned") {
          const v = await verifyEmail(lead.email);
          lead.email_status = v.status;
        }

        lead.confidence = scoreCandidate(lead);
        finalLeads.push(lead);
      }

      finalLeads.sort((a,b) => (b.confidence||0) - (a.confidence||0));

      const topLeads = finalLeads.slice(0, max_contacts);
      const saved = [];
      for (const lead of topLeads) {
        const s = await saveLead(pool, company.id, lead);
        if (s) saved.push(s);
      }

      jobs.set(job_id, {
        status: "complete",
        company_id,
        results: saved,
        summary: {
          pattern,
          candidates_found: candidates.length,
          uae_contacts: uaeContacts.length,
          leads_saved: saved.length,
        }
      });

    } catch (e) {
      console.error(`[job ${job_id}] failed`, e);
      jobs.set(job_id, { status: "error", error: e.message });
    }
  });

  router.get("/:job_id", (req, res) => {
    const j = jobs.get(req.params.job_id);
    if (!j) return res.status(404).json({ status: "error", error: "not_found" });
    return res.json(j);
  });

  return router;
}

async function getCompany(pool, id) {
  const { rows } = await pool.query("SELECT * FROM companies WHERE id=$1", [id]);
  return rows[0];
}

async function saveLead(pool, company_id, c) {
  const q = `
    INSERT INTO hr_leads (company_id, name, designation, linkedin_url, email, email_status, source, confidence, role_bucket, seniority, email_reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (company_id, lower(name)) DO UPDATE SET
      designation=EXCLUDED.designation,
      linkedin_url=EXCLUDED.linkedin_url,
      email=EXCLUDED.email,
      email_status=EXCLUDED.email_status,
      source=EXCLUDED.source,
      confidence=EXCLUDED.confidence,
      role_bucket=EXCLUDED.role_bucket,
      seniority=EXCLUDED.seniority,
      email_reason=EXCLUDED.email_reason
    RETURNING id, company_id, email, confidence
  `;
  const vals = [
    company_id,
    c.name || "",
    c.designation || "",
    c.linkedin_url || "",
    c.email || null,
    c.email_status || "unknown",
    c.source || "live",
    c.confidence ?? null,
    c.role_bucket || null,
    c.seniority || null,
    c.email_reason || null,
  ];
  const { rows } = await pool.query(q, vals);
  return rows[0];
}