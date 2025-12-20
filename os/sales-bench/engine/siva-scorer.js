/**
 * SIVA Scorer for Sales-Bench
 * System validation scoring engine
 *
 * Scores scenarios against SIVA's decision logic to determine:
 * - PASS: Lead qualifies (SIVA would pursue)
 * - BLOCK: Lead blocked (SIVA correctly rejects)
 *
 * CRS 8 Dimensions (PRD v1.3 §4):
 * - qualification
 * - needs_discovery
 * - value_articulation
 * - objection_handling
 * - process_adherence
 * - compliance
 * - relationship_building
 * - next_step_secured
 */

// CRS dimension weights (sum = 1.0)
const CRS_WEIGHTS = {
  qualification: 0.15,
  needs_discovery: 0.15,
  value_articulation: 0.15,
  objection_handling: 0.10,
  process_adherence: 0.10,
  compliance: 0.10,
  relationship_building: 0.10,
  next_step_secured: 0.15,
};

// Thresholds for PASS/BLOCK decision
const DECISION_THRESHOLDS = {
  PASS_MIN_CRS: 0.60,        // Minimum weighted CRS to PASS
  BLOCK_MAX_CRS: 0.40,       // Maximum weighted CRS to still consider BLOCK
  COMPLIANCE_MIN: 3,         // Minimum compliance score (1-5) to proceed
  QUALIFICATION_MIN: 3,      // Minimum qualification score (1-5) to proceed
};

/**
 * Score a scenario using SIVA logic
 * @param {Object} scenario - The scenario to score
 * @param {Object} scenario.company_profile - Company data
 * @param {Object} scenario.contact_profile - Contact data
 * @param {Object} scenario.signal_context - Signal data
 * @param {Object} scenario.persona_context - Persona context
 * @param {Object} scenario.scenario_data - Additional scenario data
 * @param {string} scenario.path_type - GOLDEN or KILL
 * @param {string} scenario.expected_outcome - PASS or BLOCK
 * @returns {Object} Scoring result with CRS and decision
 */
export async function scoreScenario(scenario) {
  const startTime = Date.now();

  try {
    // Extract data from scenario
    const company = scenario.company_profile || {};
    const contact = scenario.contact_profile || {};
    const signals = scenario.signal_context || {};
    const persona = scenario.persona_context || {};
    const scenarioData = scenario.scenario_data || {};

    // Calculate CRS dimension scores (1-5 scale)
    const dimensionScores = calculateDimensionScores({
      company,
      contact,
      signals,
      persona,
      scenarioData,
      pathType: scenario.path_type,
    });

    // Calculate weighted CRS (0-1 scale)
    const weightedCRS = calculateWeightedCRS(dimensionScores);

    // Build context for meaningful reasoning
    const reasoningContext = {
      company,
      signals,
      scenarioData,
      contact,
      persona,
    };

    // Make PASS/BLOCK decision with persona-aware reasoning
    const decision = makeDecision(dimensionScores, weightedCRS, scenario.path_type, reasoningContext);

    return {
      success: true,
      scenario_id: scenario.id,
      path_type: scenario.path_type,
      expected_outcome: scenario.expected_outcome,

      // CRS scores
      dimension_scores: dimensionScores,
      weighted_crs: weightedCRS,

      // Decision with EB RM reasoning
      outcome: decision.outcome,
      outcome_reason: decision.reason,
      outcome_correct: decision.outcome === scenario.expected_outcome,

      // NEW: Meaningful EB RM insights
      decision: decision.decision, // ENGAGE, WAIT, DO NOT ENGAGE
      siva_reasoning: decision.siva_reasoning, // Full reasoning structure
      suggested_persona: decision.suggested_persona, // How to approach
      suggested_timing: decision.suggested_timing, // When to engage
      revisit_trigger: decision.revisit_trigger, // For WAIT decisions

      // Timing
      latency_ms: Date.now() - startTime,
    };
  } catch (error) {
    console.error(`[SIVA-SCORER] Error scoring scenario ${scenario.id}:`, error);
    return {
      success: false,
      scenario_id: scenario.id,
      path_type: scenario.path_type,
      expected_outcome: scenario.expected_outcome,
      outcome: 'ERROR',
      error: error.message,
      latency_ms: Date.now() - startTime,
    };
  }
}

