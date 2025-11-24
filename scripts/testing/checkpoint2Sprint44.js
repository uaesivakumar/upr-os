#!/usr/bin/env node
/**
 * Sprint 44 - Checkpoint 2: A/B Testing and Optimization
 *
 * Tests:
 * 1. Create A/B test
 * 2. Start/pause/complete tests
 * 3. Assign variants
 * 4. Record scores and conversions
 * 5. Statistical significance calculation
 * 6. Winner determination
 * 7. Test analytics
 */

import pg from 'pg';
const { Pool } = pg;
import { ABTestingService } from '../../server/services/abTestingService.js';
import { ScoreOptimizationService } from '../../server/services/scoreOptimizationService.js';

let pool;
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function logTest(name, passed, details = '') {
  testsRun++;
  if (passed) {
    testsPassed++;
    console.log(`✅ ${name}`);
    if (details) console.log(`   ${details}`);
  } else {
    testsFailed++;
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
  }
}

async function runCheckpoint2() {
  console.log('🚀 Sprint 44 - Checkpoint 2: A/B Testing and Optimization\n');
  console.log('='.repeat(80));

  // Initialize pool
  pool = new Pool({
    host: '34.121.0.240',
    port: 5432,
    user: 'upr_app',
    password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
    database: 'upr_production',
    ssl: false
  });

  const dbConfig = {
    host: '34.121.0.240',
    port: 5432,
    user: 'upr_app',
    password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
    database: 'upr_production',
    ssl: false
  };

  try {
    //Test 1: Create A/B test
    console.log('\n🧪 TEST 1: Create A/B Test');
    console.log('-'.repeat(80));

    const abService = new ABTestingService(dbConfig);

    const test = await abService.createTest({
      testName: 'Checkpoint 2 Test - Grade Thresholds',
      testType: 'GRADE_THRESHOLDS',
      description: 'Test different grade threshold configurations',
      configA: {
        'A+': 8000,
        'A': 6000,
        'B+': 4000,
        'B': 2000,
        'C': 1000,
        'D': 0
      },
      configB: {
        'A+': 8500,
        'A': 6500,
        'B+': 4500,
        'B': 2500,
        'C': 1500,
        'D': 0
      },
      targetSampleSize: 100,
      createdBy: 'checkpoint2_test'
    });

    logTest(
      'Create A/B test',
      test && test.id,
      test ? `Test ID: ${test.id.substring(0, 8)}..., Status: ${test.status}` : 'Failed'
    );

    const testId = test.id;

    // Test 2: Start test
    console.log('\n▶️  TEST 2: Start Test');
    console.log('-'.repeat(80));

    const startedTest = await abService.startTest(testId);
    logTest(
      'Start A/B test',
      startedTest && startedTest.status === 'RUNNING',
      startedTest ? `Status: ${startedTest.status}` : 'Failed'
    );

    // Test 3: Assign variants
    console.log('\n🎲 TEST 3: Variant Assignment');
    console.log('-'.repeat(80));

    // Get test opportunities
    const oppResult = await pool.query(`
      SELECT opportunity_id
      FROM lead_scores
      LIMIT 10
    `);

    if (oppResult.rows.length > 0) {
      const assignments = [];

      for (const row of oppResult.rows) {
        const assignment = await abService.assignToVariant(testId, row.opportunity_id);
        assignments.push(assignment);
      }

      const variantACount = assignments.filter(a => a.variant === 'A').length;
      const variantBCount = assignments.filter(a => a.variant === 'B').length;

      logTest(
        'Assign opportunities to variants',
        assignments.length === oppResult.rows.length,
        `A: ${variantACount}, B: ${variantBCount}`
      );

      // Test reassignment (should return same variant)
      const firstOpp = oppResult.rows[0].opportunity_id;
      const reassignment = await abService.assignToVariant(testId, firstOpp);

      logTest(
        'Prevent duplicate assignment',
        reassignment.alreadyAssigned === true,
        `Already assigned: ${reassignment.alreadyAssigned}`
      );

      // Test 4: Record scores
      console.log('\n📊 TEST 4: Record Scores');
      console.log('-'.repeat(80));

      const scoresRecorded = Math.min(3, oppResult.rows.length);
      for (let i = 0; i < scoresRecorded; i++) {
        const oppId = oppResult.rows[i].opportunity_id;
        const score = 5000 + Math.floor(Math.random() * 3000);

        await abService.recordScore(testId, oppId, score);
      }

      logTest('Record test scores', true, `Recorded ${scoresRecorded} scores`);

      // Test 5: Record conversions
      console.log('\n🎯 TEST 5: Record Conversions');
      console.log('-'.repeat(80));

      // Convert some opportunities
      const conversionsRecorded = Math.min(5, oppResult.rows.length);
      for (let i = 0; i < conversionsRecorded; i++) {
        const oppId = oppResult.rows[i].opportunity_id;
        const converted = Math.random() > 0.5;

        await abService.recordConversion(testId, oppId, converted);
      }

      logTest('Record conversions', true, `Recorded ${conversionsRecorded} conversions`);

    } else {
      logTest('Variant assignment test', false, 'No test opportunities found');
    }

    // Test 6: Get test results
    console.log('\n📈 TEST 6: Test Results');
    console.log('-'.repeat(80));

    const results = await abService.getTestResults(testId);

    logTest(
      'Calculate test results',
      results && results.variantA && results.variantB,
      `A: ${results.variantA.total} (${(results.variantA.conversionRate * 100).toFixed(1)}%), ` +
      `B: ${results.variantB.total} (${(results.variantB.conversionRate * 100).toFixed(1)}%)`
    );

    logTest(
      'Statistical significance calculation',
      typeof results.statistically_significant === 'boolean',
      `Significant: ${results.statistically_significant}, Confidence: ${(results.confidence_level * 100).toFixed(1)}%`
    );

    // Test 7: Get test analytics
    console.log('\n📊 TEST 7: Test Analytics');
    console.log('-'.repeat(80));

    const analytics = await abService.getTestAnalytics(testId);

    logTest(
      'Get test analytics',
      analytics && analytics.test && analytics.results,
      `Progress: ${analytics.status.progress}%, Days running: ${analytics.status.days_running}`
    );

    // Test 8: List tests
    console.log('\n📋 TEST 8: List Tests');
    console.log('-'.repeat(80));

    const allTests = await abService.listTests();
    logTest(
      'List all tests',
      Array.isArray(allTests) && allTests.length > 0,
      `Found ${allTests.length} tests`
    );

    const runningTests = await abService.getActiveTests();
    logTest(
      'Get active tests',
      Array.isArray(runningTests),
      `Found ${runningTests.length} running tests`
    );

    // Test 9: Pause test
    console.log('\n⏸️  TEST 9: Pause Test');
    console.log('-'.repeat(80));

    const pausedTest = await abService.pauseTest(testId);
    logTest(
      'Pause test',
      pausedTest && pausedTest.status === 'PAUSED',
      pausedTest ? `Status: ${pausedTest.status}` : 'Failed'
    );

    // Restart for completion
    await abService.pool.query(`UPDATE ab_tests SET status = 'RUNNING' WHERE id = $1`, [testId]);

    // Test 10: Complete test
    console.log('\n🏁 TEST 10: Complete Test');
    console.log('-'.repeat(80));

    const completedTest = await abService.completeTest(testId);
    logTest(
      'Complete test',
      completedTest && completedTest.status === 'COMPLETED',
      completedTest ?
        `Status: ${completedTest.status}, Winner: ${completedTest.winner || 'None'}` :
        'Failed'
    );

    // Test 11: Score optimization service
    console.log('\n🎯 TEST 11: Score Optimization');
    console.log('-'.repeat(80));

    const optService = new ScoreOptimizationService(dbConfig);

    const suggestions = await optService.getOptimizationSuggestions();
    logTest(
      'Get optimization suggestions',
      Array.isArray(suggestions) && suggestions.length > 0,
      `Found ${suggestions.length} suggestions`
    );

    const gradePerf = await optService.analyzeGradePerformance();
    logTest(
      'Analyze grade performance',
      gradePerf && typeof gradePerf === 'object',
      `Analyzed ${Object.keys(gradePerf).length} grades`
    );

    await optService.close();

    // Cleanup
    console.log('\n🧹 TEST 12: Cleanup');
    console.log('-'.repeat(80));

    const deleteResult = await abService.deleteTest(testId);
    logTest(
      'Delete test',
      deleteResult.deleted,
      `Test removed: ${deleteResult.deleted}`
    );

    await abService.close();

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 CHECKPOINT 2 SUMMARY\n');
    console.log(`Tests Run:    ${testsRun}`);
    console.log(`Tests Passed: ${testsPassed} ✅`);
    console.log(`Tests Failed: ${testsFailed} ❌`);
    console.log(`Success Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);

    if (testsFailed === 0) {
      console.log('\n🎉 CHECKPOINT 2 PASSED - A/B Testing and Optimization Ready!');
    } else {
      console.log('\n⚠️  CHECKPOINT 2 INCOMPLETE - Some tests failed');
    }

    console.log('='.repeat(80));

    process.exit(testsFailed === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Checkpoint 2 Error:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run checkpoint
runCheckpoint2();
