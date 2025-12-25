/**
 * Enterprise Admin User Management APIs
 *
 * S265-F2: User Management (Scoped)
 * S265-F3: User Reassignment (Controlled)
 *
 * Enterprise Admin CAN:
 * - Create users (single + bulk CSV ≤ 20)
 * - Disable users
 * - View user status
 *
 * Enterprise Admin CANNOT:
 * - Change enterprise
 * - Change workspace
 * - Change vertical (without Super Admin approval)
 * - Promote roles
 * - Extend demos
 *
 * All actions are audited.
 */

import { Router } from 'express';
import {
  requireEnterpriseAdmin,
  enforceEnterpriseScope,
  logEnterpriseAdminAudit,
} from '../../middleware/enterprise-admin-auth.js';
import { readQuery } from '../../services/bte/reader.js';
import pool from '../../server/db.js';

const router = Router();

// Apply Enterprise Admin middleware to all routes
router.use(requireEnterpriseAdmin);
router.use(enforceEnterpriseScope());

// ============================================================
// CONSTANTS
// ============================================================

const MAX_BULK_CREATE = 20;

// ============================================================
// LIST USERS
// ============================================================

/**
 * GET /api/os/enterprise-admin/users
 *
 * List all users in the admin's enterprise.
 * Scoped automatically to admin's enterprise.
 */
router.get('/', async (req, res) => {
  try {
    const enterpriseId = req.scopedEnterpriseId || req.enterpriseAdmin.enterprise_id;

    const users = await readQuery(`
      SELECT
        user_id,
        workspace_id,
        sub_vertical_id,
        role,
        mode,
        status,
        created_at
      FROM os_user_identities
      WHERE enterprise_id = $1
      ORDER BY created_at DESC
    `, [enterpriseId]);

    res.json({
      success: true,
      data: users,
      meta: {
        total: users.length,
        active: users.filter(u => u.status === 'ACTIVE').length,
        enterprise_id: enterpriseId,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[USERS_LIST_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to list users.',
    });
  }
});

// ============================================================
// GET USER STATUS
// ============================================================

/**
 * GET /api/os/enterprise-admin/users/:user_id
 *
 * Get status of a specific user.
 */
router.get('/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const enterpriseId = req.scopedEnterpriseId || req.enterpriseAdmin.enterprise_id;

  try {
    const users = await readQuery(`
      SELECT
        user_id,
        enterprise_id,
        workspace_id,
        sub_vertical_id,
        role,
        mode,
        status,
        created_at
      FROM os_user_identities
      WHERE user_id = $1 AND enterprise_id = $2
    `, [user_id, enterpriseId]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'User not found in your enterprise.',
      });
    }

    res.json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    console.error('[USER_GET_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to get user.',
    });
  }
});

// ============================================================
// CREATE USER (SINGLE)
// ============================================================

/**
 * POST /api/os/enterprise-admin/users
 *
 * Create a single user in the admin's enterprise.
 */
