// routes/hiringEnrich.js
// Hiring Signals Enrichment System - Uses BullMQ worker for background processing
import express from 'express';
import { pool } from '../utils/db.js';
import { ok, bad } from '../utils/respond.js';
import { hiringSignalsQueue } from '../workers/queue.js';

const router = express.Router();

// Status ping (LLM/DB/Data source)
router.get("/status", async (_req, res) => {
  const llm_ok = !!process.env.OPENAI_API_KEY;
  const data_source = process.env.APOLLO_API_KEY ? "apollo" : "mock";
  let db_ok = false;
  try { await pool.query("SELECT 1"); db_ok = true; } catch { db_ok = false; }
  res.json({ ok: true, data: { db_ok, llm_ok, data_source } });
});

/**
 * Helper to get tenant ID from request
 */
async function getTenantId(req) {
  // Try environment variable first
  if (process.env.TENANT_ID) return process.env.TENANT_ID;

  // Fall back to first tenant in database
  const result = await pool.query('SELECT id FROM tenants LIMIT 1');
  if (result.rows.length === 0) {
    throw new Error('No tenant found');
  }
  return result.rows[0].id;
}

/**
 * POST /api/hiring-enrich/from-signal
 * Trigger enrichment process for a hiring signal or grouped company
 */
router.post("/from-signal", async (req, res) => {
  try {
    const { signal_id, company_id, company_name, sector, location, domain, force_refresh = false } = req.body;

    console.log('[HiringEnrich] Request body:', JSON.stringify(req.body));

    if (!company_name) {
      return bad(res, 'company_name is required', 400);
    }

    const tenantId = await getTenantId(req);

    console.log('[HiringEnrich] Starting enrichment for:', {
      signal_id: signal_id || 'N/A',
      company_id: company_id || 'NULL',
      company_name,
      sector,
      location,
      force_refresh: force_refresh  // Log cache bypass flag
    });

    // Create enrichment job
    const taskId = `enrich-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await pool.query(`
      INSERT INTO enrichment_jobs (
        id,
        tenant_id,
        signal_id,
        company_id,
        company_name,
        payload,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      taskId,
      tenantId,
      signal_id || null,
      company_id || null,
      company_name,
      JSON.stringify({ sector, location, domain, signal_id, force_refresh }),
      'QUEUED'
    ]);

    // Add job to BullMQ queue for background processing
    if (hiringSignalsQueue) {
      try {
        await hiringSignalsQueue.add('hiring-signal-enrich', {
          taskId,
          signal_id,
          company_id,
          company_name,
          sector,
          location,
          domain,
          tenantId,
          force_refresh  // Pass flag to worker
        }, {
          jobId: taskId,
          removeOnComplete: true,
          removeOnFail: false
        });
        console.log('[HiringEnrich] Job added to queue:', taskId);
      } catch (queueErr) {
        console.error('[HiringEnrich] Failed to add job to queue:', queueErr);
        // Update enrichment_jobs status to ERROR
        await pool.query(`
          UPDATE enrichment_jobs
          SET status = 'ERROR', error = $2, finished_at = NOW()
          WHERE id = $1
        `, [taskId, 'Failed to queue job: ' + queueErr.message]);
        return bad(res, 'Failed to queue enrichment job', 500);
      }
    } else {
      console.warn('[HiringEnrich] Queue not available - Redis connection missing');
      await pool.query(`
        UPDATE enrichment_jobs
        SET status = 'ERROR', error = 'Queue not available', finished_at = NOW()
        WHERE id = $1
      `, [taskId]);
      return bad(res, 'Enrichment queue not available (Redis connection missing)', 503);
    }

    return ok(res, {
      task_id: taskId,
      status: 'QUEUED',
      message: 'Enrichment job queued successfully',
      force_refresh: force_refresh  // Indicate if cache bypass is active
    });

  } catch (err) {
    console.error('[HiringEnrich] POST /from-signal error:', err);
    return bad(res, 'Failed to start enrichment', 500);
  }
});

/**
 * POST /api/hiring-enrich/clear-cache
 * Clear cached leads for a specific company (for testing/debugging)
 */
