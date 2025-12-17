/**
 * Evidence System Module (PRD v1.2 §5)
 *
 * Provides evidence management for SIVA:
 * - Types and constants (evidence types, transform ops, TTL)
 * - Factory (create evidence with content_hash)
 * - Validator (verify integrity, freshness, DAG)
 *
 * Key PRD Requirements:
 * - §5.1: Evidence is immutable after creation
 * - §5.2: Every evidence blob has content_hash (SHA256)
 * - §5.3: Transformations recorded in DAG (transform_log)
 * - §5.4: Evidence freshness degrades over time (freshness_ttl)
 */

// Types and constants
export {
  EVIDENCE_TYPES,
  TRANSFORM_OPS,
  FRESHNESS_TTL,
  QUALITY_LEVELS,
} from './types.js';

// Factory
export {
  calculateContentHash,
  createEvidence,
  createTransformedEvidence,
  createSIVAEvidence,
} from './factory.js';

// Validator
export {
  REQUIRED_FIELDS,
  validateSchema,
  verifyContentHash,
  checkFreshness,
  validateTransformDAG,
  validateEvidence,
  isUsableForSIVA,
} from './validator.js';

// Default export
import { EVIDENCE_TYPES, TRANSFORM_OPS, FRESHNESS_TTL, QUALITY_LEVELS } from './types.js';
import {
  calculateContentHash,
  createEvidence,
  createTransformedEvidence,
  createSIVAEvidence,
} from './factory.js';
import {
  validateSchema,
  verifyContentHash,
  checkFreshness,
  validateTransformDAG,
  validateEvidence,
  isUsableForSIVA,
} from './validator.js';

export default {
  // Types
  EVIDENCE_TYPES,
  TRANSFORM_OPS,
  FRESHNESS_TTL,
  QUALITY_LEVELS,

  // Factory
  calculateContentHash,
  createEvidence,
  createTransformedEvidence,
  createSIVAEvidence,

  // Validator
  validateSchema,
  verifyContentHash,
  checkFreshness,
  validateTransformDAG,
  validateEvidence,
  isUsableForSIVA,
};