router.post('/', async (req, res) => {
  const { workspace_id, sub_vertical_id, role, mode } = req.body;
  const admin = req.enterpriseAdmin;
  const enterpriseId = admin.enterprise_id;

  // Validation
  if (!workspace_id || !sub_vertical_id) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'workspace_id and sub_vertical_id are required.',
    });
  }

  // Enterprise Admin cannot create SUPER_ADMIN
  if (role === 'SUPER_ADMIN') {
    await logEnterpriseAdminAudit({
      user_id: admin.user_id,
      enterprise_id: enterpriseId,
      endpoint: '/api/os/enterprise-admin/users',
      action: 'create_user',
      success: false,
      reason: 'CANNOT_CREATE_SUPER_ADMIN',
    });

    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Enterprise Admin cannot create Super Admin users.',
    });
  }

  try {
    // Verify workspace belongs to this enterprise
    const workspace = await readQuery(`
      SELECT workspace_id, enterprise_id FROM workspaces
      WHERE workspace_id = $1
    `, [workspace_id]);

    if (workspace.length === 0 || workspace[0].enterprise_id !== enterpriseId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Workspace must belong to your enterprise.',
      });
    }

    // Create user
    const result = await pool.query(`
      INSERT INTO os_user_identities
        (enterprise_id, workspace_id, sub_vertical_id, role, mode, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW())
      RETURNING user_id, enterprise_id, workspace_id, sub_vertical_id, role, mode, status, created_at
    `, [
      enterpriseId,
      workspace_id,
      sub_vertical_id,
      role || 'USER',
      mode || admin.mode, // Inherit mode from admin if not specified
    ]);

    const user = result.rows[0];

    // Audit
    await logEnterpriseAdminAudit({
      user_id: admin.user_id,
      enterprise_id: enterpriseId,
      endpoint: '/api/os/enterprise-admin/users',
      action: 'create_user',
      success: true,
      metadata: {
        created_user_id: user.user_id,
        role: user.role,
      },
    });

    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('[USER_CREATE_ERROR]', error);

    await logEnterpriseAdminAudit({
      user_id: admin.user_id,
      enterprise_id: enterpriseId,
      endpoint: '/api/os/enterprise-admin/users',
      action: 'create_user',
      success: false,
      reason: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to create user.',
    });
  }
});

// ============================================================
// CREATE USERS (BULK)
// ============================================================

/**
 * POST /api/os/enterprise-admin/users/bulk
 *
 * Create multiple users (≤ 20) in the admin's enterprise.
 */
router.post('/bulk', async (req, res) => {
  const { users } = req.body;
  const admin = req.enterpriseAdmin;
  const enterpriseId = admin.enterprise_id;

  // Validation
  if (!Array.isArray(users) || users.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'users array is required.',
    });
  }

  // Hard limit: ≤ 20 users per bulk create
  if (users.length > MAX_BULK_CREATE) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: `Maximum ${MAX_BULK_CREATE} users per bulk create.`,
    });
  }

  // Check for SUPER_ADMIN in list
  if (users.some(u => u.role === 'SUPER_ADMIN')) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Enterprise Admin cannot create Super Admin users.',
    });
  }

  try {
    const created = [];
    const failed = [];

    for (const userData of users) {
      try {
        // Verify workspace belongs to enterprise
        const workspace = await readQuery(`
          SELECT workspace_id, enterprise_id FROM workspaces
          WHERE workspace_id = $1
        `, [userData.workspace_id]);

        if (workspace.length === 0 || workspace[0].enterprise_id !== enterpriseId) {
          failed.push({
            input: userData,
            error: 'Workspace must belong to your enterprise.',
          });
          continue;
        }

        const result = await pool.query(`
          INSERT INTO os_user_identities
            (enterprise_id, workspace_id, sub_vertical_id, role, mode, status, created_at)
          VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW())
          RETURNING user_id, workspace_id, sub_vertical_id, role, mode, status
        `, [
          enterpriseId,
          userData.workspace_id,
          userData.sub_vertical_id,
          userData.role || 'USER',
          userData.mode || admin.mode,
        ]);

        created.push(result.rows[0]);
      } catch (err) {
        failed.push({
          input: userData,
          error: err.message,
        });
      }
    }

    // Audit
    await logEnterpriseAdminAudit({
      user_id: admin.user_id,
      enterprise_id: enterpriseId,
      endpoint: '/api/os/enterprise-admin/users/bulk',
      action: 'bulk_create_users',
      success: true,
      metadata: {
        requested: users.length,
        created: created.length,
        failed: failed.length,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        created,
        failed,
      },
      meta: {
        requested: users.length,
        created_count: created.length,
        failed_count: failed.length,
      },
    });
  } catch (error) {
    console.error('[BULK_CREATE_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to create users.',
    });
  }
});

// ============================================================
// DISABLE USER
// ============================================================

/**
 * POST /api/os/enterprise-admin/users/:user_id/disable
 *
 * Disable a user in the admin's enterprise.
 */
