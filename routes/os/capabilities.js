/**
 * UPR OS Capabilities Router
 * Sprint 228: Capability Registry Core
 *
 * CRUD API for os_model_capabilities table.
 * Capabilities are the abstraction layer - SIVA never sees model names.
 *
 * INVARIANT: Capability definitions control what models can be selected.
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import {
  createOSResponse,
  createOSError,
  generateRequestId
} from './types.js';
import db from '../../db/index.js';

const router = express.Router();

// ============================================================================
// CAPABILITY CRUD
// ============================================================================

/**
 * GET /api/os/capabilities
 * List all capabilities
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { active_only } = req.query;

    let query = `
      SELECT
        c.id,
        c.capability_key,
        c.name,
        c.description,
        c.max_tokens,
        c.latency_class,
        c.risk_class,
        c.replay_tolerance,
        c.requires_vision,
        c.requires_functions,
        c.requires_json_mode,
        c.min_context_tokens,
        c.is_active,
        c.created_at,
        c.updated_at,
        COUNT(DISTINCT mcm.model_id) FILTER (WHERE mcm.is_supported = true) as supported_model_count,
        ARRAY_AGG(DISTINCT m.slug) FILTER (WHERE mcm.is_supported = true AND m.is_eligible = true) as eligible_models
      FROM os_model_capabilities c
      LEFT JOIN os_model_capability_mappings mcm ON mcm.capability_id = c.id
      LEFT JOIN llm_models m ON mcm.model_id = m.id
    `;

    if (active_only === 'true') {
      query += ` WHERE c.is_active = true`;
    }

    query += `
      GROUP BY c.id
      ORDER BY c.capability_key
    `;

    const result = await db.query(query);

    res.json(createOSResponse({
      success: true,
      data: {
        capabilities: result.rows,
        total: result.rows.length
      },
      reason: `Found ${result.rows.length} capabilities`,
      confidence: 100,
      endpoint: '/api/os/capabilities',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Capabilities] Error listing capabilities:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_CAPABILITIES_LIST_ERROR',
      endpoint: '/api/os/capabilities',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/capabilities/:key
 * Get single capability by key
 */
