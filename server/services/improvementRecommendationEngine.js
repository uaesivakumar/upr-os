/**
 * Improvement Recommendation Engine
 *
 * Generates personalized, data-driven improvement recommendations for agents.
 * Prioritizes recommendations, creates implementation plans, and tracks impact.
 *
 * Sprint 46 - Meta-Cognitive Reflection System
 * Phase 3: Analytics & Continuous Improvement
 */

import pool from '../db.js';

class ImprovementRecommendationEngine {
  constructor() {
    this.db = pool;
    this.recommendationTypes = this.initializeRecommendationTypes();
    this.priorityFactors = this.initializePriorityFactors();
  }

  async initialize() {
    // Pool already initialized
  }

  /**
   * Initialize recommendation types
   */
  initializeRecommendationTypes() {
    return {
      SKILL_DEVELOPMENT: {
        description: 'Develop specific skills or capabilities',
        typical_duration: '2-4 weeks',
        effort_level: 'medium'
      },
      PROCESS_IMPROVEMENT: {
        description: 'Improve existing processes or workflows',
        typical_duration: '1-2 weeks',
        effort_level: 'low'
      },
      BEHAVIOR_CHANGE: {
        description: 'Modify behaviors or habits',
        typical_duration: '3-6 weeks',
        effort_level: 'high'
      },
      KNOWLEDGE_ACQUISITION: {
        description: 'Learn new information or frameworks',
        typical_duration: '1-3 weeks',
        effort_level: 'medium'
      },
      COLLABORATION_ENHANCEMENT: {
        description: 'Improve teamwork and collaboration',
        typical_duration: '2-3 weeks',
        effort_level: 'medium'
      },
      EFFICIENCY_OPTIMIZATION: {
        description: 'Optimize speed and resource usage',
        typical_duration: '1-2 weeks',
        effort_level: 'low'
      },
      QUALITY_ENHANCEMENT: {
        description: 'Improve quality and accuracy',
        typical_duration: '2-4 weeks',
        effort_level: 'medium'
      }
    };
  }

  /**
   * Initialize priority factors
   */
  initializePriorityFactors() {
    return {
      IMPACT: { weight: 0.35, description: 'Expected impact on performance' },
      URGENCY: { weight: 0.25, description: 'How soon this needs addressing' },
      FEASIBILITY: { weight: 0.20, description: 'Ease of implementation' },
      ALIGNMENT: { weight: 0.15, description: 'Alignment with agent goals' },
      DEPENDENCY: { weight: 0.05, description: 'Prerequisite for other improvements' }
    };
  }

  /**
   * Generate personalized recommendations for an agent
   */
  async generateRecommendations(params) {
    const {
      agent_id,
      analytics_data = null,
      performance_data = null,
      goals = [],
      max_recommendations = 10
    } = params;

    // Analyze current state
    const currentState = this.analyzeCurrentState(analytics_data, performance_data);

    // Identify improvement areas
    const improvementAreas = this.identifyImprovementAreas(currentState, goals);

    // Generate specific recommendations for each area
    const recommendations = [];
    for (const area of improvementAreas) {
      const recs = this.generateRecommendationsForArea(area, currentState);
      recommendations.push(...recs);
    }

    // Prioritize recommendations
    const prioritized = this.prioritizeRecommendations({
      recommendations,
      current_state: currentState,
      goals
    });

    // Create implementation plans for top recommendations
    const topRecommendations = prioritized.slice(0, max_recommendations);
    for (const rec of topRecommendations) {
      rec.implementation_plan = this.createImplementationPlan({
        recommendation: rec,
        agent_id,
        current_state: currentState
      });
    }

    return {
      agent_id,
      generated_at: new Date(),
      total_recommendations: recommendations.length,
      recommendations: topRecommendations,
      improvement_areas: improvementAreas,
      current_state_summary: this.summarizeCurrentState(currentState)
    };
  }

