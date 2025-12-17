/**
 * Sealed Context Envelope Module (PRD v1.2 §2)
 *
 * This module provides the complete envelope system for SIVA invocations:
 * - Type definitions and canonical personas
 * - Envelope factory for creation
 * - Validator for schema + hash validation
 * - Middleware for route enforcement
 *
 * CRITICAL: SIVA cannot execute without a valid sealed envelope.
 * This envelope is the single strongest anti-clone moat.
 */

// Types and constants
export {
  CANONICAL_PERSONAS,
  PERSONA_CAPABILITIES,
  ENVELOPE_VERSION,
  DEFAULT_ESCALATION_RULES,
} from './types.js';

// Factory
export {
  createEnvelope,
  createEnvelopeFromRequest,
} from './factory.js';

// Validator
export {
  validateSchema,
  validateHash,
  validateEnvelope,
  isIntentAllowed,
  isOutputAllowed,
  isToolAllowed,
  checkCostBudget,
  REQUIRED_FIELDS,
} from './validator.js';

// Middleware
export {
  envelopeMiddleware,
  toolGateMiddleware,
  costBudgetMiddleware,
  getEnvelopeFromRequest,
  requireEnvelope,
} from './middleware.js';

// Default export for convenience
import { createEnvelope, createEnvelopeFromRequest } from './factory.js';
import { validateEnvelope, isToolAllowed, checkCostBudget } from './validator.js';
import { envelopeMiddleware, toolGateMiddleware, requireEnvelope } from './middleware.js';
import { CANONICAL_PERSONAS, ENVELOPE_VERSION, DEFAULT_ESCALATION_RULES } from './types.js';

export default {
  // Factory
  createEnvelope,
  createEnvelopeFromRequest,

  // Validation
  validateEnvelope,
  isToolAllowed,
  checkCostBudget,

  // Middleware
  envelopeMiddleware,
  toolGateMiddleware,
  requireEnvelope,

  // Constants
  CANONICAL_PERSONAS,
  ENVELOPE_VERSION,
  DEFAULT_ESCALATION_RULES,
};
