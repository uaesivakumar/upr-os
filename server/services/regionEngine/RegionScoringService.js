/**
 * Region Scoring Service
 * Sprint 73: Region-Aware Scoring & Timing Packs
 *
 * Implements Q/T/L/E score modifiers per region, sales cycle multipliers,
 * stakeholder depth normalization, and preferred channel configuration
 */

import { regionRegistry } from './RegionRegistry.js';
import { tenantRegionService } from './TenantRegionService.js';
import { DEFAULT_SCORING_MODIFIERS, SCORING_MODIFIER_BOUNDS } from './types.js';

class RegionScoringService {
  /**
   * Apply region modifiers to scores
   * @param {Object} scores - Base scores {q_score, t_score, l_score, e_score}
   * @param {string} regionId - Region ID
   * @param {Object} options - Additional options
   * @returns {Promise<Object>}
   */
  async applyRegionModifiers(scores, regionId, options = {}) {
    const { tenantId, verticalId, includeBreakdown = true } = options;

    // Get modifiers
    const modifiers = await this._getEffectiveModifiers(regionId, tenantId, verticalId);

    // Apply modifiers
    const baseScores = {
      q_score: scores.q_score || 0,
      t_score: scores.t_score || 0,
      l_score: scores.l_score || 0,
      e_score: scores.e_score || 0
    };

    const modifiedScores = {
      q_score: this._applyModifier(baseScores.q_score, modifiers.q_modifier),
      t_score: this._applyModifier(baseScores.t_score, modifiers.t_modifier),
      l_score: this._applyModifier(baseScores.l_score, modifiers.l_modifier),
      e_score: this._applyModifier(baseScores.e_score, modifiers.e_modifier)
    };

    // Calculate composite score (weighted average based on vertical profile)
    const weights = await this._getScoreWeights(regionId, verticalId);
    modifiedScores.composite = this._calculateComposite(modifiedScores, weights);

    const result = {
      ...modifiedScores,
      region_id: regionId,
      modifiers_applied: true
    };

    if (includeBreakdown) {
      result.breakdown = {
        base_scores: baseScores,
        modifiers: modifiers,
        weights: weights,
        impact: {
          q_delta: modifiedScores.q_score - baseScores.q_score,
          t_delta: modifiedScores.t_score - baseScores.t_score,
          l_delta: modifiedScores.l_score - baseScores.l_score,
          e_delta: modifiedScores.e_score - baseScores.e_score
        },
        composite_formula: `(${weights.q}*Q + ${weights.t}*T + ${weights.l}*L + ${weights.e}*E)`
      };
    }

    return result;
  }

  /**
   * Get sales cycle multiplier for region
   * @param {string} regionId - Region ID
   * @param {string} tenantId - Optional tenant ID for customization
   * @returns {Promise<Object>}
   */
  async getSalesMultiplier(regionId, tenantId = null) {
    const region = await regionRegistry.getRegionById(regionId);
    let multiplier = region?.sales_cycle_multiplier || 1.0;

    // Check for tenant customization
    if (tenantId) {
      const binding = await tenantRegionService.getTenantRegionBinding(tenantId, regionId);
      if (binding?.custom_sales_cycle_multiplier) {
        multiplier = binding.custom_sales_cycle_multiplier;
      }
    }

    return {
      multiplier,
      region_code: region?.region_code || 'UNKNOWN',
      description: this._getSalesMultiplierDescription(multiplier),
      adjusted_cycle: this._getAdjustedCycleDays(multiplier)
    };
  }

  /**
   * Normalize stakeholder depth based on region expectations
   * @param {number} depth - Actual stakeholder depth
   * @param {string} regionId - Region ID
   * @param {string} verticalId - Optional vertical ID
   * @returns {Promise<Object>}
   */
  async normalizeStakeholderDepth(depth, regionId, verticalId = null) {
    const expectedDepth = await this._getExpectedStakeholderDepth(regionId, verticalId);

    // Score based on how actual depth compares to expected
    // Higher depth in regions expecting it = good
    // Lower depth in regions expecting it = potentially risky
    const ratio = depth / expectedDepth;

    let score;
    let assessment;

    if (ratio >= 1) {
      // Meets or exceeds expectation
      score = Math.min(100, 70 + (ratio - 1) * 30);
      assessment = 'adequate';
    } else if (ratio >= 0.7) {
      // Close to expectation
      score = 50 + ratio * 20;
      assessment = 'acceptable';
    } else {
      // Below expectation
      score = ratio * 50;
      assessment = 'insufficient';
    }

    return {
      normalized_score: Math.round(score),
      actual_depth: depth,
      expected_depth: expectedDepth,
      ratio,
      assessment,
      region_id: regionId,
      vertical_id: verticalId,
      recommendation: this._getStakeholderRecommendation(assessment, depth, expectedDepth)
    };
  }

