/**
 * Evidence Engine Service
 * Sprint 65: Evidence System v2
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CRITICAL ARCHITECTURAL RULES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1. NO TENANT AWARENESS
 *    ─────────────────────────────────────────────────
 *    - Context passed via API params (vertical_slug, territory_id)
 *    - No tenantId references anywhere
 *    - This is PURE engine logic
 *
 * 2. ALL SCORING VIA CONFIG
 *    ─────────────────────────────────────────────────
 *    - Provider weights from provider_weights table
 *    - Vertical-specific overrides supported
 *    - Deterministic: same config + input = same output
 *
 * 3. PROVENANCE TRACKING
 *    ─────────────────────────────────────────────────
 *    - Every evidence item has full audit trail
 *    - Raw source data preserved
 *    - Transformation logs maintained
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

import { getDb } from '../db/index.js';
import { ConfigLoader } from './configLoader.js';

// ============================================================================
// EVIDENCE ITEMS - Core CRUD Operations
// ============================================================================

/**
 * Add evidence for an object
 *
 * @param {Object} params - Evidence parameters
 * @param {string} params.objectId - Object this evidence relates to
 * @param {string} params.sourceProvider - Provider name (clearbit, apollo, etc.)
 * @param {string} params.evidenceType - Type of evidence (firmographic, contact, etc.)
 * @param {Object} params.payload - Evidence data
 * @param {Object} params.metadata - Additional metadata
 */
export async function addEvidence({
  objectId,
  sourceProvider,
  evidenceType,
  payload,
  metadata = {}
}) {
  const db = getDb();

  const {
    rawSource,
    fetchMetadata,
    sourceTimestamp,
    verticalSlug,
    territoryId,
    rawConfidence
  } = metadata;

  // Get provider weight for confidence calculation
  const providerWeight = await getProviderWeight(sourceProvider, evidenceType, verticalSlug);

  // Calculate initial confidence
  const baseConfidence = rawConfidence || 0.7;
  const confidence = calculateInitialConfidence(baseConfidence, providerWeight);

  // Insert evidence item
  const [evidence] = await db('evidence_items')
    .insert({
      object_id: objectId,
      source_provider: sourceProvider,
      evidence_type: evidenceType,
      payload,
      confidence,
      raw_confidence: rawConfidence,
      vertical_slug: verticalSlug,
      territory_id: territoryId,
      source_timestamp: sourceTimestamp
    })
    .returning('*');

  // Create freshness record
  const now = new Date();
  await db('evidence_freshness')
    .insert({
      evidence_id: evidence.id,
      first_seen_at: sourceTimestamp || now,
      last_seen_at: now,
      decay_score: 1.0
    })
    .onConflict('evidence_id')
    .merge({
      last_seen_at: now,
      update_count: db.raw('evidence_freshness.update_count + 1')
    });

  // Create provenance record if raw data provided
  if (rawSource || fetchMetadata) {
    await db('evidence_provenance')
      .insert({
        evidence_id: evidence.id,
        raw_source: rawSource || {},
        fetch_metadata: fetchMetadata || {}
      })
      .onConflict('evidence_id')
      .ignore();
  }

  return transformEvidence(evidence);
}

/**
 * Get evidence by ID
 */
export async function getEvidence(evidenceId) {
  const db = getDb();

  const evidence = await db('evidence_items')
    .where({ id: evidenceId })
    .first();

  if (!evidence) return null;
  return transformEvidence(evidence);
}

/**
 * Get evidence details including freshness and provenance
 */
export async function getEvidenceDetails(evidenceId) {
  const db = getDb();

  const evidence = await db('evidence_items')
    .where({ id: evidenceId })
    .first();

  if (!evidence) return null;

  const [freshness, provenance] = await Promise.all([
    db('evidence_freshness').where({ evidence_id: evidenceId }).first(),
    db('evidence_provenance').where({ evidence_id: evidenceId }).first()
  ]);

  return {
    ...transformEvidence(evidence),
    freshness: freshness ? transformFreshness(freshness) : null,
    provenance: provenance ? transformProvenance(provenance) : null
  };
}

/**
 * List evidence for an object
 */
