// routes/templates.js
const express = require("express");
const { pool } = require("../utils/db");
const { ok, bad } = require("../utils/respond");
const { adminOnly } = require("../utils/adminOnly");

const router = express.Router();

// --- Template Collection Routes ---

/**
 * GET /api/templates
 * Lists all master templates, with optional filtering by status.
 * Query: ?status='active'
 */
router.get("/", adminOnly, async (req, res) => {
  try {
    const { status } = req.query;
    let query = "SELECT id, name, status, created_at, updated_at FROM templates";
    const params = [];

    if (status) {
      query += " WHERE status = $1";
      params.push(status);
    }
    query += " ORDER BY updated_at DESC";

    const { rows } = await pool.query(query, params);
    return ok(res, rows);
  } catch (e) {
    console.error("GET /api/templates error:", e);
    return bad(res, "Server error", 500);
  }
});

/**
 * POST /api/templates
 * Creates a new master template record.
 * Body: { name: string, category?: string, status?: 'draft'|'active'|'archived' }
 */
router.post("/", adminOnly, async (req, res) => {
  try {
    const { name, status = 'draft' } = req.body;
    if (!name) {
      return bad(res, "The 'name' field is required.", 400);
    }

    const { rows } = await pool.query(
      "INSERT INTO templates (name, status) VALUES ($1, $2) RETURNING id, name, status, created_at",
      [name, status]
    );

    res.status(201).json({ ok: true, data: rows[0] });

  } catch (e) {
    if (e.code === '23505') { // unique_violation
        return bad(res, `A template with the name "${req.body.name}" already exists.`, 409);
    }
    console.error("POST /api/templates error:", e);
    return bad(res, "Server error", 500);
  }
});


// --- Single Template & Version Routes ---

/**
 * GET /api/templates/:id/versions
 * Gets all versions for a specific template, ordered by latest first.
 */
router.get("/:id/versions", adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      "SELECT * FROM template_versions WHERE template_id = $1 ORDER BY version DESC",
      [id]
    );
    return ok(res, rows);
  } catch (e) {
    console.error(`GET /api/templates/${id}/versions error:`, e);
    return bad(res, "Server error", 500);
  }
});

/**
 * POST /api/templates/:templateId/versions
 * Creates a new, immutable version for a given template.
 */
router.post("/:templateId/versions", adminOnly, async (req, res) => {
  const { templateId } = req.params;
  const { subject, blocks, variables } = req.body;

  if (!subject || !blocks || !variables) {
    return bad(res, "Missing required fields: subject, blocks, variables", 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const versionRes = await client.query(
      "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM template_versions WHERE template_id = $1 FOR UPDATE",
      [templateId]
    );
    const nextVersion = versionRes.rows[0].next_version;

    const insertQuery = `
      INSERT INTO template_versions (template_id, version, subject_template, body_blocks, required_variables)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const { rows } = await client.query(insertQuery, [
      templateId,
      nextVersion,
      subject,
      blocks,
      variables
    ]);

    await client.query('COMMIT');

    res.status(201).json({ ok: true, data: rows[0] });

  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`POST /api/templates/${templateId}/versions error:`, e);
    return bad(res, "Server error while creating template version.", 500);
  } finally {
    client.release();
  }
});

/**
 * GET /api/templates/:id
 * Gets a single master template's details.
 */
router.get("/:id", adminOnly, async (req, res) => {
    try {
      const { id } = req.params;
      const { rows, rowCount } = await pool.query("SELECT * FROM templates WHERE id = $1", [id]);
      if (rowCount === 0) {
        return bad(res, "Template not found", 404);
      }
      return ok(res, rows[0]);
    } catch (e) {
      console.error(`GET /api/templates/${id} error:`, e);
      return bad(res, "Server error", 500);
    }
});

/**
 * PATCH /api/templates/:id
 * Updates a template's mutable fields, like status, name, or category.
 */
router.patch("/:id", adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, name } = req.body;

    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (status) { fields.push(`status = $${paramIndex++}`); params.push(status); }
    if (name) { fields.push(`name = $${paramIndex++}`); params.push(name); }

    if (fields.length === 0) {
      return bad(res, "No fields to update provided.", 400);
    }

    params.push(id);
    const query = `UPDATE templates SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;

    const { rows, rowCount } = await pool.query(query, params);

    if (rowCount === 0) {
      return bad(res, "Template not found", 404);
    }
    return ok(res, rows[0]);
  } catch (e) {
    console.error(`PATCH /api/templates/${req.params.id} error:`, e);
    return bad(res, "Server error", 500);
  }
});

module.exports = router;