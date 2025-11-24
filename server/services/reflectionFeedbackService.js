/**
 * Reflection Feedback Loop Service
 *
 * Provides mechanisms for continuous reflection and feedback-driven improvement.
 * Triggers reflections based on various conditions, processes them, and applies learnings.
 *
 * Sprint 46 - Meta-Cognitive Reflection System
 * Phase 3: Analytics & Continuous Improvement
 */

import pool from '../db.js';

class ReflectionFeedbackService {
  constructor() {
    this.db = pool;
    this.triggerTypes = this.initializeTriggerTypes();
    this.applicationStrategies = this.initializeApplicationStrategies();
  }

  async initialize() {
    // Pool already initialized
  }

  /**
   * Initialize reflection trigger types with criteria
   */
  initializeTriggerTypes() {
    return {
      LOW_CONFIDENCE: {
        description: 'Decision confidence below threshold',
        threshold: 0.6,
        priority: 'high',
        check: (data) => data.confidence < 0.6
      },
      ERROR_DETECTED: {
        description: 'Mistake identified in outcome',
        threshold: null,
        priority: 'critical',
        check: (data) => data.has_error === true
      },
      FEEDBACK_RECEIVED: {
        description: 'External feedback provided',
        threshold: null,
        priority: 'high',
        check: (data) => data.feedback !== null
      },
      PERIODIC: {
        description: 'Scheduled reflection',
        threshold: null,
        priority: 'medium',
        check: (data) => data.is_scheduled === true
      },
      PERFORMANCE_DROP: {
        description: 'Quality decline detected',
        threshold: 0.15, // 15% drop
        priority: 'high',
        check: (data) => data.performance_drop_ratio >= 0.15
      },
      KNOWLEDGE_GAP: {
        description: 'Information need identified',
        threshold: null,
        priority: 'medium',
        check: (data) => data.knowledge_gaps && data.knowledge_gaps.length > 0
      }
    };
  }

  /**
   * Initialize learning application strategies
   */
  initializeApplicationStrategies() {
    return {
      IMMEDIATE: {
        description: 'Apply learning immediately to current process',
        timeframe: 'immediate',
        scope: 'current'
      },
      GRADUAL: {
        description: 'Gradually integrate learning over time',
        timeframe: 'days',
        scope: 'future'
      },
      EXPERIMENTAL: {
        description: 'Test learning in controlled scenarios first',
        timeframe: 'days',
        scope: 'test'
      },
      BROADCAST: {
        description: 'Share learning with all relevant agents',
        timeframe: 'immediate',
        scope: 'team'
      },
      REINFORCEMENT: {
        description: 'Strengthen existing good practices',
        timeframe: 'ongoing',
        scope: 'habit'
      }
    };
  }

  /**
   * Trigger a reflection based on conditions
   */
  async triggerReflection(params) {
    const {
      agent_id,
      trigger_type,
      decision_id = null,
      trigger_data = {},
      context = {}
    } = params;

    // Validate trigger type
    if (!this.triggerTypes[trigger_type]) {
      throw new Error(`Unknown trigger type: ${trigger_type}`);
    }

    const triggerConfig = this.triggerTypes[trigger_type];

    // Check if trigger condition is met
    if (!triggerConfig.check(trigger_data)) {
      return {
        triggered: false,
        reason: 'Trigger condition not met',
        trigger_type
      };
    }

    // Create reflection trigger record
    const reflection = {
      agent_id,
      trigger_type,
      trigger_priority: triggerConfig.priority,
      decision_id,
      trigger_data,
      context,
      triggered_at: new Date()
    };

    // Determine what to reflect on
    const reflectionScope = this.determineReflectionScope(trigger_type, trigger_data, context);

    // Generate reflection prompts
    const prompts = this.generateReflectionPrompts(trigger_type, reflectionScope, trigger_data);

    return {
      triggered: true,
      reflection_id: this.generateReflectionId(),
      trigger_type,
      priority: triggerConfig.priority,
      scope: reflectionScope,
      prompts,
      reflection
    };
  }

