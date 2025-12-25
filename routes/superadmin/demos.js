/**
 * Super Admin Demo Controls APIs
 *
 * S264-F5: Demo Controls (Control, not execution)
 *
 * Super Admin CAN:
 * - View demo status
 * - Adjust demo thresholds (via bte_thresholds)
 * - Manually expire demos
 *
 * Super Admin CANNOT:
 * - Bypass system rules silently
 * - Extend demos without audit
 *
 * All actions are audited.
 */

import { Router } from 'express';
import {
  requireSuperAdmin,
  logSuperAdminAudit,
} from '../../middleware/superadmin-auth.js';
import { readQuery } from '../../services/bte/reader.js';
import pool from '../../server/db.js';

const router = Router();

// Apply Super Admin middleware to all routes
router.use(requireSuperAdmin);

// ============================================================
// LIST DEMOS
// ============================================================

/**
 * GET /api/os/superadmin/demos
 *
 * List all demo enterprises with their status.
 */
router.get('/', async (req, res) => {
  try {
    const demos = await readQuery(`
      SELECT
        e.enterprise_id,
        e.name,
        e.status,
        e.region,
        e.created_at,
        (SELECT COUNT(*) FROM workspaces w WHERE w.enterprise_id = e.enterprise_id) as workspace_count,
        (SELECT COUNT(*) FROM os_user_identities u WHERE u.enterprise_id = e.enterprise_id) as user_count
      FROM enterprises e
      WHERE e.type = 'DEMO'
      ORDER BY e.created_at DESC
    `);

    res.json({
      success: true,
      data: demos,
      meta: {
        total: demos.length,
        active: demos.filter(d => d.status === 'ACTIVE').length,
        suspended: demos.filter(d => d.status === 'SUSPENDED').length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[DEMOS_LIST_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to list demos.',
    });
  }
});

// ============================================================
// VIEW DEMO THRESHOLDS
// ============================================================

/**
 * GET /api/os/superadmin/demos/thresholds
 *
 * View all demo-related thresholds.
 */
router.get('/thresholds', async (req, res) => {
  try {
    const thresholds = await readQuery(`
      SELECT threshold_key, value, description, version, updated_at
      FROM bte_thresholds
      WHERE threshold_key LIKE 'demo_%'
      ORDER BY threshold_key
    `);

    res.json({
      success: true,
      data: thresholds,
      meta: {
        count: thresholds.length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[DEMO_THRESHOLDS_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to get demo thresholds.',
    });
  }
});

// ============================================================
// UPDATE DEMO THRESHOLD
// ============================================================

/**
 * PUT /api/os/superadmin/demos/thresholds/:threshold_key
 *
 * Update a demo threshold. Audited.
 */
router.put('/thresholds/:threshold_key', async (req, res) => {
  const { threshold_key } = req.params;
  const { value, description } = req.body;

  // Only allow demo-related thresholds
  if (!threshold_key.startsWith('demo_')) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Only demo_* thresholds can be updated via this endpoint.',
    });
  }

  if (value === undefined) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'value is required.',
    });
  }

  try {
    // Get current value for audit
    const current = await readQuery(`
      SELECT value, version FROM bte_thresholds WHERE threshold_key = $1
    `, [threshold_key]);

    const oldValue = current[0]?.value;
    const newVersion = (current[0]?.version || 0) + 1;

    const result = await pool.query(`
      UPDATE bte_thresholds
      SET value = $1, description = COALESCE($2, description),
          version = $3, updated_by = $4, updated_at = NOW()
      WHERE threshold_key = $5
      RETURNING threshold_key, value, description, version, updated_at
    `, [value, description, newVersion, req.superAdmin.user_id, threshold_key]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Threshold not found.',
      });
    }

    const threshold = result.rows[0];

    // Audit the change
    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: `/api/os/superadmin/demos/thresholds/${threshold_key}`,
      action: 'update_threshold',
      success: true,
      metadata: {
        threshold_key,
        old_value: oldValue,
        new_value: value,
        version: newVersion,
      },
    });

    res.json({
      success: true,
      data: threshold,
    });
  } catch (error) {
    console.error('[THRESHOLD_UPDATE_ERROR]', error);

    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: `/api/os/superadmin/demos/thresholds/${threshold_key}`,
      action: 'update_threshold',
      success: false,
      reason: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to update threshold.',
    });
  }
});

// ============================================================
// MANUALLY EXPIRE DEMO
// ============================================================

/**
 * POST /api/os/superadmin/demos/:enterprise_id/expire
 *
 * Manually expire a demo enterprise.
 * This is an explicit action, fully audited.
 */
router.post('/:enterprise_id/expire', async (req, res) => {
  const { enterprise_id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'reason is required for demo expiry.',
    });
  }

  try {
    // Verify it's a DEMO enterprise
    const enterprise = await readQuery(`
      SELECT enterprise_id, name, type, status
      FROM enterprises
      WHERE enterprise_id = $1
    `, [enterprise_id]);

    if (enterprise.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Enterprise not found.',
      });
    }

    if (enterprise[0].type !== 'DEMO') {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Only DEMO enterprises can be expired via this endpoint.',
      });
    }

    if (enterprise[0].status === 'DELETED') {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Enterprise is already deleted.',
      });
    }

    // Expire the demo (mark as SUSPENDED, not DELETED)
    const result = await pool.query(`
      UPDATE enterprises
      SET status = 'SUSPENDED'
      WHERE enterprise_id = $1
      RETURNING enterprise_id, name, status
    `, [enterprise_id]);

    // Expire all users in the enterprise
    await pool.query(`
      UPDATE os_user_identities
      SET status = 'EXPIRED'
      WHERE enterprise_id = $1
    `, [enterprise_id]);

    const expired = result.rows[0];

    // Audit the expiry
    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: `/api/os/superadmin/demos/${enterprise_id}/expire`,
      action: 'expire_demo',
      success: true,
      metadata: {
        enterprise_id,
        enterprise_name: expired.name,
        reason,
      },
    });

    res.json({
      success: true,
      data: {
        enterprise_id: expired.enterprise_id,
        name: expired.name,
        status: expired.status,
        expired_by: req.superAdmin.user_id,
        reason,
      },
      message: 'Demo expired successfully.',
    });
  } catch (error) {
    console.error('[DEMO_EXPIRE_ERROR]', error);

    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: `/api/os/superadmin/demos/${enterprise_id}/expire`,
      action: 'expire_demo',
      success: false,
      reason: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to expire demo.',
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

export default router;
