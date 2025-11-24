/**
 * Hierarchical Bayesian Evidence-Based Pattern Prediction
 * Week 2 Day 3-4: PRODUCTION - Mathematically rigorous
 *
 * Philosophy: Aggregate ALL available evidence from multiple sources,
 * combine with global priors using Dirichlet smoothing, compute posterior.
 *
 * Mathematical Foundation:
 * - Dirichlet prior with explicit β (total prior mass)
 * - All evidence as pseudo-counts (not mixed units)
 * - Similarity-weighted kNN
 * - Recency & quality decay
 * - Explicit uncertainty gates for LLM
 *
 * Evidence Hierarchy (highest weight → lowest):
 * A. Exact domain match (weight=1.00)
 * B. k-NN neighbors, similarity-weighted (weight=0.70)
 * C. Sector + Region (weight=0.50)
 * D. Sector only (weight=0.35)
 * E. Region + TLD (weight=0.25)
 * F. TLD only (weight=0.20)
 * G. Global prior α(p) = β * freq(p)
 */

import pool from '../../../utils/db.js';

// Canonical pattern set
const PATTERNS = [
  '{first}.{last}',
  '{f}{last}',
  '{first}{l}',
  '{first}_{last}',
  '{first}{last}',
  '{last}.{first}',
  '{f}.{last}',
  '{first}'
];

// Evidence layer weights (tuned for reliability)
const WEIGHTS = {
  domain: 1.00,      // Exact domain match
  knn: 0.70,         // Vector similarity neighbors (sum of sim^γ weights)
  sector_region: 0.50,
  sector: 0.35,
  region_tld: 0.25,
  tld: 0.20
};

// Dirichlet prior strength (total mass across all patterns)
// Higher β = stronger prior (slower learning from sparse data)
// Lower β = weaker prior (faster adaptation to new evidence)
const BETA = 8.0;

// LLM uncertainty gates (explicit thresholds)
const LLM_GATE = {
  entropy_threshold: 1.5,    // Trigger LLM if entropy > 1.5 bits
  margin_threshold: 0.10,     // Trigger LLM if top-2 margin < 0.10
  confidence_threshold: 0.70  // Trigger LLM if final confidence < 0.70
};

// Recency decay (days → weight multiplier)
const RECENCY_HALFLIFE_DAYS = 180; // 6 months

// kNN similarity exponent (γ)
// Higher γ = only very similar neighbors matter
const KNN_GAMMA = 2.0;

// kNN mass ceiling (prevents dense neighborhoods from dominating)
const KNN_MASS_MAX = 3.0;

// Numerical stability floor (clip masses to avoid divide-by-zero)
const MASS_FLOOR = 1e-9;

// Tie threshold (if P1 - P2 < this, validate both patterns)
const TIE_THRESHOLD = 0.02;

// Global priors (computed from database, fallback if empty)
let GLOBAL_PRIORS = {
  '{first}.{last}': 0.40,
  '{f}{last}': 0.25,
  '{first}{l}': 0.20,
  '{first}_{last}': 0.05,
  '{first}{last}': 0.04,
  '{last}.{first}': 0.03,
  '{f}.{last}': 0.02,
  '{first}': 0.01
};

/**
 * Initialize global priors from database
 * Computes frequency distribution of validated patterns
 * Call on startup or weekly
 */
export async function initGlobalPriors() {
  try {
    const result = await pool.query(`
      SELECT
        pattern,
        COUNT(*)::float AS count
      FROM email_patterns
      WHERE confidence >= 0.70
        AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
      GROUP BY pattern
    `);

    if (result.rows.length > 0) {
      const total = result.rows.reduce((sum, row) => sum + parseFloat(row.count), 0);

      GLOBAL_PRIORS = {};
      result.rows.forEach(row => {
        GLOBAL_PRIORS[row.pattern] = parseFloat(row.count) / total;
      });

      console.log('[Rules] Global priors updated:', GLOBAL_PRIORS);
    } else {
      console.log('[Rules] No patterns in DB yet, using fallback priors');
    }
  } catch (error) {
    console.error('[Rules] Error computing global priors:', error.message);
    // Keep fallback priors
  }
}

