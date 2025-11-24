/**
 * UPR OS Pipeline Endpoint
 * Sprint 64: Unified OS API Layer
 *
 * POST /api/os/pipeline
 *
 * End-to-end pipeline orchestration: Discovery -> Enrich -> Score -> Rank -> Outreach
 */

import express from 'express';
import * as Sentry from '@sentry/node';
import { pool } from '../../utils/db.js';
import { v4 as uuidv4 } from 'uuid';
import multiSourceOrchestrator from '../../server/services/multiSourceOrchestrator.js';
import signalQualityScoring from '../../server/services/signalQualityScoring.js';
import { computeQScore } from '../../utils/qscore.js';
import {
  createOSResponse,
  createOSError,
  getTenantId,
  generateRequestId,
  OS_PROFILES,
  PIPELINE_MODES
} from './types.js';

const router = express.Router();

/**
 * Pipeline step definitions
 */
const PIPELINE_STEPS = {
  DISCOVERY: 'discovery',
  ENRICHMENT: 'enrichment',
  SCORING: 'scoring',
  RANKING: 'ranking',
  OUTREACH: 'outreach'
};

/**
 * POST /api/os/pipeline
 *
 * Execute the full OS pipeline or partial pipeline based on mode
 *
 * Request Body:
 * {
 *   "industry": "banking",
 *   "input": {                         // Initial input data
 *     "filters": {
 *       "location": "UAE",
 *       "sector": "Banking",
 *       "companySize": "Enterprise"
 *     },
 *     "entities": []                   // Optional: pre-existing entities
 *   },
 *   "mode": "discovery_to_outreach",   // Pipeline mode
 *   "options": {
 *     "profile": "banking_employee",
 *     "max_results": 50,
 *     "skip_steps": [],                // Optional: steps to skip
 *     "parallel": true,                // Run independent steps in parallel
 *     "save_results": true             // Persist results to database
 *   }
 * }
 *
 * Response: OSResponse with pipeline results and step details
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const pipelineId = uuidv4();

  try {
    const tenantId = getTenantId(req);
    const {
      industry = 'default',
      input = {},
      mode = PIPELINE_MODES.FULL_PIPELINE,
      options = {}
    } = req.body;

    const {
      profile = OS_PROFILES.DEFAULT,
      max_results = 50,
      skip_steps = [],
      parallel = false,
      save_results = true
    } = options;

    console.log(`[OS:Pipeline] Request ${requestId} - Mode: ${mode}, Industry: ${industry}, Pipeline: ${pipelineId}`);

    // Initialize pipeline state
    const pipelineState = {
      pipeline_id: pipelineId,
      request_id: requestId,
      mode,
      industry,
      profile,
      tenant_id: tenantId,
      steps: {},
      entities: input.entities || [],
      signals: [],
      scores: {},
      rankings: [],
      outreach: []
    };

    // Determine which steps to run based on mode
    const stepsToRun = getStepsForMode(mode, skip_steps);

    // Log pipeline start
    if (save_results) {
      await logPipelineStart(pipelineId, tenantId, mode, input);
    }

    // Execute pipeline steps
    for (const step of stepsToRun) {
      const stepStartTime = Date.now();

      try {
        console.log(`[OS:Pipeline] ${pipelineId} - Starting step: ${step}`);

        switch (step) {
          case PIPELINE_STEPS.DISCOVERY:
            await executeDiscoveryStep(pipelineState, input, max_results);
            break;

          case PIPELINE_STEPS.ENRICHMENT:
            await executeEnrichmentStep(pipelineState);
            break;

          case PIPELINE_STEPS.SCORING:
            await executeScoringStep(pipelineState);
            break;

          case PIPELINE_STEPS.RANKING:
            await executeRankingStep(pipelineState);
            break;

          case PIPELINE_STEPS.OUTREACH:
            await executeOutreachStep(pipelineState);
            break;
        }

        pipelineState.steps[step] = {
          status: 'completed',
          duration_ms: Date.now() - stepStartTime,
          output_count: getStepOutputCount(pipelineState, step)
        };

        console.log(`[OS:Pipeline] ${pipelineId} - Step ${step} completed in ${Date.now() - stepStartTime}ms`);

      } catch (stepError) {
        console.error(`[OS:Pipeline] ${pipelineId} - Step ${step} failed:`, stepError);

        pipelineState.steps[step] = {
          status: 'failed',
          duration_ms: Date.now() - stepStartTime,
          error: stepError.message
        };

        // Continue to next step (degraded mode) unless it's a critical failure
        if (step === PIPELINE_STEPS.DISCOVERY && pipelineState.entities.length === 0) {
          throw new Error(`Critical step ${step} failed: ${stepError.message}`);
        }
      }
    }

    // Save results if requested
    if (save_results) {
      await savePipelineResults(pipelineState);
    }

    const executionTimeMs = Date.now() - startTime;

    // Calculate overall success rate
    const completedSteps = Object.values(pipelineState.steps).filter(s => s.status === 'completed').length;
    const confidence = Math.round((completedSteps / stepsToRun.length) * 100);

    // Build response
    const response = createOSResponse({
      success: completedSteps > 0,
      data: {
        pipeline_id: pipelineId,
        mode,
        steps_executed: pipelineState.steps,
        results: {
          entities_discovered: pipelineState.entities.length,
          entities_enriched: pipelineState.entities.filter(e => e.enriched).length,
          entities_scored: Object.keys(pipelineState.scores).length,
          entities_ranked: pipelineState.rankings.length,
          outreach_generated: pipelineState.outreach.length
        },
        top_results: pipelineState.rankings.slice(0, 10).map(r => ({
          entity_id: r.entity_id,
          rank: r.rank,
          rank_score: r.rank_score,
          entity: pipelineState.entities.find(e => e.id === r.entity_id)
        })),
        outreach_preview: pipelineState.outreach.slice(0, 3)
      },
      reason: `Pipeline ${mode} completed ${completedSteps}/${stepsToRun.length} steps`,
      confidence,
      profile,
      endpoint: '/api/os/pipeline',
      executionTimeMs,
      requestId
    });

    console.log(`[OS:Pipeline] ${pipelineId} completed in ${executionTimeMs}ms`);

    res.json(response);

  } catch (error) {
    const executionTimeMs = Date.now() - startTime;

    console.error(`[OS:Pipeline] Request ${requestId} failed:`, error);

    Sentry.captureException(error, {
      tags: {
        os_endpoint: '/api/os/pipeline',
        pipeline_id: pipelineId,
        request_id: requestId
      },
      extra: req.body
    });

    res.status(500).json(createOSError({
      error: error.message,
      code: 'OS_PIPELINE_ERROR',
      endpoint: '/api/os/pipeline',
      executionTimeMs,
      requestId
    }));
  }
});

/**
 * Determine pipeline steps based on mode
 * @private
 */