export async function listEvidence(objectId, filters = {}, options = {}) {
  const db = getDb();
  const {
    providers,
    evidenceTypes,
    minConfidence,
    isVerified,
    includeStale = true
  } = filters;
  const { limit = 50, offset = 0, orderBy = 'collected_at', order = 'desc' } = options;

  let query = db('evidence_items as e')
    .leftJoin('evidence_freshness as f', 'e.id', 'f.evidence_id')
    .where('e.object_id', objectId);

  if (providers && providers.length > 0) {
    query = query.whereIn('e.source_provider', providers);
  }

  if (evidenceTypes && evidenceTypes.length > 0) {
    query = query.whereIn('e.evidence_type', evidenceTypes);
  }

  if (minConfidence !== undefined) {
    query = query.where('e.confidence', '>=', minConfidence);
  }

  if (isVerified !== undefined) {
    query = query.where('e.is_verified', isVerified);
  }

  if (!includeStale) {
    query = query.where(function () {
      this.where('f.is_stale', false).orWhereNull('f.is_stale');
    });
  }

  const countQuery = query.clone().count('e.id as count').first();
  const [{ count }] = await Promise.all([countQuery]).then(([c]) => [c]);

  const evidence = await query
    .select('e.*', 'f.decay_score', 'f.is_stale', 'f.last_seen_at')
    .orderBy(`e.${orderBy}`, order)
    .limit(limit)
    .offset(offset);

  return {
    evidence: evidence.map(e => ({
      ...transformEvidence(e),
      decayScore: e.decay_score ? parseFloat(e.decay_score) : 1.0,
      isStale: e.is_stale || false,
      lastSeenAt: e.last_seen_at
    })),
    total: parseInt(count, 10),
    limit,
    offset
  };
}

/**
 * Update evidence item
 */
export async function updateEvidence(evidenceId, updates) {
  const db = getDb();

  const allowedUpdates = ['payload', 'confidence', 'is_verified', 'verification_source'];
  const sanitizedUpdates = Object.fromEntries(
    Object.entries(updates)
      .filter(([key]) => allowedUpdates.includes(key))
      .map(([key, value]) => [key, value])
  );

  if (Object.keys(sanitizedUpdates).length === 0) {
    return getEvidence(evidenceId);
  }

  sanitizedUpdates.updated_at = new Date();

  const [updated] = await db('evidence_items')
    .where({ id: evidenceId })
    .update(sanitizedUpdates)
    .returning('*');

  // Update freshness last_seen_at
  await db('evidence_freshness')
    .where({ evidence_id: evidenceId })
    .update({
      last_seen_at: new Date(),
      update_count: db.raw('update_count + 1')
    });

  return updated ? transformEvidence(updated) : null;
}

/**
 * Delete evidence item
 */
export async function deleteEvidence(evidenceId) {
  const db = getDb();

  const deleted = await db('evidence_items')
    .where({ id: evidenceId })
    .delete();

  return { deleted: deleted > 0 };
}

// ============================================================================
// EVIDENCE AGGREGATION
// ============================================================================

/**
 * Aggregate evidence for an object
 *
 * @param {string} objectId - Object ID
 * @param {Object} options - Aggregation options
 */
export async function aggregateEvidence(objectId, options = {}) {
  const db = getDb();
  const { groupBy = 'all', includeDetails = false, verticalSlug } = options;

  // Get all evidence with freshness
  const evidence = await db('v_evidence_with_freshness')
    .where({ object_id: objectId });

  if (evidence.length === 0) {
    return {
      objectId,
      totalEvidence: 0,
      aggregations: {},
      computedAt: new Date().toISOString()
    };
  }

  const aggregations = {};

  // By provider aggregation
  if (groupBy === 'all' || groupBy === 'provider') {
    aggregations.byProvider = await aggregateByProvider(evidence, verticalSlug);
  }

  // By type aggregation
  if (groupBy === 'all' || groupBy === 'type') {
    aggregations.byType = aggregateByField(evidence, 'evidence_type');
  }

  // Overall aggregation
  if (groupBy === 'all' || groupBy === 'overall') {
    aggregations.overall = computeOverallAggregation(evidence);
  }

  // Time-based aggregation
  if (groupBy === 'all' || groupBy === 'time') {
    aggregations.byTime = aggregateByTime(evidence);
  }

  return {
    objectId,
    totalEvidence: evidence.length,
    aggregations,
    details: includeDetails ? evidence.map(transformEvidence) : undefined,
    computedAt: new Date().toISOString()
  };
}

