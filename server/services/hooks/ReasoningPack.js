/**
 * Reasoning Pack Framework
 * Sprint 75: USP Hook Layer
 *
 * Interface for pluggable reasoning packs for different verticals
 */

import { uspHookRegistry, HOOK_POINTS, HOOK_TIMING } from './USPHookRegistry.js';

/**
 * Base Reasoning Pack Interface
 */
export class ReasoningPack {
  constructor(config = {}) {
    this.name = config.name || 'Base Reasoning Pack';
    this.verticalId = config.verticalId || 'default';
    this.version = config.version || '1.0';
    this.config = config;
    this.hookId = null;
  }

  /**
   * Analyze entity - to be implemented by subclasses
   * @param {Object} entity - Entity to analyze
   * @param {Object} context - Pipeline context
   * @returns {Promise<Object>}
   */
  async analyze(entity, context) {
    throw new Error('analyze() must be implemented by subclass');
  }

  /**
   * Generate explanation for analysis
   * @param {Object} analysis - Analysis result
   * @returns {Object}
   */
  explain(analysis) {
    return {
      summary: 'Analysis completed',
      factors: analysis.factors || [],
      confidence: analysis.confidence || 0.5
    };
  }

  /**
   * Suggest next actions based on analysis
   * @param {Object} analysis - Analysis result
   * @param {Object} context - Pipeline context
   * @returns {Object[]}
   */
  suggest(analysis, context) {
    return [];
  }

  /**
   * Register pack as pipeline hook
   * @returns {string} Hook ID
   */
  register() {
    this.hookId = uspHookRegistry.register({
      name: `${this.name} (${this.verticalId})`,
      step: HOOK_POINTS.SCORING,
      timing: HOOK_TIMING.POST,
      priority: 60,
      execute: this._execute.bind(this),
      enabled: this.config.enabled ?? true,
      config: {
        verticalId: this.verticalId,
        ...this.config
      }
    });
    return this.hookId;
  }

  /**
   * Hook execution wrapper
   * @private
   */
  async _execute(context, data) {
    const { entities = [] } = data;
    const results = [];

    // Only process entities matching this vertical
    const targetEntities = entities.filter(e =>
      !this.verticalId ||
      this.verticalId === 'default' ||
      e.vertical_id === this.verticalId ||
      context.verticalId === this.verticalId
    );

    for (const entity of targetEntities.slice(0, this.config.maxEntities || 20)) {
      try {
        const analysis = await this.analyze(entity, context);
        const explanation = this.explain(analysis);
        const suggestions = this.suggest(analysis, context);

        results.push({
          entity_id: entity.id,
          analysis,
          explanation,
          suggestions
        });
      } catch (error) {
        results.push({
          entity_id: entity.id,
          error: error.message
        });
      }
    }

    return {
      pack_name: this.name,
      vertical_id: this.verticalId,
      version: this.version,
      entities_analyzed: results.filter(r => !r.error).length,
      results
    };
  }
}

/**
 * Banking Vertical Reasoning Pack
 */
export class BankingReasoningPack extends ReasoningPack {
  constructor(config = {}) {
    super({
      name: 'Banking Intelligence Pack',
      verticalId: 'banking_employee',
      ...config
    });
  }

  async analyze(entity, context) {
    const factors = [];
    let score = 50;

    // Bank size and type
    const bankType = entity.properties?.bank_type || entity.bank_type;
    if (bankType === 'central_bank' || bankType === 'tier1') {
      score += 15;
      factors.push({ factor: 'bank_tier', impact: 15, note: 'Tier 1 or central bank' });
    }

    // Regulatory compliance signals
    if (entity.properties?.compliance_signal || entity.compliance_active) {
      score += 10;
      factors.push({ factor: 'compliance', impact: 10, note: 'Active compliance initiative' });
    }

    // Digital transformation signals
    if (entity.properties?.digital_transformation || entity.digital_initiative) {
      score += 15;
      factors.push({ factor: 'digital_transformation', impact: 15, note: 'Digital transformation in progress' });
    }

    // Credit rating
    const creditRating = entity.properties?.credit_rating;
    if (creditRating && ['AAA', 'AA', 'A'].includes(creditRating.toUpperCase())) {
      score += 10;
      factors.push({ factor: 'credit_rating', impact: 10, note: `Strong credit rating: ${creditRating}` });
    }

    return {
      score: Math.min(100, score),
      factors,
      confidence: factors.length > 2 ? 0.8 : 0.5,
      vertical_insights: {
        bank_tier: bankType,
        regulatory_focus: entity.properties?.regulatory_focus || [],
        employee_banking_potential: this._assessEmployeeBankingPotential(entity)
      }
    };
  }

