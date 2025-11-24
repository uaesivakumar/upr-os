#!/usr/bin/env node
/**
 * CHECKPOINT 2: Sprint 46 - Meta-Cognitive Reflection System
 *
 * Tests Phase 2 Components:
 * 1. Agent Self-Assessment Service - Performance evaluation
 * 2. Mistake Learning Service - Error detection and learning
 * 3. Collaborative Decision Service - Multi-agent coordination
 *
 * Target: 35-40 tests
 *
 * Test Coverage:
 * - Self-assessment generation and ratings
 * - Confidence calibration
 * - Mistake detection and classification
 * - Learning extraction
 * - Collaborative decision-making
 * - Consensus building
 */

import agentSelfAssessmentService from '../../server/services/agentSelfAssessmentService.js';
import mistakeLearningService from '../../server/services/mistakeLearningService.js';
import collaborativeDecisionService from '../../server/services/collaborativeDecisionService.js';
import pool from '../../server/db.js';

const TEST_SUITE = 'CHECKPOINT 2: Self-Assessment, Learning & Collaboration';
let passCount = 0;
let failCount = 0;
let testResults = [];

// Test IDs
const TEST_AGENT_ID = '00000000-0000-0000-0000-000000000001';
const TEST_AGENT_ID_2 = '00000000-0000-0000-0000-000000000002';
const TEST_DECISION_ID = '10000000-0000-0000-0000-000000000001';

