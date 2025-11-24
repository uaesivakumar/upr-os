// routes/templateDraft.js
import express from "express";
import { ok, bad } from "../utils/respond.js";
import { adminOnly } from "../utils/adminOnly.js";
import { getOpenAICompletion } from "../utils/llm.js";
import { getActivePersonaPrompt } from "../utils/aiPersona.js";
import { getStyleContext } from "../services/learningAgent.js";
import { pool } from "../utils/db.js";
import { getCampaignTypeById, matchBestCampaign } from "../services/campaignIntelligence.js";
import { buildCampaignPrompt, buildBlockRegenerationPrompt } from "../services/promptBuilder.js";

const router = express.Router();
const DEFAULT_ADMIN_USER_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Extracts URLs from text and attempts to enrich with company context
 */
async function extractAndEnrichContext(brief) {
    // Extract URLs from the brief
    const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-z0-9-]+\.(com|io|net|org|ai|co|ae)(?:\/[^\s]*)?)/gi;
    const matches = brief.match(urlRegex);

    if (!matches || matches.length === 0) {
        return null;
    }

    const context = { urls: [], companies: [] };

    for (let url of matches) {
        // Normalize URL
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }

        context.urls.push(url);

        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname.replace(/^www\./, '');

            // Check if it's a LinkedIn URL
            if (domain.includes('linkedin.com')) {
                const pathParts = urlObj.pathname.split('/').filter(Boolean);
                if (pathParts[0] === 'company' && pathParts[1]) {
                    context.companies.push({
                        name: pathParts[1].replace(/-/g, ' '),
                        source: 'linkedin',
                        url: url
                    });
                }
            } else {
                // Try to find company in database by domain
                const { rows } = await pool.query(
                    "SELECT id, name, domain, industry, size, location FROM companies WHERE domain = $1 LIMIT 1",
                    [domain]
                );

                if (rows.length > 0) {
                    context.companies.push({
                        name: rows[0].name,
                        domain: rows[0].domain,
                        industry: rows[0].industry,
                        size: rows[0].size,
                        location: rows[0].location,
                        source: 'database',
                        url: url
                    });
                } else {
                    // Extract company name from domain as fallback
                    const companyName = domain.split('.')[0].replace(/-/g, ' ');
                    context.companies.push({
                        name: companyName,
                        domain: domain,
                        source: 'inferred',
                        url: url
                    });
                }
            }
        } catch (err) {
            console.error('Error parsing URL:', url, err);
        }
    }

    return context.companies.length > 0 ? context : null;
}

/**
 * POST /api/templates/draft
 * Generates a full template draft (all blocks) from a user's brief.
 * NEW: Supports campaign type selection and intelligent matching
 * Body: { brief, campaignTypeId?, sourceMaterial? }
 */
