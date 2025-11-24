// routes/outreach/send.js
import express from "express";
import { ok, bad } from "../../utils/respond.js";
import { pool } from "../../utils/db.js";
import { runComplianceChecks } from "../../services/complianceAgent.js";
import { optimizeForDelivery } from "../../services/deliverabilityAgent.js";

const router = express.Router();

/**
 * POST /api/outreach/send
 * Performs final checks, logs the outreach, and simulates sending an email.
 * Body: { composedEmail: {...}, leadId: "...", templateVersionId: 1 }
 */
router.post("/send", async (req, res) => {
  const { composedEmail, leadId, templateVersionId } = req.body;

  if (!composedEmail || !leadId || !templateVersionId) {
    return bad(res, "composedEmail, leadId, and templateVersionId are required.", 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Step 1: Fetch lead data
    const leadRes = await client.query('SELECT * FROM hr_leads WHERE id = $1', [leadId]);
    if (leadRes.rowCount === 0) {
      return bad(res, `Lead with ID ${leadId} not found.`, 404);
    }
    const lead = leadRes.rows[0];

    // Step 2: Run compliance and deliverability agents
    const complianceResult = await runComplianceChecks(composedEmail, lead);
    if (!complianceResult.isCompliant) {
      return bad(res, `Compliance check failed: ${complianceResult.reason}`, 400);
    }

    const finalEmail = await optimizeForDelivery(composedEmail);

    // Step 3: Log the generation and send events in the database
    const generationQuery = `
      INSERT INTO outreach_generations (lead_id, template_version_id, opening_context, final_subject, final_body)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `;
    const generationRes = await client.query(generationQuery, [
      leadId,
      templateVersionId,
      finalEmail.openingContext,
      finalEmail.finalSubject,
      finalEmail.finalBody
    ]);
    const generationId = generationRes.rows[0].id;

    const eventQuery = `
      INSERT INTO deliverability_events (generation_id, event_type, event_timestamp)
      VALUES ($1, 'sent', NOW());
    `;
    await client.query(eventQuery, [generationId]);

    // Step 4: Simulate handoff to an Email Service Provider (ESP)
    console.log('--- EMAIL SENT (SIMULATED) ---');
    console.log(`To: ${lead.email}`);
    console.log(`Subject: ${finalEmail.finalSubject}`);
    console.log(`Headers: ${JSON.stringify(finalEmail.headers)}`);
    console.log('--- END SIMULATION ---');
    
    // Step 5: Mark the lead as 'Contacted'
    await client.query(`UPDATE hr_leads SET lead_status = 'Contacted' WHERE id = $1`, [leadId]);

    await client.query('COMMIT');
    return ok(res, { message: "Email sent and logged successfully.", generationId });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("[API /outreach/send] Error:", error);
    return bad(res, "An error occurred while sending the email.", 500);
  } finally {
    client.release();
  }
});

export default router;