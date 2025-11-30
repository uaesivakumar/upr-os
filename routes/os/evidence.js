/**
 * UPR OS Evidence Engine API
 * Sprint 65: Evidence System v2
 *
 * Endpoints for managing evidence aggregation, scoring, freshness,
 * and provider weight configuration.
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import {
  createOSResponse,
  createOSError,
  generateRequestId
} from './types.js';
import * as evidenceEngine from '../../services/evidenceEngine.js';

const router = express.Router();

// ============================================================================
// EVIDENCE CRUD ENDPOINTS
// ============================================================================

/**
 * POST /api/os/evidence
 * Add evidence for an object
 *
 * Request body:
 * {
 *   "objectId": "uuid",
 *   "sourceProvider": "clearbit",
 *   "evidenceType": "firmographic",
 *   "payload": { ... },
 *   "metadata": {
 *     "rawSource": { ... },
 *     "fetchMetadata": { ... },
 *     "verticalSlug": "banking",
 *     "rawConfidence": 0.9
 *   }
 * }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectId, sourceProvider, evidenceType, payload, metadata = {} } = req.body;

    if (!objectId || !sourceProvider || !evidenceType) {
      return res.status(400).json(createOSError({
        error: 'objectId, sourceProvider, and evidenceType are required',
        code: 'OS_EVIDENCE_INVALID_INPUT',
        endpoint: '/api/os/evidence',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const evidence = await evidenceEngine.addEvidence({
      objectId,
      sourceProvider,
      evidenceType,
      payload: payload || {},
      metadata
    });

    res.json(createOSResponse({
      success: true,
      data: evidence,
      reason: `Added ${evidenceType} evidence from ${sourceProvider}`,
      confidence: Math.round(evidence.confidence * 100),
      endpoint: '/api/os/evidence',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error adding evidence:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_ADD_ERROR',
      endpoint: '/api/os/evidence',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/evidence/:id
 * Get evidence details by ID
 */
