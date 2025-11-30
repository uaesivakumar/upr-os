/**
 * UPR OS Vertical Pack API
 * Sprint 52: Vertical Pack System
 *
 * Endpoints for managing vertical packs and their configurations:
 * - Vertical CRUD
 * - Signal types
 * - Scoring templates
 * - Evidence rules
 * - Persona templates
 * - Journey templates
 * - Radar targets
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import {
  createOSResponse,
  createOSError,
  generateRequestId
} from './types.js';
import * as verticalPack from '../../services/verticalPack.js';

const router = express.Router();

// ============================================================================
// VERTICAL PACK CRUD
// ============================================================================

/**
 * GET /api/os/verticals
 * List all vertical packs
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { include_sub = 'true', active_only = 'true' } = req.query;

    const verticals = await verticalPack.getAllVerticals({
      includeSubVerticals: include_sub === 'true',
      activeOnly: active_only === 'true'
    });

    res.json(createOSResponse({
      success: true,
      data: {
        verticals,
        total: verticals.length
      },
      reason: `Found ${verticals.length} verticals`,
      confidence: 100,
      endpoint: '/api/os/verticals',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error listing verticals:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICALS_LIST_ERROR',
      endpoint: '/api/os/verticals',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/verticals/dashboard
 * Get vertical dashboard summary
 */
