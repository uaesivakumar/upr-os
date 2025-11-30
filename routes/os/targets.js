/**
 * Discovery Target Types API Routes
 * Sprint 56: Discovery Target Types
 *
 * Endpoints for managing discovery target types, sources, and strategies.
 */

import express from 'express';
import * as discoveryTargets from '../../services/discoveryTargets.js';

const router = express.Router();

// ============================================================================
// HELPER: Extract context from request
// ============================================================================

function getContext(req) {
  return {
    actorId: req.headers['x-actor-id'] || req.body?.actorId,
    actorType: req.headers['x-actor-type'] || req.body?.actorType || 'api',
    vertical: req.headers['x-vertical'] || req.query?.vertical,
    territory: req.headers['x-territory'] || req.query?.territory
  };
}

// ============================================================================
// TARGET TYPES
// ============================================================================

/**
 * GET /api/os/targets
 * List all target types
 */
router.get('/', async (req, res) => {
  try {
    const { category, entityType, vertical, includeInactive } = req.query;

    const targetTypes = await discoveryTargets.getAllTargetTypes({
      category,
      entityType,
      verticalSlug: vertical,
      includeInactive: includeInactive === 'true'
    });

    res.json({
      success: true,
      data: targetTypes,
      count: targetTypes.length
    });
  } catch (error) {
    console.error('Error listing target types:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/targets/dashboard
 * Get discovery dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const dashboard = await discoveryTargets.getDashboard();

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error('Error getting dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/targets/:identifier
 * Get single target type
 */
router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { withConfig } = req.query;
    const context = getContext(req);

    const targetType = withConfig === 'true'
      ? await discoveryTargets.getTargetTypeConfig(identifier, context)
      : await discoveryTargets.getTargetType(identifier);

    if (!targetType) {
      return res.status(404).json({
        success: false,
        error: 'Target type not found'
      });
    }

    res.json({
      success: true,
      data: targetType
    });
  } catch (error) {
    console.error('Error getting target type:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/targets
 * Create target type
 */
router.post('/', async (req, res) => {
  try {
    const targetType = await discoveryTargets.createTargetType(req.body);

    res.status(201).json({
      success: true,
      data: targetType
    });
  } catch (error) {
    console.error('Error creating target type:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/os/targets/:identifier
 * Update target type
 */
router.patch('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    const targetType = await discoveryTargets.updateTargetType(identifier, req.body);

    if (!targetType) {
      return res.status(404).json({
        success: false,
        error: 'Target type not found'
      });
    }

    res.json({
      success: true,
      data: targetType
    });
  } catch (error) {
    console.error('Error updating target type:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/os/targets/:identifier
 * Delete target type
 */
router.delete('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    const targetType = await discoveryTargets.deleteTargetType(identifier);

    if (!targetType) {
      return res.status(404).json({
        success: false,
        error: 'Target type not found'
      });
    }

    res.json({
      success: true,
      message: 'Target type deactivated'
    });
  } catch (error) {
    console.error('Error deleting target type:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SOURCES
// ============================================================================

/**
 * GET /api/os/targets/sources
 * List all discovery sources
 */
router.get('/sources', async (req, res) => {
  try {
    const { sourceType, healthStatus, includeInactive } = req.query;

    const sources = await discoveryTargets.getAllSources({
      sourceType,
      healthStatus,
      includeInactive: includeInactive === 'true'
    });

    res.json({
      success: true,
      data: sources,
      count: sources.length
    });
  } catch (error) {
    console.error('Error listing sources:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/targets/sources/:identifier
 * Get single source
 */
router.get('/sources/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    const source = await discoveryTargets.getSource(identifier);

    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found'
      });
    }

    res.json({
      success: true,
      data: source
    });
  } catch (error) {
    console.error('Error getting source:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/targets/sources/:identifier/health
 * Update source health status
 */
router.post('/sources/:identifier/health', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { healthStatus } = req.body;

    const source = await discoveryTargets.updateSourceHealth(identifier, healthStatus);

    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found'
      });
    }

    res.json({
      success: true,
      data: source
    });
  } catch (error) {
    console.error('Error updating source health:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/targets/:identifier/sources
 * Get sources for a target type
 */
router.get('/:identifier/sources', async (req, res) => {
  try {
    const { identifier } = req.params;

    const targetType = await discoveryTargets.getTargetType(identifier);
    if (!targetType) {
      return res.status(404).json({
        success: false,
        error: 'Target type not found'
      });
    }

    const sources = await discoveryTargets.getTargetTypeSources(targetType.id);

    res.json({
      success: true,
      data: sources
    });
  } catch (error) {
    console.error('Error getting target type sources:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/targets/:identifier/sources
 * Associate source with target type
 */
router.post('/:identifier/sources', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { sourceId, priority, weight, isPrimary, configOverride } = req.body;

    const targetType = await discoveryTargets.getTargetType(identifier);
    if (!targetType) {
      return res.status(404).json({
        success: false,
        error: 'Target type not found'
      });
    }

    const association = await discoveryTargets.associateSource(
      targetType.id,
      sourceId,
      { priority, weight, isPrimary, configOverride }
    );

    res.status(201).json({
      success: true,
      data: association
    });
  } catch (error) {
    console.error('Error associating source:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/os/targets/:identifier/sources/:sourceId
 * Remove source from target type
 */
router.delete('/:identifier/sources/:sourceId', async (req, res) => {
  try {
    const { identifier, sourceId } = req.params;

    const targetType = await discoveryTargets.getTargetType(identifier);
    if (!targetType) {
      return res.status(404).json({
        success: false,
        error: 'Target type not found'
      });
    }

    const result = await discoveryTargets.disassociateSource(targetType.id, sourceId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Source association not found'
      });
    }

    res.json({
      success: true,
      message: 'Source disassociated'
    });
  } catch (error) {
    console.error('Error disassociating source:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// STRATEGIES
// ============================================================================

/**
 * GET /api/os/targets/:identifier/strategies
 * Get strategies for a target type
 */
router.get('/:identifier/strategies', async (req, res) => {
  try {
    const { identifier } = req.params;
    const context = getContext(req);

    const targetType = await discoveryTargets.getTargetType(identifier);
    if (!targetType) {
      return res.status(404).json({
        success: false,
        error: 'Target type not found'
      });
    }

    const strategies = await discoveryTargets.getTargetTypeStrategies(targetType.id, context);

    res.json({
      success: true,
      data: strategies
    });
  } catch (error) {
    console.error('Error getting strategies:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/targets/:identifier/strategies
 * Create strategy for target type
 */
router.post('/:identifier/strategies', async (req, res) => {
  try {
    const { identifier } = req.params;

    const targetType = await discoveryTargets.getTargetType(identifier);
    if (!targetType) {
      return res.status(404).json({
        success: false,
        error: 'Target type not found'
      });
    }

    const strategy = await discoveryTargets.createStrategy(targetType.id, req.body);

    res.status(201).json({
      success: true,
      data: strategy
    });
  } catch (error) {
    console.error('Error creating strategy:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/os/targets/strategies/:id
 * Update strategy
 */
router.patch('/strategies/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const strategy = await discoveryTargets.updateStrategy(id, req.body);

    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: 'Strategy not found'
      });
    }

    res.json({
      success: true,
      data: strategy
    });
  } catch (error) {
    console.error('Error updating strategy:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/os/targets/strategies/:id
 * Delete strategy
 */
router.delete('/strategies/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const strategy = await discoveryTargets.deleteStrategy(id);

    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: 'Strategy not found'
      });
    }

    res.json({
      success: true,
      message: 'Strategy deactivated'
    });
  } catch (error) {
    console.error('Error deleting strategy:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/targets/:identifier/select-strategy
 * Select best strategy for context
 */
router.post('/:identifier/select-strategy', async (req, res) => {
  try {
    const { identifier } = req.params;
    const context = { ...getContext(req), ...req.body };

    const strategy = await discoveryTargets.selectStrategy(identifier, context);

    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: 'No matching strategy found'
      });
    }

    res.json({
      success: true,
      data: strategy
    });
  } catch (error) {
    console.error('Error selecting strategy:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * POST /api/os/targets/:identifier/execute
 * Execute discovery for a target type
 */
router.post('/:identifier/execute', async (req, res) => {
  try {
    const { identifier } = req.params;
    const context = getContext(req);

    const result = await discoveryTargets.executeDiscovery(identifier, req.body, context);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error executing discovery:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/targets/runs
 * Get discovery run history
 */
router.get('/runs', async (req, res) => {
  try {
    const { targetTypeId, status, limit, offset } = req.query;

    const runs = await discoveryTargets.getRunHistory({
      targetTypeId,
      status,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    res.json({
      success: true,
      data: runs
    });
  } catch (error) {
    console.error('Error getting run history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
