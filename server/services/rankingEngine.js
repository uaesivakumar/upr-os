/**
 * Ranking Engine Service
 * Sprint 66: Dedicated Ranking Engine
 *
 * Industry-aware ranking with full explainability
 */

import * as Sentry from '@sentry/node';
import { computeQScore } from '../../utils/qscore.js';

/**
 * Industry-specific ranking profiles
 */
export const RANKING_PROFILES = {
  // Default balanced profile
  default: {
    name: 'Default',
    description: 'Balanced ranking for general use cases',
    weights: {
      q_score: 0.30,
      t_score: 0.25,
      l_score: 0.25,
      e_score: 0.20
    },
    thresholds: {
      hot: 80,
      warm: 60,
      cold: 40
    },
    boosts: {}
  },

  // Banking - Employee/HR Focus
  banking_employee: {
    name: 'Banking Employee',
    description: 'Optimized for banking sector HR/employee recruitment',
    weights: {
      q_score: 0.25,
      t_score: 0.35,  // Timing is critical for hiring
      l_score: 0.20,
      e_score: 0.20
    },
    thresholds: {
      hot: 75,
      warm: 55,
      cold: 35
    },
    boosts: {
      hiring_signal: 15,
      expansion_signal: 10,
      recent_funding: 5,
      uae_presence: 10
    },
    industry_keywords: ['banking', 'finance', 'financial services', 'bank']
  },

  // Banking - Corporate/Enterprise Focus
  banking_corporate: {
    name: 'Banking Corporate',
    description: 'Optimized for corporate banking partnerships',
    weights: {
      q_score: 0.35,  // Quality/size matters more
      t_score: 0.20,
      l_score: 0.25,
      e_score: 0.20
    },
    thresholds: {
      hot: 85,
      warm: 65,
      cold: 45
    },
    boosts: {
      enterprise_size: 20,
      headquarters_uae: 15,
      regulatory_compliance: 10
    },
    industry_keywords: ['banking', 'finance', 'investment']
  },

  // Insurance - Individual/Agent Focus
  insurance_individual: {
    name: 'Insurance Individual',
    description: 'Optimized for individual insurance sales',
    weights: {
      q_score: 0.20,
      t_score: 0.35,  // Timing for life events
      l_score: 0.30,  // Lead fit is crucial
      e_score: 0.15
    },
    thresholds: {
      hot: 70,
      warm: 50,
      cold: 30
    },
    boosts: {
      life_event_signal: 20,
      career_change: 15,
      relocation: 10
    },
    industry_keywords: ['insurance', 'health', 'life insurance']
  },

  // Recruitment/Hiring Focus
  recruitment_hiring: {
    name: 'Recruitment Hiring',
    description: 'Optimized for recruitment agencies',
    weights: {
      q_score: 0.20,
      t_score: 0.40,  // Timing is everything
      l_score: 0.20,
      e_score: 0.20
    },
    thresholds: {
      hot: 70,
      warm: 50,
      cold: 30
    },
    boosts: {
      active_hiring: 25,
      headcount_growth: 20,
      new_office: 15,
      funding_recent: 10
    },
    industry_keywords: ['hiring', 'recruitment', 'hr', 'talent']
  },

  // SaaS B2B Sales
  saas_b2b: {
    name: 'SaaS B2B',
    description: 'Optimized for SaaS B2B sales',
    weights: {
      q_score: 0.30,
      t_score: 0.25,
      l_score: 0.30,  // Lead fit is important
      e_score: 0.15
    },
    thresholds: {
      hot: 75,
      warm: 55,
      cold: 35
    },
    boosts: {
      tech_adoption_signal: 15,
      growth_stage: 10,
      digital_transformation: 10
    },
    industry_keywords: ['technology', 'software', 'saas', 'startup']
  }
};

/**
 * Ranking Engine Class
 */
export class RankingEngine {
  constructor(options = {}) {
    this.defaultProfile = options.defaultProfile || 'default';
    this.enableExplanations = options.enableExplanations !== false;
    this.enableBoosts = options.enableBoosts !== false;
  }

