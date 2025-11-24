/**
 * Mistake Learning Service
 * Sprint 46 - Multi-Agent Reflection & Meta-Cognition System
 *
 * Enables agents to:
 * - Detect mistakes in decisions and their outcomes
 * - Classify mistakes by type and category
 * - Analyze root causes of errors
 * - Extract meaningful learnings
 * - Create preventive measures
 * - Share learnings with other agents
 *
 * "Mistakes are the portals of discovery" - James Joyce
 */

import pool from '../db.js';

class MistakeLearningService {
  constructor() {
    this.db = pool;
    this.mistakeCategories = this.initializeMistakeCategories();
  }

  async initialize() {
    // Pool already initialized
  }

  /**
   * Initialize mistake classification categories
   */
  initializeMistakeCategories() {
    return {
      REASONING_ERROR: {
        description: 'Logical fallacy or invalid reasoning',
        indicators: ['fallacy_detected', 'logic_score_low', 'contradictions'],
        severity_default: 'MODERATE'
      },
      KNOWLEDGE_GAP: {
        description: 'Missing critical information',
        indicators: ['low_evidence', 'information_completeness_low', 'unknown_factors'],
        severity_default: 'MAJOR'
      },
      BIAS: {
        description: 'Cognitive bias influenced decision',
        indicators: ['bias_identified', 'one_sided_thinking', 'confirmation_pattern'],
        severity_default: 'MODERATE'
      },
      OVERCONFIDENCE: {
        description: 'Confidence exceeded ability',
        indicators: ['high_confidence_low_quality', 'overconfidence_detected'],
        severity_default: 'MAJOR'
      },
      INCOMPLETE_ANALYSIS: {
        description: 'Insufficient consideration of factors',
        indicators: ['few_reasoning_steps', 'missing_alternatives', 'shallow_depth'],
        severity_default: 'MODERATE'
      },
      WRONG_ASSUMPTION: {
        description: 'Invalid or incorrect assumptions',
        indicators: ['assumption_violated', 'context_mismatch'],
        severity_default: 'MAJOR'
      },
      COMMUNICATION: {
        description: 'Miscommunication or misunderstanding',
        indicators: ['clarity_low', 'misinterpretation'],
        severity_default: 'MINOR'
      },
      OTHER: {
        description: 'Other type of mistake',
        indicators: [],
        severity_default: 'MODERATE'
      }
    };
  }

  /**
   * Detect if a mistake occurred in a decision
   *
   * @param {Object} params - Decision and outcome data
   * @returns {Object} Mistake detection result
   */
  async detectMistake(params) {
    const {
      decision_id,
      agent_id,
      outcome,
      expected_outcome = null,
      feedback = null,
      reasoning_quality = null,
      meta_analysis = null
    } = params;

    // Gather decision data
    const decision = await this.getDecisionData(decision_id);

    // Multiple detection methods
    const detectionResults = {
      outcome_based: this.detectFromOutcome(outcome, expected_outcome),
      feedback_based: this.detectFromFeedback(feedback),
      quality_based: this.detectFromQuality(reasoning_quality, decision),
      bias_based: this.detectFromBiases(meta_analysis)
    };

    // Determine if mistake occurred
    const mistakeDetected = Object.values(detectionResults).some(r => r.detected);

    if (!mistakeDetected) {
      return { mistake_detected: false, confidence: 0.0 };
    }

    // Classify the mistake
    const classification = this.classifyMistake(detectionResults, decision);

    // Analyze root causes
    const rootCauses = this.analyzeRootCauses(
      classification,
      decision,
      detectionResults
    );

    // Extract learning
    const learning = this.extractLearning(
      classification,
      rootCauses,
      decision,
      outcome
    );

    // Create preventive measures
    const preventiveMeasures = this.createPreventiveMeasures(
      classification,
      rootCauses,
      learning
    );

    // Calculate learning impact score
    const impactScore = this.calculateLearningImpact(
      classification.severity,
      learning,
      rootCauses
    );

    // Store in database
    const result = await this.db.query(
      `INSERT INTO mistake_learning_log (
        agent_id,
        decision_id,
        mistake_type,
        mistake_category,
        severity,
        what_went_wrong,
        why_it_happened,
        correct_approach,
        root_causes,
        key_learning,
        preventive_measures,
        learning_impact_score,
        detected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *`,
      [
        agent_id,
        decision_id,
        classification.type,
        classification.category,
        classification.severity,
        classification.what_went_wrong,
        rootCauses.primary_cause,
        learning.correct_approach,
        JSON.stringify(rootCauses.all_causes),
        learning.key_insight,
        JSON.stringify(preventiveMeasures),
        impactScore
      ]
    );

    return {
      mistake_detected: true,
      mistake_log: result.rows[0],
      confidence: this.calculateDetectionConfidence(detectionResults)
    };
  }