  _assessEmployeeBankingPotential(entity) {
    const employees = entity.employee_count || entity.properties?.employee_count || 0;
    if (employees > 10000) return 'high';
    if (employees > 1000) return 'medium';
    return 'low';
  }

  suggest(analysis, context) {
    const suggestions = [];

    if (analysis.vertical_insights?.employee_banking_potential === 'high') {
      suggestions.push({
        action: 'Position corporate employee banking solution',
        priority: 'high',
        reason: 'Large employee base presents significant opportunity'
      });
    }

    if (analysis.factors.some(f => f.factor === 'compliance')) {
      suggestions.push({
        action: 'Lead with compliance and regulatory messaging',
        priority: 'high',
        reason: 'Active compliance focus detected'
      });
    }

    return suggestions;
  }
}

/**
 * Insurance Vertical Reasoning Pack
 */
export class InsuranceReasoningPack extends ReasoningPack {
  constructor(config = {}) {
    super({
      name: 'Insurance Intelligence Pack',
      verticalId: 'insurance_individual',
      ...config
    });
  }

  async analyze(entity, context) {
    const factors = [];
    let score = 50;

    // Life event signals
    const lifeEvents = entity.properties?.life_events || [];
    if (lifeEvents.length > 0) {
      const impactfulEvents = lifeEvents.filter(e =>
        ['job_change', 'relocation', 'marriage', 'new_home', 'new_child'].includes(e.type)
      );
      if (impactfulEvents.length > 0) {
        score += impactfulEvents.length * 10;
        factors.push({
          factor: 'life_events',
          impact: impactfulEvents.length * 10,
          note: `${impactfulEvents.length} significant life events detected`
        });
      }
    }

    // Income bracket
    const incomeBracket = entity.properties?.income_bracket;
    if (incomeBracket === 'high' || incomeBracket === 'affluent') {
      score += 15;
      factors.push({ factor: 'income', impact: 15, note: 'High income bracket' });
    }

    // Existing coverage gaps
    if (entity.properties?.coverage_gap || !entity.properties?.has_insurance) {
      score += 20;
      factors.push({ factor: 'coverage_gap', impact: 20, note: 'Coverage gap identified' });
    }

    // Age-based opportunity
    const age = entity.properties?.age;
    if (age && age >= 30 && age <= 50) {
      score += 10;
      factors.push({ factor: 'age_bracket', impact: 10, note: 'Prime insurance age bracket' });
    }

    return {
      score: Math.min(100, score),
      factors,
      confidence: factors.length > 2 ? 0.8 : 0.5,
      vertical_insights: {
        life_stage: this._determineLifeStage(entity),
        recommended_products: this._recommendProducts(entity),
        urgency: lifeEvents.length > 0 ? 'high' : 'normal'
      }
    };
  }

  _determineLifeStage(entity) {
    const age = entity.properties?.age;
    const hasChildren = entity.properties?.has_children;

    if (age < 30) return 'young_professional';
    if (age < 45 && hasChildren) return 'family_builder';
    if (age < 55) return 'wealth_accumulator';
    return 'retirement_planner';
  }

  _recommendProducts(entity) {
    const products = [];
    const lifeStage = this._determineLifeStage(entity);

    if (lifeStage === 'young_professional') {
      products.push('term_life', 'health_insurance');
    } else if (lifeStage === 'family_builder') {
      products.push('whole_life', 'child_education_plan', 'health_family');
    } else if (lifeStage === 'wealth_accumulator') {
      products.push('investment_linked', 'retirement_plan');
    } else {
      products.push('annuity', 'medicare_supplement');
    }

    return products;
  }

  suggest(analysis, context) {
    const suggestions = [];

    if (analysis.vertical_insights?.urgency === 'high') {
      suggestions.push({
        action: 'Prioritize immediate outreach',
        priority: 'high',
        reason: 'Recent life events create urgency'
      });
    }

    const products = analysis.vertical_insights?.recommended_products || [];
    if (products.length > 0) {
      suggestions.push({
        action: `Lead with ${products[0].replace(/_/g, ' ')} offering`,
        priority: 'high',
        reason: `Best fit for ${analysis.vertical_insights?.life_stage} life stage`
      });
    }

    return suggestions;
  }
}

/**
 * SaaS B2B Reasoning Pack
 */
