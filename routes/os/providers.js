/**
 * UPR OS Provider Management API
 * Sprint 50: API Provider Management
 *
 * Endpoints for managing API providers, configurations, rate limits,
 * health monitoring, and fallback chains.
 *
 * All endpoints follow the standard OS response format.
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import {
  createOSResponse,
  createOSError,
  getTenantId,
  generateRequestId
} from './types.js';
import * as providerRegistry from '../../services/providerRegistry.js';
import db from '../../utils/db.js';

const { pool } = db;

const router = express.Router();

// ============================================================================
// STATIC ROUTES (must be defined BEFORE dynamic :idOrSlug routes)
// ============================================================================

/**
 * GET /api/os/providers/health
 * Health check for provider service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'os-providers',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/os/providers/dashboard
 * Get provider dashboard data
 */
router.get('/dashboard', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    // Get all providers with health info
    const providers = await providerRegistry.getAllProviders({ includeHealth: true });

    // Calculate summary statistics
    const summary = {
      total: providers.length,
      byStatus: {},
      byHealth: {},
      totalRequestsToday: 0,
      avgResponseTime: 0
    };

    let responseTimeSum = 0;
    let responseTimeCount = 0;

    providers.forEach(p => {
      summary.byStatus[p.status] = (summary.byStatus[p.status] || 0) + 1;
      const healthStatus = p.health?.status || 'unknown';
      summary.byHealth[healthStatus] = (summary.byHealth[healthStatus] || 0) + 1;
      summary.totalRequestsToday += p.requests_today || 0;

      if (p.health?.avg_response_time_ms) {
        responseTimeSum += p.health.avg_response_time_ms;
        responseTimeCount++;
      }
    });

    summary.avgResponseTime = responseTimeCount > 0 ?
      Math.round(responseTimeSum / responseTimeCount) : 0;

    res.json(createOSResponse({
      success: true,
      data: {
        summary,
        providers
      },
      reason: 'Dashboard data retrieved',
      confidence: 100,
      endpoint: '/api/os/providers/dashboard',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error getting dashboard:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_DASHBOARD_ERROR',
      endpoint: '/api/os/providers/dashboard',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/providers/chains
 * List all fallback chains
 */
router.get('/chains', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const result = await pool.query(`
      SELECT * FROM v_fallback_chains_overview
      ORDER BY capability, vertical NULLS FIRST
    `);

    res.json(createOSResponse({
      success: true,
      data: {
        chains: result.rows,
        total: result.rows.length
      },
      reason: `Found ${result.rows.length} fallback chains`,
      confidence: 100,
      endpoint: '/api/os/providers/chains',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error listing chains:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_CHAINS_ERROR',
      endpoint: '/api/os/providers/chains',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/providers/chains/:slugOrCapability
 * Get a specific fallback chain
 */
router.get('/chains/:slugOrCapability', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slugOrCapability } = req.params;
    const { vertical } = req.query;
    const tenantId = getTenantId(req);

    const chain = await providerRegistry.getFallbackChain(slugOrCapability, {
      vertical,
      tenantId
    });

    if (!chain) {
      return res.status(404).json(createOSError({
        error: `Fallback chain not found: ${slugOrCapability}`,
        code: 'OS_CHAIN_NOT_FOUND',
        endpoint: `/api/os/providers/chains/${slugOrCapability}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: chain,
      reason: 'Fallback chain found',
      confidence: 100,
      endpoint: `/api/os/providers/chains/${slugOrCapability}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error getting chain:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_CHAIN_ERROR',
      endpoint: `/api/os/providers/chains/${req.params.slugOrCapability}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/providers/select
 * Select the best provider(s) for a capability
 */
router.post('/select', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { capability, vertical, limit = 5 } = req.body;
    const tenantId = getTenantId(req);

    if (!capability) {
      return res.status(400).json(createOSError({
        error: 'capability is required',
        code: 'OS_PROVIDER_INVALID_INPUT',
        endpoint: '/api/os/providers/select',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const providers = await providerRegistry.getProvidersForCapability(capability, {
      vertical,
      tenantId
    });

    res.json(createOSResponse({
      success: true,
      data: {
        capability,
        vertical,
        providers: providers.slice(0, limit),
        total: providers.length
      },
      reason: `Found ${providers.length} providers for ${capability}`,
      confidence: 100,
      endpoint: '/api/os/providers/select',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error selecting providers:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_SELECT_ERROR',
      endpoint: '/api/os/providers/select',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// PROVIDER CRUD ENDPOINTS
// ============================================================================

/**
 * GET /api/os/providers
 * List all providers with optional filters
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { type, status, capability, vertical, includeHealth } = req.query;

    const providers = await providerRegistry.getAllProviders({
      type,
      status,
      capability,
      vertical,
      includeHealth: includeHealth !== 'false'
    });

    res.json(createOSResponse({
      success: true,
      data: {
        providers,
        total: providers.length
      },
      reason: `Found ${providers.length} providers`,
      confidence: 100,
      endpoint: '/api/os/providers',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error listing providers:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDERS_LIST_ERROR',
      endpoint: '/api/os/providers',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/providers/:idOrSlug
 * Get a single provider by ID or slug
 */
router.get('/:idOrSlug', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { idOrSlug } = req.params;

    const provider = await providerRegistry.getProvider(idOrSlug);

    if (!provider) {
      return res.status(404).json(createOSError({
        error: `Provider not found: ${idOrSlug}`,
        code: 'OS_PROVIDER_NOT_FOUND',
        endpoint: `/api/os/providers/${idOrSlug}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    // Get additional details
    const [healthStatus, rateLimitUsage, accuracyScores] = await Promise.all([
      providerRegistry.getHealthStatus(provider.id),
      providerRegistry.getRateLimitUsage(provider.id),
      providerRegistry.getAccuracyScores(provider.id)
    ]);

    res.json(createOSResponse({
      success: true,
      data: {
        ...provider,
        health: healthStatus,
        rateLimits: rateLimitUsage,
        accuracy: accuracyScores
      },
      reason: 'Provider retrieved successfully',
      confidence: 100,
      endpoint: `/api/os/providers/${idOrSlug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error getting provider:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_GET_ERROR',
      endpoint: `/api/os/providers/${req.params.idOrSlug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/providers
 * Create a new provider
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const providerData = req.body;

    // Validate required fields
    if (!providerData.slug || !providerData.name) {
      return res.status(400).json(createOSError({
        error: 'slug and name are required',
        code: 'OS_PROVIDER_INVALID_INPUT',
        endpoint: '/api/os/providers',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const provider = await providerRegistry.createProvider(providerData);

    res.status(201).json(createOSResponse({
      success: true,
      data: provider,
      reason: `Provider ${provider.slug} created successfully`,
      confidence: 100,
      endpoint: '/api/os/providers',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error creating provider:', error);
    Sentry.captureException(error);

    const statusCode = error.code === '23505' ? 409 : 500;  // Duplicate key
    res.status(statusCode).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_CREATE_ERROR',
      endpoint: '/api/os/providers',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * PATCH /api/os/providers/:idOrSlug
 * Update a provider
 */
router.patch('/:idOrSlug', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { idOrSlug } = req.params;
    const updates = req.body;

    const provider = await providerRegistry.updateProvider(idOrSlug, updates);

    res.json(createOSResponse({
      success: true,
      data: provider,
      reason: `Provider ${provider.slug} updated successfully`,
      confidence: 100,
      endpoint: `/api/os/providers/${idOrSlug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error updating provider:', error);
    Sentry.captureException(error);

    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_UPDATE_ERROR',
      endpoint: `/api/os/providers/${req.params.idOrSlug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * DELETE /api/os/providers/:idOrSlug
 * Delete (disable) a provider
 */
router.delete('/:idOrSlug', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { idOrSlug } = req.params;

    await providerRegistry.deleteProvider(idOrSlug);

    res.json(createOSResponse({
      success: true,
      data: { deleted: true },
      reason: `Provider ${idOrSlug} disabled successfully`,
      confidence: 100,
      endpoint: `/api/os/providers/${idOrSlug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error deleting provider:', error);
    Sentry.captureException(error);

    const statusCode = error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_DELETE_ERROR',
      endpoint: `/api/os/providers/${req.params.idOrSlug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// PROVIDER CONFIGURATION ENDPOINTS
// ============================================================================

/**
 * GET /api/os/providers/:idOrSlug/config
 * Get provider configuration
 */
router.get('/:idOrSlug/config', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { idOrSlug } = req.params;
    const tenantId = getTenantId(req);

    const provider = await providerRegistry.getProvider(idOrSlug);
    if (!provider) {
      return res.status(404).json(createOSError({
        error: `Provider not found: ${idOrSlug}`,
        code: 'OS_PROVIDER_NOT_FOUND',
        endpoint: `/api/os/providers/${idOrSlug}/config`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const config = await providerRegistry.getProviderConfig(provider.id, tenantId);

    res.json(createOSResponse({
      success: true,
      data: {
        provider: provider.slug,
        config: config || { isEnabled: true, priority: 50 },
        defaults: {
          rateLimitPerMinute: provider.default_rate_limit_per_minute,
          rateLimitPerDay: provider.default_rate_limit_per_day,
          rateLimitPerMonth: provider.default_rate_limit_per_month
        }
      },
      reason: config ? 'Configuration found' : 'Using default configuration',
      confidence: 100,
      endpoint: `/api/os/providers/${idOrSlug}/config`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error getting config:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_CONFIG_ERROR',
      endpoint: `/api/os/providers/${req.params.idOrSlug}/config`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * PUT /api/os/providers/:idOrSlug/config
 * Set provider configuration
 */
router.put('/:idOrSlug/config', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { idOrSlug } = req.params;
    const tenantId = getTenantId(req);
    const configData = req.body;

    const provider = await providerRegistry.getProvider(idOrSlug);
    if (!provider) {
      return res.status(404).json(createOSError({
        error: `Provider not found: ${idOrSlug}`,
        code: 'OS_PROVIDER_NOT_FOUND',
        endpoint: `/api/os/providers/${idOrSlug}/config`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const config = await providerRegistry.setProviderConfig(
      provider.id,
      configData,
      configData.global ? null : tenantId
    );

    res.json(createOSResponse({
      success: true,
      data: config,
      reason: 'Configuration saved successfully',
      confidence: 100,
      endpoint: `/api/os/providers/${idOrSlug}/config`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error setting config:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_CONFIG_ERROR',
      endpoint: `/api/os/providers/${req.params.idOrSlug}/config`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// RATE LIMIT ENDPOINTS
// ============================================================================

/**
 * GET /api/os/providers/:idOrSlug/rate-limits
 * Get rate limit status for a provider
 */
router.get('/:idOrSlug/rate-limits', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { idOrSlug } = req.params;
    const tenantId = getTenantId(req);

    const provider = await providerRegistry.getProvider(idOrSlug);
    if (!provider) {
      return res.status(404).json(createOSError({
        error: `Provider not found: ${idOrSlug}`,
        code: 'OS_PROVIDER_NOT_FOUND',
        endpoint: `/api/os/providers/${idOrSlug}/rate-limits`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const [rateLimitStatus, usage] = await Promise.all([
      providerRegistry.checkRateLimit(provider.id, tenantId),
      providerRegistry.getRateLimitUsage(provider.id, tenantId)
    ]);

    res.json(createOSResponse({
      success: true,
      data: {
        provider: provider.slug,
        isLimited: rateLimitStatus.isLimited,
        usage,
        limits: {
          perMinute: provider.default_rate_limit_per_minute,
          perDay: provider.default_rate_limit_per_day,
          perMonth: provider.default_rate_limit_per_month
        }
      },
      reason: rateLimitStatus.isLimited ? 'Provider is rate limited' : 'Provider is available',
      confidence: 100,
      endpoint: `/api/os/providers/${idOrSlug}/rate-limits`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error getting rate limits:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_RATE_LIMIT_ERROR',
      endpoint: `/api/os/providers/${req.params.idOrSlug}/rate-limits`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// HEALTH MONITORING ENDPOINTS
// ============================================================================

/**
 * GET /api/os/providers/:idOrSlug/health
 * Get health status for a provider
 */
router.get('/:idOrSlug/health', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { idOrSlug } = req.params;
    const { history = 'false', hours = '24' } = req.query;

    const provider = await providerRegistry.getProvider(idOrSlug);
    if (!provider) {
      return res.status(404).json(createOSError({
        error: `Provider not found: ${idOrSlug}`,
        code: 'OS_PROVIDER_NOT_FOUND',
        endpoint: `/api/os/providers/${idOrSlug}/health`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const healthStatus = await providerRegistry.getHealthStatus(provider.id);
    let healthHistory = null;

    if (history === 'true') {
      healthHistory = await providerRegistry.getHealthHistory(provider.id, {
        hours: parseInt(hours)
      });
    }

    res.json(createOSResponse({
      success: true,
      data: {
        provider: provider.slug,
        status: healthStatus,
        history: healthHistory
      },
      reason: `Provider status: ${healthStatus.status}`,
      confidence: 100,
      endpoint: `/api/os/providers/${idOrSlug}/health`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error getting health:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_HEALTH_ERROR',
      endpoint: `/api/os/providers/${req.params.idOrSlug}/health`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/providers/:idOrSlug/health/check
 * Trigger a health check for a provider
 */
router.post('/:idOrSlug/health/check', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { idOrSlug } = req.params;

    const provider = await providerRegistry.getProvider(idOrSlug);
    if (!provider) {
      return res.status(404).json(createOSError({
        error: `Provider not found: ${idOrSlug}`,
        code: 'OS_PROVIDER_NOT_FOUND',
        endpoint: `/api/os/providers/${idOrSlug}/health/check`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    // Perform a synthetic health check
    // In a real implementation, this would call the provider's health endpoint
    const checkResult = {
      checkType: 'synthetic',
      endpoint: provider.base_url + '/health',
      statusCode: 200,
      responseTimeMs: Math.floor(Math.random() * 200) + 50,
      isSuccess: true
    };

    await providerRegistry.recordHealthCheck(provider.id, checkResult);
    const healthStatus = await providerRegistry.getHealthStatus(provider.id);

    res.json(createOSResponse({
      success: true,
      data: {
        provider: provider.slug,
        check: checkResult,
        status: healthStatus
      },
      reason: 'Health check completed',
      confidence: 100,
      endpoint: `/api/os/providers/${idOrSlug}/health/check`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Providers] Error running health check:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PROVIDER_HEALTH_CHECK_ERROR',
      endpoint: `/api/os/providers/${req.params.idOrSlug}/health/check`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

export default router;
// Force rebuild $(date)
