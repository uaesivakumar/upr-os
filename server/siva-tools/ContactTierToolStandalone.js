/**
 * ContactTierTool - SIVA Decision Primitive 2 (Standalone) - v2.0
 *
 * Implements: SELECT_CONTACT_TIER (STRICT)
 *
 * Purpose: Map company profile to target job titles and tier classification
 * Type: STRICT (deterministic, no LLM calls)
 * SLA: ≤200ms P50, ≤600ms P95
 *
 * v2.0 Changes:
 * - Outcome only (NO reasoning field - competitive algorithm protected)
 * - Removed score_breakdown from metadata
 * - Added confidenceLevel classification (HIGH/MEDIUM/LOW)
 * - Sentry error tracking
 *
 * Phase 1 Reference: Decision Primitives §2, Primitive 2
 * Phase 2 Reference: MCP Tool Registry §1, Tool 2
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const { contactTierInputSchema, contactTierOutputSchema } = require('./schemas/contactTierSchemas');
const { v4: uuidv4 } = require('uuid');

// Sprint 28: A/B Testing support
const { ABTestingHelper } = require('../agent-core/ab-testing.js');

// Sprint 28: Scoring adjustments based on feedback
const scoringAdjustments = require('../agent-core/scoring-adjustments.js');

class ContactTierToolStandalone {
  constructor() {
    this.agentName = 'ContactTierTool';
    this.POLICY_VERSION = 'v2.0'; // Updated for outcome-only (no reasoning)

    // Sprint 28: Initialize A/B testing helper
    this.abTesting = new ABTestingHelper('ContactTierTool');

    // Sprint 24: Initialize rule engine for shadow mode comparison
    this.ruleEngineV2 = null;
    this._initRuleEngine();

    // Department keywords for classification
    this.DEPT_KEYWORDS = {
      HR: ['hr', 'human resources', 'people', 'talent', 'recruitment', 'recruiting'],
      Finance: ['finance', 'financial', 'accounting', 'treasury', 'payroll'],
      Admin: ['admin', 'administration', 'operations', 'office manager'],
      'C-Suite': ['ceo', 'cfo', 'coo', 'cto', 'founder', 'president', 'chief']
    };

    // Seniority keywords for classification
    this.SENIORITY_KEYWORDS = {
      'C-Level': ['ceo', 'cfo', 'coo', 'cto', 'chief', 'founder', 'president', 'managing director'],
      'VP': ['vp', 'vice president', 'svp', 'senior vice president', 'evp', 'executive vice president'],
      'Director': ['director', 'head of', 'lead'],
      'Manager': ['manager', 'mgr', 'supervisor', 'team lead'],
      'Individual': ['specialist', 'coordinator', 'analyst', 'associate', 'executive', 'officer']
    };

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(contactTierInputSchema);
    this.validateOutput = ajv.compile(contactTierOutputSchema);
  }

  /**
   * Initialize rule engine for shadow mode (Sprint 24)
   * @private
   */
  _initRuleEngine() {
    try {
      // Dynamic import for ES modules from CommonJS
      import('../agent-core/ContactTierRuleEngineV2.js').then(module => {
        this.ruleEngineV2 = new module.ContactTierRuleEngineV2();
        console.log('[ContactTier] Rule engine v2.0 initialized for shadow mode');
      }).catch(err => {
        console.warn('[ContactTier] Rule engine not available:', err.message);
        this.ruleEngineV2 = null;
      });
    } catch (error) {
      console.warn('[ContactTier] Rule engine initialization failed:', error.message);
      this.ruleEngineV2 = null;
    }
  }

  /**
   * Execute the tool with Sentry error tracking + Shadow Mode (Sprint 24) + A/B Testing (Sprint 28)
   * @param {Object} input - Contact data
   * @returns {Promise<Object>} Tier classification (outcome only - NO reasoning)
   */
  async execute(input) {
    const decisionId = uuidv4();

    try {
      // PHASE 1: Execute inline logic (primary - production path)
      const inlineResult = await this._executeInternal(input);

      // PHASE 2: A/B Testing - Select rule version (Sprint 28)
      const entityId = input.title || input.company_name || 'default';
      const selectedVersion = this.abTesting.selectVersion(entityId);
      const distribution = this.abTesting.getDistribution(selectedVersion);

      // PHASE 3: Execute rule engine in parallel (Sprint 24 - shadow mode)
      let ruleResult = null;
      let comparison = null;

      if (this.ruleEngineV2) {
        try {
          ruleResult = await this.ruleEngineV2.execute(input);
          ruleResult._meta = ruleResult._meta || {};
          ruleResult._meta.version = selectedVersion;
          comparison = this._compareResults(inlineResult, ruleResult);
        } catch (ruleError) {
          console.error('[ContactTier Rule Engine] Error:', ruleError.message);
          ruleResult = { error: ruleError.message };
          comparison = null;
        }
      }

      // PHASE 4: Shadow mode decision logging (Sprint 24 + Sprint 28 A/B tracking)
      this._logDecision(decisionId, input, inlineResult, ruleResult, comparison, distribution).catch(err => {
        // Silent failure - don't block production
        console.error('[ContactTier Shadow Mode] Logging failed:', err.message);
      });

      // PHASE 5: Return inline result (production path unchanged)
      inlineResult._meta.decision_id = decisionId;
      inlineResult._meta.shadow_mode_active = !!this.ruleEngineV2;
      inlineResult._meta.ab_test_group = distribution.group;
      inlineResult._meta.rule_version = selectedVersion;

      return inlineResult;
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'ContactTierTool',
          primitive: 'SELECT_CONTACT_TIER',
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
    const metadata = {};

    // Extract inputs
    const {
      title,
      department,
      seniority_level,
      company_size,
      hiring_velocity_monthly = 0,
      company_maturity_years = 0
    } = input;

    // Infer seniority and department if not provided
    const inferredSeniority = seniority_level || this._inferSeniority(title);
    const inferredDepartment = department || this._inferDepartment(title);

    if (!seniority_level) {
      metadata.inferred_seniority = inferredSeniority;
    }
    if (!department) {
      metadata.inferred_department = inferredDepartment;
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 1: SCORING (Internal - not exposed in output)
    // ═══════════════════════════════════════════════════════

    // Score 1: Seniority (0-40 points)
    const seniorityScore = this._scoreSeniority(inferredSeniority);

    // Score 2: Department (0-30 points)
    const departmentScore = this._scoreDepartment(inferredDepartment);

    // Score 3: Company Size (0-30 points)
    const companySizeScore = this._scoreCompanySize(company_size);

    // Total score (0-100) - used for internal classification only
    const totalScore = seniorityScore + departmentScore + companySizeScore;

    // ═══════════════════════════════════════════════════════
    // PHASE 2: TIER CLASSIFICATION
    // ═══════════════════════════════════════════════════════

    const { tier, priority } = this._classifyTier(
      totalScore,
      inferredSeniority,
      inferredDepartment,
      company_size
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 3: TARGET TITLES RECOMMENDATION
    // ═══════════════════════════════════════════════════════

    const { target_titles, fallback_titles } = this._recommendTitles(
      company_size,
      company_maturity_years,
      hiring_velocity_monthly
    );

    // ═══════════════════════════════════════════════════════
    // PHASE 4: CONFIDENCE CALCULATION
    // ═══════════════════════════════════════════════════════

    let confidence = 1.0;

    // Lower confidence if we had to infer seniority
    if (!seniority_level) {
      confidence -= 0.15;
    }

    // Lower confidence if we had to infer department
    if (!department) {
      confidence -= 0.1;
    }

    // Lower confidence for ambiguous titles
    if (title.split(' ').length <= 1) {
      confidence -= 0.1;
    }

    // Ensure confidence bounds
    confidence = Math.min(1.0, Math.max(0.0, confidence));

    // ═══════════════════════════════════════════════════════
    // PHASE 4.5: APPLY SCORING ADJUSTMENTS (Sprint 28)
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
      console.warn('[ContactTierTool] Scoring adjustment failed:', error.message);
      // Continue with base confidence if adjustment fails
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 5: CONFIDENCE LEVEL CLASSIFICATION
    // ═══════════════════════════════════════════════════════

    metadata.confidenceLevel = confidence >= 0.9 ? 'HIGH' : confidence >= 0.75 ? 'MEDIUM' : 'LOW';

    // Sprint 28: Track scoring adjustment in metadata
    if (adjustment) {
      metadata.scoringAdjustment = {
        applied: adjustment.factor !== 0.0,
        base_confidence: baseConfidence,
        adjusted_confidence: confidence,
        adjustment_factor: adjustment.factor,
        adjustment_confidence: adjustment.confidence,
        metadata: adjustment.metadata
      };
    }

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      tier,
      priority,
      confidence: parseFloat(confidence.toFixed(2)),
      timestamp: new Date().toISOString(),
      target_titles,
      fallback_titles,
      metadata,
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'select_contact_tier',
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
   * Infer seniority level from title
   * @private
   */
  _inferSeniority(title) {
    const lowerTitle = title.toLowerCase();

    for (const [level, keywords] of Object.entries(this.SENIORITY_KEYWORDS)) {
      if (keywords.some(keyword => lowerTitle.includes(keyword))) {
        return level;
      }
    }

    return 'Unknown';
  }

  /**
   * Infer department from title
   * @private
   */
  _inferDepartment(title) {
    const lowerTitle = title.toLowerCase();

    for (const [dept, keywords] of Object.entries(this.DEPT_KEYWORDS)) {
      if (keywords.some(keyword => lowerTitle.includes(keyword))) {
        return dept;
      }
    }

    return 'Other';
  }

  /**
   * Score seniority level (0-40 points)
   * @private
   */
  _scoreSeniority(seniority) {
    const scores = {
      'C-Level': 40,
      'VP': 35,
      'Director': 30,
      'Manager': 20,
      'Individual': 10,
      'Unknown': 5
    };

    return scores[seniority] || 0;
  }

  /**
   * Score department (0-30 points)
   * @private
   */
  _scoreDepartment(department) {
    const scores = {
      'HR': 30,
      'Finance': 25,
      'Admin': 20,
      'C-Suite': 30,
      'Other': 10
    };

    return scores[department] || 0;
  }

  /**
   * Score company size (0-30 points)
   * Phase 1 Logic: Small companies get higher scores (more accessible)
   * @private
   */
  _scoreCompanySize(size) {
    if (size < 50) {
      return 30; // Startups - very accessible
    } else if (size < 200) {
      return 25; // Small companies - accessible
    } else if (size < 500) {
      return 20; // Mid-size - moderate
    } else if (size < 1000) {
      return 15; // Large - less accessible
    } else {
      return 10; // Enterprise - difficult
    }
  }

  /**
   * Classify tier based on total score and specific rules
   * v2.0: Outcome only - NO reasoning exposed (competitive algorithm protected)
   * @private
   */
  _classifyTier(totalScore, seniority, department, companySize) {
    // STRATEGIC Tier (Priority 1) - Rules from specification
    // - C-Suite + any department
    // - VP/Director + (HR or Finance or Admin)
    // - Company size < 200 (small companies = higher contact)

    if (seniority === 'C-Level') {
      return { tier: 'STRATEGIC', priority: 1 };
    }

    if ((seniority === 'VP' || seniority === 'Director') &&
        (department === 'HR' || department === 'Finance' || department === 'Admin')) {
      return { tier: 'STRATEGIC', priority: 1 };
    }

    if (companySize < 200 && (seniority === 'VP' || seniority === 'Director' || seniority === 'Manager')) {
      return { tier: 'STRATEGIC', priority: 1 };
    }

    // PRIMARY Tier (Priority 2)
    // - VP/Director + other departments
    // - Manager + (HR or Finance or Admin)
    // - Company size 200-500

    if ((seniority === 'VP' || seniority === 'Director')) {
      return { tier: 'PRIMARY', priority: 2 };
    }

    if (seniority === 'Manager' &&
        (department === 'HR' || department === 'Finance' || department === 'Admin')) {
      return { tier: 'PRIMARY', priority: 2 };
    }

    if (companySize >= 200 && companySize < 500 && seniority === 'Manager') {
      return { tier: 'PRIMARY', priority: 2 };
    }

    // SECONDARY Tier (Priority 3)
    // - Manager + other departments
    // - Individual + (HR or Finance or Admin)
    // - Company size 500-1000

    if (seniority === 'Manager') {
      return { tier: 'SECONDARY', priority: 3 };
    }

    if (seniority === 'Individual' &&
        (department === 'HR' || department === 'Finance' || department === 'Admin')) {
      return { tier: 'SECONDARY', priority: 3 };
    }

    if (companySize >= 500 && companySize < 1000) {
      return { tier: 'SECONDARY', priority: 3 };
    }

    // BACKUP Tier (Priority 4)
    // - All other contacts
    // - Company size > 1000

    return { tier: 'BACKUP', priority: 4 };
  }

  /**
   * Recommend target titles based on company profile
   * Phase 1 Logic (Lines 47-55):
   * - If size < 50 AND maturity < 2 yrs → [Founder, COO]
   * - If 50 ≤ size < 500 → [HR Director, HR Manager]
   * - If size ≥ 500 → [Payroll Manager, Benefits Coordinator]
   * - If hiring_velocity > 10 → add [Head of Talent Acquisition, HR Ops Manager]
   * @private
   */
  _recommendTitles(companySize, companyMaturity, hiringVelocity) {
    let target_titles = [];
    let fallback_titles = [];

    // Rule 1: Small startups (< 50 employees, < 2 years old)
    if (companySize < 50 && companyMaturity < 2) {
      target_titles = ['Founder', 'Co-Founder', 'COO', 'CEO'];
      fallback_titles = ['Operations Manager', 'Office Manager', 'CFO'];
    }
    // Rule 2: Scale-ups and mid-size (50-500 employees)
    else if (companySize >= 50 && companySize < 500) {
      target_titles = ['HR Director', 'Director of HR', 'HR Manager', 'People Director'];
      fallback_titles = ['HR Business Partner', 'Senior HR Manager', 'VP HR'];
    }
    // Rule 3: Large companies (500+ employees)
    else if (companySize >= 500) {
      target_titles = ['Payroll Manager', 'Benefits Manager', 'Compensation & Benefits Manager'];
      fallback_titles = ['HR Operations Manager', 'Benefits Coordinator', 'Payroll Director'];
    }
    // Rule 4: Very small companies (no specific maturity data)
    else {
      target_titles = ['Founder', 'CEO', 'Operations Manager'];
      fallback_titles = ['Office Manager', 'Admin Manager'];
    }

    // Rule 5: High hiring velocity companies (> 10 hires/month)
    if (hiringVelocity > 10) {
      target_titles.unshift('Head of Talent Acquisition', 'VP Talent Acquisition');
      fallback_titles.unshift('Talent Acquisition Manager', 'HR Ops Manager');
    }

    return {
      target_titles: [...new Set(target_titles)], // Remove duplicates
      fallback_titles: [...new Set(fallback_titles)]
    };
  }

  /**
   * Log decision to database for shadow mode analysis (Sprint 23)
   * @private
   */
  /**
   * Compare inline result vs rule engine result (Sprint 24)
   * @private
   */
  _compareResults(inlineResult, ruleResult) {
    if (!ruleResult || ruleResult.error) {
      return {
        match: false,
        reason: 'Rule engine error or unavailable',
        inline_tier: inlineResult.tier,
        rule_tier: null
      };
    }

    const tierMatch = inlineResult.tier === ruleResult.tier;
    const priorityMatch = inlineResult.priority === ruleResult.priority;

    // Compare target titles (check if there's any overlap)
    const inlineTitles = new Set(inlineResult.target_titles);
    const ruleTitles = new Set(ruleResult.target_titles);
    const titleOverlap = [...inlineTitles].filter(t => ruleTitles.has(t)).length;
    const titleSimilarity = titleOverlap / Math.max(inlineTitles.size, ruleTitles.size);

    return {
      match: tierMatch && priorityMatch,
      tier_match: tierMatch,
      priority_match: priorityMatch,
      title_similarity: titleSimilarity,
      inline_tier: inlineResult.tier,
      rule_tier: ruleResult.tier,
      inline_priority: inlineResult.priority,
      rule_priority: ruleResult.priority,
      inline_confidence: inlineResult.confidence,
      rule_confidence: ruleResult.confidence,
      confidence_diff: Math.abs((inlineResult.confidence || 0) - (ruleResult.confidence || 0))
    };
  }

  async _logDecision(decisionId, input, inlineResult, ruleResult, comparison, distribution) {
    // Import db module (use utils/db.js for CommonJS compatibility)
    const db = require('../../utils/db');

    try {
      // Log to agent_core.agent_decisions (Sprint 22 schema + Sprint 28 A/B tracking)
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
        'ContactTierTool',
        'select_contact_tier',
        ruleResult?._meta?.version || distribution?.version || 'inline_only',  // Sprint 28: A/B test version
        input,  // input_data
        {
          inline: inlineResult,
          rule: ruleResult || null,
          comparison: comparison,
          ab_test: distribution || null  // Sprint 28: Track A/B test group
        },  // output_data (contains both inline and rule results)
        inlineResult.confidence || null,
        inlineResult._meta.latency_ms || 0
      ]);
    } catch (error) {
      // Don't throw - logging is non-critical
      console.error('[ContactTier] Failed to log decision:', error.message);
    }
  }
}

module.exports = ContactTierToolStandalone;
