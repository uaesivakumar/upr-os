/**
 * =====================================================
 * Sprint 69: ML Self-Tuning Service (Config-Driven)
 * =====================================================
 *
 * Creates a learning layer that:
 * 1) Learns from S70 metrics and funnels
 * 2) Proposes tuning actions (config-level only)
 * 3) Applies changes only via S66 checkpoints
 * 4) Never rewrites code or models directly
 *
 * Key principles:
 * - Deterministic: same metrics input → same tuning proposals
 * - Config-only: no direct model retraining
 * - Checkpoint-protected: all applies go through S66
 * - OS-only: no tenant awareness
 *
 * Integration:
 * - S66: Checkpoint protection for apply actions
 * - S70: Uses autonomous_performance_metrics as data source
 */

import * as Sentry from '@sentry/node';
import db from '../db/index.js';
import * as configLoader from './configLoader.js';
import * as autonomousSafety from './autonomousSafety.js';
import * as autonomousMetrics from './autonomousMetrics.js';

// =====================================================
// CONSTANTS
// =====================================================

const TUNING_ACTION_TYPES = {
  ADJUST_WEIGHT: 'adjust_weight',
  ADJUST_THRESHOLD: 'adjust_threshold',
  TOGGLE_SIGNAL: 'toggle_signal',
  ADD_SIGNAL: 'add_signal',
};

const JOURNEY_CHANGE_TYPES = {
  CHANNEL_SWITCH: 'channel_switch',
  DELAY_ADJUST: 'delay_adjust',
  FOLLOWUP_COUNT: 'followup_count',
  TEMPLATE_SWAP: 'template_swap',
};

const STATUS = {
  PROPOSED: 'proposed',
  APPROVED: 'approved',
  APPLIED: 'applied',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
};

// Minimum sample sizes for statistical relevance
const MIN_SAMPLE_SIZE = 10;
const MIN_CONFIDENCE = 0.6;

// =====================================================
// SCORING CONFIG MANAGEMENT
// =====================================================

/**
 * Get scoring config for a model
 * @param {Object} params
 * @param {string} params.modelName - Scoring model name
 * @param {string} [params.verticalSlug] - Optional vertical scope
 * @param {string} [params.territoryId] - Optional territory scope
 * @returns {Promise<Array>} Scoring config entries
 */
export async function getScoringConfig({ modelName, verticalSlug, territoryId }) {
  const result = await db.query(
    `SELECT * FROM get_scoring_config($1, $2, $3)`,
    [modelName, verticalSlug || null, territoryId || null]
  );
  return result.rows;
}

/**
 * List all scoring configs
 * @param {Object} [params]
 * @param {string} [params.modelName] - Filter by model
 * @param {string} [params.verticalSlug] - Filter by vertical
 * @param {boolean} [params.enabledOnly] - Only return enabled configs
 * @returns {Promise<Array>} Scoring configs
 */
