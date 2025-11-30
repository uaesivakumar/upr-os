/**
 * UPR OS Object Registry API
 * Sprint 50: API Provider Management
 * Sprint 64: Object Intelligence v2
 *
 * Endpoints for managing business objects, their schemas,
 * auto-population, dependency graphs, and object intelligence.
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import {
  createOSResponse,
  createOSError,
  getTenantId,
  generateRequestId
} from './types.js';
import * as objectRegistry from '../../services/objectRegistry.js';
import * as verticalChain from '../../services/verticalProviderChain.js';
import * as objectIntelligence from '../../services/objectIntelligence.js';

const router = express.Router();

// ============================================================================
// SCHEMA ENDPOINTS
// ============================================================================

/**
 * GET /api/os/objects/schemas
 * List all object schemas
 */
router.get('/schemas', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const schemas = objectRegistry.getAllObjectSchemas();

    res.json(createOSResponse({
      success: true,
      data: {
        schemas,
        total: schemas.length
      },
      reason: `Found ${schemas.length} object schemas`,
      confidence: 100,
      endpoint: '/api/os/objects/schemas',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error listing schemas:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_SCHEMAS_ERROR',
      endpoint: '/api/os/objects/schemas',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/schemas/:objectType
 * Get schema for a specific object type
 */
router.get('/schemas/:objectType', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectType } = req.params;

    const schema = objectRegistry.getObjectSchema(objectType);

    if (!schema) {
      return res.status(404).json(createOSError({
        error: `Object type not found: ${objectType}`,
        code: 'OS_OBJECT_NOT_FOUND',
        endpoint: `/api/os/objects/schemas/${objectType}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: schema,
      reason: `Schema for ${schema.name}`,
      confidence: 100,
      endpoint: `/api/os/objects/schemas/${objectType}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error getting schema:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_SCHEMA_ERROR',
      endpoint: `/api/os/objects/schemas/${req.params.objectType}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// DEPENDENCY GRAPH ENDPOINTS
// ============================================================================

/**
 * GET /api/os/objects/graph
 * Get the full object dependency graph
 */
router.get('/graph', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const graph = objectRegistry.getObjectDependencyGraph();

    res.json(createOSResponse({
      success: true,
      data: graph,
      reason: `Object graph with ${graph.nodes.length} nodes and ${graph.edges.length} edges`,
      confidence: 100,
      endpoint: '/api/os/objects/graph',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error getting graph:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_GRAPH_ERROR',
      endpoint: '/api/os/objects/graph',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/graph/:objectType
 * Get field dependency graph for an object type
 */
router.get('/graph/:objectType', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectType } = req.params;

    const graph = objectRegistry.getFieldDependencyGraph(objectType);

    if (!graph) {
      return res.status(404).json(createOSError({
        error: `Object type not found: ${objectType}`,
        code: 'OS_OBJECT_NOT_FOUND',
        endpoint: `/api/os/objects/graph/${objectType}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: graph,
      reason: `Field graph for ${objectType} with ${graph.nodes.length} fields`,
      confidence: 100,
      endpoint: `/api/os/objects/graph/${objectType}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error getting field graph:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_FIELD_GRAPH_ERROR',
      endpoint: `/api/os/objects/graph/${req.params.objectType}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// AUTO-POPULATION ENDPOINTS
// ============================================================================

/**
 * POST /api/os/objects/populate
 * Auto-populate an object with enriched data
 *
 * Request body:
 * {
 *   "object_type": "company",
 *   "seed_data": {
 *     "name": "Acme Inc",
 *     "domain": "acme.com"
 *   },
 *   "options": {
 *     "vertical": "banking",
 *     "force_refresh": false
 *   }
 * }
 */
router.post('/populate', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const tenantId = getTenantId(req);
    const { object_type, seed_data, options = {} } = req.body;

    if (!object_type) {
      return res.status(400).json(createOSError({
        error: 'object_type is required',
        code: 'OS_OBJECTS_INVALID_INPUT',
        endpoint: '/api/os/objects/populate',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    if (!seed_data || Object.keys(seed_data).length === 0) {
      return res.status(400).json(createOSError({
        error: 'seed_data is required',
        code: 'OS_OBJECTS_INVALID_INPUT',
        endpoint: '/api/os/objects/populate',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const result = await objectRegistry.autoPopulateObject(object_type, seed_data, {
      ...options,
      tenantId
    });

    res.json(createOSResponse({
      success: result.success,
      data: {
        object_type,
        populated_data: result.data,
        enriched: result.enriched,
        fields_populated: result.fieldsPopulated
      },
      reason: result.enriched ?
        `Populated ${result.fieldsPopulated} fields with enrichment` :
        'Populated with seed data and derived fields only',
      confidence: result.enriched ? 85 : 100,
      endpoint: '/api/os/objects/populate',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error populating object:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_POPULATE_ERROR',
      endpoint: '/api/os/objects/populate',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/objects/validate
 * Validate object data against schema
 */
router.post('/validate', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { object_type, data } = req.body;

    if (!object_type || !data) {
      return res.status(400).json(createOSError({
        error: 'object_type and data are required',
        code: 'OS_OBJECTS_INVALID_INPUT',
        endpoint: '/api/os/objects/validate',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const result = objectRegistry.validateObject(object_type, data);

    res.json(createOSResponse({
      success: result.valid,
      data: {
        valid: result.valid,
        errors: result.errors
      },
      reason: result.valid ?
        'Object data is valid' :
        `Found ${result.errors.length} validation errors`,
      confidence: 100,
      endpoint: '/api/os/objects/validate',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error validating object:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_VALIDATE_ERROR',
      endpoint: '/api/os/objects/validate',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/objects/derive
 * Derive calculated fields from existing data
 */
router.post('/derive', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { object_type, data } = req.body;

    if (!object_type || !data) {
      return res.status(400).json(createOSError({
        error: 'object_type and data are required',
        code: 'OS_OBJECTS_INVALID_INPUT',
        endpoint: '/api/os/objects/derive',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const schema = objectRegistry.getObjectSchema(object_type);
    if (!schema) {
      return res.status(404).json(createOSError({
        error: `Object type not found: ${object_type}`,
        code: 'OS_OBJECT_NOT_FOUND',
        endpoint: '/api/os/objects/derive',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const derivedData = objectRegistry.deriveFields(data, schema);
    const newFields = Object.keys(derivedData).filter(k => !data[k] && derivedData[k]);

    res.json(createOSResponse({
      success: true,
      data: {
        derived_data: derivedData,
        new_fields: newFields
      },
      reason: `Derived ${newFields.length} new fields`,
      confidence: 100,
      endpoint: '/api/os/objects/derive',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error deriving fields:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_DERIVE_ERROR',
      endpoint: '/api/os/objects/derive',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// VERTICAL ENDPOINTS
// ============================================================================

/**
 * GET /api/os/objects/verticals
 * List available verticals
 */
router.get('/verticals', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const verticals = verticalChain.getVerticals();

    res.json(createOSResponse({
      success: true,
      data: {
        verticals,
        total: verticals.length
      },
      reason: `Found ${verticals.length} verticals`,
      confidence: 100,
      endpoint: '/api/os/objects/verticals',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error listing verticals:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_VERTICALS_ERROR',
      endpoint: '/api/os/objects/verticals',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/verticals/:slug
 * Get vertical configuration
 */
router.get('/verticals/:slug', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;

    const config = verticalChain.getVerticalConfig(slug);

    res.json(createOSResponse({
      success: true,
      data: config,
      reason: `Configuration for ${config.name}`,
      confidence: 100,
      endpoint: `/api/os/objects/verticals/${slug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error getting vertical:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_VERTICAL_ERROR',
      endpoint: `/api/os/objects/verticals/${req.params.slug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/objects/enrich
 * Enrich an object using vertical-specific chain
 */
router.post('/enrich', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const tenantId = getTenantId(req);
    const { vertical, entity, options = {} } = req.body;

    if (!entity) {
      return res.status(400).json(createOSError({
        error: 'entity is required',
        code: 'OS_OBJECTS_INVALID_INPUT',
        endpoint: '/api/os/objects/enrich',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const result = await verticalChain.executeVerticalChain(
      vertical || 'default',
      entity,
      { ...options, tenantId }
    );

    res.json(createOSResponse({
      success: result.success,
      data: {
        vertical: result.vertical,
        enriched_data: result.data,
        quality_score: result.qualityScore,
        sources: result.sources,
        fields_enriched: result.fieldsEnriched,
        missing_fields: result.missingFields
      },
      reason: result.success ?
        `Enriched ${result.fieldsEnriched?.length || 0} fields from ${result.sources?.length || 0} sources` :
        result.error,
      confidence: result.qualityScore || 0,
      endpoint: '/api/os/objects/enrich',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error enriching object:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_ENRICH_ERROR',
      endpoint: '/api/os/objects/enrich',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/health
 * Health check for objects service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'os-objects',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// OBJECT INTELLIGENCE ENDPOINTS (S64)
// ============================================================================

/**
 * POST /api/os/objects/register
 * Register a new object node or update existing
 *
 * Request body:
 * {
 *   "objectType": "company",
 *   "payload": { "name": "Acme Inc", "domain": "acme.com" },
 *   "context": { "territoryId": "uae", "verticalSlug": "banking" }
 * }
 */
router.post('/register', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectType, payload, context = {} } = req.body;

    if (!objectType) {
      return res.status(400).json(createOSError({
        error: 'objectType is required',
        code: 'OS_OBJECTS_INVALID_INPUT',
        endpoint: '/api/os/objects/register',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const object = await objectIntelligence.registerObject(objectType, payload, context);

    res.json(createOSResponse({
      success: true,
      data: object,
      reason: `Registered ${objectType} object`,
      confidence: 100,
      endpoint: '/api/os/objects/register',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error registering object:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_REGISTER_ERROR',
      endpoint: '/api/os/objects/register',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/objects/link
 * Link two objects with a relationship edge
 */
router.post('/link', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { fromObjectId, toObjectId, edgeType, weight = 1.0, metadata = {} } = req.body;

    if (!fromObjectId || !toObjectId || !edgeType) {
      return res.status(400).json(createOSError({
        error: 'fromObjectId, toObjectId, and edgeType are required',
        code: 'OS_OBJECTS_INVALID_INPUT',
        endpoint: '/api/os/objects/link',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const edge = await objectIntelligence.linkObjects(fromObjectId, toObjectId, edgeType, weight, metadata);

    res.json(createOSResponse({
      success: true,
      data: edge,
      reason: `Created ${edgeType} edge between objects`,
      confidence: 100,
      endpoint: '/api/os/objects/link',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error linking objects:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_LINK_ERROR',
      endpoint: '/api/os/objects/link',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/:id/graph
 * Get object relationship graph
 */
router.get('/:id/graph', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;
    const { edgeTypes, direction, maxDepth, includeData } = req.query;

    const options = {
      edgeTypes: edgeTypes ? edgeTypes.split(',') : undefined,
      direction: direction || 'both',
      maxDepth: maxDepth ? parseInt(maxDepth, 10) : 1,
      includeData: includeData !== 'false'
    };

    const graph = await objectIntelligence.getObjectGraph(id, options);

    if (!graph) {
      return res.status(404).json(createOSError({
        error: 'Object not found',
        code: 'OS_OBJECT_NOT_FOUND',
        endpoint: `/api/os/objects/${id}/graph`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: graph,
      reason: `Found ${graph.neighbors.length} neighbors with ${graph.edges.length} edges`,
      confidence: 100,
      endpoint: `/api/os/objects/${id}/graph`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error getting object graph:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_GRAPH_ERROR',
      endpoint: `/api/os/objects/${req.params.id}/graph`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/:id/timeline
 * Get object event timeline
 */
router.get('/:id/timeline', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;
    const { eventTypes, eventCategories, since, until, limit, offset } = req.query;

    const options = {
      eventTypes: eventTypes ? eventTypes.split(',') : undefined,
      eventCategories: eventCategories ? eventCategories.split(',') : undefined,
      since,
      until,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    };

    const timeline = await objectIntelligence.getObjectTimeline(id, options);

    res.json(createOSResponse({
      success: true,
      data: timeline,
      reason: `Found ${timeline.total} events`,
      confidence: 100,
      endpoint: `/api/os/objects/${id}/timeline`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error getting timeline:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_TIMELINE_ERROR',
      endpoint: `/api/os/objects/${req.params.id}/timeline`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/:id/state
 * Get object current state
 */
router.get('/:id/state', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;

    const state = await objectIntelligence.getObjectState(id);

    res.json(createOSResponse({
      success: true,
      data: state,
      reason: `State version ${state.stateVersion}`,
      confidence: 100,
      endpoint: `/api/os/objects/${id}/state`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error getting state:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_STATE_ERROR',
      endpoint: `/api/os/objects/${req.params.id}/state`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/objects/:id/state
 * Update object state (merge patch)
 */
router.post('/:id/state', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;
    const statePatch = req.body;

    const state = await objectIntelligence.setObjectState(id, statePatch);

    res.json(createOSResponse({
      success: true,
      data: state,
      reason: `Updated state to version ${state.stateVersion}`,
      confidence: 100,
      endpoint: `/api/os/objects/${id}/state`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error updating state:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_STATE_ERROR',
      endpoint: `/api/os/objects/${req.params.id}/state`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/objects/:id/events
 * Append event to object timeline
 */
router.post('/:id/events', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;
    const { eventType, payload = {}, actorType, actorId, relatedObjectId } = req.body;

    if (!eventType) {
      return res.status(400).json(createOSError({
        error: 'eventType is required',
        code: 'OS_OBJECTS_INVALID_INPUT',
        endpoint: `/api/os/objects/${id}/events`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const event = await objectIntelligence.appendObjectEvent(id, eventType, payload, {
      actorType,
      actorId,
      relatedObjectId
    });

    res.json(createOSResponse({
      success: true,
      data: event,
      reason: `Appended ${eventType} event`,
      confidence: 100,
      endpoint: `/api/os/objects/${id}/events`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error appending event:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_EVENT_ERROR',
      endpoint: `/api/os/objects/${req.params.id}/events`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/:id/threads
 * Get threads for an object
 */
router.get('/:id/threads', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;
    const { threadTypes, isOpen, limit, offset } = req.query;

    const options = {
      threadTypes: threadTypes ? threadTypes.split(',') : undefined,
      isOpen: isOpen !== undefined ? isOpen === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0
    };

    const threads = await objectIntelligence.getObjectThreads(id, options);

    res.json(createOSResponse({
      success: true,
      data: threads,
      reason: `Found ${threads.total} threads`,
      confidence: 100,
      endpoint: `/api/os/objects/${id}/threads`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error getting threads:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_THREADS_ERROR',
      endpoint: `/api/os/objects/${req.params.id}/threads`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/objects/:id/threads
 * Create a new thread for an object
 */
router.post('/:id/threads', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;
    const { threadType, initialMessage, title } = req.body;

    if (!threadType) {
      return res.status(400).json(createOSError({
        error: 'threadType is required',
        code: 'OS_OBJECTS_INVALID_INPUT',
        endpoint: `/api/os/objects/${id}/threads`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const thread = await objectIntelligence.createObjectThread(id, threadType, initialMessage, title);

    res.json(createOSResponse({
      success: true,
      data: thread,
      reason: `Created ${threadType} thread`,
      confidence: 100,
      endpoint: `/api/os/objects/${id}/threads`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error creating thread:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_THREAD_ERROR',
      endpoint: `/api/os/objects/${req.params.id}/threads`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/threads/:threadId
 * Append message to a thread
 */
router.post('/threads/:threadId', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { threadId } = req.params;
    const message = req.body;

    if (!message || !message.content) {
      return res.status(400).json(createOSError({
        error: 'message with content is required',
        code: 'OS_OBJECTS_INVALID_INPUT',
        endpoint: `/api/os/threads/${threadId}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const thread = await objectIntelligence.appendToThread(threadId, message);

    if (!thread) {
      return res.status(404).json(createOSError({
        error: 'Thread not found',
        code: 'OS_THREAD_NOT_FOUND',
        endpoint: `/api/os/threads/${threadId}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: thread,
      reason: `Added message to thread`,
      confidence: 100,
      endpoint: `/api/os/threads/${threadId}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error appending to thread:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_THREAD_ERROR',
      endpoint: `/api/os/threads/${req.params.threadId}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/objects/:id/signals
 * Derive signals from an object
 */
router.post('/:id/signals', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;
    const context = req.body;

    const result = await objectIntelligence.deriveSignalsFromObject(id, context);

    if (result.error) {
      return res.status(404).json(createOSError({
        error: result.error,
        code: 'OS_OBJECT_NOT_FOUND',
        endpoint: `/api/os/objects/${id}/signals`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: result,
      reason: `Derived ${result.signals.length} signals`,
      confidence: 100,
      endpoint: `/api/os/objects/${id}/signals`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error deriving signals:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_SIGNALS_ERROR',
      endpoint: `/api/os/objects/${req.params.id}/signals`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/:id/actions
 * Get available actions for an object
 */
router.get('/:id/actions', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;
    const { verticalSlug } = req.query;

    const actions = await objectIntelligence.getObjectActions(id, { verticalSlug });

    res.json(createOSResponse({
      success: true,
      data: { actions },
      reason: `Found ${actions.length} available actions`,
      confidence: 100,
      endpoint: `/api/os/objects/${id}/actions`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error getting actions:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_ACTIONS_ERROR',
      endpoint: `/api/os/objects/${req.params.id}/actions`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/nodes/:id
 * Get a specific object node
 */
router.get('/nodes/:id', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { id } = req.params;

    const object = await objectIntelligence.getObject(id);

    if (!object) {
      return res.status(404).json(createOSError({
        error: 'Object not found',
        code: 'OS_OBJECT_NOT_FOUND',
        endpoint: `/api/os/objects/nodes/${id}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: object,
      reason: `Found ${object.objectType} object`,
      confidence: 100,
      endpoint: `/api/os/objects/nodes/${id}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error getting object:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_GET_ERROR',
      endpoint: `/api/os/objects/nodes/${req.params.id}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/objects/list
 * List objects with filters
 */
router.get('/list', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { objectType, territoryId, verticalSlug, search, limit, offset, orderBy, order } = req.query;

    const filters = { objectType, territoryId, verticalSlug, search };
    const options = {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      orderBy: orderBy || 'created_at',
      order: order || 'desc'
    };

    const result = await objectIntelligence.listObjects(filters, options);

    res.json(createOSResponse({
      success: true,
      data: result,
      reason: `Found ${result.total} objects`,
      confidence: 100,
      endpoint: '/api/os/objects/list',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Objects] Error listing objects:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_OBJECTS_LIST_ERROR',
      endpoint: '/api/os/objects/list',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

export default router;
