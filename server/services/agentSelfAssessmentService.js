/**
 * Agent Self-Assessment Service
 * Sprint 46 - Multi-Agent Reflection & Meta-Cognition System
 *
 * Enables agents to:
 * - Evaluate their own performance across multiple dimensions
 * - Identify strengths and weaknesses
 * - Calibrate confidence against actual performance
 * - Set learning goals and create improvement action plans
 * - Track progress over time
 *
 * Self-awareness is key to continuous improvement!
 */

import pool from '../db.js';

class AgentSelfAssessmentService {
  constructor() {
    this.db = pool;
    this.performanceDimensions = this.initializePerformanceDimensions();
  }

  async initialize() {
    // Pool already initialized
  }

  /**
   * Initialize performance evaluation dimensions
   */
  initializePerformanceDimensions() {
    return {
      DECISION_QUALITY: {
        weight: 0.30,
        description: 'Quality of decisions made',
        metrics: ['reasoning_quality', 'outcome_accuracy', 'consistency']
      },
      LEARNING_PROGRESS: {
        weight: 0.25,
        description: 'Rate of learning and improvement',
        metrics: ['mistakes_learned_from', 'knowledge_growth', 'adaptation_speed']
      },
      COLLABORATION: {
        weight: 0.20,
        description: 'Effectiveness in working with other agents',
        metrics: ['consensus_building', 'communication_clarity', 'team_contribution']
      },
      ADAPTABILITY: {
        weight: 0.15,
        description: 'Ability to handle new situations',
        metrics: ['flexibility', 'resilience', 'innovation']
      },
      EFFICIENCY: {
        weight: 0.10,
        description: 'Resource usage and speed',
        metrics: ['decision_speed', 'resource_optimization', 'task_completion_rate']
      }
    };
  }

  /**
   * Generate comprehensive self-assessment for an agent
   *
   * @param {Object} params - Assessment parameters
   * @returns {Object} Self-assessment results
   */
  async generateSelfAssessment(params) {
    const {
      agent_id,
      period_days = 30,
      assessment_date = new Date()
    } = params;

    const periodStart = new Date(assessment_date);
    periodStart.setDate(periodStart.getDate() - period_days);

    // 1. Gather performance data
    const performanceData = await this.gatherPerformanceData(agent_id, periodStart, assessment_date);

    // 2. Calculate performance ratings across dimensions
    const ratings = await this.calculatePerformanceRatings(performanceData);

    // 3. Identify strengths and weaknesses
    const strengths = this.identifyStrengths(ratings, performanceData);
    const weaknesses = this.identifyWeaknesses(ratings, performanceData);

    // 4. Calibrate confidence
    const calibration = this.calibrateConfidence(performanceData);

    // 5. Set learning goals based on weaknesses
    const learningGoals = this.setLearningGoals(weaknesses, ratings);

    // 6. Create action plan
    const actionPlan = this.createActionPlan(learningGoals, weaknesses, strengths);

    // 7. Calculate overall performance rating
    const overallRating = this.calculateOverallRating(ratings);

    // 8. Store assessment in database
    const result = await this.db.query(
      `INSERT INTO agent_self_assessments (
        agent_id,
        assessment_period_start,
        assessment_period_end,
        overall_performance_rating,
        decision_quality_rating,
        learning_progress_rating,
        collaboration_rating,
        adaptability_rating,
        efficiency_rating,
        identified_strengths,
        identified_weaknesses,
        learning_goals,
        action_plan,
        confidence_calibration_score,
        overconfidence_instances,
        underconfidence_instances,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      RETURNING *`,
      [
        agent_id,
        periodStart,
        assessment_date,
        overallRating,
        ratings.decision_quality,
        ratings.learning_progress,
        ratings.collaboration,
        ratings.adaptability,
        ratings.efficiency,
        JSON.stringify(strengths),
        JSON.stringify(weaknesses),
        JSON.stringify(learningGoals),
        JSON.stringify(actionPlan),
        calibration.score,
        calibration.overconfidence_count,
        calibration.underconfidence_count
      ]
    );

    return result.rows[0];
  }

