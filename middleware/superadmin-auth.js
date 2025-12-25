/**
 * Super Admin Authentication Middleware
 *
 * S264-F1: Super Admin Identity & Auth (OS-Level)
 *
 * NON-NEGOTIABLE PRINCIPLES:
 * - Super Admin is system authority, not a power user
 * - OS APIs must check role EXPLICITLY
 * - All actions are auditable
 * - No hardcoded "founder" logic
 * - No SaaS-side role enforcement
 *
 * This middleware:
 * 1. Validates the request has a valid OS user identity
 * 2. Verifies the user has SUPER_ADMIN role
 * 3. Logs all access attempts for audit
 * 4. Hard-fails on non-SUPER_ADMIN access
 */

import { readQuery } from '../services/bte/reader.js';

// ============================================================
// AUDIT LOGGING
// ============================================================

/**
 * Log Super Admin access attempt for audit trail.
 *
 * @param {Object} params - Audit parameters
 * @param {string} params.user_id - User attempting access
 * @param {string} params.endpoint - API endpoint accessed
 * @param {string} params.action - Action type (access, drill_down, mutate)
 * @param {boolean} params.success - Whether access was granted
 * @param {string} [params.reason] - Reason for denial if failed
 * @param {Object} [params.metadata] - Additional context
 */
export async function logSuperAdminAudit({
  user_id,
  endpoint,
  action,
  success,
  reason = null,
  metadata = {},
}) {
  // For now, log to console. In production, this goes to audit table.
  const auditEntry = {
    timestamp: new Date().toISOString(),
    user_id,
    endpoint,
    action,
    success,
    reason,
    metadata,
  };

  console.log('[SUPERADMIN_AUDIT]', JSON.stringify(auditEntry));

  // TODO: Insert into audit_log table when S267 is implemented
  return auditEntry;
}

// ============================================================
// USER IDENTITY RESOLUTION
// ============================================================

/**
 * Resolve OS user identity from request.
 *
 * Expects user_id in request headers or authenticated session.
 *
 * @param {Object} req - Express request object
 * @returns {Promise<Object|null>} User identity or null
 */
export async function resolveUserIdentity(req) {
  // Get user_id from header (set by auth layer)
  const userId = req.headers['x-os-user-id'];

  if (!userId) {
    return null;
  }

  // Fetch user identity from OS
  const users = await readQuery(
    `SELECT user_id, enterprise_id, workspace_id, sub_vertical_id, role, mode, status
     FROM os_user_identities
     WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId]
  );

  return users[0] || null;
}

// ============================================================
// SUPER ADMIN MIDDLEWARE
// ============================================================

/**
 * Middleware that enforces SUPER_ADMIN role.
 *
 * HARD-FAILS on:
 * - Missing user identity
 * - Non-SUPER_ADMIN role
 * - Suspended/expired user
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export async function requireSuperAdmin(req, res, next) {
  const endpoint = req.originalUrl || req.url;

  try {
    // Resolve user identity
    const user = await resolveUserIdentity(req);

    if (!user) {
      await logSuperAdminAudit({
        user_id: req.headers['x-os-user-id'] || 'UNKNOWN',
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

    // EXPLICIT role check - no shortcuts
    if (user.role !== 'SUPER_ADMIN') {
      await logSuperAdminAudit({
        user_id: user.user_id,
        endpoint,
        action: 'access',
        success: false,
        reason: 'INSUFFICIENT_ROLE',
        metadata: { actual_role: user.role },
      });

      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Super Admin role required. Access denied.',
      });
    }

    // Log successful access
    await logSuperAdminAudit({
      user_id: user.user_id,
      endpoint,
      action: 'access',
      success: true,
    });

    // Attach user to request for downstream use
    req.superAdmin = user;

    next();
  } catch (error) {
    console.error('[SUPERADMIN_AUTH_ERROR]', error);

    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Authentication check failed.',
    });
  }
}

/**
 * Middleware for audited drill-down access.
 *
 * Requires explicit ?intent=investigate query parameter.
 * Logs drill-down with full audit trail.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export async function requireDrillDownIntent(req, res, next) {
  const intent = req.query.intent;

  if (intent !== 'investigate') {
    await logSuperAdminAudit({
      user_id: req.superAdmin?.user_id || 'UNKNOWN',
      endpoint: req.originalUrl || req.url,
      action: 'drill_down',
      success: false,
      reason: 'MISSING_INTENT',
      metadata: { provided_intent: intent },
    });

    return res.status(400).json({
      success: false,
      error: 'INTENT_REQUIRED',
      message: 'Drill-down requires explicit ?intent=investigate parameter.',
    });
  }

  // Log drill-down access
  await logSuperAdminAudit({
    user_id: req.superAdmin.user_id,
    endpoint: req.originalUrl || req.url,
    action: 'drill_down',
    success: true,
    metadata: { target: req.params },
  });

  next();
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  requireSuperAdmin,
  requireDrillDownIntent,
  logSuperAdminAudit,
  resolveUserIdentity,
};