  /**
   * Get preferred channels for region
   * @param {string} regionId - Region ID
   * @param {string} tenantId - Optional tenant ID
   * @returns {Promise<Object>}
   */
  async getPreferredChannels(regionId, tenantId = null) {
    const region = await regionRegistry.getRegionById(regionId);
    let channels = region?.preferred_channels || ['email'];

    // Check for tenant customization
    if (tenantId) {
      const binding = await tenantRegionService.getTenantRegionBinding(tenantId, regionId);
      if (binding?.custom_preferred_channels) {
        channels = binding.custom_preferred_channels;
      }
    }

    return {
      channels,
      primary: channels[0],
      region_code: region?.region_code || 'UNKNOWN',
      channel_weights: this._getChannelWeights(channels),
      recommendations: this._getChannelRecommendations(channels, region?.region_code)
    };
  }

  /**
   * Batch score entities with region modifiers
   * @param {Object[]} entities - Entities with base scores
   * @param {string} regionId - Region ID
   * @param {Object} options - Scoring options
   * @returns {Promise<Object[]>}
   */
  async batchScoreWithRegion(entities, regionId, options = {}) {
    const results = [];
    const startTime = Date.now();

    // Pre-fetch modifiers once
    const modifiers = await this._getEffectiveModifiers(
      regionId,
      options.tenantId,
      options.verticalId
    );
    const weights = await this._getScoreWeights(regionId, options.verticalId);
    const salesMultiplier = await this.getSalesMultiplier(regionId, options.tenantId);

    for (const entity of entities) {
      const baseScores = entity.scores || {
        q_score: entity.q_score || 0,
        t_score: entity.t_score || 0,
        l_score: entity.l_score || 0,
        e_score: entity.e_score || 0
      };

      const modifiedScores = {
        q_score: this._applyModifier(baseScores.q_score, modifiers.q_modifier),
        t_score: this._applyModifier(baseScores.t_score, modifiers.t_modifier),
        l_score: this._applyModifier(baseScores.l_score, modifiers.l_modifier),
        e_score: this._applyModifier(baseScores.e_score, modifiers.e_modifier)
      };

      modifiedScores.composite = this._calculateComposite(modifiedScores, weights);

      results.push({
        ...entity,
        region_modified_scores: modifiedScores,
        region_context: {
          region_id: regionId,
          modifiers_applied: modifiers,
          sales_cycle_multiplier: salesMultiplier.multiplier,
          score_impact: {
            q_delta: modifiedScores.q_score - baseScores.q_score,
            t_delta: modifiedScores.t_score - baseScores.t_score,
            l_delta: modifiedScores.l_score - baseScores.l_score,
            e_delta: modifiedScores.e_score - baseScores.e_score,
            composite_delta: modifiedScores.composite - (entity.composite_score || 0)
          }
        }
      });
    }

    return {
      entities: results,
      stats: {
        count: results.length,
        processing_time_ms: Date.now() - startTime,
        avg_composite_change: results.length > 0
          ? results.reduce((sum, e) => sum + (e.region_context.score_impact.composite_delta || 0), 0) / results.length
          : 0
      }
    };
  }

  /**
   * Get effective modifiers combining region, tenant, and vertical
   * @private
   */
  async _getEffectiveModifiers(regionId, tenantId, verticalId) {
    // Start with region base modifiers
    const region = await regionRegistry.getRegionById(regionId);
    let modifiers = { ...(region?.scoring_modifiers || DEFAULT_SCORING_MODIFIERS) };

    // Apply tenant customizations
    if (tenantId) {
      const binding = await tenantRegionService.getTenantRegionBinding(tenantId, regionId);
      if (binding?.custom_scoring_modifiers) {
        modifiers = {
          q_modifier: binding.custom_scoring_modifiers.q_modifier ?? modifiers.q_modifier,
          t_modifier: binding.custom_scoring_modifiers.t_modifier ?? modifiers.t_modifier,
          l_modifier: binding.custom_scoring_modifiers.l_modifier ?? modifiers.l_modifier,
          e_modifier: binding.custom_scoring_modifiers.e_modifier ?? modifiers.e_modifier
        };
      }
    }

    // Apply vertical-specific modifiers (multiplicative)
    if (verticalId) {
      const verticalModifiers = await regionRegistry.getScoreModifiers(regionId, verticalId);
      if (verticalModifiers) {
        modifiers = {
          q_modifier: modifiers.q_modifier * (verticalModifiers.q_modifier || 1.0),
          t_modifier: modifiers.t_modifier * (verticalModifiers.t_modifier || 1.0),
          l_modifier: modifiers.l_modifier * (verticalModifiers.l_modifier || 1.0),
          e_modifier: modifiers.e_modifier * (verticalModifiers.e_modifier || 1.0)
        };
      }
    }

    // Clamp to bounds
    return {
      q_modifier: this._clampModifier(modifiers.q_modifier),
      t_modifier: this._clampModifier(modifiers.t_modifier),
      l_modifier: this._clampModifier(modifiers.l_modifier),
      e_modifier: this._clampModifier(modifiers.e_modifier)
    };
  }