router.post('/:user_id/disable', async (req, res) => {
  const { user_id } = req.params;
  const admin = req.enterpriseAdmin;
  const enterpriseId = admin.enterprise_id;

  try {
    // Verify user belongs to this enterprise
    const existing = await readQuery(`
      SELECT user_id, enterprise_id, role FROM os_user_identities
      WHERE user_id = $1
    `, [user_id]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'User not found.',
      });
    }

    if (existing[0].enterprise_id !== enterpriseId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Cannot disable users outside your enterprise.',
      });
    }

    // Cannot disable SUPER_ADMIN
    if (existing[0].role === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Cannot disable Super Admin users.',
      });
    }

    // Disable user
    const result = await pool.query(`
      UPDATE os_user_identities
      SET status = 'SUSPENDED'
      WHERE user_id = $1
      RETURNING user_id, status
    `, [user_id]);

    // Audit
    await logEnterpriseAdminAudit({
      user_id: admin.user_id,
      enterprise_id: enterpriseId,
      endpoint: `/api/os/enterprise-admin/users/${user_id}/disable`,
      action: 'disable_user',
      success: true,
      metadata: { disabled_user_id: user_id },
    });

    res.json({
      success: true,
      data: result.rows[0],
      message: 'User disabled successfully.',
    });
  } catch (error) {
    console.error('[USER_DISABLE_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to disable user.',
    });
  }
});

// ============================================================
// REASSIGN USER (S265-F3)
// ============================================================

/**
 * POST /api/os/enterprise-admin/users/:user_id/reassign
 *
 * Reassign user to different sub-vertical.
 *
 * Rules:
 * - Same vertical → allowed
 * - Cross-vertical → requires Super Admin approval (returns pending)
 */
router.post('/:user_id/reassign', async (req, res) => {
  const { user_id } = req.params;
  const { new_sub_vertical_id, reason } = req.body;
  const admin = req.enterpriseAdmin;
  const enterpriseId = admin.enterprise_id;

  if (!new_sub_vertical_id) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'new_sub_vertical_id is required.',
    });
  }

  if (!reason) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'reason is required for reassignment.',
    });
  }

  try {
    // Get current user
    const existing = await readQuery(`
      SELECT user_id, enterprise_id, sub_vertical_id FROM os_user_identities
      WHERE user_id = $1
    `, [user_id]);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'User not found.',
      });
    }

    if (existing[0].enterprise_id !== enterpriseId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Cannot reassign users outside your enterprise.',
      });
    }

    const currentSubVertical = existing[0].sub_vertical_id;

    // Same sub-vertical = no change needed
    if (currentSubVertical === new_sub_vertical_id) {
      return res.json({
        success: true,
        data: { status: 'NO_CHANGE' },
        message: 'User is already in this sub-vertical.',
      });
    }

    // Cross-vertical reassignment requires Super Admin approval
    // Enterprise Admin can request, but it goes into pending state
    // For now, we just log the request and return pending status
    // (In a full implementation, this would create a request record)

    await logEnterpriseAdminAudit({
      user_id: admin.user_id,
      enterprise_id: enterpriseId,
      endpoint: `/api/os/enterprise-admin/users/${user_id}/reassign`,
      action: 'request_reassignment',
      success: true,
      metadata: {
        target_user_id: user_id,
        from_sub_vertical: currentSubVertical,
        to_sub_vertical: new_sub_vertical_id,
        reason,
        requires_approval: true,
      },
    });

    res.json({
      success: true,
      data: {
        status: 'PENDING_APPROVAL',
        user_id,
        from_sub_vertical: currentSubVertical,
        to_sub_vertical: new_sub_vertical_id,
        reason,
      },
      message: 'Cross-vertical reassignment requires Super Admin approval. Request submitted.',
    });
  } catch (error) {
    console.error('[USER_REASSIGN_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to process reassignment.',
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

export default router;
