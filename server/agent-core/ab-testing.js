/**
 * A/B Testing Helper - Sprint 27
 *
 * Provides rule version selection for A/B testing across all SIVA tools
 *
 * Features:
 * - Consistent hashing (same entity_id always gets same version)
 * - Environment variable configuration
 * - Traffic splitting (50/50 or custom)
 * - Version comparison tracking
 */

const crypto = require('crypto');

class ABTestingHelper {
  /**
   * Initialize A/B testing helper
   *
   * @param {string} toolName - Name of the tool (e.g., 'CompanyQualityTool')
   */
  constructor(toolName) {
    this.toolName = toolName;

    // Load configuration from environment variables
    this.config = this._loadConfig();
  }

  /**
   * Load A/B test configuration from environment variables
   *
   * Environment variables:
   * - AB_TEST_ENABLED: Enable A/B testing (true/false)
   * - AB_TEST_CONTROL_VERSION: Control version (e.g., 'v2.2')
   * - AB_TEST_TEST_VERSION: Test version (e.g., 'v2.3')
   * - AB_TEST_TRAFFIC_SPLIT: Traffic split (0.0-1.0, default 0.5)
   *
   * @returns {Object} Configuration object
   */
  _loadConfig() {
    const enabled = process.env.AB_TEST_ENABLED === 'true';
    const controlVersion = process.env.AB_TEST_CONTROL_VERSION || 'v2.2';
    const testVersion = process.env.AB_TEST_TEST_VERSION || 'v2.3';
    const trafficSplit = parseFloat(process.env.AB_TEST_TRAFFIC_SPLIT || '0.5');

    return {
      enabled,
      controlVersion,
      testVersion,
      trafficSplit,
      tool: this.toolName
    };
  }

  /**
   * Select rule version for a given entity (company, contact, etc.)
   *
   * Uses consistent hashing to ensure the same entity always gets the same version
   *
   * @param {string} entityId - Entity ID (company_id, contact_id, etc.)
   * @returns {string} Selected rule version
   */
  selectVersion(entityId) {
    // If A/B testing is disabled, return control version
    if (!this.config.enabled) {
      return this.config.controlVersion;
    }

    // If no entity ID provided, return control version (fallback)
    if (!entityId) {
      return this.config.controlVersion;
    }

    // Consistent hashing: MD5 hash of entity ID
    const hash = crypto.createHash('md5').update(entityId.toString()).digest('hex');
    const hashValue = parseInt(hash.substring(0, 8), 16);
    const bucket = (hashValue % 100) / 100; // 0.00 to 0.99

    // Traffic split: if bucket < trafficSplit, use test version
    return bucket < this.config.trafficSplit
      ? this.config.testVersion
      : this.config.controlVersion;
  }

  /**
   * Get current A/B test configuration
   *
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      ...this.config,
      status: this.config.enabled ? 'active' : 'inactive'
    };
  }

  /**
   * Check if A/B testing is enabled
   *
   * @returns {boolean} True if A/B testing is enabled
   */
  isEnabled() {
    return this.config.enabled;
  }

  /**
   * Get version distribution for logging
   *
   * @param {string} selectedVersion - The version that was selected
   * @returns {Object} Distribution information
   */
  getDistribution(selectedVersion) {
    if (!this.config.enabled) {
      return {
        version: selectedVersion,
        group: 'control',
        traffic_split: 1.0
      };
    }

    const isTestGroup = selectedVersion === this.config.testVersion;
    return {
      version: selectedVersion,
      group: isTestGroup ? 'test' : 'control',
      traffic_split: isTestGroup ? this.config.trafficSplit : (1 - this.config.trafficSplit),
      control_version: this.config.controlVersion,
      test_version: this.config.testVersion
    };
  }
}

/**
 * Load rule file for a given version
 *
 * @param {string} toolName - Tool name (e.g., 'CompanyQualityTool')
 * @param {string} version - Rule version (e.g., 'v2.2')
 * @returns {string} Path to rule file
 */
function getRuleFilePath(toolName, version) {
  const path = require('path');

  // Map tool names to rule file patterns
  const ruleFileMap = {
    'CompanyQualityTool': `cognitive_extraction_logic_${version}.json`,
    'ContactTierTool': `contact_tier_${version}.json`,
    'TimingScoreTool': `timing_score_${version}.json`,
    'BankingProductMatchTool': `banking_product_match_${version}.json`
  };

  const fileName = ruleFileMap[toolName];
  if (!fileName) {
    throw new Error(`Unknown tool name: ${toolName}`);
  }

  return path.join(__dirname, fileName);
}

/**
 * Compare two results (inline vs rule engine)
 *
 * @param {Object} inlineResult - Result from inline implementation
 * @param {Object} ruleResult - Result from rule engine
 * @returns {Object} Comparison result
 */
function compareResults(inlineResult, ruleResult) {
  if (!ruleResult) {
    return { match: null, reason: 'rule_engine_unavailable' };
  }

  // Compare quality tier
  const tierMatch = inlineResult.qualityTier === ruleResult.quality_tier;

  // Compare quality score (within 5% tolerance)
  const scoreDiff = Math.abs(inlineResult.qualityScore - ruleResult.quality_score);
  const scoreMatch = scoreDiff <= 5;

  // Compare confidence (within 0.10 tolerance)
  const confidenceDiff = Math.abs(inlineResult.confidence - ruleResult.confidence);
  const confidenceMatch = confidenceDiff <= 0.10;

  // Overall match
  const overallMatch = tierMatch && scoreMatch;

  return {
    match: overallMatch,
    tier_match: tierMatch,
    score_match: scoreMatch,
    confidence_match: confidenceMatch,
    score_diff: scoreDiff,
    confidence_diff: confidenceDiff,
    inline_tier: inlineResult.qualityTier,
    rule_tier: ruleResult.quality_tier,
    inline_score: inlineResult.qualityScore,
    rule_score: ruleResult.quality_score,
    inline_confidence: inlineResult.confidence,
    rule_confidence: ruleResult.confidence
  };
}

module.exports = {
  ABTestingHelper,
  getRuleFilePath,
  compareResults
};
