// routes/outreach.js
const express = require("express");
const { pool } = require("../utils/db");
const { ok, bad } = require("../utils/respond");
const { adminOnly } = require("../utils/adminOnly");
const { generateOutreachEmail } = require("../utils/llm");

const router = express.Router();

/**
 * POST /api/outreach/generate
 * Body: { leadIds: [1, 2, 3], template_id?: 4 }
 * Generates personalized outreach emails for all leads in the list.
 * If a template_id is provided, it populates the template for each lead.
 * Otherwise, it uses AI to generate content for each lead in parallel.
 */
router.post("/generate", adminOnly, async (req, res) => {
  const { leadIds, template_id } = req.body;

  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    return bad(res, "An array of leadIds is required.", 400);
  }

  try {
    // Step 1: Fetch the template once, if a template_id is provided.
    let template = null;
    if (template_id) {
      const templateRes = await pool.query(
        "SELECT subject, body FROM email_templates WHERE id = $1",
        [template_id]
      );
      if (templateRes.rowCount === 0) {
        return bad(res, `Template with ID ${template_id} not found.`, 404);
      }
      template = templateRes.rows[0];
    }

    // Step 2: Fetch data for all requested leads in a single query.
    const leadsRes = await pool.query(
      `SELECT id, name, designation, c.name as company_name, c.industry
       FROM hr_leads hl
       JOIN targeted_companies c ON hl.company_id = c.id
       WHERE hl.id = ANY($1::int[])`,
      [leadIds]
    );

    const leadsData = leadsRes.rows;
    
    // Step 3: Generate content for each lead.
    let results;

    if (template) {
      // --- Template-based Generation Path (Synchronous) ---
      results = leadsData.map(leadData => {
        const populatedSubject = template.subject
          .replace(/{{lead_name}}/g, leadData.name || '')
          .replace(/{{company_name}}/g, leadData.company_name || '')
          .replace(/{{designation}}/g, leadData.designation || '');
        
        const populatedBody = template.body
          .replace(/{{lead_name}}/g, leadData.name || '')
          .replace(/{{company_name}}/g, leadData.company_name || '')
          .replace(/{{designation}}/g, leadData.designation || '');

        return { leadId: leadData.id, subject: populatedSubject, body: populatedBody };
      });

    } else {
      // --- AI-based Generation Path (Asynchronous & Parallel) ---
      const promises = leadsData.map(async (leadData) => {
        const outreach = await generateOutreachEmail(leadData);
        if (!outreach || outreach.subject.toLowerCase().includes("error")) {
          console.warn(`[outreach] AI generation failed for lead ID ${leadData.id}`);
          return null; // Return null on failure for this specific lead
        }
        return { leadId: leadData.id, ...outreach };
      });
      
      // Wait for all generations to complete and filter out any that failed
      results = (await Promise.all(promises)).filter(Boolean);
    }
    
    return ok(res, results);

  } catch (e) {
    console.error("[outreach] Bulk generation error:", e);
    return bad(res, "Server error during bulk generation.", 500);
  }
});

module.exports = router;