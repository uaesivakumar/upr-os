/**
 * OS Authentication Middleware
 * VS1: OS Security Wall
 *
 * Validates x-pr-os-token header for all /api/os/* routes.
 * This middleware ensures only authenticated SaaS instances can call OS APIs.
 *
 * SECURITY REQUIREMENTS:
 * - Token is validated against PR_OS_TOKEN environment variable
 * - All requests without valid token receive 401 Unauthorized
 * - All requests with wrong token receive 403 Forbidden
 * - All authenticated requests are audit logged
 *
 * Authorization Code: VS1-VS9-APPROVED-20251213
 */

import crypto from 'crypto';

// Token header name (lowercase for Express compatibility)
const TOKEN_HEADER = 'x-pr-os-token';

// Cache the hashed token for constant-time comparison
let cachedTokenHash = null;

/**
 * Get the expected token hash (cached for performance)
 */
function getExpectedTokenHash() {
  if (cachedTokenHash === null) {
    const token = process.env.PR_OS_TOKEN;
    if (token) {
      cachedTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    }
  }
  return cachedTokenHash;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Extract client IP address (handles proxies)
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         '0.0.0.0';
}

/**
 * Create audit log entry for OS API calls
 */
function createAuditLog(req, status, error = null) {
  const log = {
    timestamp: new Date().toISOString(),
    type: 'os_api_access',
    method: req.method,
    path: req.originalUrl || req.url,
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || 'unknown',
    tenantId: req.headers['x-tenant-id'] || null,
    userId: req.headers['x-user-id'] || null,
    status: status,
    error: error,
    // Add request fingerprint for correlation
    requestId: req.headers['x-request-id'] || crypto.randomUUID()
  };

  // Log to stdout (will be captured by Cloud Run logs)
  console.log(`[OS_AUDIT] ${JSON.stringify(log)}`);

  return log;
}

/**
 * OS Authentication Middleware
 *
 * Usage:
 *   import { osAuthMiddleware } from '../middleware/osAuth.js';
 *   router.use(osAuthMiddleware);
 *
 * Or for specific routes:
 *   router.post('/score', osAuthMiddleware, scoreHandler);
 */
export function osAuthMiddleware(req, res, next) {
  // Skip health check endpoints (required for Cloud Run probes)
  if (req.path === '/health' || req.path === '/version') {
    return next();
  }

  // Check if PR_OS_TOKEN is configured
  const expectedTokenHash = getExpectedTokenHash();
  if (!expectedTokenHash) {
    console.error('[OS_AUTH] CRITICAL: PR_OS_TOKEN environment variable not set');
    createAuditLog(req, 'error', 'server_misconfigured');
    return res.status(500).json({
      success: false,
      error: 'server_misconfigured',
      message: 'OS authentication not configured. Contact system administrator.'
    });
  }

  // Extract token from header
  const providedToken = req.headers[TOKEN_HEADER];

  // No token provided
  if (!providedToken) {
    createAuditLog(req, 'unauthorized', 'missing_token');
    return res.status(401).json({
      success: false,
      error: 'unauthorized',
      message: 'Authentication required. Provide x-pr-os-token header.'
    });
  }

  // Hash the provided token for secure comparison
  const providedTokenHash = crypto.createHash('sha256').update(providedToken).digest('hex');

  // Validate token using constant-time comparison
  if (!secureCompare(providedTokenHash, expectedTokenHash)) {
    createAuditLog(req, 'forbidden', 'invalid_token');
    return res.status(403).json({
      success: false,
      error: 'forbidden',
      message: 'Invalid authentication token.'
    });
  }

  // Token is valid - log success and continue
  createAuditLog(req, 'authenticated');

  // Add authentication context to request for downstream handlers
  req.osAuth = {
    authenticated: true,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || crypto.randomUUID()
  };

  // VS5: Extract tenant context from headers (set by SaaS from session)
  // This will be used for RLS context and TenantSafeORM
  const tenantId = req.headers['x-tenant-id'];
  if (tenantId) {
    req.tenantId = tenantId;
    // Log tenant context for audit
    console.log(`[OS_AUTH] Tenant context set: ${tenantId}`);
  }

  next();
}

/**
 * OS Audit Middleware
 * Logs all OS API responses with timing information
 * Use AFTER osAuthMiddleware
 */
export function osAuditMiddleware(req, res, next) {
  const startTime = Date.now();

  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const log = {
      timestamp: new Date().toISOString(),
      type: 'os_api_response',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      tenantId: req.headers['x-tenant-id'] || null,
      userId: req.headers['x-user-id'] || null,
      requestId: req.osAuth?.requestId || req.headers['x-request-id'] || 'unknown'
    };

    // Log response metrics
    console.log(`[OS_RESPONSE] ${JSON.stringify(log)}`);

    // Warn on slow responses (>3 seconds)
    if (duration > 3000) {
      console.warn(`[OS_SLOW] Request took ${duration}ms: ${req.method} ${req.originalUrl}`);
    }
  });

  next();
}

/**
 * Clear cached token hash (useful for testing or token rotation)
 */
export function clearTokenCache() {
  cachedTokenHash = null;
}

/**
 * Validate that PR_OS_TOKEN is configured
 * Call this at startup to fail fast if misconfigured
 */
export function validateOsAuthConfig() {
  const token = process.env.PR_OS_TOKEN;

  if (!token) {
    console.error('[OS_AUTH] WARNING: PR_OS_TOKEN not set. OS API will reject all requests.');
    return false;
  }

  if (token.length < 32) {
    console.error('[OS_AUTH] WARNING: PR_OS_TOKEN is too short. Minimum 32 characters recommended.');
    return false;
  }

  console.log('[OS_AUTH] PR_OS_TOKEN configured successfully');
  return true;
}

export default osAuthMiddleware;
