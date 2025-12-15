/**
 * UPR OS Discovery Templates API
 * Sprint 77: Configurable Discovery Query Templates
 *
 * CRUD operations for discovery_query_templates table
 * Super Admin uses this to customize search queries per vertical/sub-vertical/region
 *
 * Endpoints:
 * - GET    /api/os/discovery-templates           - List templates (with filters)
 * - GET    /api/os/discovery-templates/:id       - Get single template
 * - POST   /api/os/discovery-templates           - Create template
 * - PATCH  /api/os/discovery-templates/:id       - Update template
 * - DELETE /api/os/discovery-templates/:id       - Delete template
 */

import express from 'express';
import { pool } from '../../utils/db.js';
import { createOSResponse, createOSError, generateRequestId } from './types.js';

const router = express.Router();

/**
 * GET /api/os/discovery-templates
 * List all templates with optional filters
 *
 * Query params:
 * - vertical: Filter by vertical_id
 * - sub_vertical: Filter by sub_vertical_id
 * - region: Filter by region_code
 * - active_only: Only return is_active=true (default: true)
 */
router.get('/', async (req, res) => {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const { vertical, sub_vertical, region, active_only = 'true' } = req.query;

    let query = `
      SELECT
        id,
        vertical_id,
        sub_vertical_id,
        region_code,
        query_template,
        query_type,
        priority,
        description,
        is_active,
        created_at,
        updated_at,
        created_by
      FROM discovery_query_templates
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (vertical) {
      query += ` AND (vertical_id = $${paramIndex} OR vertical_id IS NULL)`;
      params.push(vertical);
      paramIndex++;
    }

    if (sub_vertical) {
      query += ` AND (sub_vertical_id = $${paramIndex} OR sub_vertical_id IS NULL)`;
      params.push(sub_vertical);
      paramIndex++;
    }

    if (region) {
      query += ` AND (region_code = $${paramIndex} OR region_code IS NULL)`;
      params.push(region);
      paramIndex++;
    }

    if (active_only === 'true') {
      query += ` AND is_active = true`;
    }

    query += ` ORDER BY priority ASC, created_at DESC`;

    const result = await pool.query(query, params);

    res.json(createOSResponse({
      success: true,
      data: {
        templates: result.rows,
        total: result.rows.length,
        filters: { vertical, sub_vertical, region, active_only }
      },
      endpoint: '/api/os/discovery-templates',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:DiscoveryTemplates] GET error:', error);
    res.status(500).json(createOSError({
      error: error.message,
      code: 'TEMPLATE_LIST_ERROR',
      endpoint: '/api/os/discovery-templates',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/discovery-templates/:id
 * Get single template by ID
 */
router.get('/:id', async (req, res) => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM discovery_query_templates WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(createOSError({
        error: 'Template not found',
        code: 'TEMPLATE_NOT_FOUND',
        endpoint: `/api/os/discovery-templates/${id}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: { template: result.rows[0] },
      endpoint: `/api/os/discovery-templates/${id}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:DiscoveryTemplates] GET by ID error:', error);
    res.status(500).json(createOSError({
      error: error.message,
      code: 'TEMPLATE_GET_ERROR',
      endpoint: `/api/os/discovery-templates/${id}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/discovery-templates
 * Create new template
 *
 * Body:
 * {
 *   vertical_id: string | null,
 *   sub_vertical_id: string | null,
 *   region_code: string | null,
 *   query_template: string (required),
 *   query_type: string (default: 'serp'),
 *   priority: number (default: 100),
 *   description: string | null,
 *   is_active: boolean (default: true)
 * }
 */
router.post('/', async (req, res) => {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const {
      vertical_id = null,
      sub_vertical_id = null,
      region_code = null,
      query_template,
      query_type = 'serp',
      priority = 100,
      description = null,
      is_active = true,
      created_by = 'superadmin'
    } = req.body;

    // Validate required field
    if (!query_template || query_template.trim().length === 0) {
      return res.status(400).json(createOSError({
        error: 'query_template is required',
        code: 'VALIDATION_ERROR',
        endpoint: '/api/os/discovery-templates',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const result = await pool.query(`
      INSERT INTO discovery_query_templates (
        vertical_id, sub_vertical_id, region_code,
        query_template, query_type, priority,
        description, is_active, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      vertical_id, sub_vertical_id, region_code,
      query_template, query_type, priority,
      description, is_active, created_by
    ]);

    console.log(`[OS:DiscoveryTemplates] Created template: ${result.rows[0].id}`);

    res.status(201).json(createOSResponse({
      success: true,
      data: { template: result.rows[0] },
      reason: 'Template created successfully',
      endpoint: '/api/os/discovery-templates',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:DiscoveryTemplates] POST error:', error);
    res.status(500).json(createOSError({
      error: error.message,
      code: 'TEMPLATE_CREATE_ERROR',
      endpoint: '/api/os/discovery-templates',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * PATCH /api/os/discovery-templates/:id
 * Update existing template
 */
router.patch('/:id', async (req, res) => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const { id } = req.params;

  try {
    // Build dynamic update query
    const updates = req.body;
    const allowedFields = [
      'vertical_id', 'sub_vertical_id', 'region_code',
      'query_template', 'query_type', 'priority',
      'description', 'is_active'
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json(createOSError({
        error: 'No valid fields to update',
        code: 'VALIDATION_ERROR',
        endpoint: `/api/os/discovery-templates/${id}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    // Add updated_at
    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(`
      UPDATE discovery_query_templates
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json(createOSError({
        error: 'Template not found',
        code: 'TEMPLATE_NOT_FOUND',
        endpoint: `/api/os/discovery-templates/${id}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    console.log(`[OS:DiscoveryTemplates] Updated template: ${id}`);

    res.json(createOSResponse({
      success: true,
      data: { template: result.rows[0] },
      reason: 'Template updated successfully',
      endpoint: `/api/os/discovery-templates/${id}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:DiscoveryTemplates] PATCH error:', error);
    res.status(500).json(createOSError({
      error: error.message,
      code: 'TEMPLATE_UPDATE_ERROR',
      endpoint: `/api/os/discovery-templates/${id}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * DELETE /api/os/discovery-templates/:id
 * Delete template (soft delete by setting is_active=false, or hard delete)
 *
 * Query params:
 * - hard: If 'true', permanently delete. Otherwise soft delete.
 */
router.delete('/:id', async (req, res) => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const { id } = req.params;
  const { hard } = req.query;

  try {
    let result;

    if (hard === 'true') {
      // Hard delete
      result = await pool.query(
        `DELETE FROM discovery_query_templates WHERE id = $1 RETURNING id`,
        [id]
      );
    } else {
      // Soft delete
      result = await pool.query(
        `UPDATE discovery_query_templates SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
        [id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json(createOSError({
        error: 'Template not found',
        code: 'TEMPLATE_NOT_FOUND',
        endpoint: `/api/os/discovery-templates/${id}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    console.log(`[OS:DiscoveryTemplates] ${hard === 'true' ? 'Hard' : 'Soft'} deleted template: ${id}`);

    res.json(createOSResponse({
      success: true,
      data: { deleted: id, type: hard === 'true' ? 'hard' : 'soft' },
      reason: `Template ${hard === 'true' ? 'permanently deleted' : 'deactivated'} successfully`,
      endpoint: `/api/os/discovery-templates/${id}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:DiscoveryTemplates] DELETE error:', error);
    res.status(500).json(createOSError({
      error: error.message,
      code: 'TEMPLATE_DELETE_ERROR',
      endpoint: `/api/os/discovery-templates/${id}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/discovery-templates/bulk
 * Bulk create templates (for seeding or migration)
 */
router.post('/bulk', async (req, res) => {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    const { templates } = req.body;

    if (!Array.isArray(templates) || templates.length === 0) {
      return res.status(400).json(createOSError({
        error: 'templates array is required',
        code: 'VALIDATION_ERROR',
        endpoint: '/api/os/discovery-templates/bulk',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const created = [];
    const errors = [];

    for (const template of templates) {
      try {
        const result = await pool.query(`
          INSERT INTO discovery_query_templates (
            vertical_id, sub_vertical_id, region_code,
            query_template, query_type, priority,
            description, is_active, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id, query_template
        `, [
          template.vertical_id || null,
          template.sub_vertical_id || null,
          template.region_code || null,
          template.query_template,
          template.query_type || 'serp',
          template.priority || 100,
          template.description || null,
          template.is_active !== false,
          template.created_by || 'superadmin'
        ]);
        created.push(result.rows[0]);
      } catch (err) {
        errors.push({ template: template.query_template, error: err.message });
      }
    }

    console.log(`[OS:DiscoveryTemplates] Bulk created ${created.length} templates`);

    res.status(201).json(createOSResponse({
      success: errors.length === 0,
      data: {
        created: created.length,
        failed: errors.length,
        templates: created,
        errors: errors.length > 0 ? errors : undefined
      },
      reason: `Created ${created.length} templates${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
      endpoint: '/api/os/discovery-templates/bulk',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:DiscoveryTemplates] Bulk POST error:', error);
    res.status(500).json(createOSError({
      error: error.message,
      code: 'TEMPLATE_BULK_CREATE_ERROR',
      endpoint: '/api/os/discovery-templates/bulk',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

export default router;
