/**
 * Reflection Analytics Service
 *
 * Provides comprehensive analytics and insights on agent reflection and learning.
 * Tracks trends, calculates metrics, and generates actionable insights.
 *
 * Sprint 46 - Meta-Cognitive Reflection System
 * Phase 3: Analytics & Continuous Improvement
 */

import pool from '../db.js';

class ReflectionAnalyticsService {
  constructor() {
    this.db = pool;
    this.maturityLevels = this.initializeMaturityLevels();
    this.trendIndicators = this.initializeTrendIndicators();
  }

  async initialize() {
    // Pool already initialized
  }

  /**
   * Initialize agent maturity levels
   */
  initializeMaturityLevels() {
    return {
      NOVICE: {
        level: 1,
        description: 'Beginning to develop reflection capabilities',
        criteria: {
          reflection_count: [0, 10],
          avg_reflection_quality: [0, 0.4],
          learning_implementation_rate: [0, 0.3],
          confidence_calibration: [0, 0.5]
        },
        capabilities: ['Basic reflection', 'Simple insights']
      },
      DEVELOPING: {
        level: 2,
        description: 'Building consistent reflection practices',
        criteria: {
          reflection_count: [10, 30],
          avg_reflection_quality: [0.4, 0.6],
          learning_implementation_rate: [0.3, 0.5],
          confidence_calibration: [0.5, 0.65]
        },
        capabilities: ['Regular reflection', 'Pattern recognition', 'Basic action planning']
      },
      PROFICIENT: {
        level: 3,
        description: 'Consistent high-quality reflection and learning',
        criteria: {
          reflection_count: [30, 75],
          avg_reflection_quality: [0.6, 0.75],
          learning_implementation_rate: [0.5, 0.7],
          confidence_calibration: [0.65, 0.8]
        },
        capabilities: ['Deep reflection', 'Effective learning extraction', 'Systematic improvement']
      },
      ADVANCED: {
        level: 4,
        description: 'Advanced meta-cognitive capabilities',
        criteria: {
          reflection_count: [75, 150],
          avg_reflection_quality: [0.75, 0.85],
          learning_implementation_rate: [0.7, 0.85],
          confidence_calibration: [0.8, 0.9]
        },
        capabilities: ['Meta-cognitive awareness', 'Proactive learning', 'Knowledge sharing']
      },
      EXPERT: {
        level: 5,
        description: 'Expert-level reflection and continuous improvement',
        criteria: {
          reflection_count: [150, Infinity],
          avg_reflection_quality: [0.85, 1.0],
          learning_implementation_rate: [0.85, 1.0],
          confidence_calibration: [0.9, 1.0]
        },
        capabilities: ['Exceptional self-awareness', 'Innovative learning', 'Teaching others', 'System-level insights']
      }
    };
  }

  /**
   * Initialize trend indicators
   */
  initializeTrendIndicators() {
    return {
      IMPROVING: { description: 'Positive upward trend', threshold: 0.05, direction: 'up' },
      STABLE: { description: 'Consistent performance', threshold: 0.05, direction: 'flat' },
      DECLINING: { description: 'Negative downward trend', threshold: -0.05, direction: 'down' },
      VOLATILE: { description: 'High variability', threshold: 0.2, direction: 'mixed' },
      BREAKTHROUGH: { description: 'Sudden significant improvement', threshold: 0.2, direction: 'spike' }
    };
  }

