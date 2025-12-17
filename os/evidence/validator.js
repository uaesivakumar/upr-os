/**
 * Evidence Validator (PRD v1.2 §5)
 *
 * Validates evidence integrity and freshness:
 * - Hash verification (content_hash matches content)
 * - Freshness check (not past TTL)
 * - Transform DAG validation
 *
 * PRD §5.2: "content_hash ensures integrity"
 * PRD §5.4: "Stale evidence flagged for refresh"
 */

import { calculateContentHash } from './factory.js';
import { EVIDENCE_TYPES, QUALITY_LEVELS } from './types.js';

/**
 * Required fields for evidence objects
 */
export const REQUIRED_FIELDS = [
  'evidence_id',
  'evidence_type',
  'content_hash',
  'content',
  'transform_log',
  'freshness_ttl',
  'quality_level',
  'source',
  'tenant_id',
  'created_at',
  'expires_at',
];

/**
 * Validate evidence schema
 *
 * @param {Object} evidence - Evidence object to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateSchema(evidence) {
  const errors = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (evidence[field] === undefined || evidence[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate evidence_type
  if (evidence.evidence_type && !Object.values(EVIDENCE_TYPES).includes(evidence.evidence_type)) {
    errors.push(`Invalid evidence_type: ${evidence.evidence_type}`);
  }

  // Validate quality_level
  if (evidence.quality_level && !Object.values(QUALITY_LEVELS).includes(evidence.quality_level)) {
    errors.push(`Invalid quality_level: ${evidence.quality_level}`);
  }

  // Validate transform_log is array
  if (evidence.transform_log && !Array.isArray(evidence.transform_log)) {
    errors.push('transform_log must be an array');
  }

  // Validate transform_log entries
  if (Array.isArray(evidence.transform_log)) {
    for (let i = 0; i < evidence.transform_log.length; i++) {
      const entry = evidence.transform_log[i];
      if (!entry.transform_id) errors.push(`transform_log[${i}]: missing transform_id`);
      if (!entry.operation) errors.push(`transform_log[${i}]: missing operation`);
      if (!entry.output_hash) errors.push(`transform_log[${i}]: missing output_hash`);
      if (!entry.timestamp) errors.push(`transform_log[${i}]: missing timestamp`);
    }
  }

  // Validate TTL is positive number
  if (typeof evidence.freshness_ttl !== 'number' || evidence.freshness_ttl <= 0) {
    errors.push('freshness_ttl must be a positive number');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Verify content hash matches content
 *
 * @param {Object} evidence - Evidence object
 * @returns {Object} - { valid: boolean, expected_hash: string, actual_hash: string }
 */
export function verifyContentHash(evidence) {
  const actual_hash = calculateContentHash(evidence.content);
  const valid = evidence.content_hash === actual_hash;

  return {
    valid,
    expected_hash: evidence.content_hash,
    actual_hash,
    message: valid ? 'Hash verified' : 'Hash mismatch - evidence may be tampered',
  };
}

/**
 * Check if evidence is fresh (not past TTL)
 *
 * @param {Object} evidence - Evidence object
 * @returns {Object} - { fresh: boolean, expires_at: string, seconds_remaining: number }
 */
export function checkFreshness(evidence) {
  const now = new Date();
  const expires_at = new Date(evidence.expires_at);
  const seconds_remaining = Math.floor((expires_at - now) / 1000);

  return {
    fresh: seconds_remaining > 0,
    expires_at: evidence.expires_at,
    seconds_remaining: Math.max(0, seconds_remaining),
    staleness_percentage: seconds_remaining > 0
      ? Math.round((1 - seconds_remaining / evidence.freshness_ttl) * 100)
      : 100,
    message: seconds_remaining > 0
      ? `Fresh for ${seconds_remaining} more seconds`
      : `Stale by ${Math.abs(seconds_remaining)} seconds`,
  };
}

