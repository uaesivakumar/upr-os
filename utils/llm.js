// routes/enrich/lib/llm.js
import { URL } from "url";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function safeParseJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function ensureFetch() {
  if (typeof fetch === "function") return fetch;
  throw new Error("Global fetch is not available. Use Node 18+ or add a polyfill.");
}

/**
 * A generic, reusable function for making chat completion requests to OpenAI.
 */
// --- MODIFICATION: Added 'responseFormat' parameter for flexibility ---
export async function getOpenAICompletion(systemPrompt, userPrompt, temperature = 0.2, model, responseFormat = { type: 'json_object' }) {
    const fetch = ensureFetch();
    if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set.");
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
            model: model || process.env.AI_MODEL || "gpt-4-turbo",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            temperature: temperature,
            // Use the provided responseFormat parameter
            response_format: responseFormat,
        }),
    });

    if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`OpenAI API error: ${res.status} - ${errorBody}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || null;
}
// --- END MODIFICATION ---

/**
 * Discovers email pattern for a company domain using LLM
 * Returns: {pattern: string, confidence: number, reasoning: string} or null
 */
export async function discoverEmailPattern(companyName, domain) {
    if (!OPENAI_API_KEY) {
        console.log(`[LLM] No OpenAI API key configured, skipping pattern discovery`);
        return null;
    }

    const systemPrompt = `You are an email pattern recognition expert. Analyze the company and predict their corporate email format with high accuracy.

Common patterns:
- {first}.{last} (e.g., john.smith@company.com) - Most common
- {first} (e.g., john@company.com)
- {first}_{last} (e.g., john_smith@company.com)
- {f}{last} (e.g., jsmith@company.com)
- {first}{l} (e.g., johns@company.com)
- {last}.{first} (e.g., smith.john@company.com)
- {first}-{last} (e.g., john-smith@company.com)
- {last} (e.g., smith@company.com)

Return ONLY valid JSON with these exact keys:
{
  "pattern": "{first}.{last}",
  "confidence": 85,
  "reasoning": "Large international company typically uses first.last format"
}

Confidence scoring:
- 90-100: Very confident (known company, standard pattern)
- 80-89: Confident (industry standard pattern likely)
- 70-79: Moderate confidence (educated guess)
- <70: Low confidence (unclear, multiple possibilities)

If confidence is below 70, return confidence as 0 to indicate uncertainty.`;

    const userPrompt = `Company: ${companyName}
Domain: ${domain}

What is the email pattern for this company?`;

    try {
        const response = await getOpenAICompletion(systemPrompt, userPrompt, 0.3);
        const parsed = safeParseJSON(response);

        if (!parsed || !parsed.pattern) {
            console.log(`[LLM] Failed to parse email pattern response:`, response);
            return null;
        }

        console.log(`[LLM] Discovered pattern for ${domain}: ${parsed.pattern} (confidence: ${parsed.confidence}%)`);
        return {
            pattern: parsed.pattern,
            confidence: parsed.confidence || 0,
            reasoning: parsed.reasoning || 'No reasoning provided'
        };
    } catch (error) {
        console.error(`[LLM] Error discovering email pattern:`, error.message);
        return null;
    }
}

/**
 * Creates an embedding vector from a given text using OpenAI's API.
 */
export async function getEmbedding(text, model = 'text-embedding-3-small') {
    // ... (This function is unchanged)
    const fetch = ensureFetch();
    if (!OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not set.");
    }

    const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
            input: text,
            model: model,
        }),
    });

    if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`OpenAI Embeddings API error: ${res.status} - ${errorBody}`);
    }

    const json = await res.json();
    const embedding = json.data?.[0]?.embedding;

    if (!embedding) {
        throw new Error("Failed to get embedding from OpenAI API response.");
    }
    
    return embedding;
}


function cleanLinkedInCompany(url = "") {
  // ... (This function is unchanged)
  const u = String(url || "").trim();
  if (!u) return null;
  let href = u;
  if (!/^https?:\/\//i.test(href)) href = "https://" + href;
  try {
    const parsed = new URL(href);
    if (!/(\.|^)linkedin\.com$/i.test(parsed.host)) return null;
    const m = parsed.pathname.match(/^\/(company|school)\/([^\/?#]+)/i);
    if (!m) return null;
    const type = m[1].toLowerCase();
    const slug = m[2];
    return `https://www.linkedin.com/${type}/${slug}/`;
  } catch {
    return null;
  }
}