  /**
   * Get decision data for analysis
   */
  async getDecisionData(decisionId) {
    const result = await this.db.query(
      `SELECT
        d.*,
        rqs.overall_quality,
        rqs.quality_tier,
        rqs.logic_score,
        rqs.evidence_score,
        rqs.reasoning_strengths,
        rqs.reasoning_weaknesses,
        rqs.fallacies_detected,
        ma.biases_identified,
        ma.assumptions_made,
        ma.knowledge_gaps,
        ma.information_completeness_score
      FROM agent_core.agent_decisions d
      LEFT JOIN reasoning_quality_scores rqs ON d.decision_id = rqs.decision_id
      LEFT JOIN metacognitive_analysis ma ON d.decision_id = ma.decision_id
      WHERE d.decision_id = $1`,
      [decisionId]
    );

    return result.rows[0] || null;
  }

  /**
   * Detect mistake from outcome comparison
   */
  detectFromOutcome(actual, expected) {
    if (!expected) return { detected: false };

    // Simple comparison - in real use, would be more sophisticated
    const mismatch = actual !== expected;

    return {
      detected: mismatch,
      confidence: mismatch ? 0.8 : 0.0,
      reason: mismatch ? 'Actual outcome differs from expected' : null
    };
  }

  /**
   * Detect mistake from feedback
   */
  detectFromFeedback(feedback) {
    if (!feedback) return { detected: false };

    const negativeFeedback = feedback.sentiment === 'negative' ||
                            feedback.rating < 3 ||
                            feedback.issues_identified?.length > 0;

    return {
      detected: negativeFeedback,
      confidence: negativeFeedback ? 0.9 : 0.0,
      reason: negativeFeedback ? 'Negative feedback received' : null
    };
  }

  /**
   * Detect mistake from quality assessment
   */
  detectFromQuality(qualityData, decision) {
    if (!decision) return { detected: false };

    const poorQuality = decision.quality_tier === 'POOR' ||
                       (decision.overall_quality && decision.overall_quality < 50);

    const hasFallacies = decision.fallacies_detected &&
                        decision.fallacies_detected.length > 0;

    const detected = poorQuality || hasFallacies;

    return {
      detected: detected,
      confidence: detected ? 0.7 : 0.0,
      reason: detected
        ? (poorQuality ? 'Poor reasoning quality detected' : 'Logical fallacies found')
        : null
    };
  }

  /**
   * Detect mistake from cognitive biases
   */
  detectFromBiases(metaAnalysis) {
    if (!metaAnalysis) return { detected: false };

    const hasBiases = metaAnalysis.biases_identified &&
                     metaAnalysis.biases_identified.length > 0;

    return {
      detected: hasBiases,
      confidence: hasBiases ? 0.6 : 0.0,
      reason: hasBiases ? 'Cognitive biases influenced decision' : null
    };
  }

  /**
   * Classify the mistake
   */
  classifyMistake(detectionResults, decision) {
    // Determine category based on indicators
    let category = 'OTHER';
    let type = 'Unknown';
    let severity = 'MODERATE';

    // Check each category's indicators
    for (const [cat, config] of Object.entries(this.mistakeCategories)) {
      const indicators = config.indicators;
      const matchCount = indicators.filter(indicator => {
        return this.checkIndicator(indicator, decision, detectionResults);
      }).length;

      if (matchCount > 0 && matchCount >= indicators.length * 0.5) {
        category = cat;
        severity = config.severity_default;
        type = config.description;
        break;
      }
    }

    // Determine what went wrong
    const whatWentWrong = this.describeWhatWentWrong(
      category,
      decision,
      detectionResults
    );

    return {
      category,
      type,
      severity,
      what_went_wrong: whatWentWrong
    };
  }

