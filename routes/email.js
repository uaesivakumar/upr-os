// routes/email.js
const express = require("express");
const { ok, bad } = require("../utils/respond");
const { adminOnly } = require("../utils/adminOnly");
const { pool } = require("../utils/db");
const { inferPatternFromSamples, applyPattern } = require("../utils/emailPatterns");
const { verifyEmail } = require("../utils/emailVerify");
const { getDomainPattern, setDomainPattern } = require("../utils/patternCache");

const router = express.Router();

const MAX_VERIFY = Number(process.env.SMTP_VERIFY_MAX || 8);

const DEFAULT_PATTERNS = ["{first}.{last}@{domain}", "{f}{last}@{domain}"];

function splitName(name = "") {
  const parts = String(name || "").toLowerCase().replace(/[^a-z\s]/g, '').split(' ').filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts[parts.length - 1] };
}

router.post("/verify", adminOnly, async (req, res) => {
  // ... (existing /verify endpoint code, no changes)
  try {
    const { emails = [], domain, names = [], known = [], savePattern = true } = req.body || {};
    if (!emails.length && !domain) return bad(res, "Provide emails or a domain");
    let cached = domain ? await getDomainPattern(domain) : null;
    let discovered = null;
    if (domain && known.length > 0) {
        const patternFromKnown = inferPatternFromSamples(known, domain);
        if (patternFromKnown) {
            discovered = { domain, pattern_id: patternFromKnown.pattern, source: "verify" };
            if (savePattern) {
                await setDomainPattern({ domain, pattern_id: patternFromKnown.pattern, source: "verify", example: known.find(k => k?.email)?.email || null, confidence: patternFromKnown.confidence });
                cached = await getDomainPattern(domain);
            }
        }
    }
    const generated = [];
    if (domain && names.length) {
      const pat = (cached && cached.pattern_id) || (discovered && discovered.pattern_id) || null;
      if (pat) {
        for (const n of names) {
          const { first, last } = splitName(n);
          const email = applyPattern(first, last, pat, domain);
          if (email) generated.push({ name: n, email, pattern: pat });
        }
      } else {
        for (const n of names) {
          const { first, last } = splitName(n);
          const email = applyPattern(first, last, DEFAULT_PATTERNS[0], domain);
          if (email) generated.push({ name: n, email: email, pattern: DEFAULT_PATTERNS[0], guessed: true });
        }
      }
    }
    const verifyList = [];
    const seen = new Set();
    for (const e of emails) { const v = String(e || "").trim().toLowerCase(); if (!v || seen.has(v)) continue; seen.add(v); verifyList.push(v); }
    for (const g of generated) { const v = String(g.email || "").trim().toLowerCase(); if (!v || seen.has(v)) continue; seen.add(v); verifyList.push(v); }
    verifyList.splice(MAX_VERIFY);
    const results = [];
    for (const email of verifyList) {
      try {
        const r = await verifyEmail(email);
        results.push({ email, status: r.status, mxHost: r.mxHost });
      } catch (e) {
        results.push({ email, status: "unknown", error: String(e?.message || e) });
      }
    }
    if (domain) {
      const gotValid = results.some(r => r.status === "valid" && r.email.endsWith(`@${domain.toLowerCase()}`));
      const pat = (cached && cached.pattern_id) || (discovered && discovered.pattern_id) || null;
      if (gotValid && pat && savePattern) {
        await setDomainPattern({ domain, pattern_id: pat, source: (cached && cached.source) || "verify", incrementVerified: true });
      }
    }
    return ok(res, { domain: domain || null, cachedPattern: cached ? cached.pattern_id : null, discoveredPattern: discovered ? discovered.pattern_id : null, generated, results });
  } catch (e) {
    console.error("email/verify error:", e);
    return bad(res, "verification failed", 500);
  }
});

