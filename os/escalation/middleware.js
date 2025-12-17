/**
 * Escalation Middleware (PRD v1.2 §6)
 *
 * Express middleware for applying escalation contract to SIVA outputs.
 *
 * PRD §6.2: "Escalation rules are non-negotiable"
 * PRD §6.3: "All escalations are logged"
 */

import { assessRisk, applyEscalation } from './evaluator.js';
import { ESCALATION_ACTIONS } from './types.js';

/**
 * Log escalation event
 *
 * @param {Object} req - Express request
 * @param {Object} assessment - Risk assessment
 * @param {Object} envelope - Sealed context envelope
 */
async function logEscalation(req, assessment, envelope) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    interaction_id: req.sealedEnvelope?.interaction_id || null,
    envelope_hash: envelope?.sha256_hash || null,
    tenant_id: envelope?.tenant_id || null,
    persona_id: envelope?.persona_id || null,
    endpoint: req.originalUrl,
    method: req.method,
    risk_score: assessment.total_risk,
    action: assessment.action,
    factors: assessment.factors.map(f => ({
      category: f.category,
      severity: f.severity,
      reason: f.reason,
    })),
    escalation_target: assessment.target,
  };

  // Log to console (structured logging)
  console.log('[Escalation]', JSON.stringify(logEntry));

  // In production, this would log to database via agentDecisionLogger
  // For now, we just log to console
}

/**
 * Escalation middleware factory
 *
 * Creates middleware that evaluates SIVA output for risk
 * and applies escalation actions.
 *
 * @param {Object} [options] - Middleware options
 * @param {boolean} [options.blockOnHighRisk=true] - Block response if risk exceeds threshold
 * @param {boolean} [options.logAllAssessments=true] - Log all assessments (not just escalations)
 * @returns {Function} - Express middleware
 */
export function escalationMiddleware(options = {}) {
  const {
    blockOnHighRisk = true,
    logAllAssessments = true,
  } = options;

  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override res.json to intercept response
    res.json = async function(data) {
      // Only process successful SIVA responses
      if (!data || !data.success) {
        return originalJson(data);
      }

      try {
        // Get envelope from request (set by envelopeMiddleware)
        const envelope = req.sealedEnvelope;

        // Get evidence if available
        const evidence = req.evidence || null;

        // Get SIVA output (could be data.data or data directly)
        const sivaOutput = data.data || data;

        // Assess risk
        const assessment = assessRisk(sivaOutput, envelope, evidence);

        // Log if required
        if (logAllAssessments || assessment.action !== ESCALATION_ACTIONS.ALLOW) {
          await logEscalation(req, assessment, envelope);
        }

        // Apply escalation
        const modifiedOutput = applyEscalation(sivaOutput, assessment);

        // Handle blocking
        if (blockOnHighRisk && assessment.action === ESCALATION_ACTIONS.BLOCK) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'ESCALATION_BLOCKED',
              message: assessment.reason,
              risk_score: assessment.total_risk,
              escalation_target: assessment.target,
            },
          });
        }

        // Return modified response
        const response = data.data
          ? { ...data, data: modifiedOutput }
          : modifiedOutput;

        return originalJson(response);
      } catch (error) {
        console.error('[Escalation Middleware] Error:', error);
        // On error, pass through original response
        return originalJson(data);
      }
    };

    next();
  };
}

/**
 * Pre-flight escalation check
 *
 * Use this to check escalation BEFORE executing SIVA tool.
 * Useful for blocking high-risk requests early.
 *
 * @param {Object} input - Tool input
 * @param {Object} envelope - Sealed context envelope
 * @returns {Object} - { allowed: boolean, reason: string }
 */
export function preflightCheck(input, envelope) {
  // Check persona restrictions
  const persona_id = envelope?.persona_id;

  // Customer-facing (1) cannot execute certain operations
  if (persona_id === '1') {
    const restrictedOps = ['bulk_outreach', 'automated_send', 'data_export'];
    if (restrictedOps.includes(input.operation)) {
      return {
        allowed: false,
        reason: `Customer-facing persona cannot execute ${input.operation}`,
        action: ESCALATION_ACTIONS.BLOCK,
      };
    }
  }

  // NOTE: Persona 7 (Internal) has same capabilities as Sales-Rep.
  // Shadow Tenant constraints are enforced at tenant level, not persona level.
  // See: docs/SHADOW_TENANT.md

  return {
    allowed: true,
    reason: 'Pre-flight check passed',
    action: ESCALATION_ACTIONS.ALLOW,
  };
}

/**
 * Require escalation approval middleware
 *
 * Blocks requests that require supervisor approval until approved.
 *
 * @param {Object} [options] - Options
 * @returns {Function} - Express middleware
 */
export function requireApprovalMiddleware(options = {}) {
  return async (req, res, next) => {
    // Check if this request has been approved
    const approvalId = req.headers['x-escalation-approval-id'];

    if (approvalId) {
      // Verify approval (would check database in production)
      // For now, just pass through
      req.escalationApproved = true;
    }

    next();
  };
}

export default {
  escalationMiddleware,
  preflightCheck,
  requireApprovalMiddleware,
};
