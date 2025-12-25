/**
 * Enterprise Admin Authentication Middleware
 *
 * S265-F1: Enterprise Admin Identity Enforcement
 *
 * NON-NEGOTIABLE PRINCIPLES:
 * - Enterprise Admin manages execution, not policy
 * - Enterprise Admin cannot change the system's brain
 * - Everything is scoped to ONE enterprise
 *
 * This middleware:
 * 1. Validates the request has a valid OS user identity
 * 2. Verifies the user has ENTERPRISE_ADMIN role (or SUPER_ADMIN)
 * 3. Enforces enterprise scope (can only access own enterprise)
 * 4. Logs all access attempts for audit
 * 5. Hard-fails on insufficient role
 */

import { readQuery } from '../services/bte/reader.js';
import { logSuperAdminAudit } from './superadmin-auth.js';

// ============================================================
// AUDIT LOGGING
// ============================================================

/**
 * Log Enterprise Admin action for audit trail.
 */
export async function logEnterpriseAdminAudit({
  user_id,
  enterprise_id,
  endpoint,
  action,
  success,
  reason = null,
  metadata = {},
}) {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    user_id,
    enterprise_id,
    endpoint,
    action,
    success,
    reason,
    metadata,
  };

  console.log('[ENTERPRISE_ADMIN_AUDIT]', JSON.stringify(auditEntry));

  // TODO: Insert into audit_log table when S267 is implemented
  return auditEntry;
}

// ============================================================
// USER IDENTITY RESOLUTION
// ============================================================

/**
 * Resolve OS user identity from request.
 */
async function resolveUserIdentity(req) {
  const userId = req.headers['x-os-user-id'];

  if (!userId) {
    return null;
  }

  const users = await readQuery(
    `SELECT user_id, enterprise_id, workspace_id, sub_vertical_id, role, mode, status
     FROM os_user_identities
     WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId]
  );

  return users[0] || null;
}

// ============================================================
// ENTERPRISE ADMIN MIDDLEWARE
// ============================================================

/**
 * Middleware that enforces ENTERPRISE_ADMIN role.
 *
 * Allows: ENTERPRISE_ADMIN, SUPER_ADMIN
 * Denies: USER, missing identity
 *
 * Also enforces enterprise scope - admin can only access their own enterprise.
 */
export async function requireEnterpriseAdmin(req, res, next) {
  const endpoint = req.originalUrl || req.url;

  try {
    const user = await resolveUserIdentity(req);

    if (!user) {
      await logEnterpriseAdminAudit({
        user_id: req.headers['x-os-user-id'] || 'UNKNOWN',
        enterprise_id: null,
        endpoint,
        action: 'access',
        success: false,
        reason: 'NO_USER_IDENTITY',
      });

      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Valid OS user identity required.',
      });
    }

    // Check role - allow ENTERPRISE_ADMIN or SUPER_ADMIN
    if (user.role !== 'ENTERPRISE_ADMIN' && user.role !== 'SUPER_ADMIN') {
      await logEnterpriseAdminAudit({
        user_id: user.user_id,
        enterprise_id: user.enterprise_id,
        endpoint,
        action: 'access',
        success: false,
        reason: 'INSUFFICIENT_ROLE',
        metadata: { actual_role: user.role },
      });

      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Enterprise Admin role required. Access denied.',
      });
    }

    // Log successful access
    await logEnterpriseAdminAudit({
      user_id: user.user_id,
      enterprise_id: user.enterprise_id,
      endpoint,
      action: 'access',
      success: true,
    });

    // Attach user to request
    req.enterpriseAdmin = user;

    next();
  } catch (error) {
    console.error('[ENTERPRISE_ADMIN_AUTH_ERROR]', error);

    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Authentication check failed.',
    });
  }
}

/**
 * Middleware that enforces enterprise scope.
 *
 * Ensures the admin can only access resources within their own enterprise.
 * SUPER_ADMIN bypasses this check.
 */
export function enforceEnterpriseScope(enterpriseIdParam = 'enterprise_id') {
  return async (req, res, next) => {
    const user = req.enterpriseAdmin;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Enterprise Admin identity not resolved.',
      });
    }

    // SUPER_ADMIN can access any enterprise
    if (user.role === 'SUPER_ADMIN') {
      return next();
    }

    // Get target enterprise from params or body
    const targetEnterpriseId =
      req.params[enterpriseIdParam] ||
      req.body[enterpriseIdParam] ||
      req.query[enterpriseIdParam];

    // If no target specified, scope to admin's own enterprise
    if (!targetEnterpriseId) {
      req.scopedEnterpriseId = user.enterprise_id;
      return next();
    }

    // Verify target matches admin's enterprise
    if (targetEnterpriseId !== user.enterprise_id) {
      await logEnterpriseAdminAudit({
        user_id: user.user_id,
        enterprise_id: user.enterprise_id,
        endpoint: req.originalUrl || req.url,
        action: 'access',
        success: false,
        reason: 'CROSS_ENTERPRISE_ACCESS_DENIED',
        metadata: { attempted_enterprise: targetEnterpriseId },
      });

      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Cannot access resources outside your enterprise.',
      });
    }

    req.scopedEnterpriseId = targetEnterpriseId;
    next();
  };
}

/**
 * Middleware that blocks Enterprise Admin from Super Admin APIs.
 *
 * ENTERPRISE_ADMIN calling /superadmin/* must 403.
 */
export async function blockSuperAdminAPIs(req, res, next) {
  const user = req.enterpriseAdmin;

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Identity not resolved.',
    });
  }

  // SUPER_ADMIN can access
  if (user.role === 'SUPER_ADMIN') {
    return next();
  }

  // ENTERPRISE_ADMIN cannot access superadmin endpoints
  const endpoint = req.originalUrl || req.url;
  if (
    endpoint.includes('/superadmin/') ||
    endpoint.includes('/personas') ||
    endpoint.includes('/demos/thresholds') ||
    endpoint.includes('/demos/') && req.method === 'POST' // expire endpoint
  ) {
    await logEnterpriseAdminAudit({
      user_id: user.user_id,
      enterprise_id: user.enterprise_id,
      endpoint,
      action: 'access',
      success: false,
      reason: 'SUPER_ADMIN_API_BLOCKED',
    });

    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'This API requires Super Admin role.',
    });
  }

  next();
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  requireEnterpriseAdmin,
  enforceEnterpriseScope,
  blockSuperAdminAPIs,
  logEnterpriseAdminAudit,
};
