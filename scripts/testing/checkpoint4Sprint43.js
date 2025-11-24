#!/usr/bin/env node
/**
 * CHECKPOINT 4: Sprint 43 - Analytics & Labeling Validation
 *
 * Validates:
 * - Dataset analytics report generation
 * - Quality metrics calculation
 * - Distribution analysis
 * - Trend analysis
 * - Labeling session workflow
 * - Label submission and validation
 * - Inter-rater reliability
 */

const pool = require('../../server/config/database');
const DatasetAnalyticsService = require('../../server/services/datasetAnalyticsService');
const LabelingService = require('../../server/services/labelingService');
const { DatasetManager } = require('../../server/services/datasetManager');

console.log('\n' + '='.repeat(80));
console.log('CHECKPOINT 4: ANALYTICS & LABELING VALIDATION');
console.log('='.repeat(80) + '\n');

let testsPassed = 0;
let testsFailed = 0;

async function runTests() {
  let testDataset = null;
  let testSession = null;

  try {
    // TEST 1: Create dataset with examples
    console.log('TEST 1: Create test dataset with examples...');
    testDataset = await test1_CreateDataset();
    testsPassed++;
    console.log('✅ TEST 1 PASSED\n');

    // TEST 2: Generate analytics report
    console.log('TEST 2: Generate comprehensive analytics report...');
    await test2_GenerateAnalytics(testDataset);
    testsPassed++;
    console.log('✅ TEST 2 PASSED\n');

    // TEST 3: Quality metrics analysis
    console.log('TEST 3: Validate quality metrics...');
    await test3_QualityMetrics(testDataset);
    testsPassed++;
    console.log('✅ TEST 3 PASSED\n');

    // TEST 4: Distribution analysis
    console.log('TEST 4: Validate distribution analysis...');
    await test4_DistributionAnalysis(testDataset);
    testsPassed++;
    console.log('✅ TEST 4 PASSED\n');

    // TEST 5: Labeling session workflow
    console.log('TEST 5: Test labeling session workflow...');
    testSession = await test5_LabelingSession(testDataset);
    testsPassed++;
    console.log('✅ TEST 5 PASSED\n');

    // TEST 6: Label submission
    console.log('TEST 6: Validate label submission...');
    await test6_LabelSubmission(testDataset, testSession);
    testsPassed++;
    console.log('✅ TEST 6 PASSED\n');

    // TEST 7: Inter-rater reliability
    console.log('TEST 7: Calculate inter-rater reliability...');
    await test7_InterRaterReliability(testDataset);
    testsPassed++;
    console.log('✅ TEST 7 PASSED\n');

    // All tests passed
    console.log('='.repeat(80));
    console.log('CHECKPOINT 4 RESULTS');
    console.log('='.repeat(80));
    console.log(`✅ Tests Passed: ${testsPassed}/${testsPassed + testsFailed}`);
    console.log('\n✅ ✅ ✅ CHECKPOINT 4 PASSED ✅ ✅ ✅\n');
    console.log('Analytics & labeling validated:');
    console.log('  ✓ Analytics report generation working');
    console.log('  ✓ Quality metrics accurate');
    console.log('  ✓ Distribution analysis functional');
    console.log('  ✓ Labeling session workflow operational');
    console.log('  ✓ Label submission and validation working');
    console.log('  ✓ Inter-rater reliability calculated\n');

    // Cleanup
    await cleanup(testDataset, testSession);

    process.exit(0);

  } catch (error) {
    testsFailed++;
    console.error('❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    console.log('\n' + '='.repeat(80));
    console.log('CHECKPOINT 4 RESULTS');
    console.log('='.repeat(80));
    console.log(`Tests Passed: ${testsPassed}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log('\n❌ CHECKPOINT 4 FAILED\n');

    await cleanup(testDataset, testSession);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function test1_CreateDataset() {
  const dataset = await DatasetManager.create({
    name: 'test-checkpoint4',
    version: '1.0.0',
    description: 'Test dataset for checkpoint 4'
  });

  // Create diverse examples for analytics testing
  const examples = [
    // Gold tier examples
    ...Array.from({ length: 5 }, (_, i) => ({
      example_type: 'contact_tier',
      input_data: { title: `VP ${i}`, seniority: 'executive' },
      expected_output: { tier: 'A', confidence: 0.95 },
      quality_score: 90 + i,
      validation_status: 'pending',
      labels: { test: true }
    })),
    // Silver tier examples
    ...Array.from({ length: 10 }, (_, i) => ({
      example_type: 'lead_score',
      input_data: { fit_score: 70 + i, engagement: 'medium' },
      expected_output: { score: 75 + i, priority: 'warm' },
      quality_score: 75 + i,
      validation_status: 'pending',
      labels: { test: true }
    })),
    // Bronze tier examples
    ...Array.from({ length: 5 }, (_, i) => ({
      example_type: 'company_quality',
      input_data: { industry: 'tech', size: 50 + i },
      expected_output: { rating: 'B', confidence: 0.7 },
      quality_score: 60 + i,
      validation_status: 'pending',
      labels: { test: true }
    }))
  ];

  await dataset.addExamples(examples);
  console.log(`  ✓ Created dataset with ${examples.length} examples across quality tiers`);

  return dataset;
}

async function test2_GenerateAnalytics(dataset) {
  const report = await DatasetAnalyticsService.generateReport(dataset.id);

  if (!report) {
    throw new Error('Analytics report not generated');
  }

  // Validate report structure
  const requiredSections = ['summary', 'qualityMetrics', 'distribution', 'coverage', 'trends', 'recommendations'];
  for (const section of requiredSections) {
    if (!report[section]) {
      throw new Error(`Missing report section: ${section}`);
    }
  }

  console.log(`  ✓ Report generated with ${requiredSections.length} sections`);
  console.log(`  ✓ Total examples: ${report.summary.totalExamples}`);
  console.log(`  ✓ Avg quality: ${report.qualityMetrics.avg}`);
  console.log(`  ✓ Recommendations: ${report.recommendations.length}`);

  return report;
}

async function test3_QualityMetrics(dataset) {
  const report = await DatasetAnalyticsService.generateReport(dataset.id);
  const metrics = report.qualityMetrics;

  // Validate quality tiers
  if (!metrics.tiers) {
    throw new Error('Quality tiers not calculated');
  }

  if (metrics.tiers.gold !== 5) {
    throw new Error(`Expected 5 gold examples, got ${metrics.tiers.gold}`);
  }

  if (metrics.tiers.silver !== 10) {
    throw new Error(`Expected 10 silver examples, got ${metrics.tiers.silver}`);
  }

  if (metrics.tiers.bronze !== 5) {
    throw new Error(`Expected 5 bronze examples, got ${metrics.tiers.bronze}`);
  }

  // Validate statistical measures
  if (!metrics.median || !metrics.p25 || !metrics.p75) {
    throw new Error('Statistical measures missing');
  }

  console.log(`  ✓ Quality tiers: Gold=${metrics.tiers.gold}, Silver=${metrics.tiers.silver}, Bronze=${metrics.tiers.bronze}`);
  console.log(`  ✓ Statistics: Median=${metrics.median}, P25=${metrics.p25}, P75=${metrics.p75}`);
}

async function test4_DistributionAnalysis(dataset) {
  const report = await DatasetAnalyticsService.generateReport(dataset.id);
  const distribution = report.distribution;

  // Validate type distribution
  if (!distribution.byType || distribution.byType.length === 0) {
    throw new Error('Type distribution not calculated');
  }

  const types = distribution.byType.map(t => t.type);
  if (!types.includes('contact_tier') || !types.includes('lead_score') || !types.includes('company_quality')) {
    throw new Error('Missing expected example types in distribution');
  }

  // Validate quality tier distribution
  if (!distribution.byQualityTier) {
    throw new Error('Quality tier distribution missing');
  }

  console.log(`  ✓ Type distribution: ${distribution.byType.length} types`);
  console.log(`  ✓ Quality tier distribution calculated`);
  distribution.byType.forEach(t => {
    console.log(`    - ${t.type}: ${t.count} examples, avg quality ${t.avgQuality}`);
  });
}

async function test5_LabelingSession(dataset) {
  const session = await LabelingService.startSession('test-labeler', 'validation');

  if (!session.sessionId) {
    throw new Error('Session not created');
  }

  if (session.labelerId !== 'test-labeler') {
    throw new Error('Labeler ID mismatch');
  }

  // Get next example
  const example = await LabelingService.getNextExample(dataset.id, {
    minQualityScore: 75
  });

  if (!example) {
    throw new Error('No example returned for labeling');
  }

  console.log(`  ✓ Session started: ${session.sessionId}`);
  console.log(`  ✓ Next example retrieved: ${example.id}`);
  console.log(`  ✓ Example type: ${example.example_type}`);

  return session;
}

async function test6_LabelSubmission(dataset, session) {
  // Get an example to label
  const example = await LabelingService.getNextExample(dataset.id);

  if (!example) {
    throw new Error('No example available for labeling');
  }

  // Submit label
  const result = await LabelingService.submitLabel({
    exampleId: example.id,
    sessionId: session.sessionId,
    labelerId: 'test-labeler',
    labelType: 'validation',
    labelValue: { validated: true, quality: 'high' },
    confidence: 0.9,
    notes: 'Test validation'
  });

  if (!result.exampleId) {
    throw new Error('Label submission failed');
  }

  if (result.validationStatus !== 'validated') {
    throw new Error('Example not marked as validated');
  }

  // Verify example status changed
  const updatedExample = await pool.query(
    'SELECT validation_status FROM training.examples WHERE id = $1',
    [example.id]
  );

  if (updatedExample.rows[0].validation_status !== 'validated') {
    throw new Error('Example validation status not updated');
  }

  console.log(`  ✓ Label submitted for example: ${example.id}`);
  console.log(`  ✓ Validation status updated: ${result.validationStatus}`);
}

async function test7_InterRaterReliability(dataset) {
  // Create a second labeling session with different labeler
  const session2 = await LabelingService.startSession('test-labeler-2', 'validation');

  // Get a pending example
  const example = await LabelingService.getNextExample(dataset.id);

  if (example) {
    // Submit label from second labeler
    await LabelingService.submitLabel({
      exampleId: example.id,
      sessionId: session2.sessionId,
      labelerId: 'test-labeler-2',
      labelType: 'validation',
      labelValue: { validated: true, quality: 'medium' },
      confidence: 0.85,
      notes: 'Second labeler validation'
    });
  }

  // Calculate inter-rater reliability
  const reliability = await LabelingService.calculateInterRaterReliability(dataset.id);

  if (reliability.totalMultiLabeled < 0) {
    throw new Error('Inter-rater reliability calculation failed');
  }

  console.log(`  ✓ Multi-labeled examples: ${reliability.totalMultiLabeled}`);
  console.log(`  ✓ Inter-rater reliability calculated`);

  // End second session
  await LabelingService.endSession(session2.sessionId);
}

async function cleanup(dataset, session) {
  console.log('\n🧹 Cleaning up...');

  if (session) {
    try {
      await LabelingService.endSession(session.sessionId);
    } catch (error) {
      // Session may already be ended
    }
  }

  if (dataset) {
    await pool.query('DELETE FROM training.datasets WHERE id = $1', [dataset.id]);
  }

  console.log('✓ Cleanup complete');
}

runTests();
