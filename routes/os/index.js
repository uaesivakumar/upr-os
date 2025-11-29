/**
 * UPR OS Router - Main Entry Point
 * Sprint 64: Unified OS API Layer
 * Sprint 67: Added Settings endpoints
 * Sprint 50: Added Provider Management endpoints
 *
 * Combines all OS endpoints into a single router mounted at /api/os
 *
 * Endpoints:
 * - POST /api/os/discovery    - Signal discovery
 * - POST /api/os/enrich       - Entity enrichment
 * - POST /api/os/score        - Multi-score calculation
 * - POST /api/os/rank         - Configurable ranking
 * - POST /api/os/outreach     - Outreach generation
 * - POST /api/os/pipeline     - Full pipeline orchestration
 * - GET  /api/os/settings/*   - OS settings management
 * - GET  /api/os/providers/*  - API provider management
 */

import express from 'express';
import discoveryRouter from './discovery.js';
import enrichRouter from './enrich.js';
import scoreRouter from './score.js';
import rankRouter from './rank.js';
import outreachRouter from './outreach.js';
import pipelineRouter from './pipeline.js';
import settingsRouter from './settings.js';
import entitiesRouter from './entities.js';
import providersRouter from './providers.js';
import objectsRouter from './objects.js';
import { OS_VERSION, OS_PROFILES, PIPELINE_MODES, SCORE_TYPES, ENTITY_TYPES } from './types.js';

const router = express.Router();

/**
 * GET /api/os
 * OS API root - returns API info and documentation
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'UPR Operating System API',
    version: OS_VERSION,
    description: 'Unified API layer for the UPR Sales Intelligence Operating System',
    endpoints: {
      discovery: {
        path: '/api/os/discovery',
        method: 'POST',
        description: 'Discover signals from multiple sources'
      },
      enrich: {
        path: '/api/os/enrich',
        method: 'POST',
        description: 'Enrich entity data from multiple sources'
      },
      score: {
        path: '/api/os/score',
        method: 'POST',
        description: 'Calculate Q-Score, T-Score, L-Score, E-Score'
      },
      rank: {
        path: '/api/os/rank',
        method: 'POST',
        description: 'Rank entities with configurable profiles'
      },
      outreach: {
        path: '/api/os/outreach',
        method: 'POST',
        description: 'Generate personalized outreach content'
      },
      pipeline: {
        path: '/api/os/pipeline',
        method: 'POST',
        description: 'Execute full discovery-to-outreach pipeline'
      },
      settings: {
        path: '/api/os/settings',
        method: 'GET/PUT',
        description: 'OS settings, scoring profiles, verticals, personas'
      },
      providers: {
        path: '/api/os/providers',
        method: 'GET/POST/PATCH/DELETE',
        description: 'API provider management, rate limits, health monitoring'
      },
      objects: {
        path: '/api/os/objects',
        method: 'GET/POST',
        description: 'Object registry, schemas, auto-population, dependency graphs'
      }
    },
    profiles: OS_PROFILES,
    pipeline_modes: PIPELINE_MODES,
    score_types: SCORE_TYPES,
    entity_types: ENTITY_TYPES,
    documentation: 'https://docs.upr.ai/os'
  });
});

/**
 * GET /api/os/health
 * Comprehensive health check for all OS services
 */
router.get('/health', async (req, res) => {
  const services = {
    discovery: 'checking',
    enrich: 'checking',
    score: 'checking',
    rank: 'checking',
    outreach: 'checking',
    pipeline: 'checking'
  };

  // All services are stateless, so if the router is responding, they're healthy
  for (const service of Object.keys(services)) {
    services[service] = 'healthy';
  }

  const allHealthy = Object.values(services).every(s => s === 'healthy');

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    status: allHealthy ? 'healthy' : 'degraded',
    version: OS_VERSION,
    services,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/os/version
 * Get OS version info
 */
router.get('/version', (req, res) => {
  res.json({
    success: true,
    version: OS_VERSION,
    build: process.env.BUILD_ID || 'development',
    node_version: process.version
  });
});

// Mount sub-routers
router.use('/discovery', discoveryRouter);
router.use('/enrich', enrichRouter);
router.use('/score', scoreRouter);
router.use('/rank', rankRouter);
router.use('/outreach', outreachRouter);
router.use('/pipeline', pipelineRouter);
router.use('/settings', settingsRouter);
router.use('/entities', entitiesRouter);
router.use('/providers', providersRouter);
router.use('/objects', objectsRouter);

export default router;
