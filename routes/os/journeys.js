/**
 * Journey Engine API Routes
 * Sprints 58-61: Complete Journey Engine System
 *
 * Endpoints for journey definitions, instances, steps, templates, and monitoring.
 */

import express from 'express';
import * as journeyEngine from '../../services/journeyEngine.js';
import * as journeySteps from '../../services/journeySteps.js';
import * as journeyTemplates from '../../services/journeyTemplates.js';
import * as journeyMonitoring from '../../services/journeyMonitoring.js';

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
// JOURNEY DEFINITIONS (S58)
// ============================================================================

/**
 * GET /api/os/journeys/definitions
 * List all journey definitions
 */
router.get('/definitions', async (req, res) => {
  try {
    const { vertical, includeInactive } = req.query;

    const definitions = await journeyEngine.getAllDefinitions({
      vertical,
      includeInactive: includeInactive === 'true'
    });

    res.json({
      success: true,
      data: definitions,
      count: definitions.length
    });
  } catch (error) {
    console.error('Error listing definitions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/definitions/:identifier
 * Get journey definition
 */
router.get('/definitions/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { withConfig } = req.query;
    const context = getContext(req);

    const definition = withConfig === 'true'
      ? await journeyEngine.getDefinitionWithConfig(identifier, context)
      : await journeyEngine.getDefinition(identifier);

    if (!definition) {
      return res.status(404).json({ success: false, error: 'Definition not found' });
    }

    res.json({ success: true, data: definition });
  } catch (error) {
    console.error('Error getting definition:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/definitions
 * Create journey definition
 */
router.post('/definitions', async (req, res) => {
  try {
    const definition = await journeyEngine.createDefinition(req.body);
    res.status(201).json({ success: true, data: definition });
  } catch (error) {
    console.error('Error creating definition:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/os/journeys/definitions/:identifier
 * Update journey definition
 */
router.patch('/definitions/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const definition = await journeyEngine.updateDefinition(identifier, req.body);

    if (!definition) {
      return res.status(404).json({ success: false, error: 'Definition not found' });
    }

    res.json({ success: true, data: definition });
  } catch (error) {
    console.error('Error updating definition:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// JOURNEY INSTANCES (S58)
// ============================================================================

/**
 * GET /api/os/journeys/instances
 * List journey instances
 */
router.get('/instances', async (req, res) => {
  try {
    const { definitionId, status, limit, offset } = req.query;

    const instances = await journeyEngine.getInstances({
      definitionId,
      status,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    res.json({
      success: true,
      data: instances,
      count: instances.length
    });
  } catch (error) {
    console.error('Error listing instances:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/instances/:id
 * Get journey instance
 */
router.get('/instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const instance = await journeyEngine.getInstance(id);

    if (!instance) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }

    res.json({ success: true, data: instance });
  } catch (error) {
    console.error('Error getting instance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/instances
 * Create journey instance
 */
router.post('/instances', async (req, res) => {
  try {
    const { definitionId, context, ...options } = req.body;
    const instance = await journeyEngine.createInstance(definitionId, context, options);
    res.status(201).json({ success: true, data: instance });
  } catch (error) {
    console.error('Error creating instance:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/instances/:id/start
 * Start journey instance
 */
router.post('/instances/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const instance = await journeyEngine.startInstance(id);
    res.json({ success: true, data: instance });
  } catch (error) {
    console.error('Error starting instance:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/instances/:id/transition
 * Transition instance state
 */
router.post('/instances/:id/transition', async (req, res) => {
  try {
    const { id } = req.params;
    const { toState, trigger, triggerData, stepIndex, stepSlug } = req.body;

    // Acquire lock first
    const lockAcquired = await journeyEngine.acquireLock(id);
    if (!lockAcquired) {
      return res.status(423).json({ success: false, error: 'Failed to acquire lock' });
    }

    try {
      const instance = await journeyEngine.transitionState(id, toState, trigger, {
        triggerData,
        stepIndex,
        stepSlug
      });
      res.json({ success: true, data: instance });
    } finally {
      await journeyEngine.releaseLock(id);
    }
  } catch (error) {
    console.error('Error transitioning state:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/instances/:id/execute-step
 * Execute next step
 */
router.post('/instances/:id/execute-step', async (req, res) => {
  try {
    const { id } = req.params;
    const context = { ...getContext(req), ...req.body.context };

    const result = await journeyEngine.executeNextStep(id, context);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error executing step:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/instances/:id/complete
 * Complete journey instance
 */
router.post('/instances/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { results } = req.body;

    const instance = await journeyEngine.completeInstance(id, results);
    res.json({ success: true, data: instance });
  } catch (error) {
    console.error('Error completing instance:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/instances/:id/fail
 * Fail journey instance
 */
router.post('/instances/:id/fail', async (req, res) => {
  try {
    const { id } = req.params;
    const { errorDetails } = req.body;

    const instance = await journeyEngine.failInstance(id, errorDetails);
    res.json({ success: true, data: instance });
  } catch (error) {
    console.error('Error failing instance:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/instances/:id/rollback
 * Rollback journey instance
 */
router.post('/instances/:id/rollback', async (req, res) => {
  try {
    const { id } = req.params;
    const { steps = 1 } = req.body;

    const instance = await journeyEngine.rollbackInstance(id, steps);
    res.json({ success: true, data: instance });
  } catch (error) {
    console.error('Error rolling back instance:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/instances/:id/history
 * Get state history
 */
router.get('/instances/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const history = await journeyEngine.getStateHistory(id);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/instances/:id/reasoning
 * Get reasoning trace
 */
router.get('/instances/:id/reasoning', async (req, res) => {
  try {
    const { id } = req.params;
    const trace = await journeyEngine.getReasoningTrace(id);
    res.json({ success: true, data: trace });
  } catch (error) {
    console.error('Error getting reasoning trace:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// STEP TYPES (S59)
// ============================================================================

/**
 * GET /api/os/journeys/step-types
 * List all step types
 */
router.get('/step-types', async (req, res) => {
  try {
    const { category } = req.query;
    const stepTypes = await journeyEngine.getAllStepTypes({ category });
    res.json({ success: true, data: stepTypes, count: stepTypes.length });
  } catch (error) {
    console.error('Error listing step types:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/step-types/:slug
 * Get step type
 */
router.get('/step-types/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const stepType = await journeyEngine.getStepType(slug);

    if (!stepType) {
      return res.status(404).json({ success: false, error: 'Step type not found' });
    }

    res.json({ success: true, data: stepType });
  } catch (error) {
    console.error('Error getting step type:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/step-types
 * Create step type
 */
router.post('/step-types', async (req, res) => {
  try {
    const stepType = await journeySteps.createStepType(req.body);
    res.status(201).json({ success: true, data: stepType });
  } catch (error) {
    console.error('Error creating step type:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/instances/:id/executions
 * Get step executions for instance
 */
router.get('/instances/:id/executions', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    const executions = await journeySteps.getStepExecutions(id, { status });
    res.json({ success: true, data: executions });
  } catch (error) {
    console.error('Error getting executions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TEMPLATES (S60)
// ============================================================================

/**
 * GET /api/os/journeys/templates
 * List all templates
 */
router.get('/templates', async (req, res) => {
  try {
    const { vertical, persona, includeInactive } = req.query;

    const templates = await journeyTemplates.getAllTemplates({
      vertical,
      persona,
      includeInactive: includeInactive === 'true'
    });

    res.json({ success: true, data: templates, count: templates.length });
  } catch (error) {
    console.error('Error listing templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/templates/:identifier
 * Get template
 */
router.get('/templates/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { version, withConfig } = req.query;
    const context = getContext(req);

    const template = withConfig === 'true'
      ? await journeyTemplates.getTemplateWithConfig(identifier, context)
      : await journeyTemplates.getTemplate(identifier, version ? parseInt(version) : null);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/templates
 * Create template
 */
router.post('/templates', async (req, res) => {
  try {
    const template = await journeyTemplates.createTemplate(req.body);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/templates/:slug/version
 * Create new template version
 */
router.post('/templates/:slug/version', async (req, res) => {
  try {
    const { slug } = req.params;
    const { createdBy, ...updates } = req.body;

    const template = await journeyTemplates.createTemplateVersion(slug, updates, createdBy);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('Error creating version:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/templates/:slug/clone
 * Clone template
 */
router.post('/templates/:slug/clone', async (req, res) => {
  try {
    const { slug } = req.params;
    const { newSlug, createdBy, ...modifications } = req.body;

    if (!newSlug) {
      return res.status(400).json({ success: false, error: 'newSlug is required' });
    }

    const template = await journeyTemplates.cloneTemplate(slug, newSlug, modifications, createdBy);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('Error cloning template:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/templates/:identifier/versions
 * Get template versions
 */
router.get('/templates/:identifier/versions', async (req, res) => {
  try {
    const { identifier } = req.params;
    const versions = await journeyTemplates.getTemplateVersions(identifier);
    res.json({ success: true, data: versions });
  } catch (error) {
    console.error('Error getting versions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/templates/:slug/instantiate
 * Create instance from template
 */
router.post('/templates/:slug/instantiate', async (req, res) => {
  try {
    const { slug } = req.params;
    const { context, ...options } = req.body;

    const result = await journeyTemplates.instantiateTemplate(slug, context, options);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error instantiating template:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/verticals/:vertical/templates
 * Get templates for vertical
 */
router.get('/verticals/:vertical/templates', async (req, res) => {
  try {
    const { vertical } = req.params;
    const { bindingType, autoStartOnly } = req.query;

    const templates = await journeyTemplates.getTemplatesForVertical(vertical, {
      bindingType,
      autoStartOnly: autoStartOnly === 'true'
    });

    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('Error getting vertical templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// MONITORING & ANALYTICS (S61)
// ============================================================================

/**
 * GET /api/os/journeys/analytics
 * Get journey analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const { journeyDefinitionId, templateId, verticalSlug, timeRange } = req.query;

    const analytics = await journeyMonitoring.getJourneyAnalytics({
      journeyDefinitionId,
      templateId,
      verticalSlug,
      timeRange
    });

    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/instances/:id/timeline
 * Get execution timeline
 */
router.get('/instances/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const timeline = await journeyMonitoring.getExecutionTimeline(id);
    res.json({ success: true, data: timeline });
  } catch (error) {
    console.error('Error getting timeline:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/metrics
 * Get metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await journeyMonitoring.getMetrics(req.query);
    res.json({ success: true, data: metrics });
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/metrics
 * Record metric
 */
router.post('/metrics', async (req, res) => {
  try {
    const { metricType, metricName, value, ...scope } = req.body;
    const metric = await journeyMonitoring.recordMetric(metricType, metricName, value, scope);
    res.status(201).json({ success: true, data: metric });
  } catch (error) {
    console.error('Error recording metric:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// A/B TESTING (S61)
// ============================================================================

/**
 * GET /api/os/journeys/ab-tests
 * List A/B tests
 */
router.get('/ab-tests', async (req, res) => {
  try {
    const tests = await journeyMonitoring.getAllABTests(req.query);
    res.json({ success: true, data: tests });
  } catch (error) {
    console.error('Error listing A/B tests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/ab-tests/:id
 * Get A/B test
 */
router.get('/ab-tests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const test = await journeyMonitoring.getABTest(id);

    if (!test) {
      return res.status(404).json({ success: false, error: 'A/B test not found' });
    }

    res.json({ success: true, data: test });
  } catch (error) {
    console.error('Error getting A/B test:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/ab-tests
 * Create A/B test
 */
router.post('/ab-tests', async (req, res) => {
  try {
    const test = await journeyMonitoring.createABTest(req.body);
    res.status(201).json({ success: true, data: test });
  } catch (error) {
    console.error('Error creating A/B test:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/ab-tests/:id/start
 * Start A/B test
 */
router.post('/ab-tests/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const test = await journeyMonitoring.startABTest(id);
    res.json({ success: true, data: test });
  } catch (error) {
    console.error('Error starting A/B test:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/ab-tests/:id/stop
 * Stop A/B test
 */
router.post('/ab-tests/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const test = await journeyMonitoring.stopABTest(id);
    res.json({ success: true, data: test });
  } catch (error) {
    console.error('Error stopping A/B test:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/ab-tests/:id/variant
 * Get variant for instance
 */
router.get('/ab-tests/:id/variant', async (req, res) => {
  try {
    const { id } = req.params;
    const { instanceId } = req.query;

    if (!instanceId) {
      return res.status(400).json({ success: false, error: 'instanceId is required' });
    }

    const variant = await journeyMonitoring.getVariantForInstance(id, instanceId);
    res.json({ success: true, data: { variant } });
  } catch (error) {
    console.error('Error getting variant:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// MEMORY (S61)
// ============================================================================

/**
 * GET /api/os/journeys/memory/:scopeType/:scopeId
 * Get memory for entity
 */
router.get('/memory/:scopeType/:scopeId', async (req, res) => {
  try {
    const { scopeType, scopeId } = req.params;
    const { memoryType, memoryKey } = req.query;

    let memory;
    if (memoryType && memoryKey) {
      memory = await journeyMonitoring.getMemory(memoryType, scopeType, scopeId, memoryKey);
    } else if (memoryType) {
      memory = await journeyMonitoring.getMemory(memoryType, scopeType, scopeId);
    } else {
      memory = await journeyMonitoring.getEntityMemory(scopeType, scopeId);
    }

    res.json({ success: true, data: memory });
  } catch (error) {
    console.error('Error getting memory:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/memory
 * Store memory
 */
router.post('/memory', async (req, res) => {
  try {
    const memory = await journeyMonitoring.storeMemory(req.body);
    res.status(201).json({ success: true, data: memory });
  } catch (error) {
    console.error('Error storing memory:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DEBUG (S61)
// ============================================================================

/**
 * POST /api/os/journeys/instances/:id/debug/start
 * Start debug session
 */
router.post('/instances/:id/debug/start', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await journeyMonitoring.startDebugSession(id, req.body);
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    console.error('Error starting debug session:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/os/journeys/instances/:id/debug
 * Get debug session
 */
router.get('/instances/:id/debug', async (req, res) => {
  try {
    const { id } = req.params;
    const session = await journeyMonitoring.getDebugSession(id);

    if (!session) {
      return res.status(404).json({ success: false, error: 'No active debug session' });
    }

    res.json({ success: true, data: session });
  } catch (error) {
    console.error('Error getting debug session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/os/journeys/debug/:sessionId/end
 * End debug session
 */
router.post('/debug/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await journeyMonitoring.endDebugSession(sessionId);
    res.json({ success: true, data: session });
  } catch (error) {
    console.error('Error ending debug session:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DASHBOARD (S58)
// ============================================================================

/**
 * GET /api/os/journeys/dashboard
 * Get journey engine dashboard
 */
router.get('/dashboard', async (req, res) => {
  try {
    const dashboard = await journeyEngine.getDashboard();
    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error('Error getting dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
