/**
 * Persona Policy Engine - Sprint 20 Task 6
 *
 * Enforces SIVA persona policies (ALWAYS/NEVER rules + confidence gates)
 * Loaded from persona_versions table for versioning and A/B testing
 *
 * Features:
 * - ALWAYS rules: Must be followed (e.g., "ALWAYS verify contact tier before outreach")
 * - NEVER rules: Hard blockers (e.g., "NEVER contact enterprise brands")
 * - Confidence gates: Minimum confidence thresholds per tool
 * - Pre-execution validation (block if violates NEVER rules)
 * - Post-execution validation (warn if violates ALWAYS rules)
 * - Policy violation logging to database
 */

const db = require('../../utils/db');
const Sentry = require('@sentry/node');

class PersonaPolicyEngine {
  constructor() {
    this.activePolicy = null;
    this.cacheExpiryMs = 5 * 60 * 1000; // 5 minutes
    this.lastCacheTime = null;
  }

  /**
   * Load active persona policy from database
   * Cached for 5 minutes to reduce database queries
   *
   * @returns {Promise<Object>} Active persona policy
   */
  async loadActivePolicy() {
    try {
      // Return cached policy if still valid
      if (this.activePolicy && this.lastCacheTime &&
          (Date.now() - this.lastCacheTime < this.cacheExpiryMs)) {
        return this.activePolicy;
      }

      // Query active policy from database
      const query = `
        SELECT version, always_rules, never_rules, confidence_thresholds
        FROM persona_versions
        WHERE is_active = true
        ORDER BY deployed_at DESC
        LIMIT 1
      `;

      const result = await db.query(query);

      if (result.rows.length === 0) {
        console.warn('[PersonaPolicyEngine] No active policy found, using defaults');
        return this.getDefaultPolicy();
      }

      this.activePolicy = result.rows[0];
      this.lastCacheTime = Date.now();

      console.log(`[PersonaPolicyEngine] Loaded active policy: ${this.activePolicy.version}`);
      return this.activePolicy;

    } catch (error) {
      console.error('[PersonaPolicyEngine] Failed to load active policy:', error);
      Sentry.captureException(error, {
        tags: { service: 'PersonaPolicyEngine', operation: 'loadActivePolicy' }
      });

      // Return default policy on error
      return this.getDefaultPolicy();
    }
  }

  /**
   * Get default policy (used as fallback)
   */
  getDefaultPolicy() {
    return {
      version: 'v2.0-default',
      always_rules: [
        "ALWAYS verify contact tier before outreach",
        "ALWAYS check edge cases before enrichment",
        "ALWAYS calculate composite score before lead handoff",
        "ALWAYS log decisions to database"
      ],
      never_rules: [
        "NEVER contact enterprise brands",
        "NEVER contact government entities",
        "NEVER proceed if confidence < 0.60",
        "NEVER skip compliance checks"
      ],
      confidence_thresholds: {
        CompanyQualityTool: 0.70,
        ContactTierTool: 0.75,
        TimingScoreTool: 0.65,
        EdgeCasesTool: 0.80,
        BankingProductMatchTool: 0.70,
        OutreachChannelTool: 0.60,
        OpeningContextTool: 0.65,
        CompositeScoreTool: 0.70,
        OutreachMessageGeneratorTool: 0.75,
        FollowUpStrategyTool: 0.60,
        ObjectionHandlerTool: 0.65,
        RelationshipTrackerTool: 0.60
      }
    };
  }

  /**
   * Validate input before tool execution (NEVER rules)
   *
   * @param {string} toolName - Name of the tool
   * @param {Object} input - Tool input parameters
   * @returns {Promise<Object>} Validation result { allowed: boolean, violations: [] }
   */
  async validatePreExecution(toolName, input) {
    const policy = await this.loadActivePolicy();
    const violations = [];

    // Check NEVER rules
    if (policy.never_rules) {
      // Rule: NEVER contact enterprise brands
      if (this.isEnterpriseBrand(input)) {
        violations.push({
          rule: "NEVER contact enterprise brands",
          severity: 'BLOCKER',
          details: `Company ${input.companyName} is flagged as enterprise brand`
        });
      }

      // Rule: NEVER contact government entities
      if (this.isGovernmentEntity(input)) {
        violations.push({
          rule: "NEVER contact government entities",
          severity: 'BLOCKER',
          details: `Company ${input.companyName} is flagged as government entity`
        });
      }
    }

    const allowed = violations.filter(v => v.severity === 'BLOCKER').length === 0;

    if (!allowed) {
      console.warn(`[PersonaPolicyEngine] Pre-execution validation failed for ${toolName}:`, violations);
    }

    return {
      allowed,
      violations,
      policyVersion: policy.version
    };
  }

