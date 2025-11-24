// routes/enrich/generate.js
import { pool } from "../../utils/db.js";
import { enrichWithApollo } from "./lib/apollo.js";
import { findPeopleWithAI } from "../../utils/llm.js";
import { enrichWithEmail } from "./lib/email.js";
import { enrichWithGeo } from "./lib/geo.js";
import { roleBucket, bucketSeniority, calculatePreviewScore, calculateLeadScore } from "./lib/person.js";
import InsightEngine from "../../utils/insightEngine/index.js";

// Helper to normalize names for deduplication
function normalizeName(name) {
    return (name || "").toLowerCase().replace(/[^a-z]/g, "");
}

// FIX 3 & 7: Helper to generate common company name variations
function getCompanyNameVariations(name) {
    if (!name) return [];

    const variations = [];
    const nameLower = name.toLowerCase();

    // Known company variations
    const knownVariations = {
        'accenture': ['Accenture Middle East', 'Accenture Dubai', 'Accenture UAE', 'Accenture plc'],
        'adnoc': ['Abu Dhabi National Oil Company', 'ADNOC Group', 'ADNOC Distribution'],
        'deloitte': ['Deloitte Middle East', 'Deloitte UAE', 'Deloitte & Touche'],
        'pwc': ['PricewaterhouseCoopers', 'PwC Middle East', 'PwC UAE'],
        'kpmg': ['KPMG Lower Gulf', 'KPMG UAE', 'KPMG Middle East'],
        'ey': ['Ernst & Young', 'EY Middle East', 'EY UAE'],
    };

    // Check if company has known variations
    for (const [key, vars] of Object.entries(knownVariations)) {
        if (nameLower.includes(key)) {
            variations.push(...vars);
        }
    }

    // Add common suffixes/prefixes if not already present
    if (!nameLower.includes('uae') && !nameLower.includes('dubai')) {
        variations.push(`${name} UAE`, `${name} Dubai`);
    }
    if (!nameLower.includes('middle east')) {
        variations.push(`${name} Middle East`);
    }

    return [...new Set(variations)]; // Remove duplicates
}

// [REMOVED] The automatic "fire-and-forget" save function has been removed.
// Saving is now handled exclusively by the user's action via the /api/enrich/save endpoint.

