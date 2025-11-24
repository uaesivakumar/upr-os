/**
 * HiringSignalExtractionTool - SIVA Tool 13 (Standalone) - v1.0
 *
 * Implements: EXTRACT_HIRING_SIGNALS (DELEGATED - LLM)
 *
 * Purpose: Extract structured hiring signals from news articles/web content
 * Type: DELEGATED (GPT-4 with schema-locking)
 * SLA: ≤3000ms P50, ≤5000ms P95
 *
 * v1.0 Features:
 * - GPT-4 Turbo extraction with schema-locked JSON output
 * - UAE presence confidence classification (CONFIRMED/PROBABLE/AMBIGUOUS)
 * - Hiring likelihood scoring (1-5)
 * - Signal type detection (6 types)
 * - Sentry error tracking
 *
 * Replaces: RADAR's inline 60-line extraction prompt
 *
 * Phase 2 Reference: Tool 13 - EXTRACT_HIRING_SIGNALS
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const OpenAI = require('openai');
const { hiringSignalExtractionInputSchema, hiringSignalExtractionOutputSchema } = require('./schemas/hiringSignalExtractionSchemas');

class HiringSignalExtractionToolStandalone {
  constructor() {
    this.agentName = 'HiringSignalExtractionTool';
    this.POLICY_VERSION = 'v1.0';

    // OpenAI client
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'sk-dummy-key-for-testing'
    });

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(hiringSignalExtractionInputSchema);
    this.validateOutput = ajv.compile(hiringSignalExtractionOutputSchema);

    // System prompt (migrated from radarAgent.js:157-217)
    this.SYSTEM_PROMPT = `You are a hiring signal extraction specialist analyzing UAE-focused news articles and job postings. Your task is to identify companies that are:
1. Actively hiring (job openings, recruitment events)
2. Expanding operations (opening offices, launching products)
3. Receiving funding (investment rounds, grants)
4. Making acquisitions or partnerships

For EACH company mentioned, extract:
- Company name (official legal name preferred)
- Domain/website (if mentioned)
- Industry/sector
- Location (specific city/emirate in UAE)
- Signal type (HIRING, EXPANSION, FUNDING, ACQUISITION, PARTNERSHIP, RELOCATION)
- Trigger description (what they're doing)
- Employee count or roles mentioned
- UAE presence confidence (CONFIRMED if UAE-based, PROBABLE if expanding to UAE, AMBIGUOUS if unclear)
- Hiring likelihood (1-5, where 5 = definitely hiring, 1 = no clear hiring signal)

Rules:
- Only extract companies with CLEAR UAE connection
- CONFIRMED = company explicitly based in UAE or has UAE office
- PROBABLE = company expanding to UAE or hiring UAE roles
- AMBIGUOUS = UAE mentioned but connection unclear (skip these in output)
- Extract ALL companies mentioned, not just one
- Be conservative with hiring likelihood scores
- Focus on actionable hiring signals

Output ONLY valid JSON matching this schema:
{
  "signals": [
    {
      "company_name": "string",
      "company_domain": "string or null",
      "industry": "string or null",
      "location": "Dubai|Abu Dhabi|Sharjah|etc",
      "signal_type": "HIRING|EXPANSION|FUNDING|ACQUISITION|PARTNERSHIP|RELOCATION",
      "trigger_description": "brief description of the signal",
      "employee_count_mentioned": number or null,
      "roles_mentioned": ["role1", "role2"] or null,
      "uae_presence_confidence": "CONFIRMED|PROBABLE|AMBIGUOUS",
      "hiring_likelihood": 1-5,
      "key_facts": ["fact1", "fact2"]
    }
  ],
  "metadata": {
    "signals_found": number,
    "extraction_confidence": 0.0-1.0,
    "ambiguous_companies": number,
    "model_used": "gpt-4-turbo-preview"
  }
}`;
  }

  /**
   * Execute the tool with Sentry error tracking
   * @param {Object} input - Source, content, context
   * @returns {Promise<Object>} Extracted hiring signals
   */
  async execute(input) {
    try {
      return await this._executeInternal(input);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'HiringSignalExtractionTool',
          primitive: 'EXTRACT_HIRING_SIGNALS',
          phase: 'Phase_2',
          layer: 'DELEGATED'
        },
        extra: {
          input_url: input.source?.url,
          content_length: input.content?.body_text?.length,
          timestamp: new Date().toISOString()
        },
        level: 'error'
      });

      // Re-throw to maintain error propagation
      throw error;
    }
  }

  /**
   * Internal execution logic
   * @private
   */
  async _executeInternal(input) {
    // Validate input
    if (!this.validateInput(input)) {
      const errors = this.validateInput.errors.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      throw new Error(`Input validation failed: ${errors}`);
    }

    const startTime = Date.now();

    // Extract inputs
    const { source, content, context } = input;

    // Truncate content to avoid token limits (8000 chars ~2000 tokens)
    const truncatedContent = content.body_text.substring(0, 8000);

    // Construct user prompt
    const userPrompt = `Analyze this article for hiring signals:

URL: ${source.url}
Title: ${content.title}
Content:
${truncatedContent}

Extract ALL companies with UAE hiring or expansion signals. Be thorough but accurate.`;

    // Call GPT-4 with schema-locking
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: this.SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }, // Schema-locked
      temperature: 0.1, // Low temperature for consistency
      max_tokens: 2000
    });

    const latencyMs = Date.now() - startTime;
    const content_text = response.choices[0].message.content;

    // Parse JSON output
    let extracted;
    try {
      extracted = JSON.parse(content_text);
    } catch (parseError) {
      throw new Error(`LLM output JSON parse failed: ${parseError.message}`);
    }

    // Validate LLM output structure
    if (!extracted.signals || !Array.isArray(extracted.signals)) {
      throw new Error('LLM output missing signals array');
    }

    // Filter out AMBIGUOUS signals (not confident enough)
    const originalCount = extracted.signals.length;
    const filteredSignals = extracted.signals.filter(
      s => s.uae_presence_confidence !== 'AMBIGUOUS'
    );
    const ambiguousCount = originalCount - filteredSignals.length;

    // Calculate cost (GPT-4 Turbo pricing)
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;
    const costUsd = (promptTokens * 0.00001) + (completionTokens * 0.00003);

    // Build output
    const output = {
      signals: filteredSignals,
      metadata: {
        signals_found: filteredSignals.length,
        extraction_confidence: extracted.metadata?.extraction_confidence || 0.8,
        ambiguous_companies: ambiguousCount,
        model_used: 'gpt-4-turbo-preview',
        tokens_used: totalTokens,
        cost_usd: parseFloat(costUsd.toFixed(6))
      },
      timestamp: new Date().toISOString(),
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'extract_hiring_signals',
        tool_type: 'DELEGATED',
        policy_version: this.POLICY_VERSION
      }
    };

    // Validate output
    if (!this.validateOutput(output)) {
      const errors = this.validateOutput.errors.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      console.warn(`Output validation failed: ${errors}`);
      // Don't throw - allow output with warnings
    }

    return output;
  }
}

module.exports = HiringSignalExtractionToolStandalone;