export async function listScoringConfigs({ modelName, verticalSlug, enabledOnly = true } = {}) {
  let query = `
    SELECT id, model_name, signal_key, weight, threshold, enabled,
           vertical_slug, territory_id, version, description, updated_at
    FROM scoring_config
    WHERE 1=1
  `;
  const params = [];
  let paramIdx = 1;

  if (modelName) {
    query += ` AND model_name = $${paramIdx++}`;
    params.push(modelName);
  }
  if (verticalSlug) {
    query += ` AND (vertical_slug = $${paramIdx++} OR vertical_slug IS NULL)`;
    params.push(verticalSlug);
  }
  if (enabledOnly) {
    query += ` AND enabled = true`;
  }

  query += ` ORDER BY model_name, weight DESC`;

  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Update a scoring config value
 * Creates a new version rather than mutating
 * @param {Object} params
 * @param {string} params.configId - Config ID to update
 * @param {Object} params.changes - Changes to apply
 * @param {string} params.updatedBy - Who made the change
 * @returns {Promise<Object>} New config version
 */
export async function updateScoringConfig({ configId, changes, updatedBy }) {
  // Get current config
  const current = await db.query(
    `SELECT * FROM scoring_config WHERE id = $1`,
    [configId]
  );

  if (current.rows.length === 0) {
    throw new Error(`Scoring config not found: ${configId}`);
  }

  const existing = current.rows[0];

  // Create new version with changes
  const result = await db.query(`
    INSERT INTO scoring_config (
      model_name, signal_key, weight, threshold, enabled,
      vertical_slug, territory_id, version, description, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    existing.model_name,
    existing.signal_key,
    changes.weight ?? existing.weight,
    changes.threshold ?? existing.threshold,
    changes.enabled ?? existing.enabled,
    existing.vertical_slug,
    existing.territory_id,
    existing.version + 1,
    changes.description ?? existing.description,
    updatedBy,
  ]);

  return result.rows[0];
}

// =====================================================
// PERFORMANCE ANALYSIS
// =====================================================

/**
 * Analyze performance metrics to identify tuning opportunities
 * @param {Object} params
 * @param {string} params.verticalSlug - Vertical to analyze
 * @param {string} [params.territoryId] - Optional territory scope
 * @param {number} [params.timeWindowDays] - Analysis window (default 30)
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzePerformance({ verticalSlug, territoryId, timeWindowDays = 30 }) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - timeWindowDays);

  // Get conversion funnel data from S70
  const funnelQuery = `
    SELECT
      service,
      operation,
      COUNT(*) FILTER (WHERE event_type = 'completed') AS completed,
      COUNT(*) FILTER (WHERE event_type = 'failed') AS failed,
      COUNT(*) FILTER (WHERE opened = true) AS opened,
      COUNT(*) FILTER (WHERE clicked = true) AS clicked,
      COUNT(*) FILTER (WHERE replied = true) AS replied,
      COUNT(*) FILTER (WHERE converted = true) AS converted,
      AVG(duration_ms) AS avg_duration_ms,
      COUNT(*) AS total
    FROM autonomous_performance_metrics
    WHERE created_at >= $1
    AND ($2::VARCHAR IS NULL OR vertical_slug = $2)
    AND ($3::UUID IS NULL OR territory_id = $3)
    GROUP BY service, operation
  `;

  const funnelResult = await db.query(funnelQuery, [
    startDate.toISOString(),
    verticalSlug || null,
    territoryId || null,
  ]);

  // Calculate overall metrics
  const metrics = {
    totalOperations: 0,
    successRate: 0,
    conversionRate: 0,
    avgOpenRate: 0,
    avgReplyRate: 0,
    byService: {},
  };

  let totalCompleted = 0;
  let totalFailed = 0;
  let totalOpened = 0;
  let totalClicked = 0;
  let totalReplied = 0;
  let totalConverted = 0;

  for (const row of funnelResult.rows) {
    metrics.totalOperations += parseInt(row.total, 10);
    totalCompleted += parseInt(row.completed || 0, 10);
    totalFailed += parseInt(row.failed || 0, 10);
    totalOpened += parseInt(row.opened || 0, 10);
    totalClicked += parseInt(row.clicked || 0, 10);
    totalReplied += parseInt(row.replied || 0, 10);
    totalConverted += parseInt(row.converted || 0, 10);

    metrics.byService[row.service] = metrics.byService[row.service] || {};
    metrics.byService[row.service][row.operation] = {
      completed: parseInt(row.completed || 0, 10),
      failed: parseInt(row.failed || 0, 10),
      successRate: row.total > 0 ? parseInt(row.completed || 0, 10) / parseInt(row.total, 10) : 0,
      avgDurationMs: parseFloat(row.avg_duration_ms || 0),
    };
  }

  const totalAttempts = totalCompleted + totalFailed;
  metrics.successRate = totalAttempts > 0 ? totalCompleted / totalAttempts : 0;
  metrics.conversionRate = metrics.totalOperations > 0 ? totalConverted / metrics.totalOperations : 0;
  metrics.avgOpenRate = metrics.totalOperations > 0 ? totalOpened / metrics.totalOperations : 0;
  metrics.avgReplyRate = totalOpened > 0 ? totalReplied / totalOpened : 0;

  return {
    verticalSlug,
    territoryId,
    timeWindowDays,
    analyzedAt: new Date().toISOString(),
    metrics,
    sampleSize: metrics.totalOperations,
  };
}

// =====================================================
// SCORING TUNING ACTIONS
// =====================================================

/**
 * Generate scoring tuning action proposals
 * Deterministic: same input → same output
 * @param {Object} params
 * @param {string} params.verticalSlug - Vertical to analyze
 * @param {string} [params.territoryId] - Optional territory scope
 * @param {string} [params.modelName] - Specific model to tune
 * @returns {Promise<Array>} Proposed tuning actions
 */
export async function generateScoringTuningActions({ verticalSlug, territoryId, modelName }) {
  const actions = [];

  // Get performance analysis
  const analysis = await analyzePerformance({ verticalSlug, territoryId });

  if (analysis.sampleSize < MIN_SAMPLE_SIZE) {
    return []; // Not enough data for meaningful suggestions
  }

  // Get current scoring config
  const configs = await listScoringConfigs({
    modelName,
    verticalSlug,
    enabledOnly: true,
  });

  // Get win/loss patterns
  const patternsResult = await db.query(`
    SELECT signal_key, win_rate, loss_rate, confidence, sample_size
    FROM win_loss_patterns
    WHERE vertical_slug = $1
    AND ($2::UUID IS NULL OR territory_id = $2)
    AND sample_size >= $3
    ORDER BY confidence DESC
  `, [verticalSlug, territoryId || null, MIN_SAMPLE_SIZE]);

  const patterns = patternsResult.rows;

  // Analyze each signal for potential tuning
  for (const config of configs) {
    const pattern = patterns.find(p => p.signal_key === config.signal_key);

    if (!pattern) continue;

    // Check if signal weight should be adjusted based on win/loss correlation
    const winLossDiff = parseFloat(pattern.win_rate) - parseFloat(pattern.loss_rate);

    // If strong positive correlation (winners have higher signal), increase weight
    if (winLossDiff > 0.15 && parseFloat(pattern.confidence) >= MIN_CONFIDENCE) {
      const newWeight = Math.min(1.0, parseFloat(config.weight) * 1.1);

      if (Math.abs(newWeight - parseFloat(config.weight)) > 0.01) {
        actions.push({
          actionType: TUNING_ACTION_TYPES.ADJUST_WEIGHT,
          targetModel: config.model_name,
          targetSignal: config.signal_key,
          oldValue: { weight: parseFloat(config.weight) },
          newValue: { weight: parseFloat(newWeight.toFixed(4)) },
          verticalSlug,
          territoryId,
          confidence: parseFloat(pattern.confidence),
          evidence: {
            winRate: parseFloat(pattern.win_rate),
            lossRate: parseFloat(pattern.loss_rate),
            sampleSize: parseInt(pattern.sample_size, 10),
            reason: 'Strong positive correlation with wins',
          },
          expectedImpact: {
            conversionImprovement: winLossDiff * 0.1, // Conservative estimate
          },
        });
      }
    }

    // If strong negative correlation, decrease weight
    if (winLossDiff < -0.15 && parseFloat(pattern.confidence) >= MIN_CONFIDENCE) {
      const newWeight = Math.max(0.05, parseFloat(config.weight) * 0.9);

      if (Math.abs(newWeight - parseFloat(config.weight)) > 0.01) {
        actions.push({
          actionType: TUNING_ACTION_TYPES.ADJUST_WEIGHT,
          targetModel: config.model_name,
          targetSignal: config.signal_key,
          oldValue: { weight: parseFloat(config.weight) },
          newValue: { weight: parseFloat(newWeight.toFixed(4)) },
          verticalSlug,
          territoryId,
          confidence: parseFloat(pattern.confidence),
          evidence: {
            winRate: parseFloat(pattern.win_rate),
            lossRate: parseFloat(pattern.loss_rate),
            sampleSize: parseInt(pattern.sample_size, 10),
            reason: 'Strong negative correlation with wins',
          },
          expectedImpact: {
            conversionImprovement: Math.abs(winLossDiff) * 0.05,
          },
        });
      }
    }
  }

  // Store proposed actions
  for (const action of actions) {
    await db.query(`
      INSERT INTO scoring_tuning_actions (
        action_type, target_model, target_signal,
        old_value, new_value, vertical_slug, territory_id,
        confidence, evidence, expected_impact, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      action.actionType,
      action.targetModel,
      action.targetSignal,
      JSON.stringify(action.oldValue),
      JSON.stringify(action.newValue),
      action.verticalSlug,
      action.territoryId || null,
      action.confidence,
      JSON.stringify(action.evidence),
      JSON.stringify(action.expectedImpact),
      STATUS.PROPOSED,
    ]);
  }

  return actions;
}

