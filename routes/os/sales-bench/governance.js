/**
 * Sales-Bench Governance Command API
 * Super Admin Trigger Endpoints
 *
 * Authority: OS executes
 * Visibility: Super Admin triggers
 *
 * Command-style endpoints for governance actions:
 * - /commands/run-system-validation  - Trigger system validation run
 * - /commands/start-human-calibration - Start human calibration session
 * - /commands/approve-for-ga - Approve suite for GA (after human validation)
 * - /commands/deprecate-suite - Deprecate a suite
 * - /commands/archive-run - Archive run artifacts
 */

import express from 'express';
import { randomBytes, createHash, createHmac, randomUUID } from 'crypto';
import pool from '../../../server/db.js';

// Phase 1.5: Use production SIVA scorer instead of deterministic siva-scorer.js
// CRITICAL: This is the SAME path production uses (PRD v1.2 compliance)
import {
  getPersonaForSuite,
  scoreWithProductionSIVA,
  scoreBatchWithProductionSIVA,
} from '../../../os/siva/productionScorer.js';

// Keep legacy scorer as fallback (for comparison runs only)
import { scoreScenario, scoreBatch } from '../../../os/sales-bench/engine/siva-scorer.js';

// ============================================================================
// TRACE HELPERS (Phase 1: Trust Layer)
// ============================================================================

/**
 * Compute SHA256 hash of an object (for envelope provenance)
 */
