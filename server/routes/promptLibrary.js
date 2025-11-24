/**
 * Prompt Library API
 * Sprint 32 - Task 3: Prompt Library Management
 *
 * Provides CRUD operations for browsing, editing, and testing prompts
 */

const express = require('express');
const pool = require('../db');
const promptManager = require('../utils/promptManager');

const router = express.Router();

// ═══════════════════════════════════════════════════════════
// BROWSE PROMPTS
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/prompt-library
 * List all prompts with filtering and pagination
 */
router.get('/', async (req, res) => {
  try {
    const {
      name,
      active,
      limit = 50,
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    let query = 'SELECT * FROM prompt_versions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (name) {
      paramCount++;
      query += ` AND name ILIKE $${paramCount}`;
      params.push(`%${name}%`);
    }

    if (active !== undefined) {
      paramCount++;
      query += ` AND active = $${paramCount}`;
      params.push(active === 'true');
    }

    const validSortFields = ['name', 'version', 'created_at', 'updated_at'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${sortField} ${sortDirection}`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM prompt_versions WHERE 1=1' +
      (name ? ' AND name ILIKE $1' : '') +
      (active !== undefined ? ` AND active = $${name ? 2 : 1}` : ''),
      params.filter((_, i) => i < paramCount)
    );

    res.json({
      prompts: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error listing prompts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/prompt-library/:name
 * Get all versions of a specific prompt
 */
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    const result = await pool.query(
      `SELECT * FROM prompt_versions
       WHERE name = $1
       ORDER BY created_at DESC`,
      [name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json({
      name,
      versions: result.rows,
      active_version: result.rows.find(v => v.active)
    });

  } catch (error) {
    console.error('Error fetching prompt versions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/prompt-library/:name/:version
 * Get a specific prompt version
 */
router.get('/:name/:version', async (req, res) => {
  try {
    const { name, version } = req.params;

    const result = await pool.query(
      'SELECT * FROM prompt_versions WHERE name = $1 AND version = $2',
      [name, version]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt version not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error fetching prompt version:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// CREATE/UPDATE PROMPTS
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/prompt-library
 * Create a new prompt version
 */
router.post('/', async (req, res) => {
  try {
    const {
      name,
      version,
      template,
      system_prompt,
      user_prompt_template,
      model = 'gpt-4o',
      temperature = 0.3,
      max_tokens = 1000,
      schema,
      golden_set = [],
      active = true
    } = req.body;

    // Validation
    if (!name || !version) {
      return res.status(400).json({ error: 'name and version are required' });
    }

    // Check if version already exists
    const existing = await pool.query(
      'SELECT id FROM prompt_versions WHERE name = $1 AND version = $2',
      [name, version]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Prompt version already exists' });
    }

    // Insert new version
    const result = await pool.query(
      `INSERT INTO prompt_versions (
        name, version, template, system_prompt, user_prompt_template,
        model, temperature, max_tokens, schema, golden_set, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        name,
        version,
        template || `${system_prompt}\n\n${user_prompt_template}`,
        system_prompt,
        user_prompt_template,
        model,
        temperature,
        max_tokens,
        schema ? JSON.stringify(schema) : null,
        JSON.stringify(golden_set),
        active
      ]
    );

    // Clear prompt manager cache
    promptManager.clearCache();

    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Error creating prompt version:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/prompt-library/:name/:version
 * Update an existing prompt version
 */
router.put('/:name/:version', async (req, res) => {
  try {
    const { name, version } = req.params;
    const updates = req.body;

    const allowedFields = [
      'template', 'system_prompt', 'user_prompt_template',
      'model', 'temperature', 'max_tokens', 'schema', 'golden_set', 'active'
    ];

    const setClause = [];
    const values = [];
    let paramCount = 0;

    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key)) {
        paramCount++;
        setClause.push(`${key} = $${paramCount}`);

        if (['schema', 'golden_set'].includes(key)) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
      }
    });

    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClause.push(`updated_at = NOW()`);
    values.push(name, version);

    const query = `
      UPDATE prompt_versions
      SET ${setClause.join(', ')}
      WHERE name = $${paramCount + 1} AND version = $${paramCount + 2}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt version not found' });
    }

    // Clear prompt manager cache
    promptManager.clearCache();

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error updating prompt version:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/prompt-library/:name/:version
 * Deactivate a prompt version
 */
router.delete('/:name/:version', async (req, res) => {
  try {
    const { name, version } = req.params;

    const result = await pool.query(
      `UPDATE prompt_versions
       SET active = false, updated_at = NOW()
       WHERE name = $1 AND version = $2
       RETURNING *`,
      [name, version]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt version not found' });
    }

    // Clear prompt manager cache
    promptManager.clearCache();

    res.json({ message: 'Prompt version deactivated', prompt: result.rows[0] });

  } catch (error) {
    console.error('Error deactivating prompt version:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// TEST PROMPTS
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/prompt-library/:name/:version/test
 * Test a prompt with sample input
 */
router.post('/:name/:version/test', async (req, res) => {
  try {
    const { name, version } = req.params;
    const { variables = {}, ab_test_enabled = false } = req.body;

    // Get prompt
    const promptResult = await pool.query(
      'SELECT * FROM prompt_versions WHERE name = $1 AND version = $2',
      [name, version]
    );

    if (promptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt version not found' });
    }

    const prompt = promptResult.rows[0];

    // Render prompt with variables
    const renderedPrompt = promptManager.renderTemplate(
      prompt.user_prompt_template || prompt.template,
      variables
    );

    res.json({
      name,
      version,
      system_prompt: prompt.system_prompt,
      rendered_user_prompt: renderedPrompt,
      model: prompt.model,
      temperature: prompt.temperature,
      max_tokens: prompt.max_tokens,
      schema: prompt.schema,
      test_variables: variables
    });

  } catch (error) {
    console.error('Error testing prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/prompt-library/:name/:version/test-golden-set
 * Test prompt against its golden test set
 */
router.post('/:name/:version/test-golden-set', async (req, res) => {
  try {
    const { name, version } = req.params;

    // Get prompt with golden set
    const promptResult = await pool.query(
      'SELECT * FROM prompt_versions WHERE name = $1 AND version = $2',
      [name, version]
    );

    if (promptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt version not found' });
    }

    const prompt = promptResult.rows[0];

    if (!prompt.golden_set || prompt.golden_set.length === 0) {
      return res.status(400).json({ error: 'No golden test set defined' });
    }

    // Test each case
    const results = prompt.golden_set.map(testCase => {
      const rendered = promptManager.renderTemplate(
        prompt.user_prompt_template || prompt.template,
        testCase.input || {}
      );

      return {
        input: testCase.input,
        expected: testCase.expected,
        rendered_prompt: rendered,
        passed: null // Would be set by actual LLM execution
      };
    });

    res.json({
      name,
      version,
      golden_set_size: prompt.golden_set.length,
      test_results: results
    });

  } catch (error) {
    console.error('Error testing golden set:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
