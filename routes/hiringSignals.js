// routes/hiringSignals.js
// API routes for hiring signals (RADAR recall-mode system)
import express from 'express';
import { pool } from '../utils/db.js';
import { ok, bad } from '../utils/respond.js';
import authAny from '../server/middleware/authAny.js';

const router = express.Router();

/**
 * Helper to get tenant ID from request
 */
async function getTenantId(req) {
  if (req.user?.tenant_id) return req.user.tenant_id;

  // Fallback: get from env or first tenant
  if (process.env.TENANT_ID) return process.env.TENANT_ID;

  const result = await pool.query('SELECT id FROM tenants LIMIT 1');
  if (result.rows.length === 0) {
    throw new Error('No tenant found');
  }
  return result.rows[0].id;
}

// All routes require authentication
router.use(authAny);

// GET /api/hiring-signals/hot - Get Hot Leads (GROUPED BY COMPANY)
router.get('/hot', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const tenantId = await getTenantId(req);

    const result = await pool.query(
      `SELECT * FROM v_hiring_hot_grouped
       WHERE tenant_id = $1
       ORDER BY composite_score DESC NULLS LAST, latest_detected_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM v_hiring_hot_grouped WHERE tenant_id = $1`,
      [tenantId]
    );

    return ok(res, {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      tier: 'hot'
    });
  } catch (err) {
    console.error('[HiringSignals] GET /hot error:', err);
    return bad(res, 'Failed to fetch hot leads', 500);
  }
});

// GET /api/hiring-signals/review - Get Review Queue (GROUPED BY COMPANY)
router.get('/review', async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const tenantId = await getTenantId(req);

    const result = await pool.query(
      `SELECT * FROM v_hiring_review_grouped
       WHERE tenant_id = $1
       ORDER BY composite_score DESC NULLS LAST, latest_detected_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM v_hiring_review_grouped WHERE tenant_id = $1`,
      [tenantId]
    );

    return ok(res, {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      tier: 'review'
    });
  } catch (err) {
    console.error('[HiringSignals] GET /review error:', err);
    return bad(res, 'Failed to fetch review queue', 500);
  }
});

// GET /api/hiring-signals/background - Get Background (GROUPED BY COMPANY)
router.get('/background', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const tenantId = await getTenantId(req);

    const result = await pool.query(
      `SELECT * FROM v_hiring_background_grouped
       WHERE tenant_id = $1
       ORDER BY latest_detected_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM v_hiring_background_grouped WHERE tenant_id = $1`,
      [tenantId]
    );

    return ok(res, {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      tier: 'background'
    });
  } catch (err) {
    console.error('[HiringSignals] GET /background error:', err);
    return bad(res, 'Failed to fetch background signals', 500);
  }
});