  /**
   * Apply modifier to score
   * @private
   */
  _applyModifier(score, modifier) {
    return Math.min(100, Math.max(0, Math.round(score * modifier)));
  }

  /**
   * Clamp modifier to valid bounds
   * @private
   */
  _clampModifier(modifier) {
    return Math.min(
      SCORING_MODIFIER_BOUNDS.MAX,
      Math.max(SCORING_MODIFIER_BOUNDS.MIN, modifier)
    );
  }

  /**
   * Get score weights for composite calculation
   * @private
   */
  async _getScoreWeights(regionId, verticalId) {
    // Default weights
    const defaults = { q: 0.25, t: 0.25, l: 0.25, e: 0.25 };

    // TODO: Get from vertical engine configuration
    // For now, use region-based defaults
    const region = await regionRegistry.getRegionById(regionId);

    if (!region) return defaults;

    // Regional weight adjustments
    switch (region.region_code) {
      case 'UAE':
        return { q: 0.25, t: 0.35, l: 0.20, e: 0.20 }; // Timing is king
      case 'IND':
        return { q: 0.20, t: 0.30, l: 0.30, e: 0.20 }; // Location matters
      case 'USA':
        return { q: 0.30, t: 0.25, l: 0.25, e: 0.20 }; // Quality focus
      default:
        return defaults;
    }
  }

  /**
   * Calculate composite score
   * @private
   */
  _calculateComposite(scores, weights) {
    return Math.round(
      scores.q_score * weights.q +
      scores.t_score * weights.t +
      scores.l_score * weights.l +
      scores.e_score * weights.e
    );
  }

  /**
   * Get expected stakeholder depth for region/vertical
   * @private
   */
  async _getExpectedStakeholderDepth(regionId, verticalId) {
    const modifiers = await regionRegistry.getScoreModifiers(regionId, verticalId);
    if (modifiers?.stakeholder_depth_norm) {
      return modifiers.stakeholder_depth_norm;
    }

    // Regional defaults
    const region = await regionRegistry.getRegionById(regionId);
    switch (region?.region_code) {
      case 'UAE': return 2;  // Fewer, more senior
      case 'IND': return 4;  // More hierarchical
      case 'USA': return 3;  // Mid-level empowered
      default: return 3;
    }
  }

  /**
   * Get sales multiplier description
   * @private
   */
  _getSalesMultiplierDescription(multiplier) {
    if (multiplier < 0.9) return 'Faster than baseline - accelerated decision making';
    if (multiplier > 1.1) return 'Slower than baseline - extended evaluation period';
    return 'Near baseline sales cycle';
  }

  /**
   * Get adjusted cycle days
   * @private
   */
  _getAdjustedCycleDays(multiplier) {
    const baseline = 30; // 30 day baseline cycle
    return {
      short_cycle: Math.round(baseline * 0.7 * multiplier),
      standard_cycle: Math.round(baseline * multiplier),
      long_cycle: Math.round(baseline * 1.5 * multiplier)
    };
  }

  /**
   * Get stakeholder recommendation
   * @private
   */
  _getStakeholderRecommendation(assessment, actual, expected) {
    switch (assessment) {
      case 'adequate':
        return 'Good stakeholder coverage. Proceed with engagement.';
      case 'acceptable':
        return `Consider expanding stakeholder map. Current: ${actual}, Expected: ${expected}.`;
      case 'insufficient':
        return `Critical: Need ${expected - actual} more stakeholders for this region.`;
      default:
        return 'Review stakeholder coverage.';
    }
  }

  /**
   * Get channel weights
   * @private
   */
  _getChannelWeights(channels) {
    const weights = {};
    const total = channels.length;
    channels.forEach((channel, index) => {
      weights[channel] = (total - index) / (total * (total + 1) / 2);
    });
    return weights;
  }

  /**
   * Get channel recommendations
   * @private
   */
  _getChannelRecommendations(channels, regionCode) {
    const recommendations = {
      UAE: {
        whatsapp: 'Highly effective for initial contact and follow-ups',
        linkedin: 'Good for professional introduction',
        email: 'Use for formal proposals and documentation'
      },
      IND: {
        email: 'Primary channel for business communication',
        phone: 'Follow up calls increase response rates',
        linkedin: 'Effective for senior stakeholders'
      },
      USA: {
        email: 'Standard B2B communication channel',
        linkedin: 'Effective for cold outreach',
        phone: 'Use sparingly, by appointment'
      }
    };

    return channels.map(channel => ({
      channel,
      recommendation: recommendations[regionCode]?.[channel] || 'Standard engagement channel'
    }));
  }
}

// Singleton instance
export const regionScoringService = new RegionScoringService();
export default regionScoringService;