/**
 * Predict pattern using Hierarchical Bayesian Evidence
 *
 * Mathematical approach:
 * 1. Initialize counts: C(p) = α(p) = β * freq(p)
 * 2. Add weighted evidence: C(p) += Σ_L w_L * c_L(p)
 * 3. Normalize: P(p) = C(p) / Σ_q C(q)
 * 4. Find MAP: p* = argmax P(p)
 * 5. Compute uncertainty: H(P), margin
 *
 * @param {Object} context - Company context
 * @returns {Promise<Object>} - {pattern, confidence, posterior, evidence, uncertainty, trace}
 */
export async function predict(context) {
  const { sector, region, tld, company_size, domain } = context;

  try {
    const domainTld = tld || (domain ? domain.split('.').pop() : null);

    // Step 1: Gather weighted evidence from all layers
    const evidence = await gatherEvidence({
      domain,
      sector,
      region,
      tld: domainTld
    });

    // Step 2: Compute posterior using Dirichlet smoothing
    const { counts, posterior } = computePosterior(evidence);

    // Step 3: Find MAP (Maximum A Posteriori) pattern
    const map = findMAP(posterior);

    // Step 4: Compute uncertainty (entropy & margin)
    const uncertainty = computeUncertainty(posterior);

    // Step 5: Calculate final confidence
    const confidence = computeConfidence(map, posterior, evidence, uncertainty);

    // Step 6: Build trace for explainability
    const trace = buildTrace(counts, evidence, map, uncertainty);

    return {
      pattern: map.pattern,
      confidence: confidence,
      posterior: posterior,
      evidence: evidence,
      uncertainty: uncertainty,
      trace: trace,
      reason: explainEvidence(map.pattern, evidence, posterior, trace)
    };

  } catch (error) {
    console.error('[Rules] Error in predict:', error.message);

    // Even on error, return global prior (never fail)
    const globalMAP = Object.entries(GLOBAL_PRIORS)
      .sort(([, a], [, b]) => b - a)[0];

    // Compute posterior from global prior only
    const counts = {};
    PATTERNS.forEach(p => {
      counts[p] = BETA * (GLOBAL_PRIORS[p] || 1.0 / PATTERNS.length);
    });
    const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);
    const posterior = {};
    Object.entries(counts).forEach(([p, c]) => {
      posterior[p] = c / totalCount;
    });

    return {
      pattern: globalMAP[0],
      confidence: 0.65,
      posterior: posterior,
      evidence: { error: error.message },
      uncertainty: { entropy: 0, margin: 0, is_uncertain: true },
      trace: { error: error.message },
      reason: `Error querying evidence: ${error.message}. Using global prior.`
    };
  }
}

/**
 * Gather weighted evidence from all hierarchical layers
 * Returns pseudo-counts (not probabilities) for each pattern
 */