  /**
   * Analyze agent's current state
   */
  analyzeCurrentState(analyticsData, performanceData) {
    // Mock data - in production would use actual analytics
    const state = {
      maturity_level: 'PROFICIENT',
      maturity_score: 3,

      performance_metrics: {
        decision_quality: 0.75,
        learning_velocity: 0.55,
        implementation_rate: 0.74,
        collaboration_rate: 0.68,
        confidence_calibration: 0.78
      },

      trends: {
        decision_quality: 'IMPROVING',
        learning_velocity: 'STABLE',
        implementation_rate: 'IMPROVING',
        collaboration_rate: 'DECLINING'
      },

      strengths: [
        'High implementation rate',
        'Good confidence calibration',
        'Improving decision quality'
      ],

      weaknesses: [
        'Declining collaboration',
        'Moderate learning velocity',
        'Limited knowledge sharing'
      ],

      recent_mistakes: 3,
      learnings_applied: 12,
      reflection_quality: 0.72
    };

    return state;
  }

  /**
   * Identify areas needing improvement
   */
  identifyImprovementAreas(currentState, goals) {
    const areas = [];

    // Check performance metrics
    for (const [metric, value] of Object.entries(currentState.performance_metrics)) {
      if (value < 0.6) {
        areas.push({
          category: 'performance',
          metric,
          current_value: value,
          target_value: 0.75,
          gap: 0.75 - value,
          priority: 'high'
        });
      } else if (value < 0.7) {
        areas.push({
          category: 'performance',
          metric,
          current_value: value,
          target_value: 0.8,
          gap: 0.8 - value,
          priority: 'medium'
        });
      }
    }

    // Check trends
    for (const [metric, trend] of Object.entries(currentState.trends)) {
      if (trend === 'DECLINING') {
        areas.push({
          category: 'trend',
          metric,
          trend,
          priority: 'high',
          requires_intervention: true
        });
      }
    }

    // Check weaknesses
    currentState.weaknesses.forEach(weakness => {
      areas.push({
        category: 'weakness',
        description: weakness,
        priority: 'medium'
      });
    });

    // Check goal alignment
    goals.forEach(goal => {
      const relevantMetric = this.mapGoalToMetric(goal);
      if (relevantMetric && currentState.performance_metrics[relevantMetric] < goal.target) {
        areas.push({
          category: 'goal_gap',
          goal: goal.description,
          metric: relevantMetric,
          current: currentState.performance_metrics[relevantMetric],
          target: goal.target,
          priority: goal.priority || 'medium'
        });
      }
    });

    return areas;
  }

  /**
   * Map goal to performance metric
   */
  mapGoalToMetric(goal) {
    const goalKeywords = goal.description.toLowerCase();

    if (goalKeywords.includes('quality') || goalKeywords.includes('decision')) {
      return 'decision_quality';
    } else if (goalKeywords.includes('learning') || goalKeywords.includes('learn')) {
      return 'learning_velocity';
    } else if (goalKeywords.includes('collaboration') || goalKeywords.includes('team')) {
      return 'collaboration_rate';
    }

    return null;
  }

