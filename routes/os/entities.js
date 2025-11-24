/**
 * OS Entity API Endpoints
 * Sprint 68: Entity Abstraction Layer
 */

import express from 'express';
import { osResponse, osError } from './types.js';
import { createEntityService, ENTITY_TYPES, ENTITY_STATUS } from '../../server/services/entityService.js';

const router = express.Router();

/**
 * POST /api/os/entities
 * Create new entity
 */
router.post('/', async (req, res) => {
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);
  const entityData = req.body;

  if (!entityData.name) {
    return res.status(400).json(osError('Entity name is required', 'MISSING_NAME'));
  }

  try {
    const entity = await entityService.create(entityData);

    return res.status(201).json(osResponse({
      operation: 'entity_create',
      entity: entity.toJSON()
    }));

  } catch (error) {
    console.error('[OS Entities] Error creating entity:', error);
    return res.status(500).json(osError('Failed to create entity', 'ENTITY_CREATE_ERROR'));
  }
});

/**
 * GET /api/os/entities/:id
 * Get entity by ID
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  try {
    const entity = await entityService.getById(id);

    if (!entity) {
      return res.status(404).json(osError('Entity not found', 'ENTITY_NOT_FOUND'));
    }

    return res.json(osResponse({
      operation: 'entity_get',
      entity: entity.toJSON()
    }));

  } catch (error) {
    console.error('[OS Entities] Error getting entity:', error);
    return res.status(500).json(osError('Failed to get entity', 'ENTITY_GET_ERROR'));
  }
});

/**
 * PUT /api/os/entities/:id
 * Update entity
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  try {
    const entity = await entityService.update(id, updates);

    if (!entity) {
      return res.status(404).json(osError('Entity not found or no valid updates', 'ENTITY_NOT_FOUND'));
    }

    return res.json(osResponse({
      operation: 'entity_update',
      entity: entity.toJSON()
    }));

  } catch (error) {
    console.error('[OS Entities] Error updating entity:', error);
    return res.status(500).json(osError('Failed to update entity', 'ENTITY_UPDATE_ERROR'));
  }
});

/**
 * DELETE /api/os/entities/:id
 * Delete entity (soft delete)
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { hard } = req.query;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  try {
    let success;
    if (hard === 'true') {
      success = await entityService.hardDelete(id);
    } else {
      const entity = await entityService.delete(id);
      success = !!entity;
    }

    if (!success) {
      return res.status(404).json(osError('Entity not found', 'ENTITY_NOT_FOUND'));
    }

    return res.json(osResponse({
      operation: hard === 'true' ? 'entity_hard_delete' : 'entity_soft_delete',
      deleted: true,
      entityId: id
    }));

  } catch (error) {
    console.error('[OS Entities] Error deleting entity:', error);
    return res.status(500).json(osError('Failed to delete entity', 'ENTITY_DELETE_ERROR'));
  }
});

/**
 * GET /api/os/entities
 * List entities with filters
 */
router.get('/', async (req, res) => {
  const { type, status, tier, limit = 100, offset = 0, orderBy = 'created_at', order = 'DESC' } = req.query;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  try {
    let entities;

    if (type) {
      entities = await entityService.getByType(type, {
        status,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        orderBy,
        order
      });
    } else if (tier) {
      entities = await entityService.getByTier(tier, {
        type,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      });
    } else {
      // Get all active entities
      entities = await entityService.getByType(ENTITY_TYPES.COMPANY, {
        status: ENTITY_STATUS.ACTIVE,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        orderBy,
        order
      });
    }

    return res.json(osResponse({
      operation: 'entities_list',
      entities: entities.map(e => e.toJSON()),
      count: entities.length,
      pagination: {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10)
      }
    }));

  } catch (error) {
    console.error('[OS Entities] Error listing entities:', error);
    return res.status(500).json(osError('Failed to list entities', 'ENTITIES_LIST_ERROR'));
  }
});

/**
 * GET /api/os/entities/search
 * Search entities
 */
router.get('/search', async (req, res) => {
  const { q, type, limit = 50, offset = 0 } = req.query;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  if (!q || q.length < 2) {
    return res.status(400).json(osError('Search query must be at least 2 characters', 'INVALID_QUERY'));
  }

  try {
    const entities = await entityService.search(q, {
      type,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    });

    return res.json(osResponse({
      operation: 'entities_search',
      query: q,
      entities: entities.map(e => e.toJSON()),
      count: entities.length
    }));

  } catch (error) {
    console.error('[OS Entities] Error searching entities:', error);
    return res.status(500).json(osError('Failed to search entities', 'ENTITIES_SEARCH_ERROR'));
  }
});

/**
 * GET /api/os/entities/enrichment-queue
 * Get entities needing enrichment
 */
router.get('/enrichment-queue', async (req, res) => {
  const { limit = 100 } = req.query;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  try {
    const entities = await entityService.getEnrichmentQueue(parseInt(limit, 10));

    return res.json(osResponse({
      operation: 'enrichment_queue',
      entities: entities.map(e => e.toJSON()),
      count: entities.length
    }));

  } catch (error) {
    console.error('[OS Entities] Error getting enrichment queue:', error);
    return res.status(500).json(osError('Failed to get enrichment queue', 'ENRICHMENT_QUEUE_ERROR'));
  }
});