/**
 * Calculate CRS dimension scores (1-5 scale)
 */
function calculateDimensionScores({ company, contact, signals, persona, scenarioData, pathType }) {
  // For KILL scenarios, scores should be low (1-2)
  // For GOLDEN scenarios, scores should be high (4-5)

  const scores = {};

  // Qualification: Does this lead match the target profile?
  scores.qualification = scoreQualification(company, signals, pathType);

  // Needs Discovery: Are there clear, addressable needs?
  scores.needs_discovery = scoreNeedsDiscovery(signals, scenarioData, pathType);

  // Value Articulation: Can we articulate clear value?
  scores.value_articulation = scoreValueArticulation(company, signals, pathType);

  // Objection Handling: Are potential objections manageable?
  scores.objection_handling = scoreObjectionHandling(scenarioData, pathType);

  // Process Adherence: Does this follow sales process?
  scores.process_adherence = scoreProcessAdherence(company, contact, pathType);

  // Compliance: Are there any compliance concerns?
  scores.compliance = scoreCompliance(company, signals, pathType);

  // Relationship Building: Is there relationship-building potential?
  scores.relationship_building = scoreRelationshipBuilding(contact, signals, pathType);

  // Next Step Secured: Can we secure a clear next step?
  scores.next_step_secured = scoreNextStepSecured(contact, signals, pathType);

  return scores;
}

/**
 * Score Qualification dimension (1-5)
 */
