/**
 * Production SIVA Scorer (Phase 1.5)
 *
 * CRITICAL: This module wraps the SINGLE SOURCE OF TRUTH (core-scorer.js).
 * Both production APIs and Sales-Bench MUST use this module.
 *
 * Architecture:
 * - Sales-Bench scenarios → transforms to companyProfile → calls scoreSIVA()
 * - Production discovery.js → transforms to companyProfile → calls scoreSIVA()
 * - BOTH call the SAME scoreSIVA() function from core-scorer.js
 *
 * PRD v1.2 Compliance:
 * - Law 1: Authority precedes intelligence (envelope required)
 * - Law 2: Persona is policy (tool access gated by persona)
 * - Law 5: If it cannot be replayed, it did not happen (full trace)
 */

import pool from '../../server/db.js';
import { createEnvelope } from '../envelope/factory.js';

// CRITICAL: Import the SINGLE production entrypoint
import { scoreSIVA } from './core-scorer.js';

/**
 * Get persona for a suite from database
 * Uses the get_persona_for_suite function created in migration
 */
export async function getPersonaForSuite(suiteKey) {
  const result = await pool.query(
    'SELECT * FROM get_persona_for_suite($1)',
    [suiteKey]
  );
  return result.rows[0] || null;
}

/**
 * Create a sealed envelope for SIVA invocation
 * This is the SAME envelope structure production uses
 */
export function createSalesBenchEnvelope(persona, scenario) {
  return createEnvelope({
    tenant_id: 'sales-bench',
    user_id: 'system-validation',
    persona_id: persona.persona_id,
    vertical: 'banking',
    sub_vertical: persona.sub_vertical_key,
    region: 'UAE',
    overrides: {
      allowed_tools: [
        'EdgeCasesTool',
        'CompanyQualityTool',
        'TimingScoreTool',
        'BankingProductMatchTool',
        'ContactPriorityTool',
        'OutreachDoctrineTool',
        'HiringSignalExtractionTool',
        'SignalClassifierTool',
        'MessageDraftTool',
        'DecisionChainTool',
        'SIVABrainTool',
        'FeedbackLoopTool',
      ],
    },
  });
}

/**
 * Transform Sales-Bench scenario to companyProfile format
 * that scoreSIVA() expects
 */
function transformScenarioToProfile(scenario) {
  const company = scenario.company_profile || {};
  const signals = scenario.signal_context || {};

  return {
    name: company.name || '',
    domain: company.domain || undefined,
    size: company.employees || company.headcount || 50,
    sector: mapSector(company.industry || ''),
    industry: company.industry || '',
    revenue: company.revenue || 0,
    location: company.location || '',
    license_type: company.license_type || '',
    linkedin_followers: company.linkedin_followers || 0,
    number_of_locations: company.locations?.length || 1,
  };
}

/**
 * Transform signal_context to signals array format
 */
function transformSignals(scenario) {
  const signalContext = scenario.signal_context || {};

  // If signals is already an array, use it
  if (Array.isArray(signalContext.signals)) {
    return signalContext.signals;
  }

  // Otherwise, construct from signal_context
  const signals = [];

  if (signalContext.type) {
    signals.push({
      type: signalContext.type,
      strength: signalContext.strength || 0.5,
      age_days: signalContext.age_days || 30,
    });
  }

  return signals;
}

/**
 * Score a scenario using production SIVA tools
 *
 * CRITICAL: This calls scoreSIVA() from core-scorer.js
 * This is the SAME entrypoint production uses.
 *
 * @param {Object} scenario - Scenario to score
 * @param {Object} persona - Persona from getPersonaForSuite()
 * @returns {Object} Scoring result with trace data
 */
export async function scoreWithProductionSIVA(scenario, persona) {
  // Create sealed envelope
  const envelope = createSalesBenchEnvelope(persona, scenario);

  // Transform scenario to companyProfile format
  const companyProfile = transformScenarioToProfile(scenario);
  const signals = transformSignals(scenario);

  // CRITICAL: Call the SAME scoreSIVA() that production uses
  const result = await scoreSIVA(companyProfile, envelope, {
    signals,
    latestSignalDate: scenario.signal_context?.date,
    contactProfile: scenario.contact_profile || {},
    historicalData: {},
  });

  // Augment result with scenario metadata for Sales-Bench
  return {
    ...result,
    scenario_id: scenario.id,
    path_type: scenario.path_type,
    expected_outcome: scenario.expected_outcome,
    outcome_correct: result.outcome === scenario.expected_outcome,

    // Expose trace fields at top level for easy access
    persona_id: result.trace.persona_id,
    envelope_sha256: result.trace.envelope_sha256,
    capability_key: result.trace.capability_key,
    router_decision: result.trace.router_decision,
    policy_gates_evaluated: result.trace.policy_gates_evaluated,
    policy_gates_hit: result.trace.policy_gates_hit,
    tools_allowed: result.trace.tools_allowed,
    tools_used: result.trace.tools_used,
    code_commit_sha: result.trace.code_commit_sha,
    latency_ms: result.trace.latency_ms,
  };
}

/**
 * Score a batch of scenarios
 */
export async function scoreBatchWithProductionSIVA(scenarios, persona) {
  const results = [];
  const startTime = Date.now();

  for (const scenario of scenarios) {
    const result = await scoreWithProductionSIVA(scenario, persona);
    results.push(result);
  }

  // Calculate metrics
  const goldenScenarios = results.filter(r => r.path_type === 'GOLDEN');
  const killScenarios = results.filter(r => r.path_type === 'KILL');

  const goldenPassed = goldenScenarios.filter(r => r.outcome === 'PASS' && r.outcome_correct).length;
  const killContained = killScenarios.filter(r => r.outcome === 'BLOCK' && r.outcome_correct).length;

  const goldenPassRate = goldenScenarios.length > 0
    ? (goldenPassed / goldenScenarios.length) * 100
    : 0;

  const killContainmentRate = killScenarios.length > 0
    ? (killContained / killScenarios.length) * 100
    : 0;

  return {
    results,
    metrics: {
      total_scenarios: scenarios.length,
      golden_count: goldenScenarios.length,
      kill_count: killScenarios.length,
      pass_count: results.filter(r => r.outcome === 'PASS').length,
      block_count: results.filter(r => r.outcome === 'BLOCK').length,
      error_count: results.filter(r => !r.success).length,
      golden_pass_rate: Math.round(goldenPassRate * 100) / 100,
      kill_containment_rate: Math.round(killContainmentRate * 100) / 100,
      total_latency_ms: Date.now() - startTime,
    },
  };
}

// ===========================================================================
// HELPER FUNCTIONS
// ===========================================================================

function mapSector(industry) {
  const lower = (industry || '').toLowerCase();
  if (lower.includes('government')) return 'government';
  if (lower.includes('semi-gov')) return 'semi-government';
  if (lower.includes('public')) return 'government';
  return 'private';
}

export default {
  getPersonaForSuite,
  createSalesBenchEnvelope,
  scoreWithProductionSIVA,
  scoreBatchWithProductionSIVA,
};