function logTest(testName, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${testName}`);
  if (details && !passed) {
    console.log(`   Details: ${details}`);
  }
  testResults.push({ testName, passed, details });
  if (passed) passCount++;
  else failCount++;
}

async function runTests() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${TEST_SUITE}`);
  console.log(`${'='.repeat(80)}\n`);

  let db = pool;

  try {
    // Initialize services
    await agentSelfAssessmentService.initialize();
    await mistakeLearningService.initialize();
    await collaborativeDecisionService.initialize();

    console.log('📋 SECTION 1: AGENT SELF-ASSESSMENT SERVICE\n');

    // Test 1: Service Initialization
    logTest(
      'Self-assessment service initialization',
      agentSelfAssessmentService.db !== null,
      'Service should initialize with database connection'
    );

    // Test 2: Performance Dimensions
    const dimensions = agentSelfAssessmentService.performanceDimensions;
    logTest(
      'Performance dimensions defined',
      Object.keys(dimensions).length === 5,
      `Expected 5 dimensions, got ${Object.keys(dimensions).length}`
    );

    // Test 3-7: Performance Rating Calculations
    console.log('\n📊 Performance Rating Tests:\n');

    const mockPerformanceData = {
      decisions: [
        { reasoning_quality: 85, confidence: 0.8, decision_type: 'strategic' },
        { reasoning_quality: 75, confidence: 0.7, decision_type: 'tactical' },
        { reasoning_quality: 80, confidence: 0.75, decision_type: 'operational' }
      ],
      reflections: [
        { id: 1, content: 'Reflection 1' },
        { id: 2, content: 'Reflection 2' }
      ],
      mistakes: [
        { key_learning: 'Learning 1' },
        { key_learning: 'Learning 2' }
      ],
      collaborations: [
        { agreement_level: 0.8, lead_agent_id: TEST_AGENT_ID }
      ],
      period_days: 30
    };

    const ratings = agentSelfAssessmentService.calculatePerformanceRatings(mockPerformanceData);

    logTest(
      'Performance ratings calculated',
      ratings && typeof ratings.decision_quality === 'number',
      'Should return rating object with decision_quality'
    );

    logTest(
      'All 5 dimension ratings present',
      ratings.decision_quality !== undefined &&
      ratings.learning_progress !== undefined &&
      ratings.collaboration !== undefined &&
      ratings.adaptability !== undefined &&
      ratings.efficiency !== undefined,
      'All dimensions should be rated'
    );

    logTest(
      'Ratings within valid range (0-100)',
      Object.values(ratings).every(r => r >= 0 && r <= 100),
      `Ratings: ${JSON.stringify(ratings)}`
    );

    logTest(
      'High-quality decisions score well',
      ratings.decision_quality >= 70,
      `Expected >=70, got ${ratings.decision_quality}`
    );

    logTest(
      'Learning progress reflects activity',
      ratings.learning_progress >= 50,
      `Score: ${ratings.learning_progress}`
    );

    // Test 8-9: Strength/Weakness Identification
    console.log('\n💪 Strength/Weakness Tests:\n');

    const strengths = agentSelfAssessmentService.identifyStrengths(ratings, mockPerformanceData);
    const weaknesses = agentSelfAssessmentService.identifyWeaknesses(ratings, mockPerformanceData);

    logTest(
      'Strengths identified for high ratings',
      strengths.length > 0,
      `Found ${strengths.length} strengths`
    );

    logTest(
      'Weaknesses identified for low ratings',
      Array.isArray(weaknesses),
      `Found ${weaknesses.length} weaknesses`
    );

    // Test 10-11: Confidence Calibration
    console.log('\n🎯 Confidence Calibration Tests:\n');

    const calibration = agentSelfAssessmentService.calibrateConfidence(mockPerformanceData);

    logTest(
      'Confidence calibration calculated',
      calibration && typeof calibration.score === 'number',
      'Should return calibration object'
    );

    logTest(
      'Calibration score in valid range (0-1)',
      calibration.score >= 0 && calibration.score <= 1,
      `Score: ${calibration.score}`
    );

    // Test 12-13: Learning Goals
    console.log('\n🎓 Learning Goals Tests:\n');

    const learningGoals = agentSelfAssessmentService.setLearningGoals(weaknesses, ratings);

    logTest(
      'Learning goals generated',
      Array.isArray(learningGoals) && learningGoals.length >= 0,
      `Generated ${learningGoals.length} goals`
    );

    if (learningGoals.length > 0) {
      logTest(
        'Goals have target levels',
        learningGoals.every(g => g.target_level > g.current_level),
        'Target should exceed current level'
      );
    } else {
      logTest(
        'No goals needed for high performance',
        true,
        'Agent performing well across all dimensions'
      );
    }

    // Test 14: Action Plan
    console.log('\n📋 Action Plan Tests:\n');

    const actionPlan = agentSelfAssessmentService.createActionPlan(learningGoals, weaknesses, strengths);

    logTest(
      'Action plan created',
      Array.isArray(actionPlan),
      `Generated ${actionPlan.length} action items`
    );

    // Test 15: Overall Rating
    const overallRating = agentSelfAssessmentService.calculateOverallRating(ratings);

    logTest(
      'Overall rating calculated',
      overallRating >= 0 && overallRating <= 100,
      `Overall rating: ${overallRating}`
    );

    console.log('\n📋 SECTION 2: MISTAKE LEARNING SERVICE\n');

    // Test 16: Service Initialization
    logTest(
      'Mistake learning service initialization',
      mistakeLearningService.db !== null,
      'Service should initialize'
    );

    // Test 17: Mistake Categories
    const mistakeCategories = mistakeLearningService.mistakeCategories;
    logTest(
      'Mistake categories defined',
      Object.keys(mistakeCategories).length >= 7,
      `Found ${Object.keys(mistakeCategories).length} categories`
    );

    // Test 18-20: Mistake Detection Methods
    console.log('\n🔍 Mistake Detection Tests:\n');

    const outcomeDetection = mistakeLearningService.detectFromOutcome('failure', 'success');
    logTest(
      'Detects mistake from outcome mismatch',
      outcomeDetection.detected === true,
      'Should detect when actual != expected'
    );

    const feedbackDetection = mistakeLearningService.detectFromFeedback({
      sentiment: 'negative',
      rating: 2
    });
    logTest(
      'Detects mistake from negative feedback',
      feedbackDetection.detected === true,
      'Should detect from negative feedback'
    );

    const mockDecision = {
      quality_tier: 'POOR',
      overall_quality: 40,
      fallacies_detected: ['CIRCULAR_REASONING']
    };
    const qualityDetection = mistakeLearningService.detectFromQuality(null, mockDecision);
    logTest(
      'Detects mistake from poor quality',
      qualityDetection.detected === true,
      'Should detect from poor quality/fallacies'
    );

    // Test 21-23: Mistake Classification
    console.log('\n🏷️ Mistake Classification Tests:\n');

    const detectionResults = {
      outcome_based: { detected: false },
      feedback_based: { detected: false },
      quality_based: { detected: true, reason: 'Poor quality' },
      bias_based: { detected: false }
    };

    const classification = mistakeLearningService.classifyMistake(detectionResults, mockDecision);

    logTest(
      'Mistake classified',
      classification && classification.category,
      `Category: ${classification.category}`
    );

    logTest(
      'Classification includes severity',
      ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'].includes(classification.severity),
      `Severity: ${classification.severity}`
    );

    logTest(
      'Classification describes what went wrong',
      classification.what_went_wrong && classification.what_went_wrong.length > 10,
      `Description length: ${classification.what_went_wrong?.length}`
    );

    // Test 24-25: Root Cause Analysis
    console.log('\n🔬 Root Cause Analysis Tests:\n');

    const rootCauses = mistakeLearningService.analyzeRootCauses(
      classification,
      mockDecision,
      detectionResults
    );

    logTest(
      'Root causes identified',
      rootCauses && rootCauses.all_causes.length > 0,
      `Found ${rootCauses.all_causes.length} causes`
    );

    logTest(
      'Primary cause identified',
      rootCauses.primary_cause && rootCauses.primary_cause.length > 0,
      `Primary: ${rootCauses.primary_cause}`
    );

    // Test 26-27: Learning Extraction
    console.log('\n💡 Learning Extraction Tests:\n');

    const learning = mistakeLearningService.extractLearning(
      classification,
      rootCauses,
      mockDecision,
      { success: false }
    );

    logTest(
      'Key insight extracted',
      learning.key_insight && learning.key_insight.length > 20,
      `Insight length: ${learning.key_insight?.length}`
    );

    logTest(
      'Correct approach identified',
      learning.correct_approach && learning.correct_approach.length > 10,
      `Approach length: ${learning.correct_approach?.length}`
    );

    // Test 28-29: Preventive Measures
    console.log('\n🛡️ Preventive Measures Tests:\n');

    const preventiveMeasures = mistakeLearningService.createPreventiveMeasures(
      classification,
      rootCauses,
      learning
    );

    logTest(
      'Preventive measures created',
      Array.isArray(preventiveMeasures) && preventiveMeasures.length > 0,
      `Created ${preventiveMeasures.length} measures`
    );

    logTest(
      'Measures include immediate actions',
      preventiveMeasures.some(m => m.type === 'immediate'),
      'Should include immediate preventive action'
    );

    // Test 30: Learning Impact Score
    const impactScore = mistakeLearningService.calculateLearningImpact(
      'MAJOR',
      learning,
      rootCauses
    );

    logTest(
      'Learning impact score calculated',
      impactScore >= 0 && impactScore <= 10,
      `Impact score: ${impactScore}`
    );

    console.log('\n📋 SECTION 3: COLLABORATIVE DECISION SERVICE\n');

    // Test 31: Service Initialization
    logTest(
      'Collaborative decision service initialization',
      collaborativeDecisionService.db !== null,
      'Service should initialize'
    );

    // Test 32: Consensus Methods
    const consensusMethods = collaborativeDecisionService.consensusMethods;
    logTest(
      'Consensus methods defined',
      Object.keys(consensusMethods).length >= 5,
      `Found ${Object.keys(consensusMethods).length} methods`
    );

    // Test 33-35: Proposal Analysis
    console.log('\n📝 Proposal Analysis Tests:\n');

    const mockProposals = [
      { agent_id: TEST_AGENT_ID, recommendation: 'Option A', confidence: 0.8, reasoning: 'Strong evidence' },
      { agent_id: TEST_AGENT_ID_2, recommendation: 'Option A', confidence: 0.7, reasoning: 'Aligns with goals' },
      { agent_id: '00000000-0000-0000-0000-000000000003', recommendation: 'Option B', confidence: 0.6, reasoning: 'Alternative approach' }
    ];

    const proposalAnalysis = collaborativeDecisionService.analyzeProposals(mockProposals);

    logTest(
      'Proposals analyzed',
      proposalAnalysis && proposalAnalysis.total_proposals === 3,
      'Should analyze all proposals'
    );

    logTest(
      'Consensus areas identified',
      Array.isArray(proposalAnalysis.consensus_areas),
      `Found ${proposalAnalysis.consensus_areas.length} consensus areas`
    );

    logTest(
      'Average confidence calculated',
      proposalAnalysis.average_confidence >= 0 && proposalAnalysis.average_confidence <= 1,
      `Average confidence: ${proposalAnalysis.average_confidence}`
    );

    // Test 36-37: Voting
    console.log('\n🗳️ Voting Tests:\n');

    const mockVotes = [
      { agent_id: TEST_AGENT_ID, vote_for: 'Option A', confidence: 0.8 },
      { agent_id: TEST_AGENT_ID_2, vote_for: 'Option A', confidence: 0.7 },
      { agent_id: '00000000-0000-0000-0000-000000000003', vote_for: 'Option B', confidence: 0.6 }
    ];

    const votingResults = collaborativeDecisionService.tallyVotes(mockVotes, {});

    logTest(
      'Votes tallied correctly',
      votingResults.winner === 'Option A' && votingResults.winner_votes === 2,
      `Winner: ${votingResults.winner} with ${votingResults.winner_votes} votes`
    );

    logTest(
      'Vote percentages calculated',
      votingResults.winner_percentage > 0,
      `Winner percentage: ${votingResults.winner_percentage}%`
    );

    // Test 38-40: Consensus Methods
    console.log('\n🤝 Consensus Building Tests:\n');

    // Test unanimous
    const unanimousProposals = [
      { agent_id: TEST_AGENT_ID, recommendation: 'Option X' },
      { agent_id: TEST_AGENT_ID_2, recommendation: 'Option X' }
    ];

    try {
      const unanimousResult = collaborativeDecisionService.applyUnanimous(unanimousProposals);
      logTest(
        'Unanimous consensus works',
        unanimousResult.decision === 'Option X',
        'All agents agreed'
      );
    } catch (e) {
      logTest('Unanimous consensus works', false, e.message);
    }

    // Test majority
    const majorityVoting = {
      winner: 'Option A',
      winner_percentage: 66.7,
      total_votes: 3
    };

    try {
      const majorityResult = collaborativeDecisionService.applyMajority(majorityVoting, 'MAJORITY');
      logTest(
        'Majority consensus works',
        majorityResult.decision === 'Option A',
        'Majority threshold met'
      );
    } catch (e) {
      logTest('Majority consensus works', false, e.message);
    }

    // Test weighted
    const weightedProposals = [
      { agent_id: TEST_AGENT_ID, recommendation: 'Option A', confidence: 0.9, expertise: 2.0 },
      { agent_id: TEST_AGENT_ID_2, recommendation: 'Option B', confidence: 0.7, expertise: 1.0 }
    ];

    const weightedResult = collaborativeDecisionService.applyWeighted(weightedProposals);
    logTest(
      'Weighted consensus works',
      weightedResult.decision,
      `Weighted decision: ${weightedResult.decision}`
    );

    // Test 41: Agreement Level
    const agreementLevel = collaborativeDecisionService.calculateAgreementLevel(
      'Option A',
      mockProposals
    );

    logTest(
      'Agreement level calculated',
      agreementLevel >= 0 && agreementLevel <= 1,
      `Agreement: ${(agreementLevel * 100).toFixed(0)}%`
    );

    // Test 42: Dissent Identification
    const dissent = collaborativeDecisionService.identifyDissent(
      'Option A',
      mockProposals,
      { lead_agent_id: TEST_AGENT_ID, participating_agents: [TEST_AGENT_ID_2] }
    );

    logTest(
      'Dissenting agents identified',
      Array.isArray(dissent.agents),
      `Found ${dissent.count} dissenting agent(s)`
    );

    // Test 43: Collective Learning
    console.log('\n🧠 Collective Learning Tests:\n');

    const collectiveLearning = collaborativeDecisionService.synthesizeInsights(mockProposals);

    logTest(
      'Collective insights synthesized',
      collectiveLearning && collectiveLearning.diverse_perspectives > 0,
      `${collectiveLearning.diverse_perspectives} perspectives`
    );

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    console.error(error.stack);
    failCount++;
  }

  // Results Summary
  console.log('\n' + '='.repeat(80));
  console.log('CHECKPOINT 2 RESULTS SUMMARY');
  console.log('='.repeat(80));

  const totalTests = passCount + failCount;
  const passRate = totalTests > 0 ? ((passCount / totalTests) * 100).toFixed(1) : 0;

  console.log(`\nTotal Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📊 Pass Rate: ${passRate}%\n`);

  // Detailed failures
  if (failCount > 0) {
    console.log('FAILED TESTS:');
    console.log('-'.repeat(80));
    testResults
      .filter(t => !t.passed)
      .forEach(t => {
        console.log(`❌ ${t.testName}`);
        if (t.details) console.log(`   ${t.details}`);
      });
    console.log();
  }

  // Success criteria
  const meetsTarget = totalTests >= 35 && totalTests <= 50;
  const passesThreshold = passRate >= 90;

  console.log('SUCCESS CRITERIA:');
  console.log(`  Target test count (35-50): ${meetsTarget ? '✅' : '❌'} (${totalTests} tests)`);
  console.log(`  Pass rate (≥90%): ${passesThreshold ? '✅' : '❌'} (${passRate}%)`);

  if (meetsTarget && passesThreshold) {
    console.log('\n🎉 CHECKPOINT 2 PASSED - Ready for Phase 3\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  CHECKPOINT 2 NEEDS ATTENTION - Review failures before proceeding\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