router.post("/draft", adminOnly, async (req, res) => {
    const { brief, campaignTypeId, sourceMaterial } = req.body;
    const userId = req.user?.id || req.user?.sub || DEFAULT_ADMIN_USER_ID;

    if (!brief) {
        return bad(res, "A campaign brief is required.", 400);
    }

    try {
        // Fetch base context in parallel
        const [personaPrompt, styleContext, enrichedContext] = await Promise.all([
            getActivePersonaPrompt(),
            getStyleContext(userId),
            extractAndEnrichContext(brief + (sourceMaterial || ''))
        ]);

        let campaignType = null;
        let matchedCampaigns = null;

        // If campaign type ID provided, fetch it
        if (campaignTypeId) {
            campaignType = await getCampaignTypeById(campaignTypeId);
            if (!campaignType) {
                return bad(res, "Campaign type not found", 404);
            }
            console.log(`Using selected campaign: ${campaignType.name}`);
        } else {
            // Intelligent campaign matching based on brief
            const leadContext = {
                brief,
                industry: enrichedContext?.companies?.[0]?.industry,
                companySize: enrichedContext?.companies?.[0]?.size
            };

            matchedCampaigns = await matchBestCampaign(leadContext);

            if (matchedCampaigns && matchedCampaigns.length > 0) {
                campaignType = matchedCampaigns[0]; // Use best match
                console.log(`Auto-matched campaign: ${campaignType.name} (score: ${campaignType.matchScore})`);
            }
        }

        let systemPrompt, userPrompt, temperature;

        if (campaignType) {
            // Use campaign-specific prompt builder
            const promptContext = {
                brief,
                enrichedContext,
                styleContext,
                personaPrompt
            };

            const campaignPrompt = buildCampaignPrompt(campaignType, promptContext);
            systemPrompt = campaignPrompt.systemPrompt;
            userPrompt = campaignPrompt.userPrompt;
            temperature = campaignPrompt.temperature;

        } else {
            // Fallback to generic prompt (backward compatibility)
            console.log('No campaign type selected - using generic prompt');

            let styleGuidance = "";
            if (styleContext?.tone_summary) {
                styleGuidance = `You MUST adapt to the user's preferred writing style, which is described as: "${styleContext.tone_summary}".`;
            }

            let contextGuidance = "";
            if (enrichedContext && enrichedContext.companies.length > 0) {
                const companyInfo = enrichedContext.companies.map(c => {
                    let info = `Company: ${c.name}`;
                    if (c.industry) info += `, Industry: ${c.industry}`;
                    if (c.size) info += `, Size: ${c.size}`;
                    if (c.location) info += `, Location: ${c.location}`;
                    return info;
                }).join('\n');

                contextGuidance = `\n\nADDITIONAL CONTEXT (use this to personalize the email):\n${companyInfo}`;
            }

            systemPrompt = `${personaPrompt}\n\nYour task is to generate a complete, professional outreach email template that drives conversions. ${styleGuidance} Your output MUST be a single minified JSON object with these exact keys: "subject", "opening", "greeting", "value_offer", "cta", "signature".

CRITICAL CONVERSION GUIDELINES:
1. HUMAN & NATURAL: Write like a busy professional, not an AI. Use conversational tone, contractions, and natural phrasing. Avoid corporate jargon, buzzwords, or overly formal language.
2. SPECIFIC & INFORMATIVE: Include concrete details, numbers, timelines, or examples. Never be vague or generic. Show you've done research.
3. TRUST-BUILDING: Demonstrate credibility through specific knowledge. Reference real context. No hype or exaggeration.
4. SPAM-PROOF:
   - Avoid spam trigger words: "free", "act now", "limited time", "urgent", "guarantee", "amazing", "incredible"
   - No excessive punctuation (!!!) or ALL CAPS
   - No pushy or desperate language
   - Keep subject line under 50 characters, specific not clickbait
5. CONVERSION-FOCUSED:
   - Lead with value to THEM (not features, but outcomes for their business)
   - Make CTA simple, specific, and low-friction (15-min call, not "demo")
   - Create genuine curiosity without being salesy
   - Give them a reason to respond NOW (time-sensitive insight, relevant data, mutual connection)

BLOCK REQUIREMENTS:
- "subject": Specific, personal, curiosity-driven. Under 50 chars. Reference their company or role.
- "opening": Reference specific context about their company/role/recent news (1-2 sentences). Use placeholders like {company_name}, {recipient_name}, {recent_news}.
- "greeting": Brief, natural. Use {recipient_name}.
- "value_offer": 2-3 sentences. Lead with specific outcome/benefit for THEIR business. Include concrete details (numbers, timelines, examples). Not generic features.
- "cta": Single, specific, low-friction ask (e.g., "15-min call this Thursday?" not "schedule a demo"). Create urgency through value, not pressure.
- "signature": Professional but warm. Include {sender_name}, {sender_title}, {sender_company}.

Use placeholders like {variable_name} throughout for personalization.`;

            userPrompt = `Generate a complete email template based on the following brief:\n"""\n${brief}\n"""${contextGuidance}`;
            temperature = 0.8;
        }

        // Generate AI completion
        const completion = await getOpenAICompletion(systemPrompt, userPrompt, temperature);
        const blocks = JSON.parse(completion || '{}');

        // Return comprehensive response
        return ok(res, {
            blocks,
            enrichedContext: enrichedContext ? {
                companies: enrichedContext.companies,
                urls: enrichedContext.urls
            } : null,
            campaignType: campaignType ? {
                id: campaignType.id,
                name: campaignType.name,
                category: campaignType.category,
                matchScore: campaignType.matchScore
            } : null,
            suggestedCampaigns: !campaignTypeId && matchedCampaigns ?
                matchedCampaigns.slice(0, 3).map(c => ({
                    id: c.id,
                    name: c.name,
                    category: c.category,
                    matchScore: c.matchScore,
                    matchReasons: c.matchReasons
                })) : null
        });

    } catch (e) {
        console.error("POST /api/templates/draft error:", e);
        return bad(res, "Failed to generate AI draft.", 500);
    }
});

/**
 * POST /api/templates/draft/block
 * Regenerates a single block of a template, using the brief and other blocks as context.
 * NEW: Supports campaign type for consistent regeneration
 * Body: { block, context: { brief, existing_blocks, campaignTypeId? } }
 */
router.post("/draft/block", adminOnly, async (req, res) => {
    const { block, context } = req.body;
    const userId = req.user?.id || req.user?.sub || DEFAULT_ADMIN_USER_ID;

    if (!block || !context || !context.brief || !context.existing_blocks) {
        return bad(res, "The 'block' and 'context' objects are required.", 400);
    }

    try {
        const [personaPrompt, styleContext] = await Promise.all([
            getActivePersonaPrompt(),
            getStyleContext(userId)
        ]);

        let systemPrompt, userPrompt, temperature;

        // If campaign type is specified, use campaign-aware regeneration
        if (context.campaignTypeId) {
            const campaignType = await getCampaignTypeById(context.campaignTypeId);
            if (!campaignType) {
                return bad(res, "Campaign type not found", 404);
            }

            const promptContext = {
                brief: context.brief,
                existingBlocks: context.existing_blocks,
                styleContext,
                personaPrompt
            };

            const campaignPrompt = buildBlockRegenerationPrompt(block, campaignType, promptContext);
            systemPrompt = campaignPrompt.systemPrompt;
            userPrompt = campaignPrompt.userPrompt;
            temperature = campaignPrompt.temperature;

        } else {
            // Fallback to generic regeneration
            let styleGuidance = "";
            if (styleContext?.tone_summary) {
                styleGuidance = `You MUST adapt to the user's preferred writing style, which is described as: "${styleContext.tone_summary}".`;
            }

            systemPrompt = `${personaPrompt}\n\nYour task is to regenerate one specific block of an email template, making it consistent with the user's brief, the other existing blocks, and their preferred writing style. ${styleGuidance} Your output MUST be a single minified JSON object with only one key: "${block}".`;

            userPrompt = `
                The user's original brief was: "${context.brief}"
                The current draft of the template is:
                ${JSON.stringify(context.existing_blocks, null, 2)}

                Now, regenerate ONLY the "${block}" block.
            `;
            temperature = 0.8;
        }

        const completion = await getOpenAICompletion(systemPrompt, userPrompt, temperature);
        const regeneratedBlock = JSON.parse(completion || '{}');

        return ok(res, regeneratedBlock);

    } catch (e) {
        console.error("POST /api/templates/draft/block error:", e);
        return bad(res, "Failed to regenerate block.", 500);
    }
});

export default router;