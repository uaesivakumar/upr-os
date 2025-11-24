/**
 * Unified Signal Discovery Routes
 * Sprint 19, Task 5: Unified Signal Pipeline
 *
 * Single endpoint for all signal discovery using multi-source orchestration
 * Replaces individual source endpoints with unified pipeline
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import multiSourceOrchestrator from '../server/services/multiSourceOrchestrator.js';
import signalQualityScoring from '../server/services/signalQualityScoring.js';
import NodeCache from 'node-cache';

const router = express.Router();

// Cache for discovery results (15 minutes TTL)
const discoveryCache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

/**
 * POST /api/discovery/signals
 * Unified signal discovery endpoint
 *
 * Body:
 * {
 *   "filters": {
 *     "location": "UAE",
 *     "sector": "Banking",
 *     "companySize": "Enterprise"
 *   },
 *   "options": {
 *     "sources": ["news", "linkedin"],  // Optional: specific sources
 *     "maxParallel": 4,                  // Optional: max concurrent sources
 *     "minQuality": 0.6,                 // Optional: minimum quality score
 *     "includeMultiSourceOnly": false,   // Optional: only multi-source signals
 *     "useCache": true                   // Optional: use cached results
 *   }
 * }
 */
router.post('/signals', async (req, res) => {
  try {
    const {
      filters = {},
      options = {}
    } = req.body;

    const {
      sources = null,
      maxParallel = 4,
      minQuality = 0,
      includeMultiSourceOnly = false,
      useCache = true,
      tenantId = null
    } = options;

    // Get tenantId from options, user object, or query param (for testing without auth)
    const effectiveTenantId = tenantId || req.user?.tenant_id || req.query.tenantId || 'default-tenant';

    // Generate cache key
    const cacheKey = generateCacheKey({ filters, sources, tenantId: effectiveTenantId });

    // Check cache if enabled
    if (useCache) {
      const cachedResult = discoveryCache.get(cacheKey);
      if (cachedResult) {
        console.log('[Discovery] Returning cached results');
        return res.json({
          success: true,
          cached: true,
          ...cachedResult
        });
      }
    }

    console.log('[Discovery] Starting unified discovery:', {
      filters,
      sources,
      tenantId: effectiveTenantId
    });

    // Execute multi-source orchestration
    const orchestrationResult = await multiSourceOrchestrator.orchestrate({
      sources,
      filters,
      maxParallel,
      tenantId: effectiveTenantId
    });

    let signals = orchestrationResult.signals || [];

    // Apply quality filtering if requested
    if (minQuality > 0) {
      const beforeCount = signals.length;
      signals = signalQualityScoring.filterByQuality(signals, minQuality);
      console.log(`[Discovery] Quality filtered: ${beforeCount} → ${signals.length} signals (min: ${minQuality})`);
    }

    // Apply multi-source filter if requested
    if (includeMultiSourceOnly) {
      const beforeCount = signals.length;
      signals = signalQualityScoring.getMultiSourceSignals(signals);
      console.log(`[Discovery] Multi-source filtered: ${beforeCount} → ${signals.length} signals`);
    }

    // Sort signals by quality score (descending)
    signals = signals.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));

    // Prepare response
    const response = {
      success: true,
      cached: false,
      orchestrationId: orchestrationResult.orchestrationId,
      executionTimeMs: orchestrationResult.executionTimeMs,
      discovery: {
        totalSignals: signals.length,
        signals: signals,
        sources: orchestrationResult.sources,
        successfulSources: orchestrationResult.successfulSources,
        failedSources: orchestrationResult.failedSources
      },
      statistics: {
        deduplication: orchestrationResult.deduplication,
        quality: orchestrationResult.quality,
        filtering: {
          minQuality,
          includeMultiSourceOnly,
          originalCount: orchestrationResult.totalSignals,
          filteredCount: signals.length
        }
      }
    };

    // Cache result if enabled
    if (useCache) {
      discoveryCache.set(cacheKey, response);
      console.log('[Discovery] Results cached for 15 minutes');
    }

    res.json(response);

  } catch (error) {
    console.error('[Discovery] Unified discovery failed:', error);

    Sentry.captureException(error, {
      tags: {
        route: '/api/discovery/signals',
        tenantId: req.user?.tenant_id || req.query.tenantId || 'unknown'
      },
      extra: req.body
    });

    res.status(500).json({
      success: false,
      error: 'Signal discovery failed',
      message: error.message
    });
  }
});