  /**
   * Generate recommendations for specific improvement area
   */
  generateRecommendationsForArea(area, currentState) {
    const recommendations = [];

    if (area.category === 'performance' && area.metric === 'learning_velocity') {
      recommendations.push({
        id: this.generateRecommendationId(),
        type: 'SKILL_DEVELOPMENT',
        title: 'Accelerate Learning-to-Action Cycle',
        description: 'Improve the speed and efficiency of converting insights to implemented learnings',
        rationale: `Current learning velocity (${area.current_value.toFixed(2)}) is below target (${area.target_value.toFixed(2)})`,
        expected_impact: {
          metric: 'learning_velocity',
          estimated_improvement: 0.15,
          timeframe: '3-4 weeks'
        },
        effort_required: 'medium',
        confidence: 0.75
      });

      recommendations.push({
        id: this.generateRecommendationId(),
        type: 'PROCESS_IMPROVEMENT',
        title: 'Implement Structured Reflection Process',
        description: 'Create a systematic approach to extracting and applying learnings from decisions',
        rationale: 'Structured process increases learning efficiency',
        expected_impact: {
          metric: 'learning_velocity',
          estimated_improvement: 0.12,
          timeframe: '2-3 weeks'
        },
        effort_required: 'low',
        confidence: 0.80
      });
    }

    if (area.category === 'trend' && area.metric === 'collaboration_rate' && area.trend === 'DECLINING') {
      recommendations.push({
        id: this.generateRecommendationId(),
        type: 'COLLABORATION_ENHANCEMENT',
        title: 'Re-engage with Collaborative Decision-Making',
        description: 'Actively seek collaborative opportunities and improve consensus-building skills',
        rationale: `Collaboration rate declining - from ${currentState.performance_metrics.collaboration_rate.toFixed(2)}`,
        expected_impact: {
          metric: 'collaboration_rate',
          estimated_improvement: 0.20,
          timeframe: '2-3 weeks'
        },
        effort_required: 'medium',
        confidence: 0.70
      });
    }

    if (area.category === 'performance' && area.metric === 'decision_quality') {
      recommendations.push({
        id: this.generateRecommendationId(),
        type: 'QUALITY_ENHANCEMENT',
        title: 'Strengthen Reasoning Quality',
        description: 'Focus on improving logic, evidence, and coherence in decision-making',
        rationale: `Quality score ${area.current_value.toFixed(2)} has room for improvement`,
        expected_impact: {
          metric: 'decision_quality',
          estimated_improvement: area.gap * 0.7, // Expect to close 70% of gap
          timeframe: '3-4 weeks'
        },
        effort_required: 'medium',
        confidence: 0.75
      });
    }

    if (area.category === 'weakness' && area.description.includes('knowledge sharing')) {
      recommendations.push({
        id: this.generateRecommendationId(),
        type: 'COLLABORATION_ENHANCEMENT',
        title: 'Establish Knowledge Sharing Practice',
        description: 'Create regular cadence for sharing learnings with other agents',
        rationale: 'Knowledge sharing amplifies learning impact across team',
        expected_impact: {
          metric: 'collaboration_rate',
          estimated_improvement: 0.15,
          timeframe: '2 weeks'
        },
        effort_required: 'low',
        confidence: 0.70
      });
    }

    return recommendations;
  }

  /**
   * Prioritize recommendations using multi-factor scoring
   */
  prioritizeRecommendations(params) {
    const { recommendations, current_state, goals } = params;

    // Calculate priority score for each recommendation
    const scoredRecommendations = recommendations.map(rec => {
      const scores = {
        impact: this.scoreImpact(rec, current_state),
        urgency: this.scoreUrgency(rec, current_state),
        feasibility: this.scoreFeasibility(rec, current_state),
        alignment: this.scoreAlignment(rec, goals),
        dependency: this.scoreDependency(rec, recommendations)
      };

      // Calculate weighted priority score
      let priorityScore = 0;
      for (const [factor, score] of Object.entries(scores)) {
        priorityScore += score * this.priorityFactors[factor.toUpperCase()].weight;
      }

      return {
        ...rec,
        priority_scores: scores,
        priority_score: priorityScore,
        priority_tier: this.determinePriorityTier(priorityScore)
      };
    });

    // Sort by priority score (descending)
    return scoredRecommendations.sort((a, b) => b.priority_score - a.priority_score);
  }

  /**
   * Score impact of recommendation
   */
  scoreImpact(recommendation, currentState) {
    // Impact = estimated_improvement * confidence * criticality_of_metric
    const metricCriticality = {
      decision_quality: 1.0,
      learning_velocity: 0.9,
      implementation_rate: 0.85,
      collaboration_rate: 0.75,
      confidence_calibration: 0.80
    };

    const metric = recommendation.expected_impact.metric;
    const criticality = metricCriticality[metric] || 0.7;

    return recommendation.expected_impact.estimated_improvement * recommendation.confidence * criticality;
  }

  /**
   * Score urgency of recommendation
   */
  scoreUrgency(recommendation, currentState) {
    // Higher urgency if:
    // - Addressing declining trend
    // - Critical performance gap
    // - Prerequisite for other improvements

    let urgency = 0.5; // Base urgency

    if (recommendation.rationale.toLowerCase().includes('declining')) {
      urgency += 0.3;
    }

    const metric = recommendation.expected_impact.metric;
    if (currentState.performance_metrics[metric] < 0.5) {
      urgency += 0.2; // Critical gap
    }

    return Math.min(1, urgency);
  }

