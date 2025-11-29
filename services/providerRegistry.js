/**
 * Provider Registry Service
 * Sprint 50: API Provider Management
 *
 * Core service for managing API providers, rate limiting, health monitoring,
 * and fallback chain orchestration.
 *
 * Key Features:
 * - Provider CRUD operations
 * - Rate limit enforcement
 * - Health status tracking
 * - Fallback chain execution
 * - Provider selection based on capability/vertical
 */

import db from '../utils/db.js';
import crypto from 'crypto';

const { pool } = db;

// ============================================================================
// PROVIDER CRUD OPERATIONS
// ============================================================================

/**
 * Get all providers with optional filters
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} List of providers
 */
async function getAllProviders(options = {}) {
  const { type, status, capability, vertical, includeHealth = true } = options;

  let query = `
    SELECT
      ap.*,
      ${includeHealth ? `
        phs.status as health_status,
        phs.uptime_percentage,
        phs.avg_response_time_ms,
        phs.success_rate_24h,
        phs.total_requests_24h,
        phs.last_check_at
      ` : 'NULL as health_status'}
    FROM api_providers ap
    ${includeHealth ? 'LEFT JOIN provider_health_status phs ON phs.provider_id = ap.id' : ''}
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (type) {
    query += ` AND ap.provider_type = $${paramIndex++}`;
    params.push(type);
  }

  if (status) {
    query += ` AND ap.status = $${paramIndex++}`;
    params.push(status);
  }

  if (capability) {
    query += ` AND ap.capabilities ? $${paramIndex++}`;
    params.push(capability);
  }

  if (vertical) {
    query += ` AND (ap.supported_verticals = '[]' OR ap.supported_verticals ? $${paramIndex++})`;
    params.push(vertical);
  }

  query += ' ORDER BY ap.name';

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get a single provider by ID or slug
 * @param {string} idOrSlug - Provider ID (UUID) or slug
 * @returns {Promise<Object|null>} Provider object or null
 */
async function getProvider(idOrSlug) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

  const query = `
    SELECT
      ap.*,
      phs.status as health_status,
      phs.uptime_percentage,
      phs.avg_response_time_ms,
      phs.success_rate_24h,
      phs.total_requests_24h,
      phs.last_check_at,
      phs.consecutive_failures
    FROM api_providers ap
    LEFT JOIN provider_health_status phs ON phs.provider_id = ap.id
    WHERE ${isUUID ? 'ap.id = $1' : 'ap.slug = $1'}
  `;

  const result = await pool.query(query, [idOrSlug]);
  return result.rows[0] || null;
}

/**
 * Create a new provider
 * @param {Object} providerData - Provider data
 * @returns {Promise<Object>} Created provider
 */
async function createProvider(providerData) {
  const {
    slug,
    name,
    description,
    providerType = 'enrichment',
    baseUrl,
    docsUrl,
    logoUrl,
    capabilities = [],
    supportedVerticals = [],
    defaultRateLimitPerMinute = 60,
    defaultRateLimitPerDay = 10000,
    defaultRateLimitPerMonth = 100000,
    costPerRequest = 0,
    costCurrency = 'USD',
    baselineAccuracyScore = 0.85,
    baselineFreshnessDays = 30,
    status = 'active',
    isGlobal = true
  } = providerData;

  const result = await pool.query(`
    INSERT INTO api_providers (
      slug, name, description, provider_type,
      base_url, docs_url, logo_url,
      capabilities, supported_verticals,
      default_rate_limit_per_minute, default_rate_limit_per_day, default_rate_limit_per_month,
      cost_per_request, cost_currency,
      baseline_accuracy_score, baseline_freshness_days,
      status, is_global
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING *
  `, [
    slug, name, description, providerType,
    baseUrl, docsUrl, logoUrl,
    JSON.stringify(capabilities), JSON.stringify(supportedVerticals),
    defaultRateLimitPerMinute, defaultRateLimitPerDay, defaultRateLimitPerMonth,
    costPerRequest, costCurrency,
    baselineAccuracyScore, baselineFreshnessDays,
    status, isGlobal
  ]);

  // Initialize health status
  await pool.query(`
    INSERT INTO provider_health_status (provider_id, status)
    VALUES ($1, 'unknown')
    ON CONFLICT (provider_id) DO NOTHING
  `, [result.rows[0].id]);

  return result.rows[0];
}

/**
 * Update a provider
 * @param {string} idOrSlug - Provider ID or slug
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated provider
 */
async function updateProvider(idOrSlug, updates) {
  const provider = await getProvider(idOrSlug);
  if (!provider) {
    throw new Error(`Provider not found: ${idOrSlug}`);
  }

  const allowedFields = [
    'name', 'description', 'base_url', 'docs_url', 'logo_url',
    'capabilities', 'supported_verticals',
    'default_rate_limit_per_minute', 'default_rate_limit_per_day', 'default_rate_limit_per_month',
    'cost_per_request', 'cost_currency',
    'baseline_accuracy_score', 'baseline_freshness_days',
    'status', 'is_global'
  ];

  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(snakeKey)) {
      setClauses.push(`${snakeKey} = $${paramIndex++}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
  }

  if (setClauses.length === 0) {
    return provider;
  }

  setClauses.push('updated_at = NOW()');
  values.push(provider.id);

  const result = await pool.query(`
    UPDATE api_providers
    SET ${setClauses.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `, values);

  return result.rows[0];
}