/**
 * List tuning actions with filtering
 * @param {Object} [params]
 * @param {string} [params.status] - Filter by status
 * @param {string} [params.verticalSlug] - Filter by vertical
 * @param {string} [params.modelName] - Filter by model
 * @param {number} [params.limit] - Max results
 * @returns {Promise<Array>} Tuning actions
 */
export async function listTuningActions({ status, verticalSlug, modelName, limit = 50 } = {}) {
  let query = `
    SELECT id, action_type, target_model, target_signal,
           old_value, new_value, vertical_slug, territory_id,
           confidence, evidence, expected_impact, status,
           checkpoint_id, proposed_at, reviewed_at, reviewed_by, applied_at
    FROM scoring_tuning_actions
    WHERE 1=1
  `;
  const params = [];
  let paramIdx = 1;

  if (status) {
    query += ` AND status = $${paramIdx++}`;
    params.push(status);
  }
  if (verticalSlug) {
    query += ` AND vertical_slug = $${paramIdx++}`;
    params.push(verticalSlug);
  }
  if (modelName) {
    query += ` AND target_model = $${paramIdx++}`;
    params.push(modelName);
  }

  query += ` ORDER BY proposed_at DESC LIMIT $${paramIdx}`;
  params.push(limit);

  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Apply a tuning action (checkpoint-protected)
 * @param {Object} params
 * @param {string} params.actionId - Action ID to apply
 * @param {string} params.approvedBy - Who approved the action
 * @param {string} params.verticalSlug - Vertical context
 * @param {string} [params.territoryId] - Territory context
 * @returns {Promise<Object>} Applied action result
 */
export async function applyTuningAction({ actionId, approvedBy, verticalSlug, territoryId }) {
  // Get the action
  const actionResult = await db.query(
    `SELECT * FROM scoring_tuning_actions WHERE id = $1`,
    [actionId]
  );

  if (actionResult.rows.length === 0) {
    throw new Error(`Tuning action not found: ${actionId}`);
  }

  const action = actionResult.rows[0];

  if (action.status !== STATUS.PROPOSED && action.status !== STATUS.APPROVED) {
    throw new Error(`Cannot apply action in status: ${action.status}`);
  }

  // Create S66 checkpoint for human approval
  const checkpoint = await autonomousSafety.createCheckpoint({
    definitionSlug: 'apply_tuning_action',
    verticalSlug,
    territoryId,
    targetId: actionId,
    metadata: {
      actionType: action.action_type,
      targetModel: action.target_model,
      targetSignal: action.target_signal,
      oldValue: action.old_value,
      newValue: action.new_value,
      confidence: action.confidence,
    },
  });

  // Update action with checkpoint reference
  await db.query(`
    UPDATE scoring_tuning_actions
    SET checkpoint_id = $1, status = $2
    WHERE id = $3
  `, [checkpoint.id, STATUS.APPROVED, actionId]);

  // Log to S66 activity log
  await autonomousSafety.recordActivity({
    actorType: 'system',
    actorId: 'self-tuning',
    action: 'propose_tuning',
    targetType: 'scoring_config',
    targetId: action.target_model + '.' + action.target_signal,
    verticalSlug,
    territoryId,
    metadata: {
      actionId,
      checkpointId: checkpoint.id,
      oldValue: action.old_value,
      newValue: action.new_value,
    },
  });

  // Record to S70 metrics
  try {
    await autonomousMetrics.recordPerformanceEvent({
      service: 'self-tuning',
      operation: 'apply_tuning',
      eventType: 'started',
      verticalSlug,
      territoryId,
      metadata: { actionId, actionType: action.action_type },
    });
  } catch (e) {
    Sentry.captureException(e);
  }

  return {
    actionId,
    checkpointId: checkpoint.id,
    status: STATUS.APPROVED,
    message: 'Tuning action approved and awaiting checkpoint completion',
  };
}

/**
 * Complete a tuning action after checkpoint approval
 * @param {Object} params
 * @param {string} params.actionId - Action ID
 * @param {string} params.completedBy - Who completed the checkpoint
 * @returns {Promise<Object>} Completion result
 */
export async function completeTuningAction({ actionId, completedBy }) {
  const actionResult = await db.query(
    `SELECT * FROM scoring_tuning_actions WHERE id = $1`,
    [actionId]
  );

  if (actionResult.rows.length === 0) {
    throw new Error(`Tuning action not found: ${actionId}`);
  }

  const action = actionResult.rows[0];

  if (action.status !== STATUS.APPROVED) {
    throw new Error(`Cannot complete action in status: ${action.status}`);
  }

  // Find the config to update
  const configResult = await db.query(`
    SELECT * FROM scoring_config
    WHERE model_name = $1 AND signal_key = $2
    AND (vertical_slug = $3 OR (vertical_slug IS NULL AND $3 IS NULL))
    AND (territory_id = $4 OR (territory_id IS NULL AND $4 IS NULL))
    ORDER BY version DESC LIMIT 1
  `, [
    action.target_model,
    action.target_signal,
    action.vertical_slug,
    action.territory_id,
  ]);

  if (configResult.rows.length === 0) {
    throw new Error(`Scoring config not found for: ${action.target_model}.${action.target_signal}`);
  }

  const config = configResult.rows[0];
  const newValue = action.new_value;

  // Apply the change by creating new config version
  await updateScoringConfig({
    configId: config.id,
    changes: newValue,
    updatedBy: completedBy,
  });

  // Update action status
  await db.query(`
    UPDATE scoring_tuning_actions
    SET status = $1, applied_at = NOW(), reviewed_by = $2
    WHERE id = $3
  `, [STATUS.APPLIED, completedBy, actionId]);

  // Record completion to S70 metrics
  try {
    await autonomousMetrics.recordPerformanceEvent({
      service: 'self-tuning',
      operation: 'apply_tuning',
      eventType: 'completed',
      verticalSlug: action.vertical_slug,
      territoryId: action.territory_id,
      metadata: { actionId, applied: true },
    });
  } catch (e) {
    Sentry.captureException(e);
  }

  return {
    actionId,
    status: STATUS.APPLIED,
    appliedAt: new Date().toISOString(),
  };
}

/**
 * Reject a tuning action
 * @param {Object} params
 * @param {string} params.actionId - Action ID
 * @param {string} params.rejectedBy - Who rejected
 * @param {string} params.reason - Rejection reason
 * @returns {Promise<Object>} Rejection result
 */
export async function rejectTuningAction({ actionId, rejectedBy, reason }) {
  const result = await db.query(`
    UPDATE scoring_tuning_actions
    SET status = $1, reviewed_at = NOW(), reviewed_by = $2, rejection_reason = $3
    WHERE id = $4 AND status IN ($5, $6)
    RETURNING *
  `, [STATUS.REJECTED, rejectedBy, reason, actionId, STATUS.PROPOSED, STATUS.APPROVED]);

  if (result.rows.length === 0) {
    throw new Error(`Tuning action not found or cannot be rejected: ${actionId}`);
  }

  return result.rows[0];
}

// =====================================================
// WIN/LOSS PATTERN DETECTION
// =====================================================

/**
 * Generate win/loss patterns from performance data
 * @param {Object} params
 * @param {string} params.verticalSlug - Vertical to analyze
 * @param {string} [params.territoryId] - Territory scope
 * @param {number} [params.timeWindowDays] - Analysis window
 * @returns {Promise<Array>} Generated patterns
 */
export async function generateWinLossPatterns({ verticalSlug, territoryId, timeWindowDays = 30 }) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - timeWindowDays);

  // Query performance metrics grouped by various dimensions
  const query = `
    WITH metrics AS (
      SELECT
        COALESCE(metadata->>'segment', 'default') AS segment_key,
        COALESCE(metadata->>'signal', 'overall') AS signal_key,
        COALESCE(metadata->>'persona', 'default') AS persona_key,
        converted,
        CASE WHEN converted = true THEN 1 ELSE 0 END AS won,
        CASE WHEN converted = false AND event_type = 'completed' THEN 1 ELSE 0 END AS lost
      FROM autonomous_performance_metrics
      WHERE created_at >= $1
      AND ($2::VARCHAR IS NULL OR vertical_slug = $2)
      AND ($3::UUID IS NULL OR territory_id = $3)
      AND event_type IN ('completed', 'failed')
    )
    SELECT
      segment_key,
      signal_key,
      persona_key,
      SUM(won)::DECIMAL / NULLIF(COUNT(*), 0) AS win_rate,
      SUM(lost)::DECIMAL / NULLIF(COUNT(*), 0) AS loss_rate,
      COUNT(*) AS sample_size
    FROM metrics
    GROUP BY segment_key, signal_key, persona_key
    HAVING COUNT(*) >= $4
  `;

  const result = await db.query(query, [
    startDate.toISOString(),
    verticalSlug || null,
    territoryId || null,
    MIN_SAMPLE_SIZE,
  ]);

  const patterns = [];

  for (const row of result.rows) {
    // Calculate confidence based on sample size
    // Using simplified confidence: min(1.0, sqrt(sample_size / 100))
    const confidence = Math.min(1.0, Math.sqrt(parseInt(row.sample_size, 10) / 100));

    if (confidence < MIN_CONFIDENCE) continue;

    // Upsert pattern
    const upsertResult = await db.query(`
      INSERT INTO win_loss_patterns (
        segment_key, signal_key, persona_key,
        vertical_slug, territory_id,
        win_rate, loss_rate, sample_size, confidence,
        time_window_days, last_computed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (segment_key, signal_key, persona_key, vertical_slug, territory_id)
      DO UPDATE SET
        win_rate = EXCLUDED.win_rate,
        loss_rate = EXCLUDED.loss_rate,
        sample_size = EXCLUDED.sample_size,
        confidence = EXCLUDED.confidence,
        time_window_days = EXCLUDED.time_window_days,
        last_computed_at = NOW()
      RETURNING *
    `, [
      row.segment_key,
      row.signal_key,
      row.persona_key,
      verticalSlug,
      territoryId || null,
      parseFloat(row.win_rate || 0),
      parseFloat(row.loss_rate || 0),
      parseInt(row.sample_size, 10),
      confidence,
      timeWindowDays,
    ]);

    patterns.push(upsertResult.rows[0]);
  }

  return patterns;
}