export default async function generateHandler(req, res) {
    const started = Date.now();
    const { summary } = req.body || {};
    if (!summary || !summary.company) {
        return res.status(400).json({ ok: false, error: "Company summary is required." });
    }

    const { company, email_pattern, email_confidence } = summary;

    // Validate we have at least name or domain
    if (!company.name && !company.domain) {
        return res.status(400).json({ ok: false, error: "Company name or domain is required." });
    }

    const reqId = req._reqid || "generate";
    console.log(`[${reqId}] Starting generate & enrich for company: ${company.name || company.domain}`);

    try {
        // Helper: Add timeout to promises
        const withTimeout = (promise, timeoutMs, fallbackValue) => {
            return Promise.race([
                promise,
                new Promise((resolve) => setTimeout(() => {
                    console.log(`[${reqId}] Operation timed out after ${timeoutMs}ms, using fallback`);
                    resolve(fallbackValue);
                }, timeoutMs))
            ]);
        };

        // --- Step 1: Fetch Leads from All Sources in Parallel ---
        // If no company.id, try to find by domain
        let dbLeadsPromise;
        if (company.id) {
            dbLeadsPromise = pool.query(`SELECT * FROM hr_leads WHERE company_id = $1`, [company.id]).then(res => res.rows);
        } else if (company.domain) {
            // Fallback: Find company by domain and get its leads
            dbLeadsPromise = pool.query(
                `SELECT hl.* FROM hr_leads hl
                 JOIN targeted_companies tc ON hl.company_id = tc.id
                 WHERE tc.domain = $1`,
                [company.domain]
            ).then(res => res.rows);
        } else {
            dbLeadsPromise = Promise.resolve([]);
        }

        // FIX 3 & 7: Implement multi-strategy Apollo search with fallbacks
        console.log(`[${reqId}] 🔍 Starting multi-strategy search for: ${company.name} (domain: ${company.domain})`);

        // Fetch DB and AI in parallel while trying Apollo strategies
        const [dbResult, aiResult] = await Promise.all([
            dbLeadsPromise,
            withTimeout(
                findPeopleWithAI(company.name, company.domain),
                20000, // 20 second timeout
                []
            )
        ]);

        // Strategy 1: Try exact company name with UAE location filter
        console.log(`[${reqId}] 📍 Strategy 1: Exact name "${company.name}" + UAE location`);
        let apolloResult = await withTimeout(
            enrichWithApollo({ name: company.name, domain: company.domain }),
            25000,
            { results: [], metadata: { timedOut: true } }
        );
        console.log(`[${reqId}] Strategy 1 result: ${apolloResult.results.length} leads`);

        // Strategy 2: If no results, try without location filter
        if (apolloResult.results.length === 0 && company.name) {
            console.log(`[${reqId}] 🌍 Strategy 2: Name "${company.name}" without location filter`);
            apolloResult = await withTimeout(
                enrichWithApollo({ name: company.name, domain: company.domain, strategy: 'no_location' }),
                25000,
                { results: [], metadata: { timedOut: true } }
            );
            console.log(`[${reqId}] Strategy 2 result: ${apolloResult.results.length} leads`);
        }

        // Strategy 3: Try domain-based search if name failed
        if (apolloResult.results.length === 0 && company.domain) {
            console.log(`[${reqId}] 🔗 Strategy 3: Domain-based search "${company.domain}"`);
            apolloResult = await withTimeout(
                enrichWithApollo({ name: company.name, domain: company.domain, strategy: 'domain_only' }),
                25000,
                { results: [], metadata: { timedOut: true } }
            );
            console.log(`[${reqId}] Strategy 3 result: ${apolloResult.results.length} leads`);
        }

        // Strategy 4: Try common name variations for known companies
        if (apolloResult.results.length === 0 && company.name) {
            const nameVariations = getCompanyNameVariations(company.name);
            if (nameVariations.length > 0) {
                console.log(`[${reqId}] 🔄 Strategy 4: Trying ${nameVariations.length} name variations`);
                for (const variation of nameVariations) {
                    console.log(`[${reqId}] Trying variation: "${variation}"`);
                    apolloResult = await withTimeout(
                        enrichWithApollo({ name: variation, domain: company.domain }),
                        25000,
                        { results: [], metadata: { timedOut: true } }
                    );
                    if (apolloResult.results.length > 0) {
                        console.log(`[${reqId}] ✅ Success with variation "${variation}": ${apolloResult.results.length} leads`);
                        break;
                    }
                }
            }
        }

        const dbLeads = dbResult.map(lead => ({ ...lead, lead_source: 'database' }));
        const apolloLeads = apolloResult.results.map(lead => ({ ...lead, lead_source: 'apollo' }));
        const aiLeads = aiResult.map(lead => ({ ...lead, lead_source: 'ai' }));

        console.log(`[${reqId}] 📊 Final sources: DB (${dbLeads.length}), Apollo (${apolloLeads.length}), AI (${aiLeads.length})`);

        // FIX 5: Diagnostic - Track linkedin_url after source mapping
        const apolloLinkedInCount = apolloLeads.filter(l => l.linkedin_url).length;
        console.log(`[${reqId}] 🔗 [STAGE 1] After source mapping: ${apolloLinkedInCount}/${apolloLeads.length} Apollo leads have linkedin_url`);

        // --- Step 2: Merge & Deduplicate Results (DB is prioritized) ---
        const mergedLeads = new Map();
        const addToMap = (lead) => { if (lead.name) mergedLeads.set(normalizeName(lead.name), lead) };
        aiLeads.forEach(addToMap);
        apolloLeads.forEach(addToMap);
        dbLeads.forEach(addToMap);
        const candidates = Array.from(mergedLeads.values());

        // FIX 5: Diagnostic - Track linkedin_url after deduplication
        const candidatesWithLinkedIn = candidates.filter(c => c.linkedin_url).length;
        console.log(`[${reqId}] 🔗 [STAGE 2] After deduplication: ${candidatesWithLinkedIn}/${candidates.length} candidates have linkedin_url`);

        // --- Step 3: Run Email Intelligence on ALL Leads (PRIMARY System) ---
        // Email intelligence is NOT a fallback - it's the primary email source.
        // Apollo provides leads only (names, titles), email intelligence provides emails.
        console.log(`[${reqId}] 🔵 Running email intelligence on ALL ${candidates.length} leads (PRIMARY system)`);
        const enrichedLeads = await enrichWithEmail(candidates, company.domain, { ...company, email_pattern, email_confidence });

        const emailStats = {
            total: enrichedLeads.length,
            with_emails: enrichedLeads.filter(l => l.email).length,
            validated: enrichedLeads.filter(l => l.email_status === 'validated').length,
            patterned: enrichedLeads.filter(l => l.email_status === 'patterned').length,
            accept_all: enrichedLeads.filter(l => l.email_status === 'accept_all').length,
            failed: enrichedLeads.filter(l => !l.email).length
        };
        console.log(`[${reqId}] ✅ Email intelligence complete:`, JSON.stringify(emailStats));

        // FIX 5: Diagnostic - Track linkedin_url after email enrichment
        const enrichedWithLinkedIn = enrichedLeads.filter(l => l.linkedin_url).length;
        console.log(`[${reqId}] 🔗 [STAGE 3] After email enrichment: ${enrichedWithLinkedIn}/${enrichedLeads.length} leads have linkedin_url`);

        const allEnrichedLeads = enrichedLeads;

        // --- Step 4: Final Processing (Geo, Scoring, Sorting) ---
        // Filter OUT excluded roles (Aftersales, Customer Service, Retail, Sales, etc.)
        const relevantLeads = allEnrichedLeads.filter(c => {
            const bucket = roleBucket(c.designation);
            // Only keep HR, Finance, Admin roles - exclude everything else
            return bucket === 'hr' || bucket === 'finance' || bucket === 'admin';
        });
        console.log(`[${reqId}] Filtered ${allEnrichedLeads.length} leads to ${relevantLeads.length} relevant leads (excluded non-HR roles)`);
        const geoRows = await enrichWithGeo(relevantLeads);

        // FIX 5: Diagnostic - Track linkedin_url after geo enrichment
        const geoWithLinkedIn = geoRows.filter(l => l.linkedin_url).length;
        console.log(`[${reqId}] 🔗 [STAGE 4] After geo enrichment: ${geoWithLinkedIn}/${geoRows.length} leads have linkedin_url`);

        // Score each lead using the new 0-100 scoring system
        const companySize = company.employeeCount || company.size || 1000;
        const scoredLeads = geoRows.map(lead => {
            const processedLead = {
                ...lead,
                role_bucket: roleBucket(lead.designation),
                seniority: bucketSeniority(lead.designation)
            };

            // Use new 0-100 scoring system
            const scoreResult = calculateLeadScore(processedLead, company);
            processedLead.leadScore = scoreResult.score;
            processedLead.scoreReasons = scoreResult.reasons;

            // Keep old confidence for backward compatibility (0-1 range)
            processedLead.confidence = scoreResult.score / 100;

            return processedLead;
        });

        // FIX 5: Diagnostic - Track linkedin_url after scoring
        const scoredWithLinkedIn = scoredLeads.filter(l => l.linkedin_url).length;
        console.log(`[${reqId}] 🔗 [STAGE 5] After scoring: ${scoredWithLinkedIn}/${scoredLeads.length} leads have linkedin_url`);

        // CRITICAL: Filter out leads below 70%
        const qualityLeads = scoredLeads.filter(lead => lead.leadScore >= 70);

        // FIX 3 & 7: Log detailed filtering information for debugging
        const filteredLeads = scoredLeads.filter(lead => lead.leadScore < 70);
        if (filteredLeads.length > 0) {
            console.log(`[${reqId}] 🚫 Filtered out ${filteredLeads.length} leads below 70% threshold:`);
            filteredLeads.slice(0, 5).forEach(lead => {
                console.log(`  - ${lead.name} (${lead.title}): ${lead.leadScore}% - Reasons: ${JSON.stringify(lead.scoreReasons)}`);
            });
            if (filteredLeads.length > 5) {
                console.log(`  ... and ${filteredLeads.length - 5} more filtered leads`);
            }
        }

        // Sort by score (highest first)
        const finalResults = qualityLeads.sort((a, b) => b.leadScore - a.leadScore);

        // Log filtering statistics
        const stats = {
            total: scoredLeads.length,
            shown: qualityLeads.length,
            filtered: scoredLeads.length - qualityLeads.length,
            topLeads: qualityLeads.filter(l => l.leadScore >= 85).length,
            goodLeads: qualityLeads.filter(l => l.leadScore >= 70 && l.leadScore < 85).length
        };
        console.log(`[${reqId}] 🎯 Lead Scoring: Total ${stats.total}, Showing ${stats.shown} (${stats.topLeads} top, ${stats.goodLeads} good), Filtered ${stats.filtered} low-quality leads`);

        // [REMOVED] The automatic call to saveEnrichedLeadsToDB is now gone.

        // FIX 5: Diagnostic logging for LinkedIn URLs in final results
        const finalLinkedinStats = {
            total: finalResults.length,
            with_linkedin: finalResults.filter(r => r.linkedin_url).length,
            without_linkedin: finalResults.filter(r => !r.linkedin_url).length
        };
        console.log(`[${reqId}] 🔗 Final LinkedIn URL stats:`, JSON.stringify(finalLinkedinStats));
        if (finalLinkedinStats.with_linkedin > 0) {
            console.log(`[${reqId}] ✅ Sample final LinkedIn URLs:`, finalResults.filter(r => r.linkedin_url).slice(0, 3).map(r => `${r.name}: ${r.linkedin_url}`));
        } else {
            console.log(`[${reqId}] ⚠️  WARNING: NO LinkedIn URLs in final results!`);
        }

        // FIX 5: Diagnostic - Track linkedin_url in final results
        const finalWithLinkedIn = finalResults.filter(l => l.linkedin_url).length;
        console.log(`[${reqId}] 🔗 [STAGE 6 - FINAL] Final results: ${finalWithLinkedIn}/${finalResults.length} leads have linkedin_url`);
        if (finalWithLinkedIn > 0) {
            console.log(`[${reqId}] 🔗 Sample final linkedin_urls:`, finalResults.filter(l => l.linkedin_url).slice(0, 3).map(l => `${l.name}: ${l.linkedin_url}`));
        }

        // Generate insights
        console.log(`[${reqId}] [DIAGNOSTIC] Company for insights:`, {
          name: company.name,
          sector: company.sector,
          industry: company.industry,
          has_sector: !!company.sector,
          has_industry: !!company.industry
        });
        const insightEngine = new InsightEngine(finalResults, company);
        const insights = await insightEngine.generateInsights();
        console.log(`[${reqId}] 💡 Generated ${insights.length} insights`);

        // Check if Apollo timed out
        const apolloTimedOut = apolloResult.metadata?.timedOut;
        const warningMessage = apolloTimedOut
            ? `Apollo.io search timed out for ${company.name}. This is a very large company. Results may be incomplete.`
            : null;

        return res.status(200).json({
            ok: true,
            data: {
                results: finalResults,
                insights,
                warning: warningMessage,
                sources: {
                    database: dbLeads.length,
                    apollo: apolloLeads.length,
                    ai: aiLeads.length,
                    apolloTimedOut
                }
            },
            took_ms: Date.now() - started,
        });

    } catch (e) {
        console.error(`[${reqId}] /generate error`, e?.stack || e);
        if (!res.headersSent) {
            return res.status(500).json({ ok: false, error: "An unexpected server error occurred during lead generation." });
        }
    }
}