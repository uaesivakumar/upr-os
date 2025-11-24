/**
 * Meta-Cognitive Reasoning Engine
 *
 * Enables agents to analyze their own thinking processes - "thinking about thinking"
 *
 * Key Capabilities:
 * - Thinking pattern analysis
 * - Cognitive bias identification
 * - Counterfactual reasoning ("what if" scenarios)
 * - Confidence rationale assessment
 * - Assumption identification
 * - Knowledge gap recognition
 * - Decision difficulty assessment
 * - Meta-learning generation
 *
 * Supports: Multi-Agent Reflection & Meta-Cognition System (Sprint 46)
 */

import pool from '../db.js';

class MetaCognitiveEngine {
  constructor() {
    this.db = pool;
    this.biasPatterns = this.initializeBiasPatterns();
  }

  async initialize() {
    // Pool is already initialized
  }

  /**
   * Initialize cognitive bias detection patterns
   */
  initializeBiasPatterns() {
    return {
      CONFIRMATION_BIAS: {
        keywords: ['as expected', 'confirms', 'validates', 'proves my point', 'obviously'],
        description: 'Tendency to favor information that confirms existing beliefs',
        indicators: ['selective_evidence', 'dismissing_contradictions']
      },
      ANCHORING_BIAS: {
        keywords: ['initial', 'first impression', 'started with', 'originally thought'],
        description: 'Over-relying on first information encountered',
        indicators: ['insufficient_adjustment', 'baseline_fixation']
      },
      AVAILABILITY_HEURISTIC: {
        keywords: ['recent', 'memorable', 'vivid', 'just saw', 'comes to mind'],
        description: 'Overweighting readily available information',
        indicators: ['recent_overweight', 'ignoring_statistics']
      },
      RECENCY_BIAS: {
        keywords: ['lately', 'recently', 'last time', 'just happened'],
        description: 'Giving undue weight to recent events',
        indicators: ['ignoring_historical', 'short_term_focus']
      },
      OVERCONFIDENCE_BIAS: {
        keywords: ['definitely', 'certainly', 'no doubt', 'absolutely sure', '100%'],
        description: 'Excessive confidence in own abilities or judgments',
        indicators: ['ignoring_uncertainty', 'dismissing_risks']
      },
      GROUPTHINK: {
        keywords: ['everyone agrees', 'consensus', 'team thinks', 'we all believe'],
        description: 'Conformity pressure leading to poor decisions',
        indicators: ['suppressing_dissent', 'illusion_of_unanimity']
      },
      SUNK_COST_FALLACY: {
        keywords: ['already invested', 'too far to stop', 'wasted effort', 'committed resources'],
        description: 'Continuing based on past investment rather than future value',
        indicators: ['past_investment_focus', 'ignoring_future_costs']
      },
      DUNNING_KRUGER: {
        keywords: ['simple', 'easy', 'straightforward', 'trivial'],
        description: 'Low-ability individuals overestimating competence',
        indicators: ['underestimating_complexity', 'overconfidence_novice']
      }
    };
  }

