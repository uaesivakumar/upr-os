/**
 * Territory Management API Routes
 * Sprint 53: Super-Admin Territory Management
 *
 * Endpoints for hierarchical territory management.
 */

import express from 'express';
import * as territoryService from '../../services/territory.js';

const router = express.Router();

// ============================================================================
// HELPER: Extract context from request
// ============================================================================

function getContext(req) {
  return {
    actorId: req.headers['x-actor-id'] || req.body?.actorId,
    actorType: req.headers['x-actor-type'] || req.body?.actorType || 'api',
    actorIp: req.headers['x-forwarded-for'] || req.ip,
    requestId: req.headers['x-request-id']
  };
}

// ============================================================================
// TERRITORY CRUD
// ============================================================================

/**
 * GET /api/os/territories
 * List all territories with optional filtering
 */
router.get('/', async (req, res) => {
  try {
    const { level, status, parentId, countryCode, includeInactive } = req.query;

    const territories = await territoryService.getAllTerritories({
      level,
      status,
      parentId,
      countryCode,
      includeInactive: includeInactive === 'true'
    });

    res.json({
      success: true,
      data: territories,
      count: territories.length
    });
  } catch (error) {
    console.error('Error listing territories:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/territories/:identifier
 * Get single territory by slug or ID
 */
router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { withConfig } = req.query;

    const territory = withConfig === 'true'
      ? await territoryService.getTerritoryConfig(identifier)
      : await territoryService.getTerritory(identifier);

    if (!territory) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: territory
    });
  } catch (error) {
    console.error('Error getting territory:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/territories
 * Create new territory
 */
router.post('/', async (req, res) => {
  try {
    const context = getContext(req);
    const territory = await territoryService.createTerritory(req.body, context);

    res.status(201).json({
      success: true,
      data: territory
    });
  } catch (error) {
    console.error('Error creating territory:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/os/territories/:identifier
 * Update territory
 */
router.patch('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const context = getContext(req);

    const territory = await territoryService.updateTerritory(identifier, req.body, context);

    if (!territory) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: territory
    });
  } catch (error) {
    console.error('Error updating territory:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/os/territories/:identifier
 * Soft delete territory
 */
router.delete('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const context = getContext(req);

    const territory = await territoryService.deleteTerritory(identifier, context);

    if (!territory) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: territory,
      message: 'Territory deactivated successfully'
    });
  } catch (error) {
    console.error('Error deleting territory:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HIERARCHY
// ============================================================================

/**
 * GET /api/os/territories/:identifier/hierarchy
 * Get territory hierarchy (children tree)
 */
router.get('/:identifier/hierarchy', async (req, res) => {
  try {
    const { identifier } = req.params;

    const result = await territoryService.getTerritoryHierarchy(identifier);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting hierarchy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/territories/:identifier/ancestors
 * Get territory ancestors (path to root)
 */
router.get('/:identifier/ancestors', async (req, res) => {
  try {
    const { identifier } = req.params;

    const ancestors = await territoryService.getTerritoryAncestors(identifier);

    if (!ancestors) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: ancestors
    });
  } catch (error) {
    console.error('Error getting ancestors:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/territories/:identifier/move
 * Move territory to new parent
 */
router.post('/:identifier/move', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { newParentId } = req.body;
    const context = getContext(req);

    const territory = await territoryService.moveTerritory(identifier, newParentId, context);

    if (!territory) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: territory
    });
  } catch (error) {
    console.error('Error moving territory:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// VERTICALS
// ============================================================================

/**
 * GET /api/os/territories/:identifier/verticals
 * Get verticals assigned to territory
 */
router.get('/:identifier/verticals', async (req, res) => {
  try {
    const { identifier } = req.params;

    const verticals = await territoryService.getTerritoryVerticals(identifier);

    if (!verticals) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: verticals
    });
  } catch (error) {
    console.error('Error getting verticals:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/territories/:identifier/verticals
 * Assign vertical to territory
 */
router.post('/:identifier/verticals', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { verticalSlug, configOverride, isPrimary, isActive } = req.body;
    const context = getContext(req);

    const result = await territoryService.assignVertical(
      identifier,
      verticalSlug,
      { configOverride, isPrimary, isActive },
      context
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error assigning vertical:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/os/territories/:identifier/verticals/:verticalSlug
 * Remove vertical from territory
 */
router.delete('/:identifier/verticals/:verticalSlug', async (req, res) => {
  try {
    const { identifier, verticalSlug } = req.params;
    const context = getContext(req);

    const result = await territoryService.removeVertical(identifier, verticalSlug, context);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Territory or vertical not found'
      });
    }

    res.json({
      success: true,
      message: 'Vertical removed from territory'
    });
  } catch (error) {
    console.error('Error removing vertical:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// SUB-VERTICALS
// ============================================================================

/**
 * GET /api/os/territories/:identifier/sub-verticals
 * Get sub-verticals for territory
 */
router.get('/:identifier/sub-verticals', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { verticalSlug } = req.query;

    const subVerticals = await territoryService.getSubVerticals(identifier, verticalSlug);

    if (!subVerticals) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: subVerticals
    });
  } catch (error) {
    console.error('Error getting sub-verticals:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/territories/:identifier/sub-verticals
 * Create sub-vertical
 */
router.post('/:identifier/sub-verticals', async (req, res) => {
  try {
    const { identifier } = req.params;
    const context = getContext(req);

    const result = await territoryService.createSubVertical(identifier, req.body, context);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating sub-vertical:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/os/territories/sub-verticals/:id
 * Update sub-vertical
 */
router.patch('/sub-verticals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const context = getContext(req);

    const result = await territoryService.updateSubVertical(id, req.body, context);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Sub-vertical not found'
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error updating sub-vertical:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ASSIGNMENT RULES
// ============================================================================

/**
 * GET /api/os/territories/:identifier/rules
 * Get assignment rules for territory
 */
router.get('/:identifier/rules', async (req, res) => {
  try {
    const { identifier } = req.params;

    const rules = await territoryService.getAssignmentRules(identifier);

    if (!rules) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('Error getting rules:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/territories/:identifier/rules
 * Create assignment rule
 */
router.post('/:identifier/rules', async (req, res) => {
  try {
    const { identifier } = req.params;
    const context = getContext(req);

    const result = await territoryService.createAssignmentRule(identifier, req.body, context);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating rule:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/os/territories/rules/:id
 * Update assignment rule
 */
router.patch('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const context = getContext(req);

    const result = await territoryService.updateAssignmentRule(id, req.body, context);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found'
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/os/territories/rules/:id
 * Delete assignment rule
 */
router.delete('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const context = getContext(req);

    const result = await territoryService.deleteAssignmentRule(id, context);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Rule deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/territories/assign
 * Assign entity to territory using rules
 */
router.post('/assign', async (req, res) => {
  try {
    const result = await territoryService.assignEntityToTerritory(req.body);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error assigning entity:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// AUDIT LOGS
// ============================================================================

/**
 * GET /api/os/territories/:identifier/audit
 * Get audit logs for territory
 */
router.get('/:identifier/audit', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { limit, offset, action, actorId, startDate, endDate } = req.query;

    const logs = await territoryService.getAuditLogs(identifier, {
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      action,
      actorId,
      startDate,
      endDate
    });

    if (!logs) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// METRICS
// ============================================================================

/**
 * GET /api/os/territories/:identifier/metrics
 * Get metrics for territory
 */
router.get('/:identifier/metrics', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { granularity, startDate, endDate, limit } = req.query;

    const metrics = await territoryService.getMetrics(identifier, {
      granularity,
      startDate,
      endDate,
      limit: limit ? parseInt(limit) : undefined
    });

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/os/territories/:identifier/metrics
 * Record metrics for territory
 */
router.post('/:identifier/metrics', async (req, res) => {
  try {
    const { identifier } = req.params;

    const result = await territoryService.recordMetrics(identifier, req.body);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error recording metrics:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/territories/:identifier/metrics/summary
 * Get metrics summary for territory
 */
router.get('/:identifier/metrics/summary', async (req, res) => {
  try {
    const { identifier } = req.params;

    const summary = await territoryService.getMetricsSummary(identifier);

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting metrics summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * GET /api/os/territories/:identifier/dashboard
 * Get full dashboard data for territory
 */
router.get('/:identifier/dashboard', async (req, res) => {
  try {
    const { identifier } = req.params;

    const dashboard = await territoryService.getDashboard(identifier);

    if (!dashboard) {
      return res.status(404).json({
        success: false,
        error: 'Territory not found'
      });
    }

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

export default router;