/**
 * Aggregate by provider with weights
 */
async function aggregateByProvider(evidence, verticalSlug) {
  const byProvider = {};

  for (const e of evidence) {
    const provider = e.source_provider;
    if (!byProvider[provider]) {
      const weight = await getProviderWeight(provider, e.evidence_type, verticalSlug);
      byProvider[provider] = {
        count: 0,
        totalConfidence: 0,
        totalFreshness: 0,
        weight: weight.baseWeight,
        evidenceTypes: new Set()
      };
    }

    byProvider[provider].count++;
    byProvider[provider].totalConfidence += parseFloat(e.confidence);
    byProvider[provider].totalFreshness += parseFloat(e.freshness_score || 1.0);
    byProvider[provider].evidenceTypes.add(e.evidence_type);
  }

  // Compute averages and weighted scores
  const result = {};
  for (const [provider, data] of Object.entries(byProvider)) {
    const avgConfidence = data.totalConfidence / data.count;
    const avgFreshness = data.totalFreshness / data.count;

    result[provider] = {
      count: data.count,
      avgConfidence: Math.round(avgConfidence * 1000) / 1000,
      avgFreshness: Math.round(avgFreshness * 1000) / 1000,
      weight: data.weight,
      weightedScore: Math.round(avgConfidence * avgFreshness * data.weight * 1000) / 1000,
      evidenceTypes: Array.from(data.evidenceTypes)
    };
  }

  return result;
}

/**
 * Aggregate by generic field
 */
function aggregateByField(evidence, field) {
  const groups = {};

  for (const e of evidence) {
    const key = e[field];
    if (!groups[key]) {
      groups[key] = {
        count: 0,
        totalConfidence: 0,
        totalFreshness: 0,
        providers: new Set()
      };
    }

    groups[key].count++;
    groups[key].totalConfidence += parseFloat(e.confidence);
    groups[key].totalFreshness += parseFloat(e.freshness_score || 1.0);
    groups[key].providers.add(e.source_provider);
  }

  const result = {};
  for (const [key, data] of Object.entries(groups)) {
    result[key] = {
      count: data.count,
      avgConfidence: Math.round((data.totalConfidence / data.count) * 1000) / 1000,
      avgFreshness: Math.round((data.totalFreshness / data.count) * 1000) / 1000,
      providers: Array.from(data.providers)
    };
  }

  return result;
}

/**
 * Compute overall aggregation
 */
function computeOverallAggregation(evidence) {
  if (evidence.length === 0) {
    return {
      count: 0,
      avgConfidence: 0,
      avgFreshness: 0,
      score: 0
    };
  }

  const totalConfidence = evidence.reduce((sum, e) => sum + parseFloat(e.confidence), 0);
  const totalFreshness = evidence.reduce((sum, e) => sum + parseFloat(e.freshness_score || 1.0), 0);
  const avgConfidence = totalConfidence / evidence.length;
  const avgFreshness = totalFreshness / evidence.length;

  return {
    count: evidence.length,
    avgConfidence: Math.round(avgConfidence * 1000) / 1000,
    avgFreshness: Math.round(avgFreshness * 1000) / 1000,
    effectiveScore: Math.round(avgConfidence * avgFreshness * 1000) / 1000,
    providers: [...new Set(evidence.map(e => e.source_provider))],
    evidenceTypes: [...new Set(evidence.map(e => e.evidence_type))],
    verifiedCount: evidence.filter(e => e.is_verified).length,
    staleCount: evidence.filter(e => e.is_stale).length
  };
}

/**
 * Aggregate by time periods
 */
