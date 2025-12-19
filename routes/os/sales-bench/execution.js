/**
 * Path Execution API Routes
 * S247: Golden & Kill Path Execution
 * PRD v1.3 Appendix §6
 *
 * Endpoints:
 * - POST /api/os/sales-bench/execution/run          - Execute a single scenario
 * - POST /api/os/sales-bench/execution/batch        - Execute multiple scenarios
 * - GET  /api/os/sales-bench/execution/status/:id   - Get execution status
 * - POST /api/os/sales-bench/execution/replay/:runId - Replay a previous run
 */

import express from 'express';
import {
  executeScenario,
  executeGoldenPath,
  executeKillPath,
  executeBatch,
} from '../../../os/sales-bench/engine/path-executor.js';
import { getScenarioById } from '../../../os/sales-bench/storage/scenario-store.js';
import { getBuyerBotById, listBuyerBots, getMandatoryBots } from '../../../os/sales-bench/storage/buyer-bot-store.js';
import { getBotVariantById } from '../../../os/sales-bench/storage/buyer-bot-store.js';
import { createRunRecord, getRunById, createReplayRun } from '../../../os/sales-bench/storage/run-store.js';
import { createCRSScoreRecord } from '../../../os/sales-bench/storage/crs-store.js';
import { validateMandatoryCoverage, getKillPathRequiredBots } from '../../../os/sales-bench/bots/mandatory-adversarial.js';
import { AuthorityInvarianceError } from '../../../os/sales-bench/guards/authority-invariance.js';

const router = express.Router();

/**
 * Mock SIVA invoke for testing (replace with actual SIVA integration)
 */
async function mockSivaInvoke({ conversation, scenario, context }) {
  // This is a placeholder - real implementation would call SIVA
  const lastMessage = conversation[conversation.length - 1];

  const responses = [
    'Thank you for reaching out. I would be happy to help you understand our solution better.',
    'That\'s a great question. Let me explain how we address that specific need.',
    'I understand your concern. Based on what you\'ve shared, I think we can help.',
    'Let me share some context on how other clients in your industry have benefited.',
    'Would it be helpful if I walked you through a specific example?',
  ];

  return {
    content: responses[conversation.length % responses.length],
    tokens_used: 50,
    cost_usd: 0.001,
  };
}

/**
 * POST /api/os/sales-bench/execution/run
 * Execute a single scenario
 */
