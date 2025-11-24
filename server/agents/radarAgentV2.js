// server/agents/radarAgentV2.js
// RadarAgent V2 - Refactored to use AgentProtocol (Phase 4)
// AI agent for autonomous UAE company discovery

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import pool from '../db.js';
import AgentProtocol from '../protocols/AgentProtocol.js';
import SerpTool from '../tools/serp.js';
import CrawlerTool from '../tools/crawler.js';
import RadarService from '../services/radar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load JSON schemas
const inputSchema = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../protocols/schemas/radar-discovery-input.json'),
    'utf-8'
  )
);
const outputSchema = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../protocols/schemas/radar-discovery-output.json'),
    'utf-8'
  )
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class RadarAgentV2 extends AgentProtocol {
  constructor() {
    super({
      agentName: 'RadarAgent',
      agentVersion: '2.0.0',
      inputSchema,
      outputSchema,
      options: {
        enableStateMachine: true,
        enableCostTracking: true,
        enableDeadLetter: true,
        maxRetries: 3,
        budgetLimitUsd: 2.00
      }
    });

    this.companySchema = {
      type: 'object',
      required: ['company', 'trigger_type', 'description'],
      properties: {
        company: { type: 'string' },
        domain: { type: ['string', 'null'] },
        trigger_type: { type: 'string' },
        description: { type: 'string' },
        hiring_likelihood_score: { type: ['integer', 'null'], minimum: 1, maximum: 5 }
      }
    };
  }

  /**
   * Main agent execution logic
   * @override
   */
  async run(input, context) {
    const {
      sourceId,
      sourceName,
      sourceType,
      budgetLimitUsd = 2.00,
      maxResults = 10
    } = input;

    const { runId, tenantId } = context;

    const companiesFound = [];
    const errors = [];

    // Get search query from source metadata
    const source = await this.getSourceQuery(sourceId);

    // 1. Search via SERP
    console.log(`[RadarAgentV2] Searching: ${source.query}`);
    const searchResults = await SerpTool.search({
      query: source.query,
      location: 'United Arab Emirates',
      engine: sourceType === 'news' ? 'google_news' : 'google',
      num: maxResults,
      runId,
      tenantId,
      sourceId
    });

    // Track SERP cost
    const serpCost = searchResults.metadata?.costUsd || 0;
    this.trackCost(serpCost, {
      provider: 'serp',
      operation: 'search',
      results: searchResults.results.length
    });

    // 2. Crawl top results
    const urlsToCrawl = searchResults.results
      .slice(0, 5)
      .map(r => r.link)
      .filter(Boolean);

    console.log(`[RadarAgentV2] Crawling ${urlsToCrawl.length} URLs`);
    const crawlResults = await CrawlerTool.crawlBatch(urlsToCrawl, {
      concurrency: 3,
      runId,
      tenantId,
      sourceId
    });

    // Track crawl cost
    const crawlCost = crawlResults.length * 0.001;
    this.trackCost(crawlCost, {
      provider: 'crawler',
      operation: 'crawl',
      urls: crawlResults.length
    });

    // 3. Extract hiring signals using GPT-4 (recall mode)
    for (const crawlResult of crawlResults) {
      if (!crawlResult.success) continue;

      try {
        const extracted = await this.extractCompanies({
          crawlResult,
          runId,
          tenantId
        });

        // Track GPT cost
        this.trackCost(extracted.cost, {
          provider: 'openai',
          model: 'gpt-4-turbo',
          tokens: extracted.tokens,
          latency_ms: extracted.latencyMs
        });

        // Validate and save hiring signals (RECALL MODE - no filtering)
        for (const signal of extracted.companies) {
          if (this.validateCompany(signal)) {
            console.log(
              `[RadarAgentV2] Signal: "${signal.company}" - ${signal.trigger_type} - score: ${signal.hiring_likelihood_score}`
            );

            try {
              const savedSignal = await this.saveCompany({
                ...signal,
                runId,
                tenantId
              });

              if (savedSignal) {
                companiesFound.push(savedSignal);
                console.log(
                  `[RadarAgentV2] ✅ Saved: ${signal.company} (${signal.geo_status}, score: ${signal.hiring_likelihood_score})`
                );
              }
            } catch (saveError) {
              console.error(
                `[RadarAgentV2] ❌ Failed to save signal "${signal.company}":`,
                saveError.message
              );
              errors.push({
                company: signal.company,
                error: saveError.message
              });
            }
          } else {
            console.log(`[RadarAgentV2] ⚠️ Invalid signal schema:`, signal);
          }
        }
      } catch (error) {
        console.error(
          `[RadarAgentV2] Extraction failed for ${crawlResult.url}:`,
          error
        );
        errors.push({ url: crawlResult.url, error: error.message });

        // Create dead letter (ErrorHandler will handle this)
        await RadarService.createDeadLetter({
          runId,
          sourceId,
          rawData: crawlResult,
          failureReason: error.message,
          tenantId
        });
      }
    }

    // Return output matching schema
    return {
      companiesFound: companiesFound.length,
      companies: companiesFound.filter(Boolean),
      costUsd: parseFloat(this.currentRunCost.toFixed(4)),
      latencyMs: Date.now() - this.currentRunMetadata.startTime,
      errors
    };
  }

  /**
   * Extract companies using GPT-4 (RECALL MODE)
   */
  async extractCompanies(params) {
    const { crawlResult, runId, tenantId } = params;

    // RECALL-MODE EXTRACTION PROMPT (inline, comprehensive)
    const systemPrompt = `You are the UPR RADAR Discovery Agent - an AI system that identifies UAE companies with hiring signals.

MISSION:
Extract companies from the provided article/webpage that show expansion, projects, or hiring activity in the UAE.

HIRING SIGNALS TO DETECT (Expanded List):
1. Project Awards / EPC Contracts (e.g., "$500M solar project", "awarded contract")
2. Office Expansion (e.g., "opening new Dubai branch", "scale up operations")
3. Hiring Announcements (e.g., "recruiting 100 engineers", "now accepting CVs")
4. Market Entry (e.g., "PayPal opens UAE headquarters", "regional HQ in Dubai")
5. Acquisitions / Investments (e.g., "$346M recycling facility")
6. Partnerships / Joint Ventures (e.g., "JV for UAE/GCC")
7. Tenders / Pre-qualification (e.g., "shortlisted for tender")
8. Operational Milestones (e.g., "construction to begin", "Go-Live Q2 2026")

GEOGRAPHY CLASSIFICATION:
- "confirmed": Explicit UAE mention (Dubai, Abu Dhabi, UAE cities, "UAE", "United Arab Emirates")
- "probable": Strong GCC/MENA context suggesting UAE (mentions "GCC", "MENA" with UAE partners)
- "ambiguous": Company mentioned but unclear UAE connection

SCORING FRAMEWORK (1-5):
5 (Very High): Explicit hiring drive, massive project (>$500M), new UAE HQ
4 (High): Large project ($100M-500M), office expansion, acquisition
3 (Medium): Medium project ($10M-100M), partnership, capacity expansion
2 (Low): Small project (<$10M), minor announcement
1 (Very Low): Company mentioned but no clear signal

OUTPUT FORMAT - Return ONLY valid JSON (no markdown):
{
  "companies": [
    {
      "company": "string",
      "domain": "string|null",
      "sector": "string|null",
      "trigger_type": "Project Award|Expansion|Investment|Market Entry|Acquisition|Hiring Drive|Partnership|Tender|Other",
      "description": "string (max 150 chars)",
      "hiring_likelihood_score": 1-5,
      "hiring_likelihood": "Very High|High|Medium|Low|Very Low",
      "geo_status": "confirmed|probable|ambiguous",
      "geo_hints": ["string"],
      "location": "string|null",
      "source_url": "string|null",
      "source_date": "YYYY-MM-DD|null",
      "evidence_quote": "string|null",
      "evidence_note": "string|null",
      "role_cluster": {
        "roles": ["string"],
        "horizon": "0-18m"
      },
      "notes": "string|null"
    }
  ]
}

CRITICAL RULES (RECALL MODE):
1. DO NOT EXCLUDE any company due to low score or ambiguous geography
2. If NO companies found, return: {"companies": []}
3. Return valid JSON only - no markdown, no code blocks
4. Keep descriptions under 150 characters
5. Always assign geo_status, hiring_likelihood_score, and role_cluster
6. Prefer multiple entries over missing opportunities`;

    const userPrompt = `Extract companies with hiring signals from this article:

URL: ${crawlResult.url}

CONTENT:
${crawlResult.rawText}

Return JSON only:`;

    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 2000
    });

    const latencyMs = Date.now() - startTime;
    const content = response.choices[0].message.content;

    // Parse JSON response
    const companies = this.parseCompaniesJson(content);

    // Calculate cost
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const cost = promptTokens * 0.00001 + completionTokens * 0.00003; // GPT-4 Turbo pricing

    return {
      companies,
      cost,
      latencyMs,
      tokens: promptTokens + completionTokens
    };
  }

  /**
   * Parse companies from JSON string
   */
  parseCompaniesJson(jsonString) {
    try {
      // Remove markdown code blocks if present
      const cleaned = jsonString
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const parsed = JSON.parse(cleaned);

      // Handle both array and object responses
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.companies && Array.isArray(parsed.companies)) {
        return parsed.companies;
      } else {
        return [parsed];
      }
    } catch (error) {
      console.error('[RadarAgentV2] JSON parse failed:', error);
      return [];
    }
  }

  /**
   * Validate hiring signal object against schema (RECALL MODE)
   */
  validateCompany(signal) {
    if (!signal) return false;
    if (typeof signal.company !== 'string' || !signal.company) return false;
    // Domain is optional in recall mode
    if (
      signal.hiring_likelihood_score &&
      (signal.hiring_likelihood_score < 1 ||
        signal.hiring_likelihood_score > 5)
    ) {
      return false;
    }
    // geo_status is required
    if (
      signal.geo_status &&
      !['confirmed', 'probable', 'ambiguous'].includes(signal.geo_status)
    ) {
      return false;
    }
    return true;
  }

  /**
   * Save hiring signal to hiring_signals table (RECALL MODE)
   */
  async saveCompany(signal) {
    const {
      company,
      domain,
      sector,
      trigger_type,
      description,
      hiring_likelihood_score,
      hiring_likelihood,
      geo_status,
      geo_hints,
      location,
      source_url,
      source_date,
      evidence_quote,
      evidence_note,
      role_cluster,
      notes,
      runId,
      tenantId
    } = signal;

    try {
      // Insert into hiring_signals with deduplication
      const result = await pool.query(
        `INSERT INTO hiring_signals (
          tenant_id,
          run_id,
          company,
          domain,
          sector,
          trigger_type,
          description,
          hiring_likelihood_score,
          hiring_likelihood,
          geo_status,
          geo_hints,
          location,
          source_url,
          source_date,
          evidence_quote,
          evidence_note,
          role_cluster,
          notes,
          review_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pending')
        ON CONFLICT (company, trigger_type)
        DO UPDATE SET
          run_id = EXCLUDED.run_id,
          domain = EXCLUDED.domain,
          sector = EXCLUDED.sector,
          description = EXCLUDED.description,
          hiring_likelihood_score = EXCLUDED.hiring_likelihood_score,
          hiring_likelihood = EXCLUDED.hiring_likelihood,
          geo_status = EXCLUDED.geo_status,
          geo_hints = EXCLUDED.geo_hints,
          location = EXCLUDED.location,
          source_url = EXCLUDED.source_url,
          evidence_quote = EXCLUDED.evidence_quote,
          evidence_note = EXCLUDED.evidence_note,
          role_cluster = EXCLUDED.role_cluster,
          notes = EXCLUDED.notes,
          updated_at = NOW()
        RETURNING *`,
        [
          tenantId,
          runId,
          company,
          domain,
          sector,
          trigger_type,
          description,
          hiring_likelihood_score,
          hiring_likelihood,
          geo_status,
          geo_hints || [],
          location,
          source_url,
          source_date,
          evidence_quote,
          evidence_note,
          role_cluster ? JSON.stringify(role_cluster) : null,
          notes
        ]
      );

      return result.rows[0];
    } catch (err) {
      console.error(
        '[RadarAgentV2] Failed to save hiring signal:',
        err.message
      );
      console.error('[RadarAgentV2] Error details:', err.stack);
      return null;
    }
  }

  /**
   * Get source query from database
   */
  async getSourceQuery(sourceId) {
    const result = await pool.query(
      'SELECT * FROM discovery_sources WHERE source_id = $1',
      [sourceId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Source not found: ${sourceId}`);
    }

    const source = result.rows[0];
    return {
      ...source,
      query: source.metadata?.query || `${source.name} UAE companies`
    };
  }

  /**
   * Lifecycle hook: Before run
   * @override
   */
  async beforeRun(input, context) {
    console.log(`[RadarAgentV2] Starting discovery for source: ${input.sourceName}`);
  }

  /**
   * Lifecycle hook: After run
   * @override
   */
  async afterRun(output, context) {
    console.log(`[RadarAgentV2] Discovery complete: ${output.companiesFound} companies found`);
  }

  /**
   * Lifecycle hook: On error
   * @override
   */
  async onError(error, input, context) {
    console.error(`[RadarAgentV2] Discovery failed for source ${input.sourceName}:`, error.message);
  }

  /**
   * Graceful degradation: Can we return partial results?
   * @override
   */
  async canDegradeGracefully(error, input, context) {
    // Check if we found at least some companies before failing
    const metadata = this.getMetadata();

    // If we have partial results in metadata, we can degrade
    if (metadata.errors && metadata.errors.length < 5) {
      return {
        strategy: 'partial_results',
        reason: 'Some extractions failed but overall discovery succeeded'
      };
    }

    return null; // Cannot degrade
  }

  /**
   * Perform graceful degradation
   * @override
   */
  async degradeGracefully(error, input, context) {
    // Return empty result set with error details
    return {
      companiesFound: 0,
      companies: [],
      costUsd: this.currentRunCost,
      latencyMs: Date.now() - this.currentRunMetadata.startTime,
      errors: [{ error: error.message }]
    };
  }
}

export default new RadarAgentV2();
