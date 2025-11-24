// routes/outreach/broadcast.js
import express from "express";
import { pool } from "../../utils/db.js";
import { ok, bad } from "../../utils/respond.js";
import { adminOnly } from "../../utils/adminOnly.js";

const router = express.Router();

/**
 * POST /api/outreach/broadcast
 * Creates an asynchronous broadcast job and its associated tasks.
 * Body: { template_version_id: uuid, name?: string, lead_query: { lead_ids: uuid[] } }
 */
router.post("/broadcast", adminOnly, async (req, res) => {
  const { template_version_id, name, lead_query } = req.body;
  const leadIds = lead_query?.lead_ids;

  // --- Validation ---
  if (!template_version_id) {
    return bad(res, "template_version_id is required.", 400);
  }
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return bad(res, "lead_query.lead_ids must be a non-empty array.", 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Step 1: Create the main broadcast_jobs record.
    const jobQuery = `
      INSERT INTO broadcast_jobs (template_version_id, name, total_targets, status)
      VALUES ($1, $2, $3, 'queued')
      RETURNING id;
    `;
    const jobRes = await client.query(jobQuery, [template_version_id, name, leadIds.length]);
    const jobId = jobRes.rows[0].id;

    // Step 2: Bulk-insert all tasks for this job.
    const tasksQuery = `
      INSERT INTO broadcast_tasks (job_id, lead_id)
      SELECT $1, unnest($2::uuid[]);
    `;
    await client.query(tasksQuery, [jobId, leadIds]);
    
    await client.query('COMMIT');

    console.log(`[Broadcast] Job ${jobId} created with ${leadIds.length} tasks. Ready for background processing.`);

    res.status(202).json({ ok: true, data: { job_id: jobId } });

  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23503') {
        return bad(res, "Invalid template_version_id.", 404);
    }
    console.error("POST /api/outreach/broadcast error:", e);
    return bad(res, "Server error while creating broadcast job.", 500);
  } finally {
    client.release();
  }
});

/**
 * GET /api/outreach/broadcast/status/:jobId
 * Gets the current status and progress of a broadcast job.
 */
router.get("/broadcast/status/:jobId", adminOnly, async (req, res) => {
  const { jobId } = req.params;

  try {
    // Query 1: Get the main job details
    const jobRes = await pool.query(
      `SELECT id, status, total_targets, processed, errors FROM broadcast_jobs WHERE id = $1`,
      [jobId]
    );

    if (jobRes.rowCount === 0) {
      return bad(res, "Job not found.", 404);
    }
    const job = jobRes.rows[0];

    // Query 2: Get the breakdown of task statuses
    const breakdownRes = await pool.query(
      `SELECT status, COUNT(*) AS count FROM broadcast_tasks WHERE job_id = $1 GROUP BY status`,
      [jobId]
    );

    // Format the breakdown into the specified object shape
    const allStatuses = ['queued', 'researching', 'composing', 'guardrail', 'sending', 'done', 'error'];
    const breakdown = Object.fromEntries(allStatuses.map(s => [s, 0]));
    for (const row of breakdownRes.rows) {
      breakdown[row.status] = parseInt(row.count, 10);
    }
    
    const responsePayload = {
      job_id: job.id,
      status: job.status,
      total_targets: job.total_targets,
      processed: job.processed,
      errors: job.errors,
      breakdown: breakdown,
    };

    return ok(res, responsePayload);

  } catch(e) {
    console.error(`GET /api/outreach/broadcast/status/${jobId} error:`, e);
    return bad(res, "Server error while fetching job status.", 500);
  }
});


export default router;