async function gatherEvidence(context) {
  const { domain, sector, region, tld } = context;

  const evidence = {
    domain: {},           // Exact domain → count=1
    knn: {},              // k-NN neighbors → sum(sim^γ)
    sector_region: {},    // Sector+Region → weighted count
    sector: {},           // Sector only → weighted count
    region_tld: {},       // Region+TLD → weighted count
    tld: {},              // TLD only → weighted count
    global_freq: GLOBAL_PRIORS  // Global frequency distribution
  };

  try {
    // Layer A: Exact domain (if exists)
    if (domain) {
      const domainResult = await pool.query(`
        SELECT pattern, confidence, verified_at
        FROM email_patterns
        WHERE domain = $1
          AND confidence >= 0.70
          AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
        ORDER BY confidence DESC, verified_at DESC
        LIMIT 1
      `, [domain]);

      if (domainResult.rows.length > 0) {
        const { pattern } = domainResult.rows[0];
        evidence.domain[pattern] = 1.0; // Single strong signal
      }
    }

    // Layer B: k-NN neighbors (pgvector)
    // TODO: Implement when vector embeddings ready
    // For now, skip k-NN layer
    // Query: SELECT domain, pattern, embedding <=> $queryEmbedding AS distance
    //        FROM email_patterns ORDER BY distance LIMIT 10
    // Weight: sim = 1 - distance, add sim^γ to evidence.knn[pattern]

    // Layer C: Sector + Region (recency & quality weighted)
    if (sector && region) {
      const srResult = await pool.query(`
        SELECT
          pattern,
          SUM(
            EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - verified_at))/86400, 0) / $3)
            * LEAST(GREATEST(confidence, 0.70), 1.0)
          ) AS weighted_count
        FROM email_patterns
        WHERE sector ILIKE $1
          AND region ILIKE $2
          AND confidence >= 0.70
          AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
        GROUP BY pattern
      `, [`%${sector}%`, `%${region}%`, RECENCY_HALFLIFE_DAYS]);

      srResult.rows.forEach(row => {
        evidence.sector_region[row.pattern] = parseFloat(row.weighted_count);
      });
    }

    // Layer D: Sector only (recency & quality weighted)
    if (sector) {
      const sResult = await pool.query(`
        SELECT
          pattern,
          SUM(
            EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - verified_at))/86400, 0) / $2)
            * LEAST(GREATEST(confidence, 0.70), 1.0)
          ) AS weighted_count
        FROM email_patterns
        WHERE sector ILIKE $1
          AND confidence >= 0.70
          AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
        GROUP BY pattern
      `, [`%${sector}%`, RECENCY_HALFLIFE_DAYS]);

      sResult.rows.forEach(row => {
        evidence.sector[row.pattern] = parseFloat(row.weighted_count);
      });
    }

    // Layer E: Region + TLD (recency & quality weighted)
    if (region && tld) {
      const rtResult = await pool.query(`
        SELECT
          pattern,
          SUM(
            EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - verified_at))/86400, 0) / $3)
            * LEAST(GREATEST(confidence, 0.70), 1.0)
          ) AS weighted_count
        FROM email_patterns
        WHERE region ILIKE $1
          AND domain LIKE $2
          AND confidence >= 0.70
          AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
        GROUP BY pattern
      `, [`%${region}%`, `%${tld}`, RECENCY_HALFLIFE_DAYS]);

      rtResult.rows.forEach(row => {
        evidence.region_tld[row.pattern] = parseFloat(row.weighted_count);
      });
    }

    // Layer F: TLD only (recency & quality weighted)
    if (tld) {
      const tldResult = await pool.query(`
        SELECT
          pattern,
          SUM(
            EXP(-GREATEST(EXTRACT(EPOCH FROM (NOW() - verified_at))/86400, 0) / $2)
            * LEAST(GREATEST(confidence, 0.70), 1.0)
          ) AS weighted_count
        FROM email_patterns
        WHERE domain LIKE $1
          AND confidence >= 0.70
          AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
        GROUP BY pattern
      `, [`%${tld}`, RECENCY_HALFLIFE_DAYS]);

      tldResult.rows.forEach(row => {
        evidence.tld[row.pattern] = parseFloat(row.weighted_count);
      });
    }

  } catch (error) {
    console.error('[Rules] Error gathering evidence:', error.message);
    // Continue with partial evidence
  }

  return evidence;
}

/**
 * Compute posterior distribution using Dirichlet smoothing
 *
 * Mathematical formulation:
 * C(p) = α(p) + Σ_L w_L * c_L(p)
 * where α(p) = β * freq(p)
 * P(p) = C(p) / Σ_q C(q)
 *
 * Production hardening:
 * - kNN mass scaled to ceiling (prevents dense neighborhoods from dominating)
 * - Numerical stability floor (≥1e-9)
 *
 * @returns {Object} - {counts, posterior}
 */
