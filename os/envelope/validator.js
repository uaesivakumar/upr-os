/**
 * Sealed Context Envelope Validator (PRD v1.2 §2.3)
 *
 * Enforcement Rules:
 * - UPR-OS validates schema + hash before SIVA call
 * - Missing or malformed envelope → 403 reject
 * - Envelope is immutable for that interaction
 * - Envelope hash is stored with audit logs
 */

import crypto from 'crypto';
import { ENVELOPE_VERSION, CANONICAL_PERSONAS } from './types.js';

/**
 * Required envelope fields per PRD §2.2
 */
export const REQUIRED_FIELDS = [
  'envelope_version',
  'tenant_id',
  'user_id',
  'persona_id',
  'vertical',
  'sub_vertical',
  'region',
  'allowed_intents',
  'forbidden_outputs',
  'allowed_tools',
  'evidence_scope',
  'memory_scope',
  'cost_budget',
  'latency_budget',
  'escalation_rules',
  'disclaimer_rules',
  'timestamp',
  'sha256_hash',
];

/**
 * Validate envelope schema
 * @param {Object} envelope - The envelope to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSchema(envelope) {
  const errors = [];

  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, errors: ['Envelope must be an object'] };
  }

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (envelope[field] === undefined || envelope[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate envelope version
  if (envelope.envelope_version && envelope.envelope_version !== ENVELOPE_VERSION) {
    errors.push(`Invalid envelope_version: ${envelope.envelope_version}. Expected: ${ENVELOPE_VERSION}`);
  }

  // Validate persona_id is canonical
  const validPersonaIds = Object.values(CANONICAL_PERSONAS);
  if (envelope.persona_id && !validPersonaIds.includes(envelope.persona_id)) {
    errors.push(`Invalid persona_id: ${envelope.persona_id}. Must be one of: ${validPersonaIds.join(', ')}`);
  }

  // Validate arrays
  if (envelope.allowed_intents && !Array.isArray(envelope.allowed_intents)) {
    errors.push('allowed_intents must be an array');
  }
  if (envelope.forbidden_outputs && !Array.isArray(envelope.forbidden_outputs)) {
    errors.push('forbidden_outputs must be an array');
  }
  if (envelope.allowed_tools && !Array.isArray(envelope.allowed_tools)) {
    errors.push('allowed_tools must be an array');
  }

  // Validate nested objects
  if (envelope.evidence_scope && typeof envelope.evidence_scope !== 'object') {
    errors.push('evidence_scope must be an object');
  }
  if (envelope.memory_scope && typeof envelope.memory_scope !== 'object') {
    errors.push('memory_scope must be an object');
  }
  if (envelope.cost_budget && typeof envelope.cost_budget !== 'object') {
    errors.push('cost_budget must be an object');
  }
  if (envelope.latency_budget && typeof envelope.latency_budget !== 'object') {
    errors.push('latency_budget must be an object');
  }
  if (envelope.escalation_rules && typeof envelope.escalation_rules !== 'object') {
    errors.push('escalation_rules must be an object');
  }

  // Validate escalation thresholds per PRD §5.1
  if (envelope.escalation_rules) {
    const { disclaimer_threshold, escalation_threshold, block_threshold } = envelope.escalation_rules;
    if (disclaimer_threshold !== undefined && (disclaimer_threshold < 0 || disclaimer_threshold > 1)) {
      errors.push('disclaimer_threshold must be between 0 and 1');
    }
    if (escalation_threshold !== undefined && (escalation_threshold < 0 || escalation_threshold > 1)) {
      errors.push('escalation_threshold must be between 0 and 1');
    }
    if (block_threshold !== undefined && (block_threshold < 0 || block_threshold > 1)) {
      errors.push('block_threshold must be between 0 and 1');
    }
  }

  // Validate timestamp
  if (envelope.timestamp) {
    const ts = new Date(envelope.timestamp);
    if (isNaN(ts.getTime())) {
      errors.push('Invalid timestamp format');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate envelope hash integrity
 * @param {Object} envelope - The envelope to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateHash(envelope) {
  if (!envelope || !envelope.sha256_hash) {
    return { valid: false, error: 'Missing sha256_hash' };
  }

  // Create copy without hash for verification
  const { sha256_hash, ...envelopeWithoutHash } = envelope;

  // Recalculate hash
  const hashContent = JSON.stringify(envelopeWithoutHash);
  const expectedHash = crypto.createHash('sha256').update(hashContent).digest('hex');

  if (sha256_hash !== expectedHash) {
    return {
      valid: false,
      error: 'Hash mismatch - envelope may have been tampered with',
    };
  }

  return { valid: true };
}

/**
 * Full envelope validation (schema + hash)
 * @param {Object} envelope - The envelope to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEnvelope(envelope) {
  const errors = [];

  // Schema validation
  const schemaResult = validateSchema(envelope);
  if (!schemaResult.valid) {
    errors.push(...schemaResult.errors);
  }

  // Hash validation (only if schema is mostly valid)
  if (envelope && envelope.sha256_hash) {
    const hashResult = validateHash(envelope);
    if (!hashResult.valid) {
      errors.push(hashResult.error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate intent is allowed by envelope
 * @param {Object} envelope - The sealed envelope
 * @param {string} intent - The intent to check
 * @returns {boolean}
 */
export function isIntentAllowed(envelope, intent) {
  if (!envelope || !envelope.allowed_intents) {
    return false;
  }
  return envelope.allowed_intents.includes(intent);
}

/**
 * Validate output is not forbidden by envelope
 * @param {Object} envelope - The sealed envelope
 * @param {string} outputType - The output type to check
 * @returns {boolean}
 */
export function isOutputAllowed(envelope, outputType) {
  if (!envelope || !envelope.forbidden_outputs) {
    return true; // No restrictions
  }
  return !envelope.forbidden_outputs.includes(outputType);
}

/**
 * Validate tool is allowed by envelope
 * @param {Object} envelope - The sealed envelope
 * @param {string} toolName - The tool name to check
 * @returns {boolean}
 */
export function isToolAllowed(envelope, toolName) {
  if (!envelope || !envelope.allowed_tools) {
    return false;
  }
  return envelope.allowed_tools.includes(toolName);
}

/**
 * Check if request exceeds cost budget
 * @param {Object} envelope - The sealed envelope
 * @param {number} estimatedTokens - Estimated tokens for request
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function checkCostBudget(envelope, estimatedTokens) {
  if (!envelope || !envelope.cost_budget) {
    return { allowed: false, reason: 'No cost budget defined' };
  }

  const { max_tokens } = envelope.cost_budget;
  if (estimatedTokens > max_tokens) {
    return {
      allowed: false,
      reason: `Estimated tokens (${estimatedTokens}) exceeds budget (${max_tokens})`,
    };
  }

  return { allowed: true };
}

export default {
  validateSchema,
  validateHash,
  validateEnvelope,
  isIntentAllowed,
  isOutputAllowed,
  isToolAllowed,
  checkCostBudget,
  REQUIRED_FIELDS,
};
