/**
 * Config API Routes
 * Sprint 55: Config-Driven OS Kernel
 *
 * Endpoints for config management.
 * All config access goes through ConfigLoader service.
 */

import express from 'express';
import {
  configLoader,
  getConfig,
  getNamespaceConfig,
  getConfigSnapshot,
  setConfig
} from '../../services/configLoader.js';

const router = express.Router();

// ============================================================================
// HELPER: Extract context from request
// ============================================================================

function getContext(req) {
  return {
    actorId: req.headers['x-actor-id'] || req.body?.actorId,
    actorType: req.headers['x-actor-type'] || req.body?.actorType || 'api',
    vertical: req.headers['x-vertical'] || req.query?.vertical,
    territory: req.headers['x-territory'] || req.query?.territory,
    environment: req.headers['x-environment'] || req.query?.environment
  };
}

// ============================================================================
// CONFIG READ ENDPOINTS
// ============================================================================

/**
 * GET /api/os/config
 * Get config summary
 */
router.get('/', async (req, res) => {
  try {
    const namespaces = ['discovery', 'enrichment', 'scoring', 'llm', 'pipeline', 'outreach', 'system'];
    const summary = {};

    for (const ns of namespaces) {
      const configs = await getNamespaceConfig(ns, getContext(req));
      summary[ns] = {
        keys: Object.keys(configs),
        count: Object.keys(configs).length
      };
    }

    res.json({
      success: true,
      environment: process.env.NODE_ENV || 'production',
      namespaces: summary
    });
  } catch (error) {
    console.error('Error getting config summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/config/:namespace
 * Get all configs for a namespace
 */
router.get('/:namespace', async (req, res) => {
  try {
    const { namespace } = req.params;
    const context = getContext(req);

    const configs = await getNamespaceConfig(namespace, context);

    res.json({
      success: true,
      namespace,
      data: configs
    });
  } catch (error) {
    console.error('Error getting namespace config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/config/:namespace/:key
 * Get single config value
 */
router.get('/:namespace/:key', async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const context = getContext(req);

    const value = await getConfig(namespace, key, context);

    if (value === null) {
      return res.status(404).json({
        success: false,
        error: `Config not found: ${namespace}.${key}`
      });
    }

    res.json({
      success: true,
      namespace,
      key,
      value
    });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/config/batch
 * Get multiple configs at once
 */
router.post('/batch', async (req, res) => {
  try {
    const { keys } = req.body;
    const context = getContext(req);

    if (!Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'keys must be a non-empty array of {namespace, key}'
      });
    }

    const configs = await configLoader.getMany(keys, context);

    res.json({
      success: true,
      data: configs
    });
  } catch (error) {
    console.error('Error getting batch configs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/config/snapshot
 * Get deterministic config snapshot
 */
router.post('/snapshot', async (req, res) => {
  try {
    const { namespaces = ['discovery', 'enrichment', 'scoring', 'llm', 'pipeline'] } = req.body;
    const context = getContext(req);

    const snapshot = await getConfigSnapshot(namespaces, context);

    res.json({
      success: true,
      data: snapshot
    });
  } catch (error) {
    console.error('Error getting config snapshot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/config/snapshot/validate
 * Validate a config snapshot against current config
 */
router.post('/snapshot/validate', async (req, res) => {
  try {
    const { snapshot, namespaces } = req.body;

    if (!snapshot || !namespaces) {
      return res.status(400).json({
        success: false,
        error: 'snapshot and namespaces are required'
      });
    }

    const result = await configLoader.validateSnapshot(snapshot, namespaces);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error validating snapshot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// CONFIG WRITE ENDPOINTS (SUPER-ADMIN ONLY)
// ============================================================================

/**
 * PUT /api/os/config/:namespace/:key
 * Set config value
 */
router.put('/:namespace/:key', async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const { value } = req.body;
    const context = getContext(req);

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'value is required'
      });
    }

    // Validate before setting
    const validation = await configLoader.validate(namespace, key, value);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validation.errors
      });
    }

    const result = await setConfig(namespace, key, value, context);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error setting config:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/os/config/:namespace/:key
 * Deactivate config
 */
router.delete('/:namespace/:key', async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const context = getContext(req);

    const result = await configLoader.delete(namespace, key, context);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Config not found'
      });
    }

    res.json({
      success: true,
      message: `Config ${namespace}.${key} deactivated`
    });
  } catch (error) {
    console.error('Error deleting config:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// VERSION MANAGEMENT
// ============================================================================

/**
 * GET /api/os/config/:namespace/:key/versions
 * Get version history
 */
router.get('/:namespace/:key/versions', async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const { limit = 10 } = req.query;

    const versions = await configLoader.getVersionHistory(namespace, key, parseInt(limit));

    res.json({
      success: true,
      data: versions
    });
  } catch (error) {
    console.error('Error getting versions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/config/:namespace/:key/rollback
 * Rollback to specific version
 */
router.post('/:namespace/:key/rollback', async (req, res) => {
  try {
    const { namespace, key } = req.params;
    const { version } = req.body;
    const context = getContext(req);

    if (!version) {
      return res.status(400).json({
        success: false,
        error: 'version is required'
      });
    }

    await configLoader.rollbackToVersion(namespace, key, version, context);

    res.json({
      success: true,
      message: `Rolled back ${namespace}.${key} to version ${version}`
    });
  } catch (error) {
    console.error('Error rolling back:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// PRESETS
// ============================================================================

/**
 * GET /api/os/config/presets
 * Get all presets
 */
router.get('/presets', async (req, res) => {
  try {
    const { type } = req.query;
    const presets = await configLoader.getPresets(type);

    res.json({
      success: true,
      data: presets
    });
  } catch (error) {
    console.error('Error getting presets:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/config/presets/:slug/apply
 * Apply a preset
 */
router.post('/presets/:slug/apply', async (req, res) => {
  try {
    const { slug } = req.params;
    const context = getContext(req);

    const count = await configLoader.applyPreset(slug, context);

    res.json({
      success: true,
      message: `Applied preset ${slug}`,
      configsApplied: count
    });
  } catch (error) {
    console.error('Error applying preset:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * POST /api/os/config/reload
 * Hot reload all configs
 */
router.post('/reload', async (req, res) => {
  try {
    await configLoader.reload();

    res.json({
      success: true,
      message: 'Config cache reloaded'
    });
  } catch (error) {
    console.error('Error reloading config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/config/:namespace/reload
 * Hot reload specific namespace
 */
router.post('/:namespace/reload', async (req, res) => {
  try {
    const { namespace } = req.params;
    await configLoader.reloadNamespace(namespace);

    res.json({
      success: true,
      message: `Namespace ${namespace} reloaded`
    });
  } catch (error) {
    console.error('Error reloading namespace:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/config/:namespace/:key/invalidate
 * Invalidate specific config cache
 */
router.post('/:namespace/:key/invalidate', async (req, res) => {
  try {
    const { namespace, key } = req.params;
    configLoader.invalidate(namespace, key);

    res.json({
      success: true,
      message: `Cache invalidated for ${namespace}.${key}`
    });
  } catch (error) {
    console.error('Error invalidating cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
