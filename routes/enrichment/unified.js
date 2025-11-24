const express = require('express');
const router = express.Router();
const { pool } = require('../../utils/db');
const { v4: uuidv4 } = require('uuid');

// Temporary auth stub - TODO: Integrate with proper authAny ES module
// For now, assume tenant_id from query/body or default to hardcoded value
function authAny(req, res, next) {
  // Mock user object for development
  req.user = {
    tenant_id: req.body?.tenant_id || req.query?.tenant_id || "00000000-0000-0000-0000-000000000001",
    id: 'mock-user',
    role: 'admin'
  };
  next();
}

/**
 * POST /api/enrichment/start
 * Queues an enrichment job for a company (idempotent per day)
 * Body: { company_id, signal_id?, mode: 'signal'|'manual' }
 */
router.post('/start', authAny, async (req, res) => {
  const { company_id, signal_id, mode = 'signal' } = req.body;
  const tenant_id = req.user.tenant_id;

  if (!company_id) {
    return res.status(400).json({ error: 'company_id is required' });
  }

  if (!['signal', 'manual'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "signal" or "manual"' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if job already exists for this company today
    const existingJob = await client.query(
      `SELECT id, status, created_at
       FROM enrichment_jobs
       WHERE tenant_id = $1 AND company_id = $2
         AND DATE(created_at) = CURRENT_DATE
         AND status != 'FAILED'
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenant_id, company_id]
    );

    if (existingJob.rows.length > 0) {
      await client.query('COMMIT');
      return res.json({
        job: existingJob.rows[0],
        message: 'Job already exists for today',
        is_new: false,
      });
    }

    // Create new enrichment job
    const job_id = uuidv4();
    const newJob = await client.query(
      `INSERT INTO enrichment_jobs
       (id, tenant_id, company_id, status, created_at, mode, metadata)
       VALUES ($1, $2, $3, 'QUEUED', NOW(), $4, $5)
       RETURNING id, tenant_id, company_id, status, created_at, mode`,
      [job_id, tenant_id, company_id, mode, JSON.stringify({ signal_id })]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      job: newJob.rows[0],
      message: 'Enrichment job queued successfully',
      is_new: true,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating enrichment job:', error);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/enrichment/status?job_id=<uuid>
 * Gets job status with inserted/skipped/total counts
 */
router.get('/status', authAny, async (req, res) => {
  const { job_id } = req.query;
  const tenant_id = req.user.tenant_id;

  if (!job_id) {
    return res.status(400).json({ error: 'job_id is required' });
  }

  try {
    // Get job details
    const jobResult = await pool.query(
      `SELECT id, tenant_id, company_id, status, created_at, completed_at,
              error_message, mode, metadata
       FROM enrichment_jobs
       WHERE id = $1 AND tenant_id = $2`,
      [job_id, tenant_id]
    );

    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobResult.rows[0];

    // Get lead counts
    const leadsResult = await pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE state = 'candidate') as candidates,
         COUNT(*) FILTER (WHERE state = 'saved') as saved,
         COUNT(*) FILTER (WHERE state = 'expired') as expired
       FROM hr_leads
       WHERE tenant_id = $1 AND job_id = $2 AND deleted_at IS NULL`,
      [tenant_id, job_id]
    );

    const stats = leadsResult.rows[0];

    return res.json({
      job: {
        ...job,
        metadata: typeof job.metadata === 'string' ? JSON.parse(job.metadata) : job.metadata,
      },
      stats: {
        total: parseInt(stats.total),
        candidates: parseInt(stats.candidates),
        saved: parseInt(stats.saved),
        expired: parseInt(stats.expired),
        inserted: parseInt(job.metadata?.inserted || stats.total),
        skipped: parseInt(job.metadata?.skipped || 0),
      },
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/enrichment/leads?job_id=<uuid>&state=candidate|saved|expired
 * Gets all leads for a job, filtered by state
 */
router.get('/leads', authAny, async (req, res) => {
  const { job_id, state = 'candidate', company_id } = req.query;
  const tenant_id = req.user.tenant_id;

  if (!job_id && !company_id) {
    return res.status(400).json({ error: 'Either job_id or company_id is required' });
  }

  if (!['candidate', 'saved', 'expired', 'all'].includes(state)) {
    return res.status(400).json({ error: 'state must be candidate, saved, expired, or all' });
  }

  try {
    let query = `
      SELECT
        id, name, designation, email, email_status, linkedin_url,
        company_id, tenant_id, state, origin, created_at, updated_at,
        candidate_expires_at, is_favorite, job_id, signal_id
      FROM hr_leads
      WHERE tenant_id = $1 AND deleted_at IS NULL
    `;
    const params = [tenant_id];

    if (job_id) {
      query += ` AND job_id = $${params.length + 1}`;
      params.push(job_id);
    }

    if (company_id) {
      query += ` AND company_id = $${params.length + 1}`;
      params.push(company_id);
    }

    if (state !== 'all') {
      query += ` AND state = $${params.length + 1}`;
      params.push(state);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    return res.json({
      leads: result.rows,
      count: result.rows.length,
      filters: {
        job_id: job_id || null,
        company_id: company_id || null,
        state,
      },
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/enrichment/leads/:id/save
 * Converts a candidate lead to saved state
 */
router.patch('/leads/:id/save', authAny, async (req, res) => {
  const { id } = req.params;
  const tenant_id = req.user.tenant_id;

  try {
    const result = await pool.query(
      `UPDATE hr_leads
       SET state = 'saved', candidate_expires_at = NULL, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id, name, state, updated_at`,
      [id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    return res.json({
      lead: result.rows[0],
      message: 'Lead saved successfully',
    });
  } catch (error) {
    console.error('Error saving lead:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/enrichment/leads/:id
 * Soft deletes a lead (sets deleted_at timestamp)
 */
router.delete('/leads/:id', authAny, async (req, res) => {
  const { id } = req.params;
  const tenant_id = req.user.tenant_id;

  try {
    const result = await pool.query(
      `UPDATE hr_leads
       SET deleted_at = NOW(), state = 'expired', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [id, tenant_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    return res.json({
      message: 'Lead deleted successfully',
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error('Error deleting lead:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
