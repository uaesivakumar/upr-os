/**
 * Sealed Context Envelope Middleware (PRD v1.2 §2.3)
 *
 * Enforcement Rules:
 * - UPR-OS validates schema + hash before SIVA call
 * - Missing or malformed envelope → 403 reject
 * - Envelope is immutable for that interaction
 * - Envelope hash is stored with audit logs
 *
 * Usage:
 * 1. Apply envelopeMiddleware() to routes that invoke SIVA
 * 2. Access envelope via req.sealedEnvelope
 * 3. Envelope is automatically logged to audit
 */

import { createEnvelopeFromRequest } from './factory.js';
import { validateEnvelope, isToolAllowed, checkCostBudget } from './validator.js';
import db from '../../utils/db.js';

const { pool } = db;

/**
 * Middleware that creates and validates a sealed envelope for SIVA calls
 * Blocks request with 403 if envelope is invalid
 */
export function envelopeMiddleware() {
  return async (req, res, next) => {
    try {
      // Generate envelope from request context
      const envelope = createEnvelopeFromRequest(req);

      // Validate envelope
      const validation = validateEnvelope(envelope);

      if (!validation.valid) {
        console.error('[Envelope] Validation failed:', validation.errors);
        return res.status(403).json({
          success: false,
          error: {
            code: 'ENVELOPE_INVALID',
            message: 'Sealed context envelope validation failed',
            details: validation.errors,
          },
          meta: {
            correlation_id: req.correlationId || 'unknown',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Attach sealed envelope to request (immutable)
      req.sealedEnvelope = Object.freeze(envelope);

      // Log envelope to audit trail
      await logEnvelopeToAudit(req, envelope);

      next();
    } catch (error) {
      console.error('[Envelope] Creation failed:', error.message);
      return res.status(403).json({
        success: false,
        error: {
          code: 'ENVELOPE_CREATION_FAILED',
          message: 'Failed to create sealed context envelope',
          details: error.message,
        },
        meta: {
          correlation_id: req.correlationId || 'unknown',
          timestamp: new Date().toISOString(),
        },
      });
    }
  };
}

/**
 * Middleware that validates a SIVA tool is allowed by envelope
 * Use as: router.post('/score', envelopeMiddleware(), toolGateMiddleware('CompanyQualityTool'), ...)
 */
export function toolGateMiddleware(toolName) {
  return (req, res, next) => {
    const envelope = req.sealedEnvelope;

    if (!envelope) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ENVELOPE_MISSING',
          message: 'Sealed context envelope required but not found',
        },
      });
    }

    if (!isToolAllowed(envelope, toolName)) {
      console.warn(`[Envelope] Tool ${toolName} not allowed for persona ${envelope.persona_id}`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'TOOL_NOT_ALLOWED',
          message: `Tool ${toolName} is not allowed for persona ${envelope.persona_id}`,
          allowed_tools: envelope.allowed_tools,
        },
      });
    }

    next();
  };
}

/**
 * Middleware that validates cost budget before LLM calls
 */
export function costBudgetMiddleware(estimatedTokens = 1000) {
  return (req, res, next) => {
    const envelope = req.sealedEnvelope;

    if (!envelope) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ENVELOPE_MISSING',
          message: 'Sealed context envelope required for cost validation',
        },
      });
    }

    const budgetCheck = checkCostBudget(envelope, estimatedTokens);

    if (!budgetCheck.allowed) {
      console.warn(`[Envelope] Cost budget exceeded: ${budgetCheck.reason}`);
      return res.status(429).json({
        success: false,
        error: {
          code: 'COST_BUDGET_EXCEEDED',
          message: budgetCheck.reason,
          budget: envelope.cost_budget,
        },
      });
    }

    next();
  };
}

/**
 * Log envelope to audit trail
 * Stores envelope hash and key metadata for compliance
 */
async function logEnvelopeToAudit(req, envelope) {
  try {
    const query = `
      INSERT INTO envelope_audit_log (
        envelope_hash,
        envelope_version,
        tenant_id,
        user_id,
        persona_id,
        vertical,
        sub_vertical,
        region,
        endpoint,
        method,
        correlation_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    `;

    await pool.query(query, [
      envelope.sha256_hash,
      envelope.envelope_version,
      envelope.tenant_id,
      envelope.user_id,
      envelope.persona_id,
      envelope.vertical,
      envelope.sub_vertical,
      envelope.region,
      req.path,
      req.method,
      req.correlationId || 'unknown',
    ]);
  } catch (error) {
    // Log error but don't block request - audit is best-effort
    console.error('[Envelope] Failed to log to audit:', error.message);
  }
}

/**
 * Extract envelope from request for SIVA tools
 * Use this in SIVA tool wrappers to get envelope context
 */
export function getEnvelopeFromRequest(req) {
  if (!req.sealedEnvelope) {
    throw new Error('SIVA cannot execute without sealed envelope');
  }
  return req.sealedEnvelope;
}

/**
 * Validate SIVA can execute with given envelope
 * Throws if envelope is missing or invalid
 */
export function requireEnvelope(req) {
  if (!req.sealedEnvelope) {
    const error = new Error('SIVA cannot execute without sealed envelope');
    error.code = 'ENVELOPE_REQUIRED';
    error.status = 403;
    throw error;
  }

  const validation = validateEnvelope(req.sealedEnvelope);
  if (!validation.valid) {
    const error = new Error(`Envelope validation failed: ${validation.errors.join(', ')}`);
    error.code = 'ENVELOPE_INVALID';
    error.status = 403;
    throw error;
  }

  return req.sealedEnvelope;
}

export default {
  envelopeMiddleware,
  toolGateMiddleware,
  costBudgetMiddleware,
  getEnvelopeFromRequest,
  requireEnvelope,
};
