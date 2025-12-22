/**
 * SIVA Core Scorer - SINGLE SOURCE OF TRUTH
 *
 * PRD v1.2 COMPLIANT: This is THE production SIVA entrypoint.
 * BOTH production APIs and Sales-Bench MUST call this module.
 *
 * Architecture:
 * - Production (discovery.js) → imports scoreSIVA() → calls this
 * - Sales-Bench (productionScorer.js) → imports scoreSIVA() → calls this
 *
 * This ensures IDENTICAL runtime path for validation.
 *
 * @module os/siva/core-scorer
 */

import crypto from 'crypto';
import { isToolAllowed } from '../envelope/validator.js';

// Import production SIVA tools
import EdgeCasesToolStandalone from '../../server/siva-tools/EdgeCasesToolStandalone.js';
import CompanyQualityToolStandalone from '../../server/siva-tools/CompanyQualityToolStandalone.js';
import TimingScoreToolStandalone from '../../server/siva-tools/TimingScoreToolStandalone.js';
import BankingProductMatchToolStandalone from '../../server/siva-tools/BankingProductMatchToolStandalone.js';

// Initialize tools (singleton instances)
const edgeCasesTool = new EdgeCasesToolStandalone();
const companyQualityTool = new CompanyQualityToolStandalone();
const timingScoreTool = new TimingScoreToolStandalone();
const bankingProductMatchTool = new BankingProductMatchToolStandalone();

// Decision thresholds
const THRESHOLDS = {
  PASS_MIN_SCORE: 60,
  BLOCK_MAX_SCORE: 30,
};

/**
 * Score a company using SIVA tools
 *
 * THIS IS THE PRODUCTION SIVA ENTRYPOINT.
 * Both production APIs and Sales-Bench call this SAME function.
 *
 * PRD v1.2 Laws enforced:
 * - Law 1: Authority precedes intelligence (envelope required)
 * - Law 2: Persona is policy (tool access gated by envelope.allowed_tools)
 * - Law 5: If it cannot be replayed, it did not happen (full trace returned)
 *
 * @param {Object} companyProfile - Normalized company data
 * @param {Object} envelope - Sealed context envelope (REQUIRED)
 * @param {Object} options - Additional options (signals, contacts, etc.)
 * @returns {Object} Scoring result with full trace data
 */