  /**
   * Check if an indicator is present
   */
  checkIndicator(indicator, decision, detectionResults) {
    switch (indicator) {
      case 'fallacy_detected':
        return decision.fallacies_detected?.length > 0;

      case 'logic_score_low':
        return decision.logic_score && decision.logic_score < 60;

      case 'low_evidence':
        return decision.evidence_score && decision.evidence_score < 50;

      case 'information_completeness_low':
        return decision.information_completeness_score &&
               decision.information_completeness_score < 50;

      case 'bias_identified':
        return decision.biases_identified?.length > 0;

      case 'high_confidence_low_quality':
        return decision.confidence > 0.8 &&
               decision.overall_quality < 60;

      case 'few_reasoning_steps':
        return decision.reasoning_steps?.length < 2;

      case 'shallow_depth':
        return decision.depth_score && decision.depth_score < 60;

      case 'clarity_low':
        return decision.clarity_score && decision.clarity_score < 60;

      default:
        return false;
    }
  }

  /**
   * Describe what went wrong
   */
  describeWhatWentWrong(category, decision, detectionResults) {
    const descriptions = {
      REASONING_ERROR: `Reasoning contained ${decision.fallacies_detected?.length || 0} logical fallacy(ies): ${decision.fallacies_detected?.[0] || 'unknown'}`,
      KNOWLEDGE_GAP: `Decision made with incomplete information (completeness: ${decision.information_completeness_score || 'unknown'}%)`,
      BIAS: `Decision influenced by cognitive bias: ${decision.biases_identified?.[0] || 'unknown'}`,
      OVERCONFIDENCE: `Overconfident (${Math.round((decision.confidence || 0) * 100)}% confidence) despite low quality (${decision.overall_quality || 'unknown'})`,
      INCOMPLETE_ANALYSIS: `Insufficient analysis depth (${decision.reasoning_steps?.length || 0} reasoning steps)`,
      WRONG_ASSUMPTION: `Key assumptions were incorrect or invalid`,
      COMMUNICATION: `Communication clarity was insufficient (clarity score: ${decision.clarity_score || 'unknown'})`,
      OTHER: detectionResults.outcome_based?.reason ||
             detectionResults.feedback_based?.reason ||
             'Unclassified mistake occurred'
    };

    return descriptions[category] || descriptions.OTHER;
  }

  /**
   * Analyze root causes
   */
  analyzeRootCauses(classification, decision, detectionResults) {
    const causes = [];

    // Immediate cause
    causes.push({
      level: 'immediate',
      cause: classification.what_went_wrong,
      evidence: 'Direct observation'
    });

    // Contributing causes
    if (decision.knowledge_gaps?.length > 0) {
      causes.push({
        level: 'contributing',
        cause: `Knowledge gaps: ${decision.knowledge_gaps[0]}`,
        evidence: 'Meta-cognitive analysis'
      });
    }

    if (decision.biases_identified?.length > 0) {
      causes.push({
        level: 'contributing',
        cause: `Cognitive bias: ${decision.biases_identified[0]}`,
        evidence: 'Bias detection'
      });
    }

    if (decision.reasoning_weaknesses?.length > 0) {
      causes.push({
        level: 'contributing',
        cause: `Reasoning weakness: ${decision.reasoning_weaknesses[0]}`,
        evidence: 'Quality assessment'
      });
    }

    // Systemic causes
    if (decision.overall_quality < 50) {
      causes.push({
        level: 'systemic',
        cause: 'Overall low reasoning quality',
        evidence: 'Quality scoring system'
      });
    }

    // Primary cause is the first one
    const primaryCause = causes[0]?.cause || 'Unknown cause';

    return {
      primary_cause: primaryCause,
      all_causes: causes
    };
  }

  /**
   * Extract learning from the mistake
   */
  extractLearning(classification, rootCauses, decision, outcome) {
    // Generate key insight
    const keyInsight = this.generateKeyInsight(
      classification.category,
      rootCauses.primary_cause
    );

    // Determine correct approach
    const correctApproach = this.determineCorrectApproach(
      classification.category,
      decision,
      outcome
    );

    // What to do differently
    const whatToDoDifferently = this.generateWhatToDoDifferently(
      classification.category,
      rootCauses
    );

    return {
      key_insight: keyInsight,
      correct_approach: correctApproach,
      what_to_do_differently: whatToDoDifferently
    };
  }

