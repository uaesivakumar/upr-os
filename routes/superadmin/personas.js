/**
 * Super Admin Persona Authority APIs
 *
 * S264-F4: Persona Authority (OS-Only)
 *
 * AUTHORITY RULES:
 * - SUPER_ADMIN: Create, Edit, Bind, Deprecate personas
 * - ENTERPRISE_ADMIN: View only
 * - USER: Zero visibility
 *
 * Persona definitions NEVER live in SaaS.
 * All mutations are audited.
 */

import { Router } from 'express';
import {
  requireSuperAdmin,
  logSuperAdminAudit,
} from '../../middleware/superadmin-auth.js';
import { readQuery } from '../../services/bte/reader.js';
import pool from '../../server/db.js';

const router = Router();

// Apply Super Admin middleware to all routes
router.use(requireSuperAdmin);

// ============================================================
// LIST PERSONAS
// ============================================================

/**
 * GET /api/os/superadmin/personas
 *
 * List all personas (aggregate view, no drill-down).
 */
router.get('/', async (req, res) => {
  try {
    const personas = await readQuery(`
      SELECT
        p.id as persona_id,
        p.key,
        p.name,
        p.is_active,
        sv.id as sub_vertical_id,
        sv.name as sub_vertical_name,
        p.created_at,
        p.updated_at
      FROM os_personas p
      LEFT JOIN os_sub_verticals sv ON p.sub_vertical_id = sv.id
      ORDER BY p.name
    `);

    res.json({
      success: true,
      data: personas,
      meta: {
        total: personas.length,
        active: personas.filter(p => p.is_active).length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[PERSONAS_LIST_ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to list personas.',
    });
  }
});

// ============================================================
// CREATE PERSONA
// ============================================================

/**
 * POST /api/os/superadmin/personas
 *
 * Create a new persona. SUPER_ADMIN only.
 * All mutations are audited.
 */
router.post('/', async (req, res) => {
  const { key, name, sub_vertical_id, config } = req.body;

  if (!key || !name || !sub_vertical_id) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'key, name, and sub_vertical_id are required.',
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO os_personas (key, name, sub_vertical_id, config, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, true, NOW(), NOW())
      RETURNING id, key, name, sub_vertical_id, is_active, created_at
    `, [key, name, sub_vertical_id, JSON.stringify(config || {})]);

    const persona = result.rows[0];

    // Audit the creation
    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: '/api/os/superadmin/personas',
      action: 'create_persona',
      success: true,
      metadata: {
        persona_id: persona.id,
        key: persona.key,
        sub_vertical_id: persona.sub_vertical_id,
      },
    });

    res.status(201).json({
      success: true,
      data: persona,
    });
  } catch (error) {
    console.error('[PERSONA_CREATE_ERROR]', error);

    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: '/api/os/superadmin/personas',
      action: 'create_persona',
      success: false,
      reason: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to create persona.',
    });
  }
});

// ============================================================
// UPDATE PERSONA
// ============================================================

/**
 * PUT /api/os/superadmin/personas/:persona_id
 *
 * Update persona config. SUPER_ADMIN only.
 * All mutations are audited.
 */
router.put('/:persona_id', async (req, res) => {
  const { persona_id } = req.params;
  const { name, config, is_active } = req.body;

  try {
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (config !== undefined) {
      updates.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(config));
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'No fields to update.',
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(persona_id);

    const result = await pool.query(`
      UPDATE os_personas
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, key, name, sub_vertical_id, is_active, updated_at
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Persona not found.',
      });
    }

    const persona = result.rows[0];

    // Audit the update
    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: `/api/os/superadmin/personas/${persona_id}`,
      action: 'update_persona',
      success: true,
      metadata: {
        persona_id: persona.id,
        updated_fields: Object.keys(req.body),
      },
    });

    res.json({
      success: true,
      data: persona,
    });
  } catch (error) {
    console.error('[PERSONA_UPDATE_ERROR]', error);

    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: `/api/os/superadmin/personas/${persona_id}`,
      action: 'update_persona',
      success: false,
      reason: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to update persona.',
    });
  }
});

// ============================================================
// DEPRECATE PERSONA
// ============================================================

/**
 * POST /api/os/superadmin/personas/:persona_id/deprecate
 *
 * Deprecate (soft-delete) a persona. SUPER_ADMIN only.
 * Does not delete, just marks inactive.
 */
router.post('/:persona_id/deprecate', async (req, res) => {
  const { persona_id } = req.params;

  try {
    const result = await pool.query(`
      UPDATE os_personas
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING id, key, name, is_active
    `, [persona_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Persona not found.',
      });
    }

    const persona = result.rows[0];

    // Audit the deprecation
    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: `/api/os/superadmin/personas/${persona_id}/deprecate`,
      action: 'deprecate_persona',
      success: true,
      metadata: {
        persona_id: persona.id,
        key: persona.key,
      },
    });

    res.json({
      success: true,
      data: persona,
      message: 'Persona deprecated successfully.',
    });
  } catch (error) {
    console.error('[PERSONA_DEPRECATE_ERROR]', error);

    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: `/api/os/superadmin/personas/${persona_id}/deprecate`,
      action: 'deprecate_persona',
      success: false,
      reason: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to deprecate persona.',
    });
  }
});

// ============================================================
// BIND PERSONA TO SUB-VERTICAL
// ============================================================

/**
 * POST /api/os/superadmin/personas/:persona_id/bind
 *
 * Bind persona to a sub-vertical. SUPER_ADMIN only.
 */
router.post('/:persona_id/bind', async (req, res) => {
  const { persona_id } = req.params;
  const { sub_vertical_id } = req.body;

  if (!sub_vertical_id) {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'sub_vertical_id is required.',
    });
  }

  try {
    const result = await pool.query(`
      UPDATE os_personas
      SET sub_vertical_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, key, name, sub_vertical_id
    `, [sub_vertical_id, persona_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Persona not found.',
      });
    }

    const persona = result.rows[0];

    // Audit the binding
    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: `/api/os/superadmin/personas/${persona_id}/bind`,
      action: 'bind_persona',
      success: true,
      metadata: {
        persona_id: persona.id,
        sub_vertical_id: sub_vertical_id,
      },
    });

    res.json({
      success: true,
      data: persona,
      message: 'Persona bound to sub-vertical.',
    });
  } catch (error) {
    console.error('[PERSONA_BIND_ERROR]', error);

    await logSuperAdminAudit({
      user_id: req.superAdmin.user_id,
      endpoint: `/api/os/superadmin/personas/${persona_id}/bind`,
      action: 'bind_persona',
      success: false,
      reason: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to bind persona.',
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

export default router;
