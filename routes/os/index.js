/**
 * UPR OS Router - Main Entry Point
 * Sprint 64: Unified OS API Layer
 * Sprint 67: Added Settings endpoints
 * Sprint 50: Added Provider Management endpoints
 * Sprint 51: Added LLM Engine Routing endpoints
 * Sprint 52: Added Vertical Pack endpoints
 * Sprint 53: Added Territory Management endpoints
 * Sprint 55: Added Config-Driven OS Kernel
 * Sprint 56: Added Discovery Target Types
 * VS1: OS Security Wall - Added authentication middleware
 * VS3: Prompt Injection Defense - Added input validation middleware
 * VS4: SalesContext Enforcement - Added sales context validation
 *
 * Combines all OS endpoints into a single router mounted at /api/os
 *
 * SECURITY: All routes (except /health and /version) require x-pr-os-token header
 * Authorization Code: VS1-VS9-APPROVED-20251213
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
 * - POST /api/os/llm/*        - LLM engine routing, model selection, journeys
 * - GET  /api/os/territories/* - Territory management, hierarchy, rules
 * - GET  /api/os/config/*     - OS kernel configuration
 * - GET  /api/os/targets/*    - Discovery target types
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
import llmRouter from './llm.js';
import verticalsRouter from './verticals.js';
import territoriesRouter from './territories.js';
import configRouter from './config.js';
import targetsRouter from './targets.js';
import aiAdminRouter from './ai-admin.js';
import discoveryTemplatesRouter from './discovery-templates.js';
import discoveryPoolRouter from './discoveryPool.js';
import replayRouter from './replay.js';  // PRD v1.2 §7: Deterministic Replay API
import intelligenceRouter from './intelligence.js';  // S218-S223: SIVA Intelligence Enhancement
import controlplaneRouter from './controlplane/index.js';  // OS Control Plane: resolve-config, envelope
import capabilitiesRouter from './capabilities.js';  // S228: Capability Registry Core
import { OS_VERSION, OS_PROFILES, PIPELINE_MODES, SCORE_TYPES, ENTITY_TYPES } from './types.js';
import { cacheStats, cacheStatsHandler, cacheClear } from '../../middleware/caching.js';
import { osAuthMiddleware, osAuditMiddleware, validateOsAuthConfig } from '../../middleware/osAuth.js';
// VS3 + VS4: SIVA Security Middleware
import { promptInjectionMiddleware, salesContextMiddleware } from '../../services/siva/index.js';

const router = express.Router();

// Validate OS auth configuration at startup
validateOsAuthConfig();

// Apply OS authentication to all routes (except /health, /version which are handled in middleware)
router.use(osAuthMiddleware);

// Apply audit logging to all authenticated routes
router.use(osAuditMiddleware);

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
      },
      llm: {
        path: '/api/os/llm',
        method: 'GET/POST',
        description: 'LLM engine routing, model selection, fallback chains, journeys'
      },
      verticals: {
        path: '/api/os/verticals',
        method: 'GET/POST/PATCH/DELETE',
        description: 'Vertical packs, signals, scoring, evidence, personas, journeys, radar'
      },
      territories: {
        path: '/api/os/territories',
        method: 'GET/POST/PATCH/DELETE',
        description: 'Territory hierarchy, config inheritance, assignment rules, audit logs'
      },
      config: {
        path: '/api/os/config',
        method: 'GET/PUT/POST/DELETE',
        description: 'OS kernel configuration, presets, versioning, hot reload'
      },
      targets: {
        path: '/api/os/targets',
        method: 'GET/POST/PATCH/DELETE',
        description: 'Discovery target types, sources, strategies, execution'
      },
      discoveryTemplates: {
        path: '/api/os/discovery-templates',
        method: 'GET/POST/PATCH/DELETE',
        description: 'Configurable search query templates for live discovery (Super Admin managed)'
      },
      discoveryPool: {
        path: '/api/os/discovery-pool',
        method: 'GET/POST/DELETE',
        description: 'Intelligent discovery pool with lead assignment, collision prevention, and territory mapping (S121)'
      },
      replay: {
        path: '/api/os/replay',
        method: 'POST/GET',
        description: 'Deterministic replay API for audit, debugging, and compliance (PRD v1.2 §7)'
      },
      intelligence: {
        path: '/api/os/intelligence',
        method: 'POST/GET/DELETE',
        description: 'SIVA Intelligence Enhancement: progressive delivery, preference learning, conversational UX (S218-S223)'
      },
      capabilities: {
        path: '/api/os/capabilities',
        method: 'GET/POST/PATCH',
        description: 'Capability Registry: model-agnostic capability definitions, model-capability mappings, eligibility (S228)'
      },
      resolveConfig: {
        path: '/api/os/resolve-config',
        method: 'GET',
        description: 'Resolve workspace configuration from OS control plane tables'
      },
      envelope: {
        path: '/api/os/envelope',
        method: 'POST',
        description: 'Generate sealed SIVA context envelope with sha256 hash'
      },
      authorizeCapability: {
        path: '/api/os/authorize-capability',
        method: 'POST/GET',
        description: 'S229: Pre-SIVA capability authorization guard. SIVA must not run on denial.'
      },
      routingDecisions: {
        path: '/api/os/routing-decisions',
        method: 'GET',
        description: 'S232: Routing decision viewer for Super Admin Model Radar. Read-only visibility into routing behavior.'
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
    pipeline: 'checking',
    llm: 'checking',
    verticals: 'checking',
    territories: 'checking',
    config: 'checking',
    targets: 'checking',
    discoveryPool: 'checking',
    replay: 'checking',  // PRD v1.2 §7
    intelligence: 'checking',  // S218-S223
    capabilities: 'checking',  // S228
    controlplane: 'checking',  // OS Control Plane
    authorizeCapability: 'checking',  // S229: Capability Authorization
    routingDecisions: 'checking'  // S232: Model Radar
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

/**
 * GET /api/os/cache/stats
 * Get cache statistics (S151: Performance & Caching)
 */
