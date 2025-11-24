// routes/enrich/ai-lead.js
import express from "express";
import { pool } from "../../utils/db.js";
import { ok, bad } from "../../utils/respond.js";
import { calculateLeadScore } from "./lib/person.js";
import { runEnrichmentChain } from "../../services/enrichmentProviders.js";
import { findSimilarCompany, normalizeTitle } from "../../utils/vectorSearch.js";

const router = express.Router();

/**
 * Logs an enrichment event to the audit table. This is a fire-and-forget operation.
 */
async function logAuditEvent(status, input, output, error, duration) {
    try {
        await pool.query(
            `INSERT INTO enrich_audit (agent_name, status, input_data, output_data, error_message, duration_ms)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['Enrichment Orchestrator', status, input, output, error, duration]
        );
    } catch (dbErr) {
        console.error("Failed to write to enrich_audit table:", dbErr);
    }
}

/**
 * POST /api/enrich/person
 * The main orchestrator for the AI-assisted lead enrichment.
 */
router.post("/person", async (req, res) => {
    const startTime = Date.now();
    const { name, email } = req.body;

    if (!name || !email) {
        return bad(res, "Name and email are required for enrichment.", 400);
    }

    try {
        // Step 1: Orchestrate Enrichment Chain (e.g., call Apollo)
        const { data: enrichedLead, sources } = await runEnrichmentChain(email, name);

        // --- Phase 2 RAG Integration ---

        // Step 2: Company Disambiguation using RAG
        let companyData = {};
        if (enrichedLead.company_name) {
            const matchedCompany = await findSimilarCompany(enrichedLead.company_name);
            if (matchedCompany) {
                console.log(`[RAG] Disambiguated company: "${enrichedLead.company_name}" -> "${matchedCompany.name}" (Distance: ${matchedCompany.distance.toFixed(3)})`);
                companyData = { 
                    name: matchedCompany.name, 
                    domain: matchedCompany.domain,
                    size: "501-1,000 employees", 
                    locations: ["Dubai", "UAE"] 
                };
                sources.push("RAG (Company)");
            }
        }
        
        // Step 3: Title Normalization using RAG
        let titleData = {};
        if (enrichedLead.designation) {
            const matchedTitle = await normalizeTitle(enrichedLead.designation);
            if (matchedTitle) {
                console.log(`[RAG] Normalized title: "${enrichedLead.designation}" -> "${matchedTitle.normalized_title}" (Distance: ${matchedTitle.distance.toFixed(3)})`);
                titleData = {
                    designation: matchedTitle.normalized_title,
                    title_normalized: matchedTitle.normalized_title,
                    role_bucket: matchedTitle.function,
                    seniority: matchedTitle.seniority,
                };
                sources.push("RAG (Title)");
            }
        }
        
        const finalLeadData = {
            ...enrichedLead,
            ...titleData,
            company_name: companyData.name || enrichedLead.company_name,
        };

        // Step 4: Score the Lead using the now-more-accurate data
        const { score, reasons } = calculateLeadScore(finalLeadData, companyData);

        const finalResponse = {
            ...finalLeadData,
            confidence: score / 100,
            sources: [...new Set(sources)],
            score_reasons: reasons,
        };

        // Step 5: Log the successful audit event (fire-and-forget)
        logAuditEvent('success', { name, email }, finalResponse, null, Date.now() - startTime);

        return ok(res, finalResponse);

    } catch (err) {
        console.error("[/api/enrich/person] Error:", err.message);
        
        // Log the failure event (fire-and-forget)
        logAuditEvent('failure', { name, email }, null, err.message, Date.now() - startTime);

        return bad(res, err.message || "An unexpected error occurred during enrichment.", 500);
    }
});

export default router;