function aggregateByTime(evidence) {
  const now = new Date();
  const periods = {
    last24h: { start: new Date(now - 24 * 60 * 60 * 1000), count: 0 },
    last7d: { start: new Date(now - 7 * 24 * 60 * 60 * 1000), count: 0 },
    last30d: { start: new Date(now - 30 * 24 * 60 * 60 * 1000), count: 0 },
    last90d: { start: new Date(now - 90 * 24 * 60 * 60 * 1000), count: 0 },
    older: { count: 0 }
  };

  for (const e of evidence) {
    const collectedAt = new Date(e.collected_at);

    if (collectedAt >= periods.last24h.start) {
      periods.last24h.count++;
    } else if (collectedAt >= periods.last7d.start) {
      periods.last7d.count++;
    } else if (collectedAt >= periods.last30d.start) {
      periods.last30d.count++;
    } else if (collectedAt >= periods.last90d.start) {
      periods.last90d.count++;
    } else {
      periods.older.count++;
    }
  }

  return {
    last24h: periods.last24h.count,
    last7d: periods.last7d.count,
    last30d: periods.last30d.count,
    last90d: periods.last90d.count,
    older: periods.older.count
  };
}

// ============================================================================
// EVIDENCE SCORING
// ============================================================================

/**
 * Compute weighted evidence score for an object
 *
 * @param {string} objectId - Object ID
 * @param {Object} context - Context for scoring
 */
export async function computeEvidenceScore(objectId, context = {}) {
  const db = getDb();
  const { verticalSlug } = context;

  // Use SQL function for efficient computation
  const result = await db.raw(`
    SELECT * FROM compute_evidence_score(?::uuid, ?::varchar)
  `, [objectId, verticalSlug || null]);

  if (!result.rows || result.rows.length === 0) {
    return {
      objectId,
      score: 0,
      breakdown: { byProvider: {}, byType: {} },
      freshnessFactor: 1.0,
      evidenceCount: 0,
      warnings: ['No evidence found'],
      computedAt: new Date().toISOString()
    };
  }

  const row = result.rows[0];

  // Check for conflicts
  const conflicts = await db('evidence_conflicts')
    .where({ object_id: objectId, resolution_status: 'unresolved' })
    .count('id as count')
    .first();

  const warnings = [];
  if (parseInt(conflicts.count, 10) > 0) {
    warnings.push(`${conflicts.count} unresolved evidence conflicts`);
  }

  // Check for stale evidence
  const staleCount = await db('evidence_items as e')
    .join('evidence_freshness as f', 'e.id', 'f.evidence_id')
    .where({ 'e.object_id': objectId, 'f.is_stale': true })
    .count('e.id as count')
    .first();

  if (parseInt(staleCount.count, 10) > 0) {
    warnings.push(`${staleCount.count} stale evidence items`);
  }

  return {
    objectId,
    score: Math.round(parseFloat(row.total_score) * 1000) / 1000,
    breakdown: {
      byProvider: row.provider_breakdown,
      byType: row.type_breakdown
    },
    freshnessFactor: Math.round(parseFloat(row.freshness_factor) * 1000) / 1000,
    evidenceCount: parseInt(row.evidence_count, 10),
    warnings,
    computedAt: new Date().toISOString()
  };
}

// ============================================================================
// FRESHNESS MANAGEMENT
// ============================================================================

/**
 * Refresh evidence freshness scores for an object
 */
export async function refreshEvidenceFreshness(objectId) {
  const db = getDb();

  const result = await db.raw(`
    SELECT refresh_object_evidence_freshness(?::uuid) as updated_count
  `, [objectId]);

  return {
    objectId,
    updatedCount: result.rows[0]?.updated_count || 0,
    refreshedAt: new Date().toISOString()
  };
}

/**
 * Decay freshness scores for all evidence (batch operation)
 *
 * @param {Object} options - Decay options
 */
export async function decayAllFreshness(options = {}) {
  const db = getDb();
  const { batchSize = 1000, maxUpdates = 10000 } = options;

  let totalUpdated = 0;
  let hasMore = true;

  while (hasMore && totalUpdated < maxUpdates) {
    const updated = await db('evidence_freshness')
      .update({
        decay_score: db.raw('calculate_decay_score(last_seen_at, half_life_days)'),
        is_stale: db.raw('calculate_decay_score(last_seen_at, half_life_days) < stale_threshold'),
        last_updated_at: new Date()
      })
      .whereRaw(`id IN (
        SELECT id FROM evidence_freshness
        WHERE last_updated_at < NOW() - INTERVAL '1 hour'
        LIMIT ?
      )`, [batchSize]);

    totalUpdated += updated;
    hasMore = updated === batchSize;
  }

  return {
    totalUpdated,
    completedAt: new Date().toISOString()
  };
}