  /**
   * Main method: Analyze thinking process
   *
   * @param {Object} params - Decision parameters
   * @returns {Object} Meta-cognitive analysis
   */
  async analyzeThinkingProcess(params) {
    const {
      decision_id,
      agent_id,
      reasoning_text,
      reasoning_steps = [],
      evidence = [],
      confidence,
      context = {},
      alternatives = [],
      outcome = null
    } = params;

    // 1. Describe thinking process
    const thinkingDescription = this.describeThinkingProcess(reasoning_text, reasoning_steps);

    // 2. Identify cognitive biases
    const biasesIdentified = this.identifyBiases(reasoning_text, reasoning_steps, evidence, confidence);

    // 3. Extract assumptions
    const assumptions = this.identifyAssumptions(reasoning_steps, context);

    // 4. Assess confidence rationale
    const confidenceRationale = this.assessConfidenceRationale(
      reasoning_text,
      reasoning_steps,
      evidence,
      confidence
    );

    // 5. Generate counterfactuals
    const counterfactuals = this.generateCounterfactuals(
      reasoning_steps,
      alternatives,
      context
    );

    // 6. Identify alternatives considered
    const alternativesConsidered = this.identifyAlternatives(alternatives, reasoning_steps);

    // 7. Assess decision difficulty
    const decisionDifficulty = this.assessDecisionDifficulty(
      reasoning_steps,
      evidence,
      alternatives,
      context
    );

    // 8. Identify knowledge gaps
    const knowledgeGaps = this.identifyKnowledgeGaps(reasoning_steps, evidence, context);

    // 9. Assess information completeness
    const informationCompleteness = this.assessInformationCompleteness(
      evidence,
      knowledgeGaps,
      reasoning_steps
    );

    // 10. Generate meta-learning
    const metaLearning = this.generateMetaLearning(
      reasoning_steps,
      biasesIdentified,
      knowledgeGaps,
      outcome
    );

    // 11. Generate improvement suggestions
    const whatIWouldChange = this.generateImprovementSuggestions(
      biasesIdentified,
      knowledgeGaps,
      informationCompleteness
    );

    // Store in database
    const result = await this.db.query(
      `INSERT INTO metacognitive_analysis (
        decision_id,
        agent_id,
        thinking_process_description,
        assumptions_made,
        biases_identified,
        confidence_rationale,
        alternatives_considered,
        counterfactual_analysis,
        decision_difficulty,
        knowledge_gaps,
        information_completeness_score,
        what_i_learned,
        what_i_would_change,
        analyzed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *`,
      [
        decision_id,
        agent_id,
        thinkingDescription,
        JSON.stringify(assumptions),
        biasesIdentified,
        confidenceRationale,
        JSON.stringify(alternativesConsidered),
        JSON.stringify(counterfactuals),
        decisionDifficulty,
        knowledgeGaps,
        informationCompleteness,
        metaLearning,
        whatIWouldChange
      ]
    );

    return result.rows[0];
  }

  /**
   * Describe the thinking process in natural language
   */
  describeThinkingProcess(reasoning_text, reasoning_steps) {
    const stepCount = reasoning_steps.length;
    const hasStructure = stepCount > 0;
    const textLength = reasoning_text.length;

    let description = '';

    if (hasStructure) {
      description += `I approached this decision through ${stepCount} structured reasoning steps. `;

      // Identify reasoning style
      const hasEvidence = reasoning_text.toLowerCase().includes('evidence') ||
                         reasoning_text.toLowerCase().includes('data');
      const hasLogic = reasoning_text.includes('therefore') || reasoning_text.includes('thus');
      const hasAlternatives = reasoning_text.toLowerCase().includes('alternative') ||
                             reasoning_text.toLowerCase().includes('option');

      if (hasEvidence && hasLogic) {
        description += 'My thinking style was analytical and evidence-based, ';
      } else if (hasEvidence) {
        description += 'My thinking was primarily data-driven, ';
      } else if (hasLogic) {
        description += 'My thinking followed logical reasoning, ';
      } else {
        description += 'My thinking was intuitive and experience-based, ';
      }

      if (hasAlternatives) {
        description += 'considering multiple alternatives before reaching a conclusion. ';
      } else {
        description += 'focusing on a single line of reasoning. ';
      }

      // Describe reasoning depth
      if (stepCount >= 5) {
        description += 'The analysis was thorough and comprehensive.';
      } else if (stepCount >= 3) {
        description += 'The analysis was adequately detailed.';
      } else {
        description += 'The analysis was relatively brief.';
      }
    } else {
      description += 'My thinking was less structured, ';

      if (textLength > 200) {
        description += 'but involved detailed consideration of the situation.';
      } else {
        description += 'with a more intuitive approach to the decision.';
      }
    }

    return description;
  }

