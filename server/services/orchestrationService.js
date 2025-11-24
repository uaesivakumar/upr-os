/**
 * Orchestration Service
 * Sprint 69: Orchestration Hardening & Fail-Safe
 *
 * Robust pipeline orchestration with:
 * - Circuit breakers for external services
 * - Retry logic with exponential backoff
 * - Graceful degradation
 * - Pipeline state persistence
 * - Dead letter queue for failed jobs
 */

import * as Sentry from '@sentry/node';
import { pool } from '../../utils/db.js';

// ==========================================
// Circuit Breaker Implementation
// ==========================================

const CIRCUIT_STATES = {
  CLOSED: 'closed',      // Normal operation
  OPEN: 'open',          // Failing, reject calls
  HALF_OPEN: 'half_open' // Testing if service recovered
};

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    // Configuration
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000; // 30 seconds
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
  }

  async execute(fn) {
    if (this.state === CIRCUIT_STATES.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = CIRCUIT_STATES.HALF_OPEN;
      } else {
        throw new CircuitBreakerError(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        )
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.reset();
      }
    } else {
      this.failureCount = 0;
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = CIRCUIT_STATES.OPEN;
      this.nextAttemptTime = Date.now() + this.resetTimeout;
    }
  }

  reset() {
    this.state = CIRCUIT_STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }
}

class CircuitBreakerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.isCircuitBreaker = true;
  }
}

// ==========================================
// Retry Logic with Exponential Backoff
// ==========================================

async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry circuit breaker errors
      if (error.isCircuitBreaker) throw error;

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(factor, attempt), maxDelay);
        const jitter = Math.random() * 0.3 * delay; // 30% jitter

        if (onRetry) {
          onRetry(attempt + 1, delay + jitter, error);
        }

        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
  }

  throw lastError;
}

// ==========================================
// Pipeline State Machine
// ==========================================

const PIPELINE_STATES = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const STEP_STATES = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

// ==========================================
// Orchestration Service
// ==========================================

export class OrchestrationService {
  constructor(tenantId) {
    this.tenantId = tenantId || '00000000-0000-0000-0000-000000000001';

    // Circuit breakers for external services
    this.circuitBreakers = {
      discovery: new CircuitBreaker('discovery', { failureThreshold: 3, timeout: 60000 }),
      enrichment: new CircuitBreaker('enrichment', { failureThreshold: 3, timeout: 60000 }),
      scoring: new CircuitBreaker('scoring', { failureThreshold: 5, timeout: 30000 }),
      ranking: new CircuitBreaker('ranking', { failureThreshold: 5, timeout: 30000 }),
      outreach: new CircuitBreaker('outreach', { failureThreshold: 3, timeout: 60000 })
    };

    // In-memory pipeline cache
    this.pipelineCache = new Map();
  }

  // ==========================================
  // Pipeline Execution
  // ==========================================