  /**
   * Determine scope of reflection
   */
  determineReflectionScope(triggerType, triggerData, context) {
    const scopes = {
      LOW_CONFIDENCE: 'decision_process',
      ERROR_DETECTED: 'mistake_analysis',
      FEEDBACK_RECEIVED: 'performance_evaluation',
      PERIODIC: 'comprehensive_review',
      PERFORMANCE_DROP: 'trend_analysis',
      KNOWLEDGE_GAP: 'learning_needs'
    };

    const scope = scopes[triggerType] || 'general';

    // Add depth based on trigger priority
    const depth = this.triggerTypes[triggerType].priority === 'critical' ? 'deep' : 'moderate';

    return {
      type: scope,
      depth,
      focus_areas: this.identifyFocusAreas(triggerType, triggerData),
      timeframe: this.determineTimeframe(triggerType, context)
    };
  }

  /**
   * Identify specific areas to focus on during reflection
   */
  identifyFocusAreas(triggerType, triggerData) {
    const focusMap = {
      LOW_CONFIDENCE: ['uncertainty_sources', 'information_gaps', 'decision_complexity'],
      ERROR_DETECTED: ['error_causes', 'prevention_strategies', 'similar_mistakes'],
      FEEDBACK_RECEIVED: ['feedback_validity', 'improvement_areas', 'strengths'],
      PERIODIC: ['overall_performance', 'learning_progress', 'goal_achievement'],
      PERFORMANCE_DROP: ['decline_factors', 'corrective_actions', 'recovery_plan'],
      KNOWLEDGE_GAP: ['missing_knowledge', 'learning_resources', 'skill_development']
    };

    return focusMap[triggerType] || ['general_improvement'];
  }

  /**
   * Determine reflection timeframe
   */
  determineTimeframe(triggerType, context) {
    if (triggerType === 'PERIODIC') {
      return context.period || 'week';
    } else if (triggerType === 'PERFORMANCE_DROP') {
      return 'month'; // Look at trend over month
    }
    return 'recent'; // Focus on recent decisions
  }

  /**
   * Generate reflection prompts for the agent
   */
  generateReflectionPrompts(triggerType, scope, triggerData) {
    const basePrompts = {
      LOW_CONFIDENCE: [
        'What factors contributed to your low confidence in this decision?',
        'What additional information would have helped you decide more confidently?',
        'How can you better handle similar uncertain situations in the future?'
      ],
      ERROR_DETECTED: [
        'What went wrong in your decision-making process?',
        'What assumptions or reasoning led to this error?',
        'How can you prevent this type of mistake in the future?'
      ],
      FEEDBACK_RECEIVED: [
        'What insights does this feedback provide about your performance?',
        'How does this feedback align with your self-assessment?',
        'What specific actions can you take to address this feedback?'
      ],
      PERIODIC: [
        'What were your key achievements in this period?',
        'What challenges did you face and how did you handle them?',
        'What did you learn and how have you grown?',
        'What goals should you set for the next period?'
      ],
      PERFORMANCE_DROP: [
        'What factors contributed to the decline in your performance?',
        'When did you first notice the performance drop?',
        'What changes in your approach or environment might have caused this?',
        'What steps can you take to recover and improve?'
      ],
      KNOWLEDGE_GAP: [
        'What knowledge or skills are you missing?',
        'How is this knowledge gap affecting your performance?',
        'What resources can help you fill this gap?',
        'How will you measure your learning progress?'
      ]
    };

    return basePrompts[triggerType] || ['What can you learn from this situation?'];
  }

  /**
   * Process a reflection and extract insights
   */
  async processReflection(params) {
    const {
      reflection_id,
      agent_id,
      trigger_type,
      responses = {}, // Agent's responses to reflection prompts
      decision_data = null,
      performance_data = null
    } = params;

    // Analyze reflection responses
    const analysis = this.analyzeReflectionResponses(responses, trigger_type);

    // Extract key insights
    const insights = this.extractInsights(analysis, trigger_type, decision_data);

    // Generate actionable learnings
    const learnings = this.generateLearnings(insights, trigger_type, performance_data);

    // Assess reflection quality
    const quality = this.assessReflectionQuality(responses, insights, learnings);

    // Store processed reflection
    const processedReflection = {
      reflection_id,
      agent_id,
      trigger_type,
      responses,
      analysis,
      insights,
      learnings,
      quality_score: quality.score,
      quality_notes: quality.notes,
      processed_at: new Date()
    };

    return processedReflection;
  }