function computeHash(data) {
  const json = JSON.stringify(data, Object.keys(data).sort());
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Compute HMAC signature for tamper detection
 * signature = HMAC-SHA256(interaction_id + envelope_sha256 + outcome)
 */
function computeSignature(interactionId, envelopeHash, outcome) {
  const secret = process.env.TRACE_SIGNING_SECRET || 'sales-bench-trace-secret-v1';
  const data = `${interactionId}:${envelopeHash}:${outcome}`;
  return createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Build envelope object for hashing
 * This captures the complete request context
 */
function buildEnvelope(scenario, suiteKey, runNumber) {
  return {
    suite_key: suiteKey,
    run_number: runNumber,
    scenario_id: scenario.id,
    scenario_hash: scenario.hash,
    path_type: scenario.path_type,
    expected_outcome: scenario.expected_outcome,
    company_profile_hash: computeHash(scenario.company_profile || {}),
    contact_profile_hash: computeHash(scenario.contact_profile || {}),
    signal_context_hash: computeHash(scenario.signal_context || {}),
    persona_context_hash: computeHash(scenario.persona_context || {}),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build trace metadata for a scored scenario result
 */
function buildTraceData(scenario, result, envelope, suiteContext) {
  const interactionId = randomUUID();
  const envelopeHash = computeHash(envelope);

  // Determine policy gates hit based on decision logic
  const policyGatesHit = [];

  // Check compliance gate
  if (result.dimension_scores?.compliance < 3) {
    policyGatesHit.push({
      gate_name: 'compliance_threshold',
      triggered: true,
      reason: `Compliance score ${result.dimension_scores.compliance} < 3`,
      action_taken: 'BLOCK',
    });
  }

  // Check qualification gate
  if (result.dimension_scores?.qualification < 3) {
    policyGatesHit.push({
      gate_name: 'qualification_threshold',
      triggered: true,
      reason: `Qualification score ${result.dimension_scores.qualification} < 3`,
      action_taken: 'BLOCK',
    });
  }

  // Check CRS threshold gates
  if (result.weighted_crs >= 0.60) {
    policyGatesHit.push({
      gate_name: 'crs_pass_threshold',
      triggered: true,
      reason: `CRS ${result.weighted_crs} >= 0.60`,
      action_taken: 'PASS',
    });
  } else if (result.weighted_crs <= 0.40) {
    policyGatesHit.push({
      gate_name: 'crs_block_threshold',
      triggered: true,
      reason: `CRS ${result.weighted_crs} <= 0.40`,
      action_taken: 'BLOCK',
    });
  }

  // Build evidence used (data sources that informed the decision)
  const evidenceUsed = [];

  if (scenario.company_profile && Object.keys(scenario.company_profile).length > 0) {
    evidenceUsed.push({
      source: 'company_profile',
      content_hash: computeHash(scenario.company_profile),
      ttl_seconds: null, // Static data
      fetched_at: new Date().toISOString(),
    });
  }

  if (scenario.signal_context && Object.keys(scenario.signal_context).length > 0) {
    evidenceUsed.push({
      source: 'signal_context',
      content_hash: computeHash(scenario.signal_context),
      ttl_seconds: 86400, // Signals have 24h TTL
      fetched_at: new Date().toISOString(),
    });
  }

  if (scenario.persona_context && Object.keys(scenario.persona_context).length > 0) {
    evidenceUsed.push({
      source: 'persona_context',
      content_hash: computeHash(scenario.persona_context),
      ttl_seconds: null, // Static config
      fetched_at: new Date().toISOString(),
    });
  }

  // Tools for Sales-Bench scoring (internal scorer, no external tools yet)
  const toolsAllowed = ['siva-scorer', 'crs-calculator', 'decision-engine'];
  const toolsUsed = [
    {
      tool_name: 'siva-scorer',
      input_hash: computeHash({ scenario_id: scenario.id, path_type: scenario.path_type }),
      output_hash: computeHash({ outcome: result.outcome, weighted_crs: result.weighted_crs }),
      duration_ms: result.latency_ms || 0,
      success: result.success !== false,
      error: result.error || null,
    },
  ];

  // Compute risk score (0-1 scale)
  // Higher risk for edge cases, compliance issues, or incorrect outcomes
  let riskScore = 0.1; // Base risk
  if (result.dimension_scores?.compliance < 3) riskScore += 0.3;
  if (!result.outcome_correct) riskScore += 0.3;
  if (result.weighted_crs > 0.40 && result.weighted_crs < 0.60) riskScore += 0.2; // Edge case
  riskScore = Math.min(1.0, riskScore);

  // Compute signature for tamper detection
  const signature = computeSignature(interactionId, envelopeHash, result.outcome);

  return {
    interaction_id: interactionId,
    envelope_sha256: envelopeHash,
    envelope_version: '1.0.0',
    persona_id: suiteContext.persona_id || null,
    persona_version: '1.0.0',
    policy_version: '1.0.0',
    model_slug: 'siva-scorer-v1', // Internal deterministic scorer
    model_provider: 'internal',
    routing_decision: {
      model_selected: 'siva-scorer-v1',
      reason: 'Deterministic scoring for Sales-Bench validation',
      alternatives_considered: [],
      routing_score: 1.0,
    },
    tools_allowed: toolsAllowed,
    tools_used: toolsUsed,
    policy_gates_hit: policyGatesHit,
    evidence_used: evidenceUsed,
    tokens_in: 0, // Internal scorer, no tokens
    tokens_out: 0,
    cost_estimate: 0.0, // No LLM cost for internal scorer
    cache_hit: false,
    risk_score: riskScore,
    escalation_triggered: riskScore > 0.7,
    signature: signature,
  };
}

const router = express.Router();

/**
 * POST /api/os/sales-bench/governance/commands/run-system-validation
 * Trigger system validation run for a suite
 *
 * Super Admin triggers → OS executes → SIVA scores all scenarios
 *
 * This is a SYNCHRONOUS operation that:
 * 1. Creates a run record (status: RUNNING)
 * 2. Fetches all scenarios for the suite
 * 3. Scores each scenario using SIVA
 * 4. Stores results in sales_bench_run_results
 * 5. Calculates aggregate metrics
 * 6. Updates run status to COMPLETED (or FAILED)
 */
router.post('/commands/run-system-validation', async (req, res) => {
  const startTime = Date.now();

  try {
    const { suite_key, run_mode = 'FULL', triggered_by, environment = 'PRODUCTION' } = req.body;

    if (!suite_key) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_KEY_REQUIRED',
        message: 'suite_key is required',
      });
    }

    // Get suite and validate state
    const suiteResult = await pool.query(`
      SELECT s.*, ss.status
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.suite_key = $1 AND s.is_active = true
    `, [suite_key]);

    if (suiteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
        command: 'run-system-validation',
      });
    }

    const suite = suiteResult.rows[0];

    // Validate preconditions
    if (!suite.is_frozen) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_NOT_FROZEN',
        command: 'run-system-validation',
        message: 'Suite must be frozen before running system validation',
        action_required: 'FREEZE_SUITE',
      });
    }

    // Fetch all scenarios for this suite
    const scenariosResult = await pool.query(`
      SELECT
        sc.id,
        sc.path_type,
        sc.expected_outcome,
        sc.scenario_data,
        sc.company_profile,
        sc.contact_profile,
        sc.signal_context,
        sc.persona_context,
        sc.hash
      FROM sales_bench_suite_scenarios sss
      JOIN sales_bench.sales_scenarios sc ON sc.id = sss.scenario_id
      WHERE sss.suite_id = $1
      ORDER BY sss.sequence_order
    `, [suite.id]);

    const scenarios = scenariosResult.rows;

    if (scenarios.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_SCENARIOS',
        command: 'run-system-validation',
        message: 'Suite has no scenarios to validate',
      });
    }

    // Count scenario types
    const goldenCount = scenarios.filter(s => s.path_type === 'GOLDEN').length;
    const killCount = scenarios.filter(s => s.path_type === 'KILL').length;

    // Get next run number
    const nextRunResult = await pool.query(
      `SELECT COALESCE(MAX(run_number), 0) + 1 AS next_run FROM sales_bench_runs WHERE suite_id = $1`,
      [suite.id]
    );
    const runNumber = nextRunResult.rows[0].next_run;

    const client = await pool.connect();
    let runId;

    try {
      await client.query('BEGIN');

      // Create run record (status: RUNNING)
      const runResult = await client.query(`
        INSERT INTO sales_bench_runs (
          suite_id, suite_key, run_number, run_mode,
          scenario_manifest_hash, siva_version, code_commit_sha,
          environment, triggered_by, trigger_source,
          scenario_count, golden_count, kill_count,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'SUPER_ADMIN', $10, $11, $12, 'RUNNING')
        RETURNING id
      `, [
        suite.id, suite_key, runNumber, run_mode,
        suite.scenario_manifest_hash || 'computed-at-runtime', '1.0.0', process.env.GIT_COMMIT || 'unknown',
        environment, triggered_by || 'SUPER_ADMIN',
        scenarios.length, goldenCount, killCount,
      ]);

      runId = runResult.rows[0].id;

      // Audit log - run started
      await client.query(`
        INSERT INTO sales_bench_audit_log (suite_id, run_id, event_type, event_description, actor, actor_role)
        VALUES ($1, $2, 'RUN_STARTED', $3, $4, 'SUPER_ADMIN')
      `, [suite.id, runId, `System validation run #${runNumber} started (${run_mode}) - ${scenarios.length} scenarios`, triggered_by || 'SUPER_ADMIN']);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // --- SIVA SCORING (outside transaction for responsiveness) ---
    console.log(`[SALES_BENCH] Run #${runNumber}: Scoring ${scenarios.length} scenarios...`);

    // Phase 1.5: Get persona for suite (CRITICAL for production path)
    const persona = await getPersonaForSuite(suite_key);
    if (!persona) {
      console.warn(`[SALES_BENCH] No persona found for suite ${suite_key}, using legacy scorer`);
    }

    // Phase 1.5: Use production SIVA scorer with persona (PRD v1.2 compliance)
    // This is the SAME path production uses - no parallel intelligence paths
    let batchResult;
    if (persona) {
      console.log(`[SALES_BENCH] Using PRODUCTION SIVA scorer with persona: ${persona.persona_key}`);
      batchResult = await scoreBatchWithProductionSIVA(scenarios, persona);
    } else {
      // Fallback to legacy scorer (for suites without persona binding)
      console.log(`[SALES_BENCH] Fallback to LEGACY deterministic scorer`);
      batchResult = await scoreBatch(scenarios);
    }
    const { results, metrics } = batchResult;

    console.log(`[SALES_BENCH] Run #${runNumber}: Scoring complete. Golden Pass: ${metrics.golden_pass_rate}%, Kill Containment: ${metrics.kill_containment_rate}%`);

    // Store individual results and update run
    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');

      // Insert individual scenario results WITH TRACE DATA
      // Suite context for trace building - now with persona_id from production path
      const suiteContext = {
        persona_id: persona?.persona_id || null,
        persona_key: persona?.persona_key || null,
      };

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const scenario = scenarios[i];

        // Build envelope for this scenario
        const envelope = buildEnvelope(scenario, suite_key, runNumber);

        // Build complete trace data
        const trace = buildTraceData(scenario, r, envelope, suiteContext);

        await client2.query(`
          INSERT INTO sales_bench_run_results (
            run_id, scenario_id, scenario_hash, path_type, execution_order,
            outcome, expected_outcome,
            crs_qualification, crs_needs_discovery, crs_value_articulation,
            crs_objection_handling, crs_process_adherence, crs_compliance,
            crs_relationship_building, crs_next_step_secured, crs_weighted,
            siva_response, latency_ms,
            -- TRACE FIELDS (append-only, immutable)
            interaction_id, envelope_sha256, envelope_version,
            persona_id, persona_version, policy_version,
            model_slug, model_provider, routing_decision,
            tools_allowed, tools_used, policy_gates_hit, evidence_used,
            tokens_in, tokens_out, cost_estimate, cache_hit,
            risk_score, escalation_triggered, signature
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38
          )
        `, [
          runId, r.scenario_id, scenario.hash, r.path_type, i + 1,
          r.outcome || 'ERROR', r.expected_outcome,
          r.dimension_scores?.qualification || null,
          r.dimension_scores?.needs_discovery || null,
          r.dimension_scores?.value_articulation || null,
          r.dimension_scores?.objection_handling || null,
          r.dimension_scores?.process_adherence || null,
          r.dimension_scores?.compliance || null,
          r.dimension_scores?.relationship_building || null,
          r.dimension_scores?.next_step_secured || null,
          r.weighted_crs || null,
          r.outcome_reason || r.error || null,
          r.latency_ms || 0,
          // TRACE FIELDS
          trace.interaction_id,
          trace.envelope_sha256,
          trace.envelope_version,
          trace.persona_id,
          trace.persona_version,
          trace.policy_version,
          trace.model_slug,
          trace.model_provider,
          JSON.stringify(trace.routing_decision),
          JSON.stringify(trace.tools_allowed),
          JSON.stringify(trace.tools_used),
          JSON.stringify(trace.policy_gates_hit),
          JSON.stringify(trace.evidence_used),
          trace.tokens_in,
          trace.tokens_out,
          trace.cost_estimate,
          trace.cache_hit,
          trace.risk_score,
          trace.escalation_triggered,
          trace.signature,
        ]);
      }

      // Update run with results
      const durationMs = Date.now() - startTime;
      await client2.query(`
        UPDATE sales_bench_runs SET
          status = 'COMPLETED',
          ended_at = NOW(),
          duration_ms = $2,
          pass_count = $3,
          fail_count = 0,
          block_count = $4,
          error_count = $5,
          golden_pass_rate = $6,
          kill_containment_rate = $7,
          cohens_d = $8,
          metrics = $9
        WHERE id = $1
      `, [
        runId, durationMs,
        metrics.pass_count, metrics.block_count, metrics.error_count,
        metrics.golden_pass_rate, metrics.kill_containment_rate, metrics.cohens_d,
        JSON.stringify(metrics),
      ]);

      // Update suite status if validation passes
      const validationPassed = metrics.golden_pass_rate >= 90 && metrics.kill_containment_rate >= 95;

      if (validationPassed) {
        await client2.query(`
          UPDATE sales_bench_suite_status SET
            status = 'SYSTEM_VALIDATED',
            system_validated_at = NOW(),
            system_validation_run_id = $2,
            system_metrics = $3
          WHERE suite_id = $1
        `, [suite.id, runId, JSON.stringify(metrics)]);

        // Audit log - system validated
        await client2.query(`
          INSERT INTO sales_bench_audit_log (suite_id, run_id, event_type, event_description, actor, actor_role, after_state)
          VALUES ($1, $2, 'SYSTEM_VALIDATION_PASSED', $3, 'SYSTEM', 'OS', $4)
        `, [
          suite.id, runId,
          `System validation PASSED: Golden ${metrics.golden_pass_rate}%, Kill ${metrics.kill_containment_rate}%, Cohen's d ${metrics.cohens_d}`,
          JSON.stringify({ status: 'SYSTEM_VALIDATED', metrics }),
        ]);
      } else {
        // Audit log - validation result
        await client2.query(`
          INSERT INTO sales_bench_audit_log (suite_id, run_id, event_type, event_description, actor, actor_role, after_state)
          VALUES ($1, $2, 'RUN_COMPLETED', $3, 'SYSTEM', 'OS', $4)
        `, [
          suite.id, runId,
          `Run #${runNumber} completed: Golden ${metrics.golden_pass_rate}%, Kill ${metrics.kill_containment_rate}%, Cohen's d ${metrics.cohens_d}`,
          JSON.stringify({ metrics }),
        ]);
      }

      await client2.query('COMMIT');

      res.status(201).json({
        success: true,
        command: 'run-system-validation',
        data: {
          id: runId,
          run_id: runId,
          run_number: runNumber,
          suite_key,
          run_mode,
          status: 'COMPLETED',
          scenario_count: scenarios.length,
          golden_count: goldenCount,
          kill_count: killCount,
          pass_count: metrics.pass_count,
          block_count: metrics.block_count,
          error_count: metrics.error_count,
          golden_pass_rate: metrics.golden_pass_rate,
          kill_containment_rate: metrics.kill_containment_rate,
          cohens_d: metrics.cohens_d,
          duration_ms: durationMs,
          validation_passed: validationPassed,
        },
        message: validationPassed
          ? `System validation PASSED! Golden: ${metrics.golden_pass_rate}%, Kill: ${metrics.kill_containment_rate}%`
          : `Run #${runNumber} completed. Golden: ${metrics.golden_pass_rate}%, Kill: ${metrics.kill_containment_rate}%`,
        next_step: validationPassed
          ? 'Suite is now SYSTEM_VALIDATED. Proceed to human calibration.'
          : 'Review results and tune scenarios or SIVA logic.',
      });
    } catch (error) {
      await client2.query('ROLLBACK');

      // Mark run as FAILED
      await pool.query(`
        UPDATE sales_bench_runs SET status = 'FAILED', error_message = $2, ended_at = NOW()
        WHERE id = $1
      `, [runId, error.message]);

      throw error;
    } finally {
      client2.release();
    }
  } catch (error) {
    console.error('[SALES_BENCH] run-system-validation error:', error);
    res.status(500).json({
      success: false,
      command: 'run-system-validation',
      error: 'COMMAND_FAILED',
      message: error.message,
    });
  }
});