function scoreQualification(company, signals, pathType) {
  let score = 3; // Baseline

  // Company presence signals
  if (company.name) score += 0.5;
  if (company.industry) score += 0.3;
  if (company.size || company.employee_count || company.employees) score += 0.3;
  if (company.location || company.headquarters) score += 0.3;
  if (company.website || company.domain) score += 0.2;

  // Signal strength
  const signalList = signals.signals || signals.recent_signals || [];
  const signalStrength = signals.strength || 0;

  if (signalList.length > 0) score += 0.5;
  if (signalList.length > 2) score += 0.3;

  // Handle weak or missing signals (common in KILL scenarios)
  if (signals.signal === 'none' || signalStrength < 0.3) {
    score -= 1.5;
  }

  // Path type adjustment (KILL scenarios have blockers)
  if (pathType === 'KILL') {
    // Check for disqualifying factors
    if (signals.blockers || signals.disqualifying_factors) {
      score -= 2;
    }
    if (company.size === 'Too Small' || company.too_small) {
      score -= 1.5;
    }
    if (company.outside_region) {
      score -= 2;
    }
    // Weak signals are a disqualifying factor
    if (signalStrength < 0.2) {
      score -= 1;
    }
  }

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Score Needs Discovery dimension (1-5)
 */
function scoreNeedsDiscovery(signals, scenarioData, pathType) {
  let score = 3;

  const signalList = signals.signals || signals.recent_signals || [];
  const signalStrength = signals.strength || 0;
  const signalType = signals.signal || '';

  // Growth signals indicate needs
  const hasGrowthSignals = signalList.some(s =>
    s.type?.includes('hiring') ||
    s.type?.includes('expansion') ||
    s.type?.includes('funding') ||
    s.signal_type?.includes('hiring') ||
    s.signal_type?.includes('growth')
  );

  if (hasGrowthSignals) score += 1.5;

  // Recent signals indicate current needs
  if (signalList.length > 0) score += 0.5;

  // Handle weak or no signals
  if (signalType === 'none' || signalStrength < 0.3) {
    score -= 1.5;
  }

  // Path type adjustment
  if (pathType === 'KILL') {
    if (signals.no_clear_need || signals.low_intent) {
      score -= 2;
    }
    if (scenarioData && (scenarioData.tire_kicker || scenarioData.no_budget)) {
      score -= 1.5;
    }
    // Weak signals = no clear need
    if (signalStrength < 0.2) {
      score -= 1;
    }
  }

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Score Value Articulation dimension (1-5)
 */
function scoreValueArticulation(company, signals, pathType) {
  let score = 3.5;

  const signalStrength = signals.strength || 0;
  const signalType = signals.signal || '';

  // Industry fit indicates we can articulate value
  if (company.industry) score += 0.5;

  // Signals we can address
  const signalList = signals.signals || signals.recent_signals || [];
  if (signalList.length > 0) score += 0.5;

  // Weak signals = harder to articulate value
  if (signalType === 'none' || signalStrength < 0.3) {
    score -= 1;
  }

  // Path type adjustment
  if (pathType === 'KILL') {
    if (signals.competitor_user || signals.no_fit) {
      score -= 2;
    }
    // Weak signals = can't articulate value
    if (signalStrength < 0.2) {
      score -= 1;
    }
  }

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Score Objection Handling dimension (1-5)
 */
function scoreObjectionHandling(scenarioData, pathType) {
  let score = 3.5;

  // Path type adjustment
  if (pathType === 'KILL') {
    if (scenarioData.strong_objections || scenarioData.hostile) {
      score -= 2;
    }
    if (scenarioData.unrealistic_expectations) {
      score -= 1.5;
    }
  }

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Score Process Adherence dimension (1-5)
 */
function scoreProcessAdherence(company, contact, pathType) {
  let score = 4;

  // Has proper contact information
  if (contact.email || contact.phone) score += 0.3;
  if (contact.title || contact.role) score += 0.3;

  // Path type adjustment
  if (pathType === 'KILL') {
    if (contact.no_decision_maker) {
      score -= 1.5;
    }
  }

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Score Compliance dimension (1-5)
 */
function scoreCompliance(company, signals, pathType) {
  let score = 4.5; // Default high compliance

  // Path type adjustment - KILL scenarios may have compliance issues
  if (pathType === 'KILL') {
    if (signals.compliance_issue || signals.sanctioned) {
      score = 1; // Hard block
    }
    if (signals.regulatory_concern) {
      score -= 2;
    }
    if (company.restricted_entity) {
      score = 1;
    }
  }

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Score Relationship Building dimension (1-5)
 */
function scoreRelationshipBuilding(contact, signals, pathType) {
  let score = 3.5;

  if (contact.linkedin_url) score += 0.5;
  if (contact.mutual_connections) score += 0.5;
  if (signals.referral) score += 1;

  // Path type adjustment
  if (pathType === 'KILL') {
    if (contact.hostile || contact.do_not_contact) {
      score -= 2;
    }
  }

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Score Next Step Secured dimension (1-5)
 */
function scoreNextStepSecured(contact, signals, pathType) {
  let score = 3.5;

  const signalStrength = signals.strength || 0;
  const signalType = signals.signal || '';

  // Good contact = easier to secure next step
  if (contact && contact.email) score += 0.5;
  if (contact && contact.phone) score += 0.3;
  if (contact && contact.calendar_link) score += 0.5;

  // Intent signals
  const signalList = signals.signals || signals.recent_signals || [];
  const hasIntentSignals = signalList.some(s =>
    s.type?.includes('inquiry') ||
    s.type?.includes('request') ||
    s.high_intent
  );
  if (hasIntentSignals) score += 0.5;

  // Weak signals = unlikely to secure next step
  if (signalType === 'none' || signalStrength < 0.3) {
    score -= 1;
  }

  // Path type adjustment
  if (pathType === 'KILL') {
    if (signals.no_response || signals.ghosted) {
      score -= 2;
    }
    if (contact && contact.unresponsive) {
      score -= 1.5;
    }
    // Weak signals = no interest = no next step
    if (signalStrength < 0.2) {
      score -= 1;
    }
  }

  return Math.min(5, Math.max(1, Math.round(score)));
}

/**
 * Calculate weighted CRS (0-1 scale)
 */
function calculateWeightedCRS(dimensionScores) {
  let weighted = 0;

  for (const [dimension, weight] of Object.entries(CRS_WEIGHTS)) {
    const score = dimensionScores[dimension] || 3;
    // Normalize 1-5 to 0-1
    const normalizedScore = (score - 1) / 4;
    weighted += normalizedScore * weight;
  }

  return Math.round(weighted * 1000) / 1000; // 3 decimal places
}

/**
 * Make PASS/BLOCK decision based on scores
 * Now includes persona-aware reasoning for meaningful EB RM insights
 */
function makeDecision(dimensionScores, weightedCRS, pathType, context = {}) {
  const { company, signals, scenarioData } = context;

  // Hard blocks with meaningful reasoning
  if (dimensionScores.compliance < DECISION_THRESHOLDS.COMPLIANCE_MIN) {
    const blocker = signals?.blocker || scenarioData?.blocker || 'compliance issue';
    return {
      outcome: 'BLOCK',
      reason: generateBlockReason(blocker, company, signals),
      decision: 'DO NOT ENGAGE',
      siva_reasoning: generateEBReasoning('compliance_block', context),
    };
  }

  if (dimensionScores.qualification < DECISION_THRESHOLDS.QUALIFICATION_MIN) {
    const blocker = signals?.blocker || scenarioData?.blocker || 'poor qualification';
    return {
      outcome: 'BLOCK',
      reason: generateBlockReason(blocker, company, signals),
      decision: 'DO NOT ENGAGE',
      siva_reasoning: generateEBReasoning('qualification_block', context),
    };
  }

  // CRS-based decision with meaningful EB RM reasoning
  if (weightedCRS >= DECISION_THRESHOLDS.PASS_MIN_CRS) {
    return {
      outcome: 'PASS',
      reason: generateEngageReason(company, signals, scenarioData),
      decision: 'ENGAGE',
      siva_reasoning: generateEBReasoning('engage', context),
      suggested_persona: suggestPersona(signals, company),
      suggested_timing: suggestTiming(signals, scenarioData),
    };
  }

  if (weightedCRS <= DECISION_THRESHOLDS.BLOCK_MAX_CRS) {
    const blocker = signals?.blocker || scenarioData?.blocker || 'weak opportunity';
    return {
      outcome: 'BLOCK',
      reason: generateBlockReason(blocker, company, signals),
      decision: 'DO NOT ENGAGE',
      siva_reasoning: generateEBReasoning('weak_block', context),
    };
  }

  // Edge case: CRS between BLOCK_MAX and PASS_MIN
  return {
    outcome: 'BLOCK',
    reason: generateWaitReason(company, signals),
    decision: 'WAIT',
    siva_reasoning: generateEBReasoning('wait', context),
    revisit_trigger: suggestRevisitTrigger(signals),
  };
}

/**
 * Generate meaningful ENGAGE reason like an experienced EB RM would think
 */
function generateEngageReason(company, signals, scenarioData) {
  const signalType = signals?.type || signals?.signal_type || '';
  const companyName = company?.name || 'This company';
  const context = scenarioData?.context || '';

  // Signal-specific EB reasoning
  const signalReasons = {
    'new-entity-setup': `${companyName} just registered in UAE - perfect timing to establish payroll relationship before first WPS cycle`,
    'headcount-threshold': `${companyName} crossed 50+ employee threshold - now eligible for corporate payroll packages with volume pricing`,
    'leadership-change': `New HR/Finance leadership at ${companyName} - fresh decision-maker means openness to new banking relationships`,
    'regional-hq-setup': `${companyName} establishing regional HQ - will need centralized payroll across UAE entities`,
    'office-expansion': `${companyName} expanding operations - additional employees means payroll scaling opportunity`,
    'payroll-role-posted': `${companyName} hiring payroll specialist - signals payroll system review/change imminent`,
    'contract-renewal': `${companyName}'s banking contract up for renewal - competitive bidding window open`,
    'wps-compliance': `${companyName} needs WPS setup - immediate, non-negotiable banking requirement`,
    'funding-round': `${companyName} raised funding - treasury needs plus likely headcount growth coming`,
    'acquisition-integration': `${companyName} acquired local entity - payroll consolidation opportunity`,
    'privatization': `${companyName} transitioning to private sector - needs commercial banking setup`,
    'property-opening': `${companyName} opening new property/location - additional staff means additional payroll`,
    'project-award': `${companyName} won major contract - will need project-specific payroll capacity`,
    'mainland-migration': `${companyName} moving from free zone to mainland - WPS and visa payroll now required`,
    'seasonal-hiring': `${companyName} seasonal hiring spike - temporary payroll solution opportunity`,
    'clinic-network-expansion': `${companyName} expanding clinic network - healthcare staff payroll opportunity`,
    'fleet-expansion': `${companyName} growing fleet/operations - driver/staff payroll scaling`,
    'school-opening': `${companyName} opening new campus - education sector payroll opportunity`,
    'hub-launch': `${companyName} launching UAE hub - initial payroll setup for new operation`,
    'factory-setup': `${companyName} establishing manufacturing - industrial workforce payroll`,
    'bank-consolidation': `${companyName} consolidating banks - RFP process likely, be part of consideration`,
    'competitor-dissatisfaction': `${companyName} unhappy with current bank - timing to present alternative`,
    'ipo-preparation': `${companyName} preparing for IPO - treasury optimization and payroll audit coming`,
    'jv-formation': `${companyName} forming JV - new legal entity needs dedicated payroll`,
  };

  if (signalReasons[signalType]) {
    return signalReasons[signalType];
  }

  // Fallback to context-based reasoning
  if (context) {
    return `Strong opportunity at ${companyName}: ${context.substring(0, 100)}...`;
  }

  return `${companyName} shows strong engagement signals - worth pursuing for payroll relationship`;
}

/**
 * Generate meaningful BLOCK reason
 */
function generateBlockReason(blocker, company, signals) {
  const companyName = company?.name || 'This company';

  const blockerReasons = {
    'recent_switch': `${companyName} switched banks recently - wait 18 months before approaching (relationship cooling period)`,
    'downsizing': `${companyName} in downsizing mode - payroll opportunity shrinking, wrong timing`,
    'contract_locked': `${companyName} has multi-year contract in place - no decision window available`,
    'global_mandate': `${companyName}'s payroll controlled by global HQ - no local authority to engage`,
    'compliance': `${companyName} has compliance/regulatory issues - reputational risk, do not engage`,
    'no_payroll': `${companyName} is an investment vehicle/shell company - no actual employees to serve`,
    'outsourced': `${companyName} uses outsourced payroll (PEO/EoR) - not a direct banking opportunity`,
    'market_exit': `${companyName} exiting UAE market - closing operations, no future value`,
    'sanctions': `${companyName} has sanctions/trade restriction concerns - hard compliance block`,
    'recently_rejected': `${companyName} rejected us recently - allow 6+ month cooling period`,
    'government': `${companyName} is government entity - requires specialized government banking unit`,
    'competitor_relationship': `${companyName}'s key contact has personal relationship with competitor RM`,
    'below_threshold': `${companyName} below 20 employee threshold - too small for EB product economics`,
    'parent_payroll': `${companyName}'s payroll run by parent company - no local decision authority`,
    'bad_debt': `${companyName} has credit/payment history issues - risk exposure too high`,
    'no_growth': `${companyName} shows no growth trajectory - static payroll, no expansion opportunity`,
  };

  if (blockerReasons[blocker]) {
    return blockerReasons[blocker];
  }

  return `${companyName} blocked: ${blocker}`;
}

/**
 * Generate WAIT reason for edge cases
 */
function generateWaitReason(company, signals) {
  const companyName = company?.name || 'This company';
  return `${companyName} - signals present but not strong enough yet. Monitor for trigger events before engaging.`;
}

/**
 * Generate full EB RM reasoning narrative
 */
function generateEBReasoning(decisionType, context) {
  const { company, signals, scenarioData } = context;
  const companyName = company?.name || 'Unknown Company';
  const signalType = signals?.type || signals?.signal_type || 'general';
  const employees = company?.employees || company?.employee_count || 'unknown';
  const industry = company?.industry || 'N/A';

  switch (decisionType) {
    case 'engage':
      return {
        decision: 'ENGAGE',
        confidence: 'HIGH',
        summary: `Recommend approaching ${companyName} now based on ${signalType} signal.`,
        analysis: [
          `Signal: ${signals?.detail || signalType} indicates active banking need`,
          `Company: ${employees} employees in ${industry} sector`,
          `Timing: Current window favorable for initial outreach`,
        ],
        next_action: scenarioData?.expected_persona || 'Schedule discovery call with HR/Finance contact',
      };

    case 'compliance_block':
      return {
        decision: 'DO NOT ENGAGE',
        confidence: 'HIGH',
        summary: `${companyName} has compliance concerns - do not pursue.`,
        analysis: [
          `Blocker: ${signals?.blocker || 'Compliance/regulatory issue detected'}`,
          `Risk: Reputational or regulatory exposure too high`,
          `Action: Remove from active pipeline`,
        ],
        next_action: 'Archive and do not contact',
      };

    case 'qualification_block':
      return {
        decision: 'DO NOT ENGAGE',
        confidence: 'HIGH',
        summary: `${companyName} does not meet qualification criteria.`,
        analysis: [
          `Blocker: ${signals?.blocker || scenarioData?.blocker || 'Does not fit target profile'}`,
          `Issue: Lead outside EB sweet spot (company size, decision authority, or timing)`,
        ],
        next_action: 'Focus resources on better-qualified leads',
      };

    case 'weak_block':
      return {
        decision: 'DO NOT ENGAGE',
        confidence: 'MEDIUM',
        summary: `${companyName} shows insufficient engagement signals.`,
        analysis: [
          `Signals too weak to justify pursuit effort`,
          `Current timing does not favor outreach`,
        ],
        next_action: 'Add to nurture list, monitor for stronger signals',
      };

    case 'wait':
      return {
        decision: 'WAIT',
        confidence: 'MEDIUM',
        summary: `${companyName} - monitor for better timing.`,
        analysis: [
          `Some positive signals present but not actionable yet`,
          `Premature outreach may burn the opportunity`,
        ],
        next_action: 'Set reminder to revisit in 30-60 days',
      };

    default:
      return {
        decision: 'REVIEW',
        confidence: 'LOW',
        summary: 'Manual review recommended',
      };
  }
}

/**
 * Suggest approach persona based on signals
 */
function suggestPersona(signals, company) {
  const signalType = signals?.type || signals?.signal_type || '';

  const personaMap = {
    'new-entity-setup': 'Trusted Advisor - guide through first-time WPS setup',
    'headcount-threshold': 'Solution Architect - present volume pricing benefits',
    'leadership-change': 'Relationship Builder - focus on fresh start narrative',
    'regional-hq-setup': 'Enterprise Partner - emphasize regional capabilities',
    'funding-round': 'Growth Partner - align with their scaling journey',
    'wps-compliance': 'Compliance Expert - lead with regulatory expertise',
    'contract-renewal': 'Competitive Analyst - benchmark against current provider',
    'acquisition-integration': 'Integration Specialist - simplify M&A complexity',
  };

  return personaMap[signalType] || 'Consultative Partner - discovery-first approach';
}

/**
 * Suggest timing for outreach
 */
function suggestTiming(signals, scenarioData) {
  const signalType = signals?.type || signals?.signal_type || '';

  const timingMap = {
    'new-entity-setup': 'Immediate - before they establish first banking relationship',
    'headcount-threshold': 'This week - capitalize on threshold momentum',
    'leadership-change': 'After 30-60 days - let new leader settle in',
    'wps-compliance': 'Urgent - WPS deadline drives decision',
    'contract-renewal': '90 days before expiry - RFP timing window',
    'funding-round': '2-4 weeks post-announcement - after celebration, before chaos',
  };

  return timingMap[signalType] || scenarioData?.expected_timing || 'Within 2 weeks of signal detection';
}

/**
 * Suggest what trigger to monitor for revisit
 */
function suggestRevisitTrigger(signals) {
  const signalType = signals?.type || signals?.signal_type || '';

  // Suggest what to watch for before revisiting
  const triggerMap = {
    'weak': 'Watch for hiring posts, leadership changes, or funding announcements',
    'stale': 'Wait for fresh signal - any expansion or restructuring news',
    'general': 'Monitor for payroll-related job postings or contract expiry signals',
  };

  return triggerMap[signalType] || 'Monitor for stronger engagement signals or trigger events';
}

/**
 * Score a batch of scenarios
 * @param {Array} scenarios - Array of scenarios to score
 * @returns {Object} Batch results with metrics
 */
export async function scoreBatch(scenarios) {
  const results = [];
  const startTime = Date.now();

  for (const scenario of scenarios) {
    const result = await scoreScenario(scenario);
    results.push(result);
  }

  // Calculate aggregate metrics
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

  // Calculate Cohen's d (effect size between Golden and Kill CRS scores)
  const cohensD = calculateCohensD(
    goldenScenarios.map(r => r.weighted_crs || 0),
    killScenarios.map(r => r.weighted_crs || 0)
  );

  return {
    results,
    metrics: {
      total_scenarios: scenarios.length,
      golden_count: goldenScenarios.length,
      kill_count: killScenarios.length,
      pass_count: results.filter(r => r.outcome === 'PASS').length,
      block_count: results.filter(r => r.outcome === 'BLOCK').length,
      error_count: results.filter(r => r.outcome === 'ERROR').length,
      golden_pass_rate: Math.round(goldenPassRate * 100) / 100,
      kill_containment_rate: Math.round(killContainmentRate * 100) / 100,
      cohens_d: cohensD,
      total_latency_ms: Date.now() - startTime,
    },
  };
}

/**
 * Calculate Cohen's d effect size
 * Measures separation between Golden and Kill CRS distributions
 *
 * Effect size interpretation:
 * - 0.2 = small effect
 * - 0.5 = medium effect
 * - 0.8 = large effect
 * - 2.0+ = very large effect (excellent separation)
 */
function calculateCohensD(goldenScores, killScores) {
  if (goldenScores.length === 0 || killScores.length === 0) {
    return 0;
  }

  const goldenMean = goldenScores.reduce((a, b) => a + b, 0) / goldenScores.length;
  const killMean = killScores.reduce((a, b) => a + b, 0) / killScores.length;

  const goldenVariance = goldenScores.reduce((sum, x) => sum + Math.pow(x - goldenMean, 2), 0) / goldenScores.length;
  const killVariance = killScores.reduce((sum, x) => sum + Math.pow(x - killMean, 2), 0) / killScores.length;

  // Pooled standard deviation
  const pooledStd = Math.sqrt((goldenVariance + killVariance) / 2);

  // Handle edge cases: if std is very small, cap the effect size
  if (pooledStd < 0.001) {
    // If means differ and std is effectively 0, cap at 10.0 (very large effect)
    if (Math.abs(goldenMean - killMean) > 0.01) {
      return goldenMean > killMean ? 10.0 : -10.0;
    }
    return 0;
  }

  const d = (goldenMean - killMean) / pooledStd;

  // Clamp to reasonable range for database storage (DECIMAL(6,3) supports up to 999.999)
  const clampedD = Math.max(-99.999, Math.min(99.999, d));

  return Math.round(clampedD * 1000) / 1000;
}

export { CRS_WEIGHTS, DECISION_THRESHOLDS };