  /**
   * Identify cognitive biases in reasoning
   */
  identifyBiases(reasoning_text, reasoning_steps, evidence, confidence) {
    const biases = [];
    const lowerText = reasoning_text.toLowerCase();

    // Check each bias pattern
    for (const [biasType, pattern] of Object.entries(this.biasPatterns)) {
      const hasKeywords = pattern.keywords.some(keyword =>
        lowerText.includes(keyword.toLowerCase())
      );

      // Additional contextual checks
      let biasDetected = false;
      let specificIndicator = '';

      switch (biasType) {
        case 'CONFIRMATION_BIAS':
          if (hasKeywords && evidence.length > 0) {
            // Check if all evidence supports one conclusion
            const allSupportive = evidence.every(e =>
              e.type === 'supporting' || e.strength === 'strong'
            );
            if (allSupportive) {
              biasDetected = true;
              specificIndicator = 'All evidence supports initial hypothesis';
            }
          }
          break;

        case 'OVERCONFIDENCE_BIAS':
          if (confidence && confidence > 0.9 && reasoning_steps.length < 3) {
            biasDetected = true;
            specificIndicator = 'High confidence with limited reasoning depth';
          } else if (hasKeywords) {
            biasDetected = true;
            specificIndicator = 'Absolute language indicates potential overconfidence';
          }
          break;

        case 'AVAILABILITY_HEURISTIC':
          if (hasKeywords && evidence.length < 3) {
            biasDetected = true;
            specificIndicator = 'Relying on readily available information';
          }
          break;

        case 'ANCHORING_BIAS':
          if (hasKeywords && reasoning_steps.length > 0) {
            const firstStep = reasoning_steps[0]?.description || '';
            const subsequentSteps = reasoning_steps.slice(1).map(s => s.description).join(' ');
            if (subsequentSteps.includes(firstStep)) {
              biasDetected = true;
              specificIndicator = 'Initial framing persists throughout reasoning';
            }
          }
          break;

        case 'SUNK_COST_FALLACY':
          if (hasKeywords) {
            biasDetected = true;
            specificIndicator = 'Justifying continuation based on past investment';
          }
          break;

        case 'DUNNING_KRUGER':
          if (hasKeywords && confidence && confidence > 0.85 && reasoning_steps.length < 2) {
            biasDetected = true;
            specificIndicator = 'High confidence with minimal analysis';
          }
          break;

        default:
          if (hasKeywords) {
            biasDetected = true;
            specificIndicator = 'Keyword pattern match';
          }
      }

      if (biasDetected) {
        biases.push(`${biasType}: ${pattern.description} [${specificIndicator}]`);
      }
    }

    // Check for balance in reasoning
    const hasCounterarguments = lowerText.includes('however') ||
                                lowerText.includes('on the other hand') ||
                                lowerText.includes('alternatively');

    if (!hasCounterarguments && reasoning_steps.length > 2) {
      biases.push('ONE_SIDED_THINKING: Lack of consideration of counterarguments or alternative viewpoints');
    }

    return biases;
  }

  /**
   * Identify implicit assumptions in reasoning
   */
  identifyAssumptions(reasoning_steps, context) {
    const assumptions = [];

    reasoning_steps.forEach((step, index) => {
      const stepText = step.description || step.reasoning || JSON.stringify(step);
      const lowerStep = stepText.toLowerCase();

      // Look for assumption indicators
      const assumptionIndicators = [
        { pattern: /assuming|assume that|presuming|presume/i, type: 'explicit' },
        { pattern: /likely|probably|presumably|apparently/i, type: 'implicit' },
        { pattern: /should|would|must be|has to be/i, type: 'normative' },
        { pattern: /always|never|all|none|every/i, type: 'universal' }
      ];

      assumptionIndicators.forEach(indicator => {
        if (indicator.pattern.test(stepText)) {
          assumptions.push({
            step: index + 1,
            type: indicator.type,
            assumption: stepText.slice(0, 200),
            confidence: this.assessAssumptionStrength(stepText)
          });
        }
      });

      // Identify causal assumptions (if X then Y without proof)
      if (stepText.includes('therefore') || stepText.includes('thus') || stepText.includes('so')) {
        assumptions.push({
          step: index + 1,
          type: 'causal',
          assumption: `Causal relationship assumed in step ${index + 1}`,
          confidence: 'medium'
        });
      }
    });

    // Domain assumptions from context
    if (context.domain) {
      assumptions.push({
        step: 0,
        type: 'domain',
        assumption: `Decision operates within ${context.domain} domain constraints`,
        confidence: 'high'
      });
    }

    return assumptions;
  }

  assessAssumptionStrength(text) {
    if (text.includes('certainly') || text.includes('definitely')) return 'strong';
    if (text.includes('likely') || text.includes('probably')) return 'medium';
    if (text.includes('might') || text.includes('possibly')) return 'weak';
    return 'medium';
  }

