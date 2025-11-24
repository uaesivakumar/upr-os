/**
 * UPR OS Scoring Endpoint
 * Sprint 64: Unified OS API Layer
 *
 * POST /api/os/score
 *
 * Unified scoring endpoint combining Q-Score, T-Score, L-Score, E-Score
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import { pool } from '../../utils/db.js';
import { computeQScore, gradeFromScore } from '../../utils/qscore.js';
import {
  createOSResponse,
  createOSError,
  getTenantId,
  generateRequestId,
  OS_PROFILES,
  SCORE_TYPES
} from './types.js';

const router = express.Router();

/**
 * POST /api/os/score
 *
 * Unified scoring endpoint for the OS layer
 *
 * Request Body:
 * {
 *   "entity_type": "company",
 *   "entity_id": "uuid",
 *   "entity_data": { ... },          // OR provide data directly
 *   "score_types": ["q_score", "t_score", "l_score", "composite"],
 *   "options": {
 *     "include_breakdown": true,
 *     "include_explanation": true,
 *     "profile": "banking_employee"
 *   }
 * }
 *
 * Response: OSResponse with all requested scores
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const tenantId = getTenantId(req);
    const {
      entity_type = 'company',
      entity_id,
      entity_data,
      score_types = [SCORE_TYPES.COMPOSITE],
      signals = [],
      options = {}
    } = req.body;

    const {
      include_breakdown = true,
      include_explanation = true,
      profile = OS_PROFILES.DEFAULT
    } = options;

    console.log(`[OS:Score] Request ${requestId} - Types: ${score_types.join(',')}, Tenant: ${tenantId}`);

    // Get entity data if ID provided
    let entityToScore = entity_data;
    if (entity_id && !entity_data) {
      const result = await pool.query(
        `SELECT id, name, domain, website_url, linkedin_url, industry, size_range, locations
         FROM targeted_companies WHERE id = $1`,
        [entity_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json(createOSError({
          error: `Entity not found: ${entity_id}`,
          code: 'OS_SCORE_NOT_FOUND',
          endpoint: '/api/os/score',
          executionTimeMs: Date.now() - startTime,
          requestId
        }));
      }

      entityToScore = result.rows[0];
    }

    if (!entityToScore) {
      return res.status(400).json(createOSError({
        error: 'Either entity_id or entity_data is required',
        code: 'OS_SCORE_INVALID_INPUT',
        endpoint: '/api/os/score',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    // Get signals for this entity if not provided
    let entitySignals = signals;
    if (entitySignals.length === 0 && entity_id) {
      const signalsResult = await pool.query(
        `SELECT id, signal_type, title, source, confidence, evidence_json, created_at
         FROM hiring_signals WHERE company_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [entity_id]
      );
      entitySignals = signalsResult.rows;
    }

    // Calculate requested scores
    const scores = {};
    const explanations = {};

    // Q-Score (Quality Score)
    if (score_types.includes(SCORE_TYPES.Q_SCORE) || score_types.includes(SCORE_TYPES.COMPOSITE)) {
      const qScore = computeQScore(entityToScore, entitySignals);
      scores.q_score = {
        value: qScore.value,
        rating: qScore.rating,
        breakdown: include_breakdown ? qScore.breakdown : undefined
      };
      if (include_explanation) {
        explanations.q_score = generateQScoreExplanation(qScore);
      }
    }

    // T-Score (Timing Score)
    if (score_types.includes(SCORE_TYPES.T_SCORE) || score_types.includes(SCORE_TYPES.COMPOSITE)) {
      const tScore = calculateTimingScore(entityToScore, entitySignals);
      scores.t_score = {
        value: tScore.value,
        category: tScore.category,
        breakdown: include_breakdown ? tScore.breakdown : undefined
      };
      if (include_explanation) {
        explanations.t_score = tScore.explanation;
      }
    }

    // L-Score (Lead Score)
    if (score_types.includes(SCORE_TYPES.L_SCORE) || score_types.includes(SCORE_TYPES.COMPOSITE)) {
      const lScore = calculateLeadScore(entityToScore, entitySignals, profile);
      scores.l_score = {
        value: lScore.value,
        tier: lScore.tier,
        breakdown: include_breakdown ? lScore.breakdown : undefined
      };
      if (include_explanation) {
        explanations.l_score = lScore.explanation;
      }
    }

    // E-Score (Evidence/Composite Score)
    if (score_types.includes(SCORE_TYPES.E_SCORE) || score_types.includes(SCORE_TYPES.COMPOSITE)) {
      const eScore = calculateEvidenceScore(entitySignals);
      scores.e_score = {
        value: eScore.value,
        strength: eScore.strength,
        breakdown: include_breakdown ? eScore.breakdown : undefined
      };
      if (include_explanation) {
        explanations.e_score = eScore.explanation;
      }
    }

    // Calculate composite score if requested
    if (score_types.includes(SCORE_TYPES.COMPOSITE)) {
      const composite = calculateCompositeScore(scores, profile);
      scores.composite = {
        value: composite.value,
        tier: composite.tier,
        grade: gradeFromScore(composite.value)
      };
      if (include_explanation) {
        explanations.composite = composite.explanation;
      }
    }

    const executionTimeMs = Date.now() - startTime;

    // Calculate overall confidence
    const confidence = Math.round(
      Object.values(scores).reduce((sum, s) => sum + (s.value || 0), 0) /
      Object.keys(scores).length
    );

    const response = createOSResponse({
      success: true,
      data: {
        entity_id: entity_id || null,
        entity_type,
        scores,
        explanations: include_explanation ? explanations : undefined,
        scoring_profile: profile
      },
      reason: `Calculated ${Object.keys(scores).length} score(s) for ${entity_type}`,
      confidence,
      profile,
      endpoint: '/api/os/score',
      executionTimeMs,
      requestId
    });

    console.log(`[OS:Score] Request ${requestId} completed in ${executionTimeMs}ms`);

    res.json(response);

  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    console.error(`[OS:Score] Request ${requestId} failed:`, error);

    Sentry.captureException(error, {
      tags: {
        os_endpoint: '/api/os/score',
        request_id: requestId
      },
      extra: req.body
    });

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_SCORE_ERROR',
      endpoint: '/api/os/score',
      executionTimeMs,
      requestId
    }));
  }
});

/**
 * Generate human-readable Q-Score explanation
 * @private
 */
