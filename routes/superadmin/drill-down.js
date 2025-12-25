/**
 * Super Admin Drill-Down APIs
 *
 * S264-F3: Explicit Drill-Down (Audited)
 *
 * RULES:
 * - Requires explicit ?intent=investigate
 * - Audit log entry for every access
 * - Manual access only, never auto-loaded
 *
 * This protects trust and future compliance.
 */

import { Router } from 'express';
import {
  requireSuperAdmin,
  requireDrillDownIntent,
  logSuperAdminAudit,
} from '../../middleware/superadmin-auth.js';
import { readQuery } from '../../services/bte/reader.js';

const router = Router();

// Apply Super Admin middleware to all routes
router.use(requireSuperAdmin);

// ============================================================
// ENTERPRISE DRILL-DOWN
// ============================================================

/**
 * GET /api/os/superadmin/drill-down/enterprise/:enterprise_id
 *
 * Drill down into specific enterprise details.
 * Requires ?intent=investigate
 */
router.get(
  '/enterprise/:enterprise_id',
  requireDrillDownIntent,
  async (req, res) => {
    const { enterprise_id } = req.params;

    try {
      // Get enterprise details
      const enterprise = await readQuery(`
        SELECT enterprise_id, name, type, status, region, created_at
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

      // Get workspaces
      const workspaces = await readQuery(`
        SELECT workspace_id, name, sub_vertical_id, status, created_at
        FROM workspaces
        WHERE enterprise_id = $1
      `, [enterprise_id]);

      // Get user counts by role (aggregate, not individual users)
      const userCounts = await readQuery(`
        SELECT role, COUNT(*) as count
        FROM os_user_identities
        WHERE enterprise_id = $1
        GROUP BY role
      `, [enterprise_id]);

      // Get BTE signals for all workspaces (aggregate)
      const workspaceIds = workspaces.map(w => w.workspace_id);
      let signals = [];

      if (workspaceIds.length > 0) {
        signals = await readQuery(`
          SELECT signal_type, AVG(signal_value) as avg_value
          FROM bte_signals
          WHERE entity_type = 'workspace' AND entity_id = ANY($1)
          GROUP BY signal_type
        `, [workspaceIds]);
      }

      res.json({
        success: true,
        data: {
          enterprise: enterprise[0],
          workspaces: workspaces.map(w => ({
            workspace_id: w.workspace_id,
            name: w.name,
            status: w.status,
          })),
          user_summary: userCounts.reduce((acc, u) => {
            acc[u.role] = parseInt(u.count);
            return acc;
          }, {}),
          signals: signals.reduce((acc, s) => {
            acc[s.signal_type] = parseFloat(s.avg_value).toFixed(2);
            return acc;
          }, {}),
        },
        meta: {
          access_type: 'drill_down',
          accessed_by: req.superAdmin.user_id,
          accessed_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('[DRILL_DOWN_ENTERPRISE_ERROR]', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get enterprise details.',
      });
    }
  }
);

// ============================================================
// WORKSPACE DRILL-DOWN
// ============================================================

/**
 * GET /api/os/superadmin/drill-down/workspace/:workspace_id
 *
 * Drill down into specific workspace details.
 * Requires ?intent=investigate
 */
router.get(
  '/workspace/:workspace_id',
  requireDrillDownIntent,
  async (req, res) => {
    const { workspace_id } = req.params;

    try {
      // Get workspace details
      const workspace = await readQuery(`
        SELECT
          w.workspace_id,
          w.name,
          w.sub_vertical_id,
          w.status,
          w.created_at,
          e.enterprise_id,
          e.name as enterprise_name
        FROM workspaces w
        JOIN enterprises e ON w.enterprise_id = e.enterprise_id
        WHERE w.workspace_id = $1
      `, [workspace_id]);

      if (workspace.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Workspace not found.',
        });
      }

      // Get user count (not individual users)
      const userCount = await readQuery(`
        SELECT COUNT(*) as count
        FROM os_user_identities
        WHERE workspace_id = $1
      `, [workspace_id]);

      // Get all BTE signals for this workspace
      const signals = await readQuery(`
        SELECT signal_type, signal_value, computed_at
        FROM bte_signals
        WHERE entity_type = 'workspace' AND entity_id = $1
        ORDER BY signal_type
      `, [workspace_id]);

      // Get workspace state
      const state = await readQuery(`
        SELECT current_sales_stage, pending_actions, last_action_taken_at, updated_at
        FROM workspace_state
        WHERE workspace_id = $1
      `, [workspace_id]);

      res.json({
        success: true,
        data: {
          workspace: workspace[0],
          user_count: parseInt(userCount[0]?.count || 0),
          signals: signals.reduce((acc, s) => {
            acc[s.signal_type] = {
              value: parseFloat(s.signal_value),
              computed_at: s.computed_at,
            };
            return acc;
          }, {}),
          state: state[0] || null,
        },
        meta: {
          access_type: 'drill_down',
          accessed_by: req.superAdmin.user_id,
          accessed_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('[DRILL_DOWN_WORKSPACE_ERROR]', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get workspace details.',
      });
    }
  }
);

// ============================================================
// EXPORT
// ============================================================

export default router;
