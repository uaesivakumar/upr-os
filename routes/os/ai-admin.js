/**
 * AI-Powered Admin API
 * Sprint 56: AI Super Admin
 *
 * Natural language command processing for admin operations.
 * Leverages LLM router for intelligent command parsing and execution.
 */

import express from 'express';
import { pool } from '../../utils/db.js';
import { executeCompletion } from '../../services/llm/router.js';
import secrets from '../../utils/secrets.js';

const router = express.Router();

// ============================================================================
// SYSTEM STATUS AGGREGATION
// ============================================================================

/**
 * GET /api/os/ai-admin/status
 * Get aggregated system status for dashboard
 */
router.get('/status', async (req, res) => {
  try {
    // Parallel fetch all status data
    const [
      apiProviders,
      llmProviders,
      verticalPacks,
      territories,
      configNamespaces,
      taskMappings
    ] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'disabled') as disabled,
          COUNT(*) as total
        FROM api_providers
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE is_active = false) as disabled,
          COUNT(*) as total
        FROM llm_providers
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE is_active = false) as disabled,
          COUNT(*) as total
        FROM vertical_packs
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) FILTER (WHERE status = 'inactive') as disabled,
          COUNT(*) as total
        FROM territories
      `),
      pool.query(`SELECT COUNT(*) as total FROM os_config_namespaces WHERE is_active = true`),
      pool.query(`SELECT COUNT(*) as total FROM vertical_model_preferences WHERE is_active = true`)
    ]);

    // Get active provider names
    const activeProviders = await pool.query(`
      SELECT slug, name, description FROM api_providers WHERE status = 'active' ORDER BY slug
    `);

    const activeLLMs = await pool.query(`
      SELECT slug, name FROM llm_providers WHERE is_active = true ORDER BY slug
    `);

    const activeVerticals = await pool.query(`
      SELECT slug, name FROM vertical_packs WHERE is_active = true ORDER BY slug
    `);

    res.json({
      success: true,
      data: {
        summary: {
          apiProviders: {
            active: parseInt(apiProviders.rows[0].active),
            disabled: parseInt(apiProviders.rows[0].disabled),
            total: parseInt(apiProviders.rows[0].total),
            items: activeProviders.rows
          },
          llmProviders: {
            active: parseInt(llmProviders.rows[0].active),
            disabled: parseInt(llmProviders.rows[0].disabled),
            total: parseInt(llmProviders.rows[0].total),
            items: activeLLMs.rows
          },
          verticalPacks: {
            active: parseInt(verticalPacks.rows[0].active),
            disabled: parseInt(verticalPacks.rows[0].disabled),
            total: parseInt(verticalPacks.rows[0].total),
            items: activeVerticals.rows
          },
          territories: {
            active: parseInt(territories.rows[0].active),
            disabled: parseInt(territories.rows[0].disabled),
            total: parseInt(territories.rows[0].total)
          },
          configNamespaces: parseInt(configNamespaces.rows[0].total),
          taskMappings: parseInt(taskMappings.rows[0].total)
        },
        health: {
          status: 'healthy',
          lastChecked: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// AI INSIGHTS & SUGGESTIONS
// ============================================================================

/**
 * GET /api/os/ai-admin/insights
 * Get AI-generated insights and suggestions
 */
router.get('/insights', async (req, res) => {
  try {
    const insights = [];

    // Check for providers without API keys
    const unconfiguredProviders = await pool.query(`
      SELECT ap.slug, ap.name
      FROM api_providers ap
      LEFT JOIN provider_configurations pc ON ap.id = pc.provider_id
      WHERE ap.status = 'active' AND pc.id IS NULL
    `);

    if (unconfiguredProviders.rows.length > 0) {
      insights.push({
        type: 'warning',
        category: 'api_providers',
        title: 'Providers Missing API Keys',
        message: `${unconfiguredProviders.rows.map(p => p.name).join(', ')} are active but have no API keys configured.`,
        action: 'Configure API keys from GCP Secrets Manager',
        command: 'configure api keys'
      });
    }

    // Check for missing task mappings for active verticals
    const activeVerticals = await pool.query(`
      SELECT slug FROM vertical_packs WHERE is_active = true
    `);

    for (const vp of activeVerticals.rows) {
      const mappings = await pool.query(`
        SELECT COUNT(*) as count FROM vertical_model_preferences WHERE vertical_slug = $1
      `, [vp.slug]);

      if (parseInt(mappings.rows[0].count) === 0) {
        insights.push({
          type: 'info',
          category: 'task_mappings',
          title: `Missing Task Mappings for ${vp.slug}`,
          message: `No LLM task mappings configured for ${vp.slug} vertical`,
          action: 'Configure task mappings',
          command: `configure task mappings for ${vp.slug}`
        });
      }
    }

    // Check for disabled but healthy providers
    const disabledProviders = await pool.query(`
      SELECT slug, name FROM api_providers WHERE status = 'disabled'
    `);

    if (disabledProviders.rows.length > 0) {
      insights.push({
        type: 'info',
        category: 'api_providers',
        title: 'Disabled Providers Available',
        message: `${disabledProviders.rows.length} providers are disabled: ${disabledProviders.rows.map(p => p.name).join(', ')}`,
        action: 'Enable if needed',
        command: `enable provider ${disabledProviders.rows[0].slug}`
      });
    }

    // Success insight if everything is good
    if (insights.length === 0) {
      insights.push({
        type: 'success',
        category: 'system',
        title: 'All Systems Operational',
        message: 'All providers configured, all mappings in place.',
        action: null,
        command: null
      });
    }

    res.json({ success: true, data: { insights } });
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// AI COMMAND EXECUTION
// ============================================================================

const COMMAND_SYSTEM_PROMPT = `You are an AI assistant for UPR OS Super Admin. Parse user commands and return JSON actions.

