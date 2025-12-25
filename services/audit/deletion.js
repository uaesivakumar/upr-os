/**
 * Deletion Service
 *
 * S267-F2: Deletion Semantics
 *
 * RULES:
 * - Soft delete FIRST (status=DELETED, access denied immediately)
 * - Hard purge LATER (after configurable window, default 90 days)
 * - business_events NEVER purged (immutable audit trail)
 * - bte_signals purged beyond retention (18 months, recomputable)
 *
 * GUARDRAILS:
 * - Purge requires explicit dry_run=false
 * - All purge operations are audited
 * - Derived data can be recomputed from events
 */

import pool from '../../server/db.js';
import { writeAuditLog, AUDIT_ACTIONS, TARGET_TYPES } from './index.js';

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * Get purge configuration value.
 */
export async function getPurgeConfig(key) {
  const result = await pool.query(
    'SELECT config_value FROM purge_config WHERE config_key = $1',
    [key]
  );
  return result.rows[0]?.config_value || null;
}

/**
 * Check if purge is enabled (master switch).
 */
export async function isPurgeEnabled() {
  const value = await getPurgeConfig('purge_enabled');
  return value === 'true';
}

/**
 * Get soft delete window in days.
 */
export async function getSoftDeleteWindowDays() {
  const value = await getPurgeConfig('soft_delete_window_days');
  return parseInt(value, 10) || 90;
}

/**
 * Get BTE signal retention in months.
 */
export async function getBTERetentionMonths() {
  const value = await getPurgeConfig('bte_signal_retention_months');
  return parseInt(value, 10) || 18;
}

// ============================================================
// SOFT DELETE
// ============================================================

/**
 * Soft delete a user.
 *
 * Sets deleted_at, deleted_by. Access is denied immediately.
 *
 * @param {string} userId - User to delete
 * @param {string} deletedBy - Actor performing deletion
 * @returns {Promise<Object>} Updated user record
 */
export async function softDeleteUser(userId, deletedBy) {
  // Soft delete: deleted_at is the authoritative marker
  // Status is NOT changed - deleted_at IS NOT NULL = soft deleted
  // All access checks must filter: WHERE deleted_at IS NULL
  const result = await pool.query(
    `UPDATE os_user_identities
     SET deleted_at = NOW(), deleted_by = $2
     WHERE user_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [userId, deletedBy]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found or already deleted');
  }

  // Audit the deletion
  await writeAuditLog({
    actor_user_id: deletedBy,
    role: 'SYSTEM',  // Will be overridden by caller
    enterprise_id: result.rows[0].enterprise_id,
    action: AUDIT_ACTIONS.SOFT_DELETE,
    target_type: TARGET_TYPES.USER,
    target_id: userId,
    success: true,
    reason: 'User soft deleted',
  });

  return result.rows[0];
}

/**
 * Check if a user is soft-deleted.
 */
export async function isUserDeleted(userId) {
  const result = await pool.query(
    'SELECT deleted_at FROM os_user_identities WHERE user_id = $1',
    [userId]
  );
  return result.rows[0]?.deleted_at !== null;
}

/**
 * Soft delete a workspace.
 */
export async function softDeleteWorkspace(workspaceId, deletedBy) {
  // Soft delete: deleted_at is the authoritative marker
  const result = await pool.query(
    `UPDATE workspaces
     SET deleted_at = NOW(), deleted_by = $2
     WHERE workspace_id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [workspaceId, deletedBy]
  );

  if (result.rows.length === 0) {
    throw new Error('Workspace not found or already deleted');
  }

  await writeAuditLog({
    actor_user_id: deletedBy,
    role: 'SYSTEM',
    enterprise_id: result.rows[0].enterprise_id,
    action: AUDIT_ACTIONS.SOFT_DELETE,
    target_type: TARGET_TYPES.WORKSPACE,
    target_id: workspaceId,
    success: true,
    reason: 'Workspace soft deleted',
  });

  return result.rows[0];
}

// ============================================================
// HARD PURGE
// ============================================================

/**
 * Start a purge job.
 *
 * @param {string} jobType - Type of purge ('user', 'bte_signals', 'workspace')
 * @param {string} initiatedBy - User initiating the purge
 * @param {boolean} dryRun - If true, only count records
 * @returns {Promise<Object>} Job record
 */