router.get('/:key', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { key } = req.params;

    const result = await db.query(`
      SELECT
        c.*,
        ARRAY_AGG(DISTINCT jsonb_build_object(
          'model_slug', m.slug,
          'model_name', m.name,
          'is_eligible', m.is_eligible,
          'quality_score', m.quality_score
        )) FILTER (WHERE mcm.is_supported = true) as supported_models
      FROM os_model_capabilities c
      LEFT JOIN os_model_capability_mappings mcm ON mcm.capability_id = c.id
      LEFT JOIN llm_models m ON mcm.model_id = m.id
      WHERE c.capability_key = $1
      GROUP BY c.id
    `, [key]);

    if (result.rows.length === 0) {
      return res.status(404).json(createOSError({
        error: `Capability not found: ${key}`,
        code: 'OS_CAPABILITY_NOT_FOUND',
        endpoint: `/api/os/capabilities/${key}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: result.rows[0],
      reason: `Found capability: ${key}`,
      confidence: 100,
      endpoint: `/api/os/capabilities/${key}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Capabilities] Error getting capability:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_CAPABILITIES_GET_ERROR',
      endpoint: `/api/os/capabilities/${req.params.key}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/capabilities
 * Create new capability
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const {
      capability_key,
      name,
      description,
      max_tokens = 4096,
      latency_class,
      risk_class,
      replay_tolerance,
      requires_vision = false,
      requires_functions = false,
      requires_json_mode = false,
      min_context_tokens = 4000
    } = req.body;

    // Validation
    if (!capability_key || !name || !latency_class || !risk_class || !replay_tolerance) {
      return res.status(400).json(createOSError({
        error: 'Required fields: capability_key, name, latency_class, risk_class, replay_tolerance',
        code: 'OS_CAPABILITY_INVALID_INPUT',
        endpoint: '/api/os/capabilities',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    // Validate enum values
    if (!['low', 'medium', 'high'].includes(latency_class)) {
      return res.status(400).json(createOSError({
        error: 'latency_class must be: low, medium, or high',
        code: 'OS_CAPABILITY_INVALID_INPUT',
        endpoint: '/api/os/capabilities',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    if (!['low', 'medium', 'high'].includes(risk_class)) {
      return res.status(400).json(createOSError({
        error: 'risk_class must be: low, medium, or high',
        code: 'OS_CAPABILITY_INVALID_INPUT',
        endpoint: '/api/os/capabilities',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    if (!['strict', 'relaxed'].includes(replay_tolerance)) {
      return res.status(400).json(createOSError({
        error: 'replay_tolerance must be: strict or relaxed',
        code: 'OS_CAPABILITY_INVALID_INPUT',
        endpoint: '/api/os/capabilities',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const result = await db.query(`
      INSERT INTO os_model_capabilities (
        capability_key, name, description, max_tokens,
        latency_class, risk_class, replay_tolerance,
        requires_vision, requires_functions, requires_json_mode,
        min_context_tokens, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
      RETURNING *
    `, [
      capability_key, name, description, max_tokens,
      latency_class, risk_class, replay_tolerance,
      requires_vision, requires_functions, requires_json_mode,
      min_context_tokens
    ]);

    res.status(201).json(createOSResponse({
      success: true,
      data: result.rows[0],
      reason: `Created capability: ${capability_key}`,
      confidence: 100,
      endpoint: '/api/os/capabilities',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Capabilities] Error creating capability:', error);
    Sentry.captureException(error);

    // Check for unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json(createOSError({
        error: `Capability already exists: ${req.body.capability_key}`,
        code: 'OS_CAPABILITY_DUPLICATE',
        endpoint: '/api/os/capabilities',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_CAPABILITIES_CREATE_ERROR',
      endpoint: '/api/os/capabilities',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * PATCH /api/os/capabilities/:key
 * Update capability
 */
router.patch('/:key', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { key } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const allowedFields = [
      'name', 'description', 'max_tokens',
      'latency_class', 'risk_class', 'replay_tolerance',
      'requires_vision', 'requires_functions', 'requires_json_mode',
      'min_context_tokens', 'is_active'
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        // Validate enum values
        if (field === 'latency_class' && !['low', 'medium', 'high'].includes(value)) {
          return res.status(400).json(createOSError({
            error: 'latency_class must be: low, medium, or high',
            code: 'OS_CAPABILITY_INVALID_INPUT',
            endpoint: `/api/os/capabilities/${key}`,
            executionTimeMs: Date.now() - startTime,
            requestId
          }));
        }
        if (field === 'risk_class' && !['low', 'medium', 'high'].includes(value)) {
          return res.status(400).json(createOSError({
            error: 'risk_class must be: low, medium, or high',
            code: 'OS_CAPABILITY_INVALID_INPUT',
            endpoint: `/api/os/capabilities/${key}`,
            executionTimeMs: Date.now() - startTime,
            requestId
          }));
        }
        if (field === 'replay_tolerance' && !['strict', 'relaxed'].includes(value)) {
          return res.status(400).json(createOSError({
            error: 'replay_tolerance must be: strict or relaxed',
            code: 'OS_CAPABILITY_INVALID_INPUT',
            endpoint: `/api/os/capabilities/${key}`,
            executionTimeMs: Date.now() - startTime,
            requestId
          }));
        }

        setClauses.push(`${field} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json(createOSError({
        error: 'No valid fields to update',
        code: 'OS_CAPABILITY_INVALID_INPUT',
        endpoint: `/api/os/capabilities/${key}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(key);

    const result = await db.query(`
      UPDATE os_model_capabilities
      SET ${setClauses.join(', ')}
      WHERE capability_key = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json(createOSError({
        error: `Capability not found: ${key}`,
        code: 'OS_CAPABILITY_NOT_FOUND',
        endpoint: `/api/os/capabilities/${key}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: result.rows[0],
      reason: `Updated capability: ${key}`,
      confidence: 100,
      endpoint: `/api/os/capabilities/${key}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Capabilities] Error updating capability:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_CAPABILITIES_UPDATE_ERROR',
      endpoint: `/api/os/capabilities/${req.params.key}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// CAPABILITY-MODEL MAPPING
// ============================================================================

/**
 * GET /api/os/capabilities/:key/models
 * Get models that support this capability
 */
router.get('/:key/models', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { key } = req.params;
    const { eligible_only } = req.query;

    let query = `
      SELECT
        m.id,
        m.slug,
        m.name,
        p.provider_type,
        m.quality_score,
        m.stability_score,
        m.is_eligible,
        m.is_active,
        (m.input_cost_per_million + m.output_cost_per_million) / 2000 as cost_per_1k,
        m.avg_latency_ms,
        mcm.reason as capability_reason
      FROM os_model_capabilities c
      JOIN os_model_capability_mappings mcm ON mcm.capability_id = c.id
      JOIN llm_models m ON mcm.model_id = m.id
      JOIN llm_providers p ON m.provider_id = p.id
      WHERE c.capability_key = $1
        AND mcm.is_supported = true
        AND m.is_active = true
    `;

    if (eligible_only === 'true') {
      query += ` AND m.is_eligible = true`;
    }

    query += `
      ORDER BY m.quality_score DESC, m.stability_score DESC
    `;

    const result = await db.query(query, [key]);

    res.json(createOSResponse({
      success: true,
      data: {
        capability_key: key,
        models: result.rows,
        total: result.rows.length
      },
      reason: `Found ${result.rows.length} models for capability: ${key}`,
      confidence: 100,
      endpoint: `/api/os/capabilities/${key}/models`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Capabilities] Error getting models for capability:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_CAPABILITIES_MODELS_ERROR',
      endpoint: `/api/os/capabilities/${req.params.key}/models`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/capabilities/:key/models
 * Map a model to this capability
 */
router.post('/:key/models', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { key } = req.params;
    const { model_slug, reason, is_supported = true } = req.body;

    if (!model_slug) {
      return res.status(400).json(createOSError({
        error: 'model_slug is required',
        code: 'OS_CAPABILITY_INVALID_INPUT',
        endpoint: `/api/os/capabilities/${key}/models`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    // Get capability and model IDs
    const [capabilityResult, modelResult] = await Promise.all([
      db.query('SELECT id FROM os_model_capabilities WHERE capability_key = $1', [key]),
      db.query('SELECT id FROM llm_models WHERE slug = $1', [model_slug])
    ]);

    if (capabilityResult.rows.length === 0) {
      return res.status(404).json(createOSError({
        error: `Capability not found: ${key}`,
        code: 'OS_CAPABILITY_NOT_FOUND',
        endpoint: `/api/os/capabilities/${key}/models`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    if (modelResult.rows.length === 0) {
      return res.status(404).json(createOSError({
        error: `Model not found: ${model_slug}`,
        code: 'OS_MODEL_NOT_FOUND',
        endpoint: `/api/os/capabilities/${key}/models`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const result = await db.query(`
      INSERT INTO os_model_capability_mappings (capability_id, model_id, is_supported, reason)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (model_id, capability_id)
      DO UPDATE SET is_supported = $3, reason = $4
      RETURNING *
    `, [capabilityResult.rows[0].id, modelResult.rows[0].id, is_supported, reason]);

    // Update model's supported_capabilities array
    await db.query(`
      UPDATE llm_models SET supported_capabilities = ARRAY(
        SELECT c.capability_key
        FROM os_model_capability_mappings mcm
        JOIN os_model_capabilities c ON mcm.capability_id = c.id
        WHERE mcm.model_id = $1 AND mcm.is_supported = true
      )
      WHERE id = $1
    `, [modelResult.rows[0].id]);

    res.status(201).json(createOSResponse({
      success: true,
      data: {
        capability_key: key,
        model_slug: model_slug,
        mapping: result.rows[0]
      },
      reason: `Mapped ${model_slug} to capability ${key}`,
      confidence: 100,
      endpoint: `/api/os/capabilities/${key}/models`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Capabilities] Error mapping model to capability:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_CAPABILITIES_MAP_ERROR',
      endpoint: `/api/os/capabilities/${req.params.key}/models`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// MODEL ELIGIBILITY
// ============================================================================

/**
 * PATCH /api/os/capabilities/models/:model_slug/eligibility
 * Set model eligibility (Switch = eligible/ineligible, not global behavior)
 */
router.patch('/models/:model_slug/eligibility', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { model_slug } = req.params;
    const { is_eligible } = req.body;

    if (typeof is_eligible !== 'boolean') {
      return res.status(400).json(createOSError({
        error: 'is_eligible must be a boolean',
        code: 'OS_CAPABILITY_INVALID_INPUT',
        endpoint: `/api/os/capabilities/models/${model_slug}/eligibility`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const result = await db.query(`
      UPDATE llm_models
      SET is_eligible = $1, updated_at = NOW()
      WHERE slug = $2
      RETURNING id, slug, name, is_eligible, supported_capabilities
    `, [is_eligible, model_slug]);

    if (result.rows.length === 0) {
      return res.status(404).json(createOSError({
        error: `Model not found: ${model_slug}`,
        code: 'OS_MODEL_NOT_FOUND',
        endpoint: `/api/os/capabilities/models/${model_slug}/eligibility`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: result.rows[0],
      reason: `Set ${model_slug} eligibility to ${is_eligible}`,
      confidence: 100,
      endpoint: `/api/os/capabilities/models/${model_slug}/eligibility`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Capabilities] Error updating model eligibility:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_CAPABILITIES_ELIGIBILITY_ERROR',
      endpoint: `/api/os/capabilities/models/${req.params.model_slug}/eligibility`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

export default router;