export class SaaSReasoningPack extends ReasoningPack {
  constructor(config = {}) {
    super({
      name: 'SaaS B2B Intelligence Pack',
      verticalId: 'saas_b2b',
      ...config
    });
  }

  async analyze(entity, context) {
    const factors = [];
    let score = 50;

    // Tech stack analysis
    const techStack = entity.properties?.tech_stack || [];
    if (techStack.length > 0) {
      const relevantTech = this._analyzeRelevantTech(techStack);
      if (relevantTech.opportunity > 0) {
        score += relevantTech.opportunity;
        factors.push({
          factor: 'tech_stack',
          impact: relevantTech.opportunity,
          note: relevantTech.note
        });
      }
    }

    // Growth signals
    if (entity.properties?.recent_funding || entity.funding_signal) {
      score += 20;
      factors.push({ factor: 'funding', impact: 20, note: 'Recent funding round' });
    }

    // Hiring in relevant roles
    if (entity.properties?.hiring_tech || entity.hiring_signal) {
      score += 15;
      factors.push({ factor: 'tech_hiring', impact: 15, note: 'Hiring technical roles' });
    }

    // Company growth rate
    const growthRate = entity.properties?.growth_rate || entity.growth_rate;
    if (growthRate && growthRate > 20) {
      score += 10;
      factors.push({ factor: 'growth_rate', impact: 10, note: `${growthRate}% growth rate` });
    }

    return {
      score: Math.min(100, score),
      factors,
      confidence: factors.length > 2 ? 0.8 : 0.5,
      vertical_insights: {
        tech_maturity: this._assessTechMaturity(techStack),
        integration_complexity: this._assessIntegrationComplexity(entity),
        deal_size_potential: this._estimateDealSize(entity)
      }
    };
  }

  _analyzeRelevantTech(techStack) {
    // Check for complementary or competitive tech
    const complementary = ['salesforce', 'hubspot', 'slack', 'aws', 'gcp', 'azure'];
    const competitive = []; // Would be populated based on your product

    const hasComplementary = techStack.some(t =>
      complementary.includes(t.toLowerCase())
    );
    const hasCompetitive = techStack.some(t =>
      competitive.includes(t.toLowerCase())
    );

    if (hasCompetitive) {
      return { opportunity: 5, note: 'Using competitive solution - displacement opportunity' };
    }
    if (hasComplementary) {
      return { opportunity: 15, note: 'Complementary tech stack detected' };
    }
    return { opportunity: 0, note: 'No relevant tech signals' };
  }

  _assessTechMaturity(techStack) {
    if (techStack.length > 10) return 'mature';
    if (techStack.length > 5) return 'growing';
    return 'early';
  }

  _assessIntegrationComplexity(entity) {
    const employees = entity.employee_count || entity.properties?.employee_count || 0;
    const techStack = entity.properties?.tech_stack || [];

    if (employees > 5000 && techStack.length > 10) return 'high';
    if (employees > 500) return 'medium';
    return 'low';
  }

  _estimateDealSize(entity) {
    const employees = entity.employee_count || entity.properties?.employee_count || 0;
    if (employees > 10000) return 'enterprise';
    if (employees > 1000) return 'mid_market';
    if (employees > 100) return 'smb_plus';
    return 'smb';
  }

  suggest(analysis, context) {
    const suggestions = [];

    if (analysis.vertical_insights?.deal_size_potential === 'enterprise') {
      suggestions.push({
        action: 'Assign senior AE and involve solution architect',
        priority: 'high',
        reason: 'Enterprise deal potential'
      });
    }

    if (analysis.vertical_insights?.integration_complexity === 'high') {
      suggestions.push({
        action: 'Prepare detailed implementation timeline',
        priority: 'medium',
        reason: 'Complex integration expected'
      });
    }

    if (analysis.factors.some(f => f.factor === 'funding')) {
      suggestions.push({
        action: 'Move quickly - budget available',
        priority: 'high',
        reason: 'Recent funding indicates purchasing capacity'
      });
    }

    return suggestions;
  }
}

// Factory function to create reasoning pack by vertical
export function createReasoningPack(verticalId, config = {}) {
  switch (verticalId) {
    case 'banking_employee':
    case 'banking_corporate':
      return new BankingReasoningPack(config);
    case 'insurance_individual':
      return new InsuranceReasoningPack(config);
    case 'saas_b2b':
      return new SaaSReasoningPack(config);
    default:
      return new ReasoningPack({ ...config, verticalId });
  }
}

export default ReasoningPack;
