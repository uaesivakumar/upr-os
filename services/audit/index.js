/**
 * Audit Service
 *
 * S267-F1: Comprehensive Audit Logging
 *
 * RULES:
 * - Every authority mutation is logged
 * - Logs are IMMUTABLE (append-only)
 * - No behavior change (audit ≠ control)
 * - Audit AFTER the action (not gating)
 *
 * Coverage:
 * - User creation/disable/reassign
 * - Role changes (blocked or allowed)
 * - Persona create/edit/deprecate/bind
 * - Demo expire/manual actions
 * - Threshold updates
 * - Super Admin drill-downs (with intent)
 */

import pool from '../../server/db.js';

// ============================================================
// AUDIT ACTIONS (Enumerated for consistency)
// ============================================================

export const AUDIT_ACTIONS = {
  // User Management
  CREATE_USER: 'CREATE_USER',
  DISABLE_USER: 'DISABLE_USER',
  ENABLE_USER: 'ENABLE_USER',
  REASSIGN_USER: 'REASSIGN_USER',
  BULK_CREATE_USERS: 'BULK_CREATE_USERS',

  // Role Management
  CHANGE_ROLE: 'CHANGE_ROLE',
  ROLE_CHANGE_BLOCKED: 'ROLE_CHANGE_BLOCKED',
  ROLE_ESCALATION_BLOCKED: 'ROLE_ESCALATION_BLOCKED',

  // Persona Management
  CREATE_PERSONA: 'CREATE_PERSONA',
  EDIT_PERSONA: 'EDIT_PERSONA',
  DEPRECATE_PERSONA: 'DEPRECATE_PERSONA',
  BIND_PERSONA: 'BIND_PERSONA',
  UNBIND_PERSONA: 'UNBIND_PERSONA',

  // Demo Management
  CREATE_DEMO: 'CREATE_DEMO',
  EXPIRE_DEMO: 'EXPIRE_DEMO',
  EXTEND_DEMO: 'EXTEND_DEMO',

  // Threshold Management
  UPDATE_THRESHOLD: 'UPDATE_THRESHOLD',

  // Super Admin Actions
  DRILL_DOWN: 'DRILL_DOWN',
  VIEW_AGGREGATE: 'VIEW_AGGREGATE',
  EXPORT_REQUEST: 'EXPORT_REQUEST',
  EXPORT_APPROVED: 'EXPORT_APPROVED',
  EXPORT_DENIED: 'EXPORT_DENIED',

  // Deletion Actions
  SOFT_DELETE: 'SOFT_DELETE',
  HARD_PURGE: 'HARD_PURGE',
  PURGE_JOB_STARTED: 'PURGE_JOB_STARTED',
  PURGE_JOB_COMPLETED: 'PURGE_JOB_COMPLETED',

  // Access Control
  ACCESS_DENIED: 'ACCESS_DENIED',
  CROSS_ENTERPRISE_BLOCKED: 'CROSS_ENTERPRISE_BLOCKED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // System Actions
  SYSTEM_STARTUP: 'SYSTEM_STARTUP',
  CONFIG_CHANGE: 'CONFIG_CHANGE',
};

export const TARGET_TYPES = {
  USER: 'user',
  PERSONA: 'persona',
  DEMO: 'demo',
  THRESHOLD: 'threshold',
  ENTERPRISE: 'enterprise',
  WORKSPACE: 'workspace',
  EXPORT: 'export',
  CONFIG: 'config',
  BTE_SIGNALS: 'bte_signals',
  SYSTEM: 'system',
};

// ============================================================
// CORE AUDIT FUNCTION
// ============================================================

/**
 * Write an audit log entry.
 *
 * This is the SOLE function for audit writes.
 * NEVER bypass this function.
 *
 * @param {Object} params - Audit parameters
 * @param {string} params.actor_user_id - Who performed the action
 * @param {string} params.role - Actor's role
 * @param {string} [params.enterprise_id] - Enterprise scope (null for cross-enterprise)
 * @param {string} params.action - Action performed (use AUDIT_ACTIONS)
 * @param {string} params.target_type - Target type (use TARGET_TYPES)
 * @param {string} [params.target_id] - Target UUID
 * @param {boolean} params.success - Whether action succeeded
 * @param {string} [params.reason] - Denial reason or notes
 * @param {Object} [params.metadata] - Additional context
 * @returns {Promise<Object>} Created audit entry
 */
