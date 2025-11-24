/**
 * UPR OS Ranking Endpoint
 * Sprint 64: Unified OS API Layer
 *
 * POST /api/os/rank
 *
 * Dedicated ranking endpoint with configurable profiles and explainability
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import { pool } from '../../utils/db.js';
import { computeQScore } from '../../utils/qscore.js';
import {
  createOSResponse,
  createOSError,
  getTenantId,
  generateRequestId,
  OS_PROFILES
} from './types.js';

const router = express.Router();

/**
 * Default ranking weights by profile
 */
const PROFILE_WEIGHTS = {
  [OS_PROFILES.DEFAULT]: {
    q_score: 0.30,
    t_score: 0.25,
    l_score: 0.25,
    e_score: 0.20
  },
  [OS_PROFILES.BANKING_EMPLOYEE]: {
    q_score: 0.25,
    t_score: 0.35,
    l_score: 0.20,
    e_score: 0.20
  },
  [OS_PROFILES.BANKING_CORPORATE]: {
    q_score: 0.35,
    t_score: 0.20,
    l_score: 0.25,
    e_score: 0.20
  },
  [OS_PROFILES.INSURANCE_INDIVIDUAL]: {
    q_score: 0.20,
    t_score: 0.35,
    l_score: 0.30,
    e_score: 0.15
  },
  [OS_PROFILES.RECRUITMENT_HIRING]: {
    q_score: 0.20,
    t_score: 0.40,
    l_score: 0.20,
    e_score: 0.20
  },
  [OS_PROFILES.SAAS_B2B]: {
    q_score: 0.30,
    t_score: 0.25,
    l_score: 0.30,
    e_score: 0.15
  }
};

/**
 * POST /api/os/rank
 *
 * Rank entities based on configurable criteria
 *
 * Request Body:
 * {
 *   "entities": [
 *     { "id": "uuid", "scores": { "q_score": 75, "t_score": 80, ... } },
 *     // OR
 *     { "id": "uuid" }  // Will fetch/calculate scores
 *   ],
 *   "options": {
 *     "profile": "banking_employee",
 *     "weights": {                    // Optional: override profile weights
 *       "q_score": 0.4,
 *       "t_score": 0.3,
 *       "l_score": 0.2,
 *       "e_score": 0.1
 *     },
 *     "limit": 50,
 *     "explain": true                 // Include ranking explanations
 *   }
 * }
 *
 * Response: OSResponse with ranked entities and explanations
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const tenantId = getTenantId(req);
    const {
      entities = [],
      options = {}
    } = req.body;

    const {
      profile = OS_PROFILES.DEFAULT,
      weights: customWeights,
      limit = 100,
      explain = true
    } = options;

    console.log(`[OS:Rank] Request ${requestId} - ${entities.length} entities, Profile: ${profile}`);

    if (entities.length === 0) {
      return res.status(400).json(createOSError({
        error: 'At least one entity is required',
        code: 'OS_RANK_INVALID_INPUT',
        endpoint: '/api/os/rank',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    // Get weights (custom or profile-based)
    const weights = customWeights || PROFILE_WEIGHTS[profile] || PROFILE_WEIGHTS[OS_PROFILES.DEFAULT];

    // Process entities - calculate missing scores if needed
    const rankedEntities = await Promise.all(entities.map(async (entity, index) => {
      let scores = entity.scores;

      // If scores not provided, calculate them
      if (!scores) {
        scores = await calculateEntityScores(entity.id, tenantId);
      }

      // Calculate weighted rank score
      const rankScore = calculateRankScore(scores, weights);

      return {
        ...entity,
        scores,
        rank_score: rankScore.value,
        rank_breakdown: rankScore.breakdown,
        original_position: index
      };
    }));

    // Sort by rank score (descending)
    rankedEntities.sort((a, b) => b.rank_score - a.rank_score);

    // Assign ranks and calculate explanations
    const rankedResult = rankedEntities.slice(0, limit).map((entity, index) => {
      const rank = index + 1;
      const result = {
        rank,
        entity_id: entity.id,
        rank_score: Math.round(entity.rank_score * 100) / 100,
        scores: entity.scores,
        position_change: entity.original_position - index
      };

      if (explain) {
        result.explanation = generateRankExplanation(entity, rank, rankedEntities, weights);
      }

      return result;
    });

    const executionTimeMs = Date.now() - startTime;

    // Calculate confidence based on score distribution
    const scoreVariance = calculateScoreVariance(rankedEntities);
    const confidence = Math.min(100, Math.round(100 - scoreVariance));

    const response = createOSResponse({
      success: true,
      data: {
        ranked_entities: rankedResult,
        total_ranked: rankedResult.length,
        total_input: entities.length,
        ranking_config: {
          profile,
          weights,
          is_custom_weights: !!customWeights
        }
      },
      reason: `Ranked ${rankedResult.length} entities using ${profile} profile`,
      confidence,
      profile,
      endpoint: '/api/os/rank',
      executionTimeMs,
      requestId
    });

    console.log(`[OS:Rank] Request ${requestId} completed in ${executionTimeMs}ms`);

    res.json(response);

  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    console.error(`[OS:Rank] Request ${requestId} failed:`, error);

    Sentry.captureException(error, {
      tags: {
        os_endpoint: '/api/os/rank',
        request_id: requestId
      },
      extra: req.body
    });

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_RANK_ERROR',
      endpoint: '/api/os/rank',
      executionTimeMs,
      requestId
    }));
  }
});

/**
 * Calculate scores for an entity from database
 * @private
 */
