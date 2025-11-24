/**
 * SourceReliabilityTool - SIVA Tool 14 (Standalone) - v1.0
 *
 * Implements: EVALUATE_SOURCE_RELIABILITY (STRICT - Deterministic)
 *
 * Purpose: Score news sources for reliability (0-100)
 * Type: STRICT (Deterministic scoring)
 * SLA: ≤50ms P50, ≤100ms P95
 *
 * v1.0 Features:
 * - Deterministic source scoring (0-100)
 * - Tier classification (TIER_1, TIER_2, TIER_3, UNVERIFIED)
 * - 20+ verified UAE news sources
 * - Source type fallback logic
 * - Sentry error tracking
 *
 * Replaces: RADAR's implicit source weighting
 *
 * Phase 2 Reference: Tool 14 - EVALUATE_SOURCE_RELIABILITY
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const { sourceReliabilityInputSchema, sourceReliabilityOutputSchema } = require('./schemas/sourceReliabilitySchemas');

class SourceReliabilityToolStandalone {
  constructor() {
    this.agentName = 'SourceReliabilityTool';
    this.POLICY_VERSION = 'v1.0';

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(sourceReliabilityInputSchema);
    this.validateOutput = ajv.compile(sourceReliabilityOutputSchema);

    // Source reliability scores (curated UAE sources)
    this.SOURCE_SCORES = {
      // Tier 1: Premium news sources (90-100)
      'gulfnews.com': 95,
      'thenationalnews.com': 95,
      'khaleejtimes.com': 90,
      'arabianbusiness.com': 92,
      'zawya.com': 90,
      'bloomberg.com': 98,
      'reuters.com': 98,

      // Tier 2: Reputable sources (70-89)
      'tradearabia.com': 80,
      'constructionweekonline.com': 78,
      'businessliveme.com': 75,
      'wamda.com': 82,
      'magnitt.com': 85,
      'menafn.com': 77,
      'thenational.ae': 88,
      'ameinfo.com': 76,

      // Tier 3: Job boards & specialized (60-69)
      'bayt.com': 65,
      'naukrigulf.com': 63,
      'dubizzle.com': 60,
      'linkedin.com': 70,
      'indeed.ae': 65,
      'glassdoor.com': 68,

      // Default unknown sources: 40
    };
  }

  /**
   * Execute the tool with Sentry error tracking
   * @param {Object} input - Source domain and type
   * @returns {Promise<Object>} Reliability score and tier
   */
  async execute(input) {
    try {
      return await this._executeInternal(input);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'SourceReliabilityTool',
          primitive: 'EVALUATE_SOURCE_RELIABILITY',
          phase: 'Phase_2',
          layer: 'STRICT'
        },
        extra: {
          input_domain: input.source_domain,
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
    const { source_domain, source_type } = input;

    // Normalize domain (remove www., lowercase)
    const normalizedDomain = source_domain
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/\/$/, '');

    // Check known sources
    if (this.SOURCE_SCORES[normalizedDomain]) {
      const score = this.SOURCE_SCORES[normalizedDomain];
      const tier = this._calculateTier(score);
      const latencyMs = Date.now() - startTime;

      const output = {
        reliability_score: score,
        source_tier: tier,
        confidence: 1.0,
        metadata: {
          is_verified_source: true,
          known_for_accuracy: score >= 85
        },
        timestamp: new Date().toISOString(),
        _meta: {
          latency_ms: latencyMs,
          tool_name: 'evaluate_source_reliability',
          tool_type: 'STRICT',
          policy_version: this.POLICY_VERSION
        }
      };

      // Validate output
      if (!this.validateOutput(output)) {
        const errors = this.validateOutput.errors.map(err =>
          `${err.instancePath} ${err.message}`
        ).join(', ');
        console.warn(`Output validation failed: ${errors}`);
      }

      return output;
    }

    // Fallback logic based on source type
    let fallbackScore = 40;
    let confidence = 0.5;

    if (source_type === 'CORPORATE_WEBSITE') {
      fallbackScore = 75;
      confidence = 0.8;
    } else if (source_type === 'JOB_BOARD') {
      fallbackScore = 62;
      confidence = 0.7;
    } else if (source_type === 'NEWS') {
      fallbackScore = 55;
      confidence = 0.6;
    } else if (source_type === 'BLOG') {
      fallbackScore = 45;
      confidence = 0.6;
    } else if (source_type === 'SOCIAL_MEDIA') {
      fallbackScore = 35;
      confidence = 0.5;
    }

    const tier = this._calculateTier(fallbackScore);
    const latencyMs = Date.now() - startTime;

    const output = {
      reliability_score: fallbackScore,
      source_tier: tier,
      confidence: confidence,
      metadata: {
        is_verified_source: false,
        known_for_accuracy: false
      },
      timestamp: new Date().toISOString(),
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'evaluate_source_reliability',
        tool_type: 'STRICT',
        policy_version: this.POLICY_VERSION
      }
    };

    // Validate output
    if (!this.validateOutput(output)) {
      const errors = this.validateOutput.errors.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      console.warn(`Output validation failed: ${errors}`);
    }

    return output;
  }

  /**
   * Calculate source tier from score
   * @private
   */
  _calculateTier(score) {
    if (score >= 90) return 'TIER_1';
    if (score >= 70) return 'TIER_2';
    if (score >= 50) return 'TIER_3';
    return 'UNVERIFIED';
  }
}

module.exports = SourceReliabilityToolStandalone;
