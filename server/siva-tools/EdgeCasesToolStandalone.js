/**
 * EdgeCasesTool - SIVA Decision Primitive 4 (Standalone) - v2.0
 *
 * Implements: CHECK_EDGE_CASES (STRICT)
 *
 * Purpose: Detect edge cases using INTELLIGENCE, not hardcoded rules
 * Type: STRICT (deterministic, no LLM calls)
 * SLA: ≤50ms P50, ≤150ms P95
 *
 * v2.0 Changes:
 * - Intelligent enterprise brand detection (heuristic scoring)
 * - Intelligent government entity detection (pattern matching)
 * - Time-aware calendar warnings (only show if happening TODAY)
 * - Dynamic recent contact thresholds by tier
 * - Natural language reasoning (no formulas exposed)
 * - Sentry error tracking
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const Sentry = require('@sentry/node');
const { edgeCasesInputSchema, edgeCasesOutputSchema } = require('./schemas/edgeCasesSchemas');

class EdgeCasesToolStandalone {
  constructor() {
    this.agentName = 'EdgeCasesTool';
    this.POLICY_VERSION = 'v2.0'; // Updated to v2.0 for intelligent detection

    // Dynamic thresholds by contact tier
    this.RECENT_CONTACT_THRESHOLDS = {
      'STRATEGIC': 120,  // C-Suite: 4 months breathing room
      'PRIMARY': 90,     // VP/Director: 3 months
      'SECONDARY': 60,   // Manager: 2 months
      'BACKUP': 30       // Individual: 1 month
    };

    // Excessive attempts threshold
    this.EXCESSIVE_ATTEMPTS_THRESHOLD = 3;

    // Setup schema validators
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    this.validateInput = ajv.compile(edgeCasesInputSchema);
    this.validateOutput = ajv.compile(edgeCasesOutputSchema);

    // Competitor blocklist (loaded from pack config)
    this.competitorBlocklist = null;
  }

  /**
   * Load competitor blocklist from pack config
   * @param {Object} packConfig - The pack configuration object
   */
  loadPackConfig(packConfig) {
    if (packConfig && packConfig.competitor_blocklist) {
      this.competitorBlocklist = packConfig.competitor_blocklist;
    }
  }

  /**
   * Detect if company is a competitor bank (from pack config blocklist)
   * OS_AUTHORITY: OS decides if company is a competitor
   * @private
   */
  _detectCompetitorBank(companyProfile) {
    if (!this.competitorBlocklist || !this.competitorBlocklist.enabled) {
      return { isCompetitor: false, matchedBank: null };
    }

    const companyName = (companyProfile.name || '').toLowerCase();
    const companyDomain = (companyProfile.domain || '').toLowerCase();

    for (const bank of this.competitorBlocklist.banks) {
      // Check domain match
      for (const domain of bank.domains || []) {
        if (companyDomain === domain.toLowerCase() ||
            companyDomain.endsWith('.' + domain.toLowerCase())) {
          return {
            isCompetitor: true,
            matchedBank: bank.name,
            matchType: 'domain',
            confidence: 1.0
          };
        }
      }

      // Check name match (exact or alias)
      const bankNameLower = bank.name.toLowerCase();
      if (companyName === bankNameLower || companyName.includes(bankNameLower)) {
        return {
          isCompetitor: true,
          matchedBank: bank.name,
          matchType: 'name',
          confidence: 0.95
        };
      }

      // Check alias match
      for (const alias of bank.aliases || []) {
        const aliasLower = alias.toLowerCase();
        if (companyName === aliasLower || companyName.includes(aliasLower)) {
          return {
            isCompetitor: true,
            matchedBank: bank.name,
            matchType: 'alias',
            confidence: 0.9
          };
        }
      }
    }

    return { isCompetitor: false, matchedBank: null };
  }

  /**
   * Intelligent enterprise brand detection using heuristic scoring
   * @private
   */
  _detectEnterpriseBrand(companyProfile) {
    let enterpriseScore = 0;
    const reasons = [];

    // Factor 1: Company Size (40% weight)
    if (companyProfile.size > 10000) {
      enterpriseScore += 40;
      reasons.push('very large organization (10,000+ employees)');
    } else if (companyProfile.size > 5000) {
      enterpriseScore += 30;
      reasons.push('large organization (5,000+ employees)');
    } else if (companyProfile.size > 2000) {
      enterpriseScore += 20;
      reasons.push('mid-large organization (2,000+ employees)');
    }

    // Factor 2: Revenue/Valuation (30% weight)
    if (companyProfile.revenue > 1_000_000_000) { // $1B+
      enterpriseScore += 30;
      reasons.push('high revenue ($1B+ annual)');
    } else if (companyProfile.revenue > 500_000_000) { // $500M+
      enterpriseScore += 20;
      reasons.push('significant revenue ($500M+ annual)');
    }

    // Factor 3: Market Presence (30% weight)
    if (companyProfile.linkedin_followers > 100000) {
      enterpriseScore += 15;
      reasons.push('major brand presence (100K+ LinkedIn followers)');
    }

    if (companyProfile.stock_exchange) {
      enterpriseScore += 15;
      reasons.push('publicly traded entity');
    }

    if (companyProfile.number_of_locations > 10) {
      enterpriseScore += 10;
      reasons.push('multi-location presence (10+ offices)');
    }

    // Threshold: 60+ = Enterprise Brand
    const isEnterprise = enterpriseScore >= 60;

    return {
      isEnterprise,
      enterpriseScore,
      confidence: Math.min(enterpriseScore / 100, 1.0),
      reasons: reasons.join(', ')
    };
  }

  /**
   * Intelligent government entity detection using pattern matching
   * @private
   */
  _detectGovernmentEntity(companyProfile) {
    const indicators = [];
    let govScore = 0;

    // Pattern 1: Domain analysis
    if (companyProfile.domain && companyProfile.domain.endsWith('.gov.ae')) {
      govScore += 100; // Definitive
      indicators.push('government domain (.gov.ae)');
    }

    // Pattern 2: Name patterns (with context awareness)
    const strongGovKeywords = [
      'government', 'ministry', 'authority', 'municipality',
      'federal', 'police', 'defense', 'defence', 'armed forces'
    ];

    const weakGovKeywords = [
      'royal', 'crown', 'emirate'
    ];

    const nameWords = companyProfile.name.toLowerCase().split(/\s+/);

    // Strong keywords alone are enough
    const hasStrongKeyword = strongGovKeywords.some(keyword =>
      nameWords.some(word => word.includes(keyword))
    );

    // Weak keywords need additional context (size or sector)
    const hasWeakKeyword = weakGovKeywords.some(keyword =>
      nameWords.some(word => word.includes(keyword))
    );

    if (hasStrongKeyword) {
      govScore += 70;
      indicators.push('government-related name pattern');
    } else if (hasWeakKeyword && (companyProfile.size > 1000 || companyProfile.sector === 'government')) {
      govScore += 50;
      indicators.push('potential government affiliation');
    }

    // Pattern 3: Ownership structure
    if (companyProfile.government_ownership > 50) {
      govScore += 80;
      indicators.push(`government ownership: ${companyProfile.government_ownership}%`);
    } else if (companyProfile.government_ownership > 25) {
      govScore += 40;
      indicators.push(`significant government ownership: ${companyProfile.government_ownership}%`);
    }

    // Pattern 4: Sector classification
    if (companyProfile.sector === 'government' ||
        companyProfile.sector === 'semi-government') {
      govScore += 90;
      indicators.push('classified as government/semi-government sector');
    }

    const isGovernment = govScore >= 70;
    const isSemiGovernment = govScore >= 40 && govScore < 70;

    return {
      isGovernment,
      isSemiGovernment,
      govScore,
      confidence: Math.min(govScore / 100, 1.0),
      indicators: indicators.join(', ')
    };
  }

  /**
   * Check calendar edge cases - only warn about events happening TODAY
   * @private
   */
  _checkCalendarEdgeCases(currentDate = new Date()) {
    const warnings = [];

    // Ramadan detection (only warn if TODAY is Ramadan)
    const ramadanPeriods = [
      { start: new Date('2025-03-01'), end: new Date('2025-03-30') },
      { start: new Date('2026-02-18'), end: new Date('2026-03-19') }
    ];

    const isRamadanNow = ramadanPeriods.some(period =>
      currentDate >= period.start && currentDate <= period.end
    );

    if (isRamadanNow) {
      warnings.push({
        type: 'RAMADAN_PERIOD',
        severity: 'HIGH',
        message: 'Currently Ramadan - business activity significantly reduced. Recommend pausing outreach until after Eid',
        can_override: true,
        impact: '×0.3 timing multiplier'
      });
    }

    // UAE National Day (Dec 2-3)
    const month = currentDate.getMonth(); // 0-indexed
    const day = currentDate.getDate();

    if (month === 11 && (day === 2 || day === 3)) {
      warnings.push({
        type: 'UAE_NATIONAL_DAY',
        severity: 'MEDIUM',
        message: 'Today is UAE National Day - offices closed, low visibility',
        can_override: true,
        impact: '×0.8 timing multiplier'
      });
    }

    // Summer slowdown (only during Jul-Aug)
    if (month === 6 || month === 7) {
      warnings.push({
        type: 'SUMMER_SLOWDOWN',
        severity: 'MEDIUM',
        message: 'Summer vacation season - response rates typically lower',
        can_override: true,
        impact: '×0.7 timing multiplier'
      });
    }

    // Year-end freeze (Dec 20-31)
    if (month === 11 && day >= 20) {
      warnings.push({
        type: 'YEAR_END_FREEZE',
        severity: 'HIGH',
        message: 'Year-end period - budget decisions frozen until Q1',
        can_override: true,
        impact: '×0.6 timing multiplier'
      });
    }

    return warnings;
  }

  /**
   * Check recent contact with dynamic threshold by tier
   * @private
   */
  _checkRecentContact(contactProfile, historicalData) {
    if (!historicalData.last_contact_date) return null;

    const daysSinceContact = Math.floor(
      (new Date() - new Date(historicalData.last_contact_date)) / (1000 * 60 * 60 * 24)
    );

    // Get threshold for this contact's tier (default to 90 days)
    const threshold = this.RECENT_CONTACT_THRESHOLDS[contactProfile.tier] || 90;

    if (daysSinceContact < threshold) {
      return {
        type: 'RECENT_CONTACT',
        severity: 'MEDIUM',
        message: `Last contact was ${daysSinceContact} days ago (${contactProfile.tier || 'standard'} tier threshold: ${threshold} days). Recommend waiting ${threshold - daysSinceContact} more days to avoid spam perception`,
        can_override: true,
        days_until_safe: threshold - daysSinceContact,
        threshold: threshold
      };
    }

    return null;
  }

  /**
   * Calculate days since a given date
   * @private
   */
  _getDaysSince(dateString) {
    const pastDate = new Date(dateString);
    const now = new Date();
    const diffMs = now - pastDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  /**
   * Execute the tool with Sentry error tracking (v2.0)
   * @param {Object} input - Company, contact, and historical data
   * @returns {Promise<Object>} Decision with blockers and warnings
   */
  async execute(input) {
    try {
      return await this._executeInternal(input);
    } catch (error) {
      // Capture error in Sentry
      Sentry.captureException(error, {
        tags: {
          tool: 'EdgeCasesTool',
          primitive: 'CHECK_EDGE_CASES',
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
    let confidence = 1.0;

    // Extract inputs
    const {
      company_profile,
      contact_profile = {},
      historical_data = {}
    } = input;

    const blockers = [];
    const warnings = [];

    // ═══════════════════════════════════════════════════════
    // PHASE 1: CRITICAL BLOCKERS (Non-Overridable)
    // ═══════════════════════════════════════════════════════

    // 0. Competitor Bank Detection (from pack config)
    // OS_AUTHORITY: OS decides based on competitor_blocklist config
    const competitorCheck = this._detectCompetitorBank(company_profile);
    if (competitorCheck.isCompetitor) {
      blockers.push({
        type: 'COMPETITOR_BANK',
        severity: 'CRITICAL',
        message: `Competitor bank detected: ${competitorCheck.matchedBank}. Banks cannot sell employee banking services to other banks`,
        can_override: false,
        metadata: {
          matched_bank: competitorCheck.matchedBank,
          match_type: competitorCheck.matchType,
          confidence: competitorCheck.confidence
        }
      });
    }

    // 1. Government/Semi-Government Detection (INTELLIGENT)
    const govCheck = this._detectGovernmentEntity(company_profile);
    if (govCheck.isGovernment) {
      blockers.push({
        type: 'GOVERNMENT_SECTOR',
        severity: 'CRITICAL',
        message: `Government entity detected: ${govCheck.indicators}. ENBD policy prohibits direct employee banking outreach to government entities`,
        can_override: false
      });
    } else if (govCheck.isSemiGovernment) {
      warnings.push({
        type: 'SEMI_GOVERNMENT',
        severity: 'HIGH',
        message: `Semi-government entity detected: ${govCheck.indicators}. Proceed with caution and ensure compliance approval`,
        can_override: true
      });
    }

    // 2. Sanctioned Entities
    if (company_profile.is_sanctioned === true) {
      blockers.push({
        type: 'SANCTIONED_ENTITY',
        severity: 'CRITICAL',
        message: 'Company is on sanctions list - compliance violation, cannot proceed',
        can_override: false
      });
    }

    // 3. Email Bounces
    if (contact_profile.has_bounced === true) {
      blockers.push({
        type: 'EMAIL_BOUNCED',
        severity: 'CRITICAL',
        message: 'Email has bounced previously - deliverability issue, cannot proceed',
        can_override: false
      });
    }

    // 4. Opt-Out
    if (contact_profile.has_opted_out === true) {
      blockers.push({
        type: 'OPTED_OUT',
        severity: 'CRITICAL',
        message: 'Contact has opted out - compliance violation, cannot proceed',
        can_override: false
      });
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 2: HIGH SEVERITY BLOCKERS (Requires Approval)
    // ═══════════════════════════════════════════════════════

    // 5. Bankruptcy/Legal Issues
    if (company_profile.is_bankrupt === true || company_profile.has_legal_issues === true) {
      const issues = [];
      if (company_profile.is_bankrupt) issues.push('bankruptcy');
      if (company_profile.has_legal_issues) issues.push('legal issues');

      blockers.push({
        type: 'BANKRUPTCY_LEGAL',
        severity: 'HIGH',
        message: `Company has ${issues.join(' and ')} - reputational risk and low conversion probability`,
        can_override: true
      });
    }

    // 6. Excessive Previous Attempts
    if (historical_data.previous_attempts >= this.EXCESSIVE_ATTEMPTS_THRESHOLD &&
        historical_data.previous_responses === 0) {
      blockers.push({
        type: 'EXCESSIVE_ATTEMPTS',
        severity: 'HIGH',
        message: `${historical_data.previous_attempts} previous attempts with no response - spam prevention, diminishing returns`,
        can_override: true
      });
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 3: MEDIUM SEVERITY BLOCKERS (Can Override)
    // ═══════════════════════════════════════════════════════

    // 7. Enterprise Brand Detection (INTELLIGENT)
    const enterpriseCheck = this._detectEnterpriseBrand(company_profile);
    if (enterpriseCheck.isEnterprise) {
      blockers.push({
        type: 'ENTERPRISE_BRAND',
        severity: 'MEDIUM',
        message: `Large enterprise brand detected: ${enterpriseCheck.reasons}. Existing banking relationships likely, low conversion probability`,
        can_override: true,
        metadata: {
          enterprise_score: enterpriseCheck.enterpriseScore,
          confidence: enterpriseCheck.confidence
        }
      });
    }

    // 8. Active Negotiation
    if (historical_data.has_active_negotiation === true) {
      blockers.push({
        type: 'ACTIVE_NEGOTIATION',
        severity: 'MEDIUM',
        message: 'Company already has active negotiation in pipeline - avoid confusion with multiple touches',
        can_override: true
      });
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 4: WARNINGS (Always Overridable)
    // ═══════════════════════════════════════════════════════

    // 9. Recent Contact (DYNAMIC BY TIER)
    const recentContactWarning = this._checkRecentContact(contact_profile, historical_data);
    if (recentContactWarning) {
      warnings.push(recentContactWarning);
    }

    // 10. Single Attempt No Response
    if (historical_data.previous_attempts === 1 &&
        historical_data.previous_responses === 0) {
      warnings.push({
        type: 'SINGLE_ATTEMPT_NO_RESPONSE',
        severity: 'LOW',
        message: 'Previous attempt received no response - may need different approach or timing',
        can_override: true
      });
    }

    // 11. Unverified Email
    if (contact_profile.is_verified === false) {
      warnings.push({
        type: 'UNVERIFIED_EMAIL',
        severity: 'MEDIUM',
        message: 'Email is not verified - deliverability risk, consider verifying before send',
        can_override: true
      });
    }

    // 12. Company Too Large
    if (company_profile.size && company_profile.size > 1000) {
      warnings.push({
        type: 'COMPANY_TOO_LARGE',
        severity: 'LOW',
        message: `Company has ${company_profile.size} employees - complex org structure, lower accessibility to decision makers`,
        can_override: true
      });
    }

    // 13. Company Too New
    if (company_profile.year_founded) {
      const currentYear = new Date().getFullYear();
      const companyAge = currentYear - company_profile.year_founded;
      if (companyAge < 1) {
        warnings.push({
          type: 'COMPANY_TOO_NEW',
          severity: 'LOW',
          message: `Company founded in ${company_profile.year_founded} - very new, may not have established payroll processes`,
          can_override: true
        });
      }
    }

    // 14. Calendar Edge Cases (TIME-AWARE)
    const calendarWarnings = this._checkCalendarEdgeCases();
    warnings.push(...calendarWarnings);

    // ═══════════════════════════════════════════════════════
    // PHASE 5: DECISION LOGIC
    // ═══════════════════════════════════════════════════════

    let decision;
    let overridable;

    if (blockers.length > 0) {
      decision = 'BLOCK';
      // Can only override if NO critical severity blockers
      overridable = blockers.every(b => b.severity !== 'CRITICAL');
    } else if (warnings.length > 0) {
      decision = 'WARN';
      overridable = true;
    } else {
      decision = 'PROCEED';
      overridable = true;
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 6: NATURAL LANGUAGE REASONING (No Formulas)
    // ═══════════════════════════════════════════════════════

    let reasoning;
    if (decision === 'BLOCK') {
      const criticalBlockers = blockers.filter(b => b.severity === 'CRITICAL');
      const highBlockers = blockers.filter(b => b.severity === 'HIGH');

      if (criticalBlockers.length > 0) {
        reasoning = `Outreach blocked: ${criticalBlockers.map(b => b.message).join('; ')}.`;
      } else if (highBlockers.length > 0) {
        reasoning = `Outreach not recommended: ${highBlockers[0].message}. Requires approval to override.`;
      } else {
        reasoning = `Outreach not recommended: ${blockers[0].message}. Can be overridden with justification.`;
      }
    } else if (decision === 'WARN') {
      const topWarnings = warnings.slice(0, 2);
      reasoning = `Proceed with caution: ${topWarnings.map(w => w.message).join('; ')}.`;
    } else {
      reasoning = 'No edge cases detected. Company and contact profiles are clean. Safe to proceed with outreach.';
    }

    // Adjust confidence based on missing data
    if (!company_profile.sector) {
      confidence -= 0.15;
    }
    if (company_profile.is_sanctioned === undefined) {
      confidence -= 0.10;
    }
    if (contact_profile.is_verified === undefined) {
      confidence -= 0.10;
    }
    if (historical_data.previous_attempts === undefined) {
      confidence -= 0.05;
    }

    // Ensure confidence bounds
    confidence = Math.max(0.6, Math.min(1.0, confidence));

    // Track execution time
    const latencyMs = Date.now() - startTime;

    const output = {
      decision,
      confidence: parseFloat(confidence.toFixed(2)),
      blockers,
      warnings,
      reasoning,
      timestamp: new Date().toISOString(),
      metadata: {
        blockers_count: blockers.length,
        warnings_count: warnings.length,
        critical_issues: blockers.filter(b => b.severity === 'CRITICAL').map(b => b.type),
        overridable
      },
      _meta: {
        latency_ms: latencyMs,
        tool_name: 'check_edge_cases',
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
}

module.exports = EdgeCasesToolStandalone;
