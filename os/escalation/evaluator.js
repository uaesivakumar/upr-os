/**
 * Escalation Evaluator (PRD v1.2 §6)
 *
 * Evaluates SIVA outputs for risk and determines escalation action:
 * - Calculates risk score from multiple factors
 * - Applies thresholds (0.3/0.7/0.9)
 * - Returns escalation decision
 *
 * PRD §6.1: "Every SIVA output has risk score"
 * PRD §6.2: "Escalation rules are non-negotiable"
 */

import {
  RISK_THRESHOLDS,
  ESCALATION_ACTIONS,
  RISK_CATEGORIES,
  RISK_FACTORS,
  ESCALATION_TARGETS,
  DISCLAIMER_TEMPLATES,
} from './types.js';

/**
 * Evaluate risk factors present in SIVA output
 *
 * @param {Object} sivaOutput - SIVA tool output
 * @param {Object} envelope - Sealed context envelope
 * @param {Object} [evidence] - Evidence used (for freshness check)
 * @returns {Object[]} - Array of detected risk factors
 */
export function detectRiskFactors(sivaOutput, envelope, evidence = null) {
  const factors = [];

  // Check confidence level
  const confidence = sivaOutput.confidence || sivaOutput._meta?.confidence || 1;
  if (confidence < 0.7) {
    factors.push({
      category: RISK_CATEGORIES.CONFIDENCE,
      weight: RISK_FACTORS[RISK_CATEGORIES.CONFIDENCE].weight,
      severity: 1 - confidence, // Lower confidence = higher severity
      reason: `Low confidence score: ${(confidence * 100).toFixed(1)}%`,
    });
  }

  // Check for stale evidence
  if (evidence) {
    const expires_at = new Date(evidence.expires_at);
    if (expires_at < new Date()) {
      factors.push({
        category: RISK_CATEGORIES.STALE_DATA,
        weight: RISK_FACTORS[RISK_CATEGORIES.STALE_DATA].weight,
        severity: 0.8, // Stale data is moderately risky
        reason: `Evidence expired at ${expires_at.toISOString()}`,
      });
    }
  }

  // Check for incomplete data
  const requiredFields = ['score', 'quality_tier', 'reasoning'];
  const missingFields = requiredFields.filter(f => !sivaOutput[f]);
  if (missingFields.length > 0) {
    factors.push({
      category: RISK_CATEGORIES.INCOMPLETE,
      weight: RISK_FACTORS[RISK_CATEGORIES.INCOMPLETE].weight,
      severity: missingFields.length / requiredFields.length,
      reason: `Missing fields: ${missingFields.join(', ')}`,
    });
  }

  // Check for edge cases (from output)
  if (sivaOutput.edge_cases && sivaOutput.edge_cases.length > 0) {
    const criticalEdgeCases = sivaOutput.edge_cases.filter(e => e.type === 'blocker' || e.severity === 'high');
    if (criticalEdgeCases.length > 0) {
      factors.push({
        category: RISK_CATEGORIES.EDGE_CASE,
        weight: RISK_FACTORS[RISK_CATEGORIES.EDGE_CASE].weight,
        severity: Math.min(1, criticalEdgeCases.length * 0.3),
        reason: `Critical edge cases: ${criticalEdgeCases.map(e => e.name || e.type).join(', ')}`,
      });
    }
  }

  // Check for regulatory flags (banking-specific)
  const vertical = envelope?.vertical;
  if (vertical === 'banking') {
    // Banking-specific risk checks
    if (sivaOutput.products && sivaOutput.products.some(p => p.type === 'loan' || p.type === 'credit')) {
      factors.push({
        category: RISK_CATEGORIES.REGULATORY,
        weight: RISK_FACTORS[RISK_CATEGORIES.REGULATORY].weight * 0.3, // Partial risk
        severity: 0.3,
        reason: 'Credit/loan product recommendation requires compliance review',
      });
    }

    // Check for financial advice language
    if (sivaOutput.reasoning && /guarantee|promise|certain|definite/i.test(JSON.stringify(sivaOutput.reasoning))) {
      factors.push({
        category: RISK_CATEGORIES.FINANCIAL,
        weight: RISK_FACTORS[RISK_CATEGORIES.FINANCIAL].weight,
        severity: 0.5,
        reason: 'Potential financial advice language detected',
      });
    }
  }

  // Check persona restrictions
  const persona_id = envelope?.persona_id;
  if (persona_id === '1') { // Customer-facing (most restricted)
    // Higher risk bar for customer-facing interactions
    if (confidence < 0.85) {
      factors.push({
        category: RISK_CATEGORIES.CUSTOMER_HARM,
        weight: RISK_FACTORS[RISK_CATEGORIES.CUSTOMER_HARM].weight * 0.5,
        severity: 0.4,
        reason: 'Customer-facing persona with sub-optimal confidence',
      });
    }
  }

  return factors;
}