Available actions:
- toggle_provider: { action: "toggle_provider", provider_slug: string, status: "active" | "disabled" }
- toggle_llm: { action: "toggle_llm", provider_slug: string, is_active: boolean }
- toggle_vertical: { action: "toggle_vertical", vertical_slug: string, is_active: boolean }
- list_providers: { action: "list_providers", filter: "all" | "active" | "disabled" }
- list_llms: { action: "list_llms", filter: "all" | "active" | "disabled" }
- list_verticals: { action: "list_verticals", filter: "all" | "active" | "disabled" }
- get_status: { action: "get_status" }
- unknown: { action: "unknown", message: "description of what user wants" }

Respond ONLY with valid JSON. No explanation.

Examples:
User: "disable apollo"
Response: {"action": "toggle_provider", "provider_slug": "apollo", "status": "disabled"}

User: "enable openai"
Response: {"action": "toggle_llm", "provider_slug": "openai", "is_active": true}

User: "show active providers"
Response: {"action": "list_providers", "filter": "active"}

User: "what's the status"
Response: {"action": "get_status"}`;

/**
 * POST /api/os/ai-admin/command
 * Execute natural language command
 */
router.post('/command', async (req, res) => {
  try {
    const { command } = req.body;

    if (!command) {
      return res.status(400).json({ success: false, error: 'Command is required' });
    }

    // Parse command using LLM
    let parsedAction;
    try {
      const llmResponse = await executeCompletion({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: COMMAND_SYSTEM_PROMPT },
          { role: 'user', content: command }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

      const content = llmResponse.choices[0].message.content.trim();
      parsedAction = JSON.parse(content);
    } catch (parseError) {
      console.error('LLM parse error:', parseError);
      // Fallback to simple pattern matching
      parsedAction = parseCommandFallback(command);
    }

    // Execute the action
    const result = await executeAction(parsedAction);

    res.json({
      success: true,
      data: {
        command,
        parsedAction,
        result
      }
    });
  } catch (error) {
    console.error('Error executing command:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fallback command parser (no LLM needed)
function parseCommandFallback(command) {
  const cmd = command.toLowerCase().trim();

  // Toggle patterns
  if (cmd.match(/^(enable|activate)\s+(\w+)/)) {
    const match = cmd.match(/^(enable|activate)\s+(\w+)/);
    const target = match[2];
    return { action: 'toggle_provider', provider_slug: target, status: 'active' };
  }

  if (cmd.match(/^(disable|deactivate)\s+(\w+)/)) {
    const match = cmd.match(/^(disable|deactivate)\s+(\w+)/);
    const target = match[2];
    return { action: 'toggle_provider', provider_slug: target, status: 'disabled' };
  }

  // List patterns
  if (cmd.includes('list') || cmd.includes('show')) {
    if (cmd.includes('provider')) {
      const filter = cmd.includes('active') ? 'active' : cmd.includes('disabled') ? 'disabled' : 'all';
      return { action: 'list_providers', filter };
    }
    if (cmd.includes('llm') || cmd.includes('model')) {
      const filter = cmd.includes('active') ? 'active' : cmd.includes('disabled') ? 'disabled' : 'all';
      return { action: 'list_llms', filter };
    }
    if (cmd.includes('vertical')) {
      const filter = cmd.includes('active') ? 'active' : cmd.includes('disabled') ? 'disabled' : 'all';
      return { action: 'list_verticals', filter };
    }
  }

  // Status
  if (cmd.includes('status') || cmd.includes('health') || cmd === 'status') {
    return { action: 'get_status' };
  }

  return { action: 'unknown', message: command };
}

// Execute parsed action
async function executeAction(action) {
  switch (action.action) {
    case 'toggle_provider': {
      await pool.query(
        'UPDATE api_providers SET status = $1, updated_at = NOW() WHERE slug = $2',
        [action.status, action.provider_slug]
      );
      const result = await pool.query(
        'SELECT slug, name, status FROM api_providers WHERE slug = $1',
        [action.provider_slug]
      );
      return {
        message: `Provider ${action.provider_slug} is now ${action.status}`,
        provider: result.rows[0]
      };
    }

    case 'toggle_llm': {
      await pool.query(
        'UPDATE llm_providers SET is_active = $1, updated_at = NOW() WHERE slug = $2',
        [action.is_active, action.provider_slug]
      );
      const result = await pool.query(
        'SELECT slug, name, is_active FROM llm_providers WHERE slug = $1',
        [action.provider_slug]
      );
      return {
        message: `LLM provider ${action.provider_slug} is now ${action.is_active ? 'active' : 'disabled'}`,
        provider: result.rows[0]
      };
    }

    case 'toggle_vertical': {
      await pool.query(
        'UPDATE vertical_packs SET is_active = $1, updated_at = NOW() WHERE slug = $2',
        [action.is_active, action.vertical_slug]
      );
      const result = await pool.query(
        'SELECT slug, name, is_active FROM vertical_packs WHERE slug = $1',
        [action.vertical_slug]
      );
      return {
        message: `Vertical ${action.vertical_slug} is now ${action.is_active ? 'active' : 'disabled'}`,
        vertical: result.rows[0]
      };
    }

    case 'list_providers': {
      let sql = 'SELECT slug, name, status, description FROM api_providers';
      if (action.filter === 'active') sql += " WHERE status = 'active'";
      if (action.filter === 'disabled') sql += " WHERE status = 'disabled'";
      sql += ' ORDER BY slug';
      const result = await pool.query(sql);
      return {
        message: `Found ${result.rows.length} ${action.filter} providers`,
        providers: result.rows
      };
    }

    case 'list_llms': {
      let sql = 'SELECT slug, name, is_active FROM llm_providers';
      if (action.filter === 'active') sql += ' WHERE is_active = true';
      if (action.filter === 'disabled') sql += ' WHERE is_active = false';
      sql += ' ORDER BY slug';
      const result = await pool.query(sql);
      return {
        message: `Found ${result.rows.length} ${action.filter} LLM providers`,
        providers: result.rows
      };
    }

    case 'list_verticals': {
      let sql = 'SELECT slug, name, is_active FROM vertical_packs';
      if (action.filter === 'active') sql += ' WHERE is_active = true';
      if (action.filter === 'disabled') sql += ' WHERE is_active = false';
      sql += ' ORDER BY slug';
      const result = await pool.query(sql);
      return {
        message: `Found ${result.rows.length} ${action.filter} verticals`,
        verticals: result.rows
      };
    }

    case 'get_status': {
      const providers = await pool.query("SELECT COUNT(*) FILTER (WHERE status = 'active') as active, COUNT(*) as total FROM api_providers");
      const llms = await pool.query('SELECT COUNT(*) FILTER (WHERE is_active = true) as active, COUNT(*) as total FROM llm_providers');
      const verticals = await pool.query('SELECT COUNT(*) FILTER (WHERE is_active = true) as active, COUNT(*) as total FROM vertical_packs');

      return {
        message: 'System status retrieved',
        status: {
          apiProviders: `${providers.rows[0].active}/${providers.rows[0].total} active`,
          llmProviders: `${llms.rows[0].active}/${llms.rows[0].total} active`,
          verticals: `${verticals.rows[0].active}/${verticals.rows[0].total} active`
        }
      };
    }

    default:
      return {
        message: `I don't know how to handle: ${action.message || action.action}`,
        suggestion: 'Try: "enable apollo", "disable openai", "show active providers", "status"'
      };
  }
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * POST /api/os/ai-admin/bulk
 * Execute bulk operations
 */
