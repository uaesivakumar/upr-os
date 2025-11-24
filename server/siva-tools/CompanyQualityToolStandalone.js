/**
 * CompanyQualityTool - SIVA Decision Primitive 1 (Standalone) - v2.0
 *
 * Implements: EVALUATE_COMPANY_QUALITY (STRICT)
 *
 * Purpose: Score company fit using competitive algorithm (PROTECTED)
 * Type: STRICT (deterministic, no LLM calls)
 * SLA: ≤300ms P50, ≤900ms P95
 *
 * v2.0 Changes:
 * - Natural language reasoning (no formula exposure)
 * - keyFactors array instead of scoreBreakdown
 * - Sentry error tracking
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const { companyQualityInputSchema, companyQualityOutputSchema } = require('./schemas/companyQualitySchemas');
const { v4: uuidv4 } = require('uuid');

// Sprint 27: A/B Testing support
const { ABTestingHelper } = require('../agent-core/ab-testing.js');

// Sprint 28: Scoring adjustments based on feedback
const scoringAdjustments = require('../agent-core/scoring-adjustments.js');

// Sprint 22: Rule engine integration (shadow mode)
// Sprint 27: Rule engine now supports dynamic version loading via A/B testing
let ruleEngine = null;
const { RuleEngine } = require('../agent-core/rule-engine.js');

try {
  // Note: Rule engine will be initialized per-request with A/B test version
  console.log('✅ CompanyQualityToolStandalone: Rule engine available with A/B testing support');
} catch (error) {
  console.warn('⚠️  CompanyQualityToolStandalone: Rule engine not available, using inline logic only', error.message);
}

class CompanyQualityToolStandalone {
  constructor() {
    this.agentName = 'CompanyQualityTool';
    this.POLICY_VERSION = 'v2.0'; // Updated for natural language reasoning

    // Sprint 27: Initialize A/B testing helper
    this.abTesting = new ABTestingHelper('CompanyQualityTool');

    // Enterprise detection threshold (auto-detect based on size, not hardcoded brands)
    // Configuration: Companies with 10,000+ employees are considered enterprises
    this.ENTERPRISE_SIZE_THRESHOLD = parseInt(process.env.ENTERPRISE_SIZE_THRESHOLD || '10000');

    // High-value industries (Phase 1: Primitive 1)
    this.HIGH_VALUE_INDUSTRIES = [
      'FinTech', 'fintech', 'Technology', 'technology', 'tech',
      'Healthcare', 'healthcare', 'Health Tech', 'healthtech'
    ];

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(companyQualityInputSchema);
    this.validateOutput = ajv.compile(companyQualityOutputSchema);
  }

  /**
   * Execute the tool with Sentry error tracking
   * Sprint 22: Shadow mode - runs both inline + rule engine, logs both, returns inline
   * Sprint 27: A/B testing - selects rule version dynamically
   * @param {Object} input - Company data
   * @returns {Promise<Object>} Quality score with natural language reasoning
   */
  async execute(input) {
    const decisionId = uuidv4(); // Sprint 22: Unique ID for decision logging

    try {
      // PHASE 1: Execute inline logic (PRIMARY - production)
      const inlineResult = await this._executeInternal(input);

      // PHASE 2: A/B Testing - Select rule version (Sprint 27)
      const entityId = input.company_name || input.domain || 'default';
      const selectedVersion = this.abTesting.selectVersion(entityId);
      const distribution = this.abTesting.getDistribution(selectedVersion);

      // PHASE 3: Execute rule engine logic with selected version (SHADOW - testing)
      let ruleResult = null;
      let comparison = null;

      if (RuleEngine) {
        try {
          const path = require('path');
          const rulesPath = path.join(__dirname, `../agent-core/cognitive_extraction_logic_${selectedVersion}.json`);

          // Check if rule file exists
          const fs = require('fs');
          if (fs.existsSync(rulesPath)) {
            const ruleEngineInstance = new RuleEngine(rulesPath);
            const ruleStartTime = Date.now();
            ruleResult = await ruleEngineInstance.execute('evaluate_company_quality', input);
            ruleResult.executionTimeMs = Date.now() - ruleStartTime;
            ruleResult.version = selectedVersion;

            // Compare results
            comparison = this._compareResults(inlineResult, ruleResult);
          } else {
            console.warn(`Rule file not found for version ${selectedVersion}: ${rulesPath}`);
            comparison = { error: `Rule file not found: ${selectedVersion}` };
          }
        } catch (error) {
          console.error('Rule engine execution error:', error);
          comparison = { error: error.message };
        }
      }

      // PHASE 4: Log decision (async, non-blocking)
      this._logDecision(decisionId, input, inlineResult, ruleResult, comparison, distribution).catch(err => {
        console.error('Decision logging error:', err);
      });

      // PHASE 5: Return inline result (production)
      inlineResult._meta.decision_id = decisionId;
      inlineResult._meta.shadow_mode_active = !!RuleEngine;
      inlineResult._meta.ab_test_group = distribution.group;
      inlineResult._meta.rule_version = selectedVersion;

      return inlineResult;

    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'CompanyQualityTool',
          primitive: 'EVALUATE_COMPANY_QUALITY',
          phase: 'Phase_1'
        },
        extra: {
          input: input,
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
    const keyFactors = []; // Replace scoreBreakdown with keyFactors
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
    // PHASE 1: BASE QUALITY SCORING (Competitive Algorithm)
    // ═══════════════════════════════════════════════════════

    // Factor 1: Salary Level + UAE Presence
    const salaryLevel = salary_indicators.salary_level || this._inferSalaryLevel(salary_indicators);
    const uaePresence = this._calculateUAEPresence(uae_signals);

    if (salaryLevel === 'high' && uaePresence === 'strong') {
      quality += 40;
      keyFactors.push('UAE_VERIFIED', 'HIGH_SALARY');
    } else if (salaryLevel === 'high') {
      quality += 25;
      keyFactors.push('HIGH_SALARY');
      confidence -= 0.1;
    } else if (uaePresence === 'strong') {
      quality += 20;
      keyFactors.push('UAE_VERIFIED');
    } else if (salaryLevel === 'medium' && uaePresence === 'moderate') {
      quality += 15;
      keyFactors.push('UAE_MODERATE', 'MEDIUM_SALARY');
      confidence -= 0.05;
    }

    // Factor 2: Company Size Sweet Spot
    if (size && size >= 50 && size <= 500) {
      quality += 20;
      keyFactors.push('SIZE_OPTIMAL');
    } else if (size_bucket === 'scaleup' || size_bucket === 'midsize') {
      quality += 15;
      keyFactors.push('SIZE_GOOD');
    } else if (size && size < 50) {
      quality += 10;
      keyFactors.push('SIZE_SMALL');
    } else if (size_bucket === 'enterprise') {
      quality += 5;
      keyFactors.push('SIZE_LARGE');
      confidence -= 0.05;
    }

    // Factor 3: Industry Bonus
    if (this._isHighValueIndustry(industry)) {
      quality += 15;
      keyFactors.push(`${industry.toUpperCase().replace(/\s+/g, '_')}_SECTOR`);
    }

    // Factor 4: Domain verification
    if (domain && domain.endsWith('.ae')) {
      quality += 10;
      keyFactors.push('DOMAIN_VERIFIED');
    } else if (domain) {
      quality += 5;
      keyFactors.push('DOMAIN_PRESENT');
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 2: EDGE CASES (Adjustments)
    // ═══════════════════════════════════════════════════════

    let adjustmentFactor = 1.0;

    // Edge Case 1: Enterprise Size Detection (auto-detect based on employee count)
    if (this._isEnterpriseSize(size)) {
      adjustmentFactor *= 0.1;
      edgeCasesApplied.push('ENTERPRISE_SIZE_EXCLUSION');
      keyFactors.push('ENTERPRISE_SCALE');
      confidence = 0.95;
    }

    // Edge Case 2: Government Sector
    if (sector && sector.toLowerCase().includes('government')) {
      adjustmentFactor *= 0.05;
      edgeCasesApplied.push('GOVERNMENT_SECTOR_EXCLUSION');
      keyFactors.push('GOVERNMENT_SECTOR');
      confidence = 0.95;
    }

    // Edge Case 3: Free Zone License
    if (license_type && license_type.toLowerCase().includes('free zone')) {
      adjustmentFactor *= 1.3;
      edgeCasesApplied.push('FREE_ZONE_BONUS');
      keyFactors.push('FREE_ZONE');
    }

    // Apply adjustment factor
    quality = Math.round(quality * adjustmentFactor);

    // ═══════════════════════════════════════════════════════
    // PHASE 3: NORMALIZATION & CONFIDENCE
    // ═══════════════════════════════════════════════════════

    // Normalize to 0-100
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

    // ═══════════════════════════════════════════════════════
    // PHASE 3.5: APPLY SCORING ADJUSTMENTS (Sprint 28)
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
      console.warn('[CompanyQualityTool] Scoring adjustment failed:', error.message);
      // Continue with base confidence if adjustment fails
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 4: NATURAL LANGUAGE REASONING (No Formula)
    // ═══════════════════════════════════════════════════════

    const reasoning = this._buildNaturalLanguageReasoning({
      quality,
      salaryLevel,
      uaePresence,
      size,
      size_bucket,
      industry,
      domain,
      license_type,
      company_name,
      sector,
      adjustmentFactor,
      keyFactors
    });

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      quality_score: quality,
      reasoning, // Now a natural language string, not formula
      confidence: parseFloat(confidence.toFixed(2)),
      policy_version: this.POLICY_VERSION,
      timestamp: new Date().toISOString(),
      metadata: {
        keyFactors, // Replace scoreBreakdown with keyFactors
        confidenceLevel: confidence >= 0.9 ? 'HIGH' : confidence >= 0.75 ? 'MEDIUM' : 'LOW',
        edgeCasesApplied,
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
        tool_name: 'evaluate_company_quality',
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
   * Build natural language reasoning (NO FORMULA EXPOSURE)
   * @private
   */
  _buildNaturalLanguageReasoning(components) {
    const {
      quality,
      salaryLevel,
      uaePresence,
      size,
      size_bucket,
      industry,
      domain,
      license_type,
      company_name,
      sector,
      adjustmentFactor,
      keyFactors
    } = components;

    const statements = [];

    // Statement 1: UAE Presence + Salary
    if (salaryLevel === 'high' && uaePresence === 'strong') {
      statements.push('Strong UAE operational presence with verified local footprint and high-quality salary indicators');
    } else if (salaryLevel === 'high') {
      statements.push('High-quality salary indicators suggest strong employee value proposition');
    } else if (uaePresence === 'strong') {
      statements.push('Strong UAE operational presence with verified local footprint');
    } else if (salaryLevel === 'medium' && uaePresence === 'moderate') {
      statements.push('Moderate UAE presence with acceptable salary levels');
    } else if (uaePresence === 'moderate') {
      statements.push('UAE presence confirmed through available signals');
    } else if (uaePresence === 'weak') {
      statements.push('Limited UAE operational signals detected');
    }

    // Statement 2: Company Size
    if (size && size >= 50 && size <= 500) {
      statements.push('Company size aligns well with relationship banking model');
    } else if (size_bucket === 'scaleup' || size_bucket === 'midsize') {
      statements.push('Company size suitable for employee banking services');
    } else if (size && size < 50) {
      statements.push('Small company size provides good accessibility to decision makers');
    } else if (size_bucket === 'enterprise') {
      statements.push('Large organization with potentially complex procurement processes');
    }

    // Statement 3: Industry
    if (this._isHighValueIndustry(industry)) {
      statements.push(`${industry} sector demonstrates high engagement potential and quality hiring needs`);
    }

    // Statement 4: Domain verification
    if (domain && domain.endsWith('.ae')) {
      statements.push('Domain verification confirms UAE business registration');
    }

    // Statement 5: Edge cases
    if (license_type && license_type.toLowerCase().includes('free zone')) {
      statements.push('Free zone license provides favorable business environment');
    }

    if (this._isEnterpriseSize(size)) {
      statements.push(`Large enterprise scale (${size}+ employees) - existing banking relationships likely, conversion probability low`);
    }

    if (sector && sector.toLowerCase().includes('government')) {
      statements.push('Government sector entity - ENBD policy restricts direct employee banking outreach');
    }

    // Build final reasoning
    if (statements.length === 0) {
      return 'Limited qualifying factors detected. Company does not meet minimum criteria for relationship banking opportunity.';
    }

    return statements.join('. ') + '.';
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
   * Check if company is enterprise-scale based on employee count
   * Auto-detect enterprises (10,000+ employees by default)
   * Configurable via ENTERPRISE_SIZE_THRESHOLD environment variable
   * @private
   */
  _isEnterpriseSize(employeeCount) {
    if (!employeeCount || typeof employeeCount !== 'number') {
      return false;
    }
    return employeeCount >= this.ENTERPRISE_SIZE_THRESHOLD;
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

  /**
   * Log decision to database for analysis
   * Sprint 22: Decision logging
   * Sprint 27: A/B test tracking
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
        'CompanyQualityTool',
        'evaluate_company_quality',
        ruleResult?.version || distribution?.version || 'v2.0',
        input,  // input_data
        {
          inline: inlineResult,
          rule: ruleResult?.result || null,
          comparison: comparison,
          ab_test: distribution || null  // Sprint 27: Track A/B test group
        },  // output_data (contains both inline and rule results)
        inlineResult.confidence || null,
        inlineResult._meta.latency_ms || 0
      ]);
    } catch (error) {
      // Don't throw - logging is non-critical
      console.error('Failed to log decision:', error.message);
    }
  }
}

module.exports = CompanyQualityToolStandalone;