router.get('/:id', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;

    const evidence = await evidenceEngine.getEvidenceDetails(id);

    if (!evidence) {
      return res.status(404).json(createOSError({
        error: 'Evidence not found',
        code: 'OS_EVIDENCE_NOT_FOUND',
        endpoint: `/api/os/evidence/${id}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: evidence,
      reason: `Evidence from ${evidence.sourceProvider}`,
      confidence: Math.round(evidence.confidence * 100),
      endpoint: `/api/os/evidence/${id}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error getting evidence:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_GET_ERROR',
      endpoint: `/api/os/evidence/${req.params.id}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/evidence/object/:objectId
 * List evidence for an object
 */
router.get('/object/:objectId', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectId } = req.params;
    const { providers, evidenceTypes, minConfidence, isVerified, includeStale, limit, offset } = req.query;

    const filters = {
      providers: providers ? providers.split(',') : undefined,
      evidenceTypes: evidenceTypes ? evidenceTypes.split(',') : undefined,
      minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
      isVerified: isVerified !== undefined ? isVerified === 'true' : undefined,
      includeStale: includeStale !== 'false'
    };

    const options = {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    };

    const result = await evidenceEngine.listEvidence(objectId, filters, options);

    res.json(createOSResponse({
      success: true,
      data: result,
      reason: `Found ${result.total} evidence items`,
      confidence: 100,
      endpoint: `/api/os/evidence/object/${objectId}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error listing evidence:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_LIST_ERROR',
      endpoint: `/api/os/evidence/object/${req.params.objectId}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// AGGREGATION ENDPOINTS
// ============================================================================

/**
 * POST /api/os/evidence/object/:objectId/aggregate
 * Aggregate evidence for an object
 */
router.post('/object/:objectId/aggregate', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectId } = req.params;
    const { groupBy, includeDetails, verticalSlug } = req.body;

    const result = await evidenceEngine.aggregateEvidence(objectId, {
      groupBy,
      includeDetails,
      verticalSlug
    });

    res.json(createOSResponse({
      success: true,
      data: result,
      reason: `Aggregated ${result.totalEvidence} evidence items`,
      confidence: 100,
      endpoint: `/api/os/evidence/object/${objectId}/aggregate`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error aggregating evidence:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_AGGREGATE_ERROR',
      endpoint: `/api/os/evidence/object/${req.params.objectId}/aggregate`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// SCORING ENDPOINTS
// ============================================================================

/**
 * POST /api/os/evidence/object/:objectId/score
 * Compute weighted evidence score for an object
 */
router.post('/object/:objectId/score', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectId } = req.params;
    const { verticalSlug } = req.body;

    const result = await evidenceEngine.computeEvidenceScore(objectId, { verticalSlug });

    res.json(createOSResponse({
      success: true,
      data: result,
      reason: `Evidence score: ${result.score.toFixed(3)} from ${result.evidenceCount} items`,
      confidence: Math.round(result.score * 100),
      endpoint: `/api/os/evidence/object/${objectId}/score`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error computing score:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_SCORE_ERROR',
      endpoint: `/api/os/evidence/object/${req.params.objectId}/score`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// FRESHNESS ENDPOINTS
// ============================================================================

/**
 * POST /api/os/evidence/object/:objectId/refresh
 * Refresh freshness scores for an object's evidence
 */
router.post('/object/:objectId/refresh', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectId } = req.params;

    const result = await evidenceEngine.refreshEvidenceFreshness(objectId);

    res.json(createOSResponse({
      success: true,
      data: result,
      reason: `Refreshed ${result.updatedCount} freshness scores`,
      confidence: 100,
      endpoint: `/api/os/evidence/object/${objectId}/refresh`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error refreshing freshness:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_REFRESH_ERROR',
      endpoint: `/api/os/evidence/object/${req.params.objectId}/refresh`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/evidence/object/:objectId/stale
 * Get stale evidence for an object
 */
router.get('/object/:objectId/stale', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectId } = req.params;
    const { limit } = req.query;

    const staleEvidence = await evidenceEngine.getStaleEvidence(objectId, {
      limit: limit ? parseInt(limit, 10) : 50
    });

    res.json(createOSResponse({
      success: true,
      data: { evidence: staleEvidence, count: staleEvidence.length },
      reason: `Found ${staleEvidence.length} stale evidence items`,
      confidence: 100,
      endpoint: `/api/os/evidence/object/${objectId}/stale`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error getting stale evidence:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_STALE_ERROR',
      endpoint: `/api/os/evidence/object/${req.params.objectId}/stale`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// DEDUPLICATION ENDPOINTS
// ============================================================================

/**
 * POST /api/os/evidence/object/:objectId/dedup
 * Find and deduplicate evidence for an object
 */
router.post('/object/:objectId/dedup', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectId } = req.params;
    const { dryRun = true, mergeStrategy = 'latest' } = req.body;

    const result = await evidenceEngine.deduplicateEvidence(objectId, {
      dryRun,
      mergeStrategy
    });

    res.json(createOSResponse({
      success: true,
      data: result,
      reason: dryRun
        ? `Found ${result.duplicateGroupsFound} duplicate groups (dry run)`
        : `Merged ${result.duplicateGroupsFound} duplicate groups`,
      confidence: 100,
      endpoint: `/api/os/evidence/object/${objectId}/dedup`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error deduplicating evidence:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_DEDUP_ERROR',
      endpoint: `/api/os/evidence/object/${req.params.objectId}/dedup`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// CONFLICT ENDPOINTS
// ============================================================================

/**
 * POST /api/os/evidence/object/:objectId/conflicts
 * Detect conflicts in evidence for an object
 */
router.post('/object/:objectId/conflicts', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectId } = req.params;
    const { fieldPaths, threshold, showAll } = req.body;

    const result = await evidenceEngine.detectConflicts(objectId, {
      fieldPaths,
      threshold,
      showAll
    });

    res.json(createOSResponse({
      success: true,
      data: result,
      reason: `Found ${result.conflictsFound} conflicts`,
      confidence: 100,
      endpoint: `/api/os/evidence/object/${objectId}/conflicts`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error detecting conflicts:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_CONFLICTS_ERROR',
      endpoint: `/api/os/evidence/object/${req.params.objectId}/conflicts`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/evidence/object/:objectId/conflicts/unresolved
 * Get unresolved conflicts for an object
 */
router.get('/object/:objectId/conflicts/unresolved', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectId } = req.params;

    const conflicts = await evidenceEngine.getUnresolvedConflicts(objectId);

    res.json(createOSResponse({
      success: true,
      data: { conflicts, count: conflicts.length },
      reason: `Found ${conflicts.length} unresolved conflicts`,
      confidence: 100,
      endpoint: `/api/os/evidence/object/${objectId}/conflicts/unresolved`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error getting unresolved conflicts:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_CONFLICTS_ERROR',
      endpoint: `/api/os/evidence/object/${req.params.objectId}/conflicts/unresolved`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/evidence/conflicts/:conflictId/resolve
 * Resolve a conflict
 */
router.post('/conflicts/:conflictId/resolve', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { conflictId } = req.params;
    const { resolvedValue, method, resolvedBy } = req.body;

    if (!resolvedValue || !method) {
      return res.status(400).json(createOSError({
        error: 'resolvedValue and method are required',
        code: 'OS_EVIDENCE_INVALID_INPUT',
        endpoint: `/api/os/evidence/conflicts/${conflictId}/resolve`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const conflict = await evidenceEngine.resolveConflict(conflictId, {
      resolvedValue,
      method,
      resolvedBy
    });

    if (!conflict) {
      return res.status(404).json(createOSError({
        error: 'Conflict not found',
        code: 'OS_CONFLICT_NOT_FOUND',
        endpoint: `/api/os/evidence/conflicts/${conflictId}/resolve`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: conflict,
      reason: `Resolved conflict using ${method}`,
      confidence: 100,
      endpoint: `/api/os/evidence/conflicts/${conflictId}/resolve`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error resolving conflict:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_RESOLVE_ERROR',
      endpoint: `/api/os/evidence/conflicts/${req.params.conflictId}/resolve`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// PROVIDER WEIGHT ENDPOINTS
// ============================================================================

/**
 * GET /api/os/evidence/providers/weights
 * List all provider weights
 */
router.get('/providers/weights', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { providerSlug, verticalSlug, isActive } = req.query;

    const weights = await evidenceEngine.listProviderWeights({
      providerSlug,
      verticalSlug,
      isActive: isActive !== undefined ? isActive === 'true' : true
    });

    res.json(createOSResponse({
      success: true,
      data: { weights, count: weights.length },
      reason: `Found ${weights.length} provider weight configurations`,
      confidence: 100,
      endpoint: '/api/os/evidence/providers/weights',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error listing provider weights:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_WEIGHTS_ERROR',
      endpoint: '/api/os/evidence/providers/weights',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/evidence/providers/:providerSlug/weight
 * Get provider weight
 */
router.get('/providers/:providerSlug/weight', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { providerSlug } = req.params;
    const { evidenceType, verticalSlug } = req.query;

    const weight = await evidenceEngine.getProviderWeight(providerSlug, evidenceType, verticalSlug);

    res.json(createOSResponse({
      success: true,
      data: weight,
      reason: weight.isDefault ? `Default weight for ${providerSlug}` : `Custom weight for ${providerSlug}`,
      confidence: 100,
      endpoint: `/api/os/evidence/providers/${providerSlug}/weight`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error getting provider weight:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_WEIGHT_ERROR',
      endpoint: `/api/os/evidence/providers/${req.params.providerSlug}/weight`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * PUT /api/os/evidence/providers/:providerSlug/weight
 * Update provider weight
 */
router.put('/providers/:providerSlug/weight', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { providerSlug } = req.params;
    const { evidenceType, verticalSlug, ...updates } = req.body;

    const weight = await evidenceEngine.updateProviderWeight(providerSlug, updates, {
      evidenceType,
      verticalSlug
    });

    res.json(createOSResponse({
      success: true,
      data: weight,
      reason: `Updated weight for ${providerSlug}`,
      confidence: 100,
      endpoint: `/api/os/evidence/providers/${providerSlug}/weight`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error updating provider weight:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_WEIGHT_UPDATE_ERROR',
      endpoint: `/api/os/evidence/providers/${req.params.providerSlug}/weight`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// EVIDENCE LINKS ENDPOINTS
// ============================================================================

/**
 * POST /api/os/evidence/:evidenceId/link
 * Link evidence to another object
 */
router.post('/:evidenceId/link', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { evidenceId } = req.params;
    const { relatedObjectId, relationType, strength = 1.0 } = req.body;

    if (!relatedObjectId || !relationType) {
      return res.status(400).json(createOSError({
        error: 'relatedObjectId and relationType are required',
        code: 'OS_EVIDENCE_INVALID_INPUT',
        endpoint: `/api/os/evidence/${evidenceId}/link`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const link = await evidenceEngine.linkEvidenceToObject(evidenceId, relatedObjectId, relationType, strength);

    res.json(createOSResponse({
      success: true,
      data: link,
      reason: `Linked evidence with ${relationType} relation`,
      confidence: 100,
      endpoint: `/api/os/evidence/${evidenceId}/link`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error linking evidence:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_LINK_ERROR',
      endpoint: `/api/os/evidence/${req.params.evidenceId}/link`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/evidence/object/:objectId/links
 * Get evidence links for an object
 */
router.get('/object/:objectId/links', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectId } = req.params;
    const { relationTypes, direction } = req.query;

    const links = await evidenceEngine.getEvidenceLinks(objectId, {
      relationTypes: relationTypes ? relationTypes.split(',') : undefined,
      direction
    });

    res.json(createOSResponse({
      success: true,
      data: { links, count: links.length },
      reason: `Found ${links.length} evidence links`,
      confidence: 100,
      endpoint: `/api/os/evidence/object/${objectId}/links`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Evidence] Error getting evidence links:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_EVIDENCE_LINKS_ERROR',
      endpoint: `/api/os/evidence/object/${req.params.objectId}/links`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * GET /api/os/evidence/health
 * Health check for evidence service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'os-evidence',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