function generateQScoreExplanation(qScore) {
  const parts = [];

  if (qScore.breakdown.domain > 0) {
    parts.push('Has verified web presence');
  }
  if (qScore.breakdown.linkedin > 0) {
    parts.push('LinkedIn profile found');
  }
  if (qScore.breakdown.signals > 0) {
    parts.push('Active growth signals detected');
  }
  if (qScore.breakdown.uae_presence > 0) {
    parts.push('Confirmed UAE operations');
  }
  if (qScore.breakdown.recency > 0) {
    parts.push('Recent activity observed');
  }

  if (parts.length === 0) {
    return 'Limited data available for quality assessment';
  }

  return `Quality rating ${qScore.rating} (${qScore.value}/100): ${parts.join(', ')}`;
}

/**
 * Calculate Timing Score
 * @private
 */
function calculateTimingScore(entity, signals) {
  let value = 50; // Base score
  const breakdown = {
    recency: 0,
    signal_strength: 0,
    market_timing: 0
  };

  // Recency of signals (40 points max)
  const now = Date.now();
  const recentSignals = signals.filter(s => {
    const signalDate = new Date(s.created_at || s.date);
    const daysSince = (now - signalDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 30;
  });

  if (recentSignals.length >= 3) {
    breakdown.recency = 40;
  } else if (recentSignals.length >= 1) {
    breakdown.recency = 25;
  } else {
    breakdown.recency = 10;
  }

  // Signal strength (30 points max)
  const highConfidenceSignals = signals.filter(s => (s.confidence || 0) >= 0.7);
  if (highConfidenceSignals.length >= 2) {
    breakdown.signal_strength = 30;
  } else if (highConfidenceSignals.length >= 1) {
    breakdown.signal_strength = 20;
  } else {
    breakdown.signal_strength = 10;
  }

  // Market timing (30 points max) - simplified
  breakdown.market_timing = 20; // Default moderate timing

  value = breakdown.recency + breakdown.signal_strength + breakdown.market_timing;

  // Determine category
  let category = 'POOR';
  if (value >= 80) category = 'OPTIMAL';
  else if (value >= 60) category = 'GOOD';
  else if (value >= 40) category = 'FAIR';

  return {
    value,
    category,
    breakdown,
    explanation: `Timing is ${category.toLowerCase()}: ${recentSignals.length} recent signals, market conditions favorable`
  };
}

/**
 * Calculate Lead Score
 * @private
 */
function calculateLeadScore(entity, signals, profile) {
  const breakdown = {
    company_fit: 0,
    engagement_potential: 0,
    timing_alignment: 0,
    profile_match: 0
  };

  // Company fit (30 points max)
  if (entity.industry) {
    breakdown.company_fit += 15;
  }
  if (entity.size_range) {
    breakdown.company_fit += 15;
  }

  // Engagement potential (25 points max)
  if (entity.linkedin_url) {
    breakdown.engagement_potential += 15;
  }
  if (entity.domain || entity.website_url) {
    breakdown.engagement_potential += 10;
  }

  // Timing alignment (25 points max)
  const hasHiringSignals = signals.some(s =>
    s.signal_type?.toLowerCase().includes('hiring') ||
    s.title?.toLowerCase().includes('hiring')
  );
  if (hasHiringSignals) {
    breakdown.timing_alignment = 25;
  } else if (signals.length > 0) {
    breakdown.timing_alignment = 15;
  }

  // Profile match (20 points max)
  if (profile !== OS_PROFILES.DEFAULT) {
    breakdown.profile_match = 20; // Assume match if profile specified
  } else {
    breakdown.profile_match = 10;
  }

  const value = breakdown.company_fit + breakdown.engagement_potential +
                breakdown.timing_alignment + breakdown.profile_match;

  // Determine tier
  let tier = 'COLD';
  if (value >= 80) tier = 'HOT';
  else if (value >= 60) tier = 'WARM';
  else if (value >= 40) tier = 'COOL';

  return {
    value,
    tier,
    breakdown,
    explanation: `Lead tier ${tier}: ${value}/100 score based on fit, engagement potential, and timing`
  };
}

/**
 * Calculate Evidence Score
 * @private
 */
function calculateEvidenceScore(signals) {
  if (!signals || signals.length === 0) {
    return {
      value: 20,
      strength: 'WEAK',
      breakdown: { signal_count: 0, avg_confidence: 0, source_diversity: 0 },
      explanation: 'No signals available for evidence assessment'
    };
  }

  const breakdown = {
    signal_count: Math.min(40, signals.length * 10),
    avg_confidence: 0,
    source_diversity: 0
  };

  // Average confidence (30 points max)
  const avgConfidence = signals.reduce((sum, s) => sum + (s.confidence || 0.5), 0) / signals.length;
  breakdown.avg_confidence = Math.round(avgConfidence * 30);

  // Source diversity (30 points max)
  const sources = new Set(signals.map(s => s.source));
  breakdown.source_diversity = Math.min(30, sources.size * 10);

  const value = breakdown.signal_count + breakdown.avg_confidence + breakdown.source_diversity;

  let strength = 'WEAK';
  if (value >= 80) strength = 'STRONG';
  else if (value >= 60) strength = 'MODERATE';
  else if (value >= 40) strength = 'FAIR';

  return {
    value,
    strength,
    breakdown,
    explanation: `Evidence strength ${strength}: ${signals.length} signals from ${sources.size} sources`
  };
}

/**
 * Calculate Composite Score
 * @private
 */
function calculateCompositeScore(scores, profile) {
  // Profile-based weights
  const weights = getProfileWeights(profile);

  let value = 0;
  let totalWeight = 0;

  if (scores.q_score) {
    value += scores.q_score.value * weights.q_score;
    totalWeight += weights.q_score;
  }
  if (scores.t_score) {
    value += scores.t_score.value * weights.t_score;
    totalWeight += weights.t_score;
  }
  if (scores.l_score) {
    value += scores.l_score.value * weights.l_score;
    totalWeight += weights.l_score;
  }
  if (scores.e_score) {
    value += scores.e_score.value * weights.e_score;
    totalWeight += weights.e_score;
  }

  value = totalWeight > 0 ? Math.round(value / totalWeight) : 0;

  let tier = 'DISQUALIFIED';
  if (value >= 80) tier = 'HOT';
  else if (value >= 60) tier = 'WARM';
  else if (value >= 40) tier = 'COLD';

  return {
    value,
    tier,
    explanation: `Composite score ${value}/100 (${tier}) using ${profile} profile weights`
  };
}

/**
 * Get scoring weights by profile
 * @private
 */
function getProfileWeights(profile) {
  const profileWeights = {
    [OS_PROFILES.DEFAULT]: { q_score: 0.3, t_score: 0.25, l_score: 0.25, e_score: 0.2 },
    [OS_PROFILES.BANKING_EMPLOYEE]: { q_score: 0.25, t_score: 0.3, l_score: 0.25, e_score: 0.2 },
    [OS_PROFILES.BANKING_CORPORATE]: { q_score: 0.35, t_score: 0.2, l_score: 0.25, e_score: 0.2 },
    [OS_PROFILES.INSURANCE_INDIVIDUAL]: { q_score: 0.2, t_score: 0.35, l_score: 0.3, e_score: 0.15 },
    [OS_PROFILES.RECRUITMENT_HIRING]: { q_score: 0.2, t_score: 0.4, l_score: 0.2, e_score: 0.2 },
    [OS_PROFILES.SAAS_B2B]: { q_score: 0.3, t_score: 0.25, l_score: 0.3, e_score: 0.15 }
  };

  return profileWeights[profile] || profileWeights[OS_PROFILES.DEFAULT];
}

/**
 * GET /api/os/score/health
 * Health check for scoring service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'os-score',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