export async function startPurgeJob(jobType, initiatedBy, dryRun = true) {
  // Check master switch
  if (!dryRun && !(await isPurgeEnabled())) {
    throw new Error('Purge is disabled. Set purge_enabled=true in purge_config to enable.');
  }

  const result = await pool.query(
    `INSERT INTO purge_jobs (job_type, dry_run, initiated_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [jobType, dryRun, initiatedBy]
  );

  await writeAuditLog({
    actor_user_id: initiatedBy,
    role: 'SUPER_ADMIN',
    action: AUDIT_ACTIONS.PURGE_JOB_STARTED,
    target_type: TARGET_TYPES.SYSTEM,
    target_id: result.rows[0].job_id,
    success: true,
    metadata: { job_type: jobType, dry_run: dryRun },
  });

  return result.rows[0];
}

/**
 * Complete a purge job.
 */
export async function completePurgeJob(jobId, recordsProcessed, recordsPurged, status = 'COMPLETED', errorMessage = null) {
  const result = await pool.query(
    `UPDATE purge_jobs
     SET completed_at = NOW(), records_processed = $2, records_purged = $3, status = $4, error_message = $5
     WHERE job_id = $1
     RETURNING *`,
    [jobId, recordsProcessed, recordsPurged, status, errorMessage]
  );

  const job = result.rows[0];

  await writeAuditLog({
    actor_user_id: job.initiated_by,
    role: 'SUPER_ADMIN',
    action: AUDIT_ACTIONS.PURGE_JOB_COMPLETED,
    target_type: TARGET_TYPES.SYSTEM,
    target_id: jobId,
    success: status === 'COMPLETED' || status === 'DRY_RUN_COMPLETE',
    metadata: { records_processed: recordsProcessed, records_purged: recordsPurged, status },
  });

  return job;
}

/**
 * Hard purge users that have been soft-deleted beyond the retention window.
 *
 * CRITICAL: Only deletes os_user_identities, not business_events.
 *
 * @param {string} initiatedBy - User initiating the purge
 * @param {boolean} dryRun - If true, only count records
 * @returns {Promise<Object>} Purge result
 */
export async function purgeDeletedUsers(initiatedBy, dryRun = true) {
  const job = await startPurgeJob('user', initiatedBy, dryRun);
  const windowDays = await getSoftDeleteWindowDays();

  try {
    // Find eligible records
    const eligibleResult = await pool.query(
      `SELECT user_id, enterprise_id FROM os_user_identities
       WHERE deleted_at IS NOT NULL
       AND deleted_at < NOW() - ($1 || ' days')::INTERVAL`,
      [windowDays]
    );

    const eligible = eligibleResult.rows;
    const recordsProcessed = eligible.length;
    let recordsPurged = 0;

    if (!dryRun && recordsProcessed > 0) {
      // Hard delete the records
      const deleteResult = await pool.query(
        `DELETE FROM os_user_identities
         WHERE deleted_at IS NOT NULL
         AND deleted_at < NOW() - ($1 || ' days')::INTERVAL`,
        [windowDays]
      );
      recordsPurged = deleteResult.rowCount;
    }

    const status = dryRun ? 'DRY_RUN_COMPLETE' : 'COMPLETED';
    await completePurgeJob(job.job_id, recordsProcessed, recordsPurged, status);

    return {
      job_id: job.job_id,
      job_type: 'user',
      dry_run: dryRun,
      window_days: windowDays,
      records_processed: recordsProcessed,
      records_purged: recordsPurged,
      eligible_users: dryRun ? eligible.map(u => u.user_id) : [],
    };
  } catch (error) {
    await completePurgeJob(job.job_id, 0, 0, 'FAILED', error.message);
    throw error;
  }
}

/**
 * Purge BTE signals beyond retention period.
 *
 * SAFE: bte_signals are derived and can be recomputed from business_events.
 *
 * @param {string} initiatedBy - User initiating the purge
 * @param {boolean} dryRun - If true, only count records
 * @returns {Promise<Object>} Purge result
 */
export async function purgeBTESignals(initiatedBy, dryRun = true) {
  const job = await startPurgeJob('bte_signals', initiatedBy, dryRun);
  const retentionMonths = await getBTERetentionMonths();

  try {
    // Find eligible records
    const eligibleResult = await pool.query(
      `SELECT COUNT(*) as count FROM bte_signals
       WHERE created_at < NOW() - ($1 || ' months')::INTERVAL`,
      [retentionMonths]
    );

    const recordsProcessed = parseInt(eligibleResult.rows[0].count, 10);
    let recordsPurged = 0;

    if (!dryRun && recordsProcessed > 0) {
      // Hard delete the records
      const deleteResult = await pool.query(
        `DELETE FROM bte_signals
         WHERE created_at < NOW() - ($1 || ' months')::INTERVAL`,
        [retentionMonths]
      );
      recordsPurged = deleteResult.rowCount;
    }

    const status = dryRun ? 'DRY_RUN_COMPLETE' : 'COMPLETED';
    await completePurgeJob(job.job_id, recordsProcessed, recordsPurged, status);

    return {
      job_id: job.job_id,
      job_type: 'bte_signals',
      dry_run: dryRun,
      retention_months: retentionMonths,
      records_processed: recordsProcessed,
      records_purged: recordsPurged,
      message: 'BTE signals are derived and can be recomputed from business_events',
    };
  } catch (error) {
    await completePurgeJob(job.job_id, 0, 0, 'FAILED', error.message);
    throw error;
  }
}

// ============================================================
// VERIFICATION
// ============================================================

/**
 * Verify that business_events cannot be deleted.
 *
 * This is a safety check - should always throw.
 */
export async function verifyBusinessEventsProtection() {
  try {
    await pool.query('DELETE FROM business_events WHERE 1=0');
    // If we get here, trigger is missing
    return { protected: false, error: 'DELETE trigger missing' };
  } catch (error) {
    if (error.message.includes('IMMUTABLE')) {
      return { protected: true, message: 'business_events are protected' };
    }
    return { protected: false, error: error.message };
  }
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  getPurgeConfig,
  isPurgeEnabled,
  getSoftDeleteWindowDays,
  getBTERetentionMonths,
  softDeleteUser,
  isUserDeleted,
  softDeleteWorkspace,
  startPurgeJob,
  completePurgeJob,
  purgeDeletedUsers,
  purgeBTESignals,
  verifyBusinessEventsProtection,
};