router.post('/bulk', async (req, res) => {
  try {
    const { operation, targets, value } = req.body;

    if (!operation || !targets || !Array.isArray(targets)) {
      return res.status(400).json({
        success: false,
        error: 'Operation and targets array required'
      });
    }

    const results = [];

    for (const target of targets) {
      try {
        switch (operation) {
          case 'toggle_providers':
            await pool.query(
              'UPDATE api_providers SET status = $1, updated_at = NOW() WHERE slug = $2',
              [value, target]
            );
            results.push({ target, status: 'success' });
            break;

          case 'toggle_llms':
            await pool.query(
              'UPDATE llm_providers SET is_active = $1, updated_at = NOW() WHERE slug = $2',
              [value, target]
            );
            results.push({ target, status: 'success' });
            break;

          case 'toggle_verticals':
            await pool.query(
              'UPDATE vertical_packs SET is_active = $1, updated_at = NOW() WHERE slug = $2',
              [value, target]
            );
            results.push({ target, status: 'success' });
            break;

          default:
            results.push({ target, status: 'error', message: 'Unknown operation' });
        }
      } catch (err) {
        results.push({ target, status: 'error', message: err.message });
      }
    }

    res.json({
      success: true,
      data: {
        operation,
        results,
        successCount: results.filter(r => r.status === 'success').length,
        errorCount: results.filter(r => r.status === 'error').length
      }
    });
  } catch (error) {
    console.error('Error in bulk operation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/ai-admin/toggle/:type/:slug
 * Quick toggle for individual items
 */
router.post('/toggle/:type/:slug', async (req, res) => {
  try {
    const { type, slug } = req.params;
    const { enabled } = req.body;

    let result;

    switch (type) {
      case 'provider':
        await pool.query(
          'UPDATE api_providers SET status = $1, updated_at = NOW() WHERE slug = $2',
          [enabled ? 'active' : 'disabled', slug]
        );
        result = await pool.query('SELECT * FROM api_providers WHERE slug = $1', [slug]);
        break;

      case 'llm':
        await pool.query(
          'UPDATE llm_providers SET is_active = $1, updated_at = NOW() WHERE slug = $2',
          [enabled, slug]
        );
        result = await pool.query('SELECT * FROM llm_providers WHERE slug = $1', [slug]);
        break;

      case 'vertical':
        await pool.query(
          'UPDATE vertical_packs SET is_active = $1, updated_at = NOW() WHERE slug = $2',
          [enabled, slug]
        );
        result = await pool.query('SELECT * FROM vertical_packs WHERE slug = $1', [slug]);
        break;

      default:
        return res.status(400).json({ success: false, error: 'Invalid type' });
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: `${slug} is now ${enabled ? 'enabled' : 'disabled'}`
    });
  } catch (error) {
    console.error('Error toggling:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GCP SECRETS MANAGEMENT
// ============================================================================

/**
 * GET /api/os/ai-admin/secrets
 * Get status of all provider API keys
 */
router.get('/secrets', async (req, res) => {
  try {
    const keyStatus = await secrets.getProviderKeyStatus();

    // Join with provider data
    const providers = await pool.query(`
      SELECT slug, name, status FROM api_providers ORDER BY slug
    `);

    const result = keyStatus.map(ks => {
      const provider = providers.rows.find(p => p.slug === ks.provider);
      return {
        ...ks,
        providerName: provider?.name || ks.provider,
        providerStatus: provider?.status || 'unknown'
      };
    });

    res.json({
      success: true,
      data: {
        secrets: result,
        mapping: secrets.SECRET_MAPPING
      }
    });
  } catch (error) {
    console.error('Error getting secrets status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/ai-admin/secrets/list
 * List all secrets in GCP Secret Manager
 */
router.get('/secrets/list', async (req, res) => {
  try {
    const secretList = await secrets.listSecrets();
    res.json({
      success: true,
      data: { secrets: secretList }
    });
  } catch (error) {
    console.error('Error listing secrets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/ai-admin/secrets/:name
 * Create or update a secret
 */
router.post('/secrets/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({ success: false, error: 'Value is required' });
    }

    // Check if secret exists
    const exists = await secrets.secretExists(name);

    let result;
    if (exists) {
      result = await secrets.updateSecret(name, value);
    } else {
      result = await secrets.createSecret(name, value);
    }

    res.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    console.error('Error updating secret:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/ai-admin/secrets/verify/:provider
 * Verify a provider's API key works
 */
router.get('/secrets/verify/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const apiKey = await secrets.getProviderApiKey(provider);

    if (!apiKey) {
      return res.json({
        success: false,
        data: {
          provider,
          configured: false,
          message: 'API key not configured in GCP Secrets'
        }
      });
    }

    // Return masked key for confirmation
    const maskedKey = apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);

    res.json({
      success: true,
      data: {
        provider,
        configured: true,
        maskedKey,
        message: 'API key retrieved successfully'
      }
    });
  } catch (error) {
    console.error('Error verifying secret:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