function computePosterior(evidence) {
  const counts = {};

  // Initialize with Dirichlet prior: α(p) = β * freq(p)
  PATTERNS.forEach(pattern => {
    const freq = GLOBAL_PRIORS[pattern] || (1.0 / PATTERNS.length);
    counts[pattern] = BETA * freq;
  });

  // Add weighted evidence from each layer (all in pseudo-counts)
  const layers = ['domain', 'sector_region', 'sector', 'region_tld', 'tld'];

  layers.forEach(layer => {
    const weight = WEIGHTS[layer];
    const layerEvidence = evidence[layer] || {};

    Object.entries(layerEvidence).forEach(([pattern, count]) => {
      if (!counts[pattern]) {
        // Unknown pattern not in PATTERNS list - use uniform prior
        counts[pattern] = BETA / PATTERNS.length;
      }
      counts[pattern] += weight * count;
    });
  });

  // Handle kNN evidence with mass scaling (prevents neighborhood size from dominating)
  const knnEvidence = evidence.knn || {};
  if (Object.keys(knnEvidence).length > 0) {
    // Calculate total kNN mass
    const totalKNNMass = Object.values(knnEvidence).reduce((a, b) => a + b, 0);

    if (totalKNNMass > 0) {
      // Scale to ceiling
      const knnScale = Math.min(KNN_MASS_MAX / totalKNNMass, 1.0);

      Object.entries(knnEvidence).forEach(([pattern, mass]) => {
        if (!counts[pattern]) {
          counts[pattern] = BETA / PATTERNS.length;
        }
        // Apply scaled kNN weight
        counts[pattern] += WEIGHTS.knn * mass * knnScale;
      });
    }
  }

  // Numerical stability: clip all masses to floor
  Object.keys(counts).forEach(pattern => {
    counts[pattern] = Math.max(counts[pattern], MASS_FLOOR);
  });

  // Normalize to get posterior probabilities
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const posterior = {};

  Object.entries(counts).forEach(([pattern, count]) => {
    posterior[pattern] = count / totalCount;
  });

  return { counts, posterior };
}

/**
 * Find Maximum A Posteriori (MAP) pattern
 */
function findMAP(posterior) {
  const sorted = Object.entries(posterior)
    .sort(([, a], [, b]) => b - a);

  return {
    pattern: sorted[0][0],
    probability: sorted[0][1],
    runner_up: sorted[1] ? { pattern: sorted[1][0], probability: sorted[1][1] } : null
  };
}

/**
 * Compute uncertainty metrics
 */
function computeUncertainty(posterior) {
  const probs = Object.values(posterior);

  // Entropy: H = -Σ p*log2(p)
  const entropy = -probs.reduce((sum, p) => {
    return sum + (p > 0 ? p * Math.log2(p) : 0);
  }, 0);

  // Margin: difference between top-2
  const sorted = Object.values(posterior).sort((a, b) => b - a);
  const margin = sorted[0] - (sorted[1] || 0);

  // Tie detection: margin < TIE_THRESHOLD → validate both patterns
  const is_tie = margin < TIE_THRESHOLD;

  // Uncertainty flag (explicit gates)
  const is_uncertain = entropy > LLM_GATE.entropy_threshold || margin < LLM_GATE.margin_threshold;

  return {
    entropy: entropy,
    margin: margin,
    is_tie: is_tie,
    is_uncertain: is_uncertain
  };
}

/**
 * Compute final confidence score
 *
 * Formula (calibrated):
 * confidence = 0.55 * P(p*)
 *            + 0.25 * nb_signal (set later in orchestrator)
 *            + 0.10 * knn_agreement
 *            + 0.10 * certainty_bonus
 *
 * Certainty bonus = max(0, (margin - 0.10) * 0.5), clipped to [0, 0.10]
 * This rewards clear winners (margin > 0.10)
 *
 * For now (before NB validation), only compute base confidence
 */