/**
 * Calculate total risk score from factors
 *
 * @param {Object[]} factors - Risk factors
 * @returns {number} - Risk score 0-1 (capped at 1)
 */
export function calculateRiskScore(factors) {
  if (factors.length === 0) return 0;

  // Sum weighted severities
  const totalRisk = factors.reduce((sum, factor) => {
    return sum + (factor.weight * factor.severity);
  }, 0);

  // Cap at 1.0
  return Math.min(1, totalRisk);
}

/**
 * Determine escalation action based on risk score
 *
 * @param {number} riskScore - Risk score 0-1
 * @returns {string} - ESCALATION_ACTIONS enum
 */
export function determineAction(riskScore) {
  if (riskScore >= RISK_THRESHOLDS.BLOCK) {
    return ESCALATION_ACTIONS.BLOCK;
  }
  if (riskScore >= RISK_THRESHOLDS.ESCALATE) {
    return ESCALATION_ACTIONS.ESCALATE;
  }
  if (riskScore >= RISK_THRESHOLDS.DISCLAIMER) {
    return ESCALATION_ACTIONS.DISCLAIMER;
  }
  return ESCALATION_ACTIONS.ALLOW;
}

/**
 * Get applicable disclaimers based on risk factors
 *
 * @param {Object[]} factors - Risk factors
 * @returns {string[]} - Array of disclaimer texts
 */
export function getDisclaimers(factors) {
  const disclaimers = new Set();

  for (const factor of factors) {
    switch (factor.category) {
      case RISK_CATEGORIES.REGULATORY:
        disclaimers.add(DISCLAIMER_TEMPLATES.REGULATORY);
        break;
      case RISK_CATEGORIES.FINANCIAL:
        disclaimers.add(DISCLAIMER_TEMPLATES.FINANCIAL);
        break;
      case RISK_CATEGORIES.CONFIDENCE:
      case RISK_CATEGORIES.INCOMPLETE:
        disclaimers.add(DISCLAIMER_TEMPLATES.DATA_CONFIDENCE);
        break;
      case RISK_CATEGORIES.STALE_DATA:
        disclaimers.add(DISCLAIMER_TEMPLATES.STALE_DATA);
        break;
      default:
        // Don't add default for every factor
        break;
    }
  }

  // Add default if no specific disclaimers but action is disclaimer
  if (disclaimers.size === 0) {
    disclaimers.add(DISCLAIMER_TEMPLATES.DEFAULT);
  }

  return Array.from(disclaimers);
}

/**
 * Get escalation target based on risk factors
 *
 * @param {Object[]} factors - Risk factors
 * @returns {string} - ESCALATION_TARGETS enum
 */