  /**
   * Gather performance data for the assessment period
   */
  async gatherPerformanceData(agentId, startDate, endDate) {
    // Get decisions made during period
    const decisionsResult = await this.db.query(
      `SELECT
        d.*,
        rqs.overall_quality as reasoning_quality,
        rqs.quality_tier,
        ma.biases_identified,
        ma.information_completeness_score
      FROM agent_core.agent_decisions d
      LEFT JOIN reasoning_quality_scores rqs ON d.decision_id = rqs.decision_id
      LEFT JOIN metacognitive_analysis ma ON d.decision_id = ma.decision_id
      WHERE d.agent_id = $1
        AND d.created_at BETWEEN $2 AND $3
      ORDER BY d.created_at DESC`,
      [agentId, startDate, endDate]
    );

    // Get reflections during period
    const reflectionsResult = await this.db.query(
      `SELECT * FROM agent_reflections
       WHERE agent_id = $1
         AND created_at BETWEEN $2 AND $3`,
      [agentId, startDate, endDate]
    );

    // Get mistakes logged during period
    const mistakesResult = await this.db.query(
      `SELECT * FROM mistake_learning_log
       WHERE agent_id = $1
         AND detected_at BETWEEN $2 AND $3`,
      [agentId, startDate, endDate]
    );

    // Get collaborative decisions
    const collaborationsResult = await this.db.query(
      `SELECT * FROM collaborative_decisions
       WHERE lead_agent_id = $1 OR $1 = ANY(participating_agents)
         AND created_at BETWEEN $2 AND $3`,
      [agentId, startDate, endDate]
    );

    return {
      decisions: decisionsResult.rows,
      reflections: reflectionsResult.rows,
      mistakes: mistakesResult.rows,
      collaborations: collaborationsResult.rows,
      period_days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
    };
  }

  /**
   * Calculate performance ratings across all dimensions
   */
  calculatePerformanceRatings(performanceData) {
    const { decisions, reflections, mistakes, collaborations } = performanceData;

    // Decision Quality Rating
    const decisionQuality = this.calculateDecisionQualityRating(decisions);

    // Learning Progress Rating
    const learningProgress = this.calculateLearningProgressRating(
      decisions,
      reflections,
      mistakes
    );

    // Collaboration Rating
    const collaboration = this.calculateCollaborationRating(collaborations, decisions);

    // Adaptability Rating
    const adaptability = this.calculateAdaptabilityRating(decisions, mistakes);

    // Efficiency Rating
    const efficiency = this.calculateEfficiencyRating(decisions, performanceData.period_days);

    return {
      decision_quality: Math.round(decisionQuality),
      learning_progress: Math.round(learningProgress),
      collaboration: Math.round(collaboration),
      adaptability: Math.round(adaptability),
      efficiency: Math.round(efficiency)
    };
  }

  /**
   * Calculate decision quality rating
   */
  calculateDecisionQualityRating(decisions) {
    if (decisions.length === 0) return 50; // Neutral rating

    // Average reasoning quality
    const qualityScores = decisions
      .filter(d => d.reasoning_quality !== null)
      .map(d => d.reasoning_quality);

    if (qualityScores.length === 0) return 50;

    const avgQuality = qualityScores.reduce((sum, q) => sum + q, 0) / qualityScores.length;

    // Factor in consistency (low variance is good)
    const variance = qualityScores.reduce((sum, q) =>
      sum + Math.pow(q - avgQuality, 2), 0
    ) / qualityScores.length;
    const stdDev = Math.sqrt(variance);
    const consistencyBonus = Math.max(0, 10 - (stdDev / 2)); // Up to +10 for consistency

    return Math.min(100, avgQuality + consistencyBonus);
  }