/**
 * Get win/loss patterns
 * @param {Object} [params]
 * @param {string} [params.verticalSlug] - Filter by vertical
 * @param {string} [params.segmentKey] - Filter by segment
 * @param {number} [params.minConfidence] - Minimum confidence threshold
 * @returns {Promise<Array>} Patterns
 */
export async function getWinLossPatterns({ verticalSlug, segmentKey, minConfidence = MIN_CONFIDENCE } = {}) {
  let query = `
    SELECT *
    FROM win_loss_patterns
    WHERE confidence >= $1
  `;
  const params = [minConfidence];
  let paramIdx = 2;

  if (verticalSlug) {
    query += ` AND vertical_slug = $${paramIdx++}`;
    params.push(verticalSlug);
  }
  if (segmentKey) {
    query += ` AND segment_key = $${paramIdx++}`;
    params.push(segmentKey);
  }

  query += ` ORDER BY confidence DESC, sample_size DESC`;

  const result = await db.query(query, params);
  return result.rows;
}

// =====================================================
// JOURNEY OPTIMIZATION SUGGESTIONS
// =====================================================

/**
 * Generate journey optimization suggestions
 * @param {Object} params
 * @param {string} params.verticalSlug - Vertical to analyze
 * @param {string} [params.territoryId] - Territory scope
 * @param {string} [params.journeyId] - Specific journey to analyze
 * @returns {Promise<Array>} Journey suggestions
 */
