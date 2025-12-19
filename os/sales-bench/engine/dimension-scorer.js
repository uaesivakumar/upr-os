/**
 * CRS Dimension Scoring Engine
 * S246: CRS Dimension Scoring
 * PRD v1.3 Appendix §4.2
 *
 * Analyzes conversation turns and scores each CRS dimension.
 * Uses pattern matching and heuristics for deterministic scoring.
 */

import { CRS_DIMENSIONS, CRS_WEIGHTS } from '../types/crs.js';

/**
 * Score a conversation across all CRS dimensions
 * @param {Object} options - Scoring options
 * @param {Object[]} options.conversation - Conversation turns
 * @param {Object} options.scenario - Scenario configuration
 * @param {Object} options.run - Run metadata
 * @param {string} options.hard_outcome - Run outcome (PASS/FAIL/BLOCK)
 * @returns {Object} Dimension scores with evidence
 */
export function scoreConversation({ conversation, scenario, run, hard_outcome }) {
  const sivaTurns = conversation.filter((t) => t.speaker === 'SIVA');
  const buyerTurns = conversation.filter((t) => t.speaker === 'BUYER_BOT');

  const dimensionScores = {};
  const dimensionEvidence = {};

  // Score each dimension
  dimensionScores[CRS_DIMENSIONS.QUALIFICATION] = scoreQualification(sivaTurns, buyerTurns);
  dimensionScores[CRS_DIMENSIONS.NEEDS_DISCOVERY] = scoreNeedsDiscovery(sivaTurns, buyerTurns);
  dimensionScores[CRS_DIMENSIONS.VALUE_ARTICULATION] = scoreValueArticulation(sivaTurns, buyerTurns);
  dimensionScores[CRS_DIMENSIONS.OBJECTION_HANDLING] = scoreObjectionHandling(sivaTurns, buyerTurns);
  dimensionScores[CRS_DIMENSIONS.PROCESS_ADHERENCE] = scoreProcessAdherence(sivaTurns, scenario);
  dimensionScores[CRS_DIMENSIONS.COMPLIANCE] = scoreCompliance(sivaTurns, hard_outcome);
  dimensionScores[CRS_DIMENSIONS.RELATIONSHIP_BUILD] = scoreRelationshipBuild(sivaTurns, buyerTurns);
  dimensionScores[CRS_DIMENSIONS.NEXT_STEP_SECURED] = scoreNextStepSecured(sivaTurns, buyerTurns, hard_outcome);

  // Collect evidence for each dimension
  for (const dim of Object.values(CRS_DIMENSIONS)) {
    dimensionEvidence[dim] = collectEvidence(dim, sivaTurns, buyerTurns);
  }

  return {
    dimension_scores: dimensionScores,
    dimension_evidence: dimensionEvidence,
  };
}

/**
 * Score QUALIFICATION dimension
 * Did SIVA identify decision-maker status, budget authority, timeline, and business need?
 */