/**
 * Generate URL-safe token for evaluator access
 */
function generateToken() {
  return randomBytes(48).toString('base64url');
}

/**
 * POST /api/os/sales-bench/governance/commands/start-human-calibration
 * Start human calibration session for a suite with email-based evaluator invites
 *
 * Super Admin triggers → OS executes
 * Requires: SYSTEM_VALIDATED status
 *
 * Flow:
 * 1. Create session with evaluator invites
 * 2. Generate unique tokens for each evaluator
 * 3. Return invite URLs (Super Admin or system sends emails)
 * 4. Evaluators access scoring page via token (no login required)
 */
router.post('/commands/start-human-calibration', async (req, res) => {
  try {
    const { suite_key, session_name, evaluator_count, evaluator_emails, triggered_by, deadline_days = 7 } = req.body;

    if (!suite_key) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_KEY_REQUIRED',
        command: 'start-human-calibration',
      });
    }

    // Validate evaluator emails
    const emails = evaluator_emails || [];
    const effectiveCount = evaluator_count || emails.length;

    if (effectiveCount < 2) {
      return res.status(400).json({
        success: false,
        error: 'EVALUATOR_COUNT_REQUIRED',
        command: 'start-human-calibration',
        message: 'At least 2 evaluators required for ICC/Spearman computation',
      });
    }

    if (emails.length > 0 && emails.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'INSUFFICIENT_EMAILS',
        command: 'start-human-calibration',
        message: 'Please provide at least 2 evaluator emails',
      });
    }

    // Get suite and validate state
    const suiteResult = await pool.query(`
      SELECT s.*, ss.status
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.suite_key = $1 AND s.is_active = true
    `, [suite_key]);

    if (suiteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
        command: 'start-human-calibration',
      });
    }

    const suite = suiteResult.rows[0];

    // Validate preconditions
    if (suite.status !== 'SYSTEM_VALIDATED') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        command: 'start-human-calibration',
        message: 'Suite must be SYSTEM_VALIDATED before human calibration',
        current_status: suite.status,
        action_required: suite.status === 'DRAFT' ? 'RUN_SYSTEM_VALIDATION' : null,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate deadline
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + deadline_days);

      // Create human calibration session
      const sessionResult = await client.query(`
        INSERT INTO sales_bench_human_sessions (
          suite_id, session_name, evaluator_count, deadline, created_by
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        suite.id,
        session_name || `Calibration ${new Date().toISOString().split('T')[0]}`,
        effectiveCount,
        deadline,
        triggered_by || 'SUPER_ADMIN'
      ]);

      const session = sessionResult.rows[0];

      // Get scenarios for this suite
      const scenariosResult = await client.query(`
        SELECT scenario_id FROM sales_bench_suite_scenarios
        WHERE suite_id = $1
        ORDER BY sequence_order
      `, [suite.id]);

      const scenarioIds = scenariosResult.rows.map(r => r.scenario_id);

      // Create evaluator invites if emails provided
      const invites = [];
      const baseUrl = process.env.SAAS_BASE_URL || 'https://upr.sivakumar.ai';

      for (let i = 0; i < emails.length; i++) {
        const email = emails[i].trim().toLowerCase();
        const evaluatorId = `EVAL_${i + 1}`;
        const token = generateToken();
        const expiresAt = new Date(deadline);
        expiresAt.setDate(expiresAt.getDate() + 1); // Expires 1 day after deadline

        const inviteResult = await client.query(`
          INSERT INTO sales_bench_evaluator_invites (
            session_id, evaluator_id, email, token, scenarios_assigned, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [session.id, evaluatorId, email, token, scenarioIds.length, expiresAt]);

        const invite = inviteResult.rows[0];

        // Create scenario queue for this evaluator (shuffled order for bias reduction)
        const shuffledScenarios = [...scenarioIds];
        // Seeded shuffle based on evaluator index for reproducibility
        for (let j = shuffledScenarios.length - 1; j > 0; j--) {
          const seed = (i + 1) * 12345 + j;
          const k = Math.floor(((seed * 9301 + 49297) % 233280) / 233280 * (j + 1));
          [shuffledScenarios[j], shuffledScenarios[k]] = [shuffledScenarios[k], shuffledScenarios[j]];
        }

        for (let q = 0; q < shuffledScenarios.length; q++) {
          await client.query(`
            INSERT INTO sales_bench_evaluator_scenario_queue (
              invite_id, scenario_id, queue_position
            ) VALUES ($1, $2, $3)
          `, [invite.id, shuffledScenarios[q], q + 1]);
        }

        invites.push({
          evaluator_id: evaluatorId,
          email: email,
          token: token,
          scoring_url: `${baseUrl}/evaluate/${token}`,
          scenarios_to_score: scenarioIds.length,
          expires_at: expiresAt.toISOString(),
        });
      }

      // Update session with invite count
      if (invites.length > 0) {
        await client.query(`
          UPDATE sales_bench_human_sessions
          SET invites_sent = $2
          WHERE id = $1
        `, [session.id, invites.length]);
      }

      // Audit log
      await client.query(`
        INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role, after_state)
        VALUES ($1, 'HUMAN_CALIBRATION_STARTED', $2, $3, 'SUPER_ADMIN', $4)
      `, [
        suite.id,
        `Human calibration session started with ${effectiveCount} evaluators`,
        triggered_by || 'SUPER_ADMIN',
        JSON.stringify({ session_id: session.id, invites: invites.length, deadline: deadline.toISOString() })
      ]);

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        command: 'start-human-calibration',
        data: {
          session_id: session.id,
          suite_key,
          evaluator_count: effectiveCount,
          status: 'IN_PROGRESS',
          deadline: deadline.toISOString(),
          invites: invites,
        },
        message: `Human calibration session started. ${invites.length > 0 ? `Send the scoring URLs to evaluators.` : 'Add evaluators via API.'}`,
        next_steps: invites.length > 0 ? [
          'Send scoring URLs to evaluators via email',
          'Evaluators click link and score scenarios (no login required)',
          'Monitor progress via /api/os/sales-bench/calibration/session/:id',
          'Correlation computed automatically when all complete',
        ] : [
          'Use calibration API to add evaluators',
          'Record human scores via submit endpoint',
        ],
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[SALES_BENCH] start-human-calibration error:', error);
    res.status(500).json({
      success: false,
      command: 'start-human-calibration',
      error: 'COMMAND_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/governance/commands/approve-for-ga
 * Approve suite for GA (after human validation)
 *
 * Super Admin triggers → OS executes
 * Requires: HUMAN_VALIDATED status
 */
router.post('/commands/approve-for-ga', async (req, res) => {
  try {
    const { suite_key, approved_by, approval_notes } = req.body;

    if (!suite_key) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_KEY_REQUIRED',
        command: 'approve-for-ga',
      });
    }

    if (!approved_by) {
      return res.status(400).json({
        success: false,
        error: 'APPROVED_BY_REQUIRED',
        command: 'approve-for-ga',
        message: 'approved_by is required (must be CALIBRATION_ADMIN)',
      });
    }

    // Get suite and validate state
    const suiteResult = await pool.query(`
      SELECT s.*, ss.status, ss.spearman_rho
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.suite_key = $1 AND s.is_active = true
    `, [suite_key]);

    if (suiteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
        command: 'approve-for-ga',
      });
    }

    const suite = suiteResult.rows[0];

    // Validate preconditions - MUST be HUMAN_VALIDATED
    if (suite.status !== 'HUMAN_VALIDATED') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        command: 'approve-for-ga',
        message: 'Suite must be HUMAN_VALIDATED before GA approval',
        current_status: suite.status,
        action_required: suite.status === 'SYSTEM_VALIDATED' ? 'START_HUMAN_CALIBRATION' : 'RUN_SYSTEM_VALIDATION',
        gating_rule: 'Human validation is MANDATORY for GA (PRD v1.3)',
      });
    }

    // Validate Spearman correlation meets threshold
    if (suite.spearman_rho && parseFloat(suite.spearman_rho) < 0.60) {
      return res.status(400).json({
        success: false,
        error: 'CORRELATION_TOO_LOW',
        command: 'approve-for-ga',
        message: 'Spearman correlation below acceptable threshold (0.60)',
        current_rho: suite.spearman_rho,
        required_rho: 0.60,
        action_required: 'Review calibration data or retrain model',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update status to GA_APPROVED
      await client.query(`
        UPDATE sales_bench_suite_status
        SET status = 'GA_APPROVED', ga_approved_at = NOW(), approved_by = $2, approval_notes = $3
        WHERE suite_id = $1
      `, [suite.id, approved_by, approval_notes]);

      // Audit log
      await client.query(`
        INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role, after_state)
        VALUES ($1, 'GA_APPROVED', $2, $3, 'CALIBRATION_ADMIN', $4)
      `, [
        suite.id,
        `Suite approved for GA. Spearman ρ = ${suite.spearman_rho || 'N/A'}`,
        approved_by,
        JSON.stringify({ status: 'GA_APPROVED', approved_by, approval_notes }),
      ]);

      await client.query('COMMIT');

      res.json({
        success: true,
        command: 'approve-for-ga',
        data: {
          suite_key,
          status: 'GA_APPROVED',
          approved_by,
          approved_at: new Date().toISOString(),
          spearman_rho: suite.spearman_rho,
        },
        message: 'Suite approved for GA',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[SALES_BENCH] approve-for-ga error:', error);
    res.status(500).json({
      success: false,
      command: 'approve-for-ga',
      error: 'COMMAND_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/governance/commands/deprecate-suite
 * Deprecate a suite (remove from active use)
 *
 * Super Admin triggers → OS executes
 */
router.post('/commands/deprecate-suite', async (req, res) => {
  try {
    const { suite_key, deprecated_by, deprecation_reason } = req.body;

    if (!suite_key || !deprecated_by || !deprecation_reason) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        command: 'deprecate-suite',
        required: ['suite_key', 'deprecated_by', 'deprecation_reason'],
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get suite
      const suiteResult = await client.query(
        `SELECT id FROM sales_bench_suites WHERE suite_key = $1 AND is_active = true`,
        [suite_key]
      );

      if (suiteResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'SUITE_NOT_FOUND',
          command: 'deprecate-suite',
        });
      }

      const suiteId = suiteResult.rows[0].id;

      // Deprecate suite
      await client.query(`
        UPDATE sales_bench_suites SET is_active = false WHERE id = $1
      `, [suiteId]);

      // Update status
      await client.query(`
        UPDATE sales_bench_suite_status
        SET status = 'DEPRECATED', deprecated_at = NOW(), deprecated_by = $2, deprecation_reason = $3
        WHERE suite_id = $1
      `, [suiteId, deprecated_by, deprecation_reason]);

      // Audit log
      await client.query(`
        INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role)
        VALUES ($1, 'SUITE_DEPRECATED', $2, $3, 'CALIBRATION_ADMIN')
      `, [suiteId, `Suite deprecated: ${deprecation_reason}`, deprecated_by]);

      await client.query('COMMIT');

      res.json({
        success: true,
        command: 'deprecate-suite',
        data: {
          suite_key,
          status: 'DEPRECATED',
          deprecated_by,
          deprecated_at: new Date().toISOString(),
        },
        message: 'Suite deprecated',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[SALES_BENCH] deprecate-suite error:', error);
    res.status(500).json({
      success: false,
      command: 'deprecate-suite',
      error: 'COMMAND_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/governance/commands/create-version
 * Create a new version of a suite
 *
 * Copies scenarios from source suite to new version.
 * New version starts in DRAFT status.
 */
router.post('/commands/create-version', async (req, res) => {
  try {
    const { suite_key, version_notes, created_by } = req.body;

    if (!suite_key) {
      return res.status(400).json({
        success: false,
        error: 'SUITE_KEY_REQUIRED',
        command: 'create-version',
      });
    }

    // Get source suite
    const suiteResult = await pool.query(`
      SELECT id, suite_key, name, version, base_suite_key
      FROM sales_bench_suites
      WHERE suite_key = $1 AND is_active = true
    `, [suite_key]);

    if (suiteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'SUITE_NOT_FOUND',
        command: 'create-version',
      });
    }

    const sourceSuite = suiteResult.rows[0];

    // Create new version using database function
    const newVersionResult = await pool.query(`
      SELECT sales_bench_create_suite_version($1, $2, $3) AS new_suite_id
    `, [sourceSuite.id, version_notes, created_by || 'SUPER_ADMIN']);

    const newSuiteId = newVersionResult.rows[0].new_suite_id;

    // Get new suite details
    const newSuiteResult = await pool.query(`
      SELECT s.*, ss.status
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.id = $1
    `, [newSuiteId]);

    const newSuite = newSuiteResult.rows[0];

    // Audit log
    await pool.query(`
      INSERT INTO sales_bench_audit_log (suite_id, event_type, event_description, actor, actor_role, after_state)
      VALUES ($1, 'VERSION_CREATED', $2, $3, 'SUPER_ADMIN', $4)
    `, [
      newSuiteId,
      `Created version ${newSuite.version} from ${sourceSuite.suite_key}`,
      created_by || 'SUPER_ADMIN',
      JSON.stringify({ source_suite_key: sourceSuite.suite_key, new_version: newSuite.version })
    ]);

    res.status(201).json({
      success: true,
      command: 'create-version',
      data: {
        new_suite_id: newSuiteId,
        new_suite_key: newSuite.suite_key,
        version: newSuite.version,
        base_suite_key: newSuite.base_suite_key,
        status: newSuite.status,
        scenario_count: newSuite.scenario_count,
        source_suite_key: sourceSuite.suite_key,
      },
      message: `Created version ${newSuite.version} of ${newSuite.base_suite_key}`,
      next_step: 'Modify scenarios as needed, then freeze and validate',
    });
  } catch (error) {
    console.error('[SALES_BENCH] create-version error:', error);
    res.status(500).json({
      success: false,
      command: 'create-version',
      error: 'COMMAND_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/governance/versions/:base_suite_key
 * Get all versions of a suite
 */
router.get('/versions/:base_suite_key', async (req, res) => {
  try {
    const { base_suite_key } = req.params;

    const versionsResult = await pool.query(`
      SELECT
        s.id,
        s.suite_key,
        s.name,
        s.version,
        s.is_latest_version,
        s.version_notes,
        s.version_created_at,
        s.scenario_count,
        s.is_frozen,
        ss.status,
        ss.system_validated_at,
        ss.human_validated_at,
        ss.ga_approved_at
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.base_suite_key = $1 AND s.is_active = true
      ORDER BY s.version DESC
    `, [base_suite_key]);

    res.json({
      success: true,
      data: {
        base_suite_key,
        total_versions: versionsResult.rows.length,
        versions: versionsResult.rows,
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] get versions error:', error);
    res.status(500).json({
      success: false,
      error: 'FETCH_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/governance/status
 * Get overall governance status (dashboard data)
 */
router.get('/status', async (req, res) => {
  try {
    // Get suite counts by status
    const statusCounts = await pool.query(`
      SELECT ss.status, COUNT(*) as count
      FROM sales_bench_suites s
      LEFT JOIN sales_bench_suite_status ss ON ss.suite_id = s.id
      WHERE s.is_active = true
      GROUP BY ss.status
    `);

    // Get recent runs
    const recentRuns = await pool.query(`
      SELECT r.suite_key, r.run_number, r.status, r.golden_pass_rate, r.kill_containment_rate, r.started_at
      FROM sales_bench_runs r
      ORDER BY r.started_at DESC
      LIMIT 5
    `);

    // Get recent audit events
    const recentEvents = await pool.query(`
      SELECT a.event_type, a.event_description, a.actor, a.created_at, s.suite_key
      FROM sales_bench_audit_log a
      LEFT JOIN sales_bench_suites s ON s.id = a.suite_id
      ORDER BY a.created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        status_summary: statusCounts.rows.reduce((acc, row) => {
          acc[row.status || 'UNKNOWN'] = parseInt(row.count);
          return acc;
        }, {}),
        recent_runs: recentRuns.rows,
        recent_events: recentEvents.rows,
        governance_model: {
          authority: 'OS',
          visibility: 'SUPER_ADMIN',
          human_validation: 'MANDATORY_FOR_GA',
        },
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] governance status error:', error);
    res.status(500).json({
      success: false,
      error: 'STATUS_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/governance/commands
 * List available governance commands
 */
router.get('/commands', (req, res) => {
  res.json({
    success: true,
    commands: [
      {
        command: 'run-system-validation',
        method: 'POST',
        path: '/api/os/sales-bench/governance/commands/run-system-validation',
        description: 'Trigger system validation run for a suite',
        requires: ['suite_key'],
        preconditions: ['Suite must be FROZEN'],
      },
      {
        command: 'start-human-calibration',
        method: 'POST',
        path: '/api/os/sales-bench/governance/commands/start-human-calibration',
        description: 'Start human calibration session',
        requires: ['suite_key', 'evaluator_count'],
        preconditions: ['Suite must be SYSTEM_VALIDATED'],
      },
      {
        command: 'approve-for-ga',
        method: 'POST',
        path: '/api/os/sales-bench/governance/commands/approve-for-ga',
        description: 'Approve suite for GA (production use)',
        requires: ['suite_key', 'approved_by'],
        preconditions: ['Suite must be HUMAN_VALIDATED', 'Spearman ρ ≥ 0.60'],
      },
      {
        command: 'deprecate-suite',
        method: 'POST',
        path: '/api/os/sales-bench/governance/commands/deprecate-suite',
        description: 'Deprecate a suite',
        requires: ['suite_key', 'deprecated_by', 'deprecation_reason'],
        preconditions: [],
      },
    ],
    governance_flow: [
      '1. Create suite → status: DRAFT',
      '2. Freeze suite → scenarios immutable',
      '3. Run system validation → status: SYSTEM_VALIDATED',
      '4. Start human calibration → collect RM scores',
      '5. Complete calibration → status: HUMAN_VALIDATED',
      '6. Approve for GA → status: GA_APPROVED',
    ],
    authority_model: {
      OS: 'Executes all logic, owns data',
      SUPER_ADMIN: 'Triggers commands, views status (read-only)',
    },
  });
});

export default router;