/**
 * Delete a provider (soft delete via status)
 * @param {string} idOrSlug - Provider ID or slug
 * @returns {Promise<boolean>} Success
 */
async function deleteProvider(idOrSlug) {
  const provider = await getProvider(idOrSlug);
  if (!provider) {
    throw new Error(`Provider not found: ${idOrSlug}`);
  }

  await pool.query(`
    UPDATE api_providers
    SET status = 'disabled', updated_at = NOW()
    WHERE id = $1
  `, [provider.id]);

  return true;
}

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

/**
 * Get provider configuration for a tenant
 * @param {string} providerId - Provider ID
 * @param {string} tenantId - Tenant ID (optional)
 * @returns {Promise<Object>} Configuration
 */
async function getProviderConfig(providerId, tenantId = null) {
  const result = await pool.query(`
    SELECT * FROM provider_configurations
    WHERE provider_id = $1
      AND (tenant_id = $2 OR (tenant_id IS NULL AND $2 IS NULL))
    ORDER BY tenant_id NULLS LAST
    LIMIT 1
  `, [providerId, tenantId]);

  return result.rows[0] || null;
}

/**
 * Set provider configuration
 * @param {string} providerId - Provider ID
 * @param {Object} config - Configuration
 * @param {string} tenantId - Tenant ID (optional)
 * @returns {Promise<Object>} Saved configuration
 */