router.post('/run', async (req, res) => {
  try {
    const { scenario_id, buyer_bot_id, variant_id, seed, persist } = req.body;

    if (!scenario_id) {
      return res.status(400).json({
        success: false,
        error: 'SCENARIO_REQUIRED',
        message: 'scenario_id is required',
      });
    }

    if (!buyer_bot_id) {
      return res.status(400).json({
        success: false,
        error: 'BUYER_BOT_REQUIRED',
        message: 'buyer_bot_id is required',
      });
    }

    // Get scenario
    const scenario = await getScenarioById(scenario_id);
    if (!scenario) {
      return res.status(404).json({
        success: false,
        error: 'SCENARIO_NOT_FOUND',
        message: `Scenario ${scenario_id} not found`,
      });
    }

    // Get buyer bot
    const buyerBot = await getBuyerBotById(buyer_bot_id);
    if (!buyerBot) {
      return res.status(404).json({
        success: false,
        error: 'BUYER_BOT_NOT_FOUND',
        message: `Buyer Bot ${buyer_bot_id} not found`,
      });
    }

    // Get variant if specified
    let variant = null;
    if (variant_id) {
      variant = await getBotVariantById(variant_id);
      if (!variant) {
        return res.status(404).json({
          success: false,
          error: 'VARIANT_NOT_FOUND',
          message: `Variant ${variant_id} not found`,
        });
      }
    }

    // Execute scenario
    const result = await executeScenario({
      scenario,
      buyerBot,
      variant,
      sivaInvoke: mockSivaInvoke, // Replace with actual SIVA
      seed,
      dryRun: !persist,
    });

    // Persist if requested
    if (persist) {
      // Save run
      const savedRun = await createRunRecord({
        scenario_id: scenario.scenario_id,
        buyer_bot_id: buyerBot.bot_id,
        buyer_bot_variant_id: variant?.variant_id,
        seed: result.run.seed,
      });

      // Update run with conversation and outcome
      // Note: In full implementation, this would be done incrementally

      // Save CRS score
      const savedScore = await createCRSScoreRecord({
        run_id: savedRun.run_id,
        scenario_id: scenario.scenario_id,
        dimension_scores: result.crsScores.dimension_scores,
        dimension_evidence: result.crsScores.dimension_evidence,
      });

      result.persisted = {
        run_id: savedRun.run_id,
        score_id: savedScore.score_id,
      };
    }

    res.json({
      success: true,
      data: {
        outcome: result.outcome,
        outcome_reason: result.outcomeReason,
        path_type: scenario.path_type,
        expected_outcome: scenario.expected_outcome,
        match: result.outcome === scenario.expected_outcome,
        crs_overall: result.crsScores.dimension_scores
          ? Object.values(result.crsScores.dimension_scores).reduce((sum, d) =>
            sum + (d.weighted_score || d.score * 0.125), 0
          )
          : null,
        analysis: result.analysis,
        run: {
          seed: result.run.seed,
          turn_count: result.run.conversation.length,
          total_cost: result.run.metrics.total_cost_usd,
        },
        persisted: result.persisted || null,
      },
      message: `Scenario executed with outcome: ${result.outcome}`,
    });
  } catch (error) {
    if (error instanceof AuthorityInvarianceError) {
      return res.status(403).json({
        success: false,
        error: 'AUTHORITY_INVARIANCE_VIOLATION',
        message: error.message,
      });
    }

    console.error('[SALES_BENCH] Execution error:', error);
    res.status(500).json({
      success: false,
      error: 'EXECUTION_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/execution/batch
 * Execute multiple scenarios with mandatory adversarial bots
 */
router.post('/batch', async (req, res) => {
  try {
    const { scenario_ids, vertical, sub_vertical, include_mandatory, persist } = req.body;

    if (!scenario_ids || !Array.isArray(scenario_ids) || scenario_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'SCENARIOS_REQUIRED',
        message: 'scenario_ids array is required',
      });
    }

    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'vertical is required for batch execution',
      });
    }

    // Get scenarios
    const scenarios = [];
    for (const id of scenario_ids) {
      const scenario = await getScenarioById(id);
      if (scenario) {
        scenarios.push(scenario);
      }
    }

    if (scenarios.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'NO_VALID_SCENARIOS',
        message: 'No valid scenarios found',
      });
    }

    // Get buyer bots
    let buyerBots = await listBuyerBots({ vertical, sub_vertical });

    // Include mandatory bots if requested
    if (include_mandatory) {
      const mandatoryBots = await getMandatoryBots(vertical, sub_vertical);
      const existingIds = new Set(buyerBots.map((b) => b.bot_id));
      for (const bot of mandatoryBots) {
        if (!existingIds.has(bot.bot_id)) {
          buyerBots.push(bot);
        }
      }
    }

    if (buyerBots.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'NO_BUYER_BOTS',
        message: 'No buyer bots found for this vertical',
      });
    }

    // Execute batch
    const results = await executeBatch(scenarios, buyerBots, mockSivaInvoke, {
      dryRun: !persist,
    });

    // Calculate summary
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.success && r.outcome === 'PASS').length,
      failed: results.filter((r) => r.success && r.outcome === 'FAIL').length,
      blocked: results.filter((r) => r.success && r.outcome === 'BLOCK').length,
      errors: results.filter((r) => !r.success).length,
    };

    summary.pass_rate = summary.total > 0
      ? ((summary.passed / summary.total) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        summary,
        results: results.map((r) => ({
          scenario_id: r.scenario_id,
          success: r.success,
          outcome: r.outcome,
          outcome_reason: r.outcomeReason,
          error: r.error,
        })),
      },
      message: `Batch executed: ${summary.passed}/${summary.total} passed`,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Batch execution error:', error);
    res.status(500).json({
      success: false,
      error: 'BATCH_EXECUTION_FAILED',
      message: error.message,
    });
  }
});

/**
 * GET /api/os/sales-bench/execution/status/:id
 * Get execution status (for async execution)
 */
