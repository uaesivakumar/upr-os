/**
 * Evidence Factory (PRD v1.2 §5)
 *
 * Creates immutable evidence objects with:
 * - content_hash: SHA256 for integrity
 * - transform_log: DAG of transformations
 * - freshness_ttl: Time-to-live
 *
 * PRD §5.1: "Evidence is immutable after creation"
 */

import crypto from 'crypto';
import { EVIDENCE_TYPES, TRANSFORM_OPS, FRESHNESS_TTL, QUALITY_LEVELS } from './types.js';

/**
 * Calculate SHA256 hash of content
 * @param {Object} content - Content to hash
 * @returns {string} - SHA256 hex hash
 */
export function calculateContentHash(content) {
  const normalized = JSON.stringify(content, Object.keys(content).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Create a new evidence object
 *
 * @param {Object} params - Evidence parameters
 * @param {string} params.evidence_type - EVIDENCE_TYPES enum
 * @param {Object} params.content - The evidence content
 * @param {string} params.source - Data source (e.g., 'linkedin', 'apollo', 'siva')
 * @param {string} params.tenant_id - Tenant ID
 * @param {string} [params.entity_id] - Related entity ID
 * @param {string} [params.entity_type] - Type of entity ('company', 'contact', etc.)
 * @param {string} [params.quality_level] - QUALITY_LEVELS enum
 * @param {number} [params.freshness_ttl] - Custom TTL override
 * @param {TransformLogEntry[]} [params.input_evidence] - Input evidence for transformations
 * @returns {Object} - Immutable evidence object
 */
export function createEvidence(params) {
  const {
    evidence_type,
    content,
    source,
    tenant_id,
    entity_id = null,
    entity_type = null,
    quality_level = QUALITY_LEVELS.MEDIUM,
    freshness_ttl = null,
    input_evidence = [],
  } = params;

  // Validate evidence type
  if (!Object.values(EVIDENCE_TYPES).includes(evidence_type)) {
    throw new Error(`Invalid evidence_type: ${evidence_type}`);
  }

  // Generate IDs
  const evidence_id = crypto.randomUUID();
  const content_hash = calculateContentHash(content);

  // Calculate TTL
  const ttl = freshness_ttl || FRESHNESS_TTL[evidence_type] || FRESHNESS_TTL.DEFAULT;

  // Calculate expiration
  const created_at = new Date();
  const expires_at = new Date(created_at.getTime() + ttl * 1000);

  // Build initial transform log (ingestion)
  const transform_log = [
    {
      transform_id: crypto.randomUUID(),
      operation: TRANSFORM_OPS.INGEST_RAW,
      input_hashes: input_evidence.map(e => e.content_hash),
      output_hash: content_hash,
      metadata: {
        source,
        evidence_type,
        input_count: input_evidence.length,
      },
      tool_name: null,
      timestamp: created_at.toISOString(),
    },
  ];

  // Create immutable evidence object
  const evidence = Object.freeze({
    evidence_id,
    evidence_type,
    content_hash,
    content: Object.freeze(content),
    transform_log: Object.freeze(transform_log),
    freshness_ttl: ttl,
    quality_level,
    source,
    tenant_id,
    entity_id,
    entity_type,
    created_at: created_at.toISOString(),
    expires_at: expires_at.toISOString(),
  });

  return evidence;
}

/**
 * Create transformed evidence from existing evidence
 *
 * @param {Object} params - Transform parameters
 * @param {Object[]} params.input_evidence - Input evidence objects
 * @param {string} params.operation - TRANSFORM_OPS enum
 * @param {Object} params.output_content - Transformed content
 * @param {string} params.output_type - Output evidence type
 * @param {string} [params.tool_name] - SIVA tool that performed transform
 * @param {Object} [params.transform_metadata] - Additional transform metadata
 * @returns {Object} - New evidence object with full transform history
 */
export function createTransformedEvidence(params) {
  const {
    input_evidence,
    operation,
    output_content,
    output_type,
    tool_name = null,
    transform_metadata = {},
  } = params;

  // Validate operation
  if (!Object.values(TRANSFORM_OPS).includes(operation)) {
    throw new Error(`Invalid transform operation: ${operation}`);
  }

  // Validate input evidence
  if (!input_evidence || input_evidence.length === 0) {
    throw new Error('Transform requires at least one input evidence');
  }

  // Generate IDs
  const evidence_id = crypto.randomUUID();
  const content_hash = calculateContentHash(output_content);
  const transform_id = crypto.randomUUID();

  // Inherit tenant_id from first input
  const tenant_id = input_evidence[0].tenant_id;

  // Inherit entity info if all inputs share it
  const entity_ids = [...new Set(input_evidence.map(e => e.entity_id).filter(Boolean))];
  const entity_types = [...new Set(input_evidence.map(e => e.entity_type).filter(Boolean))];
  const entity_id = entity_ids.length === 1 ? entity_ids[0] : null;
  const entity_type = entity_types.length === 1 ? entity_types[0] : null;

  // Calculate quality level (minimum of inputs)
  const qualityOrder = [QUALITY_LEVELS.VERIFIED, QUALITY_LEVELS.HIGH, QUALITY_LEVELS.MEDIUM, QUALITY_LEVELS.LOW, QUALITY_LEVELS.STALE];
  const inputQualities = input_evidence.map(e => qualityOrder.indexOf(e.quality_level));
  const lowestQuality = Math.max(...inputQualities);
  const quality_level = qualityOrder[lowestQuality];

  // Build transform DAG (include all input transforms)
  const all_transforms = [];
  for (const input of input_evidence) {
    for (const t of input.transform_log) {
      // Avoid duplicates by transform_id
      if (!all_transforms.find(at => at.transform_id === t.transform_id)) {
        all_transforms.push(t);
      }
    }
  }

  // Add new transform
  const created_at = new Date();
  all_transforms.push({
    transform_id,
    operation,
    input_hashes: input_evidence.map(e => e.content_hash),
    output_hash: content_hash,
    metadata: {
      ...transform_metadata,
      input_count: input_evidence.length,
    },
    tool_name,
    timestamp: created_at.toISOString(),
  });

  // Calculate TTL for output type
  const ttl = FRESHNESS_TTL[output_type] || FRESHNESS_TTL.DEFAULT;
  const expires_at = new Date(created_at.getTime() + ttl * 1000);

  // Create immutable evidence
  const evidence = Object.freeze({
    evidence_id,
    evidence_type: output_type,
    content_hash,
    content: Object.freeze(output_content),
    transform_log: Object.freeze(all_transforms),
    freshness_ttl: ttl,
    quality_level,
    source: tool_name || 'transform',
    tenant_id,
    entity_id,
    entity_type,
    created_at: created_at.toISOString(),
    expires_at: expires_at.toISOString(),
  });

  return evidence;
}

/**
 * Create evidence from SIVA tool output
 *
 * @param {Object} params - Parameters
 * @param {string} params.tool_name - SIVA tool name
 * @param {Object} params.input - Tool input
 * @param {Object} params.output - Tool output
 * @param {Object[]} [params.input_evidence] - Input evidence used
 * @param {string} params.tenant_id - Tenant ID
 * @param {string} [params.entity_id] - Related entity ID
 * @returns {Object} - Evidence object
 */
export function createSIVAEvidence(params) {
  const {
    tool_name,
    input,
    output,
    input_evidence = [],
    tenant_id,
    entity_id = null,
  } = params;

  // Map tool to operation and output type
  const toolMapping = {
    CompanyQualityTool: { op: TRANSFORM_OPS.SIVA_QUALITY_SCORE, type: EVIDENCE_TYPES.SIVA_SCORE },
    TimingScoreTool: { op: TRANSFORM_OPS.SIVA_TIMING_SCORE, type: EVIDENCE_TYPES.SIVA_SCORE },
    ContactTierTool: { op: TRANSFORM_OPS.SIVA_CONTACT_TIER, type: EVIDENCE_TYPES.SIVA_SCORE },
    BankingProductMatchTool: { op: TRANSFORM_OPS.SIVA_PRODUCT_MATCH, type: EVIDENCE_TYPES.SIVA_SCORE },
    CompositeScoreTool: { op: TRANSFORM_OPS.SIVA_COMPOSITE, type: EVIDENCE_TYPES.COMPOSITE_SCORE },
  };

  const mapping = toolMapping[tool_name] || {
    op: TRANSFORM_OPS.SIVA_QUALITY_SCORE,
    type: EVIDENCE_TYPES.SIVA_DECISION,
  };

  if (input_evidence.length > 0) {
    return createTransformedEvidence({
      input_evidence,
      operation: mapping.op,
      output_content: {
        tool_name,
        input,
        output,
        timestamp: new Date().toISOString(),
      },
      output_type: mapping.type,
      tool_name,
      transform_metadata: {
        score: output.score || output.qualityScore || null,
        confidence: output.confidence || null,
        tier: output.tier || output.quality_tier || null,
      },
    });
  }

  // No input evidence - create fresh
  return createEvidence({
    evidence_type: mapping.type,
    content: {
      tool_name,
      input,
      output,
      timestamp: new Date().toISOString(),
    },
    source: tool_name,
    tenant_id,
    entity_id,
    entity_type: 'siva_decision',
    quality_level: QUALITY_LEVELS.HIGH,
  });
}

export default {
  calculateContentHash,
  createEvidence,
  createTransformedEvidence,
  createSIVAEvidence,
};
