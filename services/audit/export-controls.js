/**
 * Export Controls Service
 *
 * S267-F3: Access & Export Controls
 *
 * RULES:
 * - No bulk exports by default
 * - Any export requires explicit intent + audit entry
 * - Rate-limit sensitive reads (admin drill-downs)
 */

import pool from '../../server/db.js';
import { writeAuditLog, AUDIT_ACTIONS, TARGET_TYPES } from './index.js';

// ============================================================
// RATE LIMITING CONFIGURATION
// ============================================================

const RATE_LIMITS = {
  drill_down: { max: 10, window_minutes: 60 },   // 10 drill-downs per hour
  export: { max: 3, window_minutes: 1440 },       // 3 exports per day
  bulk_read: { max: 5, window_minutes: 60 },      // 5 bulk reads per hour
};

// ============================================================
// RATE LIMITING
// ============================================================

/**
 * Check if action is rate-limited.
 *
 * @param {string} userId - User performing action
 * @param {string} action - Action type
 * @returns {Promise<Object>} { allowed: boolean, remaining: number, reset_at: Date }
 */
export async function checkRateLimit(userId, action) {
  const limit = RATE_LIMITS[action];
  if (!limit) {
    return { allowed: true, remaining: Infinity, reset_at: null };
  }

  const windowStart = new Date(Date.now() - limit.window_minutes * 60 * 1000);

  // Count recent actions
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM rate_limit_log
     WHERE user_id = $1 AND action = $2 AND timestamp > $3 AND allowed = true`,
    [userId, action, windowStart]
  );

  const count = parseInt(result.rows[0].count, 10);
  const allowed = count < limit.max;
  const remaining = Math.max(0, limit.max - count - (allowed ? 1 : 0));
  const reset_at = new Date(windowStart.getTime() + limit.window_minutes * 60 * 1000);

  // Log this check
  await pool.query(
    `INSERT INTO rate_limit_log (user_id, action, allowed, limit_config)
     VALUES ($1, $2, $3, $4)`,
    [userId, action, allowed, JSON.stringify(limit)]
  );

  return { allowed, remaining, reset_at };
}

/**
 * Enforce rate limit (throws if exceeded).
 */
export async function enforceRateLimit(userId, action) {
  const check = await checkRateLimit(userId, action);

  if (!check.allowed) {
    throw new Error(`Rate limit exceeded for ${action}. Resets at ${check.reset_at.toISOString()}`);
  }

  return check;
}

// ============================================================
// EXPORT REQUESTS
// ============================================================

/**
 * Request a data export.
 *
 * @param {Object} params - Export parameters
 * @param {string} params.requester_id - User requesting export
 * @param {string} params.enterprise_id - Enterprise scope (null for Super Admin)
 * @param {string} params.export_type - Type of export
 * @param {string} params.intent - Why this export is needed
 * @returns {Promise<Object>} Export request record
 */
export async function requestExport({ requester_id, enterprise_id, export_type, intent }) {
  // Check rate limit
  await enforceRateLimit(requester_id, 'export');

  // Validate intent is provided
  if (!intent || intent.length < 10) {
    throw new Error('Export intent must be at least 10 characters explaining the purpose');
  }

  // Calculate expiry (7 days from approval)
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const result = await pool.query(
    `INSERT INTO export_requests (requester_id, enterprise_id, export_type, intent, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [requester_id, enterprise_id, export_type, intent, expires_at]
  );

  // Audit the request
  await writeAuditLog({
    actor_user_id: requester_id,
    role: 'ENTERPRISE_ADMIN',  // Will be overridden by caller
    enterprise_id,
    action: AUDIT_ACTIONS.EXPORT_REQUEST,
    target_type: TARGET_TYPES.EXPORT,
    target_id: result.rows[0].export_id,
    success: true,
    metadata: { export_type, intent },
  });

  return result.rows[0];
}

/**
 * Approve an export request.
 *
 * Only Super Admin can approve.
 *
 * @param {string} exportId - Export request ID
 * @param {string} approvedBy - Super Admin approving
 * @returns {Promise<Object>} Updated export request
 */
export async function approveExport(exportId, approvedBy) {
  const result = await pool.query(
    `UPDATE export_requests
     SET status = 'APPROVED', approved_by = $2, approved_at = NOW()
     WHERE export_id = $1 AND status = 'PENDING'
     RETURNING *`,
    [exportId, approvedBy]
  );

  if (result.rows.length === 0) {
    throw new Error('Export request not found or already processed');
  }

  await writeAuditLog({
    actor_user_id: approvedBy,
    role: 'SUPER_ADMIN',
    enterprise_id: result.rows[0].enterprise_id,
    action: AUDIT_ACTIONS.EXPORT_APPROVED,
    target_type: TARGET_TYPES.EXPORT,
    target_id: exportId,
    success: true,
  });

  return result.rows[0];
}

/**
 * Deny an export request.
 */
export async function denyExport(exportId, deniedBy, reason) {
  const result = await pool.query(
    `UPDATE export_requests
     SET status = 'DENIED', approved_by = $2, approved_at = NOW()
     WHERE export_id = $1 AND status = 'PENDING'
     RETURNING *`,
    [exportId, deniedBy]
  );

  if (result.rows.length === 0) {
    throw new Error('Export request not found or already processed');
  }

  await writeAuditLog({
    actor_user_id: deniedBy,
    role: 'SUPER_ADMIN',
    enterprise_id: result.rows[0].enterprise_id,
    action: AUDIT_ACTIONS.EXPORT_DENIED,
    target_type: TARGET_TYPES.EXPORT,
    target_id: exportId,
    success: true,
    reason,
  });

  return result.rows[0];
}

/**
 * Mark export as completed.
 */
export async function completeExport(exportId, recordCount, filePath) {
  const result = await pool.query(
    `UPDATE export_requests
     SET status = 'COMPLETED', completed_at = NOW(), record_count = $2, file_path = $3
     WHERE export_id = $1 AND status = 'APPROVED'
     RETURNING *`,
    [exportId, recordCount, filePath]
  );

  if (result.rows.length === 0) {
    throw new Error('Export request not found or not approved');
  }

  return result.rows[0];
}

/**
 * Get pending export requests.
 */
export async function getPendingExports() {
  const result = await pool.query(
    `SELECT * FROM export_requests WHERE status = 'PENDING' ORDER BY created_at ASC`
  );
  return result.rows;
}

/**
 * Expire old approved exports.
 */
export async function expireOldExports() {
  const result = await pool.query(
    `UPDATE export_requests
     SET status = 'EXPIRED'
     WHERE status = 'APPROVED' AND expires_at < NOW()
     RETURNING export_id`
  );
  return result.rows.map(r => r.export_id);
}

// ============================================================
// ACCESS CONTROLS
// ============================================================

/**
 * Check if user can access sensitive data.
 *
 * @param {string} userId - User requesting access
 * @param {string} action - Type of access
 * @returns {Promise<boolean>} True if allowed
 */
export async function canAccessSensitiveData(userId, action) {
  const check = await checkRateLimit(userId, action);
  return check.allowed;
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  checkRateLimit,
  enforceRateLimit,
  requestExport,
  approveExport,
  denyExport,
  completeExport,
  getPendingExports,
  expireOldExports,
  canAccessSensitiveData,
  RATE_LIMITS,
};
