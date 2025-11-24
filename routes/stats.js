// routes/stats.js
const express = require("express");
const { pool } = require("../utils/db");
const { ok, bad } = require("../utils/respond");

const router = express.Router();

/**
 * GET /api/stats
 * Returns summary counts + recent activity for the dashboard.
 */
router.get("/", async (_req, res) => {
  try {
    const [companyRes, leadRes, outreachRes, recentRes, topCompaniesRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM targeted_companies`),
      pool.query(`SELECT COUNT(*)::int AS n FROM hr_leads`),
      // [FIX] Corrected column name from 'status' to 'lead_status'
      pool.query(`SELECT COUNT(*)::int AS n FROM hr_leads WHERE lead_status = 'Contacted'`),
      pool.query(
        `SELECT
           hl.id,
           tc.name AS company,
           hl.designation AS role,
           hl.lead_status AS status, -- [FIX] Corrected column name from 'status' to 'lead_status'
           to_char(hl.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
         FROM hr_leads hl
         JOIN targeted_companies tc ON hl.company_id = tc.id
         ORDER BY hl.created_at DESC NULLS LAST
         LIMIT 3`
      ),
      pool.query(
        `SELECT id, name, locations, type, qscore, created_at
         FROM targeted_companies
         ORDER BY qscore DESC NULLS LAST, created_at DESC
         LIMIT 5`
      ),
    ]);

    return ok(res, {
      companiesTracked: companyRes.rows[0]?.n ?? 0,
      leadsIdentified:  leadRes.rows[0]?.n ?? 0,
      outreachSent:     outreachRes.rows[0]?.n ?? 0,
      recentActivity:   recentRes.rows,
      top_companies:    topCompaniesRes.rows,
    });
  } catch (e) {
    console.error("stats error:", e);
    return bad(res, "failed to load stats", 500);
  }
});

module.exports = router;