  /**
   * Get comprehensive analytics dashboard
   */
  async getDashboard(params) {
    const {
      agent_id,
      timeframe = 'month',
      include_comparisons = true
    } = params;

    // Calculate learning metrics
    const learningMetrics = await this.calculateLearningMetrics({ agent_id, timeframe });

    // Analyze trends
    const trends = await this.analyzeTrends({ agent_id, timeframe });

    // Assess agent maturity
    const maturity = await this.assessAgentMaturity({ agent_id });

    // Generate insights
    const insights = await this.generateInsights({
      agent_id,
      learning_metrics: learningMetrics,
      trends,
      maturity
    });

    // Get comparison data if requested
    let comparisons = null;
    if (include_comparisons) {
      comparisons = await this.getComparisons({ agent_id, timeframe });
    }

    return {
      agent_id,
      timeframe,
      generated_at: new Date(),
      learning_metrics: learningMetrics,
      trends,
      maturity,
      insights,
      comparisons,
      summary: this.generateDashboardSummary(learningMetrics, trends, maturity, insights)
    };
  }

  /**
   * Calculate learning metrics
   */
  async calculateLearningMetrics(params) {
    const { agent_id, timeframe } = params;

    // Mock data for algorithm demonstration
    // In production, would query actual database
    const mockData = {
      total_reflections: 45,
      avg_reflection_quality: 0.72,
      total_learnings: 38,
      learnings_implemented: 28,
      learnings_successful: 22,
      total_mistakes: 12,
      mistakes_learned_from: 10,
      collaborative_decisions: 15,
      consensus_rate: 0.8
    };

    // Calculate derived metrics
    const metrics = {
      // Volume metrics
      reflection_count: mockData.total_reflections,
      learning_count: mockData.total_learnings,
      mistake_count: mockData.total_mistakes,
      collaboration_count: mockData.collaborative_decisions,

      // Quality metrics
      avg_reflection_quality: mockData.avg_reflection_quality,
      reflection_quality_tier: this.classifyQuality(mockData.avg_reflection_quality),

      // Effectiveness metrics
      learning_implementation_rate: mockData.learnings_implemented / mockData.total_learnings,
      learning_success_rate: mockData.learnings_successful / mockData.learnings_implemented,
      mistake_learning_rate: mockData.mistakes_learned_from / mockData.total_mistakes,
      consensus_achievement_rate: mockData.consensus_rate,

      // Frequency metrics
      avg_reflections_per_week: this.calculateWeeklyAverage(mockData.total_reflections, timeframe),
      avg_learnings_per_week: this.calculateWeeklyAverage(mockData.total_learnings, timeframe),

      // Composite scores
      learning_velocity: this.calculateLearningVelocity(mockData),
      improvement_momentum: this.calculateImprovementMomentum(mockData),
      meta_cognitive_score: this.calculateMetaCognitiveScore(mockData)
    };

    return metrics;
  }

  /**
   * Classify quality tier
   */
  classifyQuality(score) {
    if (score >= 0.85) return 'EXCELLENT';
    if (score >= 0.70) return 'GOOD';
    if (score >= 0.60) return 'FAIR';
    return 'POOR';
  }

  /**
   * Calculate weekly average
   */
  calculateWeeklyAverage(total, timeframe) {
    const weeks = {
      week: 1,
      month: 4,
      quarter: 13,
      year: 52
    };
    return total / (weeks[timeframe] || 4);
  }

  /**
   * Calculate learning velocity (rate of learning over time)
   */
  calculateLearningVelocity(data) {
    // Learning velocity = (learnings implemented successfully) / time
    // Normalized to 0-1 scale
    const successfulLearnings = data.learnings_successful;
    const totalReflections = data.total_reflections;

    if (totalReflections === 0) return 0;

    const velocity = successfulLearnings / totalReflections;
    return Math.min(1, velocity * 2); // Scale up to make it meaningful
  }

  /**
   * Calculate improvement momentum
   */
  calculateImprovementMomentum(data) {
    // Momentum considers multiple factors:
    // - Learning implementation rate
    // - Success rate
    // - Mistake learning rate
    const implementationRate = data.learnings_implemented / data.total_learnings;
    const successRate = data.learnings_successful / data.learnings_implemented;
    const mistakeLearningRate = data.mistakes_learned_from / data.total_mistakes;

    const momentum = (
      implementationRate * 0.3 +
      successRate * 0.4 +
      mistakeLearningRate * 0.3
    );

    return Math.min(1, momentum);
  }