function computeConfidence(map, posterior, evidence, uncertainty) {
  let confidence = 0;

  // 55% from posterior probability
  confidence += 0.55 * map.probability;

  // 25% reserved for NB signal (will be added in orchestrator after validation)
  // nb_signal ∈ {0, 0.66, 1.0}:
  //   - 0: 0/3 valid
  //   - 0.66: 1/3 valid
  //   - 1.0: 2+/3 valid
  // For now, use 0

  // 10% from kNN agreement (if kNN evidence exists)
  const knnAgreement = computeKNNAgreement(evidence, map.pattern);
  confidence += 0.10 * knnAgreement;

  // 10% certainty bonus (explicit formula)
  // Rewards margin > 0.10 (clear winner)
  const certaintyBonus = Math.max(0, Math.min((uncertainty.margin - 0.10) * 0.5, 0.10));
  confidence += certaintyBonus;

  // Clip to [0, 0.95] (reserve 0.95-0.99 for post-NB validation)
  return Math.max(0, Math.min(confidence, 0.95));
}

/**
 * Compute kNN agreement score
 * Returns: avg similarity of neighbors that agree with chosen pattern
 */
function computeKNNAgreement(evidence, pattern) {
  const knnEvidence = evidence.knn || {};
  const patternCount = knnEvidence[pattern] || 0;

  if (patternCount === 0) return 0;

  // Normalize by max possible kNN weight (10 neighbors * sim=1.0^γ = 10)
  // For now, simple normalization
  const totalKNN = Object.values(knnEvidence).reduce((a, b) => a + b, 0);

  return totalKNN > 0 ? patternCount / totalKNN : 0;
}

/**
 * Build trace for explainability
 */
function buildTrace(counts, evidence, map, uncertainty) {
  const trace = {
    beta: BETA,
    weights: WEIGHTS,
    prior_counts: {},
    evidence_contributions: {},
    total_counts: counts,
    map_pattern: map.pattern,
    map_probability: map.probability,
    runner_up: map.runner_up,
    entropy: uncertainty.entropy,
    margin: uncertainty.margin
  };

  // Prior contributions
  PATTERNS.forEach(p => {
    trace.prior_counts[p] = BETA * (GLOBAL_PRIORS[p] || 1.0 / PATTERNS.length);
  });

  // Evidence contributions by layer
  const layers = ['domain', 'knn', 'sector_region', 'sector', 'region_tld', 'tld'];
  layers.forEach(layer => {
    const layerEvidence = evidence[layer] || {};
    if (Object.keys(layerEvidence).length > 0) {
      trace.evidence_contributions[layer] = {};
      Object.entries(layerEvidence).forEach(([pattern, count]) => {
        trace.evidence_contributions[layer][pattern] = WEIGHTS[layer] * count;
      });
    }
  });

  return trace;
}

/**
 * Explain evidence in human-readable format
 */
function explainEvidence(pattern, evidence, posterior, trace) {
  const sources = [];
  const contributions = trace.evidence_contributions || {};

  // Check each layer for evidence
  Object.entries(contributions).forEach(([layer, patterns]) => {
    if (patterns[pattern]) {
      const weight = patterns[pattern].toFixed(2);
      const count = evidence[layer][pattern];

      if (layer === 'domain') {
        sources.push('exact domain');
      } else if (layer === 'knn') {
        sources.push(`kNN(Σsim^2=${count.toFixed(2)})`);
      } else if (layer === 'sector_region') {
        sources.push(`sector+region(${count.toFixed(1)} companies)`);
      } else if (layer === 'sector') {
        sources.push(`sector(${count.toFixed(1)})`);
      } else if (layer === 'region_tld') {
        sources.push(`region+TLD(${count.toFixed(1)})`);
      } else if (layer === 'tld') {
        sources.push(`TLD(${count.toFixed(1)})`);
      }
    }
  });

  if (sources.length === 0) {
    const priorMass = trace.prior_counts[pattern].toFixed(2);
    return `Global prior only (α=${priorMass}, P=${posterior[pattern].toFixed(2)})`;
  }

  return `Evidence: ${sources.join(' + ')} → P=${posterior[pattern].toFixed(2)}`;
}