  /**
   * Generate key insight from the mistake
   */
  generateKeyInsight(category, primaryCause) {
    const insights = {
      REASONING_ERROR: `Logical reasoning must be validated before finalizing decisions. ${primaryCause}`,
      KNOWLEDGE_GAP: `Decisions should acknowledge and address information gaps. ${primaryCause}`,
      BIAS: `Active bias checking is essential for objective decisions. ${primaryCause}`,
      OVERCONFIDENCE: `Confidence must be calibrated to evidence and analysis quality. ${primaryCause}`,
      INCOMPLETE_ANALYSIS: `Thorough analysis prevents oversights. ${primaryCause}`,
      WRONG_ASSUMPTION: `Assumptions must be explicitly validated. ${primaryCause}`,
      COMMUNICATION: `Clear communication is critical for shared understanding. ${primaryCause}`,
      OTHER: `Careful decision-making process prevents errors. ${primaryCause}`
    };

    return insights[category] || insights.OTHER;
  }

  /**
   * Determine correct approach
   */
  determineCorrectApproach(category, decision, outcome) {
    const approaches = {
      REASONING_ERROR: 'Use structured reasoning framework, check for fallacies before finalizing',
      KNOWLEDGE_GAP: 'Identify and fill critical information gaps before deciding, or acknowledge uncertainty',
      BIAS: 'Actively seek disconfirming evidence, use bias checklist',
      OVERCONFIDENCE: 'Match confidence to evidence quality, seek peer review when uncertain',
      INCOMPLETE_ANALYSIS: 'Use decision template with minimum analysis requirements',
      WRONG_ASSUMPTION: 'Explicitly state and validate assumptions with evidence',
      COMMUNICATION: 'Review clarity, seek confirmation of understanding',
      OTHER: 'Follow systematic decision-making process with quality checks'
    };

    return approaches[category] || approaches.OTHER;
  }

  /**
   * Generate what to do differently
   */
  generateWhatToDoDifferently(category, rootCauses) {
    const actions = [];

    // Category-specific actions
    switch (category) {
      case 'REASONING_ERROR':
        actions.push('Review logical reasoning principles');
        actions.push('Use fallacy checklist before finalizing decisions');
        break;

      case 'KNOWLEDGE_GAP':
        actions.push('Create information needs assessment checklist');
        actions.push('Flag decisions with high uncertainty');
        break;

      case 'BIAS':
        actions.push('Apply bias detection tools proactively');
        actions.push('Seek diverse perspectives');
        break;

      case 'OVERCONFIDENCE':
        actions.push('Calibrate confidence to quality scores');
        actions.push('Implement confidence calibration checkpoints');
        break;

      case 'INCOMPLETE_ANALYSIS':
        actions.push('Use minimum analysis depth requirements');
        actions.push('Consider at least 2 alternatives');
        break;

      case 'WRONG_ASSUMPTION':
        actions.push('Document all assumptions explicitly');
        actions.push('Validate critical assumptions');
        break;

      case 'COMMUNICATION':
        actions.push('Review and simplify explanations');
        actions.push('Confirm understanding with stakeholders');
        break;

      default:
        actions.push('Apply systematic decision-making process');
        actions.push('Increase quality checks');
    }

    return actions;
  }

  /**
   * Create preventive measures
   */
  createPreventiveMeasures(classification, rootCauses, learning) {
    const measures = [];

    // Immediate preventive measures
    measures.push({
      type: 'immediate',
      action: learning.what_to_do_differently[0],
      when: 'Before next similar decision',
      priority: 'high'
    });

    // Short-term measures
    measures.push({
      type: 'short_term',
      action: 'Review this mistake weekly until pattern breaks',
      when: 'Weekly review',
      priority: 'medium'
    });

    // Long-term measures
    measures.push({
      type: 'long_term',
      action: this.getLongTermPrevention(classification.category),
      when: 'Ongoing practice',
      priority: 'medium'
    });

    // Systemic measures if applicable
    if (rootCauses.all_causes.some(c => c.level === 'systemic')) {
      measures.push({
        type: 'systemic',
        action: 'Improve overall reasoning quality through training',
        when: 'Continuous',
        priority: 'high'
      });
    }

    return measures;
  }

