// routes/outreach/manual.js
import express from "express";
import crypto from 'crypto';
import { pool } from "../../utils/db.js";
import { ok, bad } from "../../utils/respond.js";
import { adminOnly } from "../../utils/adminOnly.js";
import { conductResearch } from "../../services/researchAgent.js";
import { verifyFacts } from "../../services/factChecker.js";
import { composeEmail } from "../../services/composeAgent.js";

const router = express.Router();


// --- NEW ENDPOINT ---
/**
 * GET /api/outreach/queued
 * Fetches all outreach records that have been generated but not yet manually sent.
 * This will populate the new version of the "Outreach Queue" page.
 */
router.get("/queued", adminOnly, async (req, res) => {
    try {
        const query = `
            SELECT
                og.id AS outreach_id,
                og.subject,
                og.body_html,
                og.short_id,
                og.sent_at,
                og.reply_at,
                og.bounced,
                og.converted,
                og.clicked_at,
                hl.id AS lead_id,
                hl.lead_name,
                hl.designation,
                hl.email,
                tc.name AS company_name
            FROM
                outreach_generations AS og
            JOIN
                hr_leads AS hl ON og.lead_id = hl.id
            JOIN
                targeted_companies AS tc ON hl.company_id = tc.id
            WHERE
                og.send_status = 'queued'
            ORDER BY
                og.created_at ASC;
        `;
        const { rows } = await pool.query(query);
        return ok(res, rows);
    } catch (e) {
        console.error("GET /api/outreach/queued error:", e);
        return bad(res, "Failed to fetch queued outreach pack.", 500);
    }
});


/**
 * POST /api/outreach/generate-pack
 * Generates a "pack" of emails for manual sending.
 */
router.post("/generate-pack", adminOnly, async (req, res) => {
    const { lead_ids, template_version_id, name } = req.body;
    const userId = req.user?.id || '00000000-0000-0000-0000-000000000000';

    if (!Array.isArray(lead_ids) || lead_ids.length === 0 || !template_version_id) {
        return bad(res, "lead_ids (array) and template_version_id are required.", 400);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const generatedEmails = [];

        const templateRes = await client.query('SELECT * FROM template_versions WHERE id = $1', [template_version_id]);
        if (templateRes.rowCount === 0) throw new Error("Template version not found.");
        const template = templateRes.rows[0];

        for (const leadId of lead_ids) {
            const leadRes = await client.query('SELECT * FROM hr_leads WHERE id = $1', [leadId]);
            if (leadRes.rowCount === 0) continue;
            const lead = leadRes.rows[0];

            const factPack = await conductResearch(lead.company_id);
            const verifiedFacts = await verifyFacts(factPack);
            const composedEmail = await composeEmail(verifiedFacts, lead, template, userId);

            const short_id = crypto.randomBytes(4).toString('hex');
            const taggedSubject = `${composedEmail.finalSubject} [UPR:${short_id}]`;

            const insertRes = await client.query(
                `INSERT INTO outreach_generations (lead_id, template_version_id, subject, body_html, body_text, research_facts, short_id, send_status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued') RETURNING id`,
                [lead.id, template.id, taggedSubject, composedEmail.finalBody, composedEmail.finalBody, verifiedFacts, short_id]
            );
            
            generatedEmails.push({
                outreach_id: insertRes.rows[0].id,
                lead_id: lead.id,
                to: lead.email,
                subject: taggedSubject,
                body_html: composedEmail.finalBody,
                short_id: short_id,
            });
        }

        await client.query('COMMIT');
        return ok(res, generatedEmails);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("POST /api/outreach/generate-pack error:", e);
        return bad(res, "Failed to generate pack.", 500);
    } finally {
        client.release();
    }
});

/**
 * POST /api/outreach/:outreachId/manual-update
 * Manually updates the performance status of a sent email.
 */
