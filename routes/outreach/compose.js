// routes/outreach/compose.js
import express from "express";
import { ok, bad } from "../../utils/respond.js";
import { pool } from "../../utils/db.js";
import { composeEmail } from "../../services/composeAgent.js";

const router = express.Router();

/**
 * POST /api/outreach/compose
 * Takes a fact pack and a lead ID, fetches the appropriate template,
 * and uses the composeAgent to generate a personalized email.
 * Body: { factPack: {...}, leadId: "...", templateVersionId: 1 }
 */
router.post("/compose", async (req, res) => {
  const { factPack, leadId, templateVersionId } = req.body;

  if (!factPack || !leadId || !templateVersionId) {
    return bad(res, "factPack, leadId, and templateVersionId are required.", 400);
  }

  try {
    // Step 1: Fetch the lead and template data in parallel
    const [leadRes, templateRes] = await Promise.all([
        pool.query('SELECT * FROM hr_leads WHERE id = $1', [leadId]),
        pool.query('SELECT * FROM template_versions WHERE id = $1', [templateVersionId])
    ]);

    if (leadRes.rowCount === 0) {
        return bad(res, `Lead with ID ${leadId} not found.`, 404);
    }
    if (templateRes.rowCount === 0) {
        return bad(res, `Template Version with ID ${templateVersionId} not found.`, 404);
    }
    
    const lead = leadRes.rows[0];
    const template = templateRes.rows[0];

    // Step 2: Call the composition agent
    const composedEmail = await composeEmail(factPack, lead, template);

    return ok(res, composedEmail);

  } catch (error) {
    console.error("[API /outreach/compose] Error:", error);
    return bad(res, "An error occurred during the email composition process.", 500);
  }
});

export default router;