/**
 * Get stale evidence for an object
 */
export async function getStaleEvidence(objectId, options = {}) {
  const db = getDb();
  const { limit = 50 } = options;

  const evidence = await db('evidence_items as e')
    .join('evidence_freshness as f', 'e.id', 'f.evidence_id')
    .where({ 'e.object_id': objectId, 'f.is_stale': true })
    .select('e.*', 'f.decay_score', 'f.last_seen_at', 'f.first_seen_at')
    .orderBy('f.decay_score', 'asc')
    .limit(limit);

  return evidence.map(e => ({
    ...transformEvidence(e),
    decayScore: parseFloat(e.decay_score),
    lastSeenAt: e.last_seen_at,
    firstSeenAt: e.first_seen_at
  }));
}

// ============================================================================
// DEDUPLICATION
// ============================================================================

/**
 * Find and deduplicate similar evidence for an object
 *
 * @param {string} objectId - Object ID
 * @param {Object} options - Deduplication options
 */
export async function deduplicateEvidence(objectId, options = {}) {
  const db = getDb();
  const { dryRun = true, mergeStrategy = 'latest' } = options;

  // Find potential duplicates (same provider + same evidence type + similar payload)
  const evidence = await db('evidence_items')
    .where({ object_id: objectId })
    .orderBy('collected_at', 'desc');

  const duplicateGroups = findDuplicateGroups(evidence);
  const mergeActions = [];

  for (const group of duplicateGroups) {
    if (group.length < 2) continue;

    // Determine which to keep based on strategy
    let toKeep;
    let toMerge;

    if (mergeStrategy === 'latest') {
      toKeep = group[0]; // Already sorted by collected_at desc
      toMerge = group.slice(1);
    } else if (mergeStrategy === 'highest_confidence') {
      group.sort((a, b) => parseFloat(b.confidence) - parseFloat(a.confidence));
      toKeep = group[0];
      toMerge = group.slice(1);
    } else {
      toKeep = group[0];
      toMerge = group.slice(1);
    }

    mergeActions.push({
      keep: { id: toKeep.id, collectedAt: toKeep.collected_at },
      merge: toMerge.map(e => ({ id: e.id, collectedAt: e.collected_at })),
      reason: `Same provider (${toKeep.source_provider}) and type (${toKeep.evidence_type})`
    });

    if (!dryRun) {
      // Merge payload from all items into the keeper
      const mergedPayload = toMerge.reduce(
        (acc, e) => ({ ...acc, ...e.payload }),
        toKeep.payload
      );

      await db('evidence_items')
        .where({ id: toKeep.id })
        .update({
          payload: mergedPayload,
          updated_at: new Date()
        });

      // Delete the merged items
      await db('evidence_items')
        .whereIn('id', toMerge.map(e => e.id))
        .delete();
    }
  }

  return {
    objectId,
    duplicateGroupsFound: duplicateGroups.length,
    mergeActions,
    dryRun,
    executedAt: dryRun ? null : new Date().toISOString()
  };
}

/**
 * Find groups of duplicate evidence
 */