/**
 * Check if LLM should be called (explicit uncertainty gates)
 */
export function shouldCallLLM(prediction) {
  const { uncertainty, confidence } = prediction;

  // Gate 1: High entropy
  if (uncertainty.entropy > LLM_GATE.entropy_threshold) return true;

  // Gate 2: Low margin (close race between top-2)
  if (uncertainty.margin < LLM_GATE.margin_threshold) return true;

  // Gate 3: Low confidence
  if (confidence < LLM_GATE.confidence_threshold) return true;

  return false;
}

/**
 * Get top-K candidate patterns for LLM
 */
export function getTopCandidates(prediction, k = 2) {
  const sorted = Object.entries(prediction.posterior)
    .sort(([, a], [, b]) => b - a)
    .slice(0, k);

  return sorted.map(([pattern, prob]) => ({
    pattern,
    probability: prob
  }));
}

/**
 * Get evidence summary for debugging/UI
 */
export async function getEvidence(context) {
  const { sector, region, tld, domain } = context;

  const domainTld = tld || (domain ? domain.split('.').pop() : null);

  return gatherEvidence({
    domain,
    sector,
    region,
    tld: domainTld
  });
}

/**
 * Get total count of validated patterns in database
 */
export async function getValidatedPatternCount() {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as total
      FROM email_patterns
      WHERE confidence >= 0.70
        AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
    `);

    return parseInt(result.rows[0].total);
  } catch (error) {
    console.error('[Rules] Error counting patterns:', error.message);
    return 0;
  }
}

/**
 * List all patterns with statistics
 */
export async function listPatterns() {
  try {
    const result = await pool.query(`
      SELECT
        pattern,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence,
        ARRAY_AGG(DISTINCT sector) FILTER (WHERE sector IS NOT NULL) as sectors,
        ARRAY_AGG(DISTINCT region) FILTER (WHERE region IS NOT NULL) as regions
      FROM email_patterns
      WHERE confidence >= 0.70
        AND last_source IN ('rag', 'llm', 'manual', 'nb_validation')
      GROUP BY pattern
      ORDER BY count DESC
    `);

    return result.rows.map(row => ({
      pattern: row.pattern,
      count: parseInt(row.count),
      avg_confidence: parseFloat(row.avg_confidence),
      sectors: row.sectors || [],
      regions: row.regions || []
    }));
  } catch (error) {
    console.error('[Rules] Error listing patterns:', error.message);
    return [];
  }
}

// Backward compatibility
export function explainRule(context) {
  return {
    pattern: null,
    confidence: 0,
    reason: 'Use predict() for evidence-based prediction'
  };
}

export function predictPatternByRules(companyContext) {
  return predict(companyContext);
}

export function getRulesConfidenceThreshold() {
  return LLM_GATE.confidence_threshold;
}

export default {
  predict,
  initGlobalPriors,
  shouldCallLLM,
  getTopCandidates,
  getEvidence,
  getValidatedPatternCount,
  listPatterns,
  explainRule,
  predictPatternByRules,
  getRulesConfidenceThreshold,
  // Export constants for testing/tuning
  PATTERNS,
  WEIGHTS,
  BETA,
  LLM_GATE,
  RECENCY_HALFLIFE_DAYS,
  KNN_GAMMA,
  KNN_MASS_MAX,
  MASS_FLOOR,
  TIE_THRESHOLD
};