function getStepsForMode(mode, skipSteps = []) {
  const modeSteps = {
    [PIPELINE_MODES.DISCOVERY_ONLY]: [PIPELINE_STEPS.DISCOVERY],
    [PIPELINE_MODES.DISCOVERY_TO_ENRICH]: [PIPELINE_STEPS.DISCOVERY, PIPELINE_STEPS.ENRICHMENT],
    [PIPELINE_MODES.DISCOVERY_TO_SCORE]: [PIPELINE_STEPS.DISCOVERY, PIPELINE_STEPS.ENRICHMENT, PIPELINE_STEPS.SCORING],
    [PIPELINE_MODES.DISCOVERY_TO_RANK]: [PIPELINE_STEPS.DISCOVERY, PIPELINE_STEPS.ENRICHMENT, PIPELINE_STEPS.SCORING, PIPELINE_STEPS.RANKING],
    [PIPELINE_MODES.DISCOVERY_TO_OUTREACH]: [PIPELINE_STEPS.DISCOVERY, PIPELINE_STEPS.ENRICHMENT, PIPELINE_STEPS.SCORING, PIPELINE_STEPS.RANKING, PIPELINE_STEPS.OUTREACH],
    [PIPELINE_MODES.FULL_PIPELINE]: [PIPELINE_STEPS.DISCOVERY, PIPELINE_STEPS.ENRICHMENT, PIPELINE_STEPS.SCORING, PIPELINE_STEPS.RANKING, PIPELINE_STEPS.OUTREACH]
  };

  const steps = modeSteps[mode] || modeSteps[PIPELINE_MODES.FULL_PIPELINE];
  return steps.filter(s => !skipSteps.includes(s));
}

/**
 * Execute discovery step
 * @private
 */