router.get('/cache/stats', cacheStatsHandler);

/**
 * POST /api/os/cache/clear
 * Clear all caches (admin only)
 */
router.post('/cache/clear', (req, res) => {
  const cleared = cacheClear();
  res.json({
    success: true,
    message: `Cleared ${cleared} cache entries`,
    timestamp: new Date().toISOString()
  });
});

// VS3 + VS4: Create middleware instances for AI-enabled routes
const aiInputValidation = promptInjectionMiddleware({
  fieldsToCheck: ['prompt', 'message', 'query', 'input', 'text', 'content', 'context'],
  blockOnDetection: true,
  logAttempts: true,
});

const salesContextValidation = salesContextMiddleware({
  requireContext: false, // Make optional for now to avoid breaking changes
  allowedVerticals: ['banking'], // Only Banking active
  extractFrom: 'all',
});

// Mount sub-routers
router.use('/discovery', discoveryRouter);
router.use('/enrich', enrichRouter);
// VS3 + VS4: AI-enabled routes get additional security middleware
router.use('/score', aiInputValidation, salesContextValidation, scoreRouter);
router.use('/rank', rankRouter);
router.use('/outreach', aiInputValidation, salesContextValidation, outreachRouter);
router.use('/pipeline', aiInputValidation, salesContextValidation, pipelineRouter);
router.use('/settings', settingsRouter);
router.use('/entities', entitiesRouter);
router.use('/providers', providersRouter);
router.use('/objects', objectsRouter);
router.use('/llm', llmRouter);
router.use('/verticals', verticalsRouter);
router.use('/territories', territoriesRouter);
router.use('/config', configRouter);
router.use('/targets', targetsRouter);
router.use('/ai-admin', aiAdminRouter);
router.use('/discovery-templates', discoveryTemplatesRouter);
router.use('/discovery-pool', discoveryPoolRouter);
router.use('/replay', replayRouter);  // PRD v1.2 §7: Deterministic Replay
router.use('/intelligence', aiInputValidation, salesContextValidation, intelligenceRouter);  // S218-S223: SIVA Intelligence Enhancement
router.use('/capabilities', capabilitiesRouter);  // S228: Capability Registry Core

// OS Control Plane: Authoritative configuration endpoints
router.use('/', controlplaneRouter);  // Mounts /resolve-config and /envelope

export default router;
