/**
 * Enterprise Admin Coaching & Performance APIs
 *
 * S265-F5: Coaching & Performance APIs
 *
 * Enterprise Admin SEES:
 * - Per-user behavioral signals (from BTE)
 * - Team aggregates
 * - Execution gaps
 * - Hesitation patterns
 *
 * Enterprise Admin does NOT see:
 * - Raw events
 * - Personas
 * - Other enterprises
 * - System thresholds
 *
 * All coaching insights come from BTE signals, not SIVA execution.
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
// TEAM PERFORMANCE OVERVIEW
// ============================================================

/**
 * GET /api/os/enterprise-admin/coaching/teams
 *
 * Get team-level performance aggregates.
 * All data from BTE signals.
 */
router.get('/teams', async (req, res) => {
  const enterpriseId = req.scopedEnterpriseId || req.enterpriseAdmin.enterprise_id;

  try {
    // Get all workspaces in the enterprise
    const workspaces = await readQuery(`
      SELECT workspace_id, sub_vertical_id
      FROM workspaces
      WHERE enterprise_id = $1 AND status = 'ACTIVE'
    `, [enterpriseId]);

    if (workspaces.length === 0) {
      return res.json({
        success: true,
        data: [],
        meta: {
          enterprise_id: enterpriseId,
          note: 'No active workspaces.',
        },
      });
    }

    // Group by sub_vertical_id (team)
    const teamWorkspaces = {};
    for (const w of workspaces) {
      if (!teamWorkspaces[w.sub_vertical_id]) {
        teamWorkspaces[w.sub_vertical_id] = [];
      }
      teamWorkspaces[w.sub_vertical_id].push(w.workspace_id);
    }

    // Get aggregate BTE signals per team
    const teamPerformance = [];

    for (const [teamId, workspaceIds] of Object.entries(teamWorkspaces)) {
      const signals = await readQuery(`
        SELECT signal_type, AVG(signal_value) as avg_value
        FROM bte_signals
        WHERE entity_type = 'workspace' AND entity_id = ANY($1)
        GROUP BY signal_type
      `, [workspaceIds]);

      const signalMap = {};
      for (const s of signals) {
        signalMap[s.signal_type] = parseFloat(s.avg_value).toFixed(2);
      }

      teamPerformance.push({
        team_id: teamId,
        workspace_count: workspaceIds.length,
        signals: {
          nba_adoption_rate: signalMap['nba_adoption_rate'] || '0',
          follow_through_rate: signalMap['follow_through_rate'] || '0',
          decision_latency_hours: signalMap['decision_latency'] || '0',
          idle_decay_days: signalMap['idle_decay'] || '0',
          hesitation_index: signalMap['hesitation_index'] || '0',
          execution_consistency: signalMap['execution_consistency'] || '0',
        },
        insights: generateTeamInsights(signalMap),
      });
    }

    res.json({
      success: true,
      data: teamPerformance,
      meta: {
        enterprise_id: enterpriseId,
        total_teams: teamPerformance.length,
        source: 'BTE signals',
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[TEAM_PERFORMANCE_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to get team performance.',
    });
  }
});

// ============================================================
// USER PERFORMANCE
// ============================================================

/**
 * GET /api/os/enterprise-admin/coaching/users
 *
 * Get per-user behavioral signals.
 * Scoped to enterprise. All data from BTE.
 */
router.get('/users', async (req, res) => {
  const enterpriseId = req.scopedEnterpriseId || req.enterpriseAdmin.enterprise_id;

  try {
    // Get all users and their workspaces
    const users = await readQuery(`
      SELECT
        u.user_id,
        u.workspace_id,
        u.sub_vertical_id,
        u.role,
        u.status
      FROM os_user_identities u
      WHERE u.enterprise_id = $1 AND u.status = 'ACTIVE'
    `, [enterpriseId]);

    if (users.length === 0) {
      return res.json({
        success: true,
        data: [],
        meta: { enterprise_id: enterpriseId, note: 'No active users.' },
      });
    }

    // Get BTE signals for each user's workspace
    const workspaceIds = [...new Set(users.map(u => u.workspace_id))];

    const allSignals = await readQuery(`
      SELECT entity_id as workspace_id, signal_type, signal_value
      FROM bte_signals
      WHERE entity_type = 'workspace' AND entity_id = ANY($1)
    `, [workspaceIds]);

    // Index signals by workspace
    const signalsByWorkspace = {};
    for (const s of allSignals) {
      if (!signalsByWorkspace[s.workspace_id]) {
        signalsByWorkspace[s.workspace_id] = {};
      }
      signalsByWorkspace[s.workspace_id][s.signal_type] = parseFloat(s.signal_value);
    }

    // Build user performance data
    const userPerformance = users.map(u => {
      const signals = signalsByWorkspace[u.workspace_id] || {};
      return {
        user_id: u.user_id,
        team_id: u.sub_vertical_id,
        role: u.role,
        signals: {
          nba_adoption_rate: (signals['nba_adoption_rate'] || 0).toFixed(2),
          follow_through_rate: (signals['follow_through_rate'] || 0).toFixed(2),
          decision_latency_hours: (signals['decision_latency'] || 0).toFixed(2),
          hesitation_index: (signals['hesitation_index'] || 0).toFixed(2),
        },
        coaching_flags: generateCoachingFlags(signals),
      };
    });

    res.json({
      success: true,
      data: userPerformance,
      meta: {
        enterprise_id: enterpriseId,
        total_users: userPerformance.length,
        source: 'BTE signals',
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[USER_PERFORMANCE_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to get user performance.',
    });
  }
});

// ============================================================
// EXECUTION GAPS
// ============================================================

/**
 * GET /api/os/enterprise-admin/coaching/execution-gaps
 *
 * Get execution gaps across the enterprise.
 * Shows where users are struggling.
 */
router.get('/execution-gaps', async (req, res) => {
  const enterpriseId = req.scopedEnterpriseId || req.enterpriseAdmin.enterprise_id;

  try {
    // Get workspaces
    const workspaces = await readQuery(`
      SELECT workspace_id, sub_vertical_id
      FROM workspaces
      WHERE enterprise_id = $1 AND status = 'ACTIVE'
    `, [enterpriseId]);

    if (workspaces.length === 0) {
      return res.json({
        success: true,
        data: { gaps: [] },
        meta: { enterprise_id: enterpriseId },
      });
    }

    const workspaceIds = workspaces.map(w => w.workspace_id);

    // Get execution-related signals
    const signals = await readQuery(`
      SELECT
        signal_type,
        entity_id as workspace_id,
        signal_value
      FROM bte_signals
      WHERE entity_type = 'workspace'
        AND entity_id = ANY($1)
        AND signal_type IN ('execution_gap', 'missed_opportunity_count', 'drop_off_point', 'follow_through_rate')
    `, [workspaceIds]);

    // Identify gaps
    const gaps = [];

    // Low follow-through
    const lowFollowThrough = signals.filter(
      s => s.signal_type === 'follow_through_rate' && parseFloat(s.signal_value) < 0.5
    );
    if (lowFollowThrough.length > 0) {
      gaps.push({
        type: 'LOW_FOLLOW_THROUGH',
        severity: 'HIGH',
        affected_workspaces: lowFollowThrough.length,
        insight: 'Users are starting but not completing workflows.',
        recommendation: 'Focus on reducing friction in workflow completion.',
      });
    }

    // High execution gap
    const highExecutionGap = signals.filter(
      s => s.signal_type === 'execution_gap' && parseFloat(s.signal_value) > 24
    );
    if (highExecutionGap.length > 0) {
      gaps.push({
        type: 'DELAYED_EXECUTION',
        severity: 'MEDIUM',
        affected_workspaces: highExecutionGap.length,
        insight: 'Users are taking too long to act on recommendations.',
        recommendation: 'Review if recommendations are timely and relevant.',
      });
    }

    // Missed opportunities
    const missedOpps = signals.filter(
      s => s.signal_type === 'missed_opportunity_count' && parseFloat(s.signal_value) > 3
    );
    if (missedOpps.length > 0) {
      gaps.push({
        type: 'MISSED_OPPORTUNITIES',
        severity: 'HIGH',
        affected_workspaces: missedOpps.length,
        insight: 'Users are ignoring recommendations that later proved valuable.',
        recommendation: 'Coach on trusting and acting on NBA recommendations.',
      });
    }

    res.json({
      success: true,
      data: { gaps },
      meta: {
        enterprise_id: enterpriseId,
        total_workspaces: workspaceIds.length,
        gap_count: gaps.length,
        source: 'BTE signals',
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[EXECUTION_GAPS_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to get execution gaps.',
    });
  }
});

// ============================================================
// HESITATION PATTERNS
// ============================================================

/**
 * GET /api/os/enterprise-admin/coaching/hesitation
 *
 * Get hesitation patterns across the enterprise.
 */
router.get('/hesitation', async (req, res) => {
  const enterpriseId = req.scopedEnterpriseId || req.enterpriseAdmin.enterprise_id;

  try {
    const workspaces = await readQuery(`
      SELECT workspace_id, sub_vertical_id
      FROM workspaces
      WHERE enterprise_id = $1 AND status = 'ACTIVE'
    `, [enterpriseId]);

    if (workspaces.length === 0) {
      return res.json({
        success: true,
        data: { patterns: [] },
        meta: { enterprise_id: enterpriseId },
      });
    }

    const workspaceIds = workspaces.map(w => w.workspace_id);

    // Get hesitation-related signals
    const signals = await readQuery(`
      SELECT
        entity_id as workspace_id,
        signal_value
      FROM bte_signals
      WHERE entity_type = 'workspace'
        AND entity_id = ANY($1)
        AND signal_type = 'hesitation_index'
    `, [workspaceIds]);

    // Categorize by hesitation level
    const high = signals.filter(s => parseFloat(s.signal_value) > 0.4);
    const medium = signals.filter(s => parseFloat(s.signal_value) > 0.2 && parseFloat(s.signal_value) <= 0.4);
    const low = signals.filter(s => parseFloat(s.signal_value) <= 0.2);

    const patterns = [];

    if (high.length > 0) {
      patterns.push({
        level: 'HIGH',
        workspace_count: high.length,
        insight: 'These users frequently cancel or undo actions, indicating uncertainty.',
        recommendation: 'Provide more decision support and clearer guidance.',
      });
    }

    if (medium.length > 0) {
      patterns.push({
        level: 'MEDIUM',
        workspace_count: medium.length,
        insight: 'Moderate hesitation - users occasionally second-guess decisions.',
        recommendation: 'Monitor for improvement opportunities.',
      });
    }

    res.json({
      success: true,
      data: {
        patterns,
        summary: {
          high_hesitation: high.length,
          medium_hesitation: medium.length,
          low_hesitation: low.length,
        },
      },
      meta: {
        enterprise_id: enterpriseId,
        total_workspaces: workspaceIds.length,
        source: 'BTE signals',
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[HESITATION_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to get hesitation patterns.',
    });
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function generateTeamInsights(signals) {
  const insights = [];

  if (parseFloat(signals['nba_adoption_rate'] || 0) < 0.5) {
    insights.push('Team has low NBA adoption - may need training.');
  }
  if (parseFloat(signals['idle_decay'] || 0) > 5) {
    insights.push('Team showing inactivity - check for blockers.');
  }
  if (parseFloat(signals['hesitation_index'] || 0) > 0.3) {
    insights.push('Team shows hesitation patterns - review decision support.');
  }
  if (parseFloat(signals['follow_through_rate'] || 0) < 0.5) {
    insights.push('Low follow-through - workflows may be too complex.');
  }

  return insights.length > 0 ? insights : ['Team performing within normal parameters.'];
}

function generateCoachingFlags(signals) {
  const flags = [];

  if (parseFloat(signals['nba_adoption_rate'] || 0) < 0.3) {
    flags.push('NEEDS_NBA_COACHING');
  }
  if (parseFloat(signals['hesitation_index'] || 0) > 0.4) {
    flags.push('HIGH_HESITATION');
  }
  if (parseFloat(signals['follow_through_rate'] || 0) < 0.4) {
    flags.push('LOW_COMPLETION');
  }
  if (parseFloat(signals['decision_latency'] || 0) > 48) {
    flags.push('SLOW_DECISIONS');
  }

  return flags;
}

// ============================================================
// EXPORT
// ============================================================

export default router;