/**
 * POST /api/discovery/signals/paginated
 * Paginated unified signal discovery
 *
 * Body: Same as /signals plus:
 * {
 *   "pagination": {
 *     "page": 1,
 *     "limit": 20
 *   }
 * }
 */
router.post('/signals/paginated', async (req, res) => {
  try {
    const {
      filters = {},
      options = {},
      pagination = { page: 1, limit: 20 }
    } = req.body;

    const page = Math.max(1, parseInt(pagination.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pagination.limit) || 20));
    const offset = (page - 1) * limit;

    // Use the main discovery endpoint logic
    const {
      sources = null,
      maxParallel = 4,
      minQuality = 0,
      includeMultiSourceOnly = false,
      useCache = true,
      tenantId = null
    } = options;

    // Get tenantId from options, user object, or query param (for testing without auth)
    const effectiveTenantId = tenantId || req.user?.tenant_id || req.query.tenantId || 'default-tenant';

    // Generate cache key (same as main endpoint)
    const cacheKey = generateCacheKey({ filters, sources, tenantId: effectiveTenantId });

    // Check cache
    let orchestrationResult;
    if (useCache) {
      const cachedResult = discoveryCache.get(cacheKey);
      if (cachedResult) {
        orchestrationResult = cachedResult;
      }
    }

    // Execute orchestration if not cached
    if (!orchestrationResult) {
      orchestrationResult = await multiSourceOrchestrator.orchestrate({
        sources,
        filters,
        maxParallel,
        tenantId: effectiveTenantId
      });

      if (useCache) {
        discoveryCache.set(cacheKey, orchestrationResult);
      }
    }

    let signals = orchestrationResult.signals || [];

    // Apply filtering
    if (minQuality > 0) {
      signals = signalQualityScoring.filterByQuality(signals, minQuality);
    }

    if (includeMultiSourceOnly) {
      signals = signalQualityScoring.getMultiSourceSignals(signals);
    }

    // Sort by quality
    signals = signals.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));

    // Paginate
    const totalSignals = signals.length;
    const totalPages = Math.ceil(totalSignals / limit);
    const paginatedSignals = signals.slice(offset, offset + limit);

    res.json({
      success: true,
      cached: !!orchestrationResult.cached,
      orchestrationId: orchestrationResult.orchestrationId,
      discovery: {
        signals: paginatedSignals,
        sources: orchestrationResult.sources,
        successfulSources: orchestrationResult.successfulSources,
        failedSources: orchestrationResult.failedSources
      },
      pagination: {
        page,
        limit,
        totalSignals,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      },
      statistics: {
        deduplication: orchestrationResult.deduplication,
        quality: orchestrationResult.quality,
        filtering: {
          minQuality,
          includeMultiSourceOnly,
          originalCount: orchestrationResult.totalSignals,
          filteredCount: totalSignals
        }
      }
    });

  } catch (error) {
    console.error('[Discovery] Paginated discovery failed:', error);

    Sentry.captureException(error, {
      tags: {
        route: '/api/discovery/signals/paginated',
        tenantId: req.user?.tenant_id || req.query.tenantId || 'unknown'
      },
      extra: req.body
    });

    res.status(500).json({
      success: false,
      error: 'Paginated signal discovery failed',
      message: error.message
    });
  }
});

/**
 * GET /api/discovery/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = discoveryCache.getStats();

    res.json({
      success: true,
      cache: {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hits > 0 ? stats.hits / (stats.hits + stats.misses) : 0,
        ttl: 900  // 15 minutes
      }
    });

  } catch (error) {
    console.error('[Discovery] Cache stats failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache stats'
    });
  }
});

/**
 * DELETE /api/discovery/cache
 * Clear discovery cache
 */
router.delete('/cache', async (req, res) => {
  try {
    const keyCount = discoveryCache.keys().length;
    discoveryCache.flushAll();

    res.json({
      success: true,
      message: `Cache cleared (${keyCount} entries removed)`
    });

  } catch (error) {
    console.error('[Discovery] Cache clear failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

/**
 * Generate cache key from request parameters
 */
function generateCacheKey(params) {
  const { filters, sources, tenantId } = params;
  return `discovery:${tenantId}:${JSON.stringify(sources)}:${JSON.stringify(filters)}`;
}

export default router;
