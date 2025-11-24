// routes/enrich/contacts.js
import { pool } from "../../utils/db.js";
import { enrichWithEmail } from "./lib/email.js";
import { finalizeScore } from "./lib/person.js";
import { calculateSIVALeadScore } from "./lib/sivaLeadScoring.js"; // SIVA Phase 12

/**
 * [DEBUGGING VERSION]
 * Saves successfully enriched leads to the hr_leads table in the background.
 * @param {Array} leads - The list of leads after enrichment.
 * @param {object} company - The company object, containing the company ID.
 */
async function saveEnrichedLeadsToDB(leads, company) {
    console.log('[db-save-debug] Initiating save function...');

    if (!pool || !company || !company.id) {
        console.error(`[db-save-debug] EXITING: Pre-condition failed. Pool exists: ${!!pool}, Company object exists: ${!!company}, Company ID exists: ${company ? company.id : 'N/A'}`);
        return;
    }

    const leadsToSave = leads.filter(lead => lead.email && ['valid', 'accept_all', 'patterned'].includes(lead.email_status));

    if (leadsToSave.length === 0) {
        console.log('[db-save-debug] EXITING: No leads met the criteria for saving (valid, accept_all, or patterned).');
        return;
    }

    console.log(`[db-save-debug] Found ${leadsToSave.length} leads to save to the database for company ID: ${company.id}.`);

    for (const lead of leadsToSave) {
        try {
            console.log(`[db-save-debug] --- Processing lead: ${lead.name} ---`);
            const sql = `
                INSERT INTO hr_leads (
                    company_id, name, designation, email, email_status, 
                    linkedin_url, location, source, confidence, role_bucket, seniority
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (linkedin_url) DO UPDATE SET
                    email = EXCLUDED.email,
                    email_status = EXCLUDED.email_status,
                    confidence = EXCLUDED.confidence,
                    updated_at = NOW();
            `;

            const params = [
                company.id,
                lead.name || null,
                lead.designation || null,
                lead.email || null,
                lead.email_status || 'unknown',
                lead.linkedin_url || null,
                lead.location || lead.emirate || null,
                'enrichment', // source
                lead.confidence || null,
                lead.role_bucket || null,
                lead.seniority || null
            ];

            console.log('[db-save-debug] SQL PARAMS:', params);
            await pool.query(sql, params);
            console.log(`[db-save-debug] SUCCESS: Saved lead ${lead.name} successfully.`);

        } catch (dbErr) {
            console.error(`[db-save-debug] FAILED to save lead ${lead.name}. Full database error:`, dbErr);
        }
    }
}


export default async function contactsHandler(req, res) {
    const started = Date.now();
    const { domain, contacts, company } = req.body || {}; // Ensure company is destructured

    if (!domain || !Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ ok: false, error: "domain and contacts array are required" });
    }

    const reqId = req._reqid || "contacts";
    console.log(`[${reqId}] Starting email enrichment for ${contacts.length} contacts at domain ${domain}`);

    try {
        let emailRows = await enrichWithEmail(contacts, domain, company);

        // SIVA Phase 12: Use centralized SIVA scoring instead of old finalizeScore
        emailRows = await Promise.all(emailRows.map(async (lead) => {
            try {
                const sivaResult = await calculateSIVALeadScore(lead, company);
                return {
                    ...lead,
                    confidence: sivaResult.confidence, // 0-1 score for database
                    qScore: sivaResult.qScore, // 0-100 SIVA Q-Score
                    tier: sivaResult.tier, // HOT/WARM/COLD/DISQUALIFIED
                    siva_reasoning: sivaResult.reasoning, // Natural language explanation
                    siva_source: sivaResult.source, // 'siva_phase12' or 'fallback'
                    siva_metadata: sivaResult.metadata // Additional SIVA scores
                };
            } catch (sivaError) {
                console.error(`[SIVA Phase 12] Scoring failed for ${lead.name}:`, sivaError.message);
                // Fallback to old scoring if SIVA fails
                return {
                    ...lead,
                    confidence: finalizeScore(lead.confidence, lead.email_status),
                    tier: 'UNKNOWN',
                    siva_source: 'fallback_error'
                };
            }
        }));

        // Trigger the database save operation in the background
        saveEnrichedLeadsToDB(emailRows, company);

        return res.status(200).json({
            ok: true,
            data: {
                results: emailRows,
            },
            took_ms: Date.now() - started,
        });
    } catch (e) {
        console.error(`[${reqId}] enrich/contacts error`, e?.stack || e);
        if (!res.headersSent) {
            return res.status(500).json({ ok: false, error: "An unexpected server error occurred during contact enrichment." });
        }
    }
}