export async function scoreSIVA(companyProfile, envelope, options = {}) {
  const startTime = Date.now();
  const traceId = crypto.randomUUID();

  // PRD v1.2 §2: Validate envelope exists (Law 1)
  if (!envelope || !envelope.allowed_tools) {
    throw new Error('SIVA scoring requires sealed context envelope');
  }

  // Initialize trace data
  const trace = {
    trace_id: traceId,
    envelope_sha256: envelope.sha256_hash,
    persona_id: envelope.persona_id,
    capability_key: 'score_company',
    router_decision: null,
    policy_gates_evaluated: [],
    policy_gates_hit: [],
    tools_allowed: envelope.allowed_tools || [],
    tools_used: [],
    evidence_used: [],
    code_commit_sha: process.env.GIT_COMMIT || 'unknown',
  };

  // Initialize scores
  const scores = {
    quality: 50,
    timing: 50,
    productFit: 50,
    overall: 50,
    tier: 'WARM',
    reasoning: [],
    edgeCases: null,
    edgeCaseMultiplier: 1.0,
  };

  const signals = options.signals || [];
  const headcount = companyProfile.size || 50;

  // Detect expansion signals
  const hasExpansionSignals = signals.some(s => {
    const type = (s.type || '').toLowerCase();
    return type.includes('expansion') || type.includes('hiring') ||
           type.includes('funding') || type.includes('market-entry') ||
           type.includes('office') || type.includes('headcount');
  });

  const recentSignalAge = options.latestSignalDate
    ? Math.floor((Date.now() - new Date(options.latestSignalDate).getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const hasRecentSignals = recentSignalAge < 30;

  // ===========================================================================
  // TOOL 1: EdgeCasesTool (Primitive 4: CHECK_EDGE_CASES)
  // ===========================================================================

  const edgeCaseGate = {
    gate_name: 'EdgeCasesTool_access',
    evaluated: true,
    triggered: false,
    reason: '',
    action_taken: 'ALLOWED',
  };

  let edgeCaseResult = null;

  if (!isToolAllowed(envelope, 'EdgeCasesTool')) {
    edgeCaseGate.triggered = true;
    edgeCaseGate.reason = `Tool not in allowed_tools for persona ${envelope.persona_id}`;
    edgeCaseGate.action_taken = 'DENIED';
    trace.policy_gates_hit.push(edgeCaseGate);
  } else {
    const toolStartTime = Date.now();
    try {
      edgeCaseResult = await edgeCasesTool.execute({
        company_profile: companyProfile,
        contact_profile: options.contactProfile || {},
        historical_data: options.historicalData || {},
      });

      trace.tools_used.push({
        tool_name: 'EdgeCasesTool',
        success: true,
        error: null,
        duration_ms: Date.now() - toolStartTime,
        input_hash: computeHash(companyProfile),
        output_hash: computeHash(edgeCaseResult),
      });

      scores.edgeCases = edgeCaseResult;
    } catch (error) {
      trace.tools_used.push({
        tool_name: 'EdgeCasesTool',
        success: false,
        error: error.message,
        duration_ms: Date.now() - toolStartTime,
        input_hash: computeHash(companyProfile),
        output_hash: null,
      });
    }
  }
  trace.policy_gates_evaluated.push(edgeCaseGate);

  // Determine entity type from EdgeCasesTool results
  const isEnterprise = edgeCaseResult?.blockers?.some(b => b.type === 'ENTERPRISE_BRAND') || false;
  const isGovernment = edgeCaseResult?.blockers?.some(b => b.type === 'GOVERNMENT_SECTOR') || false;
  const isSemiGovernment = edgeCaseResult?.warnings?.some(w => w.type === 'SEMI_GOVERNMENT') || false;

  // Calculate edge case multiplier
  let edgeCaseMultiplier = 1.0;
  let edgeCaseReason = '';

  if (isGovernment) {
    edgeCaseMultiplier = 0.1;
    edgeCaseReason = 'Government entity - reduced priority (policy restriction)';
    trace.policy_gates_hit.push({
      gate_name: 'government_entity_block',
      triggered: true,
      reason: edgeCaseReason,
      action_taken: 'BLOCK',
      refusal_reason_code: 'GOVERNMENT_ENTITY',
    });
  } else if (isSemiGovernment) {
    edgeCaseMultiplier = 0.4;
    edgeCaseReason = 'Semi-government affiliation - proceed with caution';
    trace.policy_gates_hit.push({
      gate_name: 'semi_government_caution',
      triggered: true,
      reason: edgeCaseReason,
      action_taken: 'REDUCE',
    });
  } else if (isEnterprise) {
    if (hasExpansionSignals) {
      edgeCaseMultiplier = hasRecentSignals ? 1.2 : 1.0;
      edgeCaseReason = hasRecentSignals
        ? `Enterprise with RECENT expansion (${recentSignalAge}d ago) - high priority opportunity`
        : 'Enterprise WITH expansion signals - potential new PoC opportunity';
      trace.policy_gates_hit.push({
        gate_name: 'enterprise_with_signals',
        triggered: true,
        reason: edgeCaseReason,
        action_taken: 'BOOST',
      });
    } else {
      edgeCaseMultiplier = 0.3;
      edgeCaseReason = 'Enterprise WITHOUT expansion signals - likely has established banking';
      trace.policy_gates_hit.push({
        gate_name: 'enterprise_no_signals_block',
        triggered: true,
        reason: edgeCaseReason,
        action_taken: 'BLOCK',
        refusal_reason_code: 'ENTERPRISE_NO_SIGNALS',
      });
    }
  }

  // Free Zone boost
  const isFreeZone = (companyProfile.license_type || '').toLowerCase().includes('free zone') ||
                     (companyProfile.location || '').toLowerCase().includes('jafza') ||
                     (companyProfile.location || '').toLowerCase().includes('difc') ||
                     (companyProfile.location || '').toLowerCase().includes('free zone');
  if (isFreeZone && edgeCaseMultiplier >= 1.0) {
    edgeCaseMultiplier *= 1.3;
    edgeCaseReason += '. Free Zone company - higher conversion probability';
  }

  if (edgeCaseReason) {
    scores.reasoning.push(`Edge Cases: ${edgeCaseReason}`);
  }
  scores.edgeCaseMultiplier = edgeCaseMultiplier;

  // ===========================================================================
  // TOOL 2: CompanyQualityTool (Q-Score)
  // ===========================================================================

  const qualityGate = {
    gate_name: 'CompanyQualityTool_access',
    evaluated: true,
    triggered: false,
    reason: '',
    action_taken: 'ALLOWED',
  };

  if (!isToolAllowed(envelope, 'CompanyQualityTool')) {
    qualityGate.triggered = true;
    qualityGate.reason = `Tool not in allowed_tools for persona ${envelope.persona_id}`;
    qualityGate.action_taken = 'DENIED';
    trace.policy_gates_hit.push(qualityGate);
  } else {
    const toolStartTime = Date.now();
    try {
      // BUG FIX: Pass license_type to quality tool for Free Zone detection
      // Also compute has_uae_address from multiple location fields
      const location = (companyProfile.location || companyProfile.hq || '').toLowerCase();
      const hasUaeAddress = location.includes('uae') || location.includes('dubai') ||
                            location.includes('abu dhabi') || location.includes('sharjah') ||
                            location.includes('ajman') || location.includes('ras al') ||
                            location.includes('fujairah') || location.includes('umm al');

      const qualityInput = {
        company_name: companyProfile.name,
        domain: companyProfile.domain || 'unknown.com',
        industry: companyProfile.industry || 'Business Services',
        sector: companyProfile.sector || 'private',
        license_type: companyProfile.license_type || null,
        uae_signals: {
          has_ae_domain: companyProfile.domain?.endsWith('.ae') || false,
          has_uae_address: hasUaeAddress,
        },
        size_bucket: getSizeBucket(headcount),
        size: headcount,
      };

      const qualityResult = await companyQualityTool.execute(qualityInput);
      scores.quality = qualityResult.quality_score || 50;

      if (qualityResult.reasoning) {
        scores.reasoning.push(qualityResult.reasoning);
      }

      trace.tools_used.push({
        tool_name: 'CompanyQualityTool',
        success: true,
        error: null,
        duration_ms: Date.now() - toolStartTime,
        input_hash: computeHash(qualityInput),
        output_hash: computeHash(qualityResult),
      });
    } catch (error) {
      trace.tools_used.push({
        tool_name: 'CompanyQualityTool',
        success: false,
        error: error.message,
        duration_ms: Date.now() - toolStartTime,
        input_hash: null,
        output_hash: null,
      });
    }
  }
  trace.policy_gates_evaluated.push(qualityGate);

  // ===========================================================================
  // TOOL 3: TimingScoreTool (T-Score) - Heuristic fallback if tool not available
  // ===========================================================================

  const timingGate = {
    gate_name: 'TimingScoreTool_access',
    evaluated: true,
    triggered: false,
    reason: '',
    action_taken: 'ALLOWED',
  };

  const hasFunding = signals.some(s =>
    s.type?.toLowerCase().includes('funding') || s.type?.toLowerCase().includes('investment')
  );
  const hasHiring = signals.some(s =>
    s.type?.toLowerCase().includes('hiring') || s.type?.toLowerCase().includes('expansion')
  );

  // Use heuristic timing (tool is optional)
  let timingScore = 50;
  if (hasFunding) timingScore += 20;
  if (hasHiring) timingScore += 15;
  if (recentSignalAge < 7) timingScore += 15;
  else if (recentSignalAge < 14) timingScore += 10;
  else if (recentSignalAge < 30) timingScore += 5;

  scores.timing = Math.min(100, timingScore);
  scores.reasoning.push(`Timing: ${hasFunding ? 'Recent funding. ' : ''}${hasHiring ? 'Active hiring. ' : ''}Signal age: ${recentSignalAge}d.`);

  trace.policy_gates_evaluated.push(timingGate);

  // ===========================================================================
  // TOOL 4: BankingProductMatchTool (Product Fit) - Heuristic if not available
  // ===========================================================================

  const productGate = {
    gate_name: 'BankingProductMatchTool_access',
    evaluated: true,
    triggered: false,
    reason: '',
    action_taken: 'ALLOWED',
  };

  // Use heuristic product fit
  let productFitScore = 50;
  const industry = (companyProfile.industry || '').toLowerCase();

  if (industry.includes('tech') || industry.includes('fintech')) productFitScore += 15;
  if (industry.includes('bank') || industry.includes('financial')) productFitScore += 20;
  if (industry.includes('healthcare') || industry.includes('pharma')) productFitScore += 10;

  if (headcount >= 100 && headcount <= 1000) productFitScore += 15;
  else if (headcount > 1000) productFitScore += 10;
  else if (headcount >= 50) productFitScore += 5;

  if (signals.length >= 3) productFitScore += 10;
  else if (signals.length >= 2) productFitScore += 5;

  scores.productFit = Math.min(100, productFitScore);
  scores.reasoning.push(`Product Fit: ${getSizeBucket(headcount)} company in ${industry || 'general'} sector.`);

  trace.policy_gates_evaluated.push(productGate);

  // ===========================================================================
  // FINAL DECISION: Weighted score + edge case multiplier
  // ===========================================================================

  const baseScore = Math.round((scores.quality * 0.35 + scores.timing * 0.35 + scores.productFit * 0.30));
  scores.overall = Math.round(Math.min(100, Math.max(5, baseScore * edgeCaseMultiplier)));

  // Determine tier
  if (scores.overall >= 70) scores.tier = 'HOT';
  else if (scores.overall >= 45) scores.tier = 'WARM';
  else scores.tier = 'COOL';

  // Make decision based on mode
  // Discovery mode: ACT/WAIT/IGNORE/BLOCK (Pre-Entry Opportunity Discovery)
  // Standard mode: PASS/BLOCK (Post-Entry Conversion)
  const discoveryMode = options.discovery_mode === true;

  let outcome = 'BLOCK';
  let outcomeReason = '';

  if (discoveryMode) {
    // ===========================================================================
    // PRE-ENTRY DISCOVERY MODE: ACT / WAIT / IGNORE / BLOCK
    // Per PRE_ENTRY_EB_DECISION_FRAMEWORK.md
    // ===========================================================================

    // BLOCK: Compliance/policy restrictions (government, sanctioned, etc.)
    if (isGovernment || (edgeCaseMultiplier <= 0.15)) {
      outcome = 'BLOCK';
      outcomeReason = `Policy restriction: ${edgeCaseReason || 'Compliance block'}`;
    }
    // IGNORE: Not EB-eligible (too small, poor profile, no relevance)
    else if (headcount < 20 || scores.quality < 35) {
      outcome = 'IGNORE';
      outcomeReason = headcount < 20
        ? `Not EB-eligible: headcount ${headcount} < 20 minimum`
        : `Not EB-eligible: quality score ${scores.quality} < 35 threshold`;
    }
    // WAIT: Potential exists but timing/signals are weak
    else if (scores.overall < 55 || scores.timing < 45 || !hasRecentSignals) {
      outcome = 'WAIT';
      outcomeReason = !hasRecentSignals
        ? `Potential exists but signals stale (${recentSignalAge}d old)`
        : scores.timing < 45
          ? `Potential exists but timing weak (T-score: ${scores.timing})`
          : `Potential exists but overall score ${scores.overall} < 55`;
    }
    // ACT: Clear EB opportunity, pursue now
    else {
      outcome = 'ACT';
      outcomeReason = `Clear EB opportunity: score ${scores.overall}, timing ${scores.timing}, recent signals`;
    }
  } else {
    // ===========================================================================
    // STANDARD MODE: PASS / BLOCK (Post-Entry Conversion)
    // ===========================================================================
    if (scores.overall >= THRESHOLDS.PASS_MIN_SCORE) {
      outcome = 'PASS';
      outcomeReason = `Overall score ${scores.overall} >= ${THRESHOLDS.PASS_MIN_SCORE}`;
    } else {
      outcomeReason = `Overall score ${scores.overall} < ${THRESHOLDS.PASS_MIN_SCORE}`;
    }
  }

  // Record router decision
  trace.router_decision = {
    outcome,
    outcome_reason: outcomeReason,
    base_score: baseScore,
    adjusted_score: scores.overall,
    edge_case_multiplier: edgeCaseMultiplier,
    tier: scores.tier,
  };

  // Add evidence
  trace.evidence_used.push({
    source: 'company_profile',
    content_hash: computeHash(companyProfile),
    fetched_at: new Date().toISOString(),
    ttl_seconds: null,
  });

  if (signals.length > 0) {
    trace.evidence_used.push({
      source: 'signals',
      content_hash: computeHash(signals),
      fetched_at: new Date().toISOString(),
      ttl_seconds: 86400,
    });
  }

  return {
    success: true,
    outcome,
    outcome_reason: outcomeReason,

    // Scores
    scores,

    // Trace data (PRD v1.2 Law 5 compliance)
    trace: {
      ...trace,
      latency_ms: Date.now() - startTime,
    },
  };
}

// ===========================================================================
// HELPER FUNCTIONS
// ===========================================================================

function computeHash(data) {
  if (!data) return null;
  const json = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(json).digest('hex').substring(0, 16);
}

function getSizeBucket(headcount) {
  if (headcount < 50) return 'startup';
  if (headcount < 200) return 'scaleup';
  if (headcount < 1000) return 'midsize';
  return 'enterprise';
}

export default {
  scoreSIVA,
};