// GET /api/hiring-signals/all - Get All Signals (GROUPED BY COMPANY, with filters)
router.get('/all', async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      geo_status,
      score_min,
      sector,
      trigger_type
    } = req.query;
    const tenantId = await getTenantId(req);

    let whereConditions = ['tenant_id = $1'];
    let params = [tenantId];
    let paramIndex = 2;

    if (geo_status) {
      whereConditions.push(`geo_status = $${paramIndex}`);
      params.push(geo_status);
      paramIndex++;
    }

    if (score_min) {
      whereConditions.push(`composite_score >= $${paramIndex}`);
      params.push(parseInt(score_min));
      paramIndex++;
    }

    if (sector) {
      whereConditions.push(`sector ILIKE $${paramIndex}`);
      params.push(`%${sector}%`);
      paramIndex++;
    }

    if (trigger_type) {
      whereConditions.push(`$${paramIndex} = ANY(triggers)`);
      params.push(trigger_type);
      paramIndex++;
    }

    const query = `
      SELECT * FROM v_hiring_all_grouped
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY composite_score DESC NULLS LAST, latest_detected_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);

    const countQuery = `
      SELECT COUNT(*) FROM v_hiring_all_grouped
      WHERE ${whereConditions.join(' AND ')}
    `;

    const countResult = await pool.query(countQuery, params.slice(0, -2));

    return ok(res, {
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      tier: 'all',
      filters: { geo_status, score_min, sector, trigger_type }
    });
  } catch (err) {
    console.error('[HiringSignals] GET /all error:', err);
    return bad(res, 'Failed to fetch signals', 500);
  }
});

// GET /api/hiring-signals/stats - Get Stats (COUNT UNIQUE COMPANIES)
router.get('/stats', async (req, res) => {
  try {
    const tenantId = await getTenantId(req);

    // Count unique companies in each grouped view
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM v_hiring_hot_grouped WHERE tenant_id = $1) as hot_count,
        (SELECT COUNT(*) FROM v_hiring_review_grouped WHERE tenant_id = $1) as review_count,
        (SELECT COUNT(*) FROM v_hiring_background_grouped WHERE tenant_id = $1) as background_count,
        (SELECT COUNT(*) FROM v_hiring_all_grouped WHERE tenant_id = $1) as total_count,

        -- Also count total signals for reference
        (SELECT COUNT(*) FROM hiring_signals
         WHERE tenant_id = $1
         AND review_status = 'pending'
         AND (
           (geo_status = 'confirmed' AND hiring_likelihood_score >= 4)
           OR (
             trigger_type IN ('Hiring Drive', 'Project Award', 'Expansion')
             AND (source_date IS NULL OR source_date >= CURRENT_DATE - INTERVAL '30 days')
           )
         )) as hot_signals_count,

        (SELECT COUNT(*) FROM hiring_signals WHERE tenant_id = $1 AND review_status = 'approved') as approved_count,
        (SELECT COUNT(*) FROM hiring_signals WHERE tenant_id = $1 AND review_status = 'rejected') as rejected_count,
        (SELECT COUNT(*) FROM hiring_signals WHERE tenant_id = $1 AND review_status = 'pending') as total_signals_count
    `, [tenantId]);

    const stats = result.rows[0];

    return ok(res, {
      hot_count: parseInt(stats.hot_count || 0),
      review_count: parseInt(stats.review_count || 0),
      background_count: parseInt(stats.background_count || 0),
      total_count: parseInt(stats.total_count || 0),
      approved_count: parseInt(stats.approved_count || 0),
      rejected_count: parseInt(stats.rejected_count || 0),

      // Also return signal counts for reference
      hot_signals_count: parseInt(stats.hot_signals_count || 0),
      total_signals_count: parseInt(stats.total_signals_count || 0)
    });
  } catch (err) {
    console.error('[HiringSignals] GET /stats error:', err);
    return bad(res, 'Failed to fetch stats', 500);
  }
});