  /**
   * Assess the rationale behind confidence level
   */
  assessConfidenceRationale(reasoning_text, reasoning_steps, evidence, confidence) {
    const evidenceCount = evidence.length;
    const stepCount = reasoning_steps.length;
    const textLength = reasoning_text.length;

    let rationale = `My confidence level of ${(confidence * 100).toFixed(0)}% is based on: `;

    const factors = [];

    // Evidence strength
    if (evidenceCount >= 5) {
      factors.push('strong evidence base (5+ pieces)');
    } else if (evidenceCount >= 3) {
      factors.push('adequate evidence (3+ pieces)');
    } else if (evidenceCount > 0) {
      factors.push('limited evidence');
    } else {
      factors.push('no explicit evidence provided');
    }

    // Reasoning depth
    if (stepCount >= 5) {
      factors.push('thorough analysis (5+ reasoning steps)');
    } else if (stepCount >= 3) {
      factors.push('moderate analysis depth');
    } else if (stepCount > 0) {
      factors.push('basic reasoning structure');
    } else {
      factors.push('intuitive judgment');
    }

    // Check for uncertainty expressions
    const uncertaintyMarkers = ['uncertain', 'unclear', 'might', 'could', 'maybe', 'possibly'];
    const hasUncertainty = uncertaintyMarkers.some(marker =>
      reasoning_text.toLowerCase().includes(marker)
    );

    if (hasUncertainty) {
      factors.push('acknowledged uncertainty in reasoning');
    }

    // Confidence calibration check
    const expectedConfidence = this.calculateExpectedConfidence(evidenceCount, stepCount);
    const confidenceDiff = Math.abs(confidence - expectedConfidence);

    rationale += factors.join(', ') + '. ';

    if (confidenceDiff > 0.2) {
      if (confidence > expectedConfidence) {
        rationale += 'Note: Confidence may be higher than evidence and analysis depth suggest.';
      } else {
        rationale += 'Note: Confidence is appropriately cautious given the analysis.';
      }
    } else {
      rationale += 'Confidence level appears well-calibrated to reasoning quality.';
    }

    return rationale;
  }

  calculateExpectedConfidence(evidenceCount, stepCount) {
    // Simple heuristic for expected confidence
    const evidenceScore = Math.min(evidenceCount / 5, 1) * 0.4; // Max 0.4 from evidence
    const reasoningScore = Math.min(stepCount / 5, 1) * 0.4;    // Max 0.4 from reasoning
    const baseConfidence = 0.2; // Minimum base confidence

    return baseConfidence + evidenceScore + reasoningScore;
  }

  /**
   * Generate counterfactual scenarios
   */
  generateCounterfactuals(reasoning_steps, alternatives, context) {
    const counterfactuals = [];

    // Counterfactual 1: What if I had chosen differently?
    if (alternatives && alternatives.length > 0) {
      alternatives.forEach((alt, index) => {
        counterfactuals.push({
          scenario: `What if I had chosen "${alt.name || `Alternative ${index + 1}`}"?`,
          reasoning: `Instead of my chosen approach, this alternative would have ${alt.description || 'led to a different outcome'}.`,
          expected_outcome: alt.expected_outcome || 'Unknown',
          likelihood: alt.likelihood || 'medium',
          trade_offs: alt.trade_offs || []
        });
      });
    }

    // Counterfactual 2: What if I had more information?
    if (reasoning_steps.length > 0) {
      counterfactuals.push({
        scenario: 'What if I had complete information?',
        reasoning: 'With perfect information, I might have reduced uncertainty and made a more confident decision.',
        expected_outcome: 'Potentially higher confidence and accuracy',
        likelihood: 'hypothetical',
        trade_offs: ['Time cost of gathering information', 'Decision delay']
      });
    }

    // Counterfactual 3: What if I had approached this differently?
    counterfactuals.push({
      scenario: 'What if I had used a different reasoning approach?',
      reasoning: 'Using a more systematic or creative approach might have revealed insights I missed.',
      expected_outcome: 'Possibly different conclusion or higher quality reasoning',
      likelihood: 'medium',
      trade_offs: ['Different reasoning method may have different biases']
    });

    // Counterfactual 4: What if context changes?
    if (context && Object.keys(context).length > 0) {
      counterfactuals.push({
        scenario: 'What if the context were different?',
        reasoning: 'Changed circumstances would likely require different reasoning and conclusions.',
        expected_outcome: 'Context-dependent outcome',
        likelihood: 'context-dependent',
        trade_offs: ['Need to validate assumptions when context changes']
      });
    }

    return counterfactuals;
  }

  /**
   * Identify alternatives that were considered
   */
  identifyAlternatives(alternatives, reasoning_steps) {
    const considered = [];

    // Explicit alternatives
    if (alternatives && alternatives.length > 0) {
      alternatives.forEach(alt => {
        considered.push({
          alternative: alt.name || alt.description,
          evaluation: alt.evaluation || 'Not explicitly evaluated',
          pros: alt.pros || [],
          cons: alt.cons || [],
          rejected_reason: alt.rejected_reason || 'Not selected'
        });
      });
    }

    // Alternatives mentioned in reasoning
    reasoning_steps.forEach((step, index) => {
      const stepText = step.description || step.reasoning || JSON.stringify(step);

      if (stepText.toLowerCase().includes('alternative') ||
          stepText.toLowerCase().includes('option') ||
          stepText.toLowerCase().includes('instead')) {
        considered.push({
          alternative: `Mentioned in step ${index + 1}`,
          evaluation: stepText.slice(0, 200),
          pros: [],
          cons: [],
          rejected_reason: 'Implicitly considered'
        });
      }
    });

    return considered;
  }