async function setProviderConfig(providerId, config, tenantId = null) {
  const {
    apiKey,
    apiSecret,
    additionalCredentials = {},
    rateLimitPerMinute,
    rateLimitPerDay,
    rateLimitPerMonth,
    priority = 50,
    isEnabled = true,
    isFallback = false,
    verticalOverrides = {}
  } = config;

  // Encrypt API credentials if provided
  const encryptedApiKey = apiKey ? encryptCredential(apiKey) : null;
  const encryptedApiSecret = apiSecret ? encryptCredential(apiSecret) : null;

  const result = await pool.query(`
    INSERT INTO provider_configurations (
      provider_id, tenant_id,
      api_key_encrypted, api_secret_encrypted, additional_credentials,
      rate_limit_per_minute, rate_limit_per_day, rate_limit_per_month,
      priority, is_enabled, is_fallback, vertical_overrides
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (provider_id, tenant_id) DO UPDATE SET
      api_key_encrypted = COALESCE(EXCLUDED.api_key_encrypted, provider_configurations.api_key_encrypted),
      api_secret_encrypted = COALESCE(EXCLUDED.api_secret_encrypted, provider_configurations.api_secret_encrypted),
      additional_credentials = COALESCE(EXCLUDED.additional_credentials, provider_configurations.additional_credentials),
      rate_limit_per_minute = COALESCE(EXCLUDED.rate_limit_per_minute, provider_configurations.rate_limit_per_minute),
      rate_limit_per_day = COALESCE(EXCLUDED.rate_limit_per_day, provider_configurations.rate_limit_per_day),
      rate_limit_per_month = COALESCE(EXCLUDED.rate_limit_per_month, provider_configurations.rate_limit_per_month),
      priority = EXCLUDED.priority,
      is_enabled = EXCLUDED.is_enabled,
      is_fallback = EXCLUDED.is_fallback,
      vertical_overrides = EXCLUDED.vertical_overrides,
      updated_at = NOW()
    RETURNING *
  `, [
    providerId, tenantId,
    encryptedApiKey, encryptedApiSecret, JSON.stringify(additionalCredentials),
    rateLimitPerMinute, rateLimitPerDay, rateLimitPerMonth,
    priority, isEnabled, isFallback, JSON.stringify(verticalOverrides)
  ]);

  return result.rows[0];
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if a provider is rate limited
 * @param {string} providerId - Provider ID
 * @param {string} tenantId - Tenant ID (optional)
 * @returns {Promise<Object>} Rate limit status
 */
async function checkRateLimit(providerId, tenantId = null) {
  const result = await pool.query(`
    SELECT is_provider_rate_limited($1, $2) as is_limited
  `, [providerId, tenantId]);

  const isLimited = result.rows[0]?.is_limited || false;

  if (isLimited) {
    // Get current usage for detailed response
    const usageResult = await pool.query(`
      SELECT
        window_type,
        request_count,
        limit_value,
        (request_count >= limit_value) as is_at_limit
      FROM provider_rate_limits
      WHERE provider_id = $1
        AND (tenant_id = $2 OR ($2 IS NULL AND tenant_id IS NULL))
        AND (
          (window_type = 'minute' AND window_start >= date_trunc('minute', NOW()))
          OR (window_type = 'day' AND window_start >= date_trunc('day', NOW()))
        )
    `, [providerId, tenantId]);

    return {
      isLimited: true,
      windows: usageResult.rows.reduce((acc, row) => {
        acc[row.window_type] = {
          current: row.request_count,
          limit: row.limit_value,
          isAtLimit: row.is_at_limit
        };
        return acc;
      }, {})
    };
  }

  return { isLimited: false };
}

/**
 * Record a provider request (updates rate limit counters)
 * @param {string} providerId - Provider ID
 * @param {boolean} isSuccess - Whether the request succeeded
 * @param {string} tenantId - Tenant ID (optional)
 */
async function recordRequest(providerId, isSuccess = true, tenantId = null) {
  await pool.query(`
    SELECT record_provider_request($1, $2, $3)
  `, [providerId, tenantId, isSuccess]);
}

/**
 * Get rate limit usage for a provider
 * @param {string} providerId - Provider ID
 * @param {string} tenantId - Tenant ID (optional)
 * @returns {Promise<Object>} Usage statistics
 */
async function getRateLimitUsage(providerId, tenantId = null) {
  const result = await pool.query(`
    SELECT
      window_type,
      request_count,
      success_count,
      error_count,
      limit_value,
      ROUND((request_count::numeric / NULLIF(limit_value, 0)) * 100, 2) as usage_percentage
    FROM provider_rate_limits
    WHERE provider_id = $1
      AND (tenant_id = $2 OR ($2 IS NULL AND tenant_id IS NULL))
      AND (
        (window_type = 'minute' AND window_start >= date_trunc('minute', NOW()))
        OR (window_type = 'day' AND window_start >= date_trunc('day', NOW()))
        OR (window_type = 'month' AND window_start >= date_trunc('month', NOW()))
      )
    ORDER BY window_type
  `, [providerId, tenantId]);

  return result.rows.reduce((acc, row) => {
    acc[row.window_type] = {
      used: row.request_count,
      limit: row.limit_value,
      successCount: row.success_count,
      errorCount: row.error_count,
      usagePercentage: parseFloat(row.usage_percentage) || 0
    };
    return acc;
  }, {});
}

// ============================================================================
// HEALTH MONITORING
// ============================================================================

/**
 * Record a health check result
 * @param {string} providerId - Provider ID
 * @param {Object} result - Health check result
 */
async function recordHealthCheck(providerId, result) {
  const {
    checkType = 'api_call',
    endpoint,
    requestMethod = 'GET',
    statusCode,
    responseTimeMs,
    isSuccess,
    errorType,
    errorMessage
  } = result;

  // Log the health check
  await pool.query(`
    INSERT INTO provider_health_logs (
      provider_id, check_type, endpoint, request_method,
      status_code, response_time_ms, is_success,
      error_type, error_message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    providerId, checkType, endpoint, requestMethod,
    statusCode, responseTimeMs, isSuccess,
    errorType, errorMessage
  ]);

  // Update aggregated status
  await updateHealthStatus(providerId);
}

/**
 * Update aggregated health status for a provider
 * @param {string} providerId - Provider ID
 */
async function updateHealthStatus(providerId) {
  await pool.query(`
    INSERT INTO provider_health_status (provider_id, status, uptime_percentage, avg_response_time_ms, success_rate_24h, total_requests_24h, last_check_at, consecutive_failures)
    SELECT
      $1 as provider_id,
      CASE
        WHEN success_rate >= 0.99 THEN 'healthy'
        WHEN success_rate >= 0.90 THEN 'degraded'
        ELSE 'unhealthy'
      END as status,
      ROUND(success_rate * 100, 2) as uptime_percentage,
      avg_response_time as avg_response_time_ms,
      success_rate as success_rate_24h,
      total_requests as total_requests_24h,
      NOW() as last_check_at,
      CASE WHEN last_was_success THEN 0 ELSE consecutive + 1 END as consecutive_failures
    FROM (
      SELECT
        COUNT(*) as total_requests,
        COALESCE(AVG(response_time_ms) FILTER (WHERE is_success), 0)::integer as avg_response_time,
        COALESCE(COUNT(*) FILTER (WHERE is_success)::numeric / NULLIF(COUNT(*), 0), 0) as success_rate,
        (SELECT is_success FROM provider_health_logs WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 1) as last_was_success,
        COALESCE((SELECT consecutive_failures FROM provider_health_status WHERE provider_id = $1), 0) as consecutive
      FROM provider_health_logs
      WHERE provider_id = $1 AND created_at >= NOW() - INTERVAL '24 hours'
    ) stats
    ON CONFLICT (provider_id) DO UPDATE SET
      status = EXCLUDED.status,
      uptime_percentage = EXCLUDED.uptime_percentage,
      avg_response_time_ms = EXCLUDED.avg_response_time_ms,
      success_rate_24h = EXCLUDED.success_rate_24h,
      total_requests_24h = EXCLUDED.total_requests_24h,
      last_check_at = EXCLUDED.last_check_at,
      consecutive_failures = EXCLUDED.consecutive_failures,
      updated_at = NOW()
  `, [providerId]);
}

/**
 * Get health status for a provider
 * @param {string} providerId - Provider ID
 * @returns {Promise<Object>} Health status
 */
async function getHealthStatus(providerId) {
  const result = await pool.query(`
    SELECT * FROM provider_health_status WHERE provider_id = $1
  `, [providerId]);

  return result.rows[0] || { status: 'unknown' };
}

/**
 * Get health history for a provider
 * @param {string} providerId - Provider ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Health check logs
 */
async function getHealthHistory(providerId, options = {}) {
  const { limit = 100, hours = 24 } = options;

  const result = await pool.query(`
    SELECT * FROM provider_health_logs
    WHERE provider_id = $1
      AND created_at >= NOW() - INTERVAL '${hours} hours'
    ORDER BY created_at DESC
    LIMIT $2
  `, [providerId, limit]);

  return result.rows;
}

// ============================================================================
// FALLBACK CHAIN EXECUTION
// ============================================================================

/**
 * Get the best provider(s) for a capability
 * @param {string} capability - Required capability
 * @param {Object} options - Selection options
 * @returns {Promise<Array>} Ordered list of providers
 */
async function getProvidersForCapability(capability, options = {}) {
  const { vertical, tenantId, includeFallbacks = true } = options;

  const result = await pool.query(`
    SELECT * FROM get_best_provider_for_capability($1, $2, $3)
    ${includeFallbacks ? '' : 'WHERE is_fallback = FALSE'}
  `, [capability, vertical, tenantId]);

  return result.rows;
}

/**
 * Get a fallback chain by capability or slug
 * @param {string} capabilityOrSlug - Capability name or chain slug
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Fallback chain configuration
 */
async function getFallbackChain(capabilityOrSlug, options = {}) {
  const { vertical, tenantId } = options;

  const result = await pool.query(`
    SELECT * FROM provider_fallback_chains
    WHERE (slug = $1 OR capability = $1)
      AND (vertical = $2 OR vertical IS NULL)
      AND (tenant_id = $3 OR tenant_id IS NULL)
      AND is_active = TRUE
    ORDER BY
      CASE WHEN tenant_id IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN vertical IS NOT NULL THEN 0 ELSE 1 END
    LIMIT 1
  `, [capabilityOrSlug, vertical, tenantId]);

  return result.rows[0] || null;
}

/**
 * Execute a fallback chain
 * @param {string} chainSlugOrCapability - Chain slug or capability
 * @param {Function} executeProvider - Function to execute a single provider
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
async function executeFallbackChain(chainSlugOrCapability, executeProvider, options = {}) {
  const { vertical, tenantId, context = {} } = options;

  // Get the chain configuration
  const chain = await getFallbackChain(chainSlugOrCapability, { vertical, tenantId });

  if (!chain) {
    // Fall back to dynamic provider selection
    const providers = await getProvidersForCapability(chainSlugOrCapability, { vertical, tenantId });

    if (providers.length === 0) {
      return {
        success: false,
        error: `No providers available for capability: ${chainSlugOrCapability}`,
        attempts: []
      };
    }

    // Execute providers in order
    return executeProviderSequence(providers, executeProvider, context, {
      failFast: true,
      maxRetries: 2
    });
  }

  // Parse chain config and execute
  const chainConfig = chain.chain_config || [];
  const attempts = [];
  let lastResult = null;
  let mergedResults = chain.merge_results ? {} : null;

  for (const providerConfig of chainConfig) {
    const { provider_slug, timeout_ms = 5000, required = false, fallback_only = false } = providerConfig;

    // Skip fallback-only providers if we have a result
    if (fallback_only && lastResult?.success) {
      continue;
    }

    // Get the provider
    const provider = await getProvider(provider_slug);
    if (!provider || provider.status !== 'active') {
      attempts.push({
        provider: provider_slug,
        skipped: true,
        reason: 'provider_not_available'
      });
      continue;
    }

    // Check rate limits
    const rateLimit = await checkRateLimit(provider.id, tenantId);
    if (rateLimit.isLimited) {
      attempts.push({
        provider: provider_slug,
        skipped: true,
        reason: 'rate_limited'
      });
      continue;
    }

    // Execute the provider
    const startTime = Date.now();
    try {
      const result = await Promise.race([
        executeProvider(provider, context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), timeout_ms)
        )
      ]);

      const responseTime = Date.now() - startTime;

      // Record the request
      await recordRequest(provider.id, true, tenantId);
      await recordHealthCheck(provider.id, {
        endpoint: context.endpoint,
        responseTimeMs: responseTime,
        isSuccess: true
      });

      attempts.push({
        provider: provider_slug,
        success: true,
        responseTimeMs: responseTime,
        result
      });

      if (chain.merge_results) {
        mergedResults = { ...mergedResults, ...result };
      } else {
        lastResult = { success: true, data: result, provider: provider_slug };

        if (chain.fail_fast) {
          break;
        }
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorType = error.message === 'Timeout' ? 'timeout' : 'error';

      await recordRequest(provider.id, false, tenantId);
      await recordHealthCheck(provider.id, {
        endpoint: context.endpoint,
        responseTimeMs: responseTime,
        isSuccess: false,
        errorType,
        errorMessage: error.message
      });

      attempts.push({
        provider: provider_slug,
        success: false,
        responseTimeMs: responseTime,
        error: error.message,
        errorType
      });

      if (required) {
        return {
          success: false,
          error: `Required provider ${provider_slug} failed: ${error.message}`,
          attempts
        };
      }
    }
  }

  if (chain.merge_results) {
    return {
      success: Object.keys(mergedResults).length > 0,
      data: mergedResults,
      attempts
    };
  }

  return lastResult || {
    success: false,
    error: 'All providers failed',
    attempts
  };
}

/**
 * Execute providers in sequence
 * @private
 */
async function executeProviderSequence(providers, executeProvider, context, options) {
  const { failFast = true, maxRetries = 2 } = options;
  const attempts = [];

  for (const providerInfo of providers) {
    const provider = await getProvider(providerInfo.provider_id);
    if (!provider) continue;

    let retries = 0;
    while (retries <= maxRetries) {
      const startTime = Date.now();
      try {
        const result = await executeProvider(provider, context);
        const responseTime = Date.now() - startTime;

        await recordRequest(provider.id, true);
        await recordHealthCheck(provider.id, {
          responseTimeMs: responseTime,
          isSuccess: true
        });

        attempts.push({
          provider: provider.slug,
          success: true,
          responseTimeMs: responseTime,
          retries
        });

        if (failFast) {
          return { success: true, data: result, provider: provider.slug, attempts };
        }
        break;
      } catch (error) {
        const responseTime = Date.now() - startTime;

        await recordRequest(provider.id, false);
        await recordHealthCheck(provider.id, {
          responseTimeMs: responseTime,
          isSuccess: false,
          errorMessage: error.message
        });

        retries++;
        if (retries > maxRetries) {
          attempts.push({
            provider: provider.slug,
            success: false,
            error: error.message,
            retries
          });
        }
      }
    }
  }

  return {
    success: false,
    error: 'All providers failed',
    attempts
  };
}

// ============================================================================
// ACCURACY SCORING
// ============================================================================

/**
 * Record a validation result for accuracy tracking
 * @param {string} providerId - Provider ID
 * @param {string} fieldName - Field being validated
 * @param {string} result - Validation result (correct, partial, incorrect, missing)
 * @param {Object} options - Additional options
 */
async function recordAccuracyResult(providerId, fieldName, result, options = {}) {
  const { vertical, dataAgeDays } = options;

  const validResults = ['correct', 'partial', 'incorrect', 'missing'];
  if (!validResults.includes(result)) {
    throw new Error(`Invalid result: ${result}. Must be one of: ${validResults.join(', ')}`);
  }

  const periodStart = new Date();
  periodStart.setHours(0, 0, 0, 0);
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + 1);

  await pool.query(`
    INSERT INTO provider_accuracy_scores (
      provider_id, field_name, vertical, period_start, period_end,
      total_validations, correct_count, partial_count, incorrect_count, missing_count
    ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9)
    ON CONFLICT (provider_id, field_name, vertical, period_start) DO UPDATE SET
      total_validations = provider_accuracy_scores.total_validations + 1,
      correct_count = provider_accuracy_scores.correct_count + EXCLUDED.correct_count,
      partial_count = provider_accuracy_scores.partial_count + EXCLUDED.partial_count,
      incorrect_count = provider_accuracy_scores.incorrect_count + EXCLUDED.incorrect_count,
      missing_count = provider_accuracy_scores.missing_count + EXCLUDED.missing_count,
      accuracy_score = (provider_accuracy_scores.correct_count + EXCLUDED.correct_count)::numeric /
                       (provider_accuracy_scores.total_validations + 1),
      updated_at = NOW()
  `, [
    providerId, fieldName, vertical, periodStart, periodEnd,
    result === 'correct' ? 1 : 0,
    result === 'partial' ? 1 : 0,
    result === 'incorrect' ? 1 : 0,
    result === 'missing' ? 1 : 0
  ]);
}

/**
 * Get accuracy scores for a provider
 * @param {string} providerId - Provider ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Accuracy scores by field
 */
async function getAccuracyScores(providerId, options = {}) {
  const { vertical, days = 30 } = options;

  const result = await pool.query(`
    SELECT
      field_name,
      SUM(total_validations) as total,
      SUM(correct_count) as correct,
      SUM(partial_count) as partial,
      SUM(incorrect_count) as incorrect,
      SUM(missing_count) as missing,
      ROUND(SUM(correct_count)::numeric / NULLIF(SUM(total_validations), 0), 4) as accuracy,
      ROUND((SUM(total_validations) - SUM(missing_count))::numeric / NULLIF(SUM(total_validations), 0), 4) as completeness
    FROM provider_accuracy_scores
    WHERE provider_id = $1
      AND period_start >= NOW() - INTERVAL '${days} days'
      ${vertical ? 'AND vertical = $2' : ''}
    GROUP BY field_name
    ORDER BY accuracy DESC
  `, vertical ? [providerId, vertical] : [providerId]);

  return result.rows.reduce((acc, row) => {
    acc[row.field_name] = {
      total: parseInt(row.total),
      correct: parseInt(row.correct),
      partial: parseInt(row.partial),
      incorrect: parseInt(row.incorrect),
      missing: parseInt(row.missing),
      accuracy: parseFloat(row.accuracy) || 0,
      completeness: parseFloat(row.completeness) || 0
    };
    return acc;
  }, {});
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Encrypt a credential (placeholder - use proper encryption in production)
 * @private
 */
function encryptCredential(value) {
  // In production, use proper encryption with KMS
  // This is a placeholder that just base64 encodes
  const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY || 'default-key-change-me';
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    crypto.scryptSync(encryptionKey, 'salt', 32),
    crypto.randomBytes(16)
  );
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * Decrypt a credential (placeholder)
 * @private
 */
function decryptCredential(encrypted) {
  // In production, use proper decryption with KMS
  // This is a placeholder
  return encrypted;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  // CRUD
  getAllProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,

  // Configuration
  getProviderConfig,
  setProviderConfig,

  // Rate Limiting
  checkRateLimit,
  recordRequest,
  getRateLimitUsage,

  // Health Monitoring
  recordHealthCheck,
  updateHealthStatus,
  getHealthStatus,
  getHealthHistory,

  // Fallback Chains
  getProvidersForCapability,
  getFallbackChain,
  executeFallbackChain,

  // Accuracy Scoring
  recordAccuracyResult,
  getAccuracyScores
};