async function executeDiscoveryStep(state, input, maxResults) {
  const { filters = {} } = input;

  // If entities already provided, skip discovery
  if (state.entities.length > 0) {
    console.log(`[OS:Pipeline] ${state.pipeline_id} - Using ${state.entities.length} pre-existing entities`);
    return;
  }

  // Execute multi-source orchestration
  const result = await multiSourceOrchestrator.orchestrate({
    sources: null, // Use all available sources
    filters: {
      ...filters,
      industry: state.industry
    },
    maxParallel: 4,
    tenantId: state.tenant_id
  });

  state.signals = result.signals || [];

  // Extract unique companies from signals
  const companiesMap = new Map();
  for (const signal of state.signals) {
    const companyId = signal.company_id || signal.id || uuidv4();
    if (!companiesMap.has(companyId)) {
      companiesMap.set(companyId, {
        id: companyId,
        name: signal.company_name || signal.company || signal.title,
        domain: signal.domain,
        industry: signal.industry || state.industry,
        source: signal.source,
        signals: [signal],
        discovered_at: new Date().toISOString()
      });
    } else {
      companiesMap.get(companyId).signals.push(signal);
    }
  }

  state.entities = Array.from(companiesMap.values()).slice(0, maxResults);
}

/**
 * Execute enrichment step
 * @private
 */
async function executeEnrichmentStep(state) {
  for (const entity of state.entities) {
    try {
      // Check if entity exists in database
      const existing = await pool.query(
        'SELECT id, domain, linkedin_url, size_range FROM targeted_companies WHERE name ILIKE $1 LIMIT 1',
        [entity.name]
      );

      if (existing.rows.length > 0) {
        Object.assign(entity, existing.rows[0]);
      }

      // Mark as enriched
      entity.enriched = true;
      entity.enrichment_source = existing.rows.length > 0 ? 'database' : 'discovery';

    } catch (error) {
      console.warn(`[OS:Pipeline] Enrichment failed for ${entity.name}:`, error.message);
      entity.enriched = false;
    }
  }
}

/**
 * Execute scoring step
 * @private
 */
async function executeScoringStep(state) {
  for (const entity of state.entities) {
    const entitySignals = entity.signals || [];

    // Calculate Q-Score
    const qScore = computeQScore(entity, entitySignals);

    // Calculate other scores
    const tScore = calculateTimingScore(entitySignals);
    const lScore = calculateLeadScore(entity, state.profile);
    const eScore = calculateEvidenceScore(entitySignals);

    state.scores[entity.id] = {
      q_score: qScore.value,
      t_score: tScore,
      l_score: lScore,
      e_score: eScore,
      composite: calculateComposite(qScore.value, tScore, lScore, eScore, state.profile)
    };

    entity.scores = state.scores[entity.id];
  }
}

/**
 * Execute ranking step
 * @private
 */
async function executeRankingStep(state) {
  // Get profile weights
  const weights = getProfileWeights(state.profile);

  // Calculate rank scores
  const rankedEntities = state.entities.map(entity => {
    const scores = state.scores[entity.id] || {};
    const rankScore = (
      (scores.q_score || 0) * weights.q_score +
      (scores.t_score || 0) * weights.t_score +
      (scores.l_score || 0) * weights.l_score +
      (scores.e_score || 0) * weights.e_score
    );

    return {
      entity_id: entity.id,
      rank_score: rankScore,
      scores
    };
  });

  // Sort by rank score
  rankedEntities.sort((a, b) => b.rank_score - a.rank_score);

  // Assign ranks
  state.rankings = rankedEntities.map((entity, index) => ({
    ...entity,
    rank: index + 1
  }));
}

/**
 * Execute outreach step
 * @private
 */
async function executeOutreachStep(state) {
  // Generate outreach for top-ranked entities
  const topEntities = state.rankings.slice(0, 10);

  for (const ranked of topEntities) {
    const entity = state.entities.find(e => e.id === ranked.entity_id);
    if (!entity) continue;

    const content = generateOutreachContent(entity, state.profile);
    state.outreach.push({
      entity_id: entity.id,
      rank: ranked.rank,
      ...content
    });
  }
}

/**
 * Helper: Calculate timing score
 * @private
 */
