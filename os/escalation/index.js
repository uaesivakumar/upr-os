/**
 * Escalation Contract Module (PRD v1.2 §6)
 *
 * Risk-based escalation system for SIVA outputs:
 * - Types and constants (thresholds, categories, factors)
 * - Evaluator (risk assessment, action determination)
 * - Middleware (route-level escalation enforcement)
 *
 * Key PRD Requirements:
 * - §6.1: Every SIVA output has risk score
 * - §6.2: Escalation rules are non-negotiable
 * - §6.3: All escalations are logged
 *
 * Thresholds:
 * - ≥0.3: Add disclaimer
 * - ≥0.7: Escalate to supervisor
 * - ≥0.9: Block action
 */

// Types and constants
export {
  RISK_THRESHOLDS,
  ESCALATION_ACTIONS,
  RISK_CATEGORIES,
  RISK_FACTORS,
  ESCALATION_TARGETS,
  DISCLAIMER_TEMPLATES,
} from './types.js';

// Evaluator
export {
  detectRiskFactors,
  calculateRiskScore,
  determineAction,
  getDisclaimers,
  getEscalationTarget,
  assessRisk,
  applyEscalation,
} from './evaluator.js';

// Middleware
export {
  escalationMiddleware,
  preflightCheck,
  requireApprovalMiddleware,
} from './middleware.js';

// Default export
import {
  RISK_THRESHOLDS,
  ESCALATION_ACTIONS,
  RISK_CATEGORIES,
  RISK_FACTORS,
  ESCALATION_TARGETS,
  DISCLAIMER_TEMPLATES,
} from './types.js';
import {
  detectRiskFactors,
  calculateRiskScore,
  determineAction,
  getDisclaimers,
  getEscalationTarget,
  assessRisk,
  applyEscalation,
} from './evaluator.js';
import {
  escalationMiddleware,
  preflightCheck,
  requireApprovalMiddleware,
} from './middleware.js';

export default {
  // Types
  RISK_THRESHOLDS,
  ESCALATION_ACTIONS,
  RISK_CATEGORIES,
  RISK_FACTORS,
  ESCALATION_TARGETS,
  DISCLAIMER_TEMPLATES,

  // Evaluator
  detectRiskFactors,
  calculateRiskScore,
  determineAction,
  getDisclaimers,
  getEscalationTarget,
  assessRisk,
  applyEscalation,

  // Middleware
  escalationMiddleware,
  preflightCheck,
  requireApprovalMiddleware,
};