  /**
   * Assess decision difficulty level
   */
  assessDecisionDifficulty(reasoning_steps, evidence, alternatives, context) {
    let difficultyScore = 0;

    // Factor 1: Number of alternatives (more = harder)
    const altCount = alternatives?.length || 0;
    if (altCount >= 5) difficultyScore += 3;
    else if (altCount >= 3) difficultyScore += 2;
    else if (altCount >= 2) difficultyScore += 1;

    // Factor 2: Evidence quality (less = harder)
    const evidenceCount = evidence?.length || 0;
    if (evidenceCount === 0) difficultyScore += 3;
    else if (evidenceCount <= 2) difficultyScore += 2;
    else if (evidenceCount <= 4) difficultyScore += 1;

    // Factor 3: Reasoning complexity (more steps = harder)
    const stepCount = reasoning_steps?.length || 0;
    if (stepCount >= 7) difficultyScore += 2;
    else if (stepCount >= 5) difficultyScore += 1;

    // Factor 4: Context complexity
    const contextFactors = Object.keys(context || {}).length;
    if (contextFactors >= 5) difficultyScore += 2;
    else if (contextFactors >= 3) difficultyScore += 1;

    // Map score to difficulty level
    if (difficultyScore === 0) return 'TRIVIAL';
    if (difficultyScore <= 2) return 'EASY';
    if (difficultyScore <= 5) return 'MODERATE';
    if (difficultyScore <= 8) return 'HARD';
    return 'VERY_HARD';
  }

  /**
   * Identify knowledge gaps
   */
  identifyKnowledgeGaps(reasoning_steps, evidence, context) {
    const gaps = [];

    // Check for uncertainty expressions
    const uncertaintyPhrases = [
      'not sure', 'unclear', 'unknown', 'lack of', 'insufficient',
      'need more', 'would help to know', 'uncertain about'
    ];

    reasoning_steps.forEach((step, index) => {
      const stepText = step.description || step.reasoning || JSON.stringify(step);

      uncertaintyPhrases.forEach(phrase => {
        if (stepText.toLowerCase().includes(phrase)) {
          gaps.push(`Step ${index + 1}: ${phrase} - ${stepText.slice(0, 100)}`);
        }
      });
    });

    // Check for missing evidence types
    const evidenceTypes = new Set(evidence.map(e => e.type));

    if (!evidenceTypes.has('data') && !evidenceTypes.has('statistics')) {
      gaps.push('Missing quantitative data or statistics');
    }

    if (!evidenceTypes.has('expert') && !evidenceTypes.has('research')) {
      gaps.push('Missing expert opinion or research evidence');
    }

    // Check for missing context
    if (!context.timeline) {
      gaps.push('Temporal context not specified');
    }

    if (!context.stakeholders && !context.impact) {
      gaps.push('Stakeholder impact not fully considered');
    }

    // If very few gaps found but reasoning is shallow
    if (gaps.length === 0 && reasoning_steps.length < 3) {
      gaps.push('Limited analysis depth may indicate unrecognized knowledge gaps');
    }

    return gaps;
  }