  /**
   * Calculate learning progress rating
   */
  calculateLearningProgressRating(decisions, reflections, mistakes) {
    let score = 50; // Base score

    // Factor 1: Reflection frequency (shows active learning)
    const reflectionRate = reflections.length / Math.max(decisions.length, 1);
    score += Math.min(reflectionRate * 20, 20); // Up to +20

    // Factor 2: Mistakes learned from
    const mistakesWithLearning = mistakes.filter(m =>
      m.key_learning && m.key_learning.length > 0
    ).length;
    const learningRate = mistakes.length > 0
      ? mistakesWithLearning / mistakes.length
      : 0.5;
    score += learningRate * 15; // Up to +15

    // Factor 3: Quality improvement trend
    if (decisions.length >= 5) {
      const firstHalf = decisions.slice(Math.floor(decisions.length / 2))
        .filter(d => d.reasoning_quality)
        .map(d => d.reasoning_quality);
      const secondHalf = decisions.slice(0, Math.floor(decisions.length / 2))
        .filter(d => d.reasoning_quality)
        .map(d => d.reasoning_quality);

      if (firstHalf.length > 0 && secondHalf.length > 0) {
        const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        const improvement = avgSecond - avgFirst;
        score += Math.min(Math.max(improvement / 2, -10), 15); // -10 to +15
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate collaboration rating
   */
  calculateCollaborationRating(collaborations, decisions) {
    if (collaborations.length === 0) return 60; // Neutral (not all agents collaborate)

    let score = 50;

    // Factor 1: Collaboration frequency
    const collabRate = collaborations.length / Math.max(decisions.length, 1);
    score += Math.min(collabRate * 100, 20); // Up to +20

    // Factor 2: Consensus success
    const successfulConsensus = collaborations.filter(c =>
      c.agreement_level && c.agreement_level > 0.7
    ).length;
    const consensusRate = successfulConsensus / collaborations.length;
    score += consensusRate * 20; // Up to +20

    // Factor 3: Leadership (being lead agent)
    const ledCount = collaborations.filter(c => c.lead_agent_id).length;
    const leadershipScore = Math.min((ledCount / collaborations.length) * 10, 10);
    score += leadershipScore; // Up to +10

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate adaptability rating
   */
  calculateAdaptabilityRating(decisions, mistakes) {
    let score = 60; // Base score

    // Factor 1: Decision type diversity
    const decisionTypes = new Set(decisions.map(d => d.decision_type));
    score += Math.min(decisionTypes.size * 5, 20); // Up to +20

    // Factor 2: Recovery from mistakes (quick learning)
    const mistakesWithQuickFix = mistakes.filter(m =>
      m.applied_successfully === true
    ).length;
    if (mistakes.length > 0) {
      const recoveryRate = mistakesWithQuickFix / mistakes.length;
      score += recoveryRate * 15; // Up to +15
    }

    // Factor 3: Handling low confidence situations
    const lowConfidenceDecisions = decisions.filter(d =>
      d.confidence && d.confidence < 0.6
    );
    if (lowConfidenceDecisions.length > 0) {
      const lowConfHandled = lowConfidenceDecisions.filter(d =>
        d.reasoning_quality && d.reasoning_quality >= 70
      ).length;
      const handlingRate = lowConfHandled / lowConfidenceDecisions.length;
      score += handlingRate * 10; // Up to +10
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate efficiency rating
   */
  calculateEfficiencyRating(decisions, periodDays) {
    let score = 60; // Base score

    // Factor 1: Decision throughput
    const decisionsPerDay = decisions.length / periodDays;
    score += Math.min(decisionsPerDay * 10, 20); // Up to +20

    // Factor 2: High-quality rapid decisions
    const quickQualityDecisions = decisions.filter(d =>
      d.reasoning_quality && d.reasoning_quality >= 75
    ).length;
    const qualityRate = decisions.length > 0
      ? quickQualityDecisions / decisions.length
      : 0;
    score += qualityRate * 20; // Up to +20

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Identify agent's strengths
   */
  identifyStrengths(ratings, performanceData) {
    const strengths = [];

    // Check each dimension
    for (const [dimension, rating] of Object.entries(ratings)) {
      if (rating >= 80) {
        const dimensionName = dimension.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        strengths.push({
          area: dimensionName,
          rating: rating,
          evidence: this.getStrengthEvidence(dimension, performanceData),
          confidence: 'high'
        });
      } else if (rating >= 70) {
        const dimensionName = dimension.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        strengths.push({
          area: dimensionName,
          rating: rating,
          evidence: this.getStrengthEvidence(dimension, performanceData),
          confidence: 'medium'
        });
      }
    }

    return strengths;
  }

  getStrengthEvidence(dimension, data) {
    const { decisions } = data;

    switch (dimension) {
      case 'decision_quality':
        const excellentDecisions = decisions.filter(d => d.quality_tier === 'EXCELLENT').length;
        return `${excellentDecisions} excellent-quality decisions`;

      case 'learning_progress':
        return `${data.reflections.length} reflections, continuous improvement trend`;

      case 'collaboration':
        return `${data.collaborations.length} successful collaborations`;

      case 'adaptability':
        const types = new Set(decisions.map(d => d.decision_type)).size;
        return `Handled ${types} different decision types`;

      case 'efficiency':
        return `${decisions.length} decisions in period`;

      default:
        return 'Strong performance observed';
    }
  }

  /**
   * Identify agent's weaknesses
   */
  identifyWeaknesses(ratings, performanceData) {
    const weaknesses = [];

    for (const [dimension, rating] of Object.entries(ratings)) {
      if (rating < 60) {
        const dimensionName = dimension.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        weaknesses.push({
          area: dimensionName,
          rating: rating,
          severity: 'high',
          impact: this.getWeaknessImpact(dimension),
          root_cause: this.identifyWeaknessRootCause(dimension, performanceData)
        });
      } else if (rating < 70) {
        const dimensionName = dimension.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        weaknesses.push({
          area: dimensionName,
          rating: rating,
          severity: 'medium',
          impact: this.getWeaknessImpact(dimension),
          root_cause: this.identifyWeaknessRootCause(dimension, performanceData)
        });
      }
    }

    return weaknesses;
  }

  getWeaknessImpact(dimension) {
    const impacts = {
      decision_quality: 'Affects reliability and trustworthiness of decisions',
      learning_progress: 'Limits future improvement and skill development',
      collaboration: 'Reduces effectiveness in team environments',
      adaptability: 'Struggles with novel or changing situations',
      efficiency: 'Slower decision-making and resource usage'
    };
    return impacts[dimension] || 'Impacts overall performance';
  }

  identifyWeaknessRootCause(dimension, data) {
    const { decisions, mistakes } = data;

    switch (dimension) {
      case 'decision_quality':
        const poorDecisions = decisions.filter(d => d.quality_tier === 'POOR').length;
        if (poorDecisions > decisions.length * 0.3) {
          return 'High rate of poor-quality decisions';
        }
        return 'Inconsistent reasoning quality';

      case 'learning_progress':
        if (data.reflections.length < decisions.length * 0.1) {
          return 'Insufficient reflection on decisions';
        }
        return 'Limited learning from mistakes';

      case 'collaboration':
        if (data.collaborations.length === 0) {
          return 'No collaborative decisions attempted';
        }
        return 'Difficulty reaching consensus';

      case 'adaptability':
        const types = new Set(decisions.map(d => d.decision_type)).size;
        if (types <= 2) {
          return 'Limited exposure to diverse situations';
        }
        return 'Struggles with uncertain situations';

      case 'efficiency':
        if (decisions.length < 5) {
          return 'Low decision throughput';
        }
        return 'Trade-off between speed and quality';

      default:
        return 'Requires further analysis';
    }
  }

  /**
   * Calibrate confidence against actual performance
   */
  calibrateConfidence(performanceData) {
    const { decisions } = performanceData;

    const decisionsWithBoth = decisions.filter(d =>
      d.confidence !== null && d.reasoning_quality !== null
    );

    if (decisionsWithBoth.length === 0) {
      return {
        score: 0.5,
        overconfidence_count: 0,
        underconfidence_count: 0
      };
    }

    let overconfidenceCount = 0;
    let underconfidenceCount = 0;
    let totalCalibration = 0;

    decisionsWithBoth.forEach(decision => {
      const confidence = decision.confidence;
      const actualPerformance = decision.reasoning_quality / 100; // Normalize to 0-1

      const diff = confidence - actualPerformance;
      totalCalibration += Math.abs(diff);

      if (diff > 0.15) overconfidenceCount++; // Confidence > Performance + threshold
      if (diff < -0.15) underconfidenceCount++; // Confidence < Performance - threshold
    });

    const avgCalibration = 1 - (totalCalibration / decisionsWithBoth.length);

    return {
      score: Math.max(0, Math.min(1, avgCalibration)),
      overconfidence_count: overconfidenceCount,
      underconfidence_count: underconfidenceCount
    };
  }

  /**
   * Set learning goals based on weaknesses
   */
  setLearningGoals(weaknesses, ratings) {
    const goals = [];

    weaknesses.forEach(weakness => {
      const dimensionKey = weakness.area.toLowerCase().replace(/ /g, '_');
      const currentRating = weakness.rating;
      // Ensure target always exceeds current by at least 5 points
      const improvement = Math.max(10, 20 - Math.floor(currentRating / 10));
      const targetRating = Math.min(currentRating + improvement, 95);

      goals.push({
        area: weakness.area,
        current_level: currentRating,
        target_level: targetRating,
        priority: weakness.severity === 'high' ? 'high' : 'medium',
        timeframe: weakness.severity === 'high' ? '2 weeks' : '1 month',
        success_criteria: this.getSuccessCriteria(dimensionKey, targetRating)
      });
    });

    // Add aspirational goal for top strength
    const topStrength = Object.entries(ratings).sort((a, b) => b[1] - a[1])[0];
    if (topStrength && topStrength[1] >= 70 && topStrength[1] < 95) {
      const dimensionName = topStrength[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const improvement = Math.min(10, 95 - topStrength[1]); // Ensure we don't exceed 95
      goals.push({
        area: dimensionName,
        current_level: topStrength[1],
        target_level: topStrength[1] + improvement,
        priority: 'low',
        timeframe: '2 months',
        success_criteria: 'Maintain excellence and mentor others',
        type: 'aspirational'
      });
    }

    return goals;
  }

  getSuccessCriteria(dimension, targetRating) {
    const criteria = {
      decision_quality: `Achieve ${targetRating}+ average reasoning quality score`,
      learning_progress: `Reflect on ${targetRating}% of decisions, show upward trend`,
      collaboration: `Participate in ${Math.floor(targetRating / 20)} collaborative decisions`,
      adaptability: `Handle ${Math.floor(targetRating / 20)} different decision types successfully`,
      efficiency: `Maintain ${targetRating}+ quality while improving throughput`
    };
    return criteria[dimension] || `Reach ${targetRating}+ rating in this area`;
  }

  /**
   * Create action plan for achieving goals
   */
  createActionPlan(learningGoals, weaknesses, strengths) {
    const actionSteps = [];

    // For each weakness/goal, create specific actions
    learningGoals.forEach((goal, index) => {
      const steps = this.generateActionSteps(goal, weaknesses, strengths);
      actionSteps.push({
        goal: goal.area,
        priority: goal.priority,
        steps: steps,
        estimated_effort: this.estimateEffort(steps),
        dependencies: index > 0 ? [actionSteps[index - 1].goal] : []
      });
    });

    return actionSteps;
  }

  generateActionSteps(goal, weaknesses, strengths) {
    const dimensionKey = goal.area.toLowerCase().replace(/ /g, '_');
    const weakness = weaknesses.find(w => w.area === goal.area);

    const steps = [];

    // Step 1: Address root cause
    if (weakness && weakness.root_cause) {
      steps.push({
        action: `Address: ${weakness.root_cause}`,
        method: this.getMethodForRootCause(dimensionKey, weakness.root_cause),
        frequency: 'daily'
      });
    }

    // Step 2: Leverage strengths
    const relatedStrength = strengths.find(s =>
      this.areDimensionsRelated(s.area, goal.area)
    );
    if (relatedStrength) {
      steps.push({
        action: `Leverage your strength in ${relatedStrength.area}`,
        method: 'Apply successful patterns from strength area to weakness area',
        frequency: 'weekly'
      });
    }

    // Step 3: Specific practice
    steps.push({
      action: this.getSpecificPractice(dimensionKey),
      method: 'Deliberate practice with feedback',
      frequency: goal.priority === 'high' ? 'daily' : 'weekly'
    });

    // Step 4: Track and reflect
    steps.push({
      action: 'Track progress and reflect on improvements',
      method: 'Weekly self-assessment and adjustment',
      frequency: 'weekly'
    });

    return steps;
  }

  getMethodForRootCause(dimension, rootCause) {
    if (rootCause.includes('Insufficient reflection')) {
      return 'Reflect on every decision immediately after making it';
    }
    if (rootCause.includes('No collaborative')) {
      return 'Initiate at least one collaborative decision per week';
    }
    if (rootCause.includes('Low decision throughput')) {
      return 'Set daily decision-making targets';
    }
    if (rootCause.includes('poor-quality')) {
      return 'Use reasoning quality checklist before finalizing decisions';
    }
    return 'Systematic practice and feedback';
  }

  areDimensionsRelated(dimension1, dimension2) {
    const related = {
      'Decision Quality': ['Learning Progress', 'Adaptability'],
      'Learning Progress': ['Decision Quality', 'Adaptability'],
      'Collaboration': ['Efficiency'],
      'Adaptability': ['Decision Quality', 'Learning Progress'],
      'Efficiency': ['Decision Quality']
    };
    return related[dimension1]?.includes(dimension2) || false;
  }

  getSpecificPractice(dimension) {
    const practices = {
      decision_quality: 'Review 3 past decisions daily, identify reasoning improvements',
      learning_progress: 'Document one new learning from each decision',
      collaboration: 'Seek collaborative opportunities, practice consensus building',
      adaptability: 'Tackle unfamiliar decision types, embrace uncertainty',
      efficiency: 'Time-box decisions, use templates for common patterns'
    };
    return practices[dimension] || 'Practice targeted skills daily';
  }

  estimateEffort(steps) {
    const totalMinutesPerWeek = steps.reduce((total, step) => {
      if (step.frequency === 'daily') return total + (15 * 7); // 15 min/day
      if (step.frequency === 'weekly') return total + 30; // 30 min/week
      return total + 10; // Default
    }, 0);

    if (totalMinutesPerWeek < 60) return 'low'; // < 1 hour/week
    if (totalMinutesPerWeek < 180) return 'medium'; // 1-3 hours/week
    return 'high'; // > 3 hours/week
  }

  /**
   * Calculate overall performance rating
   */
  calculateOverallRating(ratings) {
    const dimensions = this.performanceDimensions;
    let weightedSum = 0;

    for (const [key, dimension] of Object.entries(dimensions)) {
      const ratingKey = key.toLowerCase();
      const rating = ratings[ratingKey] || 50;
      weightedSum += rating * dimension.weight;
    }

    return Math.round(weightedSum);
  }

  /**
   * Query methods
   */

  async getLatestAssessment(agentId) {
    const result = await this.db.query(
      `SELECT * FROM agent_self_assessments
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [agentId]
    );
    return result.rows[0];
  }

  async getAssessmentHistory(agentId, limit = 10) {
    const result = await this.db.query(
      `SELECT * FROM agent_self_assessments
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [agentId, limit]
    );
    return result.rows;
  }

  async getProgressTrend(agentId) {
    const result = await this.db.query(
      `SELECT
        assessment_period_end as date,
        overall_performance_rating,
        decision_quality_rating,
        learning_progress_rating,
        confidence_calibration_score
      FROM agent_self_assessments
      WHERE agent_id = $1
      ORDER BY assessment_period_end ASC`,
      [agentId]
    );
    return result.rows;
  }
}

// Singleton instance
const agentSelfAssessmentService = new AgentSelfAssessmentService();

export default agentSelfAssessmentService;