  /**
   * Score feasibility of recommendation
   */
  scoreFeasibility(recommendation, currentState) {
    const effortScores = {
      low: 0.9,
      medium: 0.7,
      high: 0.4
    };

    let feasibility = effortScores[recommendation.effort_required] || 0.6;

    // Adjust based on maturity level
    if (currentState.maturity_score >= 3) {
      feasibility += 0.1; // More mature agents find things more feasible
    }

    return Math.min(1, feasibility);
  }

  /**
   * Score alignment with goals
   */
  scoreAlignment(recommendation, goals) {
    if (!goals || goals.length === 0) {
      return 0.5; // Neutral if no goals
    }

    // Check if recommendation addresses any goals
    const metric = recommendation.expected_impact.metric;
    const alignedGoals = goals.filter(g => {
      const mappedMetric = this.mapGoalToMetric(g);
      return mappedMetric === metric;
    });

    if (alignedGoals.length === 0) return 0.3;
    if (alignedGoals.length === 1) return 0.7;
    return 1.0; // Addresses multiple goals
  }

  /**
   * Score dependency (whether this enables other improvements)
   */
  scoreDependency(recommendation, allRecommendations) {
    // Process improvements tend to enable other improvements
    if (recommendation.type === 'PROCESS_IMPROVEMENT') {
      return 0.8;
    }

    // Skill development enables quality and efficiency improvements
    if (recommendation.type === 'SKILL_DEVELOPMENT') {
      return 0.7;
    }

    return 0.5; // Base dependency score
  }

