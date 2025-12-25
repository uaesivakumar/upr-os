/**
 * Super Admin Intelligence APIs
 *
 * S264-F2: Read-Only Intelligence APIs (OS)
 *
 * NON-NEGOTIABLE PRINCIPLES:
 * - Super Admin sees DECISIONS, not dashboards
 * - Everything is aggregate-first
 * - BTE is the sole source of behavioral insight
 * - No raw logs
 * - No per-user drill-down by default
 *
 * Endpoints:
 * - GET /api/os/superadmin/enterprises/health
 * - GET /api/os/superadmin/demos/risk
 * - GET /api/os/superadmin/product/friction
 */

import { Router } from 'express';
import { requireSuperAdmin } from '../../middleware/superadmin-auth.js';
import { readQuery } from '../../services/bte/reader.js';

const router = Router();

// Apply Super Admin middleware to all routes
router.use(requireSuperAdmin);

// ============================================================
// ENTERPRISE HEALTH API
// ============================================================

/**
 * GET /api/os/superadmin/enterprises/health
 *
 * Returns aggregate enterprise health based on BTE signals.
 *
 * Response:
 * - enterprise_id
 * - health_state: GREEN / YELLOW / RED
 * - top 2 behavioral drivers (from BTE)
 * - demo vs real
 * - churn_risk flag (heuristic)
 */
