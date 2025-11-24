/**
 * SIVA-X Hook
 * Sprint 75: USP Hook Layer
 *
 * Integrates cognitive intelligence at scoring step
 * Calls SIVA reasoning for complex entity evaluation
 */

import { uspHookRegistry, HOOK_POINTS, HOOK_TIMING } from './USPHookRegistry.js';

/**
 * SIVA-X Hook Implementation
 * Provides cognitive intelligence augmentation to scoring
 */
class SIVAXHook {
  constructor(config = {}) {
    this.name = 'SIVA-X Cognitive Intelligence';
    this.config = {
      enabled: config.enabled ?? true,
      minScoreThreshold: config.minScoreThreshold || 50,
      maxEntitiesToProcess: config.maxEntitiesToProcess || 20,
      cognitiveRulesVersion: config.cognitiveRulesVersion || '2.0',
      timeout: config.timeout || 10000, // 10 second timeout
      ...config
    };
    this.hookId = null;
  }

  /**
   * Register the hook with the registry
   * @returns {string} Hook ID
   */
  register() {
    this.hookId = uspHookRegistry.register({
      name: this.name,
      step: HOOK_POINTS.SCORING,
      timing: HOOK_TIMING.POST,
      priority: 50, // Run early in post-scoring
      execute: this.execute.bind(this),
      enabled: this.config.enabled,
      config: this.config
    });

    console.log(`[SIVAXHook] Registered with ID: ${this.hookId}`);
    return this.hookId;
  }

  /**
   * Execute the SIVA-X cognitive analysis
   * @param {Object} context - Pipeline context
   * @param {Object} data - Scored entities data
   * @returns {Promise<Object>}
   */
  async execute(context, data) {
    const startTime = Date.now();
    const { entities = [], scores = {} } = data;

    // Filter entities for cognitive analysis
    const entitiesToAnalyze = this._selectEntitiesForAnalysis(entities, scores);

    if (entitiesToAnalyze.length === 0) {
      return {
        success: true,
        analyzed: 0,
        reason: 'No entities met threshold for cognitive analysis',
        execution_time_ms: Date.now() - startTime
      };
    }

    // Run cognitive analysis on each entity
    const results = [];
    for (const entity of entitiesToAnalyze) {
      try {
        const analysis = await this._analyzeEntity(entity, context);
        results.push({
          entity_id: entity.id,
          entity_name: entity.name,
          cognitive_analysis: analysis,
          score_adjustment: analysis.score_adjustment
        });
      } catch (error) {
        console.error(`[SIVAXHook] Analysis failed for ${entity.id}:`, error.message);
        results.push({
          entity_id: entity.id,
          entity_name: entity.name,
          error: error.message
        });
      }
    }

    return {
      success: true,
      analyzed: results.filter(r => !r.error).length,
      failed: results.filter(r => r.error).length,
      results,
      execution_time_ms: Date.now() - startTime,
      rules_version: this.config.cognitiveRulesVersion
    };
  }

  /**
   * Select entities that need cognitive analysis
   * @private
   */
  _selectEntitiesForAnalysis(entities, scores) {
    return entities
      .filter(entity => {
        const entityScore = scores[entity.id]?.composite || entity.composite_score || 0;
        // Analyze entities above threshold that might benefit from deeper analysis
        return entityScore >= this.config.minScoreThreshold;
      })
      .slice(0, this.config.maxEntitiesToProcess);
  }