  /**
   * Rank a list of entities
   * @param {Array} entities - Entities to rank
   * @param {Object} options - Ranking options
   * @returns {Array} Ranked entities with explanations
   */
  async rank(entities, options = {}) {
    const {
      profile = this.defaultProfile,
      customWeights = null,
      limit = 100,
      includeExplanations = this.enableExplanations
    } = options;

    const startTime = Date.now();

    try {
      // Get profile configuration
      const profileConfig = RANKING_PROFILES[profile] || RANKING_PROFILES.default;
      const weights = customWeights || profileConfig.weights;

      // Calculate rank scores for all entities
      const scoredEntities = entities.map((entity, originalIndex) => {
        const scores = this.calculateScores(entity);
        const boosts = this.calculateBoosts(entity, profileConfig);
        const rankScore = this.calculateRankScore(scores, weights, boosts);

        return {
          ...entity,
          scores,
          boosts,
          rank_score: rankScore,
          original_index: originalIndex
        };
      });

      // Sort by rank score (descending)
      scoredEntities.sort((a, b) => b.rank_score - a.rank_score);

      // Assign ranks and generate explanations
      const rankedEntities = scoredEntities.slice(0, limit).map((entity, index) => {
        const rank = index + 1;
        const result = {
          rank,
          entity_id: entity.id,
          entity_name: entity.name,
          rank_score: Math.round(entity.rank_score * 100) / 100,
          tier: this.getTier(entity.rank_score, profileConfig.thresholds),
          scores: entity.scores,
          boosts: entity.boosts,
          position_change: entity.original_index - index
        };

        if (includeExplanations) {
          result.explanation = this.generateExplanation(
            entity,
            rank,
            scoredEntities,
            weights,
            profileConfig
          );
        }

        return result;
      });

      return {
        success: true,
        ranked_entities: rankedEntities,
        profile_used: profile,
        weights_used: weights,
        total_ranked: rankedEntities.length,
        execution_time_ms: Date.now() - startTime
      };

    } catch (error) {
      Sentry.captureException(error, {
        tags: { service: 'RankingEngine' },
        extra: { profile, entityCount: entities.length }
      });

      throw error;
    }
  }

  /**
   * Calculate all scores for an entity
   * @private
   */
  calculateScores(entity) {
    const signals = entity.signals || [];

    // Q-Score (Quality)
    const qScore = computeQScore(entity, signals);

    // T-Score (Timing)
    const tScore = this.calculateTimingScore(entity, signals);

    // L-Score (Lead Fit)
    const lScore = this.calculateLeadScore(entity);

    // E-Score (Evidence)
    const eScore = this.calculateEvidenceScore(signals);

    return {
      q_score: qScore.value,
      t_score: tScore.value,
      l_score: lScore.value,
      e_score: eScore.value,
      details: {
        q_score: qScore,
        t_score: tScore,
        l_score: lScore,
        e_score: eScore
      }
    };
  }