router.post("/:outreachId/manual-update", adminOnly, async (req, res) => {
    const { outreachId } = req.params;

    try {
        const fields = [];
        const params = [];
        let paramIndex = 1;

        if (req.body.sent) fields.push(`sent_at = COALESCE(sent_at, NOW())`);
        if (req.body.replied) fields.push(`reply_at = COALESCE(reply_at, NOW())`);
        if ('bounced' in req.body) {
            fields.push(`bounced = $${paramIndex++}`);
            params.push(req.body.bounced);
        }
        if ('converted' in req.body) {
            fields.push(`converted = $${paramIndex++}`);
            params.push(req.body.converted);
        }

        if (fields.length === 0) {
            return bad(res, "No update fields provided.", 400);
        }

        params.push(outreachId);
        const query = `UPDATE outreach_generations SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        
        const { rowCount } = await pool.query(query, params);

        if (rowCount === 0) {
            return bad(res, "Outreach record not found", 404);
        }

        return ok(res, { message: "Status updated." });
    } catch (e) {
        console.error(`POST /api/outreach/${outreachId}/manual-update error:`, e);
        return bad(res, "Server error.", 500);
    }
});

/**
 * POST /api/outreach/batch-add
 * Adds multiple leads to the outreach queue (outreach_generations table) in a single operation.
 * Idempotent: Uses ON CONFLICT DO NOTHING to prevent duplicates.
 * Returns: { added: number, skipped: number, avg_score: number }
 */
router.post("/batch-add", adminOnly, async (req, res) => {
    const { lead_ids, company_id } = req.body;

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
        return bad(res, "lead_ids (array) is required and must not be empty.", 400);
    }

    if (!company_id) {
        return bad(res, "company_id is required.", 400);
    }

    try {
        // Fetch leads with their scores to calculate average and check for existing entries
        const leadsQuery = `
            SELECT id, confidence, email
            FROM hr_leads
            WHERE id = ANY($1::uuid[])
              AND company_id = $2
              AND is_irrelevant = false
        `;
        const leadsResult = await pool.query(leadsQuery, [lead_ids, company_id]);
        const validLeads = leadsResult.rows;

        if (validLeads.length === 0) {
            return ok(res, {
                added: 0,
                skipped: lead_ids.length,
                avg_score: 0,
                message: "No valid leads to add (all may be irrelevant or not found)"
            });
        }

        // Calculate average score
        const avgScore = Math.round(
            validLeads.reduce((sum, l) => sum + (l.confidence || 0), 0) / validLeads.length * 100
        );

        // Check which leads are already in outreach_generations
        const existingCheckQuery = `
            SELECT lead_id
            FROM outreach_generations
            WHERE lead_id = ANY($1::uuid[])
              AND send_status = 'queued'
        `;
        const existingResult = await pool.query(existingCheckQuery, [lead_ids]);
        const existingLeadIds = new Set(existingResult.rows.map(row => row.lead_id));

        // Filter out leads that already exist
        const newLeads = validLeads.filter(l => !existingLeadIds.has(l.id));

        // Insert new leads into outreach_generations with minimal data
        // (template and full email will be generated when user composes)
        let addedCount = 0;
        if (newLeads.length > 0) {
            // Get a default template_version_id (use the first active template)
            const defaultTemplateQuery = `
                SELECT tv.id
                FROM template_versions tv
                JOIN templates t ON tv.template_id = t.id
                WHERE t.status = 'active' OR tv.status = 'active'
                ORDER BY tv.created_at DESC
                LIMIT 1
            `;
            const defaultTemplateResult = await pool.query(defaultTemplateQuery);
            const defaultTemplateId = defaultTemplateResult.rows[0]?.id || 1; // Fallback to 1 if none found

            const insertValues = newLeads.map((_lead, idx) => {
                const offset = idx * 6 + 1;
                return `($${offset}, $${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5})`;
            }).join(',');

            const params = [];
            newLeads.forEach(lead => {
                params.push(
                    lead.id,                          // lead_id
                    defaultTemplateId,                // template_version_id
                    'Pending',                        // subject
                    'Email will be generated',        // body_html
                    'Email will be generated',        // body_text
                    'queued'                          // send_status
                );
            });

            const insertQuery = `
                INSERT INTO outreach_generations (lead_id, template_version_id, subject, body_html, body_text, send_status)
                VALUES ${insertValues}
                RETURNING id
            `;

            const insertResult = await pool.query(insertQuery, params);
            addedCount = insertResult.rowCount || 0;
        }

        const skippedCount = lead_ids.length - addedCount;

        // Log telemetry for analytics (fire-and-forget, non-blocking)
        pool.query(`
            INSERT INTO outreach_telemetry (event_type, company_id, lead_count, avg_score, metadata)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            'batch_add',
            company_id,
            addedCount,
            avgScore,
            JSON.stringify({
                total_requested: lead_ids.length,
                added: addedCount,
                skipped: skippedCount,
                favorites_count: 0 // Could enhance this later
            })
        ]).catch(err => {
            // Telemetry failure should not block the main operation
            console.warn('[Telemetry] Failed to log batch_add event:', err);
        });

        return ok(res, {
            added: addedCount,
            skipped: skippedCount,
            avg_score: avgScore,
            message: `Successfully added ${addedCount} lead${addedCount !== 1 ? 's' : ''} to outreach queue`
        });

    } catch (err) {
        console.error("POST /api/outreach/batch-add error:", err);
        return bad(res, "Failed to add leads to outreach queue.", 500);
    }
});

export default router;