/**
 * Validate transform DAG integrity
 * Checks that all referenced input_hashes exist in previous transforms
 *
 * @param {Object} evidence - Evidence object
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export function validateTransformDAG(evidence) {
  const errors = [];
  const transform_log = evidence.transform_log || [];

  // Build set of available hashes (output_hash from each transform becomes available)
  const available_hashes = new Set();

  for (let i = 0; i < transform_log.length; i++) {
    const entry = transform_log[i];

    // First entry can have empty input_hashes (raw ingestion)
    if (i > 0 && entry.input_hashes) {
      for (const input_hash of entry.input_hashes) {
        if (!available_hashes.has(input_hash)) {
          errors.push(`Transform ${i} references unknown input_hash: ${input_hash.slice(0, 16)}...`);
        }
      }
    }

    // Add this transform's output to available hashes
    available_hashes.add(entry.output_hash);
  }

  // Final output_hash should match evidence content_hash
  if (transform_log.length > 0) {
    const final_hash = transform_log[transform_log.length - 1].output_hash;
    if (final_hash !== evidence.content_hash) {
      errors.push(`Final transform output_hash doesn't match evidence content_hash`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    dag_depth: transform_log.length,
  };
}

/**
 * Full evidence validation
 *
 * @param {Object} evidence - Evidence object
 * @returns {Object} - Complete validation result
 */
export function validateEvidence(evidence) {
  const schemaResult = validateSchema(evidence);
  const hashResult = verifyContentHash(evidence);
  const freshnessResult = checkFreshness(evidence);
  const dagResult = validateTransformDAG(evidence);

  const all_errors = [
    ...schemaResult.errors,
    ...(hashResult.valid ? [] : [hashResult.message]),
    ...dagResult.errors,
  ];

  const valid = schemaResult.valid && hashResult.valid && dagResult.valid;

  // Determine effective quality level
  let effective_quality = evidence.quality_level;
  if (!freshnessResult.fresh) {
    effective_quality = QUALITY_LEVELS.STALE;
  }
  if (!hashResult.valid) {
    effective_quality = QUALITY_LEVELS.LOW; // Tampered evidence is unreliable
  }

  return {
    valid,
    fresh: freshnessResult.fresh,
    hash_verified: hashResult.valid,
    dag_valid: dagResult.valid,
    effective_quality,
    schema: schemaResult,
    hash: hashResult,
    freshness: freshnessResult,
    dag: dagResult,
    errors: all_errors,
  };
}

/**
 * Check if evidence can be used for SIVA processing
 *
 * @param {Object} evidence - Evidence object
 * @param {Object} options - Options
 * @param {boolean} [options.require_fresh=true] - Require fresh evidence
 * @param {string[]} [options.allowed_types] - Allowed evidence types
 * @returns {Object} - { usable: boolean, reason: string }
 */
export function isUsableForSIVA(evidence, options = {}) {
  const { require_fresh = true, allowed_types = null } = options;

  const validation = validateEvidence(evidence);

  // Must be structurally valid and hash-verified
  if (!validation.valid) {
    return {
      usable: false,
      reason: `Invalid evidence: ${validation.errors.join(', ')}`,
    };
  }

  // Check freshness if required
  if (require_fresh && !validation.fresh) {
    return {
      usable: false,
      reason: `Evidence is stale: ${validation.freshness.message}`,
    };
  }

  // Check allowed types
  if (allowed_types && !allowed_types.includes(evidence.evidence_type)) {
    return {
      usable: false,
      reason: `Evidence type ${evidence.evidence_type} not in allowed types`,
    };
  }

  return {
    usable: true,
    reason: 'Evidence is valid and usable',
    effective_quality: validation.effective_quality,
  };
}

export default {
  REQUIRED_FIELDS,
  validateSchema,
  verifyContentHash,
  checkFreshness,
  validateTransformDAG,
  validateEvidence,
  isUsableForSIVA,
};