export function getEscalationTarget(factors) {
  // Compliance queue for regulatory/financial risks
  const hasComplianceRisk = factors.some(f =>
    f.category === RISK_CATEGORIES.REGULATORY ||
    f.category === RISK_CATEGORIES.FINANCIAL ||
    f.category === RISK_CATEGORIES.DATA_PRIVACY
  );

  if (hasComplianceRisk) {
    return ESCALATION_TARGETS.COMPLIANCE_QUEUE;
  }

  // Manager queue for customer harm
  const hasCustomerRisk = factors.some(f =>
    f.category === RISK_CATEGORIES.CUSTOMER_HARM ||
    f.category === RISK_CATEGORIES.BRAND
  );

  if (hasCustomerRisk) {
    return ESCALATION_TARGETS.MANAGER_QUEUE;
  }

  // Default to supervisor queue
  return ESCALATION_TARGETS.SUPERVISOR_QUEUE;
}

/**
 * Full risk assessment of SIVA output
 *
 * @param {Object} sivaOutput - SIVA tool output
 * @param {Object} envelope - Sealed context envelope
 * @param {Object} [evidence] - Evidence used
 * @returns {Object} - Complete risk assessment
 */
export function assessRisk(sivaOutput, envelope, evidence = null) {
  // Detect risk factors
  const factors = detectRiskFactors(sivaOutput, envelope, evidence);

  // Calculate total risk
  const total_risk = calculateRiskScore(factors);

  // Determine action
  const action = determineAction(total_risk);

  // Get disclaimers if needed
  const disclaimers = action !== ESCALATION_ACTIONS.ALLOW
    ? getDisclaimers(factors)
    : [];

  // Get escalation target if escalating
  const target = action === ESCALATION_ACTIONS.ESCALATE || action === ESCALATION_ACTIONS.BLOCK
    ? getEscalationTarget(factors)
    : null;

  // Build reason
  let reason;
  switch (action) {
    case ESCALATION_ACTIONS.BLOCK:
      reason = `Risk score ${(total_risk * 100).toFixed(1)}% exceeds block threshold (${RISK_THRESHOLDS.BLOCK * 100}%)`;
      break;
    case ESCALATION_ACTIONS.ESCALATE:
      reason = `Risk score ${(total_risk * 100).toFixed(1)}% requires supervisor review`;
      break;
    case ESCALATION_ACTIONS.DISCLAIMER:
      reason = `Risk score ${(total_risk * 100).toFixed(1)}% requires disclaimer`;
      break;
    default:
      reason = `Risk score ${(total_risk * 100).toFixed(1)}% within acceptable limits`;
  }

  return {
    total_risk,
    action,
    factors,
    disclaimers,
    target,
    reason,
    thresholds: RISK_THRESHOLDS,
    evaluated_at: new Date().toISOString(),
  };
}

/**
 * Apply escalation decision to SIVA output
 *
 * @param {Object} sivaOutput - Original SIVA output
 * @param {Object} assessment - Risk assessment
 * @returns {Object} - Modified output with escalation info
 */
export function applyEscalation(sivaOutput, assessment) {
  const result = { ...sivaOutput };

  // Add risk assessment to meta
  result._escalation = {
    risk_score: assessment.total_risk,
    action: assessment.action,
    reason: assessment.reason,
  };

  // Apply action
  switch (assessment.action) {
    case ESCALATION_ACTIONS.BLOCK:
      result._blocked = true;
      result._block_reason = assessment.reason;
      result._escalation_target = assessment.target;
      // Clear sensitive output fields
      delete result.recommendations;
      delete result.outreach;
      delete result.message;
      break;

    case ESCALATION_ACTIONS.ESCALATE:
      result._requires_review = true;
      result._escalation_target = assessment.target;
      result._review_reason = assessment.reason;
      break;

    case ESCALATION_ACTIONS.DISCLAIMER:
      result._disclaimers = assessment.disclaimers;
      break;

    default:
      // No modification for ALLOW
      break;
  }

  return result;
}

export default {
  detectRiskFactors,
  calculateRiskScore,
  determineAction,
  getDisclaimers,
  getEscalationTarget,
  assessRisk,
  applyEscalation,
};
