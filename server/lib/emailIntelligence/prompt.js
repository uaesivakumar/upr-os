/**
 * LLM Prompt Module
 * Week 2 Day 3-4: Full Implementation
 *
 * Generates prompts for pattern prediction via GPT-4o-mini.
 * Uses strict JSON schema to prevent hallucinations.
 */

import OpenAI from 'openai';

let openaiClient = null;

/**
 * Initialize OpenAI client (lazy)
 */
function getOpenAI() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

/**
 * Check if OpenAI is configured
 */
export function isConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Allowed email patterns (prevent hallucination)
 */
const ALLOWED_PATTERNS = [
  '{first}.{last}',
  '{f}{last}',
  '{first}{l}',
  '{first}_{last}',
  '{first}{last}',
  '{last}.{first}',
  '{f}.{last}',
  '{first}'
];

/**
 * Build system prompt for pattern prediction
 */
function buildSystemPrompt() {
  return `You are an expert at predicting corporate email patterns.

ALLOWED PATTERNS (use ONLY these):
${ALLOWED_PATTERNS.map((p, i) => `${i + 1}. ${p}`).join('\n')}

PATTERN EXAMPLES:
- {first}.{last} → john.smith@company.com
- {f}{last} → jsmith@company.com
- {first}{l} → johnS@company.com
- {first}_{last} → john_smith@company.com
- {first}{last} → johnsmith@company.com
- {last}.{first} → smith.john@company.com
- {f}.{last} → j.smith@company.com
- {first} → john@company.com

RESPOND WITH JSON ONLY. NO MARKDOWN. NO EXPLANATIONS.

Response format:
{
  "pattern": "{first}.{last}",
  "confidence": 0.85,
  "reasoning": "Brief explanation"
}

Confidence scale:
- 0.90-1.00: Very certain (you have specific knowledge)
- 0.80-0.89: Confident (strong regional/sector patterns)
- 0.70-0.79: Moderate (general industry patterns)
- 0.60-0.69: Uncertain (best guess)
- <0.60: Not confident (default to {first}.{last})`;
}

/**
 * Build user prompt with company context
 */
function buildUserPrompt(company, domain, sector, region, ragContext = null) {
  let prompt = `Predict the email pattern for:

Company: ${company || domain}
Domain: ${domain}
Sector: ${sector || 'Unknown'}
Region: ${region || 'Unknown'}`;

  if (ragContext && ragContext.length > 0) {
    prompt += `\n\nSimilar companies (for reference):`;
    ragContext.forEach((ctx, idx) => {
      prompt += `\n${idx + 1}. ${ctx.domain} → ${ctx.pattern} (similarity: ${(ctx.similarity * 100).toFixed(0)}%)`;
    });
  }

  prompt += `\n\nBased on this information, predict the most likely email pattern.`;

  return prompt;
}

/**
 * Guess email pattern using LLM
 *
 * @param {Object} context - Company context
 * @param {string} context.company - Company name
 * @param {string} context.domain - Domain name
 * @param {string} context.sector - Industry sector
 * @param {string} context.region - Geographic region
 * @param {Array} context.ragContext - Similar patterns from RAG
 * @returns {Promise<Object>} - {pattern, confidence, reasoning, cost}
 */
export async function guessPattern(context) {
  const { company, domain, sector, region, ragContext } = context;

  const openai = getOpenAI();
  if (!openai) {
    console.warn('[LLM] OpenAI not configured, returning default pattern');
    return {
      pattern: '{first}.{last}',
      confidence: 0.65,
      reasoning: 'OpenAI API key not configured - using default',
      cost: 0,
      source: 'llm_fallback'
    };
  }

  console.log(`[LLM] Predicting pattern for ${domain}`);

  const startTime = Date.now();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(company, domain, sector, region, ragContext) }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Low temperature for consistency
      max_tokens: 200
    });

    const duration = Date.now() - startTime;

    const result = JSON.parse(response.choices[0].message.content);

    // Validate pattern is in allowed list
    if (!ALLOWED_PATTERNS.includes(result.pattern)) {
      console.warn(`[LLM] Invalid pattern ${result.pattern}, defaulting to {first}.{last}`);
      result.pattern = '{first}.{last}';
      result.confidence = 0.65;
    }

    // Clamp confidence to [0.6, 0.95]
    result.confidence = Math.max(0.60, Math.min(0.95, result.confidence));

    // Calculate cost (rough estimate)
    const inputTokens = 400; // Approximate
    const outputTokens = 50; // Approximate
    const costPer1kInputTokens = 0.00015; // GPT-4o-mini pricing
    const costPer1kOutputTokens = 0.00060;
    const cost = (inputTokens / 1000 * costPer1kInputTokens) + (outputTokens / 1000 * costPer1kOutputTokens);

    console.log(`[LLM] Pattern: ${result.pattern}, Confidence: ${result.confidence.toFixed(2)}, Latency: ${duration}ms, Cost: $${cost.toFixed(6)}`);

    return {
      pattern: result.pattern,
      confidence: result.confidence,
      reasoning: result.reasoning || 'No reasoning provided',
      cost: cost,
      duration: duration,
      source: 'llm'
    };

  } catch (error) {
    console.error('[LLM] Error:', error.message);

    return {
      pattern: '{first}.{last}',
      confidence: 0.65,
      reasoning: `LLM error: ${error.message}`,
      cost: 0,
      duration: Date.now() - startTime,
      source: 'llm_error'
    };
  }
}

export default {
  guessPattern,
  isConfigured,
  ALLOWED_PATTERNS
};