  /**
   * Calculate overall meta-cognitive score
   */
  calculateMetaCognitiveScore(data) {
    // Composite score of all reflection capabilities
    const qualityScore = data.avg_reflection_quality;
    const volumeScore = Math.min(1, data.total_reflections / 50); // Normalize to 50 reflections
    const effectivenessScore = data.learnings_successful / Math.max(1, data.learnings_implemented);
    const collaborationScore = data.consensus_rate;

    return (
      qualityScore * 0.35 +
      volumeScore * 0.15 +
      effectivenessScore * 0.35 +
      collaborationScore * 0.15
    );
  }

  /**
   * Analyze trends over time
   */
  async analyzeTrends(params) {
    const { agent_id, timeframe } = params;

    // Mock time series data
    // In production, would query actual historical data
    const mockTimeSeries = this.generateMockTimeSeries(timeframe);

    // Analyze different metrics
    const trends = {
      reflection_quality: this.analyzeTrend(mockTimeSeries.quality),
      learning_velocity: this.analyzeTrend(mockTimeSeries.velocity),
      implementation_rate: this.analyzeTrend(mockTimeSeries.implementation),
      confidence_calibration: this.analyzeTrend(mockTimeSeries.calibration)
    };

    // Identify overall trend direction
    const overallTrend = this.determineOverallTrend(trends);

    // Forecast future performance
    const forecast = this.generateForecast(mockTimeSeries, trends);

    // Identify inflection points
    const inflectionPoints = this.identifyInflectionPoints(mockTimeSeries);

    return {
      trends,
      overall_trend: overallTrend,
      forecast,
      inflection_points: inflectionPoints,
      trend_strength: this.calculateTrendStrength(trends),
      volatility: this.calculateVolatility(mockTimeSeries)
    };
  }

  /**
   * Generate mock time series data
   */
  generateMockTimeSeries(timeframe) {
    const points = timeframe === 'week' ? 7 : timeframe === 'month' ? 30 : 90;

    return {
      quality: this.generateSeriesData(points, 0.65, 0.72, 0.05),
      velocity: this.generateSeriesData(points, 0.45, 0.55, 0.08),
      implementation: this.generateSeriesData(points, 0.60, 0.74, 0.06),
      calibration: this.generateSeriesData(points, 0.70, 0.78, 0.04)
    };
  }

  /**
   * Generate series data with trend
   */
  generateSeriesData(points, start, end, noise) {
    const data = [];
    const increment = (end - start) / points;

    for (let i = 0; i < points; i++) {
      const trend = start + (increment * i);
      const randomNoise = (Math.random() - 0.5) * noise;
      data.push(Math.max(0, Math.min(1, trend + randomNoise)));
    }

    return data;
  }

  /**
   * Analyze trend in time series
   */
  analyzeTrend(series) {
    if (series.length < 2) {
      return { direction: 'STABLE', slope: 0, confidence: 0 };
    }

    // Calculate linear regression slope
    const n = series.length;
    const xMean = (n - 1) / 2;
    const yMean = series.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (series[i] - yMean);
      denominator += Math.pow(i - xMean, 2);
    }

    const slope = numerator / denominator;

    // Determine trend direction
    let direction;
    if (Math.abs(slope) < 0.001) direction = 'STABLE';
    else if (slope > 0.005) direction = 'IMPROVING';
    else if (slope < -0.005) direction = 'DECLINING';
    else direction = 'STABLE';

    // Calculate R-squared for confidence
    const predictions = series.map((_, i) => yMean + slope * (i - xMean));
    const ssRes = series.reduce((sum, y, i) => sum + Math.pow(y - predictions[i], 2), 0);
    const ssTot = series.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
    const rSquared = 1 - (ssRes / ssTot);

