/**
 * BankingProductMatchRuleEngineV1 - Sprint 25
 *
 * Implements cognitive rules for banking product matching from banking_product_match_v1.0.json
 *
 * Features:
 * - Product catalog loading and filtering
 * - Segment inference from company size
 * - Eligibility filtering (size, salary, segment compatibility)
 * - Fit score calculation with industry bonuses and signal multipliers
 * - Top 5 product selection with priority ranking
 * - Confidence adjustments based on results quality
 * - Full explainability with reasoning breakdown
 *
 * Usage:
 *   const engine = new BankingProductMatchRuleEngineV1();
 *   const result = await engine.execute(input);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BankingProductMatchRuleEngineV1 {
  constructor() {
    // Load cognitive rules
    const rulesPath = path.join(__dirname, 'banking_product_match_v1.0.json');
    this.rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    this.version = this.rules.version;
    this.ruleConfig = this.rules.rules.match_banking_products;

    // Load product catalog
    const catalogPath = path.join(__dirname, '..', 'siva-tools', 'data', 'emiratesnbd-products.json');
    this.productCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  }

  /**
   * Main execution method
   */
  async execute(input) {
    const startTime = Date.now();
    const breakdown = [];
    const reasoning = [];

    try {
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

      // Phase 1: Infer segment if not provided
      const inferredSegment = segment || this._inferSegment(company_size, breakdown, reasoning);

      // Phase 2: Collect all products from catalog
      const allProducts = this._collectAllProducts(breakdown);

      // Phase 3: Filter eligible products
      const eligibleProducts = this._filterEligibleProducts(
        allProducts,
        company_size,
        average_salary_aed,
        inferredSegment,
        breakdown,
        reasoning
      );

      // Phase 4: Calculate fit scores
      const scoredProducts = this._calculateFitScores(
        eligibleProducts,
        {
          industry,
          signals,
          average_salary_aed,
          has_free_zone_license,
          company_size
        },
        breakdown,
        reasoning
      );

      // Phase 5: Sort and select top 5
      scoredProducts.sort((a, b) => b.fit_score - a.fit_score);
      const topProducts = scoredProducts.slice(0, 5);

      // Phase 6: Add priority rankings
      const recommendedProducts = topProducts.map((product, index) => ({
        ...product,
        priority: index + 1
      }));

      // Phase 7: Build target audience labels
      const targetAudience = this._buildTargetAudience(inferredSegment, company_size);
      recommendedProducts.forEach(product => {
        product.target_audience = targetAudience;
      });

      // Phase 8: Calculate confidence
      const confidence = this._calculateConfidence(
        recommendedProducts,
        industry,
        signals,
        breakdown
      );

      // Phase 9: Classify confidence level
      const confidenceLevel = this._classifyConfidenceLevel(confidence);

      const executionTime = Date.now() - startTime;

      return {
        recommended_products: recommendedProducts,
        confidence: parseFloat(confidence.toFixed(2)),
        timestamp: new Date().toISOString(),
        metadata: {
          confidenceLevel,
          segment_match: inferredSegment,
          total_products_considered: allProducts.length
        },
        _meta: {
          latency_ms: executionTime,
          tool_name: 'match_banking_products',
          tool_type: 'STRICT',
          policy_version: this.version,
          breakdown,
          reasoning_steps: reasoning
        }
      };

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
   * Phase 1: Infer segment from company size
   */
  _inferSegment(company_size, breakdown, reasoning) {
    const { segment_inference } = this.ruleConfig;

    for (const rule of segment_inference.rules) {
      const { condition, segment } = rule;
      if (condition.company_size.lt && company_size < condition.company_size.lt) {
        breakdown.push({ step: 'infer_segment', company_size, segment, rule: condition });
        reasoning.push(`Segment "${segment}" inferred from company size ${company_size}`);
        return segment;
      } else if (condition.company_size.gte && company_size >= condition.company_size.gte) {
        breakdown.push({ step: 'infer_segment', company_size, segment, rule: condition });
        reasoning.push(`Segment "${segment}" inferred from company size ${company_size}`);
        return segment;
      }
    }

    // Default: sme
    const defaultSegment = 'sme';
    breakdown.push({ step: 'infer_segment', company_size, segment: defaultSegment, rule: 'default' });
    reasoning.push(`Segment "${defaultSegment}" (default) for company size ${company_size}`);
    return defaultSegment;
  }

  /**
   * Phase 2: Collect all products from catalog
   */
  _collectAllProducts(breakdown) {
    const allProducts = [
      ...this.productCatalog.salary_accounts,
      ...this.productCatalog.credit_cards,
      ...this.productCatalog.business_accounts,
      ...this.productCatalog.personal_loans,
      ...this.productCatalog.insurance_products
    ];

    breakdown.push({ step: 'collect_products', total: allProducts.length });
    return allProducts;
  }

  /**
   * Phase 3: Filter eligible products
   */
  _filterEligibleProducts(allProducts, company_size, average_salary_aed, segment, breakdown, reasoning) {
    const eligibleProducts = allProducts.filter(product => {
      // Size eligibility
      if (company_size < product.company_size_min || company_size > product.company_size_max) {
        return false;
      }

      // Salary eligibility (if specified)
      if (product.min_salary_aed !== null && average_salary_aed !== undefined) {
        if (average_salary_aed < product.min_salary_aed) {
          return false;
        }
        if (product.max_salary_aed !== null && average_salary_aed > product.max_salary_aed) {
          return false;
        }
      }

      // Segment compatibility
      if (product.target_segment !== 'all') {
        const compatible = this._checkSegmentCompatibility(product.target_segment, segment);
        if (!compatible) {
          return false;
        }
      }

      return true;
    });

    breakdown.push({
      step: 'filter_eligible',
      total: allProducts.length,
      eligible: eligibleProducts.length,
      filtered_out: allProducts.length - eligibleProducts.length
    });
    reasoning.push(`Filtered to ${eligibleProducts.length} eligible products from ${allProducts.length} total`);

    return eligibleProducts;
  }

  /**
   * Check segment compatibility (exact or adjacent)
   */
  _checkSegmentCompatibility(productSegment, companySegment) {
    const { adjacency_map } = this.ruleConfig.eligibility_filtering.rules.segment_compatibility;

    // Exact match
    if (productSegment === companySegment) return true;

    // Adjacent match
    const compatible = adjacency_map[productSegment] || [];
    return compatible.includes(companySegment);
  }

  /**
   * Phase 4: Calculate fit scores for eligible products
   */
  _calculateFitScores(eligibleProducts, context, breakdown, reasoning) {
    const scoredProducts = eligibleProducts.map(product => {
      let score = product.base_fit_score;
      const scoreComponents = [];

      // Industry bonus
      const industryBonus = this._calculateIndustryBonus(product, context.industry);
      if (industryBonus > 0) {
        score += industryBonus;
        scoreComponents.push(`industry_bonus: +${industryBonus}`);
      }

      // Signal multiplier
      const signalMultiplier = this._calculateSignalMultiplier(context.signals);
      if (signalMultiplier > 1.0) {
        score *= signalMultiplier;
        scoreComponents.push(`signal_multiplier: ${signalMultiplier}x`);
      }

      // Salary alignment bonus
      if (product.min_salary_aed && context.average_salary_aed) {
        const salaryBonus = this._calculateSalaryBonus(product.min_salary_aed, context.average_salary_aed);
        if (salaryBonus > 0) {
          score += salaryBonus;
          scoreComponents.push(`salary_bonus: +${salaryBonus}`);
        }
      }

      // Free zone bonus
      if (context.has_free_zone_license && product.product_category === 'Business Banking') {
        score *= 1.1;
        scoreComponents.push(`free_zone_bonus: 1.1x`);
      }

      // Cap at 100
      score = Math.min(score, 100);

      return {
        product_id: product.product_id,
        product_name: product.product_name,
        product_category: product.product_category,
        fit_score: Math.round(score),
        key_benefits: product.key_benefits || [],
        _score_components: scoreComponents
      };
    });

    breakdown.push({
      step: 'calculate_fit_scores',
      products_scored: scoredProducts.length,
      score_range: scoredProducts.length > 0
        ? [Math.min(...scoredProducts.map(p => p.fit_score)), Math.max(...scoredProducts.map(p => p.fit_score))]
        : [0, 0]
    });

    return scoredProducts;
  }

  /**
   * Calculate industry bonus
   */
  _calculateIndustryBonus(product, industry) {
    const { global_bonuses, global_multiplier } = this.ruleConfig.fit_score_calculation.multipliers.industry_bonus;
    const industryLower = industry.toLowerCase();

    // Check product-specific industry bonus
    if (product.industry_bonus && product.industry_bonus[industryLower]) {
      return product.industry_bonus[industryLower];
    }

    // Use global industry bonus
    const globalBonus = global_bonuses[industryLower] || global_bonuses['default'];
    return globalBonus * global_multiplier;
  }

  /**
   * Calculate signal multiplier (use MAX)
   */
  _calculateSignalMultiplier(signals) {
    const { multipliers } = this.ruleConfig.fit_score_calculation.multipliers.signal_multiplier;

    let maxMultiplier = 1.0;
    for (const signal of signals) {
      const multiplier = multipliers[signal] || multipliers['none'];
      maxMultiplier = Math.max(maxMultiplier, multiplier);
    }

    return maxMultiplier;
  }

  /**
   * Calculate salary alignment bonus
   */
  _calculateSalaryBonus(min_salary_aed, average_salary_aed) {
    const ratio = average_salary_aed / min_salary_aed;
    const { rules } = this.ruleConfig.fit_score_calculation.multipliers.salary_alignment_bonus;

    for (const rule of rules) {
      if (rule.condition.ratio.gte && ratio >= rule.condition.ratio.gte) {
        return rule.bonus;
      } else if (rule.condition.ratio.lt && ratio < rule.condition.ratio.lt) {
        return rule.bonus;
      }
    }

    return 0;
  }

  /**
   * Phase 7: Build target audience label
   */
  _buildTargetAudience(segment, company_size) {
    const { target_audience_labels } = this.ruleConfig;
    const template = target_audience_labels[segment] || target_audience_labels['default'];
    return template.replace('{company_size}', company_size);
  }

  /**
   * Phase 8: Calculate confidence with adjustments
   */
  _calculateConfidence(recommendedProducts, industry, signals, breakdown) {
    let confidence = 1.0;
    const penalties = [];

    // No products matched
    if (recommendedProducts.length === 0) {
      confidence = 0.5;
      penalties.push({ reason: 'No eligible products found', confidence: 0.5 });
      breakdown.push({ step: 'confidence', penalties, final: confidence });
      return confidence;
    }

    // Low top score
    if (recommendedProducts[0].fit_score < 60) {
      confidence *= 0.8;
      penalties.push({ reason: 'Top product has low fit score', multiplier: 0.8 });
    }

    // No industry
    if (!industry || industry === 'default') {
      confidence *= 0.9;
      penalties.push({ reason: 'Industry not specified', multiplier: 0.9 });
    }

    // No signals
    if (signals.length === 0) {
      confidence *= 0.85;
      penalties.push({ reason: 'No growth signals provided', multiplier: 0.85 });
    }

    // Ensure confidence bounds [0.5, 1.0]
    confidence = Math.max(0.5, Math.min(1.0, confidence));

    if (penalties.length > 0) {
      breakdown.push({ step: 'confidence', base: 1.0, penalties, final: confidence });
    }

    return confidence;
  }

  /**
   * Phase 9: Classify confidence level
   */
  _classifyConfidenceLevel(confidence) {
    const { confidence_level_classification } = this.ruleConfig;

    if (confidence >= 0.85) return 'HIGH';
    if (confidence >= 0.65) return 'MEDIUM';
    return 'LOW';
  }
}