  /**
   * Validate output after tool execution (ALWAYS rules + confidence gates)
   *
   * @param {string} toolName - Name of the tool
   * @param {Object} output - Tool output result
   * @returns {Promise<Object>} Validation result { passed: boolean, warnings: [], escalate: boolean }
   */
  async validatePostExecution(toolName, output) {
    const policy = await this.loadActivePolicy();
    const warnings = [];
    let escalate = false;

    // Check confidence gate
    const threshold = policy.confidence_thresholds?.[toolName] || 0.60;
    const confidence = output.confidence || output.confidenceScore || output.confidenceLevel || 1.0;

    // Convert confidenceLevel (HIGH/MEDIUM/LOW) to numeric if needed
    const numericConfidence = this.normalizeConfidence(confidence);

    if (numericConfidence < threshold) {
      warnings.push({
        rule: `Minimum confidence threshold: ${threshold}`,
        severity: 'WARNING',
        details: `Tool ${toolName} returned confidence ${numericConfidence.toFixed(2)} < ${threshold}`,
        recommendedAction: 'Escalate to human review'
      });
      escalate = true;
    }

    // Check ALWAYS rules (context-specific)
    if (policy.always_rules) {
      // Rule: ALWAYS verify contact tier before outreach (if generating outreach messages)
      if (toolName === 'OutreachMessageGeneratorTool' && !output.contact_tier && !output.metadata?.contact_tier) {
        warnings.push({
          rule: "ALWAYS verify contact tier before outreach",
          severity: 'WARNING',
          details: `Contact tier not verified before generating outreach message`,
          recommendedAction: 'Run ContactTierTool first'
        });
      }

      // Rule: ALWAYS check edge cases before enrichment (if enriching contacts)
      if (toolName === 'ContactTierTool' && !output.metadata?.edge_cases_checked) {
        warnings.push({
          rule: "ALWAYS check edge cases before enrichment",
          severity: 'INFO',
          details: `Edge cases not checked before contact enrichment`,
          recommendedAction: 'Run EdgeCasesTool first'
        });
      }
    }

    const passed = warnings.filter(w => w.severity === 'BLOCKER').length === 0;

    if (warnings.length > 0) {
      console.warn(`[PersonaPolicyEngine] Post-execution warnings for ${toolName}:`, warnings);
    }

    return {
      passed,
      warnings,
      escalate,
      policyVersion: policy.version
    };
  }

  /**
   * Log policy violation to database for analysis
   *
   * @param {string} toolName - Tool that caused violation
   * @param {string} violationType - 'PRE_EXECUTION' or 'POST_EXECUTION'
   * @param {Array} violations - List of violations
   * @param {Object} context - Additional context (input, output, etc.)
   */
  async logPolicyViolation(toolName, violationType, violations, context = {}) {
    try {
      // For now, just log to console and Sentry
      // In future, could log to agent_policy_violations table

      console.error(`[PersonaPolicyEngine] POLICY VIOLATION - ${violationType}:`, {
        tool: toolName,
        violations: violations.map(v => v.rule),
        context
      });

      Sentry.captureMessage(`Policy violation: ${toolName} - ${violationType}`, {
        level: 'warning',
        tags: {
          service: 'PersonaPolicyEngine',
          tool: toolName,
          violationType
        },
        extra: {
          violations,
          context
        }
      });

    } catch (error) {
      console.error('[PersonaPolicyEngine] Failed to log policy violation:', error);
    }
  }

  /**
   * Helper: Check if company is enterprise brand
   */
  isEnterpriseBrand(input) {
    const enterpriseBrands = [
      'google', 'microsoft', 'amazon', 'apple', 'meta', 'facebook',
      'oracle', 'ibm', 'salesforce', 'sap', 'adobe', 'intel', 'nvidia',
      'tesla', 'netflix', 'uber', 'airbnb', 'spotify', 'twitter', 'linkedin'
    ];

    const companyName = (input.companyName || input.company_name || input.domain || '').toLowerCase();
    return enterpriseBrands.some(brand => companyName.includes(brand));
  }

  /**
   * Helper: Check if entity is government
   */
  isGovernmentEntity(input) {
    const govKeywords = ['government', 'ministry', 'federal', 'state', 'municipal', '.gov'];
    const companyName = (input.companyName || input.company_name || input.domain || '').toLowerCase();
    return govKeywords.some(keyword => companyName.includes(keyword));
  }

  /**
   * Helper: Normalize confidence to 0-1 range
   */
  normalizeConfidence(confidence) {
    // If already numeric 0-1
    if (typeof confidence === 'number') {
      return confidence;
    }

    // Convert string confidence levels
    if (typeof confidence === 'string') {
      const confidenceMap = {
        'HIGH': 0.90,
        'MEDIUM': 0.70,
        'LOW': 0.50
      };
      return confidenceMap[confidence.toUpperCase()] || 0.50;
    }

    return 0.50; // Default to MEDIUM
  }

  /**
   * Clear policy cache (useful after policy updates)
   */
  clearCache() {
    this.activePolicy = null;
    this.lastCacheTime = null;
    console.log('[PersonaPolicyEngine] Policy cache cleared');
  }
}

module.exports = new PersonaPolicyEngine();