router.post("/clear-cache", async (req, res) => {
  try {
    const { company_name } = req.body;

    if (!company_name) {
      return bad(res, 'company_name is required', 400);
    }

    const tenantId = await getTenantId(req);

    console.log(`[HiringEnrich] Clearing cache for: ${company_name}`);

    // Delete all leads for this company from hr_leads table
    const deleteResult = await pool.query(`
      DELETE FROM hr_leads
      WHERE tenant_id = $1
      AND (
        signal_feed->>'company_name' ILIKE $2
        OR company_id IN (
          SELECT id FROM targeted_companies
          WHERE LOWER(TRIM(name)) = LOWER(TRIM($2))
        )
      )
      RETURNING id
    `, [tenantId, company_name]);

    const deletedCount = deleteResult.rowCount;

    console.log(`[HiringEnrich] Cleared ${deletedCount} cached leads for ${company_name}`);

    return ok(res, {
      deleted_count: deletedCount,
      company_name: company_name,
      message: `Cleared ${deletedCount} cached leads for ${company_name}`
    });

  } catch (err) {
    console.error('[HiringEnrich] POST /clear-cache error:', err);
    return bad(res, 'Failed to clear cache: ' + err.message, 500);
  }
});

/**
 * GET /api/hiring-enrich/status/:taskId
 * Check enrichment task status and get results
 */
router.get("/status/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const tenantId = await getTenantId(req);

    console.log('[HiringEnrich] Status check for task:', taskId);

    // Get job status
    const jobResult = await pool.query(`
      SELECT
        id,
        status,
        payload,
        error,
        leads_found,
        company_id,
        company_name,
        finished_at,
        created_at,
        started_at,
        signal_id
      FROM enrichment_jobs
      WHERE id = $1 AND tenant_id = $2
    `, [taskId, tenantId]);

    if (jobResult.rows.length === 0) {
      console.log('[HiringEnrich] Task not found:', taskId);
      return bad(res, 'Task not found', 404);
    }

    const job = jobResult.rows[0];
    console.log('[HiringEnrich] Task status:', job.status);

    // If completed, fetch leads from hr_leads table
    let leads = [];
    if (job.status === 'DONE') {
      // Use taskId as fallback since we save signal_feed->>'signal_id' = taskId
      const signal_id = job.signal_id || job.payload?.signal_id || taskId;

      if (signal_id) {
        // Query by signal_feed jsonb column
        const leadsResult = await pool.query(`
          SELECT
            id,
            name as full_name,
            designation as title,
            role_bucket as function,
            email,
            email_status,
            linkedin_url,
            seniority,
            confidence,
            source,
            location,
            is_favorite,
            is_irrelevant,
            shortlisted_at,
            created_at
          FROM hr_leads
          WHERE tenant_id = $1
          AND signal_feed->>'signal_id' = $2
          ORDER BY confidence DESC NULLS LAST, created_at DESC
          LIMIT 20
        `, [tenantId, signal_id]);

        leads = leadsResult.rows.map(row => ({
          id: row.id,
          name: row.full_name,
          title: row.title,
          function: row.function,
          email: row.email,
          email_status: row.email_status || 'unknown',
          confidence: parseFloat(row.confidence) || 0.75,
          source: row.source || 'apollo',
          linkedin_url: row.linkedin_url,
          seniority: row.seniority,
          location: row.location,
          is_favorite: row.is_favorite || false,
          is_irrelevant: row.is_irrelevant || false,
          shortlisted_at: row.shortlisted_at,
          created_at: row.created_at
        }));

        console.log('[HiringEnrich] Returning', leads.length, 'leads from hr_leads table');
      } else {
        console.warn('[HiringEnrich] No signal_id found for completed job');
      }
    }

    // Extract progress from payload if available
    const progress = job.payload?.progress || null;

    return ok(res, {
      status: job.status,
      leads: leads,
      leads_found: job.leads_found || leads.length,
      error: job.error,
      progress: progress,
      started_at: job.started_at,
      completed_at: job.finished_at,
      duration_ms: job.finished_at && job.started_at
        ? new Date(job.finished_at) - new Date(job.started_at)
        : null
    });

  } catch (err) {
    console.error('[HiringEnrich] GET /status error:', err);
    console.error('[HiringEnrich] Error stack:', err.stack);
    return bad(res, 'Failed to get status: ' + err.message, 500);
  }
});

export default router;