export async function writeAuditLog({
  actor_user_id,
  role,
  enterprise_id = null,
  action,
  target_type,
  target_id = null,
  success,
  reason = null,
  metadata = {},
}) {
  // Validate required fields
  if (!actor_user_id || !role || !action || !target_type || typeof success !== 'boolean') {
    console.error('[AUDIT] Missing required fields:', { actor_user_id, role, action, target_type, success });
    throw new Error('Audit log requires: actor_user_id, role, action, target_type, success');
  }

  // Validate action is known
  if (!Object.values(AUDIT_ACTIONS).includes(action)) {
    console.warn('[AUDIT] Unknown action:', action);
    // Don't throw - log it anyway for forensics
  }

  try {
    const result = await pool.query(
      `INSERT INTO audit_log (
        actor_user_id, role, enterprise_id, action, target_type, target_id,
        success, reason, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        actor_user_id,
        role,
        enterprise_id,
        action,
        target_type,
        target_id,
        success,
        reason,
        JSON.stringify(metadata),
      ]
    );

    return result.rows[0];
  } catch (error) {
    // CRITICAL: Audit failures must not be silent
    console.error('[AUDIT] CRITICAL - Failed to write audit log:', error.message);
    console.error('[AUDIT] Attempted entry:', { actor_user_id, role, action, target_type, success });

    // Re-throw - audit failures are critical
    throw error;
  }
}

// ============================================================
// CONVENIENCE WRAPPERS
// ============================================================

/**
 * Audit a successful action.
 */
export async function auditSuccess(params) {
  return writeAuditLog({ ...params, success: true });
}

/**
 * Audit a denied/failed action.
 */
export async function auditDenied(params) {
  return writeAuditLog({ ...params, success: false });
}

/**
 * Audit a Super Admin drill-down with intent.
 */
export async function auditDrillDown(actor_user_id, target_type, target_id, intent, metadata = {}) {
  return writeAuditLog({
    actor_user_id,
    role: 'SUPER_ADMIN',
    enterprise_id: null,  // Cross-enterprise by definition
    action: AUDIT_ACTIONS.DRILL_DOWN,
    target_type,
    target_id,
    success: true,
    reason: null,
    metadata: { intent, ...metadata },
  });
}

/**
 * Audit an access denial.
 */
export async function auditAccessDenied(actor_user_id, role, enterprise_id, target_type, target_id, reason) {
  return writeAuditLog({
    actor_user_id,
    role,
    enterprise_id,
    action: AUDIT_ACTIONS.ACCESS_DENIED,
    target_type,
    target_id,
    success: false,
    reason,
  });
}

// ============================================================
// QUERY FUNCTIONS (READ-ONLY)
// ============================================================

/**
 * Get audit entries for a specific actor.
 */
export async function getAuditByActor(actor_user_id, limit = 100) {
  const result = await pool.query(
    `SELECT * FROM audit_log
     WHERE actor_user_id = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [actor_user_id, limit]
  );
  return result.rows;
}

/**
 * Get audit entries for a specific target.
 */
export async function getAuditByTarget(target_type, target_id, limit = 100) {
  const result = await pool.query(
    `SELECT * FROM audit_log
     WHERE target_type = $1 AND target_id = $2
     ORDER BY timestamp DESC
     LIMIT $3`,
    [target_type, target_id, limit]
  );
  return result.rows;
}

/**
 * Get audit entries for an enterprise.
 */
export async function getAuditByEnterprise(enterprise_id, limit = 100) {
  const result = await pool.query(
    `SELECT * FROM audit_log
     WHERE enterprise_id = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [enterprise_id, limit]
  );
  return result.rows;
}

/**
 * Get denied actions (for security review).
 */
export async function getDeniedActions(limit = 100) {
  const result = await pool.query(
    `SELECT * FROM audit_log
     WHERE success = false
     ORDER BY timestamp DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  AUDIT_ACTIONS,
  TARGET_TYPES,
  writeAuditLog,
  auditSuccess,
  auditDenied,
  auditDrillDown,
  auditAccessDenied,
  getAuditByActor,
  getAuditByTarget,
  getAuditByEnterprise,
  getDeniedActions,
};