const systemPrompt = `You are a UAE-focused corporate researcher...`; // (Full prompt text)
const refineSystemPrompt = `You are a corporate researcher...`; // (Full prompt text)


async function guessCompany(candidates, query, { model, temperature, promptType } = {}) {
    // ... (This function is unchanged, it will correctly use the default JSON format)
    const started = Date.now();
    const activePrompt = promptType === 'refine' ? refineSystemPrompt : systemPrompt;
    const userPrompt = `Query: "${query}"\n\nCandidates:\n${candidates.map(c => `- Title: ${c.title}\n  Link: ${c.link}\n  Snippet: ${c.snippet}`).join('\n')}`;
  
    try {
        const choice = await getOpenAICompletion(activePrompt, userPrompt, temperature || 0.1, model);
        const parsed = choice ? safeParseJSON(choice) : null;
  
        if (!parsed) return { company: null, llm_ms: Date.now() - started, error: "json_parse_failed" };
        if (parsed.error) return { company: null, llm_ms: Date.now() - started, error: parsed.error };
        
        const company = { /* ... */ };
  
        return { company, llm_ms: Date.now() - started };
    } catch (e) {
        console.error("[llm] guessCompany failed:", e);
        return { company: null, llm_ms: Date.now() - started, error: e.message };
    }
}

export async function enrichWithLLM(candidates, query, options = {}) {
    // ... (This function is unchanged)
    try {
        const { company, llm_ms, error } = await guessCompany(candidates, query, options);
        if (error || !company) {
            console.warn(`[llm] enrichWithLLM failed for query "${query}":`, error);
            return { company: null, llm_ms, error };
        }
        return { company, llm_ms };
    } catch (e) {
        console.error("[llm] enrichWithLLM outer error", e);
        return { company: null, error: e.message };
    }
}

export async function findPeopleWithAI(companyName, domain) {
    // ... (This function is unchanged)
    const started = Date.now();
    console.log(`[llm] Starting advanced AI people search for ${companyName} with domain ${domain}`);
  
    const systemPrompt = `You are an expert corporate intelligence analyst...`;
    const userPrompt = `Input:\n- Company name: "${companyName}"...`;
    
    try {
      const content = await getOpenAICompletion(systemPrompt, userPrompt, 0.2);
      const parsed = content ? safeParseJSON(content) : {};
      const people = Array.isArray(parsed.people) ? parsed.people : [];
      console.log(`[llm] AI people search found ${people.length} people in ${Date.now() - started}ms.`);
      return people;
    } catch(e) {
      console.error("[llm] findPeopleWithAI failed:", e);
      return [];
    }
}

export async function generateOutreachEmail(leadData) {
    // ... (This function is unchanged)
    const systemPrompt = `You are a professional B2B Sales Development Representative...`;
    const userPrompt = `Generate an email based on this lead data:\n${JSON.stringify(leadData)}\n\nSign the email from "[Your Name]".`;
    const started = Date.now();
  
    try {
      const content = await getOpenAICompletion(systemPrompt, userPrompt, 0.7);
      const parsed = content ? safeParseJSON(content) : null;
  
      if (!parsed || !parsed.subject || !parsed.body) {
        throw new Error("Invalid JSON structure from AI. Expected { subject, body }.");
      }
      console.log(`[llm] Outreach generated in ${Date.now() - started}ms.`);
      return parsed;
    } catch(e) {
      console.error("[llm] generateOutreachEmail failed:", e);
      return { subject: "Error Generating Email", body: "Could not generate outreach message due to a server-side error." };
    }
}

export default { guessCompany, enrichWithLLM, findPeopleWithAI, generateOutreachEmail };