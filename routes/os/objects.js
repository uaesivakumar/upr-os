/**
 * UPR OS Object Registry API
 * Sprint 50: API Provider Management
 *
 * Endpoints for managing business objects, their schemas,
 * auto-population, and dependency graphs.
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

export default router;