function scoreQualification(sivaTurns, buyerTurns) {
  let score = 0.5; // Base score
  const evidence = [];

  // Check for qualification questions
  const qualificationPatterns = [
    /who.*(decision|authority|approve|sign off)/i,
    /what.*(timeline|when|urgency|deadline)/i,
    /budget|investment|spend|cost/i,
    /current.*(solution|process|system)/i,
    /what.*(challenges|problems|pain)/i,
  ];

  let qualificationQuestionsAsked = 0;
  for (const turn of sivaTurns) {
    for (const pattern of qualificationPatterns) {
      if (pattern.test(turn.content)) {
        qualificationQuestionsAsked++;
        break;
      }
    }
  }

  // More qualification questions = higher score (up to 5)
  score += Math.min(qualificationQuestionsAsked, 5) * 0.1;

  // Check if buyer revealed authority information
  for (const turn of buyerTurns) {
    if (/decision maker|authority|approve|final say/i.test(turn.content)) {
      score += 0.05;
    }
    if (/no authority|just gathering|report back/i.test(turn.content)) {
      // Did SIVA adapt after learning no authority?
      const buyerTurnIndex = buyerTurns.indexOf(turn);
      const laterSivaTurns = sivaTurns.filter((t) => t.turn_number > turn.turn_number);
      const adaptedApproach = laterSivaTurns.some((t) =>
        /decision maker|stakeholder|who else|connect me/i.test(t.content)
      );
      if (adaptedApproach) {
        score += 0.1;
      }
    }
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Score NEEDS_DISCOVERY dimension
 * Did SIVA uncover pain points, goals, and requirements beyond surface-level needs?
 */
function scoreNeedsDiscovery(sivaTurns, buyerTurns) {
  let score = 0.5;

  // Discovery question patterns
  const discoveryPatterns = [
    /what.*(goals|objectives|trying to achieve)/i,
    /how.*(impact|affect|measure)/i,
    /why.*(important|priority|matter)/i,
    /tell me more|elaborate|expand/i,
    /what.*(happens if|consequence)/i,
    /ideal.*(outcome|solution|scenario)/i,
  ];

  let discoveryQuestionsAsked = 0;
  for (const turn of sivaTurns) {
    for (const pattern of discoveryPatterns) {
      if (pattern.test(turn.content)) {
        discoveryQuestionsAsked++;
        break;
      }
    }
  }

  score += Math.min(discoveryQuestionsAsked, 6) * 0.08;

  // Check for buyer revealing deeper needs
  const needsRevealed = buyerTurns.filter((t) =>
    /real issue|actually|main concern|biggest challenge|really need/i.test(t.content)
  ).length;

  score += Math.min(needsRevealed, 3) * 0.05;

  // Check for follow-up questions (shows active listening)
  let followUpCount = 0;
  for (let i = 1; i < sivaTurns.length; i++) {
    const prevBuyerTurn = buyerTurns.find((b) => b.turn_number === sivaTurns[i].turn_number - 1);
    if (prevBuyerTurn && /you mentioned|earlier you said|regarding what you/i.test(sivaTurns[i].content)) {
      followUpCount++;
    }
  }

  score += Math.min(followUpCount, 3) * 0.05;

  return Math.max(0, Math.min(1, score));
}

/**
 * Score VALUE_ARTICULATION dimension
 * Did SIVA connect features to specific benefits and business outcomes?
 */
function scoreValueArticulation(sivaTurns, buyerTurns) {
  let score = 0.4;

  // Value articulation patterns
  const valuePatterns = [
    /this means|which means|so you can/i,
    /result|outcome|achieve/i,
    /save.*(time|money|cost)/i,
    /increase.*(revenue|efficiency|productivity)/i,
    /reduce.*(risk|cost|time)/i,
    /roi|return on investment/i,
    /specific.*(benefit|value|impact)/i,
  ];

  let valueStatementsCount = 0;
  for (const turn of sivaTurns) {
    for (const pattern of valuePatterns) {
      if (pattern.test(turn.content)) {
        valueStatementsCount++;
        break;
      }
    }
  }

  score += Math.min(valueStatementsCount, 5) * 0.1;

  // Check for specific examples or case studies
  const hasExamples = sivaTurns.some((t) =>
    /for example|case study|customer.*(like you|similar)|%|percent/i.test(t.content)
  );
  if (hasExamples) {
    score += 0.1;
  }

  // Check for buyer acknowledging value
  const buyerAcknowledgedValue = buyerTurns.some((t) =>
    /makes sense|interesting|helpful|see how|that would/i.test(t.content)
  );
  if (buyerAcknowledgedValue) {
    score += 0.05;
  }

  // Penalty for feature dumping without benefits
  const featureDumpPattern = /features include|we offer|we have|our platform has/i;
  const featureDumps = sivaTurns.filter((t) => featureDumpPattern.test(t.content)).length;
  score -= Math.min(featureDumps, 3) * 0.05;

  return Math.max(0, Math.min(1, score));
}

/**
 * Score OBJECTION_HANDLING dimension
 * Did SIVA acknowledge concerns, provide evidence, and resolve objections?
 */
function scoreObjectionHandling(sivaTurns, buyerTurns) {
  let score = 0.6; // Start higher if no objections

  // Identify objections in buyer turns
  const objectionPattern = /concern|worried|not sure|hesitant|issue|problem|but|however|skeptical/i;
  const objections = buyerTurns.filter((t) => objectionPattern.test(t.content));

  if (objections.length === 0) {
    return 0.7; // No objections to handle
  }

  score = 0.4; // Reset if there are objections

  // Check how SIVA responded to objections
  for (const objection of objections) {
    const nextSivaTurn = sivaTurns.find((t) => t.turn_number === objection.turn_number + 1);

    if (nextSivaTurn) {
      // Did SIVA acknowledge the concern?
      if (/understand|hear you|appreciate|good point|valid concern/i.test(nextSivaTurn.content)) {
        score += 0.1;
      }

      // Did SIVA provide evidence or data?
      if (/data|evidence|research|case study|customer|%|percent/i.test(nextSivaTurn.content)) {
        score += 0.1;
      }

      // Did SIVA reframe positively?
      if (/actually|in fact|the reality is|what we've found/i.test(nextSivaTurn.content)) {
        score += 0.05;
      }
    } else {
      // Objection at end without response
      score -= 0.1;
    }
  }

  // Check for buyer being satisfied after objection handling
  const objectionResolutions = buyerTurns.filter((t, i) => {
    const prevTurn = buyerTurns[i - 1];
    return prevTurn && objectionPattern.test(prevTurn.content) &&
      /okay|understand|makes sense|that helps|good to know/i.test(t.content);
  }).length;

  score += objectionResolutions * 0.1;

  return Math.max(0, Math.min(1, score));
}

/**
 * Score PROCESS_ADHERENCE dimension
 * Did SIVA follow appropriate sales stage progression and methodology?
 */
function scoreProcessAdherence(sivaTurns, scenario) {
  let score = 0.5;

  // Check for proper stage progression
  // Opening -> Discovery -> Value -> Proposal -> Close
  const stageIndicators = {
    opening: /thank you for|appreciate you taking|great to meet/i,
    discovery: /tell me|what.*(challenges|goals|situation)/i,
    value: /how we help|our solution|benefit|value/i,
    proposal: /recommend|suggest|propose|option/i,
    close: /next step|move forward|schedule|follow up/i,
  };

  const stagesFound = [];
  for (const turn of sivaTurns) {
    for (const [stage, pattern] of Object.entries(stageIndicators)) {
      if (pattern.test(turn.content) && !stagesFound.includes(stage)) {
        stagesFound.push(stage);
      }
    }
  }

  // Score based on stage coverage
  score += stagesFound.length * 0.1;

  // Check for proper ordering (discovery before value, value before close)
  const discoveryIndex = stagesFound.indexOf('discovery');
  const valueIndex = stagesFound.indexOf('value');
  const closeIndex = stagesFound.indexOf('close');

  if (discoveryIndex !== -1 && valueIndex !== -1 && discoveryIndex < valueIndex) {
    score += 0.1;
  }
  if (valueIndex !== -1 && closeIndex !== -1 && valueIndex < closeIndex) {
    score += 0.1;
  }

  // Penalty for premature closing
  const firstCloseAttempt = sivaTurns.findIndex((t) => stageIndicators.close.test(t.content));
  if (firstCloseAttempt !== -1 && firstCloseAttempt < 2) {
    score -= 0.2; // Closing too early
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Score COMPLIANCE dimension
 * Did SIVA avoid compliance violations, inappropriate promises, or policy breaches?
 */
function scoreCompliance(sivaTurns, hardOutcome) {
  let score = 0.8; // Start high - compliance is about NOT making mistakes

  // Check for compliance red flags
  const complianceRedFlags = [
    { pattern: /guarantee|promise|definitely|absolutely will/i, penalty: 0.15 },
    { pattern: /competitor.*(bad|worse|terrible|inferior)/i, penalty: 0.2 },
    { pattern: /don't tell anyone|off the record|between us/i, penalty: 0.3 },
    { pattern: /limited time|act now|special offer/i, penalty: 0.1 },
    { pattern: /you have to|must decide|no choice/i, penalty: 0.15 },
  ];

  for (const turn of sivaTurns) {
    for (const flag of complianceRedFlags) {
      if (flag.pattern.test(turn.content)) {
        score -= flag.penalty;
      }
    }
  }

  // If outcome was BLOCK, major compliance failure
  if (hardOutcome === 'BLOCK') {
    score = Math.min(score, 0.3);
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Score RELATIONSHIP_BUILD dimension
 * Did SIVA establish rapport, show empathy, and build trust through interaction?
 */
function scoreRelationshipBuild(sivaTurns, buyerTurns) {
  let score = 0.5;

  // Rapport building patterns
  const rapportPatterns = [
    /thank you|appreciate|grateful/i,
    /understand|hear you|makes sense/i,
    /great question|good point/i,
    /I can see|I imagine|must be/i,
    /similar situation|other customers|common challenge/i,
  ];

  let rapportIndicators = 0;
  for (const turn of sivaTurns) {
    for (const pattern of rapportPatterns) {
      if (pattern.test(turn.content)) {
        rapportIndicators++;
        break;
      }
    }
  }

  score += Math.min(rapportIndicators, 6) * 0.08;

  // Check for personalization
  const hasPersonalization = sivaTurns.some((t) =>
    /your company|your team|your situation|you mentioned earlier/i.test(t.content)
  );
  if (hasPersonalization) {
    score += 0.1;
  }

  // Check for buyer warming up
  const warmingSigns = buyerTurns.filter((t) =>
    /good question|that's interesting|I like|appreciate|helpful/i.test(t.content)
  ).length;

  score += Math.min(warmingSigns, 3) * 0.05;

  // Penalty for robotic or overly formal responses
  const roboticPatterns = /pursuant to|herein|aforementioned|as per our/i;
  const roboticResponses = sivaTurns.filter((t) => roboticPatterns.test(t.content)).length;
  score -= roboticResponses * 0.1;

  return Math.max(0, Math.min(1, score));
}

/**
 * Score NEXT_STEP_SECURED dimension
 * Did SIVA secure a concrete next step or appropriate outcome?
 */
function scoreNextStepSecured(sivaTurns, buyerTurns, hardOutcome) {
  let score = 0.3;

  // Check for next step proposals
  const nextStepPatterns = [
    /next step|move forward|schedule|calendar/i,
    /demo|trial|pilot|poc/i,
    /send you|share with you|follow up/i,
    /connect you with|introduce you to/i,
    /proposal|quote|pricing/i,
  ];

  let nextStepProposals = 0;
  for (const turn of sivaTurns) {
    for (const pattern of nextStepPatterns) {
      if (pattern.test(turn.content)) {
        nextStepProposals++;
        break;
      }
    }
  }

  score += Math.min(nextStepProposals, 3) * 0.1;

  // Check for buyer commitment
  const buyerCommitment = buyerTurns.filter((t) =>
    /yes|sounds good|let's do|schedule|available|send me/i.test(t.content)
  ).length;

  score += Math.min(buyerCommitment, 2) * 0.15;

  // Outcome-based adjustment
  if (hardOutcome === 'PASS') {
    score += 0.2;
  } else if (hardOutcome === 'BLOCK') {
    score -= 0.2;
  }

  // Check for appropriate exit if no sale possible
  if (hardOutcome === 'FAIL') {
    const gracefulExit = sivaTurns.some((t) =>
      /understand|thank you for your time|if anything changes|future|keep in touch/i.test(t.content)
    );
    if (gracefulExit) {
      score += 0.1; // Handled rejection well
    }
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Collect evidence references for a dimension
 * @param {string} dimension - CRS dimension
 * @param {Object[]} sivaTurns - SIVA's turns
 * @param {Object[]} buyerTurns - Buyer's turns
 * @returns {string[]} Evidence references
 */
function collectEvidence(dimension, sivaTurns, buyerTurns) {
  const evidence = [];

  // Collect turn references that demonstrate the dimension
  const patterns = getDimensionPatterns(dimension);

  for (const turn of sivaTurns) {
    for (const pattern of patterns.positive) {
      if (pattern.test(turn.content)) {
        evidence.push(`siva:turn${turn.turn_number}:positive`);
        break;
      }
    }
    for (const pattern of patterns.negative) {
      if (pattern.test(turn.content)) {
        evidence.push(`siva:turn${turn.turn_number}:negative`);
        break;
      }
    }
  }

  return evidence.slice(0, 10); // Limit evidence references
}

/**
 * Get patterns for evidence collection per dimension
 */
function getDimensionPatterns(dimension) {
  const patterns = {
    [CRS_DIMENSIONS.QUALIFICATION]: {
      positive: [/who.*(decision|authority)/i, /what.*(timeline|budget)/i],
      negative: [/assumed|presumed/i],
    },
    [CRS_DIMENSIONS.NEEDS_DISCOVERY]: {
      positive: [/tell me more|what.*(challenges|goals)/i],
      negative: [/let me tell you about/i],
    },
    [CRS_DIMENSIONS.VALUE_ARTICULATION]: {
      positive: [/this means|result|roi/i],
      negative: [/features include|we offer/i],
    },
    [CRS_DIMENSIONS.OBJECTION_HANDLING]: {
      positive: [/understand|hear you|good point/i],
      negative: [/but|however, I disagree/i],
    },
    [CRS_DIMENSIONS.PROCESS_ADHERENCE]: {
      positive: [/thank you for|next step|recommend/i],
      negative: [/sign today|limited time/i],
    },
    [CRS_DIMENSIONS.COMPLIANCE]: {
      positive: [/let me clarify|to be clear/i],
      negative: [/guarantee|promise|definitely/i],
    },
    [CRS_DIMENSIONS.RELATIONSHIP_BUILD]: {
      positive: [/appreciate|understand|great question/i],
      negative: [/pursuant|aforementioned/i],
    },
    [CRS_DIMENSIONS.NEXT_STEP_SECURED]: {
      positive: [/next step|schedule|follow up/i],
      negative: [],
    },
  };

  return patterns[dimension] || { positive: [], negative: [] };
}

/**
 * Get dimension name and description for reporting
 * @param {string} dimensionKey - Dimension key
 * @returns {Object} Dimension info
 */
export function getDimensionInfo(dimensionKey) {
  const info = {
    [CRS_DIMENSIONS.QUALIFICATION]: {
      name: 'Qualification',
      description: 'Properly qualifying the prospect',
      focus: 'Decision-maker status, budget authority, timeline, business need',
    },
    [CRS_DIMENSIONS.NEEDS_DISCOVERY]: {
      name: 'Needs Discovery',
      description: 'Uncovering true needs',
      focus: 'Pain points, goals, requirements beyond surface-level',
    },
    [CRS_DIMENSIONS.VALUE_ARTICULATION]: {
      name: 'Value Articulation',
      description: 'Communicating value clearly',
      focus: 'Connecting features to benefits and business outcomes',
    },
    [CRS_DIMENSIONS.OBJECTION_HANDLING]: {
      name: 'Objection Handling',
      description: 'Addressing concerns effectively',
      focus: 'Acknowledging, evidence-based resolution',
    },
    [CRS_DIMENSIONS.PROCESS_ADHERENCE]: {
      name: 'Process Adherence',
      description: 'Following sales methodology',
      focus: 'Stage progression, methodology compliance',
    },
    [CRS_DIMENSIONS.COMPLIANCE]: {
      name: 'Compliance',
      description: 'Regulatory/policy compliance',
      focus: 'Avoiding violations, inappropriate promises',
    },
    [CRS_DIMENSIONS.RELATIONSHIP_BUILD]: {
      name: 'Relationship Building',
      description: 'Building rapport and trust',
      focus: 'Empathy, personalization, warmth',
    },
    [CRS_DIMENSIONS.NEXT_STEP_SECURED]: {
      name: 'Next Step Secured',
      description: 'Advancing the deal',
      focus: 'Concrete commitments, appropriate outcomes',
    },
  };

  return info[dimensionKey] || { name: dimensionKey, description: 'Unknown dimension' };
}
