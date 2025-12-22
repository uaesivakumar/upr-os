/**
 * Silent Shadow Mode Validator
 *
 * PURPOSE: Observe SIVA discovery behavior on real company signals.
 * NO ACTION TAKEN. Log only.
 *
 * DISCOVERY_V1_FROZEN baseline:
 * - No threshold changes
 * - No logic modifications
 * - No outreach automation
 * - No notifications
 *
 * This answers: "What does SIVA naturally notice when left alone?"
 */

import pool from '../../../server/db.js';
import { scoreSIVA } from '../../siva/core-scorer.js';
import { createEnvelope } from '../../envelope/factory.js';
import crypto from 'crypto';

// EB persona for discovery
const EB_PERSONA_ID = 'ebf50a00-0001-4000-8000-000000000001';

/**
 * Create shadow envelope for discovery scoring
 */
function createShadowEnvelope() {
  return createEnvelope({
    tenant_id: 'shadow-mode',
    user_id: 'silent-validator',
    persona_id: EB_PERSONA_ID,
    vertical: 'banking',
    sub_vertical: 'employee_banking',
    region: 'UAE',
    overrides: {
      allowed_tools: [
        'EdgeCasesTool',
        'CompanyQualityTool',
        'TimingScoreTool',
        'BankingProductMatchTool',
      ],
    },
  });
}

/**
 * Run shadow discovery on a company profile
 *
 * @param {Object} company - Company data with signals
 * @returns {Object} Shadow decision (logged, not acted upon)
 */
export async function runShadowDiscovery(company) {
  const shadowId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  try {
    // Create envelope
    const envelope = createShadowEnvelope();

    // Prepare company profile
    const companyProfile = {
      name: company.name,
      domain: company.domain,
      size: company.employees || company.headcount,
      sector: company.sector || 'private',
      industry: company.industry,
      location: company.location,
      license_type: company.license_type,
    };

    // Prepare signals
    const signals = (company.signals || []).map(s => ({
      type: s.type,
      strength: s.strength || 0.5,
      age_days: s.age_days || 30,
    }));

    // Compute latest signal date
    const minAgeDays = signals.length > 0
      ? Math.min(...signals.map(s => s.age_days))
      : 999;
    const latestSignalDate = minAgeDays < 999
      ? new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Run SIVA discovery (same as production)
    const result = await scoreSIVA(companyProfile, envelope, {
      signals,
      latestSignalDate,
      discovery_mode: true, // CRITICAL: Use discovery mode
    });

    // Build shadow decision record
    const shadowDecision = {
      shadow_id: shadowId,
      timestamp,
      company_name: company.name,
      company_industry: company.industry,
      company_size: company.employees || company.headcount,
      company_location: company.location,
      signals: signals,
      decision: result.outcome, // ACT / WAIT / IGNORE / BLOCK
      decision_reason: result.outcome_reason,
      scores: {
        quality: result.scores.quality,
        timing: result.scores.timing,
        productFit: result.scores.productFit,
        overall: result.scores.overall,
      },
      tier: result.scores.tier,
      trace: {
        envelope_sha256: result.trace.envelope_sha256,
        tools_used: result.trace.tools_used.map(t => t.tool_name),
        policy_gates_hit: result.trace.policy_gates_hit,
        latency_ms: result.trace.latency_ms,
      },
    };

    // Log to database (silent - no action)
    await logShadowDecision(shadowDecision);

    return shadowDecision;

  } catch (error) {
    console.error(`[SHADOW] Error processing ${company.name}:`, error.message);
    return {
      shadow_id: shadowId,
      timestamp,
      company_name: company.name,
      decision: 'ERROR',
      decision_reason: error.message,
      error: true,
    };
  }
}

/**
 * Log shadow decision to database
 * SILENT: No outreach, no notifications, no automation
 */
async function logShadowDecision(decision) {
  await pool.query(`
    INSERT INTO sales_bench_shadow_decisions (
      shadow_id, timestamp, company_name, company_industry, company_size,
      company_location, signals, decision, decision_reason, scores,
      tier, trace
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [
    decision.shadow_id,
    decision.timestamp,
    decision.company_name,
    decision.company_industry,
    decision.company_size,
    decision.company_location,
    JSON.stringify(decision.signals),
    decision.decision,
    decision.decision_reason,
    JSON.stringify(decision.scores),
    decision.tier,
    JSON.stringify(decision.trace),
  ]);

  console.log(`[SHADOW] Logged: ${decision.company_name} → ${decision.decision}`);
}

/**
 * Run shadow validation on a batch of companies
 * For scheduled/manual execution
 */
export async function runShadowBatch(companies) {
  console.log(`[SHADOW] Starting batch of ${companies.length} companies...`);

  const results = {
    ACT: [],
    WAIT: [],
    IGNORE: [],
    BLOCK: [],
    ERROR: [],
  };

  for (const company of companies) {
    const decision = await runShadowDiscovery(company);
    results[decision.decision].push(decision);
  }

  console.log(`[SHADOW] Batch complete: ACT=${results.ACT.length}, WAIT=${results.WAIT.length}, IGNORE=${results.IGNORE.length}, BLOCK=${results.BLOCK.length}`);

  return results;
}

export default {
  runShadowDiscovery,
  runShadowBatch,
};
