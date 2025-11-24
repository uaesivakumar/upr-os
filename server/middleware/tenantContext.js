/**
 * Tenant Context Middleware
 * Sprint 65: Multi-Tenant Isolation Layer
 *
 * Provides enterprise-grade tenant isolation for all routes
 */

import * as Sentry from '@sentry/node';

// Default tenant for development/testing
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// Tenant violation logging
const violationLog = [];
const MAX_VIOLATION_LOG = 1000;

/**
 * Tenant Context Middleware
 *
 * Extracts and validates tenant_id from various sources:
 * 1. JWT payload (req.user.tenant_id)
 * 2. Request body (req.body.tenant_id)
 * 3. Query parameters (req.query.tenant_id)
 * 4. Headers (X-Tenant-ID)
 *
 * Adds req.tenantId and req.getTenantFilter() helper
 */
export function tenantContext(req, res, next) {
  try {
    // Extract tenant_id from multiple sources (priority order)
    const tenantId = extractTenantId(req);

    // Validate tenant_id format (UUID)
    if (!isValidTenantId(tenantId)) {
      logViolation('INVALID_TENANT_FORMAT', req, tenantId);
      return res.status(400).json({
        success: false,
        error: 'Invalid tenant_id format',
        code: 'TENANT_INVALID_FORMAT'
      });
    }

    // Attach tenant context to request
    req.tenantId = tenantId;

    // Helper to get tenant filter for SQL queries
    req.getTenantFilter = (alias = '') => {
      const prefix = alias ? `${alias}.` : '';
      return `${prefix}tenant_id = '${tenantId}'`;
    };

    // Helper to get tenant_id as parameter
    req.getTenantParam = () => tenantId;

    // Log tenant context for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[TenantContext] ${req.method} ${req.path} - Tenant: ${tenantId}`);
    }

    next();
  } catch (error) {
    console.error('[TenantContext] Error:', error);
    Sentry.captureException(error, {
      tags: { middleware: 'tenantContext' },
      extra: { path: req.path }
    });

    res.status(500).json({
      success: false,
      error: 'Tenant context initialization failed',
      code: 'TENANT_CONTEXT_ERROR'
    });
  }
}

/**
 * Extract tenant_id from request
 * @private
 */
function extractTenantId(req) {
  // Priority 1: Authenticated user
  if (req.user?.tenant_id) {
    return req.user.tenant_id;
  }

  // Priority 2: Header
  const headerTenant = req.get('X-Tenant-ID');
  if (headerTenant) {
    return headerTenant;
  }

  // Priority 3: Query parameter
  if (req.query?.tenant_id) {
    return req.query.tenant_id;
  }

  // Priority 4: Request body
  if (req.body?.tenant_id) {
    return req.body.tenant_id;
  }

  // Fallback: Default tenant (for development)
  return DEFAULT_TENANT_ID;
}

/**
 * Validate tenant_id format (UUID v4)
 * @private
 */
function isValidTenantId(tenantId) {
  if (!tenantId) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(tenantId);
}

/**
 * Strict Tenant Enforcement Middleware
 *
 * Use this for routes that MUST have tenant isolation
 * Rejects requests without valid tenant_id
 */
export function requireTenant(req, res, next) {
  // First apply tenant context
  tenantContext(req, res, () => {
    // Then verify we have a valid tenant
    if (!req.tenantId || req.tenantId === DEFAULT_TENANT_ID) {
      // Only allow default tenant in development
      if (process.env.NODE_ENV === 'production') {
        logViolation('MISSING_TENANT', req, null);
        return res.status(401).json({
          success: false,
          error: 'Tenant authentication required',
          code: 'TENANT_REQUIRED'
        });
      }
    }
    next();
  });
}

/**
 * Log tenant violation for audit
 * @private
 */
function logViolation(type, req, tenantId) {
  const violation = {
    timestamp: new Date().toISOString(),
    type,
    path: req.path,
    method: req.method,
    tenantId,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  };

  violationLog.push(violation);

  // Trim log if too large
  if (violationLog.length > MAX_VIOLATION_LOG) {
    violationLog.splice(0, violationLog.length - MAX_VIOLATION_LOG);
  }

  // Report to Sentry in production
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureMessage(`Tenant violation: ${type}`, {
      level: 'warning',
      tags: { type },
      extra: violation
    });
  }

  console.warn(`[TenantViolation] ${type} - ${req.method} ${req.path}`);
}

/**
 * Get violation log (for admin monitoring)
 */
export function getViolationLog() {
  return [...violationLog];
}

/**
 * Clear violation log
 */
export function clearViolationLog() {
  violationLog.length = 0;
}

/**
 * Tenant-Safe Query Wrapper
 *
 * Wraps database queries to automatically inject tenant_id filter
 */
export function createTenantSafeQuery(pool, tenantId) {
  return {
    /**
     * Execute query with automatic tenant filtering
     * @param {string} text - SQL query (use $TENANT_ID placeholder)
     * @param {Array} params - Query parameters
     */
    async query(text, params = []) {
      // Replace $TENANT_ID placeholder with actual tenant_id
      const tenantAwareQuery = text.replace(/\$TENANT_ID/g, `'${tenantId}'`);

      // Validate query includes tenant filter for sensitive tables
      const sensitiveTablesPattern = /(hr_leads|targeted_companies|email_templates|enrichment_jobs)/i;
      if (sensitiveTablesPattern.test(text)) {
        if (!text.toLowerCase().includes('tenant_id')) {
          const error = new Error(`Query missing tenant_id filter for sensitive table`);
          Sentry.captureException(error, {
            tags: { security: 'tenant_violation' },
            extra: { query: text }
          });

          if (process.env.NODE_ENV === 'production') {
            throw error;
          } else {
            console.warn('[TenantSafeQuery] WARNING: Query missing tenant_id filter:', text);
          }
        }
      }

      return pool.query(tenantAwareQuery, params);
    },

    /**
     * Get a client with tenant context
     */
    async getClient() {
      const client = await pool.connect();
      const originalQuery = client.query.bind(client);

      // Wrap client query with tenant awareness
      client.query = async (text, params) => {
        const tenantAwareQuery = text.replace(/\$TENANT_ID/g, `'${tenantId}'`);
        return originalQuery(tenantAwareQuery, params);
      };

      return client;
    }
  };
}

/**
 * Validate that a resource belongs to the tenant
 */
export async function validateTenantOwnership(pool, tenantId, table, resourceId) {
  const result = await pool.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND tenant_id = $2`,
    [resourceId, tenantId]
  );

  return result.rows.length > 0;
}

/**
 * Create tenant-scoped database helper attached to request
 */
export function attachTenantDb(pool) {
  return (req, res, next) => {
    if (!req.tenantId) {
      return next(new Error('Tenant context required for tenant-scoped DB'));
    }

    req.tenantDb = createTenantSafeQuery(pool, req.tenantId);
    next();
  };
}

export default tenantContext;