  /**
   * Calculate timing score
   * @private
   */
  calculateTimingScore(entity, signals) {
    let value = 40;
    const breakdown = {
      recency: 0,
      signal_freshness: 0,
      market_timing: 0
    };
    const reasons = [];

    const now = Date.now();

    // Recency of signals (40 points max)
    const recentSignals = signals.filter(s => {
      const date = new Date(s.created_at || s.date || s.published_at);
      const daysSince = (now - date.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince <= 30;
    });

    if (recentSignals.length >= 3) {
      breakdown.recency = 40;
      reasons.push('Multiple recent signals (last 30 days)');
    } else if (recentSignals.length >= 1) {
      breakdown.recency = 25;
      reasons.push('Recent activity detected');
    } else {
      breakdown.recency = 10;
    }

    // Signal freshness - how recent is the newest signal
    if (signals.length > 0) {
      const newest = Math.max(...signals.map(s =>
        new Date(s.created_at || s.date || s.published_at).getTime()
      ));
      const daysSinceNewest = (now - newest) / (1000 * 60 * 60 * 24);

      if (daysSinceNewest <= 7) {
        breakdown.signal_freshness = 30;
        reasons.push('Very fresh signals (last 7 days)');
      } else if (daysSinceNewest <= 14) {
        breakdown.signal_freshness = 20;
      } else {
        breakdown.signal_freshness = 10;
      }
    }

    // Market timing (base score)
    breakdown.market_timing = 20;

    value = breakdown.recency + breakdown.signal_freshness + breakdown.market_timing;

    let category = 'POOR';
    if (value >= 80) category = 'OPTIMAL';
    else if (value >= 60) category = 'GOOD';
    else if (value >= 40) category = 'FAIR';

    return {
      value: Math.min(100, value),
      category,
      breakdown,
      reasons
    };
  }

  /**
   * Calculate lead score
   * @private
   */
  calculateLeadScore(entity) {
    let value = 30;
    const breakdown = {
      company_fit: 0,
      data_completeness: 0,
      engagement_potential: 0
    };
    const reasons = [];

    // Company fit (30 points max)
    if (entity.industry) {
      breakdown.company_fit += 15;
      reasons.push('Industry identified');
    }
    if (entity.size_range) {
      breakdown.company_fit += 15;
      reasons.push('Company size known');
    }

    // Data completeness (40 points max)
    if (entity.domain || entity.website_url) {
      breakdown.data_completeness += 15;
      reasons.push('Web presence verified');
    }
    if (entity.linkedin_url) {
      breakdown.data_completeness += 15;
      reasons.push('LinkedIn profile found');
    }
    if (entity.locations && entity.locations.length > 0) {
      breakdown.data_completeness += 10;
      reasons.push('Locations known');
    }

    // Engagement potential (30 points max)
    if (entity.contacts && entity.contacts.length > 0) {
      breakdown.engagement_potential += 20;
      reasons.push('Contacts available');
    }
    breakdown.engagement_potential += 10; // Base score

    value = breakdown.company_fit + breakdown.data_completeness + breakdown.engagement_potential;

    let tier = 'COLD';
    if (value >= 80) tier = 'HOT';
    else if (value >= 60) tier = 'WARM';
    else if (value >= 40) tier = 'COOL';

    return {
      value: Math.min(100, value),
      tier,
      breakdown,
      reasons
    };
  }

  /**
   * Calculate evidence score
   * @private
   */
  calculateEvidenceScore(signals) {
    if (!signals || signals.length === 0) {
      return {
        value: 20,
        strength: 'WEAK',
        breakdown: { signal_count: 0, confidence_avg: 0, source_diversity: 0 },
        reasons: ['No signals available']
      };
    }

    const breakdown = {
      signal_count: Math.min(40, signals.length * 8),
      confidence_avg: 0,
      source_diversity: 0
    };
    const reasons = [];

    // Average confidence
    const avgConfidence = signals.reduce((sum, s) => sum + (s.confidence || 0.5), 0) / signals.length;
    breakdown.confidence_avg = Math.round(avgConfidence * 30);
    if (avgConfidence >= 0.7) {
      reasons.push('High confidence signals');
    }

    // Source diversity
    const sources = new Set(signals.map(s => s.source));
    breakdown.source_diversity = Math.min(30, sources.size * 10);
    if (sources.size >= 3) {
      reasons.push('Multi-source corroboration');
    }

    reasons.push(`${signals.length} signals from ${sources.size} sources`);

    const value = breakdown.signal_count + breakdown.confidence_avg + breakdown.source_diversity;

    let strength = 'WEAK';
    if (value >= 80) strength = 'STRONG';
    else if (value >= 60) strength = 'MODERATE';
    else if (value >= 40) strength = 'FAIR';

    return {
      value: Math.min(100, value),
      strength,
      breakdown,
      reasons
    };
  }

  /**
   * Calculate profile-specific boosts
   * @private
   */
  calculateBoosts(entity, profileConfig) {
    if (!this.enableBoosts || !profileConfig.boosts) {
      return { total: 0, items: [] };
    }

    const items = [];
    let total = 0;
    const signals = entity.signals || [];

    // Check for hiring signals
    if (profileConfig.boosts.hiring_signal || profileConfig.boosts.active_hiring) {
      const hasHiring = signals.some(s =>
        s.signal_type?.toLowerCase().includes('hiring') ||
        s.title?.toLowerCase().includes('hiring')
      );
      if (hasHiring) {
        const boost = profileConfig.boosts.hiring_signal || profileConfig.boosts.active_hiring || 15;
        total += boost;
        items.push({ type: 'hiring_signal', value: boost, reason: 'Active hiring detected' });
      }
    }

    // Check for expansion signals
    if (profileConfig.boosts.expansion_signal) {
      const hasExpansion = signals.some(s =>
        s.signal_type?.toLowerCase().includes('expansion') ||
        s.title?.toLowerCase().includes('expansion')
      );
      if (hasExpansion) {
        total += profileConfig.boosts.expansion_signal;
        items.push({ type: 'expansion', value: profileConfig.boosts.expansion_signal, reason: 'Expansion signal detected' });
      }
    }

    // Check for UAE presence
    if (profileConfig.boosts.uae_presence || profileConfig.boosts.headquarters_uae) {
      const hasUAE = entity.locations?.some(l =>
        /uae|dubai|abu dhabi|sharjah|united arab emirates/i.test(l)
      );
      if (hasUAE) {
        const boost = profileConfig.boosts.uae_presence || profileConfig.boosts.headquarters_uae;
        total += boost;
        items.push({ type: 'uae_presence', value: boost, reason: 'UAE presence confirmed' });
      }
    }

    // Check for enterprise size
    if (profileConfig.boosts.enterprise_size) {
      const isEnterprise = entity.size_range?.toLowerCase().includes('enterprise') ||
                          entity.size_range?.includes('5000') ||
                          entity.size_range?.includes('10000');
      if (isEnterprise) {
        total += profileConfig.boosts.enterprise_size;
        items.push({ type: 'enterprise_size', value: profileConfig.boosts.enterprise_size, reason: 'Enterprise-size company' });
      }
    }

    return { total, items };
  }

  /**
   * Calculate final rank score
   * @private
   */
  calculateRankScore(scores, weights, boosts) {
    const baseScore = (
      (scores.q_score || 0) * weights.q_score +
      (scores.t_score || 0) * weights.t_score +
      (scores.l_score || 0) * weights.l_score +
      (scores.e_score || 0) * weights.e_score
    );

    // Add boosts (capped to prevent overwhelming base score)
    const boostValue = Math.min(boosts.total || 0, 30);

    return baseScore + boostValue;
  }

  /**
   * Get tier from score
   * @private
   */
  getTier(score, thresholds) {
    if (score >= thresholds.hot) return 'HOT';
    if (score >= thresholds.warm) return 'WARM';
    if (score >= thresholds.cold) return 'COLD';
    return 'DISQUALIFIED';
  }

  /**
   * Generate ranking explanation
   * @private
   */
  generateExplanation(entity, rank, allEntities, weights, profileConfig) {
    const explanation = {
      why_this_rank: [],
      strengths: [],
      weaknesses: [],
      comparison_to_next: null,
      why_not_first: null
    };

    // Identify strengths
    const scoreDetails = entity.scores.details;

    if (entity.scores.q_score >= 70) {
      explanation.strengths.push(`Strong quality score (${entity.scores.q_score})`);
    }
    if (entity.scores.t_score >= 70) {
      explanation.strengths.push(`Good timing (${scoreDetails.t_score.category})`);
    }
    if (entity.scores.l_score >= 70) {
      explanation.strengths.push(`High lead fit (${scoreDetails.l_score.tier})`);
    }
    if (entity.scores.e_score >= 70) {
      explanation.strengths.push(`Strong evidence (${scoreDetails.e_score.strength})`);
    }

    // Identify weaknesses
    if (entity.scores.q_score < 50) {
      explanation.weaknesses.push('Limited quality data');
    }
    if (entity.scores.t_score < 50) {
      explanation.weaknesses.push('Suboptimal timing');
    }
    if (entity.scores.l_score < 50) {
      explanation.weaknesses.push('Low lead fit score');
    }
    if (entity.scores.e_score < 50) {
      explanation.weaknesses.push('Weak evidence base');
    }

    // Add boost explanations
    if (entity.boosts.items?.length > 0) {
      explanation.why_this_rank.push(
        `Profile boosts applied: ${entity.boosts.items.map(b => b.reason).join(', ')}`
      );
    }

    // Comparison to next rank
    if (rank < allEntities.length) {
      const nextEntity = allEntities[rank];
      const diff = entity.rank_score - nextEntity.rank_score;

      if (diff > 10) {
        explanation.comparison_to_next = `Significantly ahead of #${rank + 1} by ${Math.round(diff)} points`;
      } else if (diff > 0) {
        explanation.comparison_to_next = `Slightly ahead of #${rank + 1} by ${Math.round(diff)} points`;
      }
    }

    // Why not #1
    if (rank > 1) {
      const topEntity = allEntities[0];
      const diff = topEntity.rank_score - entity.rank_score;

      // Find biggest gap
      const gaps = [];
      if (topEntity.scores.q_score - entity.scores.q_score > 10) {
        gaps.push({ score: 'Q-Score', gap: topEntity.scores.q_score - entity.scores.q_score });
      }
      if (topEntity.scores.t_score - entity.scores.t_score > 10) {
        gaps.push({ score: 'T-Score', gap: topEntity.scores.t_score - entity.scores.t_score });
      }
      if (topEntity.scores.l_score - entity.scores.l_score > 10) {
        gaps.push({ score: 'L-Score', gap: topEntity.scores.l_score - entity.scores.l_score });
      }
      if (topEntity.scores.e_score - entity.scores.e_score > 10) {
        gaps.push({ score: 'E-Score', gap: topEntity.scores.e_score - entity.scores.e_score });
      }

      gaps.sort((a, b) => b.gap - a.gap);

      if (gaps.length > 0) {
        explanation.why_not_first = `Lower ${gaps[0].score} than #1 (gap: ${Math.round(gaps[0].gap)} points)`;
      } else {
        explanation.why_not_first = `Behind #1 by ${Math.round(diff)} total points`;
      }
    }

    return explanation;
  }

  /**
   * Get available profiles
   */
  getProfiles() {
    return Object.entries(RANKING_PROFILES).map(([key, config]) => ({
      id: key,
      name: config.name,
      description: config.description,
      weights: config.weights,
      thresholds: config.thresholds
    }));
  }
}

// Default instance
export const rankingEngine = new RankingEngine();

export default RankingEngine;