    return {
      direction,
      slope,
      confidence: Math.max(0, rSquared),
      start_value: series[0],
      end_value: series[series.length - 1],
      change_percent: ((series[series.length - 1] - series[0]) / series[0]) * 100
    };
  }

  /**
   * Determine overall trend across all metrics
   */
  determineOverallTrend(trends) {
    const directions = Object.values(trends).map(t => t.direction);

    const improving = directions.filter(d => d === 'IMPROVING').length;
    const declining = directions.filter(d => d === 'DECLINING').length;
    const stable = directions.filter(d => d === 'STABLE').length;

    if (improving > declining + stable) return 'IMPROVING';
    if (declining > improving + stable) return 'DECLINING';
    if (stable >= improving && stable >= declining) return 'STABLE';
    return 'MIXED';
  }

  /**
   * Generate performance forecast
   */
  generateForecast(timeSeries, trends) {
    const forecastHorizon = 7; // 7 periods ahead
    const forecasts = {};

    // Map time series keys to trend keys
    const metricMap = {
      quality: 'reflection_quality',
      velocity: 'learning_velocity',
      implementation: 'implementation_rate',
      calibration: 'confidence_calibration'
    };

    for (const [seriesKey, series] of Object.entries(timeSeries)) {
      const trendKey = metricMap[seriesKey] || seriesKey;
      const trend = trends[trendKey];

      if (!trend) continue; // Skip if trend not found

      const lastValue = series[series.length - 1];

      const forecastValues = [];
      for (let i = 1; i <= forecastHorizon; i++) {
        const predicted = lastValue + (trend.slope * i);
        forecastValues.push({
          period: i,
          predicted_value: Math.max(0, Math.min(1, predicted)),
          confidence_interval: {
            lower: Math.max(0, predicted - 0.05),
            upper: Math.min(1, predicted + 0.05)
          }
        });
      }

      forecasts[trendKey] = forecastValues;
    }

    return forecasts;
  }

  /**
   * Identify inflection points (significant changes)
   */
  identifyInflectionPoints(timeSeries) {
    const inflectionPoints = [];

    for (const [metric, series] of Object.entries(timeSeries)) {
      // Look for sudden changes > 15%
      for (let i = 1; i < series.length; i++) {
        const change = Math.abs(series[i] - series[i - 1]);
        const percentChange = (change / series[i - 1]) * 100;

        if (percentChange > 15) {
          inflectionPoints.push({
            metric,
            period: i,
            change_type: series[i] > series[i - 1] ? 'breakthrough' : 'decline',
            magnitude: percentChange,
            before: series[i - 1],
            after: series[i]
          });
        }
      }
    }

    return inflectionPoints;
  }

  /**
   * Calculate trend strength
   */
  calculateTrendStrength(trends) {
    const avgConfidence = Object.values(trends)
      .reduce((sum, t) => sum + t.confidence, 0) / Object.values(trends).length;

    const avgSlope = Math.abs(
      Object.values(trends).reduce((sum, t) => sum + Math.abs(t.slope), 0) / Object.values(trends).length
    );

    return {
      confidence: avgConfidence,
      magnitude: avgSlope,
      strength: avgConfidence * avgSlope * 100 // 0-100 scale
    };
  }

  /**
   * Calculate volatility (variability in metrics)
   */
  calculateVolatility(timeSeries) {
    const volatilities = {};

    for (const [metric, series] of Object.entries(timeSeries)) {
      const mean = series.reduce((a, b) => a + b, 0) / series.length;
      const variance = series.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / series.length;
      const stdDev = Math.sqrt(variance);

      volatilities[metric] = {
        std_deviation: stdDev,
        coefficient_of_variation: stdDev / mean,
        volatility_level: stdDev > 0.15 ? 'HIGH' : stdDev > 0.08 ? 'MODERATE' : 'LOW'
      };
    }

    return volatilities;
  }

  /**
   * Assess agent maturity level
   */
  async assessAgentMaturity(params) {
    const { agent_id } = params;

    // Get agent's metrics
    const metrics = {
      reflection_count: 45,
      avg_reflection_quality: 0.72,
      learning_implementation_rate: 0.74,
      confidence_calibration: 0.78
    };

    // Determine maturity level
    let maturityLevel = null;
    let matchScore = 0;

    for (const [level, config] of Object.entries(this.maturityLevels)) {
      const score = this.calculateMaturityMatch(metrics, config.criteria);
      if (score > matchScore) {
        matchScore = score;
        maturityLevel = level;
      }
    }

    const maturityConfig = this.maturityLevels[maturityLevel];

    // Calculate progress to next level
    const nextLevel = this.getNextMaturityLevel(maturityLevel);
    const progressToNext = nextLevel ? this.calculateProgressToNextLevel(metrics, nextLevel) : null;

    return {
      current_level: maturityLevel,
      level_number: maturityConfig.level,
      description: maturityConfig.description,
      capabilities: maturityConfig.capabilities,
      match_score: matchScore,
      next_level: nextLevel,
      progress_to_next: progressToNext,
      strengths: this.identifyMaturityStrengths(metrics, maturityConfig),
      areas_for_growth: this.identifyMaturityGrowthAreas(metrics, maturityConfig)
    };
  }

  /**
   * Calculate how well metrics match maturity criteria
   */
  calculateMaturityMatch(metrics, criteria) {
    let totalMatch = 0;
    let criteriaCount = 0;

    for (const [criterion, range] of Object.entries(criteria)) {
      if (metrics[criterion] !== undefined) {
        const [min, max] = range;
        if (metrics[criterion] >= min && metrics[criterion] <= max) {
          totalMatch += 1;
        } else if (metrics[criterion] > max) {
          // Still counts as partial match if exceeding
          totalMatch += 0.5;
        }
        criteriaCount += 1;
      }
    }

    return criteriaCount > 0 ? totalMatch / criteriaCount : 0;
  }

  /**
   * Get next maturity level
   */
  getNextMaturityLevel(currentLevel) {
    const levelOrder = ['NOVICE', 'DEVELOPING', 'PROFICIENT', 'ADVANCED', 'EXPERT'];
    const currentIndex = levelOrder.indexOf(currentLevel);

    if (currentIndex >= 0 && currentIndex < levelOrder.length - 1) {
      return levelOrder[currentIndex + 1];
    }

    return null; // Already at max level
  }

  /**
   * Calculate progress to next maturity level
   */
  calculateProgressToNextLevel(metrics, nextLevel) {
    const nextCriteria = this.maturityLevels[nextLevel].criteria;
    const progress = {};

    for (const [criterion, range] of Object.entries(nextCriteria)) {
      if (metrics[criterion] !== undefined) {
        const [min, max] = range;
        const current = metrics[criterion];

        if (current >= min) {
          progress[criterion] = 1.0; // Already meets or exceeds
        } else {
          // Calculate how close to minimum threshold
          const gap = min - current;
          const percentProgress = Math.max(0, 1 - (gap / min));
          progress[criterion] = percentProgress;
        }
      }
    }

    const avgProgress = Object.values(progress).reduce((a, b) => a + b, 0) / Object.values(progress).length;

    return {
      overall_progress: avgProgress,
      criterion_progress: progress,
      estimated_time_to_next: this.estimateTimeToNextLevel(avgProgress)
    };
  }

  /**
   * Estimate time to reach next level
   */
  estimateTimeToNextLevel(progress) {
    if (progress >= 0.9) return '1-2 weeks';
    if (progress >= 0.7) return '3-4 weeks';
    if (progress >= 0.5) return '2-3 months';
    if (progress >= 0.3) return '3-6 months';
    return '6+ months';
  }

  /**
   * Identify maturity strengths
   */
  identifyMaturityStrengths(metrics, maturityConfig) {
    const strengths = [];

    for (const [criterion, range] of Object.entries(maturityConfig.criteria)) {
      if (metrics[criterion] >= range[1]) {
        strengths.push({
          area: criterion,
          level: 'exceeds_level',
          value: metrics[criterion]
        });
      }
    }

    return strengths;
  }

  /**
   * Identify areas for maturity growth
   */
  identifyMaturityGrowthAreas(metrics, maturityConfig) {
    const growthAreas = [];

    for (const [criterion, range] of Object.entries(maturityConfig.criteria)) {
      if (metrics[criterion] < range[0]) {
        growthAreas.push({
          area: criterion,
          current: metrics[criterion],
          target: range[0],
          gap: range[0] - metrics[criterion]
        });
      }
    }

    return growthAreas;
  }

  /**
   * Generate actionable insights
   */
  async generateInsights(params) {
    const { agent_id, learning_metrics, trends, maturity } = params;

    const insights = [];

    // Performance insights
    insights.push(...this.generatePerformanceInsights(learning_metrics));

    // Trend insights
    insights.push(...this.generateTrendInsights(trends));

    // Maturity insights
    insights.push(...this.generateMaturityInsights(maturity));

    // Opportunity insights
    insights.push(...this.generateOpportunityInsights(learning_metrics, trends, maturity));

    // Risk insights
    insights.push(...this.generateRiskInsights(learning_metrics, trends));

    // Prioritize insights
    const prioritized = this.prioritizeInsights(insights);

    return {
      total_insights: prioritized.length,
      insights: prioritized,
      top_recommendations: prioritized.slice(0, 3),
      insight_categories: this.categorizeInsights(prioritized)
    };
  }

  /**
   * Generate performance insights
   */
  generatePerformanceInsights(metrics) {
    const insights = [];

    // High learning implementation rate
    if (metrics.learning_implementation_rate > 0.8) {
      insights.push({
        type: 'strength',
        category: 'performance',
        title: 'Excellent Learning Implementation',
        description: `Implementing ${(metrics.learning_implementation_rate * 100).toFixed(0)}% of learnings`,
        impact: 'high',
        confidence: 0.9
      });
    }

    // Low mistake learning rate
    if (metrics.mistake_learning_rate < 0.5) {
      insights.push({
        type: 'concern',
        category: 'performance',
        title: 'Missing Learning Opportunities',
        description: 'Not consistently learning from mistakes',
        recommendation: 'Implement post-mistake reflection process',
        impact: 'medium',
        confidence: 0.8
      });
    }

    // High meta-cognitive score
    if (metrics.meta_cognitive_score > 0.75) {
      insights.push({
        type: 'strength',
        category: 'capability',
        title: 'Strong Meta-Cognitive Abilities',
        description: 'Demonstrates excellent self-awareness and reflection',
        impact: 'high',
        confidence: 0.85
      });
    }

    return insights;
  }

  /**
   * Generate trend insights
   */
  generateTrendInsights(trends) {
    const insights = [];

    // Overall improving trend
    if (trends.overall_trend === 'IMPROVING') {
      insights.push({
        type: 'positive',
        category: 'trend',
        title: 'Positive Performance Trajectory',
        description: 'All key metrics showing improvement',
        impact: 'high',
        confidence: 0.9
      });
    }

    // Declining trend
    if (trends.overall_trend === 'DECLINING') {
      insights.push({
        type: 'alert',
        category: 'trend',
        title: 'Performance Decline Detected',
        description: 'Multiple metrics trending downward',
        recommendation: 'Investigate root causes and implement corrective actions',
        impact: 'high',
        confidence: 0.85
      });
    }

    // Check for inflection points
    if (trends.inflection_points.length > 0) {
      const breakthroughs = trends.inflection_points.filter(p => p.change_type === 'breakthrough');
      if (breakthroughs.length > 0) {
        insights.push({
          type: 'highlight',
          category: 'achievement',
          title: 'Breakthrough Improvement Detected',
          description: `Significant improvement in ${breakthroughs[0].metric}`,
          impact: 'high',
          confidence: 0.8
        });
      }
    }

    return insights;
  }

  /**
   * Generate maturity insights
   */
  generateMaturityInsights(maturity) {
    const insights = [];

    // Approaching next level
    if (maturity.progress_to_next && maturity.progress_to_next.overall_progress > 0.7) {
      insights.push({
        type: 'opportunity',
        category: 'growth',
        title: `Close to ${maturity.next_level} Level`,
        description: `${(maturity.progress_to_next.overall_progress * 100).toFixed(0)}% progress to next maturity level`,
        recommendation: `Focus on: ${Object.entries(maturity.progress_to_next.criterion_progress)
          .filter(([k, v]) => v < 1.0)
          .map(([k, v]) => k)
          .join(', ')}`,
        impact: 'medium',
        confidence: 0.75
      });
    }

    // Growth areas identified
    if (maturity.areas_for_growth.length > 0) {
      insights.push({
        type: 'recommendation',
        category: 'development',
        title: 'Maturity Development Opportunities',
        description: `${maturity.areas_for_growth.length} areas below level criteria`,
        recommendation: `Prioritize: ${maturity.areas_for_growth[0].area}`,
        impact: 'medium',
        confidence: 0.7
      });
    }

    return insights;
  }

  /**
   * Generate opportunity insights
   */
  generateOpportunityInsights(metrics, trends, maturity) {
    const insights = [];

    // Low collaboration
    if (metrics.collaboration_count < 5) {
      insights.push({
        type: 'opportunity',
        category: 'collaboration',
        title: 'Increase Collaborative Learning',
        description: 'Limited collaborative decision-making experience',
        recommendation: 'Seek 2-3 collaborative decisions per week',
        impact: 'medium',
        confidence: 0.7
      });
    }

    // High quality but low volume
    if (metrics.avg_reflection_quality > 0.75 && metrics.reflection_count < 30) {
      insights.push({
        type: 'opportunity',
        category: 'volume',
        title: 'Scale Up High-Quality Reflections',
        description: 'Quality is excellent, increase frequency',
        recommendation: 'Aim for daily reflections',
        impact: 'medium',
        confidence: 0.75
      });
    }

    return insights;
  }

  /**
   * Generate risk insights
   */
  generateRiskInsights(metrics, trends) {
    const insights = [];

    // Low learning velocity
    if (metrics.learning_velocity < 0.3) {
      insights.push({
        type: 'risk',
        category: 'effectiveness',
        title: 'Low Learning Velocity',
        description: 'Slow pace of converting reflections to learnings',
        recommendation: 'Review reflection-to-action conversion process',
        impact: 'medium',
        confidence: 0.7
      });
    }

    // High volatility
    const highVolatility = Object.values(trends.volatility).filter(v => v.volatility_level === 'HIGH');
    if (highVolatility.length > 0) {
      insights.push({
        type: 'risk',
        category: 'stability',
        title: 'Performance Volatility Detected',
        description: 'Inconsistent performance across time periods',
        recommendation: 'Focus on building consistent practices',
        impact: 'low',
        confidence: 0.65
      });
    }

    return insights;
  }

  /**
   * Prioritize insights by impact and confidence
   */
  prioritizeInsights(insights) {
    const impactScores = { high: 3, medium: 2, low: 1 };

    return insights.sort((a, b) => {
      const scoreA = impactScores[a.impact] * a.confidence;
      const scoreB = impactScores[b.impact] * b.confidence;
      return scoreB - scoreA;
    });
  }

  /**
   * Categorize insights
   */
  categorizeInsights(insights) {
    const categories = {};

    insights.forEach(insight => {
      if (!categories[insight.category]) {
        categories[insight.category] = [];
      }
      categories[insight.category].push(insight);
    });

    return categories;
  }

  /**
   * Get comparison data with other agents
   */
  async getComparisons(params) {
    const { agent_id, timeframe } = params;

    // Mock peer data
    const peerAverage = {
      reflection_count: 35,
      avg_reflection_quality: 0.68,
      learning_implementation_rate: 0.65,
      meta_cognitive_score: 0.67
    };

    const agentMetrics = await this.calculateLearningMetrics({ agent_id, timeframe });

    return {
      peer_average: peerAverage,
      agent_vs_peer: {
        reflection_count: this.compareMetric(agentMetrics.reflection_count, peerAverage.reflection_count),
        quality: this.compareMetric(agentMetrics.avg_reflection_quality, peerAverage.avg_reflection_quality),
        implementation: this.compareMetric(agentMetrics.learning_implementation_rate, peerAverage.learning_implementation_rate),
        overall: this.compareMetric(agentMetrics.meta_cognitive_score, peerAverage.meta_cognitive_score)
      },
      percentile_rank: this.calculatePercentileRank(agentMetrics.meta_cognitive_score)
    };
  }

  /**
   * Compare metric to peer average
   */
  compareMetric(agentValue, peerValue) {
    const diff = agentValue - peerValue;
    const percentDiff = (diff / peerValue) * 100;

    return {
      agent: agentValue,
      peer_avg: peerValue,
      difference: diff,
      percent_difference: percentDiff,
      comparison: diff > 0 ? 'above_average' : diff < 0 ? 'below_average' : 'average'
    };
  }

  /**
   * Calculate percentile rank
   */
  calculatePercentileRank(score) {
    // Simple approximation based on score
    if (score >= 0.85) return 95;
    if (score >= 0.75) return 80;
    if (score >= 0.65) return 60;
    if (score >= 0.55) return 40;
    return 25;
  }

  /**
   * Generate dashboard summary
   */
  generateDashboardSummary(metrics, trends, maturity, insights) {
    const criticalInsights = insights.insights.filter(i =>
      i.type === 'alert' || i.type === 'risk'
    );

    const opportunities = insights.insights.filter(i => i.type === 'opportunity');

    return {
      headline: this.generateHeadline(metrics, trends, maturity),
      overall_status: this.determineOverallStatus(metrics, trends),
      key_strengths: this.identifyKeyStrengths(metrics, insights),
      critical_attention: criticalInsights.length,
      improvement_opportunities: opportunities.length,
      maturity_status: `${maturity.current_level} (Level ${maturity.level_number})`,
      next_milestone: maturity.next_level || 'At maximum level'
    };
  }

  /**
   * Generate headline summary
   */
  generateHeadline(metrics, trends, maturity) {
    if (trends.overall_trend === 'IMPROVING' && maturity.level_number >= 3) {
      return 'Strong performance with positive trajectory';
    } else if (trends.overall_trend === 'DECLINING') {
      return 'Performance decline requires attention';
    } else if (metrics.meta_cognitive_score > 0.75) {
      return 'Excellent meta-cognitive capabilities';
    } else {
      return 'Steady development in progress';
    }
  }

  /**
   * Determine overall status
   */
  determineOverallStatus(metrics, trends) {
    if (metrics.meta_cognitive_score > 0.75 && trends.overall_trend !== 'DECLINING') {
      return 'EXCELLENT';
    } else if (metrics.meta_cognitive_score > 0.60 && trends.overall_trend === 'IMPROVING') {
      return 'GOOD';
    } else if (trends.overall_trend === 'DECLINING') {
      return 'NEEDS_ATTENTION';
    } else {
      return 'SATISFACTORY';
    }
  }

  /**
   * Identify key strengths
   */
  identifyKeyStrengths(metrics, insights) {
    const strengths = insights.insights
      .filter(i => i.type === 'strength' || i.type === 'positive')
      .slice(0, 3)
      .map(i => i.title);

    return strengths.length > 0 ? strengths : ['Developing capabilities'];
  }
}

// Singleton instance
const reflectionAnalyticsService = new ReflectionAnalyticsService();
export default reflectionAnalyticsService;
