#!/usr/bin/env node

/**
 * Checkpoint 3: Analytics & Continuous Improvement
 *
 * Tests:
 * - Reflection Feedback Loop Service
 * - Reflection Analytics Service
 * - Improvement Recommendation Engine
 *
 * Sprint 46 - Meta-Cognitive Reflection System
 * Phase 3 Validation
 */

import reflectionFeedbackService from '../../server/services/reflectionFeedbackService.js';
import reflectionAnalyticsService from '../../server/services/reflectionAnalyticsService.js';
import improvementRecommendationEngine from '../../server/services/improvementRecommendationEngine.js';

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function logTest(testName, condition, details = '') {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    if (details) console.log(`   Details: ${details}`);
    testsFailed++;
  }
}

function logSection(title) {
  console.log(`\n📋 SECTION ${title}\n`);
}

async function runCheckpoint3() {
  console.log('='.repeat(80));
  console.log('CHECKPOINT 3: Analytics & Continuous Improvement');
  console.log('='.repeat(80));

  // ==========================================
  // SECTION 1: REFLECTION FEEDBACK LOOP
  // ==========================================

  logSection('1: REFLECTION FEEDBACK LOOP SERVICE');

  // Test 1: Service Initialization
  logTest(
    'Reflection feedback service initialization',
    reflectionFeedbackService !== null && reflectionFeedbackService !== undefined,
    'Service object created'
  );

  // Test 2-7: Trigger Types
  console.log('\n🎯 Trigger Types Tests:\n');

  const triggerTypes = reflectionFeedbackService.triggerTypes;

  logTest(
    'Trigger types defined',
    triggerTypes !== null && typeof triggerTypes === 'object',
    `Found ${Object.keys(triggerTypes).length} trigger types`
  );

  const expectedTriggers = ['LOW_CONFIDENCE', 'ERROR_DETECTED', 'FEEDBACK_RECEIVED', 'PERIODIC', 'PERFORMANCE_DROP', 'KNOWLEDGE_GAP'];
  logTest(
    'All 6 trigger types present',
    expectedTriggers.every(t => triggerTypes[t] !== undefined),
    `Expected: ${expectedTriggers.length}`
  );

  // Test 3: Trigger Reflection
  const mockTriggerData = {
    confidence: 0.5,
    has_error: false,
    feedback: null,
    is_scheduled: false,
    performance_drop_ratio: 0.1,
    knowledge_gaps: []
  };

  const triggerResult = await reflectionFeedbackService.triggerReflection({
    agent_id: 'test-agent-1',
    trigger_type: 'LOW_CONFIDENCE',
    decision_id: 'decision-123',
    trigger_data: mockTriggerData,
    context: {}
  });

  logTest(
    'Reflection triggered successfully',
    triggerResult.triggered === true,
    `Trigger: ${triggerResult.trigger_type}`
  );

  logTest(
    'Reflection has prompts',
    Array.isArray(triggerResult.prompts) && triggerResult.prompts.length > 0,
    `Generated ${triggerResult.prompts.length} prompts`
  );

  logTest(
    'Reflection has scope',
    triggerResult.scope !== undefined && triggerResult.scope.type !== undefined,
    `Scope type: ${triggerResult.scope?.type}`
  );

  // Test 4: Process Reflection
  console.log('\n🔄 Reflection Processing Tests:\n');

  const mockResponses = {
    q1: 'I realized that I lacked sufficient data to make a confident decision. Specifically, I needed more market analysis.',
    q2: 'Next time, I will gather comprehensive data before deciding. I should also consult with team members who have domain expertise.',
    q3: 'I need to develop better uncertainty management frameworks and build a checklist for high-stakes decisions.'
  };

  const processedReflection = await reflectionFeedbackService.processReflection({
    reflection_id: triggerResult.reflection_id,
    agent_id: 'test-agent-1',
    trigger_type: 'LOW_CONFIDENCE',
    responses: mockResponses,
    decision_data: null,
    performance_data: null
  });

  logTest(
    'Reflection processed',
    processedReflection !== null && processedReflection.analysis !== undefined,
    'Analysis completed'
  );

  logTest(
    'Analysis includes depth score',
    processedReflection.analysis.depth > 0 && processedReflection.analysis.depth <= 1,
    `Depth: ${processedReflection.analysis.depth.toFixed(2)}`
  );

  logTest(
    'Insights extracted',
    Array.isArray(processedReflection.insights) && processedReflection.insights.length > 0,
    `Found ${processedReflection.insights.length} insights`
  );

  logTest(
    'Learnings generated',
    Array.isArray(processedReflection.learnings) && processedReflection.learnings.length > 0,
    `Generated ${processedReflection.learnings.length} learnings`
  );

  // Test 5: Apply Learnings
  console.log('\n📚 Learning Application Tests:\n');

  const applyResult = await reflectionFeedbackService.applyLearnings({
    agent_id: 'test-agent-1',
    learnings: processedReflection.learnings,
    application_strategy: 'GRADUAL',
    context: {}
  });

  logTest(
    'Learnings applied',
    applyResult.applications !== undefined && applyResult.applications.length > 0,
    `${applyResult.applications.length} applications created`
  );

  logTest(
    'Implementation plans created',
    applyResult.applications.every(app => app.implementation_plan !== undefined),
    'All applications have plans'
  );

  // Test 6: Track Outcomes
  console.log('\n📊 Outcome Tracking Tests:\n');

  const outcomeResult = await reflectionFeedbackService.trackOutcomes({
    application_id: 'app-123',
    agent_id: 'test-agent-1',
    learning_area: 'decision_making',
    measurement_period: 'week',
    baseline_metrics: { decision_quality: 0.65, confidence: 0.60 },
    current_metrics: { decision_quality: 0.75, confidence: 0.70 }
  });

  logTest(
    'Outcomes tracked',
    outcomeResult.improvement !== undefined,
    'Improvement calculated'
  );

  logTest(
    'Effectiveness assessed',
    outcomeResult.effectiveness !== undefined && outcomeResult.effectiveness.success_rate !== undefined,
    `Success rate: ${(outcomeResult.effectiveness.success_rate * 100).toFixed(0)}%`
  );

  logTest(
    'Overall success determined',
    typeof outcomeResult.overall_success === 'boolean',
    `Success: ${outcomeResult.overall_success}`
  );

  // ==========================================
  // SECTION 2: REFLECTION ANALYTICS
  // ==========================================

  logSection('2: REFLECTION ANALYTICS SERVICE');

  // Test 7: Service Initialization
  logTest(
    'Reflection analytics service initialization',
    reflectionAnalyticsService !== null,
    'Service object created'
  );

  // Test 8: Maturity Levels
  console.log('\n🎓 Maturity Levels Tests:\n');

  const maturityLevels = reflectionAnalyticsService.maturityLevels;

  logTest(
    'Maturity levels defined',
    maturityLevels !== null && typeof maturityLevels === 'object',
    `Found ${Object.keys(maturityLevels).length} levels`
  );

  const expectedLevels = ['NOVICE', 'DEVELOPING', 'PROFICIENT', 'ADVANCED', 'EXPERT'];
  logTest(
    'All 5 maturity levels present',
    expectedLevels.every(l => maturityLevels[l] !== undefined),
    expectedLevels.join(', ')
  );

  logTest(
    'Maturity levels have criteria',
    Object.values(maturityLevels).every(level => level.criteria !== undefined),
    'All levels have criteria'
  );

  // Test 9: Calculate Learning Metrics
  console.log('\n📈 Learning Metrics Tests:\n');

  const learningMetrics = await reflectionAnalyticsService.calculateLearningMetrics({
    agent_id: 'test-agent-1',
    timeframe: 'month'
  });

  logTest(
    'Learning metrics calculated',
    learningMetrics !== null && typeof learningMetrics === 'object',
    'Metrics object returned'
  );

  const expectedMetrics = [
    'reflection_count',
    'learning_count',
    'avg_reflection_quality',
    'learning_implementation_rate',
    'learning_success_rate',
    'meta_cognitive_score'
  ];

  logTest(
    'Key metrics present',
    expectedMetrics.every(m => learningMetrics[m] !== undefined),
    `${expectedMetrics.length} metrics`
  );

  logTest(
    'Meta-cognitive score in range',
    learningMetrics.meta_cognitive_score >= 0 && learningMetrics.meta_cognitive_score <= 1,
    `Score: ${learningMetrics.meta_cognitive_score.toFixed(2)}`
  );

  // Test 10: Analyze Trends
  console.log('\n📉 Trend Analysis Tests:\n');

  const trendAnalysis = await reflectionAnalyticsService.analyzeTrends({
    agent_id: 'test-agent-1',
    timeframe: 'month'
  });

  logTest(
    'Trends analyzed',
    trendAnalysis !== null && trendAnalysis.trends !== undefined,
    'Trend analysis completed'
  );

  logTest(
    'Overall trend determined',
    ['IMPROVING', 'STABLE', 'DECLINING', 'MIXED'].includes(trendAnalysis.overall_trend),
    `Trend: ${trendAnalysis.overall_trend}`
  );

  logTest(
    'Forecast generated',
    trendAnalysis.forecast !== undefined,
    'Forecast available'
  );

  logTest(
    'Trend strength calculated',
    trendAnalysis.trend_strength !== undefined && trendAnalysis.trend_strength.confidence !== undefined,
    `Confidence: ${trendAnalysis.trend_strength.confidence.toFixed(2)}`
  );

  // Test 11: Assess Agent Maturity
  console.log('\n🏆 Maturity Assessment Tests:\n');

  const maturityAssessment = await reflectionAnalyticsService.assessAgentMaturity({
    agent_id: 'test-agent-1'
  });

  logTest(
    'Maturity assessed',
    maturityAssessment !== null && maturityAssessment.current_level !== undefined,
    `Level: ${maturityAssessment.current_level}`
  );

  logTest(
    'Maturity level is valid',
    expectedLevels.includes(maturityAssessment.current_level),
    `Level ${maturityAssessment.level_number}`
  );

  logTest(
    'Progress to next level calculated',
    maturityAssessment.next_level === null || maturityAssessment.progress_to_next !== null,
    maturityAssessment.next_level ? `Next: ${maturityAssessment.next_level}` : 'At max level'
  );

  // Test 12: Generate Insights
  console.log('\n💡 Insight Generation Tests:\n');

  const insightsResult = await reflectionAnalyticsService.generateInsights({
    agent_id: 'test-agent-1',
    learning_metrics: learningMetrics,
    trends: trendAnalysis,
    maturity: maturityAssessment
  });

  logTest(
    'Insights generated',
    insightsResult !== null && insightsResult.insights !== undefined,
    `${insightsResult.total_insights} insights`
  );

  logTest(
    'Insights have categories',
    insightsResult.insight_categories !== undefined,
    `${Object.keys(insightsResult.insight_categories).length} categories`
  );

  logTest(
    'Top recommendations provided',
    Array.isArray(insightsResult.top_recommendations) && insightsResult.top_recommendations.length > 0,
    `${insightsResult.top_recommendations.length} recommendations`
  );

  // Test 13: Get Dashboard
  console.log('\n🎛️ Dashboard Tests:\n');

  const dashboard = await reflectionAnalyticsService.getDashboard({
    agent_id: 'test-agent-1',
    timeframe: 'month',
    include_comparisons: true
  });

  logTest(
    'Dashboard generated',
    dashboard !== null,
    'Dashboard created'
  );

  logTest(
    'Dashboard has all sections',
    dashboard.learning_metrics !== undefined &&
    dashboard.trends !== undefined &&
    dashboard.maturity !== undefined &&
    dashboard.insights !== undefined,
    'All sections present'
  );

  logTest(
    'Dashboard summary generated',
    dashboard.summary !== undefined && dashboard.summary.headline !== undefined,
    `Headline: ${dashboard.summary.headline.substring(0, 50)}...`
  );

  // ==========================================
  // SECTION 3: IMPROVEMENT RECOMMENDATION ENGINE
  // ==========================================

  logSection('3: IMPROVEMENT RECOMMENDATION ENGINE');

  // Test 14: Service Initialization
  logTest(
    'Improvement recommendation engine initialization',
    improvementRecommendationEngine !== null,
    'Service object created'
  );

  // Test 15: Recommendation Types
  console.log('\n🎯 Recommendation Types Tests:\n');

  const recTypes = improvementRecommendationEngine.recommendationTypes;

  logTest(
    'Recommendation types defined',
    recTypes !== null && typeof recTypes === 'object',
    `Found ${Object.keys(recTypes).length} types`
  );

  const expectedRecTypes = [
    'SKILL_DEVELOPMENT',
    'PROCESS_IMPROVEMENT',
    'BEHAVIOR_CHANGE',
    'KNOWLEDGE_ACQUISITION',
    'COLLABORATION_ENHANCEMENT'
  ];

  logTest(
    'Key recommendation types present',
    expectedRecTypes.every(t => recTypes[t] !== undefined),
    `${expectedRecTypes.length} types`
  );

  // Test 16: Generate Recommendations
  console.log('\n🎁 Recommendation Generation Tests:\n');

  const mockGoals = [
    { description: 'Improve decision quality', target: 0.85, priority: 'high' },
    { description: 'Increase learning velocity', target: 0.70, priority: 'medium' }
  ];

  const recommendationsResult = await improvementRecommendationEngine.generateRecommendations({
    agent_id: 'test-agent-1',
    analytics_data: dashboard,
    performance_data: learningMetrics,
    goals: mockGoals,
    max_recommendations: 10
  });

  logTest(
    'Recommendations generated',
    recommendationsResult !== null && recommendationsResult.recommendations !== undefined,
    `Generated ${recommendationsResult.total_recommendations} recommendations`
  );

  logTest(
    'Recommendations are limited to max',
    recommendationsResult.recommendations.length <= 10,
    `Returned ${recommendationsResult.recommendations.length} recommendations`
  );

  logTest(
    'Recommendations have expected fields',
    recommendationsResult.recommendations.every(r =>
      r.title !== undefined &&
      r.type !== undefined &&
      r.expected_impact !== undefined
    ),
    'All recommendations well-formed'
  );

  // Test 17: Prioritize Recommendations
  console.log('\n⭐ Recommendation Prioritization Tests:\n');

  logTest(
    'Recommendations have priority scores',
    recommendationsResult.recommendations.every(r => r.priority_score !== undefined),
    'Priority scores assigned'
  );

  logTest(
    'Recommendations have priority tiers',
    recommendationsResult.recommendations.every(r =>
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(r.priority_tier)
    ),
    'Priority tiers assigned'
  );

  logTest(
    'Recommendations sorted by priority',
    recommendationsResult.recommendations.every((r, i, arr) =>
      i === 0 || arr[i - 1].priority_score >= r.priority_score
    ),
    'Sorted descending by score'
  );

  // Test 18: Implementation Plans
  console.log('\n📋 Implementation Plan Tests:\n');

  logTest(
    'Top recommendations have implementation plans',
    recommendationsResult.recommendations.every(r => r.implementation_plan !== undefined),
    'Plans created for all recommendations'
  );

  const samplePlan = recommendationsResult.recommendations[0].implementation_plan;

  logTest(
    'Implementation plan has phases',
    samplePlan.phases !== undefined && Array.isArray(samplePlan.phases) && samplePlan.phases.length > 0,
    `${samplePlan.phases.length} phases`
  );

  logTest(
    'Implementation plan has milestones',
    samplePlan.milestones !== undefined && Array.isArray(samplePlan.milestones),
    `${samplePlan.milestones.length} milestones`
  );

  logTest(
    'Implementation plan has success criteria',
    samplePlan.success_criteria !== undefined && samplePlan.success_criteria.primary !== undefined,
    'Success criteria defined'
  );

  logTest(
    'Implementation plan has timeline',
    samplePlan.timeline !== undefined && samplePlan.timeline.estimated_days !== undefined,
    `Est. ${samplePlan.timeline.estimated_days} days`
  );

  // Test 19: Track Progress
  console.log('\n📍 Progress Tracking Tests:\n');

  const progressResult = await improvementRecommendationEngine.trackProgress({
    plan_id: samplePlan.plan_id,
    agent_id: 'test-agent-1',
    current_phase: 'Learning',
    milestones_completed: { completed: 2, total: 4 },
    metrics_data: { learning_velocity: 0.58 },
    notes: 'Making good progress'
  });

  logTest(
    'Progress tracked',
    progressResult !== null && progressResult.progress_percent !== undefined,
    `${progressResult.progress_percent}% complete`
  );

  logTest(
    'On-track status determined',
    progressResult.on_track !== undefined,
    `Status: ${progressResult.on_track}`
  );

  logTest(
    'Next actions provided',
    Array.isArray(progressResult.next_actions),
    `${progressResult.next_actions.length} actions`
  );

  // Test 20: Validate Impact
  console.log('\n✅ Impact Validation Tests:\n');

  const impactResult = await improvementRecommendationEngine.validateImpact({
    plan_id: samplePlan.plan_id,
    recommendation_id: recommendationsResult.recommendations[0].id,
    agent_id: 'test-agent-1',
    before_metrics: { learning_velocity: 0.50, decision_quality: 0.70 },
    after_metrics: { learning_velocity: 0.63, decision_quality: 0.75 },
    implementation_duration_days: 25
  });

  logTest(
    'Impact validated',
    impactResult !== null && impactResult.improvements !== undefined,
    'Impact assessment completed'
  );

  logTest(
    'Actual vs expected compared',
    impactResult.comparison !== undefined && impactResult.comparison.achievement_rate !== undefined,
    `Achievement: ${(impactResult.comparison.achievement_rate * 100).toFixed(0)}%`
  );

  logTest(
    'Success level determined',
    ['EXCEEDED', 'ACHIEVED', 'MOSTLY_ACHIEVED', 'PARTIALLY_ACHIEVED', 'NOT_ACHIEVED'].includes(impactResult.success_level),
    `Success: ${impactResult.success_level}`
  );

  logTest(
    'Learnings extracted',
    Array.isArray(impactResult.learnings),
    `${impactResult.learnings.length} learnings`
  );

  logTest(
    'Follow-up recommendation provided',
    impactResult.recommendation !== undefined && impactResult.recommendation.type !== undefined,
    `Type: ${impactResult.recommendation.type}`
  );

  // ==========================================
  // RESULTS SUMMARY
  // ==========================================

  console.log('\n' + '='.repeat(80));
  console.log('CHECKPOINT 3 RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log();
  console.log(`Total Tests: ${testsPassed + testsFailed}`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📊 Pass Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  console.log();

  if (testsFailed > 0) {
    console.log('FAILED TESTS:');
    console.log('-'.repeat(80));
  }

  console.log('\nSUCCESS CRITERIA:');
  console.log(`  Target test count (30-35): ${testsPassed + testsFailed >= 30 && testsPassed + testsFailed <= 40 ? '✅' : '❌'} (${testsPassed + testsFailed} tests)`);
  console.log(`  Pass rate (≥90%): ${(testsPassed / (testsPassed + testsFailed)) >= 0.9 ? '✅' : '❌'} (${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%)`);
  console.log();

  if ((testsPassed / (testsPassed + testsFailed)) >= 0.9 && testsPassed + testsFailed >= 30) {
    console.log('🎉 CHECKPOINT 3 PASSED - Sprint 46 Phase 3 Complete!');
  } else {
    console.log('⚠️  CHECKPOINT 3 NEEDS ATTENTION - Review failures');
  }

  console.log();
}

// Run checkpoint
runCheckpoint3().catch(console.error);