function calculateTimingScore(signals) {
  if (!signals || signals.length === 0) return 30;

  const now = Date.now();
  const recentSignals = signals.filter(s => {
    const signalDate = new Date(s.created_at || s.date || s.published_at);
    const daysSince = (now - signalDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 30;
  });

  if (recentSignals.length >= 3) return 90;
  if (recentSignals.length >= 1) return 70;
  return 40;
}

/**
 * Helper: Calculate lead score
 * @private
 */
function calculateLeadScore(entity, profile) {
  let score = 40;

  if (entity.domain) score += 15;
  if (entity.linkedin_url) score += 15;
  if (entity.size_range) score += 15;
  if (entity.industry) score += 15;

  return Math.min(100, score);
}

/**
 * Helper: Calculate evidence score
 * @private
 */
function calculateEvidenceScore(signals) {
  if (!signals || signals.length === 0) return 20;

  return Math.min(100, 30 + (signals.length * 10));
}

/**
 * Helper: Calculate composite score
 * @private
 */
function calculateComposite(qScore, tScore, lScore, eScore, profile) {
  const weights = getProfileWeights(profile);
  return Math.round(
    qScore * weights.q_score +
    tScore * weights.t_score +
    lScore * weights.l_score +
    eScore * weights.e_score
  );
}

/**
 * Helper: Get profile weights
 * @private
 */
function getProfileWeights(profile) {
  const weights = {
    [OS_PROFILES.DEFAULT]: { q_score: 0.3, t_score: 0.25, l_score: 0.25, e_score: 0.2 },
    [OS_PROFILES.BANKING_EMPLOYEE]: { q_score: 0.25, t_score: 0.35, l_score: 0.2, e_score: 0.2 },
    [OS_PROFILES.RECRUITMENT_HIRING]: { q_score: 0.2, t_score: 0.4, l_score: 0.2, e_score: 0.2 }
  };

  return weights[profile] || weights[OS_PROFILES.DEFAULT];
}

/**
 * Helper: Generate outreach content
 * @private
 */
function generateOutreachContent(entity, profile) {
  const name = entity.name || 'Company';
  const firstName = name.split(' ')[0];

  return {
    channel: 'email',
    subject: `Opportunity for ${name}`,
    body: `Hi,\n\nI noticed ${name} and wanted to reach out about a potential opportunity.\n\nBased on recent market signals, I believe there's strong alignment with what we offer.\n\nWould you be open to a brief conversation?\n\nBest regards`,
    personalization_level: 'medium'
  };
}

/**
 * Helper: Get step output count
 * @private
 */
function getStepOutputCount(state, step) {
  switch (step) {
    case PIPELINE_STEPS.DISCOVERY:
      return state.entities.length;
    case PIPELINE_STEPS.ENRICHMENT:
      return state.entities.filter(e => e.enriched).length;
    case PIPELINE_STEPS.SCORING:
      return Object.keys(state.scores).length;
    case PIPELINE_STEPS.RANKING:
      return state.rankings.length;
    case PIPELINE_STEPS.OUTREACH:
      return state.outreach.length;
    default:
      return 0;
  }
}

/**
 * Log pipeline start to database
 * @private
 */
async function logPipelineStart(pipelineId, tenantId, mode, input) {
  try {
    await pool.query(
      `INSERT INTO enrichment_jobs
       (id, tenant_id, company_id, status, created_at, mode, metadata)
       VALUES ($1, $2, $3, 'PROCESSING', NOW(), 'os_pipeline', $4)`,
      [pipelineId, tenantId, null, JSON.stringify({ mode, input_summary: { filters: input.filters } })]
    );
  } catch (error) {
    console.warn('[OS:Pipeline] Failed to log pipeline start:', error.message);
  }
}

/**
 * Save pipeline results to database
 * @private
 */
async function savePipelineResults(state) {
  try {
    await pool.query(
      `UPDATE enrichment_jobs
       SET status = 'COMPLETED', completed_at = NOW(),
           metadata = metadata || $1
       WHERE id = $2`,
      [JSON.stringify({
        results: {
          entities_count: state.entities.length,
          ranked_count: state.rankings.length,
          outreach_count: state.outreach.length
        },
        steps: state.steps
      }), state.pipeline_id]
    );
  } catch (error) {
    console.warn('[OS:Pipeline] Failed to save pipeline results:', error.message);
  }
}

/**
 * GET /api/os/pipeline/status/:pipelineId
 * Get pipeline execution status
 */
router.get('/status/:pipelineId', async (req, res) => {
  const { pipelineId } = req.params;
  const tenantId = getTenantId(req);

  try {
    const result = await pool.query(
      `SELECT id, status, created_at, completed_at, metadata
       FROM enrichment_jobs
       WHERE id = $1 AND tenant_id = $2 AND mode = 'os_pipeline'`,
      [pipelineId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pipeline not found'
      });
    }

    res.json({
      success: true,
      pipeline: result.rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/os/pipeline/modes
 * Get available pipeline modes
 */
router.get('/modes', (req, res) => {
  res.json({
    success: true,
    modes: PIPELINE_MODES,
    steps: PIPELINE_STEPS
  });
});

/**
 * GET /api/os/pipeline/health
 * Health check for pipeline service
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'os-pipeline',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;