router.get('/status/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // In a full implementation, this would check async job status
    // For now, check if run exists
    const run = await getRunById(id);

    if (!run) {
      return res.status(404).json({
        success: false,
        error: 'RUN_NOT_FOUND',
        message: `Run ${id} not found`,
      });
    }

    res.json({
      success: true,
      data: {
        run_id: run.run_id,
        status: run.completed_at ? 'completed' : 'in_progress',
        outcome: run.hard_outcome,
        outcome_reason: run.outcome_reason,
        turn_count: run.conversation.length,
        started_at: run.started_at,
        completed_at: run.completed_at,
      },
    });
  } catch (error) {
    console.error('[SALES_BENCH] Status check error:', error);
    res.status(500).json({
      success: false,
      error: 'STATUS_CHECK_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/execution/replay/:runId
 * Replay a previous run with the same seed (deterministic)
 */
router.post('/replay/:runId', async (req, res) => {
  try {
    const { runId } = req.params;
    const { persist } = req.body;

    // Get original run
    const originalRun = await getRunById(runId);
    if (!originalRun) {
      return res.status(404).json({
        success: false,
        error: 'RUN_NOT_FOUND',
        message: `Original run ${runId} not found`,
      });
    }

    if (!originalRun.completed_at) {
      return res.status(400).json({
        success: false,
        error: 'RUN_NOT_COMPLETED',
        message: 'Cannot replay incomplete run',
      });
    }

    // Get scenario and buyer bot
    const scenario = await getScenarioById(originalRun.scenario_id);
    const buyerBot = await getBuyerBotById(originalRun.buyer_bot_id);

    if (!scenario || !buyerBot) {
      return res.status(404).json({
        success: false,
        error: 'SCENARIO_OR_BOT_NOT_FOUND',
        message: 'Scenario or Buyer Bot no longer exists',
      });
    }

    // Get variant if used
    let variant = null;
    if (originalRun.buyer_bot_variant_id) {
      variant = await getBotVariantById(originalRun.buyer_bot_variant_id);
    }

    // Execute with same seed
    const result = await executeScenario({
      scenario,
      buyerBot,
      variant,
      sivaInvoke: mockSivaInvoke,
      seed: originalRun.seed, // CRITICAL: Same seed for determinism
      dryRun: !persist,
    });

    // Compare with original
    const comparison = {
      original_outcome: originalRun.hard_outcome,
      replay_outcome: result.outcome,
      deterministic: originalRun.hard_outcome === result.outcome,
      original_turns: originalRun.conversation.length,
      replay_turns: result.run.conversation.length,
    };

    // Persist replay if requested
    if (persist) {
      const replayRun = await createReplayRun(runId);
      result.persisted = { run_id: replayRun.run_id };
    }

    res.json({
      success: true,
      data: {
        original_run_id: runId,
        seed: originalRun.seed,
        comparison,
        outcome: result.outcome,
        outcome_reason: result.outcomeReason,
        persisted: result.persisted || null,
      },
      message: comparison.deterministic
        ? 'Replay matched original (deterministic)'
        : 'WARNING: Replay did not match original',
    });
  } catch (error) {
    console.error('[SALES_BENCH] Replay error:', error);
    res.status(500).json({
      success: false,
      error: 'REPLAY_FAILED',
      message: error.message,
    });
  }
});

/**
 * POST /api/os/sales-bench/execution/validate-mandatory
 * Validate that mandatory bots will be included in execution
 */
router.post('/validate-mandatory', async (req, res) => {
  try {
    const { vertical, sub_vertical, path_type } = req.body;

    if (!vertical) {
      return res.status(400).json({
        success: false,
        error: 'VERTICAL_REQUIRED',
        message: 'vertical is required',
      });
    }

    // Check mandatory coverage
    const validation = await validateMandatoryCoverage(
      listBuyerBots,
      vertical,
      sub_vertical
    );

    // For Kill paths, all mandatory bots are required
    let requirements;
    if (path_type === 'KILL') {
      const required = getKillPathRequiredBots();
      requirements = {
        path_type: 'KILL',
        required_bots: required.length,
        note: 'Kill paths MUST test against all mandatory adversarial bots',
      };
    } else {
      requirements = {
        path_type: 'GOLDEN',
        required_bots: 3,
        note: 'Golden paths must test against minimum 3 mandatory adversarial bots',
      };
    }

    const meetsRequirements = validation.coverage.existing >= requirements.required_bots;

    res.json({
      success: meetsRequirements,
      data: {
        validation,
        requirements,
        meets_requirements: meetsRequirements,
      },
      message: meetsRequirements
        ? 'Mandatory bot coverage is sufficient'
        : `Need ${requirements.required_bots - validation.coverage.existing} more mandatory bots`,
    });
  } catch (error) {
    console.error('[SALES_BENCH] Validation error:', error);
    res.status(500).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: error.message,
    });
  }
});

export default router;
