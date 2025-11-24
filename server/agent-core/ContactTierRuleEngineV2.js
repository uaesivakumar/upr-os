/**
 * ContactTierRuleEngineV2 - Sprint 24
 *
 * Implements cognitive rules for contact tier classification from contact_tier_v2.0.json
 *
 * Features:
 * - Seniority inference from job titles
 * - Department inference from job titles
 * - Additive scoring (seniority + department + company size)
 * - Tier classification (STRATEGIC, PRIMARY, SECONDARY, BACKUP)
 * - Target title recommendations
 * - Confidence adjustments based on data quality
 * - Full explainability with reasoning breakdown
 *
 * Usage:
 *   const engine = new ContactTierRuleEngineV2();
 *   const result = await engine.execute(input);
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ContactTierRuleEngineV2 {
  constructor() {
    // Load cognitive rules
    const rulesPath = path.join(__dirname, 'contact_tier_v2.0.json');
    this.rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    this.version = this.rules.version;
  }

  /**
   * Main execution method
   */
  async execute(input) {
    const startTime = Date.now();
    const breakdown = [];
    const reasoning = [];

    try {
      // Phase 1: Infer missing fields
      const enrichedInput = this._inferMissingFields(input, breakdown, reasoning);

      // Phase 2: Calculate scores
      const scores = this._calculateScores(enrichedInput, breakdown, reasoning);

      // Phase 3: Classify tier
      const tier = this._classifyTier(enrichedInput, scores, breakdown, reasoning);

      // Phase 4: Recommend target titles
      const titles = this._recommendTitles(enrichedInput, breakdown, reasoning);

      // Phase 5: Calculate confidence
      const confidence = this._calculateConfidence(enrichedInput, breakdown, reasoning);

      const executionTime = Date.now() - startTime;

      return {
        tier: tier.tier,
        priority: tier.priority,
        confidence,
        target_titles: titles.target_titles,
        fallback_titles: titles.fallback_titles,
        _meta: {
          latency_ms: executionTime,
          version: this.version,
          scores,
          breakdown,
          reasoning,
          enriched_input: enrichedInput
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
   * Phase 1: Infer seniority and department from title if not provided
   */
  _inferMissingFields(input, breakdown, reasoning) {
    const enriched = { ...input };
    const titleLower = (input.title || '').toLowerCase();

    // Infer seniority if not provided
    if (!input.seniority_level || input.seniority_level === 'Unknown') {
      const inferredSeniority = this._inferSeniority(titleLower);
      enriched.seniority_level = inferredSeniority.level;
      enriched._seniority_inferred = true;

      breakdown.push({
        step: 'infer_seniority',
        value: inferredSeniority.level,
        keywords_matched: inferredSeniority.keywords,
        reason: `Inferred from title "${input.title}"`
      });

      reasoning.push(`Seniority "${inferredSeniority.level}" inferred from title keywords: ${inferredSeniority.keywords.join(', ')}`);
    } else {
      enriched._seniority_inferred = false;
      reasoning.push(`Seniority "${input.seniority_level}" provided explicitly`);
    }

    // Infer department if not provided
    if (!input.department || input.department === 'Other') {
      const inferredDepartment = this._inferDepartment(titleLower);
      enriched.department = inferredDepartment.department;
      enriched._department_inferred = true;

      breakdown.push({
        step: 'infer_department',
        value: inferredDepartment.department,
        keywords_matched: inferredDepartment.keywords,
        reason: `Inferred from title "${input.title}"`
      });

      reasoning.push(`Department "${inferredDepartment.department}" inferred from title keywords: ${inferredDepartment.keywords.join(', ')}`);
    } else {
      enriched._department_inferred = false;
      reasoning.push(`Department "${input.department}" provided explicitly`);
    }

    return enriched;
  }

  /**
   * Infer seniority level from job title
   */
  _inferSeniority(titleLower) {
    const { keywords, default: defaultLevel } = this.rules.inference_rules.infer_seniority;

    for (const [level, keywordList] of Object.entries(keywords)) {
      const matchedKeywords = keywordList.filter(kw => titleLower.includes(kw));
      if (matchedKeywords.length > 0) {
        return { level, keywords: matchedKeywords };
      }
    }

    return { level: defaultLevel, keywords: [] };
  }

  /**
   * Infer department from job title
   */
  _inferDepartment(titleLower) {
    const { keywords, default: defaultDept } = this.rules.inference_rules.infer_department;

    for (const [department, keywordList] of Object.entries(keywords)) {
      const matchedKeywords = keywordList.filter(kw => titleLower.includes(kw));
      if (matchedKeywords.length > 0) {
        return { department, keywords: matchedKeywords };
      }
    }

    return { department: defaultDept, keywords: [] };
  }

  /**
   * Phase 2: Calculate additive scores
   */
  _calculateScores(input, breakdown, reasoning) {
    const scores = {};

    // Seniority score (0-40 points)
    const seniorityWeights = this.rules.scoring_rules.seniority_score.weights;
    scores.seniority = seniorityWeights[input.seniority_level] || seniorityWeights.Unknown;

    breakdown.push({
      step: 'seniority_score',
      value: scores.seniority,
      max: 40,
      reason: `"${input.seniority_level}" seniority level`
    });

    reasoning.push(`Seniority score: ${scores.seniority}/40 (${input.seniority_level})`);

    // Department score (0-30 points)
    const departmentWeights = this.rules.scoring_rules.department_score.weights;
    scores.department = departmentWeights[input.department] || departmentWeights.Other;

    breakdown.push({
      step: 'department_score',
      value: scores.department,
      max: 30,
      reason: `"${input.department}" department`
    });

    reasoning.push(`Department score: ${scores.department}/30 (${input.department})`);

    // Company size score (0-30 points)
    const sizeBuckets = this.rules.scoring_rules.company_size_score.buckets;
    const sizeBucket = sizeBuckets.find(bucket =>
      input.company_size >= bucket.range[0] && input.company_size < bucket.range[1]
    );
    scores.company_size = sizeBucket ? sizeBucket.score : 10;

    breakdown.push({
      step: 'company_size_score',
      value: scores.company_size,
      max: 30,
      reason: sizeBucket ? sizeBucket.label : 'Unknown size bucket'
    });

    reasoning.push(`Company size score: ${scores.company_size}/30 (${input.company_size} employees - ${sizeBucket?.label || 'unknown'})`);

    // Total score
    scores.total = scores.seniority + scores.department + scores.company_size;

    breakdown.push({
      step: 'total_score',
      value: scores.total,
      max: 100,
      formula: `${scores.seniority} + ${scores.department} + ${scores.company_size}`,
      reason: 'Sum of seniority + department + company size scores'
    });

    reasoning.push(`Total score: ${scores.total}/100`);

    return scores;
  }

  /**
   * Phase 3: Classify tier based on conditions
   */
  _classifyTier(input, scores, breakdown, reasoning) {
    const tierRules = this.rules.tier_classification_rules;

    // Check each tier in priority order
    for (const [tierName, tierRule] of Object.entries(tierRules)) {
      for (const condition of tierRule.conditions) {
        if (this._evaluateCondition(input, condition)) {
          breakdown.push({
            step: 'tier_classification',
            value: tierName,
            priority: tierRule.priority,
            reason: tierRule.description
          });

          reasoning.push(`Classified as "${tierName}" tier (priority ${tierRule.priority}): ${tierRule.description}`);

          return {
            tier: tierName,
            priority: tierRule.priority
          };
        }
      }
    }

    // Default to BACKUP tier
    breakdown.push({
      step: 'tier_classification',
      value: 'BACKUP',
      priority: 4,
      reason: 'No specific tier conditions matched - default tier'
    });

    reasoning.push('Classified as "BACKUP" tier (priority 4): Default tier');

    return {
      tier: 'BACKUP',
      priority: 4
    };
  }

  /**
   * Evaluate tier classification condition
   */
  _evaluateCondition(input, condition) {
    // Default condition (always matches)
    if (condition.default) {
      return true;
    }

    // Check seniority condition
    if (condition.seniority) {
      const seniorityMatch = Array.isArray(condition.seniority)
        ? condition.seniority.includes(input.seniority_level)
        : condition.seniority === input.seniority_level;

      if (!seniorityMatch) return false;
    }

    // Check department condition
    if (condition.department) {
      const departmentMatch = Array.isArray(condition.department)
        ? condition.department.includes(input.department)
        : condition.department === input.department;

      if (!departmentMatch) return false;
    }

    // Check company size condition
    if (condition.company_size) {
      if (condition.company_size.min !== undefined && input.company_size < condition.company_size.min) {
        return false;
      }
      if (condition.company_size.max !== undefined && input.company_size >= condition.company_size.max) {
        return false;
      }
    }

    return true;
  }

  /**
   * Phase 4: Recommend target titles based on company profile
   */
  _recommendTitles(input, breakdown, reasoning) {
    const titleRules = this.rules.target_titles_rules.rules;

    // Find matching rule
    for (const rule of titleRules) {
      if (this._evaluateTitleCondition(input, rule.condition)) {
        let targetTitles = [...rule.target_titles];
        let fallbackTitles = [...rule.fallback_titles];

        // Apply high hiring velocity modifier
        const hiringModifier = this.rules.target_titles_rules.high_hiring_velocity_modifier;
        if (input.hiring_velocity_monthly >= hiringModifier.condition.hiring_velocity_monthly.min) {
          targetTitles = [...hiringModifier.prepend_target_titles, ...targetTitles];
          fallbackTitles = [...hiringModifier.prepend_fallback_titles, ...fallbackTitles];

          reasoning.push(`High hiring velocity (${input.hiring_velocity_monthly}/month) - added talent acquisition titles`);
        }

        breakdown.push({
          step: 'target_titles',
          rule: rule.name,
          target_titles: targetTitles,
          fallback_titles: fallbackTitles,
          reason: `Matched rule: ${rule.name}`
        });

        reasoning.push(`Target titles recommended based on ${rule.name} profile`);

        return {
          target_titles: targetTitles,
          fallback_titles: fallbackTitles
        };
      }
    }

    // Default titles (should never reach here due to default rule)
    return {
      target_titles: ['HR Manager', 'Office Manager'],
      fallback_titles: ['Admin Manager']
    };
  }

  /**
   * Evaluate title recommendation condition
   */
  _evaluateTitleCondition(input, condition) {
    // Default condition (always matches)
    if (condition.default) {
      return true;
    }

    // Check company size
    if (condition.company_size) {
      if (condition.company_size.min !== undefined && input.company_size < condition.company_size.min) {
        return false;
      }
      if (condition.company_size.max !== undefined && input.company_size >= condition.company_size.max) {
        return false;
      }
    }

    // Check company maturity
    if (condition.company_maturity_years) {
      const maturity = input.company_maturity_years || 0;
      if (condition.company_maturity_years.min !== undefined && maturity < condition.company_maturity_years.min) {
        return false;
      }
      if (condition.company_maturity_years.max !== undefined && maturity >= condition.company_maturity_years.max) {
        return false;
      }
    }

    return true;
  }

  /**
   * Phase 5: Calculate confidence with adjustments
   */
  _calculateConfidence(input, breakdown, reasoning) {
    const { base_confidence, penalties, min_confidence, max_confidence } = this.rules.confidence_adjustments;

    let confidence = base_confidence;
    const appliedPenalties = [];

    // Apply penalties
    penalties.forEach(penalty => {
      let shouldApply = false;

      if (penalty.condition === 'seniority_inferred' && input._seniority_inferred) {
        shouldApply = true;
      } else if (penalty.condition === 'department_inferred' && input._department_inferred) {
        shouldApply = true;
      } else if (penalty.condition === 'short_title') {
        const wordCount = (input.title || '').trim().split(/\s+/).length;
        if (wordCount <= 1) {
          shouldApply = true;
        }
      }

      if (shouldApply) {
        confidence -= penalty.penalty;
        appliedPenalties.push({
          condition: penalty.condition,
          penalty: penalty.penalty,
          reason: penalty.reason
        });
      }
    });

    // Clamp confidence
    confidence = Math.max(min_confidence, Math.min(max_confidence, confidence));

    if (appliedPenalties.length > 0) {
      breakdown.push({
        step: 'confidence_adjustments',
        base: base_confidence,
        penalties: appliedPenalties,
        final: confidence,
        reason: `Applied ${appliedPenalties.length} confidence penalties`
      });

      reasoning.push(`Confidence: ${confidence.toFixed(2)} (${appliedPenalties.map(p => `-${p.penalty} for ${p.condition}`).join(', ')})`);
    } else {
      breakdown.push({
        step: 'confidence_adjustments',
        base: base_confidence,
        penalties: [],
        final: confidence,
        reason: 'No confidence penalties applied'
      });

      reasoning.push(`Confidence: ${confidence.toFixed(2)} (no penalties)`);
    }

    return confidence;
  }
}

export default ContactTierRuleEngineV2;