function findDuplicateGroups(evidence) {
  const groups = new Map();

  for (const e of evidence) {
    // Create a key based on provider + type + key payload fields
    const keyFields = extractKeyFields(e.payload);
    const key = `${e.source_provider}:${e.evidence_type}:${JSON.stringify(keyFields)}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(e);
  }

  // Return only groups with more than one item
  return Array.from(groups.values()).filter(g => g.length > 1);
}

/**
 * Extract key fields from payload for deduplication
 */
function extractKeyFields(payload) {
  // Common identifying fields
  const keyFieldNames = [
    'domain', 'email', 'name', 'company_name', 'person_name',
    'linkedin_url', 'website', 'phone', 'id', 'external_id'
  ];

  const keyFields = {};
  for (const field of keyFieldNames) {
    if (payload[field] !== undefined) {
      keyFields[field] = payload[field];
    }
  }

  return Object.keys(keyFields).length > 0 ? keyFields : { _hash: simpleHash(JSON.stringify(payload)) };
}

/**
 * Simple hash for payload comparison
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

/**
 * Detect conflicts in evidence for an object
 */
export async function detectConflicts(objectId, options = {}) {
  const db = getDb();
  const { fieldPaths = [], threshold = 0.5 } = options;

  const evidence = await db('evidence_items')
    .where({ object_id: objectId })
    .orderBy('confidence', 'desc');

  const conflicts = [];
  const fieldValues = new Map();

  // Collect values for each field across all evidence
  for (const e of evidence) {
    const flatPayload = flattenObject(e.payload);

    for (const [path, value] of Object.entries(flatPayload)) {
      if (fieldPaths.length > 0 && !fieldPaths.includes(path)) continue;
      if (value === null || value === undefined) continue;

      if (!fieldValues.has(path)) {
        fieldValues.set(path, []);
      }
      fieldValues.get(path).push({
        evidenceId: e.id,
        provider: e.source_provider,
        value,
        confidence: parseFloat(e.confidence)
      });
    }
  }

  // Detect conflicts (different values for same field)
  for (const [path, values] of fieldValues) {
    if (values.length < 2) continue;

    // Group by value
    const valueGroups = new Map();
    for (const v of values) {
      const key = JSON.stringify(v.value);
      if (!valueGroups.has(key)) {
        valueGroups.set(key, []);
      }
      valueGroups.get(key).push(v);
    }

    if (valueGroups.size > 1) {
      // We have a conflict
      const sortedGroups = Array.from(valueGroups.entries())
        .sort((a, b) => {
          const maxConfA = Math.max(...a[1].map(v => v.confidence));
          const maxConfB = Math.max(...b[1].map(v => v.confidence));
          return maxConfB - maxConfA;
        });

      for (let i = 0; i < sortedGroups.length - 1; i++) {
        for (let j = i + 1; j < sortedGroups.length; j++) {
          const [valueA, itemsA] = sortedGroups[i];
          const [valueB, itemsB] = sortedGroups[j];

          conflicts.push({
            field: path,
            valueA: JSON.parse(valueA),
            valueB: JSON.parse(valueB),
            evidenceA: itemsA[0],
            evidenceB: itemsB[0],
            confidenceDelta: Math.abs(itemsA[0].confidence - itemsB[0].confidence)
          });
        }
      }
    }
  }

  return {
    objectId,
    conflictsFound: conflicts.length,
    conflicts: conflicts.filter(c => c.confidenceDelta >= threshold || options.showAll),
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Record a detected conflict
 */
export async function recordConflict(objectId, evidenceIdA, evidenceIdB, conflictField, valueA, valueB) {
  const db = getDb();

  // Ensure consistent ordering
  const [idA, idB] = evidenceIdA < evidenceIdB
    ? [evidenceIdA, evidenceIdB]
    : [evidenceIdB, evidenceIdA];

  const [vA, vB] = evidenceIdA < evidenceIdB
    ? [valueA, valueB]
    : [valueB, valueA];

  const [conflict] = await db('evidence_conflicts')
    .insert({
      object_id: objectId,
      evidence_id_a: idA,
      evidence_id_b: idB,
      conflict_field: conflictField,
      value_a: vA,
      value_b: vB
    })
    .onConflict(['evidence_id_a', 'evidence_id_b', 'conflict_field'])
    .ignore()
    .returning('*');

  return conflict ? transformConflict(conflict) : null;
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(conflictId, resolution) {
  const db = getDb();
  const { resolvedValue, method, resolvedBy } = resolution;

  const [updated] = await db('evidence_conflicts')
    .where({ id: conflictId })
    .update({
      resolution_status: 'resolved',
      resolved_value: resolvedValue,
      resolution_method: method,
      resolved_by: resolvedBy,
      resolved_at: new Date()
    })
    .returning('*');

  return updated ? transformConflict(updated) : null;
}

/**
 * Get unresolved conflicts for an object
 */
export async function getUnresolvedConflicts(objectId) {
  const db = getDb();

  const conflicts = await db('evidence_conflicts')
    .where({ object_id: objectId, resolution_status: 'unresolved' })
    .orderBy('detected_at', 'desc');

  return conflicts.map(transformConflict);
}

// ============================================================================
// PROVIDER WEIGHTS
// ============================================================================

/**
 * Get provider weight for scoring
 */
export async function getProviderWeight(providerSlug, evidenceType = null, verticalSlug = null) {
  const db = getDb();

  // Try to get most specific weight first
  const queries = [
    // Exact match (provider + type + vertical)
    db('provider_weights')
      .where({ provider_slug: providerSlug, evidence_type: evidenceType, vertical_slug: verticalSlug, is_active: true })
      .first(),
    // Provider + vertical (any type)
    db('provider_weights')
      .where({ provider_slug: providerSlug, evidence_type: null, vertical_slug: verticalSlug, is_active: true })
      .first(),
    // Provider + type (any vertical)
    db('provider_weights')
      .where({ provider_slug: providerSlug, evidence_type: evidenceType, vertical_slug: null, is_active: true })
      .first(),
    // Provider only (global default)
    db('provider_weights')
      .where({ provider_slug: providerSlug, evidence_type: null, vertical_slug: null, is_active: true })
      .first()
  ];

  for (const query of queries) {
    const weight = await query;
    if (weight) {
      return transformProviderWeight(weight);
    }
  }

  // Return default weight if no config found
  return {
    providerSlug,
    evidenceType,
    verticalSlug,
    baseWeight: 1.0,
    reliabilityScore: 0.7,
    freshnessWeight: 1.0,
    coverageScore: 0.5,
    isDefault: true
  };
}

/**
 * Update provider weight
 */
export async function updateProviderWeight(providerSlug, updates, context = {}) {
  const db = getDb();
  const { evidenceType = null, verticalSlug = null } = context;

  const [weight] = await db('provider_weights')
    .insert({
      provider_slug: providerSlug,
      evidence_type: evidenceType,
      vertical_slug: verticalSlug,
      ...updates
    })
    .onConflict(['provider_slug', 'evidence_type', 'vertical_slug'])
    .merge({
      ...updates,
      updated_at: new Date()
    })
    .returning('*');

  return transformProviderWeight(weight);
}

/**
 * List all provider weights
 */
export async function listProviderWeights(filters = {}) {
  const db = getDb();
  const { providerSlug, verticalSlug, isActive = true } = filters;

  let query = db('provider_weights');

  if (providerSlug) query = query.where('provider_slug', providerSlug);
  if (verticalSlug) query = query.where('vertical_slug', verticalSlug);
  if (isActive !== undefined) query = query.where('is_active', isActive);

  const weights = await query.orderBy('provider_slug');
  return weights.map(transformProviderWeight);
}

// ============================================================================
// EVIDENCE LINKS
// ============================================================================

/**
 * Link evidence to related objects
 */
export async function linkEvidenceToObject(evidenceId, relatedObjectId, relationType, strength = 1.0) {
  const db = getDb();

  const [link] = await db('evidence_links')
    .insert({
      evidence_id: evidenceId,
      related_object_id: relatedObjectId,
      relation_type: relationType,
      strength: Math.max(0, Math.min(1, strength))
    })
    .onConflict(['evidence_id', 'related_object_id', 'relation_type'])
    .merge({ strength: Math.max(0, Math.min(1, strength)) })
    .returning('*');

  return transformEvidenceLink(link);
}

/**
 * Get evidence links for an object
 */
export async function getEvidenceLinks(objectId, options = {}) {
  const db = getDb();
  const { relationTypes, direction = 'both' } = options;

  let query = db('evidence_links as el')
    .join('evidence_items as e', 'el.evidence_id', 'e.id');

  if (direction === 'from') {
    query = query.where('e.object_id', objectId);
  } else if (direction === 'to') {
    query = query.where('el.related_object_id', objectId);
  } else {
    query = query.where(function () {
      this.where('e.object_id', objectId).orWhere('el.related_object_id', objectId);
    });
  }

  if (relationTypes && relationTypes.length > 0) {
    query = query.whereIn('el.relation_type', relationTypes);
  }

  const links = await query.select('el.*', 'e.object_id as evidence_object_id');
  return links.map(transformEvidenceLink);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateInitialConfidence(baseConfidence, providerWeight) {
  // Apply provider weight to base confidence
  const weighted = baseConfidence * providerWeight.reliabilityScore;
  return Math.round(Math.max(0, Math.min(1, weighted)) * 1000) / 1000;
}

function flattenObject(obj, prefix = '') {
  const flattened = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value, newKey));
    } else {
      flattened[newKey] = value;
    }
  }

  return flattened;
}

function transformEvidence(row) {
  return {
    id: row.id,
    objectId: row.object_id,
    sourceProvider: row.source_provider,
    evidenceType: row.evidence_type,
    payload: row.payload,
    confidence: parseFloat(row.confidence),
    rawConfidence: row.raw_confidence ? parseFloat(row.raw_confidence) : null,
    verticalSlug: row.vertical_slug,
    territoryId: row.territory_id,
    isVerified: row.is_verified,
    verificationSource: row.verification_source,
    collectedAt: row.collected_at,
    sourceTimestamp: row.source_timestamp,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function transformFreshness(row) {
  return {
    evidenceId: row.evidence_id,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastUpdatedAt: row.last_updated_at,
    updateCount: row.update_count,
    decayScore: parseFloat(row.decay_score),
    decayRate: row.decay_rate ? parseFloat(row.decay_rate) : null,
    halfLifeDays: row.half_life_days,
    isStale: row.is_stale,
    staleThreshold: row.stale_threshold ? parseFloat(row.stale_threshold) : null
  };
}

function transformProvenance(row) {
  return {
    evidenceId: row.evidence_id,
    rawSource: row.raw_source,
    fetchMetadata: row.fetch_metadata,
    transformationLog: row.transformation_log,
    qualityFlags: row.quality_flags,
    sourceUrl: row.source_url,
    sourceReference: row.source_reference,
    fetchedAt: row.fetched_at
  };
}

function transformProviderWeight(row) {
  return {
    id: row.id,
    providerSlug: row.provider_slug,
    evidenceType: row.evidence_type,
    verticalSlug: row.vertical_slug,
    baseWeight: parseFloat(row.base_weight),
    reliabilityScore: parseFloat(row.reliability_score),
    freshnessWeight: parseFloat(row.freshness_weight),
    coverageScore: parseFloat(row.coverage_score),
    recencyBonus: row.recency_bonus ? parseFloat(row.recency_bonus) : null,
    verificationBonus: row.verification_bonus ? parseFloat(row.verification_bonus) : null,
    config: row.config,
    isActive: row.is_active
  };
}

function transformEvidenceLink(row) {
  return {
    id: row.id,
    evidenceId: row.evidence_id,
    relatedObjectId: row.related_object_id,
    relationType: row.relation_type,
    strength: parseFloat(row.strength),
    createdAt: row.created_at
  };
}

function transformConflict(row) {
  return {
    id: row.id,
    objectId: row.object_id,
    evidenceIdA: row.evidence_id_a,
    evidenceIdB: row.evidence_id_b,
    conflictField: row.conflict_field,
    valueA: row.value_a,
    valueB: row.value_b,
    resolutionStatus: row.resolution_status,
    resolvedValue: row.resolved_value,
    resolutionMethod: row.resolution_method,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    detectedAt: row.detected_at
  };
}

// Export all functions
export default {
  // Evidence CRUD
  addEvidence,
  getEvidence,
  getEvidenceDetails,
  listEvidence,
  updateEvidence,
  deleteEvidence,

  // Aggregation
  aggregateEvidence,

  // Scoring
  computeEvidenceScore,

  // Freshness
  refreshEvidenceFreshness,
  decayAllFreshness,
  getStaleEvidence,

  // Deduplication
  deduplicateEvidence,

  // Conflicts
  detectConflicts,
  recordConflict,
  resolveConflict,
  getUnresolvedConflicts,

  // Provider Weights
  getProviderWeight,
  updateProviderWeight,
  listProviderWeights,

  // Links
  linkEvidenceToObject,
  getEvidenceLinks
};
