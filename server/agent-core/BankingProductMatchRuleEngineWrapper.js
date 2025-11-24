/**
 * BankingProductMatchRuleEngineWrapper - Sprint 28
 *
 * Wraps the generic RuleEngine to execute banking_product_match_v1.0.json rules
 * Provides a consistent interface for shadow mode comparison in BankingProductMatchTool
 *
 * Usage:
 *   const engine = new BankingProductMatchRuleEngineWrapper();
 *   const result = await engine.execute(input);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BankingProductMatchRuleEngineWrapper {
  constructor() {
    // Load the banking_product_match_v1.0.json rule file
    const rulesPath = path.join(__dirname, 'banking_product_match_v1.0.json');
    this.rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    this.version = this.rules.version;

    // Load product catalog
    const catalogPath = path.join(__dirname, '../siva-tools/data/emiratesnbd-products.json');
    this.productCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

    // Extract rule configuration
    this.ruleConfig = this.rules.rules.match_banking_products;
  }

  /**
   * Execute the banking product match rule
   * Implements the logic from banking_product_match_v1.0.json
   */
  async execute(input) {
    const startTime = Date.now();

    try {
      // PHASE 1: Infer segment if not provided
      const segment = input.segment || this._inferSegment(input.company_size);

      // PHASE 2: Collect all products
      const allProducts = [
        ...this.productCatalog.salary_accounts,
        ...this.productCatalog.credit_cards,
        ...this.productCatalog.business_accounts,
        ...this.productCatalog.personal_loans,
        ...this.productCatalog.insurance_products
      ];

      // PHASE 3: Filter eligible products
      const eligibleProducts = this._filterEligibleProducts(allProducts, input, segment);

      // PHASE 4: Calculate fit scores
      const scoredProducts = eligibleProducts.map(product =>
        this._calculateFitScore(product, input, segment)
      );

      // PHASE 5: Sort and select top 5
      scoredProducts.sort((a, b) => b.fit_score - a.fit_score);
      const topProducts = scoredProducts.slice(0, 5);

      // Add priority
      const recommendedProducts = topProducts.map((product, index) => ({
        ...product,
        priority: index + 1
      }));

      // PHASE 6: Calculate confidence
      let confidence = this._calculateConfidence(input, recommendedProducts, allProducts.length);

      // PHASE 7: Classify confidence level
      const confidenceLevel = confidence >= 0.85 ? 'HIGH' : confidence >= 0.65 ? 'MEDIUM' : 'LOW';

      const output = {
        recommended_products: recommendedProducts,
        confidence: parseFloat(confidence.toFixed(2)),
        timestamp: new Date().toISOString(),
        metadata: {
          confidenceLevel,
          segment_match: segment,
          total_products_considered: allProducts.length
        },
        _meta: {
          latency_ms: Date.now() - startTime,
          tool_name: 'match_banking_products',
          tool_type: 'STRICT',
          policy_version: this.version,
          rule_engine_version: this.version
        }
      };

      return output;

    } catch (error) {
      return {
        error: error.message,
        version: this.version,
        _meta: {
          latency_ms: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Infer segment from company size
   * @private
   */
  _inferSegment(company_size) {
    const rules = this.ruleConfig.segment_inference.rules;

    for (const rule of rules) {
      if (rule.condition.company_size.lt && company_size < rule.condition.company_size.lt) {
        return rule.segment;
      }
      if (rule.condition.company_size.gte && company_size >= rule.condition.company_size.gte) {
        return rule.segment;
      }
    }

    return 'sme'; // Default
  }

  /**
   * Filter eligible products based on company profile
   * @private
   */
  _filterEligibleProducts(allProducts, input, segment) {
    const { company_size, average_salary_aed } = input;

    return allProducts.filter(product => {
      // Size eligibility
      if (company_size < product.company_size_min || company_size > product.company_size_max) {
        return false;
      }

      // Salary requirement
      if (product.min_salary_aed !== null && average_salary_aed) {
        if (average_salary_aed < product.min_salary_aed ||
            (product.max_salary_aed && average_salary_aed > product.max_salary_aed)) {
          return false;
        }
      }

      // Segment compatibility
      if (product.target_segment !== 'all') {
        if (!this._checkSegmentCompatibility(product.target_segment, segment)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Check segment compatibility using adjacency map from rules
   * @private
   */
  _checkSegmentCompatibility(productSegment, companySegment) {
    const adjacencyMap = this.ruleConfig.eligibility_filtering.rules.segment_compatibility.adjacency_map;

    if (productSegment === companySegment) return true;

    const compatible = adjacencyMap[productSegment] || [];
    return compatible.includes(companySegment);
  }

  /**
   * Calculate fit score for a product (formula protected)
   * Implements logic from banking_product_match_v1.0.json
   * @private
   */
  _calculateFitScore(product, input, segment) {
    const { industry, signals, average_salary_aed, has_free_zone_license, company_size } = input;

    let score = product.base_fit_score;

    // Industry bonus
    const industryLower = (industry || 'default').toLowerCase();
    const globalBonuses = this.ruleConfig.fit_score_calculation.multipliers.industry_bonus.global_bonuses;
    const globalMultiplier = this.ruleConfig.fit_score_calculation.multipliers.industry_bonus.global_multiplier;

    if (product.industry_bonus && product.industry_bonus[industryLower]) {
      score += product.industry_bonus[industryLower];
    } else if (globalBonuses[industryLower]) {
      score += globalBonuses[industryLower] * globalMultiplier;
    }

    // Signal multiplier
    const signalMultipliers = this.ruleConfig.fit_score_calculation.multipliers.signal_multiplier.multipliers;
    let maxMultiplier = signalMultipliers.none || 1.0;

    if (signals && signals.length > 0) {
      for (const signal of signals) {
        const multiplier = signalMultipliers[signal] || signalMultipliers.none;
        maxMultiplier = Math.max(maxMultiplier, multiplier);
      }
    }
    score *= maxMultiplier;

    // Salary alignment bonus
    if (product.min_salary_aed && average_salary_aed) {
      const ratio = average_salary_aed / product.min_salary_aed;
      const salaryRules = this.ruleConfig.fit_score_calculation.multipliers.salary_alignment_bonus.rules;

      for (const rule of salaryRules) {
        if (rule.condition.ratio.gte && ratio >= rule.condition.ratio.gte) {
          score += rule.bonus;
          break;
        } else if (rule.condition.ratio.lt && ratio < rule.condition.ratio.lt) {
          score += rule.bonus;
          break;
        }
      }
    }

    // Free zone bonus
    if (has_free_zone_license && product.product_category === 'Business Banking') {
      const freeZoneMultiplier = this.ruleConfig.fit_score_calculation.multipliers.free_zone_bonus.multiplier;
      score *= freeZoneMultiplier;
    }

    // Cap at max_score
    const maxScore = this.ruleConfig.fit_score_calculation.max_score;
    score = Math.min(score, maxScore);

    // Build target audience
    const targetAudience = this._getTargetAudience(segment, company_size);

    return {
      product_id: product.product_id,
      product_name: product.product_name,
      product_category: product.product_category,
      fit_score: Math.round(score),
      target_audience: targetAudience,
      key_benefits: product.key_benefits || []
    };
  }

  /**
   * Get target audience label
   * @private
   */
  _getTargetAudience(segment, company_size) {
    const labels = this.ruleConfig.target_audience_labels;
    const template = labels[segment] || labels.default;
    return template.replace('{company_size}', company_size);
  }

  /**
   * Calculate confidence based on result quality
   * @private
   */
  _calculateConfidence(input, recommendedProducts, totalProducts) {
    let confidence = 1.0;
    const adjustments = this.ruleConfig.confidence_adjustments;

    // No products matched
    if (recommendedProducts.length === 0) {
      return adjustments.no_products_matched.confidence;
    }

    // Low top score
    if (recommendedProducts[0].fit_score < 60) {
      confidence *= adjustments.low_top_score.penalty_multiplier;
    }

    // No industry
    if (!input.industry || input.industry === 'default') {
      confidence *= adjustments.no_industry.penalty_multiplier;
    }

    // No signals
    if (!input.signals || input.signals.length === 0) {
      confidence *= adjustments.no_signals.penalty_multiplier;
    }

    // Ensure bounds
    return Math.max(0.5, Math.min(1.0, confidence));
  }
}
