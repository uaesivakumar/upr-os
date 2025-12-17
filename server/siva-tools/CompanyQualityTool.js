/**
 * CompanyQualityTool - SIVA Decision Primitive 1
 *
 * Implements: EVALUATE_COMPANY_QUALITY (STRICT)
 *
 * Purpose: Score company fit using Siva's formula & factors
 * Type: STRICT (deterministic, no LLM calls)
 * SLA: ≤300ms P50, ≤900ms P95
 *
 * Phase 1 Reference: Decision Primitives §2, Primitive 1
 * Phase 2 Reference: MCP Tool Registry §1, Tool 1
 */

const AgentProtocolModule = require('../protocols/AgentProtocol');
const AgentProtocol = AgentProtocolModule.default || AgentProtocolModule;
const { companyQualityInputSchema, companyQualityOutputSchema } = require('./schemas/companyQualitySchemas');
const { v4: uuidv4 } = require('uuid');

// Sprint 22: Rule engine integration (shadow mode)
let ruleEngine = null;
try {
  const { RuleEngine } = require('../agent-core/rule-engine.js');
  const path = require('path');
  const rulesPath = path.join(__dirname, '../agent-core/cognitive_extraction_logic_v2.0.json');
  ruleEngine = new RuleEngine(rulesPath);
  console.log('✅ CompanyQualityTool: Rule engine v2.0 loaded in shadow mode');
} catch (error) {
  console.warn('⚠️  CompanyQualityTool: Rule engine v2.0 not available, using inline logic only', error.message);
}

class CompanyQualityTool extends AgentProtocol {
  constructor() {
    super({
      agentName: 'CompanyQualityTool',
      inputSchema: companyQualityInputSchema,
      outputSchema: companyQualityOutputSchema,
      timeout: 2000, // STRICT tool: 2s max
      retryOptions: {
        maxRetries: 0, // No retries for deterministic tools
        retryDelay: 0
      }
    });

    // Enterprise brands to auto-skip (Phase 1: Edge Cases)
    this.ENTERPRISE_BRANDS = [
      'Etihad', 'Emirates', 'ADNOC', 'Emaar', 'DP World',
      'etihad', 'emirates', 'adnoc', 'emaar', 'dp world'
    ];

    // High-value industries (Phase 1: Primitive 1)
    this.HIGH_VALUE_INDUSTRIES = [
      'FinTech', 'fintech', 'Technology', 'technology', 'tech',
      'Healthcare', 'healthcare', 'Health Tech', 'healthtech'
    ];

    // Policy version from persona spec
    this.POLICY_VERSION = 'v1.0';
  }

  /**
   * Main execution logic - implements EVALUATE_COMPANY_QUALITY
   * Sprint 22: Shadow mode - runs both inline + rule engine, logs both, returns inline
   *
   * @param {Object} input - Company data
   * @param {Object} context - Execution context
   * @returns {Object} - Quality score with reasoning
   */
  async run(input, context = {}) {
    const decisionId = uuidv4(); // Sprint 22: Unique ID for decision logging
    const startTime = Date.now();

    // PHASE 1: Execute inline logic (PRIMARY - production)
    const inlineResult = await this._executeInlineLogic(input, startTime);

    // PHASE 2: Execute rule engine logic (SHADOW - testing)
    let ruleResult = null;
    let comparison = null;

    if (ruleEngine) {
      try {
        const ruleStartTime = Date.now();
        ruleResult = await ruleEngine.execute('evaluate_company_quality', input);
        ruleResult.executionTimeMs = Date.now() - ruleStartTime;

        // Compare results
        comparison = this._compareResults(inlineResult, ruleResult);
      } catch (error) {
        console.error('Rule engine execution error:', error);
        comparison = { error: error.message };
      }
    }

    // PRD v1.2 Law 3: "SIVA never mutates the world"
    // Decision logging is handled by OS layer via agentDecisionLogger
    // See: os/persistence/agentDecisionLogger.js

    // PHASE 4: Return inline result (production)
    inlineResult._meta.decision_id = decisionId;
    inlineResult._meta.shadow_mode_active = !!ruleEngine;

    return inlineResult;
  }