  /**
   * Execute full pipeline with fail-safe
   */
  async executePipeline(config) {
    const pipelineId = config.pipelineId || `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const pipeline = {
      id: pipelineId,
      tenantId: this.tenantId,
      state: PIPELINE_STATES.RUNNING,
      config,
      steps: [],
      results: {},
      errors: [],
      startedAt: new Date(),
      completedAt: null,
      metadata: config.metadata || {}
    };

    // Save pipeline state
    await this.savePipelineState(pipeline);

    try {
      // Define pipeline steps
      const steps = this.buildPipelineSteps(config);

      for (const step of steps) {
        if (pipeline.state === PIPELINE_STATES.CANCELLED) break;

        pipeline.steps.push({
          name: step.name,
          state: STEP_STATES.RUNNING,
          startedAt: new Date(),
          completedAt: null
        });

        await this.savePipelineState(pipeline);

        try {
          const result = await this.executeStep(step, pipeline.results, config);

          pipeline.results[step.name] = result;
          pipeline.steps[pipeline.steps.length - 1].state = STEP_STATES.COMPLETED;
          pipeline.steps[pipeline.steps.length - 1].completedAt = new Date();

        } catch (error) {
          pipeline.steps[pipeline.steps.length - 1].state = STEP_STATES.FAILED;
          pipeline.steps[pipeline.steps.length - 1].error = error.message;

          // Handle step failure
          const recovery = await this.handleStepFailure(step, error, pipeline, config);

          if (recovery.action === 'abort') {
            pipeline.state = PIPELINE_STATES.FAILED;
            pipeline.errors.push({ step: step.name, error: error.message });
            break;
          } else if (recovery.action === 'skip') {
            pipeline.steps[pipeline.steps.length - 1].state = STEP_STATES.SKIPPED;
          } else if (recovery.action === 'fallback') {
            pipeline.results[step.name] = recovery.fallbackResult;
            pipeline.steps[pipeline.steps.length - 1].state = STEP_STATES.COMPLETED;
            pipeline.steps[pipeline.steps.length - 1].usedFallback = true;
          }
        }

        await this.savePipelineState(pipeline);
      }

      if (pipeline.state !== PIPELINE_STATES.FAILED && pipeline.state !== PIPELINE_STATES.CANCELLED) {
        pipeline.state = PIPELINE_STATES.COMPLETED;
      }

    } catch (error) {
      Sentry.captureException(error);
      pipeline.state = PIPELINE_STATES.FAILED;
      pipeline.errors.push({ step: 'pipeline', error: error.message });
    }

    pipeline.completedAt = new Date();
    await this.savePipelineState(pipeline);

    return {
      pipelineId: pipeline.id,
      state: pipeline.state,
      results: pipeline.results,
      steps: pipeline.steps,
      errors: pipeline.errors,
      duration: pipeline.completedAt - pipeline.startedAt
    };
  }

  /**
   * Build pipeline steps based on config
   */
  buildPipelineSteps(config) {
    const steps = [];
    const mode = config.mode || 'full';

    // Discovery step
    if (mode === 'full' || mode === 'discovery' || config.includeDiscovery) {
      steps.push({
        name: 'discovery',
        type: 'discovery',
        required: mode === 'discovery',
        fallbackEnabled: true,
        circuitBreaker: this.circuitBreakers.discovery
      });
    }

    // Enrichment step
    if (mode === 'full' || mode === 'enrich' || config.includeEnrichment) {
      steps.push({
        name: 'enrichment',
        type: 'enrichment',
        required: mode === 'enrich',
        fallbackEnabled: true,
        circuitBreaker: this.circuitBreakers.enrichment
      });
    }

    // Scoring step
    if (mode === 'full' || mode === 'score' || config.includeScoring !== false) {
      steps.push({
        name: 'scoring',
        type: 'scoring',
        required: true,
        fallbackEnabled: true,
        circuitBreaker: this.circuitBreakers.scoring
      });
    }

    // Ranking step
    if (mode === 'full' || mode === 'rank' || config.includeRanking !== false) {
      steps.push({
        name: 'ranking',
        type: 'ranking',
        required: true,
        fallbackEnabled: true,
        circuitBreaker: this.circuitBreakers.ranking
      });
    }

    // Outreach step
    if (mode === 'full' && config.includeOutreach) {
      steps.push({
        name: 'outreach',
        type: 'outreach',
        required: false,
        fallbackEnabled: false,
        circuitBreaker: this.circuitBreakers.outreach
      });
    }

    return steps;
  }

  /**
   * Execute a single pipeline step with circuit breaker and retry
   */
  async executeStep(step, previousResults, config) {
    const executeWithCircuitBreaker = async () => {
      return await step.circuitBreaker.execute(async () => {
        return await this.performStepAction(step.type, previousResults, config);
      });
    };

    return await retryWithBackoff(executeWithCircuitBreaker, {
      maxRetries: config.maxRetries || 3,
      onRetry: (attempt, delay, error) => {
        console.log(`[Orchestration] Retrying ${step.name}, attempt ${attempt}, delay ${delay}ms`);
      }
    });
  }

  /**
   * Perform actual step action
   */
  async performStepAction(type, previousResults, config) {
    switch (type) {
      case 'discovery':
        return this.performDiscovery(config);
      case 'enrichment':
        return this.performEnrichment(previousResults.discovery || config.entities, config);
      case 'scoring':
        return this.performScoring(previousResults.enrichment || previousResults.discovery || config.entities, config);
      case 'ranking':
        return this.performRanking(previousResults.scoring || config.entities, config);
      case 'outreach':
        return this.performOutreach(previousResults.ranking || config.entities, config);
      default:
        throw new Error(`Unknown step type: ${type}`);
    }
  }

  /**
   * Handle step failure
   */
  async handleStepFailure(step, error, pipeline, config) {
    console.error(`[Orchestration] Step ${step.name} failed:`, error.message);

    // If circuit breaker is open, use fallback
    if (error.isCircuitBreaker && step.fallbackEnabled) {
      const fallbackResult = this.getFallbackResult(step.type, pipeline.results, config);
      if (fallbackResult) {
        return { action: 'fallback', fallbackResult };
      }
    }

    // If step is not required, skip it
    if (!step.required) {
      return { action: 'skip' };
    }

    // Add to dead letter queue
    await this.addToDeadLetterQueue({
      pipelineId: pipeline.id,
      step: step.name,
      error: error.message,
      config
    });

    return { action: 'abort' };
  }

  /**
   * Get fallback result for graceful degradation
   */
  getFallbackResult(type, previousResults, config) {
    switch (type) {
      case 'discovery':
        return { signals: [], source: 'fallback', reason: 'service_unavailable' };
      case 'enrichment':
        // Return original entities without enrichment
        return previousResults.discovery || config.entities || [];
      case 'scoring':
        // Return entities with default scores
        const entities = previousResults.enrichment || previousResults.discovery || config.entities || [];
        return entities.map(e => ({
          ...e,
          scores: { q_score: 50, t_score: 50, l_score: 50, e_score: 50 },
          scoring_source: 'fallback'
        }));
      case 'ranking':
        // Return entities with simple sort
        const toRank = previousResults.scoring || config.entities || [];
        return toRank.map((e, i) => ({ ...e, rank: i + 1, tier: 'WARM', ranking_source: 'fallback' }));
      default:
        return null;
    }
  }

  // ==========================================
  // Pipeline Operations
  // ==========================================

  async performDiscovery(config) {
    // Simulate discovery - would call actual discovery service
    return {
      signals: [],
      count: 0,
      sources: config.sources || ['news', 'linkedin']
    };
  }

  async performEnrichment(entities, config) {
    // Simulate enrichment - would call actual enrichment service
    return (entities || []).map(e => ({
      ...e,
      enriched: true,
      enrichment_timestamp: new Date().toISOString()
    }));
  }

  async performScoring(entities, config) {
    // Simulate scoring - would call actual scoring service
    return (entities || []).map(e => ({
      ...e,
      scores: {
        q_score: Math.floor(Math.random() * 40) + 60,
        t_score: Math.floor(Math.random() * 40) + 60,
        l_score: Math.floor(Math.random() * 40) + 60,
        e_score: Math.floor(Math.random() * 40) + 60
      }
    }));
  }

  async performRanking(entities, config) {
    // Simulate ranking - would call actual ranking service
    const sorted = (entities || []).sort((a, b) => {
      const aTotal = (a.scores?.q_score || 0) + (a.scores?.t_score || 0);
      const bTotal = (b.scores?.q_score || 0) + (b.scores?.t_score || 0);
      return bTotal - aTotal;
    });

    return sorted.map((e, i) => ({
      ...e,
      rank: i + 1,
      tier: this.getTier(e.scores)
    }));
  }

  async performOutreach(entities, config) {
    // Simulate outreach generation
    return (entities || []).slice(0, 10).map(e => ({
      entityId: e.id,
      content: `Generated outreach for ${e.name}`,
      channel: config.channel || 'email'
    }));
  }

  getTier(scores) {
    if (!scores) return 'COLD';
    const avg = (scores.q_score + scores.t_score + scores.l_score + scores.e_score) / 4;
    if (avg >= 80) return 'HOT';
    if (avg >= 60) return 'WARM';
    return 'COLD';
  }

  // ==========================================
  // State Persistence
  // ==========================================

  async savePipelineState(pipeline) {
    this.pipelineCache.set(pipeline.id, { ...pipeline });

    try {
      await pool.query(
        `INSERT INTO pipeline_executions (
          id, tenant_id, state, config, results, steps, errors, started_at, completed_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (id) DO UPDATE SET
          state = EXCLUDED.state,
          results = EXCLUDED.results,
          steps = EXCLUDED.steps,
          errors = EXCLUDED.errors,
          completed_at = EXCLUDED.completed_at,
          updated_at = NOW()`,
        [
          pipeline.id,
          this.tenantId,
          pipeline.state,
          JSON.stringify(pipeline.config),
          JSON.stringify(pipeline.results),
          JSON.stringify(pipeline.steps),
          JSON.stringify(pipeline.errors),
          pipeline.startedAt,
          pipeline.completedAt
        ]
      );
    } catch (error) {
      console.error('[Orchestration] Error saving pipeline state:', error);
      // Don't throw - state is in memory cache
    }
  }

  async getPipelineState(pipelineId) {
    // Check cache first
    if (this.pipelineCache.has(pipelineId)) {
      return this.pipelineCache.get(pipelineId);
    }

    try {
      const result = await pool.query(
        `SELECT * FROM pipeline_executions WHERE id = $1 AND tenant_id = $2`,
        [pipelineId, this.tenantId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        state: row.state,
        config: row.config,
        results: row.results,
        steps: row.steps,
        errors: row.errors,
        startedAt: row.started_at,
        completedAt: row.completed_at
      };
    } catch (error) {
      console.error('[Orchestration] Error getting pipeline state:', error);
      return null;
    }
  }

  // ==========================================
  // Dead Letter Queue
  // ==========================================

  async addToDeadLetterQueue(item) {
    try {
      await pool.query(
        `INSERT INTO dead_letter_queue (
          tenant_id, pipeline_id, step_name, error_message, config, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())`,
        [this.tenantId, item.pipelineId, item.step, item.error, JSON.stringify(item.config)]
      );
    } catch (error) {
      console.error('[Orchestration] Error adding to dead letter queue:', error);
    }
  }

  async getDeadLetterQueue(limit = 100) {
    try {
      const result = await pool.query(
        `SELECT * FROM dead_letter_queue
         WHERE tenant_id = $1 AND processed_at IS NULL
         ORDER BY created_at DESC LIMIT $2`,
        [this.tenantId, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('[Orchestration] Error getting dead letter queue:', error);
      return [];
    }
  }

  async reprocessDeadLetterItem(itemId) {
    try {
      const result = await pool.query(
        `SELECT * FROM dead_letter_queue WHERE id = $1 AND tenant_id = $2`,
        [itemId, this.tenantId]
      );

      if (result.rows.length === 0) return { success: false, error: 'Item not found' };

      const item = result.rows[0];

      // Mark as processed
      await pool.query(
        `UPDATE dead_letter_queue SET processed_at = NOW() WHERE id = $1`,
        [itemId]
      );

      // Re-execute the failed step
      const config = item.config;
      config.reprocessed = true;
      config.originalError = item.error_message;

      return await this.executePipeline(config);
    } catch (error) {
      console.error('[Orchestration] Error reprocessing dead letter item:', error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // Circuit Breaker Status
  // ==========================================

  getCircuitBreakerStatus() {
    const status = {};
    for (const [name, breaker] of Object.entries(this.circuitBreakers)) {
      status[name] = breaker.getStatus();
    }
    return status;
  }

  resetCircuitBreaker(name) {
    if (this.circuitBreakers[name]) {
      this.circuitBreakers[name].reset();
      return true;
    }
    return false;
  }

  // ==========================================
  // Health Check
  // ==========================================

  async healthCheck() {
    const circuitBreakerStatus = this.getCircuitBreakerStatus();
    const allClosed = Object.values(circuitBreakerStatus).every(s => s.state === CIRCUIT_STATES.CLOSED);

    let dbHealthy = false;
    try {
      await pool.query('SELECT 1');
      dbHealthy = true;
    } catch (error) {
      dbHealthy = false;
    }

    return {
      healthy: allClosed && dbHealthy,
      circuitBreakers: circuitBreakerStatus,
      database: dbHealthy ? 'healthy' : 'unhealthy'
    };
  }
}

// Export constants and utilities
export {
  CircuitBreaker,
  CircuitBreakerError,
  CIRCUIT_STATES,
  PIPELINE_STATES,
  STEP_STATES,
  retryWithBackoff
};

/**
 * Create orchestration service for tenant
 */
export function createOrchestrationService(tenantId) {
  return new OrchestrationService(tenantId);
}

export default OrchestrationService;
