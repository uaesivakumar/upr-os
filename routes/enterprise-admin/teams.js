/**
 * Enterprise Admin Team APIs
 *
 * S265-F4: Team Definition (LOCKED)
 *
 * CRITICAL RULES:
 * - Team = sub_vertical_id
 * - No custom teams
 * - No managers
 * - No hierarchy
 *
 * This is intentional. Teams are implicit groupings by sub-vertical.
 */

import { Router } from 'express';
import {
  requireEnterpriseAdmin,
  enforceEnterpriseScope,
} from '../../middleware/enterprise-admin-auth.js';
import { readQuery } from '../../services/bte/reader.js';

const router = Router();

// Apply Enterprise Admin middleware
router.use(requireEnterpriseAdmin);
router.use(enforceEnterpriseScope());

// ============================================================
// LIST TEAMS (SUB-VERTICALS)
// ============================================================

/**
 * GET /api/os/enterprise-admin/teams
 *
 * List teams (sub-verticals) with user counts.
 * Team = sub_vertical_id. No custom teams.
 */
router.get('/', async (req, res) => {
  const enterpriseId = req.scopedEnterpriseId || req.enterpriseAdmin.enterprise_id;

  try {
    // Get distinct sub-verticals with user counts
    const teams = await readQuery(`
      SELECT
        sub_vertical_id as team_id,
        COUNT(*) as user_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE') as active_users,
        COUNT(*) FILTER (WHERE role = 'ENTERPRISE_ADMIN') as admin_count
      FROM os_user_identities
      WHERE enterprise_id = $1
      GROUP BY sub_vertical_id
      ORDER BY user_count DESC
    `, [enterpriseId]);

    res.json({
      success: true,
      data: teams.map(t => ({
        team_id: t.team_id,
        type: 'sub_vertical', // Team = sub_vertical (locked)
        user_count: parseInt(t.user_count),
        active_users: parseInt(t.active_users),
        admin_count: parseInt(t.admin_count),
      })),
      meta: {
        total_teams: teams.length,
        enterprise_id: enterpriseId,
        note: 'Team = sub_vertical_id. No custom teams.',
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[TEAMS_LIST_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to list teams.',
    });
  }
});

// ============================================================
// GET TEAM DETAILS
// ============================================================

/**
 * GET /api/os/enterprise-admin/teams/:team_id
 *
 * Get details of a specific team (sub-vertical).
 */
router.get('/:team_id', async (req, res) => {
  const { team_id } = req.params;
  const enterpriseId = req.scopedEnterpriseId || req.enterpriseAdmin.enterprise_id;

  try {
    // Get users in this team
    const users = await readQuery(`
      SELECT
        user_id,
        workspace_id,
        role,
        mode,
        status,
        created_at
      FROM os_user_identities
      WHERE enterprise_id = $1 AND sub_vertical_id = $2
      ORDER BY created_at DESC
    `, [enterpriseId, team_id]);

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Team not found or has no users.',
      });
    }

    res.json({
      success: true,
      data: {
        team_id,
        type: 'sub_vertical',
        users: users.map(u => ({
          user_id: u.user_id,
          workspace_id: u.workspace_id,
          role: u.role,
          status: u.status,
        })),
      },
      meta: {
        total_users: users.length,
        active_users: users.filter(u => u.status === 'ACTIVE').length,
      },
    });
  } catch (error) {
    console.error('[TEAM_GET_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to get team.',
    });
  }
});

// ============================================================
// BLOCK CUSTOM TEAM CREATION
// ============================================================

/**
 * POST /api/os/enterprise-admin/teams
 *
 * BLOCKED. No custom teams allowed.
 */
router.post('/', (req, res) => {
  res.status(403).json({
    success: false,
    error: 'FORBIDDEN',
    message: 'Custom teams are not supported. Team = sub_vertical_id.',
  });
});

/**
 * PUT /api/os/enterprise-admin/teams/:team_id
 *
 * BLOCKED. Teams cannot be modified.
 */
router.put('/:team_id', (req, res) => {
  res.status(403).json({
    success: false,
    error: 'FORBIDDEN',
    message: 'Teams cannot be modified. Team = sub_vertical_id.',
  });
});

/**
 * DELETE /api/os/enterprise-admin/teams/:team_id
 *
 * BLOCKED. Teams cannot be deleted.
 */
router.delete('/:team_id', (req, res) => {
  res.status(403).json({
    success: false,
    error: 'FORBIDDEN',
    message: 'Teams cannot be deleted. Team = sub_vertical_id.',
  });
});

// ============================================================
// EXPORT
// ============================================================

export default router;