export async function generateJourneySuggestions({ verticalSlug, territoryId, journeyId }) {
  const suggestions = [];

  // Get journey performance from S70 metrics
  const query = `
    SELECT
      COALESCE(metadata->>'journey_id', 'unknown') AS journey_id,
      COALESCE(metadata->>'step_id', 'overall') AS step_id,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE event_type = 'completed') AS completed,
      COUNT(*) FILTER (WHERE event_type = 'failed') AS failed,
      AVG(duration_ms) AS avg_duration_ms,
      COUNT(*) FILTER (WHERE converted = true) AS converted
    FROM autonomous_performance_metrics
    WHERE service = 'journey-engine'
    AND ($1::VARCHAR IS NULL OR vertical_slug = $1)
    AND ($2::UUID IS NULL OR territory_id = $2)
    AND ($3::VARCHAR IS NULL OR metadata->>'journey_id' = $3)
    AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY journey_id, step_id
    HAVING COUNT(*) >= $4
  `;

  const result = await db.query(query, [
    verticalSlug || null,
    territoryId || null,
    journeyId || null,
    MIN_SAMPLE_SIZE,
  ]);

  for (const row of result.rows) {
    const successRate = parseInt(row.total, 10) > 0
      ? parseInt(row.completed, 10) / parseInt(row.total, 10)
      : 0;
    const conversionRate = parseInt(row.total, 10) > 0
      ? parseInt(row.converted, 10) / parseInt(row.total, 10)
      : 0;

    // Low success rate - suggest changes
    if (successRate < 0.7 && parseInt(row.total, 10) >= MIN_SAMPLE_SIZE) {
      const confidence = Math.min(1.0, Math.sqrt(parseInt(row.total, 10) / 100));

      // Suggest delay adjustment if high failure rate
      if (parseInt(row.failed, 10) > parseInt(row.completed, 10) * 0.5) {
        suggestions.push({
          journeyId: row.journey_id,
          stepId: row.step_id,
          verticalSlug,
          territoryId,
          currentConfig: { successRate, avgDurationMs: parseFloat(row.avg_duration_ms || 0) },
          suggestedChange: { delayIncrease: 1.5 }, // 50% longer delay
          changeType: JOURNEY_CHANGE_TYPES.DELAY_ADJUST,
          impactEstimate: { successRateImprovement: 0.1 },
          confidence,
          evidence: {
            currentSuccessRate: successRate,
            failureCount: parseInt(row.failed, 10),
            sampleSize: parseInt(row.total, 10),
          },
        });
      }

      // Low conversion rate - suggest template swap
      if (conversionRate < 0.05 && successRate > 0.5) {
        suggestions.push({
          journeyId: row.journey_id,
          stepId: row.step_id,
          verticalSlug,
          territoryId,
          currentConfig: { conversionRate, successRate },
          suggestedChange: { templateSwap: true },
          changeType: JOURNEY_CHANGE_TYPES.TEMPLATE_SWAP,
          impactEstimate: { conversionImprovement: 0.02 },
          confidence: confidence * 0.8, // Lower confidence for template changes
          evidence: {
            currentConversionRate: conversionRate,
            sampleSize: parseInt(row.total, 10),
          },
        });
      }
    }
  }

  // Store suggestions
  for (const suggestion of suggestions) {
    await db.query(`
      INSERT INTO journey_tuning_suggestions (
        journey_id, step_id, vertical_slug, territory_id,
        current_config, suggested_change, change_type,
        impact_estimate, confidence, evidence, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      suggestion.journeyId,
      suggestion.stepId,
      suggestion.verticalSlug,
      suggestion.territoryId || null,
      JSON.stringify(suggestion.currentConfig),
      JSON.stringify(suggestion.suggestedChange),
      suggestion.changeType,
      JSON.stringify(suggestion.impactEstimate),
      suggestion.confidence,
      JSON.stringify(suggestion.evidence),
      STATUS.PROPOSED,
    ]);
  }

  return suggestions;
}

/**
 * Get journey tuning suggestions
 * @param {Object} [params]
 * @param {string} [params.verticalSlug] - Filter by vertical
 * @param {string} [params.journeyId] - Filter by journey
 * @param {string} [params.status] - Filter by status
 * @returns {Promise<Array>} Suggestions
 */
export async function getJourneySuggestions({ verticalSlug, journeyId, status } = {}) {
  let query = `
    SELECT *
    FROM journey_tuning_suggestions
    WHERE 1=1
  `;
  const params = [];
  let paramIdx = 1;

  if (verticalSlug) {
    query += ` AND vertical_slug = $${paramIdx++}`;
    params.push(verticalSlug);
  }
  if (journeyId) {
    query += ` AND journey_id = $${paramIdx++}`;
    params.push(journeyId);
  }
  if (status) {
    query += ` AND status = $${paramIdx++}`;
    params.push(status);
  }

  query += ` ORDER BY confidence DESC, proposed_at DESC`;

  const result = await db.query(query, params);
  return result.rows;
}

// =====================================================
// PERSONA EFFECTIVENESS ANALYTICS
// =====================================================

/**
 * Compute persona performance statistics
 * @param {Object} params
 * @param {string} params.verticalSlug - Vertical to analyze
 * @param {string} [params.territoryId] - Territory scope
 * @param {number} [params.timeWindowDays] - Analysis window
 * @returns {Promise<Array>} Persona stats
 */
export async function computePersonaStats({ verticalSlug, territoryId, timeWindowDays = 30 }) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - timeWindowDays);

  // Aggregate persona performance from S70 metrics
  const query = `
    SELECT
      COALESCE(metadata->>'persona', 'default') AS persona_key,
      COUNT(*) AS sample_size,
      COUNT(*) FILTER (WHERE converted = true)::DECIMAL / NULLIF(COUNT(*), 0) AS win_rate,
      COUNT(*) FILTER (WHERE replied = true)::DECIMAL / NULLIF(COUNT(*), 0) AS reply_rate,
      COUNT(*) FILTER (WHERE opened = true)::DECIMAL / NULLIF(COUNT(*), 0) AS open_rate,
      COUNT(*) FILTER (WHERE clicked = true)::DECIMAL / NULLIF(COUNT(*) FILTER (WHERE opened = true), 0) AS click_rate,
      AVG(CASE WHEN replied = true THEN duration_ms END) / 3600000.0 AS avg_time_to_reply_hours
    FROM autonomous_performance_metrics
    WHERE service = 'auto-outreach'
    AND created_at >= $1
    AND ($2::VARCHAR IS NULL OR vertical_slug = $2)
    AND ($3::UUID IS NULL OR territory_id = $3)
    GROUP BY persona_key
    HAVING COUNT(*) >= $4
  `;

  const result = await db.query(query, [
    startDate.toISOString(),
    verticalSlug || null,
    territoryId || null,
    MIN_SAMPLE_SIZE,
  ]);

  const stats = [];

  for (const row of result.rows) {
    // Upsert persona stats
    const upsertResult = await db.query(`
      INSERT INTO persona_performance_stats (
        persona_key, vertical_slug, territory_id,
        win_rate, reply_rate, open_rate, click_rate,
        avg_time_to_reply_hours, sample_size,
        time_window_days, last_computed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (persona_key, vertical_slug, territory_id)
      DO UPDATE SET
        win_rate = EXCLUDED.win_rate,
        reply_rate = EXCLUDED.reply_rate,
        open_rate = EXCLUDED.open_rate,
        click_rate = EXCLUDED.click_rate,
        avg_time_to_reply_hours = EXCLUDED.avg_time_to_reply_hours,
        sample_size = EXCLUDED.sample_size,
        time_window_days = EXCLUDED.time_window_days,
        last_computed_at = NOW()
      RETURNING *
    `, [
      row.persona_key,
      verticalSlug,
      territoryId || null,
      parseFloat(row.win_rate || 0),
      parseFloat(row.reply_rate || 0),
      parseFloat(row.open_rate || 0),
      parseFloat(row.click_rate || 0),
      parseFloat(row.avg_time_to_reply_hours || 0),
      parseInt(row.sample_size, 10),
      timeWindowDays,
    ]);

    stats.push(upsertResult.rows[0]);
  }

  // Compute ranks
  await db.query(`SELECT compute_persona_ranks($1, $2)`, [verticalSlug, territoryId || null]);

  // Return updated stats with ranks
  const rankedResult = await db.query(`
    SELECT *
    FROM persona_performance_stats
    WHERE vertical_slug = $1
    AND ($2::UUID IS NULL OR territory_id = $2)
    ORDER BY rank_position ASC
  `, [verticalSlug, territoryId || null]);

  return rankedResult.rows;
}

/**
 * Get persona statistics
 * @param {Object} [params]
 * @param {string} [params.verticalSlug] - Filter by vertical
 * @param {string} [params.personaKey] - Filter by persona
 * @param {number} [params.topN] - Return top N personas
 * @returns {Promise<Array>} Persona stats
 */
export async function getPersonaStats({ verticalSlug, personaKey, topN } = {}) {
  let query = `
    SELECT *
    FROM persona_performance_stats
    WHERE sample_size >= $1
  `;
  const params = [MIN_SAMPLE_SIZE];
  let paramIdx = 2;

  if (verticalSlug) {
    query += ` AND vertical_slug = $${paramIdx++}`;
    params.push(verticalSlug);
  }
  if (personaKey) {
    query += ` AND persona_key = $${paramIdx++}`;
    params.push(personaKey);
  }

  query += ` ORDER BY rank_position ASC NULLS LAST`;

  if (topN) {
    query += ` LIMIT $${paramIdx}`;
    params.push(topN);
  }

  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Get top personas for a vertical
 * @param {Object} params
 * @param {string} params.verticalSlug - Vertical
 * @param {string} [params.territoryId] - Territory scope
 * @param {number} [params.limit] - Max results
 * @returns {Promise<Array>} Top personas
 */
export async function getTopPersonas({ verticalSlug, territoryId, limit = 5 }) {
  const result = await db.query(`
    SELECT *
    FROM v_top_personas
    WHERE vertical_slug = $1
    AND ($2::UUID IS NULL OR territory_id = $2)
    ORDER BY rank_position ASC
    LIMIT $3
  `, [verticalSlug, territoryId || null, limit]);

  return result.rows;
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Expire old proposed actions
 * @param {number} [maxAgeDays] - Max age before expiry
 * @returns {Promise<number>} Number of expired actions
 */
export async function expireOldActions(maxAgeDays = 7) {
  const result = await db.query(
    `SELECT expire_old_tuning_actions($1)`,
    [maxAgeDays]
  );
  return result.rows[0].expire_old_tuning_actions;
}

/**
 * Get tuning summary statistics
 * @param {string} [verticalSlug] - Filter by vertical
 * @returns {Promise<Array>} Summary stats
 */
export async function getTuningSummary(verticalSlug) {
  const result = await db.query(
    `SELECT * FROM get_tuning_summary($1)`,
    [verticalSlug || null]
  );
  return result.rows;
}

/**
 * Get self-tuning health status
 * @returns {Promise<Object>} Health status
 */
export async function getHealth() {
  const [pendingActions, patterns, suggestions, personas] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM scoring_tuning_actions WHERE status = 'proposed'`),
    db.query(`SELECT COUNT(*) FROM win_loss_patterns WHERE last_computed_at > NOW() - INTERVAL '24 hours'`),
    db.query(`SELECT COUNT(*) FROM journey_tuning_suggestions WHERE status = 'proposed'`),
    db.query(`SELECT COUNT(*) FROM persona_performance_stats WHERE last_computed_at > NOW() - INTERVAL '24 hours'`),
  ]);

  return {
    healthy: true,
    pendingTuningActions: parseInt(pendingActions.rows[0].count, 10),
    recentPatterns: parseInt(patterns.rows[0].count, 10),
    pendingJourneySuggestions: parseInt(suggestions.rows[0].count, 10),
    recentPersonaStats: parseInt(personas.rows[0].count, 10),
    timestamp: new Date().toISOString(),
  };
}

// =====================================================
// EXPORTS SUMMARY
// =====================================================
// Scoring Config: getScoringConfig, listScoringConfigs, updateScoringConfig
// Analysis: analyzePerformance
// Tuning Actions: generateScoringTuningActions, listTuningActions, applyTuningAction, completeTuningAction, rejectTuningAction
// Win/Loss Patterns: generateWinLossPatterns, getWinLossPatterns
// Journey Suggestions: generateJourneySuggestions, getJourneySuggestions
// Persona Stats: computePersonaStats, getPersonaStats, getTopPersonas
// Utilities: expireOldActions, getTuningSummary, getHealth