router.get("/patterns", adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.search ? String(req.query.search).trim() : null;
    const statusFilter = req.query.status ? String(req.query.status).trim() : null;
    const sourceFilter = req.query.source ? String(req.query.source).trim() : null;
    const allowedSortBy = new Set(['domain', 'pattern', 'confidence', 'status', 'source', 'updated_at', 'support_count']);
    const sortByParam = req.query.sortBy ? String(req.query.sortBy) : 'confidence';
    const sortOrderParam = req.query.sortOrder ? String(req.query.sortOrder).toUpperCase() : 'DESC';
    const sortBy = allowedSortBy.has(sortByParam) ? sortByParam : 'confidence';
    const sortOrder = ['ASC', 'DESC'].includes(sortOrderParam) ? sortOrderParam : 'DESC';
    const orderByClause = `ORDER BY ${sortBy} ${sortOrder}, domain ASC`;
    const queryParams = [];
    const whereClauses = [];
    if (searchTerm) { queryParams.push(`%${searchTerm}%`); whereClauses.push(`domain ILIKE $${queryParams.length}`); }
    const allowedStatuses = ['valid', 'invalid', 'catch_all', 'unknown'];
    if (statusFilter && allowedStatuses.includes(statusFilter)) { queryParams.push(statusFilter); whereClauses.push(`status = $${queryParams.length}`); }
    if (sourceFilter) { queryParams.push(sourceFilter); whereClauses.push(`source = $${queryParams.length}`); }
    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countQuery = `SELECT COUNT(*) FROM email_patterns ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count, 10);
    const pages = Math.ceil(total / limit);
    const patternsParams = [...queryParams, limit, offset];
    // --- UPDATED: Added is_verified to the SELECT statement ---
    const patternsQuery = `
      SELECT domain, pattern, source, confidence, status, example_email, updated_at, support_count, is_verified 
      FROM email_patterns 
      ${whereClause} 
      ${orderByClause} 
      LIMIT $${patternsParams.length - 1} OFFSET $${patternsParams.length}
    `;
    const patternsResult = await pool.query(patternsQuery, patternsParams);
    return ok(res, { patterns: patternsResult.rows, pagination: { total, page, limit, pages } });
  } catch (e) {
    console.error("email/patterns get error:", e);
    return bad(res, "server error", 500);
  }
});

router.get("/patterns/stats", adminOnly, async (_req, res) => {
  try {
    const statsQuery = `SELECT status, COUNT(*) AS count FROM email_patterns GROUP BY status;`;
    const { rows } = await pool.query(statsQuery);
    const stats = rows.reduce((acc, row) => { acc[row.status] = parseInt(row.count, 10); return acc; }, {});
    return ok(res, stats);
  } catch (e) {
    console.error("email/patterns/stats get error:", e);
    return bad(res, "server error", 500);
  }
});

router.post("/patterns/recalculate-support", adminOnly, async (_req, res) => {
  // ... (existing recalculate endpoint code, no changes)
  try {
    const [patternsRes, leadsRes] = await Promise.all([
      pool.query('SELECT domain, pattern FROM email_patterns'),
      pool.query(`SELECT hl.name, hl.email, tc.domain FROM hr_leads hl JOIN targeted_companies tc ON hl.company_id = tc.id WHERE tc.domain IS NOT NULL AND hl.email IS NOT NULL AND hl.name IS NOT NULL`)
    ]);
    const leadsByDomain = new Map();
    for (const lead of leadsRes.rows) {
      if (!leadsByDomain.has(lead.domain)) leadsByDomain.set(lead.domain, []);
      leadsByDomain.get(lead.domain).push(lead);
    }
    const supportCounts = new Map();
    for (const p of patternsRes.rows) {
      const domainLeads = leadsByDomain.get(p.domain) || [];
      let count = 0;
      for (const lead of domainLeads) {
        const { first, last } = splitName(lead.name);
        const generatedEmail = applyPattern(first, last, `{${p.pattern}}`, p.domain);
        if (generatedEmail && generatedEmail.toLowerCase() === lead.email.toLowerCase()) {
          count++;
        }
      }
      supportCounts.set(p.domain, count);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE email_patterns SET support_count = 0');
      for (const [domain, count] of supportCounts.entries()) {
        if (count > 0) {
          await client.query('UPDATE email_patterns SET support_count = $1 WHERE domain = $2', [count, domain]);
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return ok(res, { message: `${supportCounts.size} patterns checked and support counts updated.` });
  } catch (e) {
    console.error("email/patterns/recalculate-support error:", e);
    return bad(res, "Server error during recalculation.", 500);
  }
});

// UPDATED: Manually edit a pattern, now with is_verified flag
router.put("/patterns/:domain", adminOnly, async (req, res) => {
  try {
    const { domain } = req.params;
    const { pattern, status, is_verified } = req.body; // is_verified is now expected

    if (!domain) return bad(res, "Domain parameter is required.", 400);
    if (!pattern || !status) return bad(res, "Request body must include 'pattern' and 'status'.", 400);
    
    const allowedStatuses = ['valid', 'invalid', 'catch_all', 'unknown'];
    if (!allowedStatuses.includes(status)) {
      return bad(res, `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`, 400);
    }

    const updateQuery = `
      UPDATE email_patterns 
      SET 
        pattern = $1, 
        status = $2, 
        is_verified = $3, 
        source = 'manual_edit', 
        confidence = 1.0, 
        updated_at = NOW() 
      WHERE domain = $4 
      RETURNING *;
    `;
    const { rows, rowCount } = await pool.query(updateQuery, [pattern, status, Boolean(is_verified), domain]);

    if (rowCount === 0) return bad(res, `Pattern for domain '${domain}' not found.`, 404);

    return ok(res, rows[0]);
  } catch (e) {
    console.error(`email/patterns update error for domain ${req.params.domain}:`, e);
    return bad(res, "Server error during pattern update.", 500);
  }
});

router.delete("/patterns/:domain", adminOnly, async (req, res) => {
  // ... (existing DELETE endpoint code, no changes)
  try {
    const { domain } = req.params;
    if (!domain) return bad(res, "Domain parameter is required.", 400);
    const result = await pool.query(`DELETE FROM email_patterns WHERE domain = $1`, [domain]);
    if (result.rowCount === 0) return bad(res, `Pattern for domain '${domain}' not found.`, 404);
    return ok(res, { message: `Successfully deleted pattern for ${domain}.` });
  } catch (e) {
    console.error(`email/patterns delete error for domain ${req.params.domain}:`, e);
    return bad(res, "Server error during pattern deletion.", 500);
  }
});

router.get("/pattern", adminOnly, async (req, res) => {
  // ... (existing /pattern endpoint code, no changes)
  try {
    const { domain } = req.query;
    if (!domain) return bad(res, "domain required");
    const row = await getDomainPattern(domain);
    return ok(res, row || null);
  } catch (e) {
    console.error("email/pattern get error:", e);
    return bad(res, "server error", 500);
  }
});

router.post("/pattern", adminOnly, async (req, res) => {
  // ... (existing POST /pattern endpoint code, no changes)
  try {
    const { domain, pattern_id, example } = req.body || {};
    if (!domain || !pattern_id) return bad(res, "domain and pattern_id required");
    const r = await setDomainPattern({ domain, pattern_id, source: "manual", example });
    return ok(res, r);
  } catch (e) {
    console.error("email/pattern post error:", e);
    return bad(res, "server error", 500);
  }
});

module.exports = router;