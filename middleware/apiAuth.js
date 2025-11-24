// middleware/apiAuth.js
// API Key Authentication for External Integrations

import crypto from 'crypto';
import { pool } from '../utils/db.js';

/**
 * API Key Authentication Middleware
 *
 * Expects header: Authorization: Bearer sk_live_... or x-api-key: sk_live_...
 *
 * Usage:
 *   router.post('/api/v1/propensity/score', apiAuth(['propensity:read']), async (req, res) => { ... })
 */
export function apiAuth(requiredScopes = []) {
  return async (req, res, next) => {
    try {
      // Extract API key from headers
      const apiKey = extractApiKey(req);

      if (!apiKey) {
        return res.status(401).json({
          ok: false,
          error: 'missing_api_key',
          message: 'API key required. Provide via Authorization: Bearer sk_xxx or x-api-key header.'
        });
      }

      // Validate API key format
      if (!apiKey.startsWith('sk_')) {
        return res.status(401).json({
          ok: false,
          error: 'invalid_api_key_format',
          message: 'API key must start with sk_live_ or sk_test_'
        });
      }

      // Hash the API key
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      // Look up in database
      const result = await pool.query(`
        SELECT
          id,
          key_prefix,
          name,
          organization,
          scopes,
          rate_limit_per_minute,
          rate_limit_per_day,
          is_active,
          environment,
          expires_at,
          allowed_ips
        FROM api_keys
        WHERE key_hash = $1
      `, [keyHash]);

      if (result.rows.length === 0) {
        return res.status(401).json({
          ok: false,
          error: 'invalid_api_key',
          message: 'API key not found or invalid.'
        });
      }

      const apiKeyRecord = result.rows[0];

      // Check if active
      if (!apiKeyRecord.is_active) {
        return res.status(401).json({
          ok: false,
          error: 'api_key_inactive',
          message: 'This API key has been deactivated.'
        });
      }

      // Check expiration
      if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
        return res.status(401).json({
          ok: false,
          error: 'api_key_expired',
          message: 'This API key has expired.'
        });
      }

      // Check IP whitelist (if configured)
      if (apiKeyRecord.allowed_ips && apiKeyRecord.allowed_ips.length > 0) {
        const clientIp = getClientIp(req);
        const isAllowed = apiKeyRecord.allowed_ips.some(ip => matchIp(clientIp, ip));

        if (!isAllowed) {
          return res.status(403).json({
            ok: false,
            error: 'ip_not_allowed',
            message: 'Your IP address is not whitelisted for this API key.'
          });
        }
      }

      // Check scopes
      const apiKeyScopes = apiKeyRecord.scopes || [];
      const hasRequiredScopes = requiredScopes.every(scope => apiKeyScopes.includes(scope));

      if (!hasRequiredScopes) {
        return res.status(403).json({
          ok: false,
          error: 'insufficient_scopes',
          message: `This API key does not have required scopes: ${requiredScopes.join(', ')}`,
          required: requiredScopes,
          available: apiKeyScopes
        });
      }

      // Check rate limits
      const rateLimitCheck = await checkRateLimit(
        apiKeyRecord.id,
        apiKeyRecord.rate_limit_per_minute,
        apiKeyRecord.rate_limit_per_day
      );

      if (!rateLimitCheck.allowed) {
        return res.status(429).json({
          ok: false,
          error: 'rate_limit_exceeded',
          message: rateLimitCheck.message,
          retry_after: rateLimitCheck.retryAfter
        });
      }

      // Attach API key info to request
      req.apiKey = {
        id: apiKeyRecord.id,
        name: apiKeyRecord.name,
        organization: apiKeyRecord.organization,
        environment: apiKeyRecord.environment,
        scopes: apiKeyScopes
      };

      // Track usage (non-blocking)
      trackApiUsage(req, apiKeyRecord.id).catch(err => {
        console.error('[apiAuth] Failed to track usage:', err);
      });

      // Update last_used_at (non-blocking)
      pool.query(
        'UPDATE api_keys SET last_used_at = NOW(), total_requests = total_requests + 1 WHERE id = $1',
        [apiKeyRecord.id]
      ).catch(err => {
        console.error('[apiAuth] Failed to update last_used_at:', err);
      });

      next();

    } catch (error) {
      console.error('[apiAuth] Authentication error:', error);
      return res.status(500).json({
        ok: false,
        error: 'authentication_error',
        message: 'Internal authentication error.'
      });
    }
  };
}