  getLongTermPrevention(category) {
    const preventions = {
      REASONING_ERROR: 'Develop strong logical reasoning habits through regular practice',
      KNOWLEDGE_GAP: 'Build comprehensive information gathering routines',
      BIAS: 'Cultivate awareness of personal bias patterns',
      OVERCONFIDENCE: 'Develop accurate self-assessment capabilities',
      INCOMPLETE_ANALYSIS: 'Establish thorough analysis as default practice',
      WRONG_ASSUMPTION: 'Make assumption validation a standard step',
      COMMUNICATION: 'Improve communication skills continuously',
      OTHER: 'Strengthen general decision-making capabilities'
    };
    return preventions[category] || preventions.OTHER;
  }

  /**
   * Calculate learning impact score
   */
  calculateLearningImpact(severity, learning, rootCauses) {
    let score = 5.0; // Base score

    // Severity impact
    const severityBonus = {
      CRITICAL: 3.0,
      MAJOR: 2.0,
      MODERATE: 1.0,
      MINOR: 0.5
    };
    score += severityBonus[severity] || 1.0;

    // Number of actions
    score += learning.what_to_do_differently.length * 0.5;

    // Systemic causes have higher impact
    const hasSystemicCause = rootCauses.all_causes.some(c => c.level === 'systemic');
    if (hasSystemicCause) score += 1.5;

    return Math.min(10.0, score);
  }

  /**
   * Calculate detection confidence
   */
  calculateDetectionConfidence(detectionResults) {
    const confidences = Object.values(detectionResults)
      .filter(r => r.detected)
      .map(r => r.confidence);

    if (confidences.length === 0) return 0.0;

    // Average of detected confidences
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    // Boost if multiple detection methods agree
    const boost = Math.min(confidences.length * 0.1, 0.3);

    return Math.min(1.0, avgConfidence + boost);
  }

  /**
   * Share learning with other agents
   */
  async shareLearning(mistakeLogId, targetAgentIds) {
    // Get the mistake log
    const mistakeResult = await this.db.query(
      'SELECT * FROM mistake_learning_log WHERE id = $1',
      [mistakeLogId]
    );

    if (mistakeResult.rows.length === 0) {
      throw new Error('Mistake log not found');
    }

    const mistake = mistakeResult.rows[0];

    // Update shared_with_agents
    const currentShared = mistake.shared_with_agents || [];
    const newShared = [...new Set([...currentShared, ...targetAgentIds])];

    await this.db.query(
      'UPDATE mistake_learning_log SET shared_with_agents = $1 WHERE id = $2',
      [newShared, mistakeLogId]
    );

    return {
      shared_count: newShared.length,
      newly_shared: targetAgentIds.length,
      learning: {
        category: mistake.mistake_category,
        key_learning: mistake.key_learning,
        preventive_measures: mistake.preventive_measures
      }
    };
  }

  /**
   * Mark learning as applied successfully
   */
  async markLearningApplied(mistakeLogId, success = true) {
    await this.db.query(
      'UPDATE mistake_learning_log SET applied_successfully = $1 WHERE id = $2',
      [success, mistakeLogId]
    );

    return { success };
  }

  /**
   * Query methods
   */

  async getMistakesByAgent(agentId, limit = 20) {
    const result = await this.db.query(
      `SELECT * FROM mistake_learning_log
       WHERE agent_id = $1
       ORDER BY detected_at DESC
       LIMIT $2`,
      [agentId, limit]
    );
    return result.rows;
  }

  async getMistakesByCategory(agentId, category) {
    const result = await this.db.query(
      `SELECT * FROM mistake_learning_log
       WHERE agent_id = $1 AND mistake_category = $2
       ORDER BY detected_at DESC`,
      [agentId, category]
    );
    return result.rows;
  }

  async getHighImpactLearnings(agentId, minImpact = 7.0) {
    const result = await this.db.query(
      `SELECT * FROM mistake_learning_log
       WHERE agent_id = $1 AND learning_impact_score >= $2
       ORDER BY learning_impact_score DESC`,
      [agentId, minImpact]
    );
    return result.rows;
  }

  async getSharedLearnings(agentId) {
    const result = await this.db.query(
      `SELECT * FROM mistake_learning_log
       WHERE $1 = ANY(shared_with_agents)
       ORDER BY learning_impact_score DESC`,
      [agentId]
    );
    return result.rows;
  }
}

// Singleton instance
const mistakeLearningService = new MistakeLearningService();

export default mistakeLearningService;