  /**
   * Analyze reflection responses for patterns and themes
   */
  analyzeReflectionResponses(responses, triggerType) {
    const analysis = {
      depth: 0,
      specificity: 0,
      self_awareness: 0,
      actionability: 0,
      themes: [],
      patterns: []
    };

    // Count total response content
    const totalContent = Object.values(responses).join(' ');
    const wordCount = totalContent.split(/\s+/).length;

    // Assess depth (based on length and detail)
    if (wordCount > 100) analysis.depth = 0.8;
    else if (wordCount > 50) analysis.depth = 0.6;
    else analysis.depth = 0.4;

    // Assess specificity (mentions concrete examples, data, specific instances)
    const specificityMarkers = ['specifically', 'for example', 'in case', 'when', 'because', 'such as'];
    const specificityScore = specificityMarkers.filter(marker =>
      totalContent.toLowerCase().includes(marker)
    ).length / specificityMarkers.length;
    analysis.specificity = Math.min(1, specificityScore);

    // Assess self-awareness (uses reflective language)
    const selfAwarenessMarkers = ['I realized', 'I noticed', 'I should', 'I could have', 'I need to', 'my mistake'];
    const awarenessScore = selfAwarenessMarkers.filter(marker =>
      totalContent.toLowerCase().includes(marker)
    ).length / selfAwarenessMarkers.length;
    analysis.self_awareness = Math.min(1, awarenessScore);

    // Assess actionability (mentions specific actions)
    const actionMarkers = ['I will', 'next time', 'going forward', 'action', 'plan', 'implement'];
    const actionScore = actionMarkers.filter(marker =>
      totalContent.toLowerCase().includes(marker)
    ).length / actionMarkers.length;
    analysis.actionability = Math.min(1, actionScore);

    // Identify themes
    analysis.themes = this.identifyThemes(totalContent, triggerType);

    // Identify patterns
    analysis.patterns = this.identifyPatterns(responses);

    return analysis;
  }

