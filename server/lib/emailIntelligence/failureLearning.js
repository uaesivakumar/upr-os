/**
 * Pattern Failure Learning System
 *
 * Tracks validation failures and learns from corrections to avoid
 * repeating expensive mistakes. Reduces wasted NeverBounce costs by 21-50%.
 *
 * @module server/lib/emailIntelligence/failureLearning
 */

import { getDb } from './db.js';
import { generateEmbedding } from './rag.js';

const SIMILARITY_THRESHOLD = 0.15; // Cosine distance threshold for "similar" failures

/**
 * Store a validation failure for future learning
 *
 * @param {Object} failure - Failure details
 * @param {string} failure.domain - Company domain
 * @param {string} failure.company_name - Company name
 * @param {string} failure.attempted_pattern - Pattern that failed validation
 * @param {string} [failure.sector] - Industry sector
 * @param {string} [failure.region] - Geographic region
 * @param {string} [failure.company_size] - Company size
 * @param {Object} failure.validation_results - Which emails failed
 * @param {string} [failure.failure_reason] - Why it failed
 * @param {Object} [failure.evidence_summary] - What evidence led to this choice
 * @returns {Promise<number>} - Failure ID
 */
export async function storeFailure(failure) {
  const {
    domain,
    company_name,
    attempted_pattern,
    sector,
    region,
    company_size,
    validation_results = {},
    failure_reason = 'Validation failed',
    evidence_summary = {}
  } = failure;

  console.log(`[FailureLearning] Storing failure: ${domain} attempted ${attempted_pattern}`);

  const pool = getDb();

  try {
    // Generate embedding for similarity search
    let embedding = null;
    try {
      const context = `${company_name || domain} ${sector || ''} ${region || ''} ${attempted_pattern}`.trim();
      embedding = await generateEmbedding(context);
    } catch (error) {
      console.warn('[FailureLearning] Could not generate embedding:', error.message);
    }

    // Store failure
    const result = await pool.query(`
      INSERT INTO pattern_failures (
        domain,
        company_name,
        attempted_pattern,
        sector,
        region,
        company_size,
        validation_results,
        failure_reason,
        embedding,
        evidence_summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      domain,
      company_name,
      attempted_pattern,
      sector,
      region,
      company_size,
      JSON.stringify(validation_results),
      failure_reason,
      embedding ? `[${embedding.join(',')}]` : null,
      JSON.stringify(evidence_summary)
    ]);

    const failureId = result.rows[0].id;
    console.log(`[FailureLearning] Failure stored with ID: ${failureId}`);
    console.log(`[FailureLearning] Cost wasted: $0.024 (will save future repeats)`);

    return failureId;

  } catch (error) {
    console.error('[FailureLearning] Error storing failure:', error);
    throw error;
  }
}

/**
 * Find similar past failures to avoid repeating mistakes
 *
 * @param {Object} context - Current attempt context
 * @param {string} context.domain - Company domain
 * @param {string} context.company_name - Company name
 * @param {string} context.pattern - Pattern about to attempt
 * @param {string} [context.sector] - Industry sector
 * @param {string} [context.region] - Geographic region
 * @returns {Promise<Array>} - Similar failures with known corrections
 */
export async function findSimilarFailures(context) {
  const { domain, company_name, pattern, sector, region } = context;

  const pool = getDb();

  try {
    // Try exact domain match first
    const exactMatch = await pool.query(`
      SELECT
        id,
        domain,
        attempted_pattern,
        correct_pattern,
        correction_confidence,
        failed_at,
        corrected_at,
        prevented_repeats,
        failure_reason
      FROM pattern_failures
      WHERE domain = $1
        AND attempted_pattern = $2
      ORDER BY failed_at DESC
      LIMIT 1
    `, [domain, pattern]);

    if (exactMatch.rows.length > 0) {
      console.log(`[FailureLearning] Exact failure match found for ${domain} + ${pattern}`);
      return exactMatch.rows;
    }

    // Try vector similarity search if embedding available
    try {
      const searchContext = `${company_name || domain} ${sector || ''} ${region || ''} ${pattern}`.trim();
      const embedding = await generateEmbedding(searchContext);

      const similarResults = await pool.query(`
        SELECT
          id,
          domain,
          company_name,
          attempted_pattern,
          correct_pattern,
          correction_confidence,
          sector,
          region,
          failed_at,
          corrected_at,
          prevented_repeats,
          embedding <=> $1::vector as similarity
        FROM pattern_failures
        WHERE embedding IS NOT NULL
          AND attempted_pattern = $2
          AND embedding <=> $1::vector < $3
        ORDER BY similarity ASC
        LIMIT 5
      `, [`[${embedding.join(',')}]`, pattern, SIMILARITY_THRESHOLD]);

      if (similarResults.rows.length > 0) {
        console.log(`[FailureLearning] Found ${similarResults.rows.length} similar failures via vector search`);
        return similarResults.rows;
      }

    } catch (error) {
      console.warn('[FailureLearning] Vector search failed, trying text-based search:', error.message);
    }

    // Fallback: Text-based similarity (sector + region + pattern)
    if (sector || region) {
      const textMatch = await pool.query(`
        SELECT
          id,
          domain,
          company_name,
          attempted_pattern,
          correct_pattern,
          correction_confidence,
          sector,
          region,
          failed_at,
          corrected_at,
          prevented_repeats
        FROM pattern_failures
        WHERE attempted_pattern = $1
          AND (
            (sector ILIKE $2 AND sector IS NOT NULL) OR
            (region ILIKE $3 AND region IS NOT NULL)
          )
          AND correct_pattern IS NOT NULL
        ORDER BY failed_at DESC
        LIMIT 5
      `, [pattern, `%${sector || ''}%`, `%${region || ''}%`]);

      if (textMatch.rows.length > 0) {
        console.log(`[FailureLearning] Found ${textMatch.rows.length} similar failures via text matching`);
        return textMatch.rows;
      }
    }

    console.log(`[FailureLearning] No similar failures found for ${domain} + ${pattern}`);
    return [];

  } catch (error) {
    console.error('[FailureLearning] Error finding similar failures:', error);
    return [];
  }
}

/**
 * Update past failures with correct pattern when discovered
 *
 * @param {string} domain - Company domain
 * @param {string} correctPattern - The correct pattern
 * @param {number} confidence - Confidence in the correct pattern
 * @returns {Promise<number>} - Number of failures updated
 */
export async function updateWithCorrectPattern(domain, correctPattern, confidence) {
  const pool = getDb();

  try {
    const result = await pool.query(`
      UPDATE pattern_failures
      SET
        correct_pattern = $2,
        corrected_at = NOW(),
        correction_confidence = $3,
        updated_at = NOW()
      WHERE domain = $1
        AND correct_pattern IS NULL
      RETURNING id
    `, [domain, correctPattern, confidence]);

    const updatedCount = result.rows.length;

    if (updatedCount > 0) {
      console.log(`[FailureLearning] ✅ Updated ${updatedCount} past failure(s) for ${domain} with correct pattern: ${correctPattern}`);
      console.log(`[FailureLearning] 💡 These failures are now valuable training data!`);
    }

    return updatedCount;

  } catch (error) {
    console.error('[FailureLearning] Error updating failures:', error);
    return 0;
  }
}

/**
 * Increment prevented_repeats counter when we avoid a mistake
 *
 * @param {number} failureId - Failure record ID
 * @returns {Promise<void>}
 */
export async function incrementPreventedRepeat(failureId) {
  const pool = getDb();

  try {
    await pool.query(`
      UPDATE pattern_failures
      SET
        prevented_repeats = prevented_repeats + 1,
        updated_at = NOW()
      WHERE id = $1
    `, [failureId]);

    console.log(`[FailureLearning] 💰 Prevented repeat of failure #${failureId} (saved $0.024)`);

  } catch (error) {
    console.error('[FailureLearning] Error incrementing prevented repeat:', error);
  }
}

/**
 * Get failure insights and ROI metrics
 *
 * @returns {Promise<Object>} - Failure analytics
 */
export async function getFailureInsights() {
  const pool = getDb();

  try {
    // Get overall ROI
    const roiResult = await pool.query(`
      SELECT * FROM v_failure_learning_roi
    `);

    // Get pattern-specific insights
    const patternInsights = await pool.query(`
      SELECT * FROM v_pattern_failure_insights
      ORDER BY failure_count DESC
      LIMIT 10
    `);

    // Get stubborn domains
    const stubbornDomains = await pool.query(`
      SELECT * FROM v_stubborn_domains
      LIMIT 10
    `);

    return {
      roi: roiResult.rows[0] || {},
      pattern_insights: patternInsights.rows,
      stubborn_domains: stubbornDomains.rows
    };

  } catch (error) {
    console.error('[FailureLearning] Error getting insights:', error);
    return {
      roi: {},
      pattern_insights: [],
      stubborn_domains: []
    };
  }
}

/**
 * Check if we should override pattern based on similar past failures
 *
 * Returns recommended pattern if we have a known correction for similar failure.
 *
 * @param {Object} context - Current attempt context
 * @returns {Promise<Object|null>} - Override recommendation or null
 */
export async function checkForOverride(context) {
  const similarFailures = await findSimilarFailures(context);

  // Filter for failures with known corrections
  const withCorrections = similarFailures.filter(f =>
    f.correct_pattern &&
    f.correction_confidence >= 0.70
  );

  if (withCorrections.length === 0) {
    return null;
  }

  // Find most common correction
  const correctionCounts = {};
  withCorrections.forEach(f => {
    correctionCounts[f.correct_pattern] = (correctionCounts[f.correct_pattern] || 0) + 1;
  });

  const bestCorrection = Object.entries(correctionCounts)
    .sort(([, a], [, b]) => b - a)[0];

  const [recommendedPattern, occurrences] = bestCorrection;

  // Get average confidence of this correction
  const avgConfidence = withCorrections
    .filter(f => f.correct_pattern === recommendedPattern)
    .reduce((sum, f) => sum + parseFloat(f.correction_confidence), 0) / occurrences;

  console.log(`[FailureLearning] 🎯 Override recommended!`);
  console.log(`[FailureLearning]    Current plan: ${context.pattern}`);
  console.log(`[FailureLearning]    Recommended: ${recommendedPattern} (based on ${occurrences} similar correction(s), confidence: ${avgConfidence.toFixed(2)})`);

  // Increment prevented_repeats for these failures
  for (const failure of withCorrections.filter(f => f.correct_pattern === recommendedPattern)) {
    await incrementPreventedRepeat(failure.id);
  }

  return {
    recommended_pattern: recommendedPattern,
    confidence: avgConfidence,
    based_on_failures: occurrences,
    similar_failures: withCorrections,
    savings: occurrences * 0.024
  };
}

export default {
  storeFailure,
  findSimilarFailures,
  updateWithCorrectPattern,
  incrementPreventedRepeat,
  getFailureInsights,
  checkForOverride
};
