/**
 * BankingProductMatchTool - SIVA Decision Primitive 5 (Standalone) - v1.0
 *
 * Implements: MATCH_BANKING_PRODUCTS (STRICT)
 *
 * Purpose: Match company profiles to appropriate Emirates NBD banking products
 * Type: STRICT (deterministic, no LLM calls)
 * SLA: ≤100ms P50, ≤250ms P95
 *
 * v1.0 Features:
 * - Product catalog from emiratesnbd.com structure
 * - Formula protection (NO scoring breakdown exposed)
 * - Industry bonuses and signal multipliers
 * - Confidence level classification
 * - Sentry error tracking
 *
 * Phase 1 Reference: Decision Primitives §2, Primitive 5
 * Phase 2 Reference: MCP Tool Registry §1, Tool 5
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const fs = require('fs');
const path = require('path');
const { bankingProductMatchInputSchema, bankingProductMatchOutputSchema } = require('./schemas/bankingProductMatchSchemas');
const { v4: uuidv4 } = require('uuid');

// Sprint 28: A/B Testing support
const { ABTestingHelper } = require('../agent-core/ab-testing.js');

// Sprint 28: Scoring adjustments based on feedback
const scoringAdjustments = require('../agent-core/scoring-adjustments.js');

class BankingProductMatchToolStandalone {
  constructor() {
    this.agentName = 'BankingProductMatchTool';
    this.POLICY_VERSION = 'v1.0';

    // Sprint 28: Initialize A/B testing helper
    this.abTesting = new ABTestingHelper('BankingProductMatchTool');

    // Sprint 28: Initialize rule engine for shadow mode comparison
    this.ruleEngine = null;
    this._initRuleEngine();

    // Load product catalog
    const catalogPath = path.join(__dirname, 'data', 'emiratesnbd-products.json');
    this.productCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    // Industry bonus multipliers (hidden from output)
    this.INDUSTRY_BONUSES = {
      'fintech': 15,
      'tech': 10,
      'technology': 10,
      'healthcare': 10,
      'aviation': 12,
      'hospitality': 8,
      'travel': 8,
      'construction': 5,
      'default': 0
    };

    // Signal strength multipliers (hidden from output)
    this.SIGNAL_MULTIPLIERS = {
      'expansion': 1.3,
      'hiring': 1.2,
      'funding': 1.4,
      'relocation': 1.3,
      'award': 1.1,
      'none': 1.0
    };

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(bankingProductMatchInputSchema);
    this.validateOutput = ajv.compile(bankingProductMatchOutputSchema);
  }

  /**
   * Initialize rule engine for shadow mode (Sprint 28)
   * @private
   */
  _initRuleEngine() {
    try {
      // Dynamic import for ES modules from CommonJS
      import('../agent-core/BankingProductMatchRuleEngineWrapper.js').then(module => {
        this.ruleEngine = new module.BankingProductMatchRuleEngineWrapper();
        console.log('[BankingProductMatch] Rule engine v1.0 initialized for shadow mode');
      }).catch(err => {
        console.warn('[BankingProductMatch] Rule engine not available:', err.message);
        this.ruleEngine = null;
      });
    } catch (error) {
      console.warn('[BankingProductMatch] Rule engine initialization failed:', error.message);
      this.ruleEngine = null;
    }
  }

  /**
   * Execute the tool with Sentry error tracking + Shadow Mode (Sprint 23) + A/B Testing (Sprint 28)
   * @param {Object} input - Company profile data
   * @returns {Promise<Object>} Product recommendations with fit scores (formula protected)
   */
  async execute(input) {
    const decisionId = uuidv4();

    try {
      // PHASE 1: Execute inline logic (primary - production path)
      const inlineResult = await this._executeInternal(input);

      // PHASE 2: A/B Testing - Select rule version (Sprint 28)
      const entityId = input.company_name || input.industry || 'default';
      const selectedVersion = this.abTesting.selectVersion(entityId);
      const distribution = this.abTesting.getDistribution(selectedVersion);

      // PHASE 3: Execute rule engine in parallel (Sprint 28 - shadow mode)
      let ruleResult = null;
      let comparison = null;

      if (this.ruleEngine) {
        try {
          ruleResult = await this.ruleEngine.execute(input);
          ruleResult._meta = ruleResult._meta || {};
          ruleResult._meta.version = selectedVersion;
          comparison = this._compareResults(inlineResult, ruleResult);
        } catch (ruleError) {
          console.error('[BankingProductMatch Rule Engine] Error:', ruleError.message);
          ruleResult = { error: ruleError.message };
          comparison = null;
        }
      }

      // PHASE 4: Shadow mode decision logging (Sprint 28 with rule engine + A/B tracking)
      this._logDecision(decisionId, input, inlineResult, ruleResult, comparison, distribution).catch(err => {
        // Silent failure - don't block production
        console.error('[BankingProductMatch Shadow Mode] Logging failed:', err.message);
      });

      // PHASE 5: Return inline result (production path unchanged)
      inlineResult._meta.decision_id = decisionId;
      inlineResult._meta.shadow_mode_active = !!this.ruleEngine;
      inlineResult._meta.ab_test_group = distribution.group;
      inlineResult._meta.rule_version = selectedVersion;

      return inlineResult;
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'BankingProductMatchTool',
          primitive: 'MATCH_BANKING_PRODUCTS',
          phase: 'Phase_1'
        },
        extra: {
          input: input,
          decisionId: decisionId,
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
    let confidence = 1.0;

    // Extract inputs
    const {
      company_size,
      industry = 'default',
      signals = [],
      uae_employees,
      average_salary_aed,
      segment,
      has_free_zone_license = false
    } = input;

    // Infer segment if not provided
    const inferredSegment = segment || this._inferSegment(company_size, average_salary_aed);

    // ═══════════════════════════════════════════════════════
    // PHASE 1: COLLECT ALL PRODUCTS
    // ═══════════════════════════════════════════════════════

    const allProducts = [
      ...this.productCatalog.salary_accounts,
      ...this.productCatalog.credit_cards,
      ...this.productCatalog.business_accounts,
      ...this.productCatalog.personal_loans,
      ...this.productCatalog.insurance_products
    ];

    // ═══════════════════════════════════════════════════════
    // PHASE 2: FILTER ELIGIBLE PRODUCTS
    // ═══════════════════════════════════════════════════════

    const eligibleProducts = allProducts.filter(product => {
      // Size eligibility
      if (!this._checkSizeEligibility(product, company_size)) {
        return false;
      }

      // Salary eligibility (for products with salary requirements)
      if (product.min_salary_aed !== null) {
        if (average_salary_aed < product.min_salary_aed ||
            (product.max_salary_aed && average_salary_aed > product.max_salary_aed)) {
          return false;
        }
      }

      // Segment match (flexible - allow adjacent segments)
      if (product.target_segment !== 'all') {
        const segmentMatch = this._checkSegmentCompatibility(product.target_segment, inferredSegment);
        if (!segmentMatch) {
          return false;
        }
      }

      return true;
    });

    if (eligibleProducts.length === 0) {
      confidence = 0.6; // Low confidence if no products match
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: CALCULATE FIT SCORES (FORMULA PROTECTED)
    // ═══════════════════════════════════════════════════════

    const scoredProducts = eligibleProducts.map(product => {
      const fitScore = this._calculateFitScore(product, {
        industry,
        signals,
        average_salary_aed,
        has_free_zone_license,
        company_size
      });

      return {
        product_id: product.product_id,
        product_name: product.product_name,
        product_category: product.product_category,
        fit_score: Math.round(fitScore),
        target_audience: this._getTargetAudience(inferredSegment, company_size),
        key_benefits: product.key_benefits || []
      };
    });

    // ═══════════════════════════════════════════════════════
    // PHASE 4: SORT AND SELECT TOP 5
    // ═══════════════════════════════════════════════════════

    scoredProducts.sort((a, b) => b.fit_score - a.fit_score);
    const topProducts = scoredProducts.slice(0, 5);

    // Add priority ranking
    const recommendedProducts = topProducts.map((product, index) => ({
      ...product,
      priority: index + 1
    }));

    // ═══════════════════════════════════════════════════════
    // PHASE 5: CONFIDENCE ADJUSTMENT
    // ═══════════════════════════════════════════════════════

    if (recommendedProducts.length === 0) {
      confidence = 0.5;
    } else if (recommendedProducts[0].fit_score < 60) {
      confidence *= 0.8;
    }

    if (!industry || industry === 'default') {
      confidence *= 0.9;
    }

    if (signals.length === 0) {
      confidence *= 0.85;
    }

    // Ensure confidence bounds
    confidence = Math.max(0.5, Math.min(1.0, confidence));

    // ═══════════════════════════════════════════════════════
    // PHASE 5.5: APPLY SCORING ADJUSTMENTS (Sprint 28)
    // ═══════════════════════════════════════════════════════

    let baseConfidence = confidence;  // Store original confidence
    let adjustment = null;

    try {
      // Get adjustment based on feedback for this tool/version
      const ruleVersion = this.POLICY_VERSION;
      adjustment = await scoringAdjustments.getAdjustment(this.agentName, ruleVersion);

      if (adjustment && adjustment.factor !== 0.0) {
        // Apply adjustment to confidence score
        confidence = scoringAdjustments.applyAdjustment(baseConfidence, adjustment);
      }
    } catch (error) {
      console.warn('[BankingProductMatchTool] Scoring adjustment failed:', error.message);
      // Continue with base confidence if adjustment fails
    }

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      recommended_products: recommendedProducts,
      confidence: parseFloat(confidence.toFixed(2)),
      timestamp: new Date().toISOString(),
      metadata: {
        confidenceLevel: confidence >= 0.85 ? 'HIGH' : confidence >= 0.65 ? 'MEDIUM' : 'LOW',
        segment_match: inferredSegment,
        total_products_considered: allProducts.length,
        scoringAdjustment: adjustment ? {  // Sprint 28: Track scoring adjustments
          applied: adjustment.factor !== 0.0,
          base_confidence: baseConfidence,
          adjusted_confidence: confidence,
          adjustment_factor: adjustment.factor,
          adjustment_confidence: adjustment.confidence,
          metadata: adjustment.metadata
        } : null
      },
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'match_banking_products',
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
   * Calculate fit score for a product (FORMULA PROTECTED)
   * @private
   */
  _calculateFitScore(product, context) {
    let score = product.base_fit_score;

    // Industry bonus (hidden calculation)
    const industryLower = context.industry.toLowerCase();
    const industryBonus = this.INDUSTRY_BONUSES[industryLower] || this.INDUSTRY_BONUSES['default'];

    // Check if product has specific industry bonus
    if (product.industry_bonus && product.industry_bonus[industryLower]) {
      score += product.industry_bonus[industryLower];
    } else if (industryBonus > 0) {
      score += industryBonus * 0.5; // General industry bonus
    }

    // Signal multiplier (hidden calculation)
    let signalMultiplier = 1.0;
    for (const signal of context.signals) {
      const multiplier = this.SIGNAL_MULTIPLIERS[signal] || this.SIGNAL_MULTIPLIERS['none'];
      signalMultiplier = Math.max(signalMultiplier, multiplier);
    }
    score *= signalMultiplier;

    // Salary alignment bonus (hidden calculation)
    if (product.min_salary_aed && context.average_salary_aed) {
      const salaryRatio = context.average_salary_aed / product.min_salary_aed;
      if (salaryRatio >= 1.5) {
        score += 5; // Well above minimum
      } else if (salaryRatio >= 1.2) {
        score += 3; // Comfortably above minimum
      }
    }

    // Free zone bonus (hidden calculation)
    if (context.has_free_zone_license && product.product_category === 'Business Banking') {
      score *= 1.1;
    }

    // Cap at 100
    return Math.min(score, 100);
  }

  /**
   * Check size eligibility
   * @private
   */
  _checkSizeEligibility(product, company_size) {
    return company_size >= product.company_size_min &&
           company_size <= product.company_size_max;
  }

  /**
   * Infer company segment from size and salary
   * @private
   */
  _inferSegment(company_size, average_salary_aed) {
    if (company_size < 10) {
      return 'startup';
    } else if (company_size < 50) {
      return 'sme';
    } else if (company_size < 500) {
      return 'mid-market';
    } else {
      return 'enterprise';
    }
  }

  /**
   * Check segment compatibility (allow adjacent segments)
   * @private
   */
  _checkSegmentCompatibility(productSegment, companySegment) {
    // Exact match
    if (productSegment === companySegment) return true;

    // Adjacent segment matches
    const adjacencyMap = {
      'entry_level': ['startup', 'sme'],
      'mid_market': ['sme', 'mid-market', 'mid_market'],
      'premium': ['mid-market', 'mid_market', 'enterprise'],
      'corporate': ['enterprise'],
      'sme': ['startup', 'sme', 'mid-market', 'mid_market']
    };

    const compatible = adjacencyMap[productSegment] || [];
    return compatible.includes(companySegment);
  }

  /**
   * Get target audience description
   * @private
   */
  _getTargetAudience(segment, company_size) {
    const segmentLabels = {
      'startup': `Startups (${company_size} employees)`,
      'sme': `Small-Medium Enterprises (${company_size} employees)`,
      'mid-market': `Mid-market companies (${company_size} employees)`,
      'mid_market': `Mid-market companies (${company_size} employees)`,
      'enterprise': `Enterprise organizations (${company_size}+ employees)`
    };
    return segmentLabels[segment] || `Companies with ${company_size} employees`;
  }

  /**
   * Compare inline result with rule engine result (Sprint 28)
   * @private
   */
  _compareResults(inlineResult, ruleResult) {
    if (!ruleResult || ruleResult.error) {
      return {
        match: false,
        reason: 'Rule engine error or unavailable',
        inline_products_count: inlineResult.recommended_products.length,
        rule_products_count: null
      };
    }

    const inlineProductIds = new Set(inlineResult.recommended_products.map(p => p.product_id));
    const ruleProductIds = new Set(ruleResult.recommended_products.map(p => p.product_id));

    // Calculate product overlap
    const overlap = [...inlineProductIds].filter(id => ruleProductIds.has(id)).length;
    const overlapPercentage = overlap / Math.max(inlineProductIds.size, ruleProductIds.size);

    // Check if top recommendations match
    const topInline = inlineResult.recommended_products[0]?.product_id;
    const topRule = ruleResult.recommended_products[0]?.product_id;
    const topMatch = topInline === topRule;

    const confidenceDiff = Math.abs(inlineResult.confidence - ruleResult.confidence);

    return {
      match: overlapPercentage >= 0.6 && topMatch,
      product_overlap_percentage: parseFloat(overlapPercentage.toFixed(2)),
      top_recommendation_match: topMatch,
      inline_products_count: inlineResult.recommended_products.length,
      rule_products_count: ruleResult.recommended_products.length,
      inline_top_product: topInline,
      rule_top_product: topRule,
      confidence_diff: parseFloat(confidenceDiff.toFixed(2)),
      reason: overlapPercentage >= 0.6 && topMatch ? 'Results match' : 'Results differ'
    };
  }

  /**
   * Log decision to database for shadow mode analysis (Sprint 23 + Sprint 28 A/B Testing)
   * @private
   */
  async _logDecision(decisionId, input, inlineResult, ruleResult, comparison, distribution) {
    // Import db module (use utils/db.js for CommonJS compatibility)
    const db = require('../../utils/db');

    try {
      // Log to agent_core.agent_decisions (Sprint 22 schema)
      await db.query(`
        INSERT INTO agent_core.agent_decisions (
          decision_id,
          tool_name,
          rule_name,
          rule_version,
          input_data,
          output_data,
          confidence_score,
          latency_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        decisionId,
        'BankingProductMatchTool',
        'match_banking_products',
        ruleResult?.version || distribution?.version || 'inline_only',  // Sprint 28: Track A/B test version
        input,  // input_data
        {
          inline: inlineResult,
          rule: ruleResult?.result || null,
          comparison: comparison,
          ab_test: distribution || null  // Sprint 28: Track A/B test group
        },  // output_data (contains inline result + A/B test tracking)
        inlineResult.confidence || null,
        inlineResult._meta.latency_ms || 0
      ]);
    } catch (error) {
      // Don't throw - logging is non-critical
      console.error('[BankingProductMatch] Failed to log decision:', error.message);
    }
  }
}

module.exports = BankingProductMatchToolStandalone;