  /**
   * Execute inline logic (original implementation)
   * @private
   */
  async _executeInlineLogic(input, startTime) {
    const reasoning = [];
    const edgeCasesApplied = [];
    let quality = 0;
    let confidence = 1.0;

    // Extract inputs
    const {
      company_name,
      domain,
      industry,
      uae_signals,
      size_bucket,
      size,
      salary_indicators = {},
      license_type,
      sector
    } = input;

    // ═══════════════════════════════════════════════════════
    // PHASE 1: BASE QUALITY SCORING
    // ═══════════════════════════════════════════════════════

    // Factor 1: Salary Level + UAE Presence (Phase 1: Line 32-33)
    const salaryLevel = salary_indicators.salary_level || this._inferSalaryLevel(salary_indicators);
    const uaePresence = this._calculateUAEPresence(uae_signals);

    if (salaryLevel === 'high' && uaePresence === 'strong') {
      quality += 40;
      reasoning.push({
        factor: 'Salary & UAE Presence',
        points: 40,
        explanation: 'High salary level with strong UAE presence - excellent quality indicator'
      });
    } else if (salaryLevel === 'high') {
      quality += 25;
      reasoning.push({
        factor: 'Salary Level',
        points: 25,
        explanation: 'High salary level without confirmed UAE presence'
      });
      confidence -= 0.1; // Lower confidence without UAE confirmation
    } else if (uaePresence === 'strong') {
      quality += 20;
      reasoning.push({
        factor: 'UAE Presence',
        points: 20,
        explanation: 'Strong UAE presence confirmed'
      });
    }

    // Factor 2: Company Size Sweet Spot (Phase 1: Line 35)
    if (size && size >= 50 && size <= 500) {
      quality += 20;
      reasoning.push({
        factor: 'Company Size',
        points: 20,
        explanation: `${size} employees - ideal sweet spot (50-500)`
      });
    } else if (size_bucket === 'scaleup' || size_bucket === 'midsize') {
      quality += 15;
      reasoning.push({
        factor: 'Company Size',
        points: 15,
        explanation: `${size_bucket} category - good fit`
      });
    } else if (size && size < 50) {
      quality += 10;
      reasoning.push({
        factor: 'Company Size',
        points: 10,
        explanation: `${size} employees - small but acceptable`
      });
    } else if (size_bucket === 'enterprise') {
      quality += 5;
      reasoning.push({
        factor: 'Company Size',
        points: 5,
        explanation: 'Enterprise size - may have complex processes'
      });
      confidence -= 0.05;
    }

    // Factor 3: Industry Bonus (Phase 1: Line 37)
    if (this._isHighValueIndustry(industry)) {
      quality += 15;
      reasoning.push({
        factor: 'Industry',
        points: 15,
        explanation: `${industry} - high-value industry with quality hiring needs`
      });
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 2: EDGE CASES (Phase 1: Primitive 4)
    // ═══════════════════════════════════════════════════════

    let adjustmentFactor = 1.0;

    // Edge Case 1: Enterprise Brands (Phase 1: Line 74-75)
    if (this._isEnterpriseBrand(company_name)) {
      adjustmentFactor *= 0.1;
      edgeCasesApplied.push('ENTERPRISE_BRAND_EXCLUSION');
      reasoning.push({
        factor: 'Edge Case: Enterprise Brand',
        points: 0,
        explanation: `${company_name} is a major enterprise brand - auto-skip (×0.1)`
      });
      confidence = 0.95; // High confidence in this rejection
    }

    // Edge Case 2: Government Sector (Phase 1: Line 77)
    if (sector && sector.toLowerCase().includes('government')) {
      adjustmentFactor *= 0.05;
      edgeCasesApplied.push('GOVERNMENT_SECTOR_EXCLUSION');
      reasoning.push({
        factor: 'Edge Case: Government',
        points: 0,
        explanation: 'Government sector - auto-skip (×0.05)'
      });
      confidence = 0.95;
    }

    // Edge Case 3: Free Zone License (Phase 1: Line 79)
    if (license_type && license_type.toLowerCase().includes('free zone')) {
      adjustmentFactor *= 1.3;
      edgeCasesApplied.push('FREE_ZONE_BONUS');
      reasoning.push({
        factor: 'Edge Case: Free Zone',
        points: Math.round(quality * 0.3),
        explanation: 'Free Zone license - 30% quality bonus (×1.3)'
      });
    }

    // Apply adjustment factor
    quality = Math.round(quality * adjustmentFactor);

    // ═══════════════════════════════════════════════════════
    // PHASE 3: NORMALIZATION & CONFIDENCE
    // ═══════════════════════════════════════════════════════

    // Normalize to 0-100 (Phase 1: Line 39)
    quality = Math.min(100, Math.max(0, quality));

    // Adjust confidence based on data completeness
    if (!salary_indicators.salary_level && !salary_indicators.avg_salary) {
      confidence -= 0.15;
    }
    if (!uae_signals.has_ae_domain && !uae_signals.has_uae_address) {
      confidence -= 0.15;
    }
    if (!size && !size_bucket) {
      confidence -= 0.1;
    }

    // Ensure confidence bounds
    confidence = Math.min(1.0, Math.max(0.0, confidence));

    // Track execution time (should be ≤300ms P50)
    const latencyMs = Date.now() - startTime;
    this.trackCost(0.0001); // Negligible cost for STRICT tool

    return {
      quality_score: quality,
      reasoning,
      confidence: parseFloat(confidence.toFixed(2)),
      policy_version: this.POLICY_VERSION,
      timestamp: new Date().toISOString(),
      edge_cases_applied: edgeCasesApplied,
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'evaluate_company_quality',
        tool_type: 'STRICT'
      }
    };
  }