/**
 * PUT /api/os/entities/:id/scores
 * Update entity scores
 */
router.put('/:id/scores', async (req, res) => {
  const { id } = req.params;
  const { scores, tier } = req.body;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  try {
    const entity = await entityService.updateScores(id, scores, tier);

    if (!entity) {
      return res.status(404).json(osError('Entity not found', 'ENTITY_NOT_FOUND'));
    }

    return res.json(osResponse({
      operation: 'entity_scores_update',
      entity: entity.toJSON()
    }));

  } catch (error) {
    console.error('[OS Entities] Error updating entity scores:', error);
    return res.status(500).json(osError('Failed to update scores', 'SCORES_UPDATE_ERROR'));
  }
});

/**
 * PUT /api/os/entities/:id/enrichment
 * Update entity enrichment data
 */
router.put('/:id/enrichment', async (req, res) => {
  const { id } = req.params;
  const { enrichmentData, status = 'complete' } = req.body;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  try {
    const entity = await entityService.updateEnrichment(id, enrichmentData, status);

    if (!entity) {
      return res.status(404).json(osError('Entity not found', 'ENTITY_NOT_FOUND'));
    }

    return res.json(osResponse({
      operation: 'entity_enrichment_update',
      entity: entity.toJSON()
    }));

  } catch (error) {
    console.error('[OS Entities] Error updating enrichment:', error);
    return res.status(500).json(osError('Failed to update enrichment', 'ENRICHMENT_UPDATE_ERROR'));
  }
});

/**
 * POST /api/os/entities/bulk
 * Bulk create entities
 */
router.post('/bulk', async (req, res) => {
  const { entities } = req.body;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  if (!Array.isArray(entities) || entities.length === 0) {
    return res.status(400).json(osError('Entities array is required', 'INVALID_INPUT'));
  }

  if (entities.length > 100) {
    return res.status(400).json(osError('Maximum 100 entities per bulk operation', 'LIMIT_EXCEEDED'));
  }

  try {
    const results = {
      created: [],
      failed: []
    };

    for (const entityData of entities) {
      try {
        const entity = await entityService.create(entityData);
        results.created.push(entity.toJSON());
      } catch (error) {
        results.failed.push({
          data: entityData,
          error: error.message
        });
      }
    }

    return res.status(201).json(osResponse({
      operation: 'entities_bulk_create',
      created: results.created.length,
      failed: results.failed.length,
      results
    }));

  } catch (error) {
    console.error('[OS Entities] Error bulk creating entities:', error);
    return res.status(500).json(osError('Failed to bulk create entities', 'BULK_CREATE_ERROR'));
  }
});

/**
 * PUT /api/os/entities/bulk
 * Bulk update entities
 */
router.put('/bulk', async (req, res) => {
  const { ids, updates } = req.body;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json(osError('Entity IDs array is required', 'INVALID_INPUT'));
  }

  if (ids.length > 100) {
    return res.status(400).json(osError('Maximum 100 entities per bulk operation', 'LIMIT_EXCEEDED'));
  }

  try {
    const entities = await entityService.bulkUpdate(ids, updates);

    return res.json(osResponse({
      operation: 'entities_bulk_update',
      updated: entities.length,
      entities: entities.map(e => e.toJSON())
    }));

  } catch (error) {
    console.error('[OS Entities] Error bulk updating entities:', error);
    return res.status(500).json(osError('Failed to bulk update entities', 'BULK_UPDATE_ERROR'));
  }
});

/**
 * GET /api/os/entities/stats
 * Get entity statistics
 */
router.get('/stats', async (req, res) => {
  const tenantId = req.tenantId || req.user?.tenant_id;
  const entityService = createEntityService(tenantId);

  try {
    const [companyCount, individualCount, hybridCount] = await Promise.all([
      entityService.getCountByType(ENTITY_TYPES.COMPANY),
      entityService.getCountByType(ENTITY_TYPES.INDIVIDUAL),
      entityService.getCountByType(ENTITY_TYPES.HYBRID)
    ]);

    return res.json(osResponse({
      operation: 'entities_stats',
      stats: {
        total: companyCount + individualCount + hybridCount,
        byType: {
          company: companyCount,
          individual: individualCount,
          hybrid: hybridCount
        }
      }
    }));

  } catch (error) {
    console.error('[OS Entities] Error getting entity stats:', error);
    return res.status(500).json(osError('Failed to get entity stats', 'STATS_ERROR'));
  }
});

/**
 * GET /api/os/entities/types
 * Get entity types and statuses
 */
router.get('/types', (req, res) => {
  return res.json(osResponse({
    operation: 'entity_types',
    types: Object.values(ENTITY_TYPES),
    statuses: Object.values(ENTITY_STATUS)
  }));
});

export default router;
