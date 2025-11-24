// server/lib/emailIntelligence/confidence.js
// Confidence Scoring System for Email Pattern Predictions
// Combines scores from multiple layers (RAG, Rules, LLM, NeverBounce)

/**
 * Confidence Scoring (Pattern Quality Assessment)
 *
 * Goal: Calculate final confidence score for email patterns
 * Method: Weighted average of multiple signals
 *
 * Confidence Bands:
 * - 90-100%: Verified valid (NeverBounce confirmed)
 * - 80-89%: High confidence (RAG hit + sector match)
 * - 70-79%: Medium confidence (Rules match or LLM prediction)
 * - 60-69%: Low confidence (Smart permutation)
 * - <60%: Unreliable (reject)
 *
 * Week 1: Basic scoring implementation
 */

/**
 * Calculate final confidence score
 * @param {Object} signals - Confidence signals from multiple layers
 * @param {number} signals.rag_confidence - RAG similarity score (0-1)
 * @param {number} signals.rules_confidence - Rules engine score (0-1)
 * @param {number} signals.llm_confidence - LLM prediction score (0-1)
 * @param {boolean} signals.nb_verified - NeverBounce verification result
 * @param {string} signals.layer_used - Which layer provided the pattern
 * @returns {number} Final confidence score (0-1)
 */
export function calculateFinalConfidence(signals) {
  const {
    rag_confidence = 0,
    rules_confidence = 0,
    llm_confidence = 0,
    nb_verified = false,
    layer_used
  } = signals;

  // If NeverBounce verified, boost confidence to 95%+
  if (nb_verified) {
    return Math.min(0.98, Math.max(rag_confidence, rules_confidence, llm_confidence) + 0.15);
  }

  // Layer-specific confidence calculation
  switch (layer_used) {
    case 'rag':
      // RAG has high base confidence if similarity is strong
      return Math.max(rag_confidence, 0.75);

    case 'rules':
      // Rules have moderate confidence based on business logic
      return rules_confidence || 0.72;

    case 'llm':
      // LLM confidence depends on its own assessment
      return llm_confidence || 0.68;

    case 'nb_fallback':
      // Smart permutation fallback has lower confidence
      return 0.62;

    default:
      // Unknown layer - return highest available signal
      return Math.max(rag_confidence, rules_confidence, llm_confidence, 0.5);
  }
}

/**
 * Determine confidence band
 * @param {number} confidence - Confidence score (0-1)
 * @returns {string} Confidence band label
 */
export function getConfidenceBand(confidence) {
  if (confidence >= 0.90) return 'verified';
  if (confidence >= 0.80) return 'high';
  if (confidence >= 0.70) return 'medium';
  if (confidence >= 0.60) return 'low';
  return 'unreliable';
}

/**
 * Check if confidence meets threshold for acceptance
 * @param {number} confidence - Confidence score (0-1)
 * @param {number} threshold - Minimum acceptable confidence (default: 0.70)
 * @returns {boolean} True if confidence meets threshold
 */
export function meetsConfidenceThreshold(confidence, threshold = 0.70) {
  return confidence >= threshold;
}

/**
 * Calculate weighted confidence from multiple sources
 * @param {Array<Object>} sources - List of confidence sources
 * @returns {number} Weighted average confidence
 */
export function calculateWeightedConfidence(sources) {
  // Weights: RAG (40%), Rules (30%), LLM (30%)
  const weights = {
    rag: 0.40,
    rules: 0.30,
    llm: 0.30
  };

  let totalWeight = 0;
  let weightedSum = 0;

  sources.forEach(source => {
    const weight = weights[source.layer] || 0;
    if (source.confidence > 0) {
      weightedSum += source.confidence * weight;
      totalWeight += weight;
    }
  });

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Boost confidence based on validation success
 * @param {number} currentConfidence - Current confidence score
 * @param {number} validationAttempts - Total validation attempts
 * @param {number} validationSuccesses - Successful validations
 * @returns {number} Adjusted confidence score
 */
export function adjustConfidenceByValidation(currentConfidence, validationAttempts, validationSuccesses) {
  if (validationAttempts === 0) return currentConfidence;

  const successRate = validationSuccesses / validationAttempts;

  // Boost confidence if success rate is high
  if (successRate >= 0.9) return Math.min(currentConfidence + 0.10, 0.98);
  if (successRate >= 0.8) return Math.min(currentConfidence + 0.05, 0.95);

  // Reduce confidence if success rate is low
  if (successRate < 0.5) return Math.max(currentConfidence - 0.10, 0.50);
  if (successRate < 0.7) return Math.max(currentConfidence - 0.05, 0.60);

  return currentConfidence;
}

/**
 * Get confidence score emoji for display
 * @param {number} confidence - Confidence score (0-1)
 * @returns {string} Emoji representing confidence level
 */
export function getConfidenceEmoji(confidence) {
  if (confidence >= 0.90) return '🟢'; // Verified
  if (confidence >= 0.80) return '🔵'; // High
  if (confidence >= 0.70) return '🟡'; // Medium
  if (confidence >= 0.60) return '🟠'; // Low
  return '🔴'; // Unreliable
}

/**
 * Compute final confidence (simplified for orchestrator)
 * @param {Object} params - Parameters
 * @param {string} params.source - Source layer
 * @param {Object} params.nb - NeverBounce results
 * @param {Object} params.health - Domain health
 * @returns {number} Final confidence score (0-1)
 */
export function compute({ source, nb, health }) {
  let baseConfidence = 0.70;

  // Adjust base confidence by source
  if (source === 'rag') baseConfidence = 0.85;
  else if (source === 'rules') baseConfidence = 0.75;
  else if (source === 'llm') baseConfidence = 0.70;

  // Boost if NeverBounce validation successful
  if (nb && nb.valid > 0) {
    const successRate = nb.valid / (nb.total || 1);
    if (successRate >= 0.66) {
      baseConfidence = Math.min(baseConfidence + 0.15, 0.98);
    }
  }

  // Penalize if catch-all domain
  if (health && health.catch_all) {
    baseConfidence = Math.max(baseConfidence - 0.10, 0.60);
  }

  return baseConfidence;
}

export default {
  calculateFinalConfidence,
  getConfidenceBand,
  meetsConfidenceThreshold,
  calculateWeightedConfidence,
  adjustConfidenceByValidation,
  getConfidenceEmoji,
  compute
};