  /**
   * Analyze single entity with SIVA cognitive rules
   * @private
   */
  async _analyzeEntity(entity, context) {
    // Apply cognitive rules based on entity type and context
    const cognitiveFactors = {
      decision_complexity: this._assessDecisionComplexity(entity, context),
      stakeholder_alignment: this._assessStakeholderAlignment(entity, context),
      timing_signals: this._assessTimingSignals(entity, context),
      competitive_position: this._assessCompetitivePosition(entity, context),
      relationship_strength: this._assessRelationshipStrength(entity, context)
    };

    // Calculate cognitive score adjustment
    const scoreAdjustment = this._calculateScoreAdjustment(cognitiveFactors);

    // Generate reasoning
    const reasoning = this._generateReasoning(cognitiveFactors, entity);

    return {
      cognitive_factors: cognitiveFactors,
      score_adjustment: scoreAdjustment,
      reasoning,
      confidence: this._calculateConfidence(cognitiveFactors),
      recommendations: this._generateRecommendations(cognitiveFactors, entity)
    };
  }

  /**
   * Assess decision complexity
   * @private
   */
  _assessDecisionComplexity(entity, context) {
    const factors = [];
    let score = 50; // Baseline

    // Company size affects complexity
    const employees = entity.employee_count || entity.properties?.employee_count;
    if (employees > 1000) {
      score -= 10;
      factors.push('Large enterprise - complex decision chain');
    } else if (employees < 50) {
      score += 10;
      factors.push('Small company - simpler decision process');
    }

    // Multiple stakeholders increase complexity
    const stakeholders = entity.stakeholders?.length || entity.properties?.stakeholder_count || 1;
    if (stakeholders > 5) {
      score -= 15;
      factors.push(`${stakeholders} stakeholders - consensus building needed`);
    }

    // Region affects decision style
    const region = context.regionContext?.region?.region_code;
    if (region === 'UAE') {
      score += 5;
      factors.push('UAE region - typically faster decisions');
    } else if (region === 'IND') {
      score -= 5;
      factors.push('India region - hierarchical approval process');
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  /**
   * Assess stakeholder alignment
   * @private
   */
  _assessStakeholderAlignment(entity, context) {
    const factors = [];
    let score = 50;

    // Has champion identified
    if (entity.has_champion || entity.properties?.champion_identified) {
      score += 20;
      factors.push('Internal champion identified');
    }

    // Decision maker engaged
    if (entity.dm_engaged || entity.properties?.decision_maker_engaged) {
      score += 15;
      factors.push('Decision maker engaged');
    }

    // Technical evaluation positive
    if (entity.tech_eval_positive || entity.properties?.tech_evaluation === 'positive') {
      score += 10;
      factors.push('Positive technical evaluation');
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  /**
   * Assess timing signals
   * @private
   */
  _assessTimingSignals(entity, context) {
    const factors = [];
    let score = 50;

    // Budget cycle timing
    const budgetCycle = entity.budget_cycle || entity.properties?.budget_cycle;
    if (budgetCycle === 'active' || budgetCycle === 'planning') {
      score += 15;
      factors.push('Favorable budget cycle');
    }

    // Recent signals
    const recentSignals = entity.recent_signals?.length || 0;
    if (recentSignals > 0) {
      score += Math.min(20, recentSignals * 5);
      factors.push(`${recentSignals} recent positive signals`);
    }

    // Hiring signal
    if (entity.hiring_signal || entity.properties?.is_hiring) {
      score += 10;
      factors.push('Active hiring - growth mode');
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  /**
   * Assess competitive position
   * @private
   */
  _assessCompetitivePosition(entity, context) {
    const factors = [];
    let score = 50;

    // Incumbent status
    if (entity.no_incumbent || entity.properties?.incumbent === 'none') {
      score += 20;
      factors.push('No incumbent - greenfield opportunity');
    } else if (entity.weak_incumbent) {
      score += 10;
      factors.push('Weak incumbent - displacement opportunity');
    }

    // Competitive deals
    if (entity.competitive_deals === 0) {
      score += 10;
      factors.push('No active competitive deals');
    } else if (entity.competitive_deals > 2) {
      score -= 15;
      factors.push(`${entity.competitive_deals} competitors in play`);
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  /**
   * Assess relationship strength
   * @private
   */
  _assessRelationshipStrength(entity, context) {
    const factors = [];
    let score = 50;

    // Prior engagement
    if (entity.prior_engagement || entity.properties?.prior_engagement_score > 0) {
      score += 15;
      factors.push('Prior positive engagement');
    }

    // Referral source
    if (entity.referral_source || entity.properties?.source === 'referral') {
      score += 20;
      factors.push('Warm referral');
    }

    // Network connections
    const connections = entity.network_connections || 0;
    if (connections > 0) {
      score += Math.min(15, connections * 5);
      factors.push(`${connections} mutual connections`);
    }

    return { score: Math.max(0, Math.min(100, score)), factors };
  }

  /**
   * Calculate overall score adjustment
   * @private
   */
  _calculateScoreAdjustment(factors) {
    const weights = {
      decision_complexity: 0.15,
      stakeholder_alignment: 0.25,
      timing_signals: 0.25,
      competitive_position: 0.20,
      relationship_strength: 0.15
    };

    let weightedScore = 0;
    for (const [factor, weight] of Object.entries(weights)) {
      weightedScore += (factors[factor]?.score || 50) * weight;
    }

    // Convert to adjustment (-10 to +10)
    const adjustment = Math.round((weightedScore - 50) / 5);
    return Math.max(-10, Math.min(10, adjustment));
  }

  /**
   * Calculate confidence in analysis
   * @private
   */
  _calculateConfidence(factors) {
    // Count how many factors have evidence
    let evidenceCount = 0;
    for (const factor of Object.values(factors)) {
      if (factor.factors.length > 0) evidenceCount++;
    }

    return Math.min(1, 0.5 + (evidenceCount * 0.1));
  }

  /**
   * Generate human-readable reasoning
   * @private
   */
  _generateReasoning(factors, entity) {
    const reasons = [];

    for (const [name, data] of Object.entries(factors)) {
      if (data.factors.length > 0) {
        reasons.push({
          factor: name.replace(/_/g, ' '),
          score: data.score,
          evidence: data.factors
        });
      }
    }

    return {
      summary: this._generateSummary(factors, entity),
      detailed_factors: reasons
    };
  }

  /**
   * Generate summary reasoning
   * @private
   */
  _generateSummary(factors, entity) {
    const avgScore = Object.values(factors)
      .reduce((sum, f) => sum + f.score, 0) / Object.keys(factors).length;

    if (avgScore >= 70) {
      return `Strong opportunity with ${entity.name || 'this entity'}. Multiple positive indicators suggest high conversion potential.`;
    } else if (avgScore >= 50) {
      return `Moderate opportunity with ${entity.name || 'this entity'}. Some positive signals but requires further qualification.`;
    } else {
      return `Challenging opportunity with ${entity.name || 'this entity'}. Consider prioritizing other leads or investing in relationship building.`;
    }
  }

  /**
   * Generate actionable recommendations
   * @private
   */
  _generateRecommendations(factors, entity) {
    const recommendations = [];

    if (factors.stakeholder_alignment.score < 50) {
      recommendations.push({
        priority: 'high',
        action: 'Identify and engage key stakeholders',
        reason: 'Stakeholder alignment is below optimal'
      });
    }

    if (factors.timing_signals.score < 40) {
      recommendations.push({
        priority: 'medium',
        action: 'Monitor for timing triggers (budget cycle, hiring, funding)',
        reason: 'Limited timing signals detected'
      });
    }

    if (factors.competitive_position.score < 50) {
      recommendations.push({
        priority: 'high',
        action: 'Differentiate value proposition against competitors',
        reason: 'Competitive pressure detected'
      });
    }

    if (factors.relationship_strength.score < 40) {
      recommendations.push({
        priority: 'medium',
        action: 'Seek warm introduction through network connections',
        reason: 'Low relationship strength'
      });
    }

    return recommendations;
  }
}

// Factory function
export function createSIVAXHook(config) {
  const hook = new SIVAXHook(config);
  hook.register();
  return hook;
}

export { SIVAXHook };
export default SIVAXHook;