/**
 * Extract API key from request headers
 */
function extractApiKey(req) {
  // Try Authorization: Bearer sk_xxx
  const authHeader = req.headers.authorization || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return bearerMatch[1];
  }

  // Try x-api-key header
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Get client IP address (handles proxies)
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         '0.0.0.0';
}

/**
 * Check if client IP matches allowed IP/CIDR
 */
function matchIp(clientIp, allowedPattern) {
  // Simple exact match (production should use proper CIDR matching library)
  if (clientIp === allowedPattern) return true;

  // TODO: Implement CIDR matching for patterns like "203.0.113.0/24"
  // For now, just exact match
  return false;
}

/**
 * Check rate limits (per minute and per day)
 */
async function checkRateLimit(apiKeyId, limitPerMinute, limitPerDay) {
  const now = new Date();

  // Check per-minute limit
  const minuteWindowStart = new Date(now.getTime() - (now.getSeconds() * 1000) - (now.getMilliseconds()));

  const minuteResult = await pool.query(`
    INSERT INTO api_rate_limits (api_key_id, window_start, window_type, request_count)
    VALUES ($1, $2, 'minute', 1)
    ON CONFLICT (api_key_id, window_start, window_type)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1
    RETURNING request_count
  `, [apiKeyId, minuteWindowStart]);

  const minuteCount = minuteResult.rows[0].request_count;

  if (minuteCount > limitPerMinute) {
    return {
      allowed: false,
      message: `Rate limit exceeded: ${limitPerMinute} requests per minute`,
      retryAfter: 60 - now.getSeconds()
    };
  }

  // Check per-day limit
  const dayWindowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const dayResult = await pool.query(`
    INSERT INTO api_rate_limits (api_key_id, window_start, window_type, request_count)
    VALUES ($1, $2, 'day', 1)
    ON CONFLICT (api_key_id, window_start, window_type)
    DO UPDATE SET request_count = api_rate_limits.request_count + 1
    RETURNING request_count
  `, [apiKeyId, dayWindowStart]);

  const dayCount = dayResult.rows[0].request_count;

  if (dayCount > limitPerDay) {
    const tomorrow = new Date(dayWindowStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const secondsUntilTomorrow = Math.floor((tomorrow - now) / 1000);

    return {
      allowed: false,
      message: `Daily rate limit exceeded: ${limitPerDay} requests per day`,
      retryAfter: secondsUntilTomorrow
    };
  }

  return { allowed: true };
}

/**
 * Track API usage for analytics
 */
async function trackApiUsage(req, apiKeyId) {
  const startTime = req._startTime || Date.now();
  const responseTimeMs = Date.now() - startTime;

  await pool.query(`
    INSERT INTO api_usage (
      api_key_id,
      endpoint,
      method,
      ip_address,
      user_agent,
      response_time_ms
    ) VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    apiKeyId,
    req.originalUrl || req.url,
    req.method,
    getClientIp(req),
    req.headers['user-agent'] || null,
    responseTimeMs
  ]);
}

/**
 * Generate new API key
 *
 * Usage:
 *   const apiKey = generateApiKey('live'); // or 'test'
 */
export function generateApiKey(environment = 'live') {
  const prefix = environment === 'live' ? 'sk_live_' : 'sk_test_';
  const randomBytes = crypto.randomBytes(24).toString('hex'); // 48 chars
  return prefix + randomBytes;
}

/**
 * Hash API key for storage
 */
export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}