  /**
   * Identify themes in reflection content
   */
  identifyThemes(content, triggerType) {
    const themes = [];
    const contentLower = content.toLowerCase();

    const themeKeywords = {
      'uncertainty_management': ['uncertain', 'unclear', 'ambiguous', 'not sure'],
      'information_seeking': ['need more', 'additional data', 'research', 'information'],
      'process_improvement': ['improve', 'better way', 'optimize', 'efficiency'],
      'collaboration': ['team', 'collaborate', 'consensus', 'others'],
      'learning': ['learn', 'study', 'understand', 'knowledge'],
      'bias_awareness': ['bias', 'assumption', 'prejudice', 'subjective'],
      'confidence_building': ['confidence', 'certainty', 'trust', 'belief']
    };

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(keyword => contentLower.includes(keyword))) {
        themes.push(theme);
      }
    }

    return themes;
  }

  /**
   * Identify patterns across responses
   */
  identifyPatterns(responses) {
    const patterns = [];
    const responseTexts = Object.values(responses);

    // Check for defensive language
    const defensiveMarkers = ['but', 'however', 'not my fault', 'couldn\'t help'];
    if (responseTexts.some(text => defensiveMarkers.some(marker => text.toLowerCase().includes(marker)))) {
      patterns.push('defensive_thinking');
    }

    // Check for growth mindset
    const growthMarkers = ['learn from', 'next time', 'improve', 'develop'];
    if (responseTexts.some(text => growthMarkers.some(marker => text.toLowerCase().includes(marker)))) {
      patterns.push('growth_mindset');
    }

    // Check for systems thinking
    const systemsMarkers = ['because', 'led to', 'caused', 'affected', 'impact'];
    if (responseTexts.some(text => systemsMarkers.some(marker => text.toLowerCase().includes(marker)))) {
      patterns.push('systems_thinking');
    }

    return patterns;
  }

  /**
   * Extract key insights from reflection analysis
   */
  extractInsights(analysis, triggerType, decisionData) {
    const insights = [];

    // Generate insights based on analysis scores
    if (analysis.self_awareness > 0.7) {
      insights.push({
        type: 'strength',
        area: 'self_awareness',
        description: 'Demonstrates strong self-awareness and introspection',
        confidence: 0.8
      });
    } else if (analysis.self_awareness < 0.3) {
      insights.push({
        type: 'weakness',
        area: 'self_awareness',
        description: 'Needs to develop deeper self-awareness',
        confidence: 0.7
      });
    }

    if (analysis.actionability > 0.6) {
      insights.push({
        type: 'strength',
        area: 'actionability',
        description: 'Good at identifying concrete action steps',
        confidence: 0.75
      });
    }

    // Theme-based insights
    if (analysis.themes.includes('uncertainty_management')) {
      insights.push({
        type: 'opportunity',
        area: 'decision_making',
        description: 'Focus area: Managing uncertainty in decisions',
        confidence: 0.7
      });
    }

    if (analysis.themes.includes('collaboration')) {
      insights.push({
        type: 'opportunity',
        area: 'teamwork',
        description: 'Values collaboration and team input',
        confidence: 0.65
      });
    }

    // Pattern-based insights
    if (analysis.patterns.includes('growth_mindset')) {
      insights.push({
        type: 'strength',
        area: 'mindset',
        description: 'Exhibits growth mindset and learning orientation',
        confidence: 0.8
      });
    }

    if (analysis.patterns.includes('defensive_thinking')) {
      insights.push({
        type: 'weakness',
        area: 'mindset',
        description: 'Shows defensive thinking; may resist feedback',
        confidence: 0.6
      });
    }

    return insights;
  }

  /**
   * Generate actionable learnings from insights
   */
  generateLearnings(insights, triggerType, performanceData) {
    const learnings = [];

    insights.forEach(insight => {
      if (insight.type === 'weakness' || insight.type === 'opportunity') {
        const learning = {
          area: insight.area,
          description: this.formulateLearning(insight),
          action_items: this.generateActionItems(insight),
          priority: this.prioritizeLearning(insight, triggerType),
          expected_impact: this.estimateImpact(insight),
          measurement_criteria: this.defineMeasurementCriteria(insight)
        };
        learnings.push(learning);
      }
    });

    return learnings;
  }

  /**
   * Formulate learning statement from insight
   */
  formulateLearning(insight) {
    const templates = {
      self_awareness: 'Develop deeper self-reflection practices to understand decision-making patterns',
      actionability: 'Create more specific and measurable action plans from reflections',
      decision_making: 'Build frameworks for managing uncertainty and ambiguous situations',
      teamwork: 'Leverage collaborative decision-making for complex problems',
      mindset: 'Cultivate openness to feedback and learning from mistakes'
    };

    return templates[insight.area] || `Improve ${insight.area}`;
  }

  /**
   * Generate action items for learning
   */
  generateActionItems(insight) {
    const actionMap = {
      self_awareness: [
        'Keep a decision journal noting reasoning and emotions',
        'Review past decisions weekly to identify patterns',
        'Seek feedback from peers on blind spots'
      ],
      actionability: [
        'Use SMART goals framework for action planning',
        'Break down learnings into concrete next steps',
        'Set deadlines for implementing each action'
      ],
      decision_making: [
        'Create decision-making templates for uncertain situations',
        'Practice probabilistic thinking',
        'Identify decision criteria upfront'
      ],
      teamwork: [
        'Initiate collaborative decisions for complex issues',
        'Actively seek diverse perspectives',
        'Practice consensus-building techniques'
      ],
      mindset: [
        'Adopt "what can I learn?" mindset for all feedback',
        'Celebrate mistakes as learning opportunities',
        'Practice non-defensive listening'
      ]
    };

    return actionMap[insight.area] || ['Define specific improvement actions'];
  }

  /**
   * Prioritize learning based on insight and trigger
   */
  prioritizeLearning(insight, triggerType) {
    // Critical triggers get high priority
    if (this.triggerTypes[triggerType].priority === 'critical') {
      return 'high';
    }

    // Weaknesses get higher priority than opportunities
    if (insight.type === 'weakness') {
      return insight.confidence > 0.7 ? 'high' : 'medium';
    }

    return 'medium';
  }

  /**
   * Estimate expected impact of learning
   */
  estimateImpact(insight) {
    const impactMap = {
      self_awareness: 'Improves decision quality by 15-20% through better understanding of biases',
      actionability: 'Increases implementation rate of improvements by 25-30%',
      decision_making: 'Reduces decision time in uncertain situations by 20%',
      teamwork: 'Improves decision quality in complex domains by 30%',
      mindset: 'Accelerates learning rate by 25% through better feedback integration'
    };

    return impactMap[insight.area] || 'Moderate positive impact on performance';
  }

  /**
   * Define how to measure learning success
   */
  defineMeasurementCriteria(insight) {
    const criteriaMap = {
      self_awareness: 'Confidence calibration score improves by 0.1+',
      actionability: '80%+ of action items completed within timeframe',
      decision_making: 'Decision confidence in uncertain cases increases to 0.7+',
      teamwork: 'Participate in 5+ collaborative decisions per month',
      mindset: 'Feedback acceptance rate increases to 90%+'
    };

    return criteriaMap[insight.area] || 'Measurable improvement observed';
  }

  /**
   * Assess quality of reflection
   */
  assessReflectionQuality(responses, insights, learnings) {
    // Calculate quality score (0-1)
    const responseQuality = Object.values(responses).every(r => r && r.length > 20) ? 0.3 : 0.1;
    const insightQuality = Math.min(0.4, insights.length * 0.1);
    const learningQuality = Math.min(0.3, learnings.length * 0.1);

    const score = responseQuality + insightQuality + learningQuality;

    const notes = [];
    if (score >= 0.8) notes.push('Excellent reflection with actionable insights');
    else if (score >= 0.6) notes.push('Good reflection, could be more detailed');
    else if (score >= 0.4) notes.push('Adequate reflection, needs more depth');
    else notes.push('Superficial reflection, needs significant improvement');

    return { score, notes };
  }

  /**
   * Apply learnings to agent's behavior
   */
  async applyLearnings(params) {
    const {
      agent_id,
      learnings,
      application_strategy = 'GRADUAL',
      context = {}
    } = params;

    if (!this.applicationStrategies[application_strategy]) {
      throw new Error(`Unknown application strategy: ${application_strategy}`);
    }

    const strategy = this.applicationStrategies[application_strategy];
    const applications = [];

    for (const learning of learnings) {
      const application = {
        learning_id: this.generateLearningId(),
        agent_id,
        learning_area: learning.area,
        learning_description: learning.description,
        strategy: application_strategy,
        timeframe: strategy.timeframe,
        scope: strategy.scope,
        action_items: learning.action_items,
        started_at: new Date(),
        status: 'active'
      };

      // Create implementation plan
      application.implementation_plan = this.createImplementationPlan(
        learning,
        strategy,
        context
      );

      // Set up tracking mechanisms
      application.tracking = this.setupTracking(learning, strategy);

      applications.push(application);
    }

    return {
      applications,
      total_learnings: learnings.length,
      strategy: application_strategy,
      expected_completion: this.calculateExpectedCompletion(applications, strategy)
    };
  }

  /**
   * Create implementation plan for learning
   */
  createImplementationPlan(learning, strategy, context) {
    const plan = {
      phases: [],
      milestones: [],
      checkpoints: []
    };

    if (strategy.timeframe === 'immediate') {
      plan.phases.push({
        phase: 1,
        name: 'Immediate Application',
        duration: '1 day',
        actions: learning.action_items.slice(0, 2)
      });
    } else if (strategy.timeframe === 'days') {
      plan.phases = [
        {
          phase: 1,
          name: 'Preparation',
          duration: '2 days',
          actions: ['Review learning', 'Identify application opportunities']
        },
        {
          phase: 2,
          name: 'Initial Application',
          duration: '3 days',
          actions: learning.action_items.slice(0, 2)
        },
        {
          phase: 3,
          name: 'Reinforcement',
          duration: '2 days',
          actions: learning.action_items.slice(2)
        }
      ];
    } else {
      // Ongoing
      plan.phases.push({
        phase: 1,
        name: 'Continuous Practice',
        duration: 'ongoing',
        actions: learning.action_items
      });
    }

    // Add milestones
    plan.milestones = learning.action_items.map((action, idx) => ({
      milestone: idx + 1,
      description: action,
      target_date: this.calculateMilestoneDate(idx, strategy.timeframe)
    }));

    // Add checkpoints
    plan.checkpoints = [
      { checkpoint: 1, timing: '25% complete', criteria: 'First action item completed' },
      { checkpoint: 2, timing: '50% complete', criteria: 'Half of actions implemented' },
      { checkpoint: 3, timing: '75% complete', criteria: 'Observable behavior change' },
      { checkpoint: 4, timing: '100% complete', criteria: learning.measurement_criteria }
    ];

    return plan;
  }

  /**
   * Calculate milestone target date
   */
  calculateMilestoneDate(index, timeframe) {
    const now = new Date();
    if (timeframe === 'immediate') {
      now.setHours(now.getHours() + (index + 1) * 4);
    } else if (timeframe === 'days') {
      now.setDate(now.getDate() + (index + 1) * 2);
    } else {
      now.setDate(now.getDate() + (index + 1) * 7);
    }
    return now;
  }

  /**
   * Set up tracking for learning application
   */
  setupTracking(learning, strategy) {
    return {
      metrics: [learning.measurement_criteria],
      check_frequency: strategy.timeframe === 'immediate' ? 'hourly' :
                      strategy.timeframe === 'days' ? 'daily' : 'weekly',
      success_threshold: 0.7,
      improvement_indicators: this.defineImprovementIndicators(learning.area)
    };
  }

  /**
   * Define improvement indicators for learning area
   */
  defineImprovementIndicators(area) {
    const indicators = {
      self_awareness: ['Better confidence calibration', 'More accurate self-assessments'],
      actionability: ['Higher completion rate', 'Faster implementation'],
      decision_making: ['Higher quality decisions', 'Better outcomes'],
      teamwork: ['More collaborations', 'Better consensus'],
      mindset: ['Positive feedback response', 'Faster learning']
    };

    return indicators[area] || ['General improvement'];
  }

  /**
   * Calculate expected completion date
   */
  calculateExpectedCompletion(applications, strategy) {
    const now = new Date();
    if (strategy.timeframe === 'immediate') {
      now.setDate(now.getDate() + 1);
    } else if (strategy.timeframe === 'days') {
      now.setDate(now.getDate() + 7);
    } else {
      now.setDate(now.getDate() + 30);
    }
    return now;
  }

  /**
   * Track outcomes of applied learnings
   */
  async trackOutcomes(params) {
    const {
      application_id,
      agent_id,
      learning_area,
      measurement_period = 'week',
      baseline_metrics = {},
      current_metrics = {}
    } = params;

    // Calculate improvement
    const improvement = this.calculateImprovement(baseline_metrics, current_metrics);

    // Assess effectiveness
    const effectiveness = this.assessEffectiveness(improvement, learning_area);

    // Identify side effects
    const sideEffects = this.identifySideEffects(baseline_metrics, current_metrics);

    // Generate insights
    const insights = this.generateOutcomeInsights(improvement, effectiveness, sideEffects);

    return {
      application_id,
      agent_id,
      learning_area,
      measurement_period,
      improvement,
      effectiveness,
      side_effects: sideEffects,
      insights,
      overall_success: effectiveness.success_rate >= 0.7,
      tracked_at: new Date()
    };
  }

  /**
   * Calculate improvement metrics
   */
  calculateImprovement(baseline, current) {
    const improvements = {};

    for (const metric in baseline) {
      if (current[metric] !== undefined) {
        const change = current[metric] - baseline[metric];
        const percentChange = baseline[metric] !== 0 ?
          (change / baseline[metric]) * 100 : 0;

        improvements[metric] = {
          baseline: baseline[metric],
          current: current[metric],
          absolute_change: change,
          percent_change: percentChange,
          direction: change > 0 ? 'improved' : change < 0 ? 'declined' : 'stable'
        };
      }
    }

    return improvements;
  }

  /**
   * Assess effectiveness of learning application
   */
  assessEffectiveness(improvement, learningArea) {
    const improved = Object.values(improvement).filter(i => i.direction === 'improved').length;
    const total = Object.values(improvement).length;
    const successRate = total > 0 ? improved / total : 0;

    return {
      success_rate: successRate,
      metrics_improved: improved,
      total_metrics: total,
      assessment: successRate >= 0.7 ? 'highly_effective' :
                 successRate >= 0.5 ? 'moderately_effective' :
                 successRate >= 0.3 ? 'slightly_effective' : 'ineffective',
      confidence: total >= 5 ? 0.8 : 0.6
    };
  }

  /**
   * Identify unintended side effects
   */
  identifySideEffects(baseline, current) {
    const sideEffects = [];

    // Check for trade-offs
    const declined = [];
    for (const metric in baseline) {
      if (current[metric] < baseline[metric]) {
        declined.push(metric);
      }
    }

    if (declined.length > 0) {
      sideEffects.push({
        type: 'performance_trade_off',
        description: `Improvement in target area may have affected: ${declined.join(', ')}`,
        severity: 'moderate',
        mitigation: 'Monitor and balance multiple performance dimensions'
      });
    }

    return sideEffects;
  }

  /**
   * Generate insights from outcome tracking
   */
  generateOutcomeInsights(improvement, effectiveness, sideEffects) {
    const insights = [];

    if (effectiveness.success_rate >= 0.7) {
      insights.push({
        type: 'success',
        message: 'Learning application highly effective, continue reinforcing',
        confidence: 0.8
      });
    } else if (effectiveness.success_rate < 0.3) {
      insights.push({
        type: 'concern',
        message: 'Learning not showing expected impact, may need different approach',
        confidence: 0.7
      });
    }

    if (sideEffects.length > 0) {
      insights.push({
        type: 'caution',
        message: 'Unintended effects detected, consider more balanced approach',
        confidence: 0.6
      });
    }

    return insights;
  }

  /**
   * Adjust behavior based on feedback and outcomes
   */
  async adjustBehavior(params) {
    const {
      agent_id,
      learning_area,
      outcome_data,
      effectiveness,
      adjustment_type = 'AUTO'
    } = params;

    const adjustments = [];

    // Determine adjustments based on effectiveness
    if (effectiveness.success_rate >= 0.7) {
      // Reinforce successful learning
      adjustments.push({
        type: 'REINFORCE',
        description: 'Successful learning - increase confidence and application',
        actions: [
          'Increase weighting of this learning in decision-making',
          'Share learning with other agents',
          'Apply to broader contexts'
        ],
        confidence: 0.8
      });
    } else if (effectiveness.success_rate >= 0.4) {
      // Moderate success - refine approach
      adjustments.push({
        type: 'REFINE',
        description: 'Partial success - refine application approach',
        actions: [
          'Identify which aspects worked well',
          'Adjust implementation strategy',
          'Continue monitoring'
        ],
        confidence: 0.6
      });
    } else {
      // Low success - pivot or abandon
      adjustments.push({
        type: 'PIVOT',
        description: 'Low effectiveness - try alternative approach or abandon',
        actions: [
          'Analyze why learning didn\'t work',
          'Try different implementation strategy',
          'Consider if learning applies to this context'
        ],
        confidence: 0.7
      });
    }

    return {
      agent_id,
      learning_area,
      adjustments,
      adjusted_at: new Date()
    };
  }

  /**
   * Helper methods
   */
  generateReflectionId() {
    return `refl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateLearningId() {
    return `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
const reflectionFeedbackService = new ReflectionFeedbackService();
export default reflectionFeedbackService;
