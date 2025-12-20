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

    // Make PASS/BLOCK decision
    const decision = makeDecision(dimensionScores, weightedCRS, scenario.path_type);

    return {
      success: true,
      scenario_id: scenario.id,
      path_type: scenario.path_type,
      expected_outcome: scenario.expected_outcome,

      // CRS scores
      dimension_scores: dimensionScores,
      weighted_crs: weightedCRS,

      // Decision
      outcome: decision.outcome,
      outcome_reason: decision.reason,
      outcome_correct: decision.outcome === scenario.expected_outcome,

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
 */
function makeDecision(dimensionScores, weightedCRS, pathType) {
  // Hard blocks
  if (dimensionScores.compliance < DECISION_THRESHOLDS.COMPLIANCE_MIN) {
    return {
      outcome: 'BLOCK',
      reason: 'Compliance score below threshold - regulatory or policy concern',
    };
  }

  if (dimensionScores.qualification < DECISION_THRESHOLDS.QUALIFICATION_MIN) {
    return {
      outcome: 'BLOCK',
      reason: 'Qualification score below threshold - lead does not match target profile',
    };
  }

  // CRS-based decision
  if (weightedCRS >= DECISION_THRESHOLDS.PASS_MIN_CRS) {
    return {
      outcome: 'PASS',
      reason: `Weighted CRS ${(weightedCRS * 100).toFixed(1)}% exceeds ${DECISION_THRESHOLDS.PASS_MIN_CRS * 100}% threshold`,
    };
  }

  if (weightedCRS <= DECISION_THRESHOLDS.BLOCK_MAX_CRS) {
    return {
      outcome: 'BLOCK',
      reason: `Weighted CRS ${(weightedCRS * 100).toFixed(1)}% below ${DECISION_THRESHOLDS.BLOCK_MAX_CRS * 100}% threshold`,
    };
  }

  // Edge case: CRS between BLOCK_MAX and PASS_MIN
  // Default to BLOCK for safety (conservative approach)
  return {
    outcome: 'BLOCK',
    reason: `Weighted CRS ${(weightedCRS * 100).toFixed(1)}% in uncertain range - blocking conservatively`,
  };
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