// GET /api/hiring-signals/diagnostics - Run comprehensive system checks
router.get('/diagnostics', async (req, res) => {
  try {
    const tenantId = await getTenantId(req);

    const diagnostics = {
      timestamp: new Date().toISOString(),
      tenant_id: tenantId,
      checks: {}
    };

    // Check 1: Database views exist
    try {
      const viewsResult = await pool.query(`
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'public'
        AND table_name LIKE 'v_hiring%'
        ORDER BY table_name
      `);
      diagnostics.checks.database_views = {
        status: 'ok',
        views: viewsResult.rows.map(r => r.table_name),
        count: viewsResult.rows.length
      };
    } catch (err) {
      diagnostics.checks.database_views = {
        status: 'error',
        error: err.message
      };
    }

    // Check 2: Hiring signals raw data
    try {
      const signalsResult = await pool.query(`
        SELECT
          COUNT(*) as total_signals,
          COUNT(DISTINCT LOWER(TRIM(company))) as unique_companies,
          MIN(created_at) as oldest_signal,
          MAX(created_at) as newest_signal
        FROM hiring_signals
        WHERE tenant_id = $1
        AND review_status = 'pending'
      `, [tenantId]);

      diagnostics.checks.raw_signals = {
        status: 'ok',
        data: signalsResult.rows[0]
      };
    } catch (err) {
      diagnostics.checks.raw_signals = {
        status: 'error',
        error: err.message
      };
    }

    // Check 3: Grouped views data with tier assignment
    try {
      const allResult = await pool.query(`
        SELECT
          assigned_tier,
          COUNT(*) as count
        FROM v_hiring_all_grouped
        WHERE tenant_id = $1
        GROUP BY assigned_tier
      `, [tenantId]);

      diagnostics.checks.tier_distribution = {
        status: 'ok',
        data: allResult.rows
      };
    } catch (err) {
      diagnostics.checks.tier_distribution = {
        status: 'error',
        error: err.message
      };
    }

    // Check 4: Sample data from each tier
    try {
      const hotSample = await pool.query(`
        SELECT
          company,
          company_id,
          signal_count,
          composite_score
        FROM v_hiring_hot_grouped
        WHERE tenant_id = $1
        LIMIT 3
      `, [tenantId]);

      diagnostics.checks.hot_tier_sample = {
        status: 'ok',
        count: hotSample.rows.length,
        samples: hotSample.rows
      };
    } catch (err) {
      diagnostics.checks.hot_tier_sample = {
        status: 'error',
        error: err.message
      };
    }

    // Check 5: Verify no companies appear in multiple tiers
    try {
      const duplicatesResult = await pool.query(`
        WITH all_tier_companies AS (
          SELECT company, 'hot' as tier FROM v_hiring_hot_grouped WHERE tenant_id = $1
          UNION ALL
          SELECT company, 'review' as tier FROM v_hiring_review_grouped WHERE tenant_id = $1
          UNION ALL
          SELECT company, 'background' as tier FROM v_hiring_background_grouped WHERE tenant_id = $1
        )
        SELECT
          company,
          array_agg(tier ORDER BY tier) as appears_in_tiers,
          COUNT(*) as tier_count
        FROM all_tier_companies
        GROUP BY company
        HAVING COUNT(*) > 1
      `, [tenantId]);

      diagnostics.checks.multi_tier_duplicates = {
        status: duplicatesResult.rows.length > 0 ? 'warning' : 'ok',
        count: duplicatesResult.rows.length,
        duplicates: duplicatesResult.rows
      };
    } catch (err) {
      diagnostics.checks.multi_tier_duplicates = {
        status: 'error',
        error: err.message
      };
    }

    // Overall status
    const hasErrors = Object.values(diagnostics.checks).some(c => c.status === 'error');
    const hasWarnings = Object.values(diagnostics.checks).some(c => c.status === 'warning');

    diagnostics.overall_status = hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok';

    console.log('[HiringSignals] Diagnostics complete:', diagnostics.overall_status);

    return ok(res, diagnostics);

  } catch (err) {
    console.error('[HiringSignals] Diagnostics error:', err);
    return bad(res, 'Diagnostics failed: ' + err.message, 500);
  }
});

// PATCH /api/hiring-signals/:id/review - Approve/Reject Signal
router.patch('/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body;
    const userId = req.user?.id || req.user?.sub || null;
    const tenantId = await getTenantId(req);

    if (!['approve', 'reject'].includes(action)) {
      return bad(res, 'Invalid action. Must be "approve" or "reject"', 400);
    }

    const result = await pool.query(
      `UPDATE hiring_signals
       SET review_status = $1,
           reviewed_at = NOW(),
           reviewed_by = $2,
           reject_reason = $3
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [
        action === 'approve' ? 'approved' : 'rejected',
        userId,
        action === 'reject' ? reason : null,
        id,
        tenantId
      ]
    );

    if (result.rows.length === 0) {
      return bad(res, 'Signal not found', 404);
    }

    console.log('[HiringSignals] Review action:', {
      id,
      action,
      company: result.rows[0].company,
      reviewer: userId
    });

    return ok(res, result.rows[0]);
  } catch (err) {
    console.error('[HiringSignals] PATCH /:id/review error:', err);
    return bad(res, 'Failed to review signal', 500);
  }
});

export default router;