  /**
   * Determine priority tier
   */
  determinePriorityTier(priorityScore) {
    if (priorityScore >= 0.75) return 'CRITICAL';
    if (priorityScore >= 0.60) return 'HIGH';
    if (priorityScore >= 0.45) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Create implementation plan for recommendation
   */
  createImplementationPlan(params) {
    const { recommendation, agent_id, current_state } = params;

    // Define phases based on recommendation type
    const phases = this.defineImplementationPhases(recommendation);

    // Create milestones
    const milestones = this.createMilestones(recommendation, phases);

    // Define success criteria
    const successCriteria = this.defineSuccessCriteria(recommendation);

    // Estimate timeline
    const timeline = this.estimateTimeline(recommendation, current_state);

    // Identify required resources
    const resources = this.identifyRequiredResources(recommendation);

    // Set up tracking
    const tracking = this.setupProgressTracking(recommendation);

    return {
      plan_id: this.generatePlanId(),
      recommendation_id: recommendation.id,
      agent_id,
      created_at: new Date(),
      phases,
      milestones,
      success_criteria: successCriteria,
      timeline,
      resources,
      tracking,
      status: 'planned'
    };
  }

  /**
   * Define implementation phases
   */
  defineImplementationPhases(recommendation) {
    const typePhases = {
      SKILL_DEVELOPMENT: [
        { phase: 1, name: 'Assessment', description: 'Assess current skill level and gaps', duration_days: 2 },
        { phase: 2, name: 'Learning', description: 'Study and practice new skills', duration_days: 14 },
        { phase: 3, name: 'Application', description: 'Apply skills in real scenarios', duration_days: 7 },
        { phase: 4, name: 'Refinement', description: 'Refine based on feedback', duration_days: 7 }
      ],
      PROCESS_IMPROVEMENT: [
        { phase: 1, name: 'Analysis', description: 'Analyze current process', duration_days: 2 },
        { phase: 2, name: 'Design', description: 'Design improved process', duration_days: 3 },
        { phase: 3, name: 'Implementation', description: 'Implement new process', duration_days: 5 },
        { phase: 4, name: 'Validation', description: 'Validate improvements', duration_days: 4 }
      ],
      BEHAVIOR_CHANGE: [
        { phase: 1, name: 'Awareness', description: 'Build awareness of current behavior', duration_days: 3 },
        { phase: 2, name: 'Commitment', description: 'Commit to new behavior', duration_days: 2 },
        { phase: 3, name: 'Practice', description: 'Practice new behavior', duration_days: 21 }, // 21 days for habit
        { phase: 4, name: 'Reinforcement', description: 'Reinforce and sustain', duration_days: 14 }
      ],
      COLLABORATION_ENHANCEMENT: [
        { phase: 1, name: 'Engagement', description: 'Re-engage with team', duration_days: 3 },
        { phase: 2, name: 'Participation', description: 'Active participation in collaborative decisions', duration_days: 14 },
        { phase: 3, name: 'Integration', description: 'Integrate collaboration into workflow', duration_days: 7 }
      ]
    };

    return typePhases[recommendation.type] || [
      { phase: 1, name: 'Planning', description: 'Plan implementation', duration_days: 2 },
      { phase: 2, name: 'Execution', description: 'Execute improvement', duration_days: 10 },
      { phase: 3, name: 'Review', description: 'Review results', duration_days: 2 }
    ];
  }

  /**
   * Create milestones from phases
   */
  createMilestones(recommendation, phases) {
    let cumulativeDays = 0;

    return phases.map(phase => {
      cumulativeDays += phase.duration_days;

      return {
        milestone: phase.phase,
        title: `Complete ${phase.name} phase`,
        description: phase.description,
        target_date: this.addDays(new Date(), cumulativeDays),
        completion_criteria: this.definePhaseCompletion(phase, recommendation),
        status: 'pending'
      };
    });
  }

  /**
   * Define phase completion criteria
   */
  definePhaseCompletion(phase, recommendation) {
    const genericCriteria = {
      Assessment: 'Baseline metrics measured and documented',
      Learning: 'Learning materials completed and understood',
      Application: 'Applied in at least 3 real scenarios',
      Refinement: 'Adjustments made based on feedback',
      Analysis: 'Current process documented and analyzed',
      Design: 'New process designed and reviewed',
      Implementation: 'New process implemented and operational',
      Validation: 'Improvements measured and validated',
      Awareness: 'Current behavior patterns identified',
      Commitment: 'Action plan created and committed to',
      Practice: 'New behavior practiced daily for 21 days',
      Reinforcement: 'Behavior sustained for 2 weeks'
    };

    return genericCriteria[phase.name] || `${phase.name} phase objectives achieved`;
  }

  /**
   * Define success criteria for recommendation
   */
  defineSuccessCriteria(recommendation) {
    const metric = recommendation.expected_impact.metric;
    const improvement = recommendation.expected_impact.estimated_improvement;

    return {
      primary: {
        metric,
        target_improvement: improvement,
        measurement_method: `Compare ${metric} before and after implementation`,
        success_threshold: improvement * 0.7 // 70% of estimated improvement
      },
      secondary: [
        {
          indicator: 'consistent_application',
          description: 'Improvement sustained for at least 2 weeks',
          measurement: 'Track metric stability over time'
        },
        {
          indicator: 'no_negative_side_effects',
          description: 'No decline in other performance metrics',
          measurement: 'Monitor all key performance metrics'
        }
      ],
      validation_period: '2 weeks post-implementation'
    };
  }

  /**
   * Estimate implementation timeline
   */
  estimateTimeline(recommendation, currentState) {
    const typeTimelines = {
      SKILL_DEVELOPMENT: { min_days: 21, max_days: 35, typical_days: 28 },
      PROCESS_IMPROVEMENT: { min_days: 10, max_days: 21, typical_days: 14 },
      BEHAVIOR_CHANGE: { min_days: 30, max_days: 60, typical_days: 42 },
      KNOWLEDGE_ACQUISITION: { min_days: 7, max_days: 21, typical_days: 14 },
      COLLABORATION_ENHANCEMENT: { min_days: 14, max_days: 28, typical_days: 21 },
      EFFICIENCY_OPTIMIZATION: { min_days: 7, max_days: 14, typical_days: 10 },
      QUALITY_ENHANCEMENT: { min_days: 14, max_days: 35, typical_days: 21 }
    };

    const baseTimeline = typeTimelines[recommendation.type] || { min_days: 14, max_days: 28, typical_days: 21 };

    // Adjust based on maturity - more mature agents implement faster
    const maturityFactor = currentState.maturity_score >= 3 ? 0.85 : 1.0;

    return {
      estimated_days: Math.round(baseTimeline.typical_days * maturityFactor),
      min_days: Math.round(baseTimeline.min_days * maturityFactor),
      max_days: Math.round(baseTimeline.max_days * maturityFactor),
      start_date: new Date(),
      estimated_completion: this.addDays(new Date(), Math.round(baseTimeline.typical_days * maturityFactor))
    };
  }

  /**
   * Identify required resources
   */
  identifyRequiredResources(recommendation) {
    const typeResources = {
      SKILL_DEVELOPMENT: ['Learning materials', 'Practice scenarios', 'Feedback mechanism'],
      PROCESS_IMPROVEMENT: ['Process documentation', 'Testing environment'],
      BEHAVIOR_CHANGE: ['Behavior tracking tool', 'Regular reminders', 'Accountability partner'],
      KNOWLEDGE_ACQUISITION: ['Reference materials', 'Examples', 'Subject matter expert access'],
      COLLABORATION_ENHANCEMENT: ['Team availability', 'Collaboration platform'],
      EFFICIENCY_OPTIMIZATION: ['Performance metrics', 'Benchmarking data'],
      QUALITY_ENHANCEMENT: ['Quality frameworks', 'Review process', 'Feedback loop']
    };

    return {
      required: typeResources[recommendation.type] || ['Implementation support'],
      optional: ['Mentorship', 'Peer support'],
      estimated_effort_hours: this.estimateEffortHours(recommendation)
    };
  }

  /**
   * Estimate effort hours
   */
  estimateEffortHours(recommendation) {
    const effortMap = {
      low: { min: 5, max: 15, typical: 10 },
      medium: { min: 15, max: 40, typical: 25 },
      high: { min: 40, max: 80, typical: 60 }
    };

    return effortMap[recommendation.effort_required] || { min: 15, max: 40, typical: 25 };
  }

  /**
   * Setup progress tracking
   */
  setupProgressTracking(recommendation) {
    return {
      tracking_frequency: 'weekly',
      metrics_to_track: [
        recommendation.expected_impact.metric,
        'implementation_progress',
        'effort_spent'
      ],
      checkpoints: [
        { checkpoint: '25%', timing_days: 7, criteria: 'First milestone complete' },
        { checkpoint: '50%', timing_days: 14, criteria: 'Halfway through implementation' },
        { checkpoint: '75%', timing_days: 21, criteria: 'Final phase started' },
        { checkpoint: '100%', timing_days: 28, criteria: 'Implementation complete' }
      ],
      review_schedule: 'Weekly progress reviews',
      escalation_criteria: 'More than 1 week behind schedule or no measurable progress'
    };
  }

  /**
   * Track progress of implementation
   */
  async trackProgress(params) {
    const {
      plan_id,
      agent_id,
      current_phase,
      milestones_completed,
      metrics_data = {},
      notes = ''
    } = params;

    // Calculate overall progress
    const progressPercent = this.calculateProgressPercent(milestones_completed);

    // Check if on track
    const onTrack = this.assessIfOnTrack(plan_id, progressPercent, current_phase);

    // Measure interim results
    const interimResults = this.measureInterimResults(metrics_data);

    return {
      plan_id,
      agent_id,
      tracked_at: new Date(),
      progress_percent: progressPercent,
      current_phase,
      milestones_completed,
      on_track: onTrack.status,
      variance: onTrack.variance,
      interim_results: interimResults,
      notes,
      next_actions: this.determineNextActions(progressPercent, current_phase, onTrack)
    };
  }

  /**
   * Calculate progress percentage
   */
  calculateProgressPercent(milestonesCompleted) {
    // Assuming milestones are sequential and equally weighted
    const totalMilestones = milestonesCompleted.total || 4;
    const completed = milestonesCompleted.completed || 0;

    return (completed / totalMilestones) * 100;
  }

  /**
   * Assess if implementation is on track
   */
  assessIfOnTrack(planId, progressPercent, currentPhase) {
    // Mock calculation - would compare actual vs. planned timeline
    const expectedProgress = 50; // Would be calculated from plan timeline
    const variance = progressPercent - expectedProgress;

    return {
      status: Math.abs(variance) <= 10 ? 'on_track' : variance > 10 ? 'ahead' : 'behind',
      variance: variance,
      variance_percent: variance
    };
  }

  /**
   * Measure interim results
   */
  measureInterimResults(metricsData) {
    const results = [];

    for (const [metric, value] of Object.entries(metricsData)) {
      results.push({
        metric,
        current_value: value,
        trend: this.detectTrend(metric, value), // Would compare to historical
        preliminary_assessment: value > 0.7 ? 'positive' : 'needs_attention'
      });
    }

    return results;
  }

  /**
   * Detect trend (simplified)
   */
  detectTrend(metric, currentValue) {
    // Simplified - would compare to historical values
    return 'stable';
  }

  /**
   * Determine next actions
   */
  determineNextActions(progressPercent, currentPhase, onTrack) {
    const actions = [];

    if (onTrack.status === 'behind') {
      actions.push({
        action: 'ACCELERATE',
        description: 'Increase effort to get back on track',
        priority: 'high'
      });
    }

    if (progressPercent >= 90) {
      actions.push({
        action: 'VALIDATE',
        description: 'Prepare for final validation and impact assessment',
        priority: 'high'
      });
    }

    if (currentPhase === 'Practice' || currentPhase === 'Application') {
      actions.push({
        action: 'COLLECT_EVIDENCE',
        description: 'Document examples and evidence of improvement',
        priority: 'medium'
      });
    }

    return actions;
  }

  /**
   * Validate impact of implemented recommendation
   */
  async validateImpact(params) {
    const {
      plan_id,
      recommendation_id,
      agent_id,
      before_metrics = {},
      after_metrics = {},
      implementation_duration_days
    } = params;

    // Calculate actual improvements
    const improvements = this.calculateActualImprovements(before_metrics, after_metrics);

    // Compare to expected impact
    const expectedImpact = this.getExpectedImpact(recommendation_id); // Would query from DB

    const comparison = this.compareActualToExpected(improvements, expectedImpact);

    // Assess success
    const success = this.assessImplementationSuccess(comparison);

    // Identify factors
    const successFactors = this.identifySuccessFactors(success, improvements);
    const challenges = this.identifyImplementationChallenges(success, improvements);

    // Generate learnings
    const learnings = this.extractImplementationLearnings(
      success,
      successFactors,
      challenges,
      implementation_duration_days
    );

    return {
      plan_id,
      recommendation_id,
      agent_id,
      validated_at: new Date(),
      before_metrics,
      after_metrics,
      improvements,
      expected_impact: expectedImpact,
      comparison,
      success_level: success.level,
      success_score: success.score,
      success_factors: successFactors,
      challenges,
      learnings,
      recommendation: this.generateFollowUpRecommendation(success, learnings)
    };
  }

  /**
   * Calculate actual improvements
   */
  calculateActualImprovements(before, after) {
    const improvements = {};

    for (const metric in before) {
      if (after[metric] !== undefined) {
        const change = after[metric] - before[metric];
        const percentChange = (change / before[metric]) * 100;

        improvements[metric] = {
          before: before[metric],
          after: after[metric],
          absolute_change: change,
          percent_change: percentChange,
          improved: change > 0
        };
      }
    }

    return improvements;
  }

  /**
   * Get expected impact (mock - would query database)
   */
  getExpectedImpact(recommendationId) {
    return {
      metric: 'learning_velocity',
      estimated_improvement: 0.15,
      timeframe: '3-4 weeks'
    };
  }

  /**
   * Compare actual to expected impact
   */
  compareActualToExpected(actual, expected) {
    const actualChange = actual[expected.metric]?.absolute_change || 0;
    const expectedChange = expected.estimated_improvement;

    const achievement_rate = actualChange / expectedChange;

    return {
      metric: expected.metric,
      expected: expectedChange,
      actual: actualChange,
      achievement_rate,
      variance: actualChange - expectedChange,
      met_expectations: achievement_rate >= 0.7 // 70% threshold
    };
  }

  /**
   * Assess implementation success
   */
  assessImplementationSuccess(comparison) {
    const achievementRate = comparison.achievement_rate;

    let level, score;

    if (achievementRate >= 1.2) {
      level = 'EXCEEDED';
      score = 1.0;
    } else if (achievementRate >= 0.9) {
      level = 'ACHIEVED';
      score = 0.9;
    } else if (achievementRate >= 0.7) {
      level = 'MOSTLY_ACHIEVED';
      score = 0.7;
    } else if (achievementRate >= 0.4) {
      level = 'PARTIALLY_ACHIEVED';
      score = 0.5;
    } else {
      level = 'NOT_ACHIEVED';
      score = 0.3;
    }

    return { level, score, achievement_rate: achievementRate };
  }

  /**
   * Identify success factors
   */
  identifySuccessFactors(success, improvements) {
    const factors = [];

    if (success.achievement_rate >= 0.7) {
      // Look for what went well
      const improvedMetrics = Object.entries(improvements)
        .filter(([_, data]) => data.improved)
        .map(([metric, _]) => metric);

      if (improvedMetrics.length > 1) {
        factors.push({
          factor: 'broad_improvement',
          description: 'Improvement across multiple metrics indicates systemic benefit'
        });
      }

      factors.push({
        factor: 'effective_implementation',
        description: 'Implementation plan was well-executed'
      });
    }

    return factors;
  }

  /**
   * Identify implementation challenges
   */
  identifyImplementationChallenges(success, improvements) {
    const challenges = [];

    if (success.achievement_rate < 0.7) {
      challenges.push({
        challenge: 'insufficient_impact',
        description: 'Recommendation did not achieve expected impact',
        possible_causes: ['Wrong approach', 'Incomplete implementation', 'External factors']
      });
    }

    const declinedMetrics = Object.entries(improvements)
      .filter(([_, data]) => !data.improved && data.absolute_change < -0.05);

    if (declinedMetrics.length > 0) {
      challenges.push({
        challenge: 'negative_side_effects',
        description: `Decline in ${declinedMetrics.map(([m, _]) => m).join(', ')}`,
        possible_causes: ['Trade-offs', 'Unintended consequences', 'Resource constraints']
      });
    }

    return challenges;
  }

  /**
   * Extract learnings from implementation
   */
  extractImplementationLearnings(success, successFactors, challenges, durationDays) {
    const learnings = [];

    if (success.level === 'EXCEEDED' || success.level === 'ACHIEVED') {
      learnings.push({
        learning: 'Effective recommendation type',
        description: 'This type of recommendation works well for this agent',
        application: 'Prioritize similar recommendations in future'
      });
    }

    if (challenges.length > 0) {
      learnings.push({
        learning: 'Implementation challenges',
        description: challenges.map(c => c.description).join('; '),
        application: 'Address these challenges in future implementations'
      });
    }

    return learnings;
  }

  /**
   * Generate follow-up recommendation
   */
  generateFollowUpRecommendation(success, learnings) {
    if (success.level === 'EXCEEDED' || success.level === 'ACHIEVED') {
      return {
        type: 'REINFORCE',
        description: 'Continue and expand successful practice',
        next_steps: ['Apply to broader contexts', 'Share learning with team']
      };
    } else if (success.level === 'PARTIALLY_ACHIEVED') {
      return {
        type: 'REFINE',
        description: 'Refine approach to achieve full impact',
        next_steps: ['Identify what worked', 'Adjust what didn\'t', 'Continue for another cycle']
      };
    } else {
      return {
        type: 'PIVOT',
        description: 'Try different approach',
        next_steps: ['Analyze why this didn\'t work', 'Generate alternative recommendations']
      };
    }
  }

  /**
   * Summarize current state
   */
  summarizeCurrentState(state) {
    return {
      maturity: state.maturity_level,
      top_strength: state.strengths[0],
      top_weakness: state.weaknesses[0],
      overall_trend: this.determineOverallStateDirection(state.trends)
    };
  }

  /**
   * Determine overall state direction
   */
  determineOverallStateDirection(trends) {
    const trendValues = Object.values(trends);
    const improving = trendValues.filter(t => t === 'IMPROVING').length;
    const declining = trendValues.filter(t => t === 'DECLINING').length;

    if (improving > declining) return 'IMPROVING';
    if (declining > improving) return 'DECLINING';
    return 'STABLE';
  }

  /**
   * Helper methods
   */
  generateRecommendationId() {
    return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generatePlanId() {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}

// Singleton instance
const improvementRecommendationEngine = new ImprovementRecommendationEngine();
export default improvementRecommendationEngine;