  /**
   * Assess information completeness
   */
  assessInformationCompleteness(evidence, knowledgeGaps, reasoning_steps) {
    let score = 50; // Base score

    // Positive factors
    const evidenceCount = evidence?.length || 0;
    score += Math.min(evidenceCount * 5, 25); // Up to +25 for evidence

    const stepCount = reasoning_steps?.length || 0;
    score += Math.min(stepCount * 3, 15); // Up to +15 for reasoning depth

    // Negative factors
    const gapCount = knowledgeGaps?.length || 0;
    score -= Math.min(gapCount * 8, 40); // Up to -40 for gaps

    // Evidence diversity
    const evidenceTypes = new Set(evidence?.map(e => e.type) || []);
    score += evidenceTypes.size * 3; // +3 per unique evidence type

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Generate meta-learning insights
   */
  generateMetaLearning(reasoning_steps, biasesIdentified, knowledgeGaps, outcome) {
    const learnings = [];

    // Learning from biases
    if (biasesIdentified.length > 0) {
      learnings.push(`I identified ${biasesIdentified.length} potential cognitive bias(es) in my thinking: ${biasesIdentified[0].split(':')[0]}. This awareness will help me be more objective in future decisions.`);
    } else {
      learnings.push('My reasoning appears relatively free of obvious cognitive biases, though blind spots may exist.');
    }

    // Learning from knowledge gaps
    if (knowledgeGaps.length > 0) {
      learnings.push(`I recognized ${knowledgeGaps.length} knowledge gap(s). Understanding what I don't know is crucial for improving future decisions.`);
    } else {
      learnings.push('I had sufficient information for this decision, or may not have recognized existing knowledge gaps.');
    }

    // Learning from reasoning process
    const stepCount = reasoning_steps.length;
    if (stepCount >= 5) {
      learnings.push('My structured, step-by-step approach provided clear reasoning traceability.');
    } else if (stepCount > 0) {
      learnings.push('While I used structured reasoning, more depth could improve decision quality.');
    } else {
      learnings.push('I relied on intuitive judgment. More structured reasoning could enhance decision quality.');
    }

    // Learning from outcome (if available)
    if (outcome) {
      if (outcome.success) {
        learnings.push('The positive outcome validates my reasoning approach for similar situations.');
      } else {
        learnings.push('The outcome suggests I should refine my reasoning approach for similar future decisions.');
      }
    }

    return learnings.join(' ');
  }

  /**
   * Generate improvement suggestions
   */
  generateImprovementSuggestions(biasesIdentified, knowledgeGaps, informationCompleteness) {
    const suggestions = [];

    // Address biases
    if (biasesIdentified.length > 0) {
      const primaryBias = biasesIdentified[0].split(':')[0];
      suggestions.push(`To reduce ${primaryBias}, I should actively seek disconfirming evidence and alternative viewpoints.`);
    }

    // Address knowledge gaps
    if (knowledgeGaps.length > 0) {
      suggestions.push(`I should gather more information about: ${knowledgeGaps[0].slice(0, 100)}`);
    }

    // Address information completeness
    if (informationCompleteness < 60) {
      suggestions.push('Increase research depth and gather more diverse evidence types before deciding.');
    } else if (informationCompleteness < 80) {
      suggestions.push('Consider seeking expert input or additional data sources.');
    }

    // General improvements
    if (suggestions.length === 0) {
      suggestions.push('Continue current reasoning approach while remaining vigilant for blind spots.');
    }

    suggestions.push('Regularly reflect on decision outcomes to calibrate my reasoning process.');

    return suggestions.join(' ');
  }

  /**
   * Query methods
   */

  async getMetaCognitiveAnalysis(decisionId) {
    const result = await this.db.query(
      'SELECT * FROM metacognitive_analysis WHERE decision_id = $1',
      [decisionId]
    );
    return result.rows[0];
  }

  async getAgentMetaCognitiveTrends(agentId, days = 30) {
    const result = await this.db.query(
      `SELECT
        DATE(analyzed_at) as date,
        COUNT(*) as analysis_count,
        AVG(information_completeness_score) as avg_completeness,
        AVG(array_length(biases_identified, 1)) as avg_biases_per_decision,
        AVG(array_length(knowledge_gaps, 1)) as avg_knowledge_gaps,
        mode() WITHIN GROUP (ORDER BY decision_difficulty) as most_common_difficulty
      FROM metacognitive_analysis
      WHERE agent_id = $1
        AND analyzed_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(analyzed_at)
      ORDER BY date DESC`,
      [agentId]
    );
    return result.rows;
  }

  async getCommonBiases(agentId = null, days = 30) {
    const query = agentId
      ? `SELECT
          unnest(biases_identified) as bias,
          COUNT(*) as frequency
        FROM metacognitive_analysis
        WHERE agent_id = $1
          AND analyzed_at >= NOW() - INTERVAL '${days} days'
        GROUP BY bias
        ORDER BY frequency DESC`
      : `SELECT
          unnest(biases_identified) as bias,
          COUNT(*) as frequency
        FROM metacognitive_analysis
        WHERE analyzed_at >= NOW() - INTERVAL '${days} days'
        GROUP BY bias
        ORDER BY frequency DESC`;

    const params = agentId ? [agentId] : [];
    const result = await this.db.query(query, params);
    return result.rows;
  }
}

// Singleton instance
const metaCognitiveEngine = new MetaCognitiveEngine();

export default metaCognitiveEngine;