  /**
   * Calculate UAE presence strength
   * @private
   */
  _calculateUAEPresence(uaeSignals) {
    const { has_ae_domain, has_uae_address, linkedin_location } = uaeSignals;

    if (has_ae_domain && has_uae_address) {
      return 'strong';
    }
    if (has_ae_domain || has_uae_address) {
      return 'moderate';
    }
    if (linkedin_location && linkedin_location.toLowerCase().includes('uae')) {
      return 'weak';
    }
    return 'none';
  }

  /**
   * Infer salary level from indicators
   * @private
   */
  _inferSalaryLevel(salaryIndicators) {
    const { avg_salary, job_posting_salaries } = salaryIndicators;

    if (avg_salary) {
      if (avg_salary >= 15000) return 'high';
      if (avg_salary >= 8000) return 'medium';
      return 'low';
    }

    if (job_posting_salaries && job_posting_salaries.length > 0) {
      const avgPosting = job_posting_salaries.reduce((a, b) => a + b, 0) / job_posting_salaries.length;
      if (avgPosting >= 15000) return 'high';
      if (avgPosting >= 8000) return 'medium';
      return 'low';
    }

    return 'unknown';
  }

  /**
   * Check if industry is high-value
   * @private
   */
  _isHighValueIndustry(industry) {
    return this.HIGH_VALUE_INDUSTRIES.some(hvi =>
      industry.toLowerCase().includes(hvi.toLowerCase())
    );
  }

  /**
   * Check if company is an enterprise brand to skip
   * @private
   */
  _isEnterpriseBrand(companyName) {
    return this.ENTERPRISE_BRANDS.some(brand =>
      companyName.toLowerCase().includes(brand.toLowerCase())
    );
  }

  /**
   * Compare inline and rule engine results
   * Sprint 22: Shadow mode comparison
   * @private
   */
  _compareResults(inlineResult, ruleResult) {
    if (!ruleResult || ruleResult.error) {
      return { match: false, error: ruleResult?.error };
    }

    const scoreDiff = Math.abs(inlineResult.quality_score - ruleResult.result.score);
    const confidenceDiff = Math.abs(inlineResult.confidence - ruleResult.result.confidence);

    return {
      match: scoreDiff <= 5 && confidenceDiff <= 0.1, // Allow 5-point score diff, 10% confidence diff
      score_diff: scoreDiff,
      confidence_diff: confidenceDiff,
      inline_score: inlineResult.quality_score,
      rule_score: ruleResult.result.score,
      inline_confidence: inlineResult.confidence,
      rule_confidence: ruleResult.result.confidence,
      execution_time_diff: inlineResult._meta.latency_ms - ruleResult.executionTimeMs
    };
  }

  // NOTE: _logDecision method REMOVED per PRD v1.2 Law 3
  // "SIVA never mutates the world" - OS layer handles persistence
}

module.exports = CompanyQualityTool;