router.get('/dashboard', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const dashboard = await verticalPack.getDashboard();

    res.json(createOSResponse({
      success: true,
      data: {
        verticals: dashboard,
        summary: {
          total: dashboard.length,
          active: dashboard.filter(v => v.is_active).length,
          with_journeys: dashboard.filter(v => v.journey_templates_count > 0).length
        }
      },
      reason: 'Vertical dashboard',
      confidence: 100,
      endpoint: '/api/os/verticals/dashboard',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error getting dashboard:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICALS_DASHBOARD_ERROR',
      endpoint: '/api/os/verticals/dashboard',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/verticals/:slug
 * Get vertical by slug
 */
router.get('/:slug', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const vertical = await verticalPack.getVertical(slug);

    if (!vertical) {
      return res.status(404).json(createOSError({
        error: `Vertical not found: ${slug}`,
        code: 'OS_VERTICAL_NOT_FOUND',
        endpoint: `/api/os/verticals/${slug}`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: vertical,
      reason: `Vertical: ${vertical.name}`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error getting vertical:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_GET_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * GET /api/os/verticals/:slug/config
 * Get complete vertical configuration
 */
router.get('/:slug/config', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const config = await verticalPack.getVerticalConfig(slug);

    if (!config) {
      return res.status(404).json(createOSError({
        error: `Vertical not found: ${slug}`,
        code: 'OS_VERTICAL_NOT_FOUND',
        endpoint: `/api/os/verticals/${slug}/config`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    res.json(createOSResponse({
      success: true,
      data: config,
      reason: `Complete configuration for ${slug}`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/config`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error getting config:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_CONFIG_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/config`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/verticals
 * Create a new vertical pack
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug, name, description, parent_vertical_id, config, features, icon, color } = req.body;

    if (!slug || !name) {
      return res.status(400).json(createOSError({
        error: 'slug and name are required',
        code: 'OS_VERTICAL_INVALID_INPUT',
        endpoint: '/api/os/verticals',
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const vertical = await verticalPack.createVertical({
      slug,
      name,
      description,
      parentVerticalId: parent_vertical_id,
      config,
      features,
      icon,
      color
    });

    res.status(201).json(createOSResponse({
      success: true,
      data: vertical,
      reason: `Created vertical: ${name}`,
      confidence: 100,
      endpoint: '/api/os/verticals',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error creating vertical:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_CREATE_ERROR',
      endpoint: '/api/os/verticals',
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * PATCH /api/os/verticals/:slug
 * Update a vertical pack
 */
router.patch('/:slug', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const vertical = await verticalPack.updateVertical(slug, req.body);

    res.json(createOSResponse({
      success: true,
      data: vertical,
      reason: `Updated vertical: ${vertical.name}`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error updating vertical:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_UPDATE_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * DELETE /api/os/verticals/:slug
 * Delete a vertical pack
 */
router.delete('/:slug', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    await verticalPack.deleteVertical(slug);

    res.json(createOSResponse({
      success: true,
      data: { deleted: true, slug },
      reason: `Deleted vertical: ${slug}`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error deleting vertical:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_DELETE_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/verticals/:slug/clone
 * Clone a vertical pack
 */
router.post('/:slug/clone', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const { new_slug, new_name } = req.body;

    if (!new_slug || !new_name) {
      return res.status(400).json(createOSError({
        error: 'new_slug and new_name are required',
        code: 'OS_VERTICAL_INVALID_INPUT',
        endpoint: `/api/os/verticals/${slug}/clone`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const vertical = await verticalPack.cloneVertical(slug, new_slug, new_name);

    res.status(201).json(createOSResponse({
      success: true,
      data: vertical,
      reason: `Cloned ${slug} to ${new_slug}`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/clone`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error cloning vertical:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_CLONE_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/clone`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// SIGNAL TYPES
// ============================================================================

/**
 * GET /api/os/verticals/:slug/signals
 * Get signal types for a vertical
 */
router.get('/:slug/signals', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const signals = await verticalPack.getSignalTypes(slug);

    res.json(createOSResponse({
      success: true,
      data: { signals, total: signals.length },
      reason: `Found ${signals.length} signal types`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/signals`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error getting signals:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_SIGNALS_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/signals`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/verticals/:slug/signals
 * Create a signal type
 */
router.post('/:slug/signals', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const signal = await verticalPack.createSignalType(slug, req.body);

    res.status(201).json(createOSResponse({
      success: true,
      data: signal,
      reason: `Created signal type: ${signal.name}`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/signals`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error creating signal:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_SIGNAL_CREATE_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/signals`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// SCORING TEMPLATES
// ============================================================================

/**
 * GET /api/os/verticals/:slug/scoring
 * Get scoring templates for a vertical
 */
router.get('/:slug/scoring', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const templates = await verticalPack.getScoringTemplates(slug);

    res.json(createOSResponse({
      success: true,
      data: { templates, total: templates.length },
      reason: `Found ${templates.length} scoring templates`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/scoring`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error getting scoring templates:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_SCORING_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/scoring`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/verticals/:slug/scoring
 * Create a scoring template
 */
router.post('/:slug/scoring', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const template = await verticalPack.createScoringTemplate(slug, req.body);

    res.status(201).json(createOSResponse({
      success: true,
      data: template,
      reason: `Created scoring template: ${template.name}`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/scoring`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error creating scoring template:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_SCORING_CREATE_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/scoring`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// EVIDENCE RULES
// ============================================================================

/**
 * GET /api/os/verticals/:slug/evidence
 * Get evidence rules for a vertical
 */
router.get('/:slug/evidence', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const rules = await verticalPack.getEvidenceRules(slug);

    res.json(createOSResponse({
      success: true,
      data: { rules, total: rules.length },
      reason: `Found ${rules.length} evidence rules`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/evidence`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error getting evidence rules:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_EVIDENCE_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/evidence`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/verticals/:slug/evidence
 * Create an evidence rule
 */
router.post('/:slug/evidence', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const rule = await verticalPack.createEvidenceRule(slug, req.body);

    res.status(201).json(createOSResponse({
      success: true,
      data: rule,
      reason: `Created evidence rule: ${rule.name}`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/evidence`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error creating evidence rule:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_EVIDENCE_CREATE_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/evidence`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/verticals/:slug/evidence/evaluate
 * Evaluate evidence rules against entity data
 */
router.post('/:slug/evidence/evaluate', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const { entity_data } = req.body;

    if (!entity_data) {
      return res.status(400).json(createOSError({
        error: 'entity_data is required',
        code: 'OS_VERTICAL_INVALID_INPUT',
        endpoint: `/api/os/verticals/${slug}/evidence/evaluate`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const evidence = await verticalPack.evaluateEvidenceRules(slug, entity_data);

    res.json(createOSResponse({
      success: true,
      data: { evidence, total: evidence.length },
      reason: `Generated ${evidence.length} evidence items`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/evidence/evaluate`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error evaluating evidence:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_EVIDENCE_EVAL_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/evidence/evaluate`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// PERSONA TEMPLATES
// ============================================================================

/**
 * GET /api/os/verticals/:slug/personas
 * Get persona templates for a vertical
 */
router.get('/:slug/personas', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const personas = await verticalPack.getPersonaTemplates(slug);

    res.json(createOSResponse({
      success: true,
      data: { personas, total: personas.length },
      reason: `Found ${personas.length} persona templates`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/personas`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error getting personas:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_PERSONAS_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/personas`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/verticals/:slug/personas/match
 * Match persona to contact
 */
router.post('/:slug/personas/match', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const { contact_data } = req.body;

    if (!contact_data) {
      return res.status(400).json(createOSError({
        error: 'contact_data is required',
        code: 'OS_VERTICAL_INVALID_INPUT',
        endpoint: `/api/os/verticals/${slug}/personas/match`,
        executionTimeMs: Date.now() - startTime,
        requestId
      }));
    }

    const match = await verticalPack.matchPersona(slug, contact_data);

    res.json(createOSResponse({
      success: !!match,
      data: match,
      reason: match ? `Matched persona: ${match.persona.name}` : 'No matching persona found',
      confidence: match ? match.matchScore : 0,
      endpoint: `/api/os/verticals/${slug}/personas/match`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error matching persona:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_PERSONA_MATCH_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/personas/match`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// JOURNEY TEMPLATES
// ============================================================================

/**
 * GET /api/os/verticals/:slug/journeys
 * Get journey templates for a vertical
 */
router.get('/:slug/journeys', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const { type } = req.query;

    const journeys = await verticalPack.getJourneyTemplates(slug, type);

    res.json(createOSResponse({
      success: true,
      data: { journeys, total: journeys.length },
      reason: `Found ${journeys.length} journey templates`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/journeys`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error getting journeys:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_JOURNEYS_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/journeys`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/verticals/:slug/journeys
 * Create a journey template
 */
router.post('/:slug/journeys', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const journey = await verticalPack.createJourneyTemplate(slug, req.body);

    res.status(201).json(createOSResponse({
      success: true,
      data: journey,
      reason: `Created journey template: ${journey.name}`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/journeys`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error creating journey:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_JOURNEY_CREATE_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/journeys`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// RADAR TARGETS
// ============================================================================

/**
 * GET /api/os/verticals/:slug/radar
 * Get radar targets for a vertical
 */
router.get('/:slug/radar', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const targets = await verticalPack.getRadarTargets(slug);

    res.json(createOSResponse({
      success: true,
      data: { targets, total: targets.length },
      reason: `Found ${targets.length} radar targets`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/radar`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error getting radar targets:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_RADAR_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/radar`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

/**
 * POST /api/os/verticals/:slug/radar
 * Create a radar target
 */
router.post('/:slug/radar', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const target = await verticalPack.createRadarTarget(slug, req.body);

    res.status(201).json(createOSResponse({
      success: true,
      data: target,
      reason: `Created radar target: ${target.name}`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/radar`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error creating radar target:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_RADAR_CREATE_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/radar`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// VERSION HISTORY
// ============================================================================

/**
 * GET /api/os/verticals/:slug/versions
 * Get version history for a vertical
 */
router.get('/:slug/versions', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { slug } = req.params;
    const versions = await verticalPack.getVersionHistory(slug);

    res.json(createOSResponse({
      success: true,
      data: { versions, total: versions.length },
      reason: `Found ${versions.length} versions`,
      confidence: 100,
      endpoint: `/api/os/verticals/${slug}/versions`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));

  } catch (error) {
    console.error('[OS:Verticals] Error getting versions:', error);
    Sentry.captureException(error);

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_VERTICAL_VERSIONS_ERROR',
      endpoint: `/api/os/verticals/${req.params.slug}/versions`,
      executionTimeMs: Date.now() - startTime,
      requestId
    }));
  }
});

// ============================================================================
// HEALTH
// ============================================================================

/**
 * GET /api/os/verticals/health
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'os-verticals',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