router.get('/enterprises/health', async (req, res) => {
  try {
    // Get all enterprises with their BTE signals
    const enterprises = await readQuery(`
      SELECT
        e.enterprise_id,
        e.name,
        e.type,
        e.status,
        e.region
      FROM enterprises e
      WHERE e.status != 'DELETED'
      ORDER BY e.created_at DESC
    `);

    // For each enterprise, compute health from BTE signals
    const healthData = [];

    for (const enterprise of enterprises) {
      // Get workspaces for this enterprise
      const workspaces = await readQuery(`
        SELECT workspace_id FROM workspaces
        WHERE enterprise_id = $1 AND status = 'ACTIVE'
      `, [enterprise.enterprise_id]);

      if (workspaces.length === 0) {
        healthData.push({
          enterprise_id: enterprise.enterprise_id,
          name: enterprise.name,
          type: enterprise.type,
          health_state: 'YELLOW',
          behavioral_drivers: ['no_workspaces', 'setup_incomplete'],
          churn_risk: false,
        });
        continue;
      }

      // Aggregate BTE signals across all workspaces
      const workspaceIds = workspaces.map(w => w.workspace_id);

      const signals = await readQuery(`
        SELECT signal_type, AVG(signal_value) as avg_value
        FROM bte_signals
        WHERE entity_type = 'workspace'
          AND entity_id = ANY($1)
        GROUP BY signal_type
      `, [workspaceIds]);

      // Compute health state from signals
      const signalMap = {};
      for (const s of signals) {
        signalMap[s.signal_type] = parseFloat(s.avg_value);
      }

      const healthState = computeHealthState(signalMap);
      const drivers = computeTopDrivers(signalMap);
      const churnRisk = computeChurnRisk(signalMap, enterprise.type);

      healthData.push({
        enterprise_id: enterprise.enterprise_id,
        name: enterprise.name,
        type: enterprise.type,
        health_state: healthState,
        behavioral_drivers: drivers,
        churn_risk: churnRisk,
      });
    }

    res.json({
      success: true,
      data: healthData,
      meta: {
        total_enterprises: healthData.length,
        healthy: healthData.filter(e => e.health_state === 'GREEN').length,
        at_risk: healthData.filter(e => e.health_state === 'RED').length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[ENTERPRISE_HEALTH_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to compute enterprise health.',
    });
  }
});

// ============================================================
// DEMO RISK API
// ============================================================

/**
 * GET /api/os/superadmin/demos/risk
 *
 * Returns demo accounts at risk of expiry or showing misuse patterns.
 *
 * Response:
 * - demos likely to expire
 * - demos showing extraction patterns
 * - inactivity-based flags
 */
router.get('/demos/risk', async (req, res) => {
  try {
    // Get all DEMO enterprises
    const demos = await readQuery(`
      SELECT
        e.enterprise_id,
        e.name,
        e.created_at,
        e.region
      FROM enterprises e
      WHERE e.type = 'DEMO' AND e.status = 'ACTIVE'
      ORDER BY e.created_at DESC
    `);

    // Get thresholds
    const thresholds = await readQuery(`
      SELECT threshold_key, value FROM bte_thresholds
      WHERE threshold_key IN ('demo_inactivity_expire_days', 'demo_nba_ignore_expire_rate')
    `);

    const thresholdMap = {};
    for (const t of thresholds) {
      thresholdMap[t.threshold_key] = parseFloat(t.value);
    }

    const inactivityDays = thresholdMap['demo_inactivity_expire_days'] || 14;
    const ignoreRate = thresholdMap['demo_nba_ignore_expire_rate'] || 0.8;

    const riskData = [];

    for (const demo of demos) {
      // Get workspaces for this demo
      const workspaces = await readQuery(`
        SELECT workspace_id FROM workspaces
        WHERE enterprise_id = $1 AND status = 'ACTIVE'
      `, [demo.enterprise_id]);

      if (workspaces.length === 0) {
        riskData.push({
          enterprise_id: demo.enterprise_id,
          name: demo.name,
          risk_level: 'HIGH',
          risk_flags: ['no_workspaces', 'setup_incomplete'],
          days_since_creation: daysSince(demo.created_at),
          expiry_likely: true,
        });
        continue;
      }

      const workspaceIds = workspaces.map(w => w.workspace_id);

      // Get BTE signals
      const signals = await readQuery(`
        SELECT signal_type, AVG(signal_value) as avg_value
        FROM bte_signals
        WHERE entity_type = 'workspace'
          AND entity_id = ANY($1)
        GROUP BY signal_type
      `, [workspaceIds]);

      const signalMap = {};
      for (const s of signals) {
        signalMap[s.signal_type] = parseFloat(s.avg_value);
      }

      // Compute risk factors
      const riskFlags = [];
      let riskLevel = 'LOW';

      // Check idle decay
      const idleDecay = signalMap['idle_decay'] || 0;
      if (idleDecay >= inactivityDays) {
        riskFlags.push('inactive_exceeds_threshold');
        riskLevel = 'HIGH';
      } else if (idleDecay >= inactivityDays * 0.7) {
        riskFlags.push('approaching_inactivity_limit');
        if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
      }

      // Check NBA adoption (extraction pattern = high ignore rate)
      const nbaAdoption = signalMap['nba_adoption_rate'] || 1;
      if (nbaAdoption < (1 - ignoreRate)) {
        riskFlags.push('high_nba_ignore_rate');
        if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
      }

      // Check for extraction patterns (low follow-through + high activity)
      const followThrough = signalMap['follow_through_rate'] || 1;
      const momentum = signalMap['momentum'] || 0;
      if (followThrough < 0.3 && momentum > 0.5) {
        riskFlags.push('extraction_pattern_detected');
        riskLevel = 'HIGH';
      }

      // Check demo age
      const daysSinceCreation = daysSince(demo.created_at);
      if (daysSinceCreation > 21) {
        riskFlags.push('demo_extended_usage');
      }

      riskData.push({
        enterprise_id: demo.enterprise_id,
        name: demo.name,
        risk_level: riskLevel,
        risk_flags: riskFlags.length > 0 ? riskFlags : ['healthy'],
        days_since_creation: daysSinceCreation,
        expiry_likely: riskLevel === 'HIGH',
        signals: {
          idle_decay: idleDecay,
          nba_adoption_rate: nbaAdoption,
          follow_through_rate: followThrough,
        },
      });
    }

    // Sort by risk level
    const riskOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    riskData.sort((a, b) => riskOrder[a.risk_level] - riskOrder[b.risk_level]);

    res.json({
      success: true,
      data: riskData,
      meta: {
        total_demos: riskData.length,
        high_risk: riskData.filter(d => d.risk_level === 'HIGH').length,
        medium_risk: riskData.filter(d => d.risk_level === 'MEDIUM').length,
        thresholds: {
          inactivity_days: inactivityDays,
          ignore_rate: ignoreRate,
        },
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[DEMO_RISK_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to compute demo risk.',
    });
  }
});

// ============================================================
// PRODUCT FRICTION API
// ============================================================

/**
 * GET /api/os/superadmin/product/friction
 *
 * Returns aggregate product friction signals across all enterprises.
 *
 * Response:
 * - most ignored NBA types
 * - common stall stages
 * - sub-verticals with execution decay
 */
router.get('/product/friction', async (req, res) => {
  try {
    // Get aggregate friction signals from BTE

    // 1. Most ignored NBA types (from hesitation_index and nba_adoption_rate)
    const nbaSignals = await readQuery(`
      SELECT
        entity_id as workspace_id,
        signal_value
      FROM bte_signals
      WHERE signal_type = 'nba_adoption_rate'
      ORDER BY signal_value ASC
      LIMIT 20
    `);

    // 2. Common stall stages (from drop_off_point)
    const dropOffSignals = await readQuery(`
      SELECT
        signal_value as stage_number,
        COUNT(*) as count
      FROM bte_signals
      WHERE signal_type = 'drop_off_point'
      GROUP BY signal_value
      ORDER BY count DESC
    `);

    const stageNames = {
      1: 'discovery',
      2: 'qualification',
      3: 'proposal',
      4: 'negotiation',
      5: 'closing',
    };

    const stallStages = dropOffSignals.map(d => ({
      stage: stageNames[parseInt(d.stage_number)] || 'unknown',
      workspace_count: parseInt(d.count),
    }));

    // 3. Sub-verticals with execution decay
    const decayBySubVertical = await readQuery(`
      SELECT
        u.sub_vertical_id,
        AVG(s.signal_value) as avg_idle_decay,
        COUNT(DISTINCT u.workspace_id) as workspace_count
      FROM os_user_identities u
      JOIN bte_signals s ON s.entity_id = u.workspace_id
      WHERE s.signal_type = 'idle_decay'
        AND s.entity_type = 'workspace'
      GROUP BY u.sub_vertical_id
      HAVING AVG(s.signal_value) > 3
      ORDER BY avg_idle_decay DESC
    `);

    // 4. Aggregate friction metrics
    const frictionMetrics = await readQuery(`
      SELECT
        signal_type,
        AVG(signal_value) as avg_value,
        COUNT(*) as sample_count
      FROM bte_signals
      WHERE signal_type IN ('hesitation_index', 'execution_consistency', 'decision_latency')
      GROUP BY signal_type
    `);

    const metricsMap = {};
    for (const m of frictionMetrics) {
      metricsMap[m.signal_type] = {
        average: parseFloat(m.avg_value).toFixed(2),
        sample_count: parseInt(m.sample_count),
      };
    }

    res.json({
      success: true,
      data: {
        stall_stages: stallStages,
        sub_verticals_with_decay: decayBySubVertical.map(d => ({
          sub_vertical_id: d.sub_vertical_id,
          avg_idle_days: parseFloat(d.avg_idle_decay).toFixed(1),
          workspace_count: parseInt(d.workspace_count),
        })),
        friction_metrics: metricsMap,
        low_adoption_workspaces: nbaSignals.length,
      },
      meta: {
        insight: 'Aggregate product friction signals. Drill-down requires ?intent=investigate.',
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[PRODUCT_FRICTION_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to compute product friction.',
    });
  }
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Compute health state from BTE signals.
 */
function computeHealthState(signals) {
  const idleDecay = signals['idle_decay'] || 0;
  const nbaAdoption = signals['nba_adoption_rate'] || 0;
  const followThrough = signals['follow_through_rate'] || 0;
  const hesitation = signals['hesitation_index'] || 0;

  // RED: Critical issues
  if (idleDecay > 7 || nbaAdoption < 0.3 || followThrough < 0.3) {
    return 'RED';
  }

  // YELLOW: Warning signs
  if (idleDecay > 3 || nbaAdoption < 0.5 || followThrough < 0.5 || hesitation > 0.4) {
    return 'YELLOW';
  }

  // GREEN: Healthy
  return 'GREEN';
}

/**
 * Compute top 2 behavioral drivers from signals.
 */
function computeTopDrivers(signals) {
  const drivers = [];

  if ((signals['idle_decay'] || 0) > 3) {
    drivers.push('idle_workspace');
  }
  if ((signals['nba_adoption_rate'] || 1) < 0.5) {
    drivers.push('low_nba_adoption');
  }
  if ((signals['follow_through_rate'] || 1) < 0.5) {
    drivers.push('incomplete_workflows');
  }
  if ((signals['hesitation_index'] || 0) > 0.3) {
    drivers.push('high_hesitation');
  }
  if ((signals['decision_latency'] || 0) > 24) {
    drivers.push('slow_decisions');
  }
  if ((signals['momentum'] || 0) < -0.3) {
    drivers.push('declining_activity');
  }

  // Return top 2
  return drivers.slice(0, 2).length > 0 ? drivers.slice(0, 2) : ['healthy'];
}

/**
 * Compute churn risk flag.
 */
function computeChurnRisk(signals, enterpriseType) {
  const idleDecay = signals['idle_decay'] || 0;
  const nbaAdoption = signals['nba_adoption_rate'] || 1;
  const momentum = signals['momentum'] || 0;

  // Demos have higher churn sensitivity
  const idleThreshold = enterpriseType === 'DEMO' ? 5 : 10;

  return (
    idleDecay > idleThreshold ||
    nbaAdoption < 0.2 ||
    momentum < -0.5
  );
}

/**
 * Calculate days since a date.
 */
function daysSince(date) {
  const now = new Date();
  const then = new Date(date);
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

// ============================================================
// EXPORT
// ============================================================

export default router;