async function calculateEntityScores(entityId, tenantId) {
  // Fetch entity data
  const entityResult = await pool.query(
    `SELECT id, name, domain, website_url, linkedin_url, industry, size_range, locations
     FROM targeted_companies WHERE id = $1`,
    [entityId]
  );

  if (entityResult.rows.length === 0) {
    return { q_score: 0, t_score: 0, l_score: 0, e_score: 0 };
  }

  const entity = entityResult.rows[0];

  // Fetch signals
  const signalsResult = await pool.query(
    `SELECT signal_type, confidence, created_at, source
     FROM hiring_signals WHERE company_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [entityId]
  );

  const signals = signalsResult.rows;

  // Calculate Q-Score
  const qScore = computeQScore(entity, signals);

  // Calculate T-Score (timing)
  const tScore = calculateTimingScoreSimple(signals);

  // Calculate L-Score (lead)
  const lScore = calculateLeadScoreSimple(entity);

  // Calculate E-Score (evidence)
  const eScore = calculateEvidenceScoreSimple(signals);

  return {
    q_score: qScore.value,
    t_score: tScore,
    l_score: lScore,
    e_score: eScore
  };
}

/**
 * Simple timing score calculation
 * @private
 */
function calculateTimingScoreSimple(signals) {
  if (!signals || signals.length === 0) return 30;

  const now = Date.now();
  const recentSignals = signals.filter(s => {
    const signalDate = new Date(s.created_at);
    const daysSince = (now - signalDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 30;
  });

  if (recentSignals.length >= 3) return 90;
  if (recentSignals.length >= 1) return 70;
  if (signals.length > 0) return 50;
  return 30;
}

/**
 * Simple lead score calculation
 * @private
 */
function calculateLeadScoreSimple(entity) {
  let score = 30;

  if (entity.domain || entity.website_url) score += 20;
  if (entity.linkedin_url) score += 20;
  if (entity.industry) score += 15;
  if (entity.size_range) score += 15;

  return Math.min(100, score);
}

/**
 * Simple evidence score calculation
 * @private
 */
function calculateEvidenceScoreSimple(signals) {
  if (!signals || signals.length === 0) return 20;

  const avgConfidence = signals.reduce((sum, s) => sum + (s.confidence || 0.5), 0) / signals.length;
  const sources = new Set(signals.map(s => s.source));

  return Math.min(100, Math.round(
    (signals.length * 5) +
    (avgConfidence * 40) +
    (sources.size * 15)
  ));
}

/**
 * Calculate weighted rank score
 * @private
 */
function calculateRankScore(scores, weights) {
  const breakdown = {
    q_score_contribution: (scores.q_score || 0) * (weights.q_score || 0),
    t_score_contribution: (scores.t_score || 0) * (weights.t_score || 0),
    l_score_contribution: (scores.l_score || 0) * (weights.l_score || 0),
    e_score_contribution: (scores.e_score || 0) * (weights.e_score || 0)
  };

  const value = breakdown.q_score_contribution +
                breakdown.t_score_contribution +
                breakdown.l_score_contribution +
                breakdown.e_score_contribution;

  return { value, breakdown };
}

/**
 * Generate ranking explanation
 * @private
 */
function generateRankExplanation(entity, rank, allEntities, weights) {
  const explanation = {
    why_this_rank: [],
    comparison_to_next: null
  };

  // Explain why this rank
  const topScore = Object.entries(entity.rank_breakdown || {})
    .sort((a, b) => b[1] - a[1])[0];

  if (topScore) {
    const scoreName = topScore[0].replace('_contribution', '').replace('_', '-');
    explanation.why_this_rank.push(
      `Strong ${scoreName} (${Math.round(topScore[1])} contribution)`
    );
  }

  if (entity.scores?.t_score >= 80) {
    explanation.why_this_rank.push('Optimal timing detected');
  }

  if (entity.scores?.q_score >= 80) {
    explanation.why_this_rank.push('High quality data');
  }

  // Compare to next entity if not last
  if (rank < allEntities.length) {
    const nextEntity = allEntities[rank];
    const scoreDiff = entity.rank_score - nextEntity.rank_score;

    if (scoreDiff > 10) {
      explanation.comparison_to_next = `Significantly ahead of #${rank + 1} by ${Math.round(scoreDiff)} points`;
    } else if (scoreDiff > 0) {
      explanation.comparison_to_next = `Slightly ahead of #${rank + 1} by ${Math.round(scoreDiff)} points`;
    }
  }

  // Explain why not #1 if not ranked first
  if (rank > 1) {
    const topEntity = allEntities[0];
    const diff = topEntity.rank_score - entity.rank_score;

    // Find the biggest score gap
    const scoreGaps = [];
    if (topEntity.scores && entity.scores) {
      for (const [key, value] of Object.entries(topEntity.scores)) {
        const gap = value - (entity.scores[key] || 0);
        if (gap > 0) {
          scoreGaps.push({ score: key, gap });
        }
      }
    }

    scoreGaps.sort((a, b) => b.gap - a.gap);
    if (scoreGaps.length > 0) {
      explanation.why_not_first = `Lower ${scoreGaps[0].score.replace('_', '-')} than #1 (gap: ${Math.round(scoreGaps[0].gap)})`;
    }
  }

  return explanation;
}

/**
 * Calculate score variance for confidence
 * @private
 */
function calculateScoreVariance(entities) {
  if (entities.length < 2) return 0;

  const scores = entities.map(e => e.rank_score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;

  return Math.sqrt(variance);
}

/**
 * GET /api/os/rank/profiles
 * Get available ranking profiles and their weights
 */
router.get('/profiles', (req, res) => {
  res.json({
    success: true,
    profiles: PROFILE_WEIGHTS
  });
});

/**
 * GET /api/os/rank/health
 * Health check for ranking service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'os-rank',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
