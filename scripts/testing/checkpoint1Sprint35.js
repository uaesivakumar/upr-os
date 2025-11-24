#!/usr/bin/env node
/**
 * Sprint 35 - Checkpoint 1: Scoring Components Test
 *
 * Tests:
 * 1. LeadScoreCalculator - core scoring logic
 * 2. FitScoringService - fit scoring across 5 dimensions
 * 3. ScoreMonitoringService - score change tracking
 * 4. ScoreDecayService - time-based decay
 * 5. Database schema validation
 * 6. Score formula accuracy
 * 7. Grade determination
 * 8. Batch operations
 */

import assert from 'assert';
import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

// Generate UUID v4
function generateUUID() {
  return crypto.randomUUID();
}

import { LeadScoreCalculator } from '../../server/services/leadScoreCalculator.js';
import { FitScoringService } from '../../server/services/fitScoringService.js';
import { ScoreMonitoringService } from '../../server/services/scoreMonitoringService.js';
import { ScoreDecayService } from '../../server/services/scoreDecayService.js';

// Use direct connection config to avoid URL parsing issues
const pool = new Pool({
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: false
});

const DATABASE_CONFIG = {
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: false
};

let testResults = [];
let testOpportunityIds = [];

function logTest(name, passed, details = '') {
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${name}`);
  if (details) console.log(`   ${details}`);
  testResults.push({ name, passed, details });
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');

  for (const id of testOpportunityIds) {
    await pool.query('DELETE FROM lead_scores WHERE opportunity_id = $1', [id]);
    await pool.query('DELETE FROM lead_score_history WHERE opportunity_id = $1', [id]);
  }

  console.log('✅ Cleanup complete\n');
}

async function testDatabaseSchema() {
  console.log('\n📊 Test Group 1: Database Schema Validation\n');

  // Test 1.1: lead_scores table exists with correct columns
  const scoresTable = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'lead_scores'
    ORDER BY column_name
  `);

  const expectedColumns = [
    'opportunity_id', 'q_score', 'engagement_score', 'fit_score',
    'lead_score', 'priority_score', 'grade', 'segment',
    'calculated_at', 'last_activity_at', 'decay_applied', 'decay_rate',
    'created_at', 'updated_at'
  ];

  const actualColumns = scoresTable.rows.map(r => r.column_name);
  const hasAllColumns = expectedColumns.every(col => actualColumns.includes(col));

  logTest('lead_scores table has all required columns',
    hasAllColumns,
    `Found ${actualColumns.length} columns`);

  // Test 1.2: lead_score_history table exists
  const historyTable = await pool.query(`
    SELECT COUNT(*) as col_count
    FROM information_schema.columns
    WHERE table_name = 'lead_score_history'
  `);

  logTest('lead_score_history table exists',
    parseInt(historyTable.rows[0].col_count) >= 10,
    `Has ${historyTable.rows[0].col_count} columns`);

  // Test 1.3: Views exist
  const views = await pool.query(`
    SELECT table_name
    FROM information_schema.views
    WHERE table_name IN ('lead_queue_view', 'score_distribution_view')
  `);

  logTest('Required views created',
    views.rows.length === 2,
    `Found ${views.rows.length}/2 views`);

  // Test 1.4: Functions exist
  const functions = await pool.query(`
    SELECT proname
    FROM pg_proc
    WHERE proname IN ('calculate_priority_score', 'apply_score_decay', 'update_lead_scores_updated_at')
  `);

  logTest('Required functions created',
    functions.rows.length === 3,
    `Found ${functions.rows.length}/3 functions`);
}

async function testLeadScoreCalculator() {
  console.log('\n📊 Test Group 2: Lead Score Calculator\n');

  const calculator = new LeadScoreCalculator(DATABASE_CONFIG);

  // Create a test opportunity
  const testOppId = generateUUID();
  testOpportunityIds.push(testOppId);

  // Insert test lifecycle data
  await pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
    VALUES ($1, 'ENGAGED', 'manual', $2)
  `, [testOppId, JSON.stringify({
    industry: 'technology',
    size: 150,
    location: 'Dubai, UAE',
    quality_score: '85'
  })]);

  // Insert test touchpoints
  await pool.query(`
    INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, outcome, occurred_at)
    VALUES
      ($1, 'email', 'positive', NOW() - INTERVAL '2 days'),
      ($1, 'call', 'positive', NOW() - INTERVAL '5 days'),
      ($1, 'email', 'positive', NOW() - INTERVAL '7 days')
  `, [testOppId]);

  // Test 2.1: Calculate lead score
  const result = await calculator.calculateLeadScore(testOppId);

  logTest('calculateLeadScore returns valid result',
    result.leadScore >= 0 && result.leadScore <= 10000,
    `Score: ${result.leadScore}`);

  logTest('Q-Score calculated correctly',
    result.qScore >= 0 && result.qScore <= 100,
    `Q-Score: ${result.qScore}`);

  logTest('Engagement score calculated correctly',
    result.engagementScore >= 0 && result.engagementScore <= 100,
    `Engagement: ${result.engagementScore}`);

  logTest('Fit score calculated correctly',
    result.fitScore >= 0 && result.fitScore <= 100,
    `Fit: ${result.fitScore}`);

  // Test 2.2: Grade determination
  logTest('Grade assigned correctly',
    ['A+', 'A', 'B+', 'B', 'C', 'D'].includes(result.grade),
    `Grade: ${result.grade}`);

  // Test 2.3: Segment determination
  logTest('Segment assigned correctly',
    result.segment && result.segment.length > 0,
    `Segment: ${result.segment}`);

  // Test 2.4: Score saved to database
  const savedScore = await calculator.getLeadScore(testOppId);
  logTest('Score saved to database',
    savedScore !== null && savedScore.lead_score === result.leadScore,
    `Database score: ${savedScore?.lead_score}`);

  // Test 2.5: Score history recorded
  const history = await pool.query(
    'SELECT COUNT(*) as count FROM lead_score_history WHERE opportunity_id = $1',
    [testOppId]
  );

  logTest('Score history recorded',
    parseInt(history.rows[0].count) >= 1,
    `History entries: ${history.rows[0].count}`);

  // Test 2.6: Formula accuracy (Lead Score = Q × Engagement × Fit / 100)
  const expectedScore = Math.round((result.qScore * result.engagementScore * result.fitScore) / 100);
  const formulaCorrect = Math.abs(result.leadScore - expectedScore) <= 1; // Allow 1 point rounding error

  logTest('Score formula accuracy',
    formulaCorrect,
    `Expected: ${expectedScore}, Got: ${result.leadScore}`);

  await calculator.close();
}

async function testFitScoringService() {
  console.log('\n📊 Test Group 3: Fit Scoring Service\n');

  const fitScoring = new FitScoringService(DATABASE_CONFIG);

  // Create test opportunities with different fit profiles
  const testOppId1 = generateUUID();
  const testOppId2 = generateUUID();
  testOpportunityIds.push(testOppId1, testOppId2);

  // Perfect fit opportunity
  await pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
    VALUES ($1, 'DISCOVERED', 'manual', $2)
  `, [testOppId1, JSON.stringify({
    industry: 'SaaS Technology',
    size: 250,
    location: 'Dubai, UAE',
    technologies: ['React', 'Node.js', 'AWS'],
    funding_raised: 5000000
  })]);

  // Poor fit opportunity
  await pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
    VALUES ($1, 'DISCOVERED', 'manual', $2)
  `, [testOppId2, JSON.stringify({
    industry: 'Agriculture',
    size: 5,
    location: 'Remote',
    technologies: []
  })]);

  // Test 3.1: Perfect fit score
  const perfectFit = await fitScoring.calculateFitScore(testOppId1);

  logTest('Perfect fit score is high',
    perfectFit.fitScore >= 70,
    `Score: ${perfectFit.fitScore}`);

  logTest('Fit score breakdown provided',
    perfectFit.breakdown &&
    typeof perfectFit.breakdown.industry === 'number' &&
    typeof perfectFit.breakdown.size === 'number',
    `Breakdown: ${JSON.stringify(perfectFit.breakdown)}`);

  // Test 3.2: Poor fit score
  const poorFit = await fitScoring.calculateFitScore(testOppId2);

  logTest('Poor fit score is low',
    poorFit.fitScore <= 50,
    `Score: ${poorFit.fitScore}`);

  // Test 3.3: Industry fit assessment
  const techScore = fitScoring.assessIndustryFit('Technology');
  logTest('Industry fit assessment works',
    techScore >= 20,
    `Tech industry score: ${techScore}`);

  // Test 3.4: Size fit assessment
  const idealSize = fitScoring.assessSizeFit(150);
  logTest('Size fit assessment works',
    idealSize >= 15,
    `150 employees score: ${idealSize}`);

  // Test 3.5: Location fit assessment
  const uaeLocation = fitScoring.assessLocationFit('Dubai, UAE');
  logTest('Location fit assessment works',
    uaeLocation >= 15,
    `UAE location score: ${uaeLocation}`);

  await fitScoring.close();
}

async function testScoreMonitoringService() {
  console.log('\n📊 Test Group 4: Score Monitoring Service\n');

  const monitoring = new ScoreMonitoringService(DATABASE_CONFIG);
  const calculator = new LeadScoreCalculator(DATABASE_CONFIG);

  const testOppId = generateUUID();
  testOpportunityIds.push(testOppId);

  // Create test opportunity without calculating score yet
  await pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
    VALUES ($1, 'QUALIFIED', 'manual', $2)
  `, [testOppId, JSON.stringify({ industry: 'technology', size: 100, location: 'Dubai' })]);

  // Test 4.1: Monitor score changes (first score - before any score exists)
  const mockFirstScore = {
    qScore: 80,
    engagementScore: 70,
    fitScore: 90,
    leadScore: 5040,
    grade: 'B+'
  };

  const firstMonitor = await monitoring.monitorScoreChanges(testOppId, mockFirstScore);

  logTest('First score detection works',
    firstMonitor.isFirstScore === true,
    'Correctly identified as first score');

  // Now calculate the actual initial score
  const initialScore = await calculator.calculateLeadScore(testOppId);

  // Simulate score change
  await new Promise(resolve => setTimeout(resolve, 100));

  const newScoreData = {
    qScore: initialScore.qScore + 10,
    engagementScore: initialScore.engagementScore + 15,
    fitScore: initialScore.fitScore,
    leadScore: Math.round((initialScore.qScore + 10) * (initialScore.engagementScore + 15) * initialScore.fitScore / 100),
    grade: 'A'
  };

  // Test 4.2: Detect score change
  const changeDetection = await monitoring.monitorScoreChanges(testOppId, newScoreData);

  logTest('Score change detection works',
    changeDetection.isFirstScore === false && changeDetection.changes !== null,
    `Detected ${changeDetection.changes?.leadScore?.change} point change`);

  // Test 4.3: Get score history
  const history = await monitoring.getScoreHistory(testOppId, { limit: 10 });

  logTest('Score history retrieval works',
    history.length >= 1,
    `Found ${history.length} history entries`);

  await monitoring.close();
  await calculator.close();
}

async function testScoreDecayService() {
  console.log('\n📊 Test Group 5: Score Decay Service\n');

  const decay = new ScoreDecayService(DATABASE_CONFIG);
  const calculator = new LeadScoreCalculator(DATABASE_CONFIG);

  const testOppId = generateUUID();
  testOpportunityIds.push(testOppId);

  // Create opportunity with old activity
  await pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
    VALUES ($1, 'OUTREACH', 'manual', $2)
  `, [testOppId, JSON.stringify({ industry: 'technology', size: 100 })]);

  // Add old touchpoint (15 days ago)
  await pool.query(`
    INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, occurred_at)
    VALUES ($1, 'email', NOW() - INTERVAL '15 days')
  `, [testOppId]);

  // Calculate initial score
  const initialScore = await calculator.calculateLeadScore(testOppId);

  // Test 5.1: Calculate decay rate
  const decayRate = decay.calculateDecayRate(15);

  logTest('Decay rate calculation works',
    decayRate > 0 && decayRate < 1,
    `15 days = ${(decayRate * 100).toFixed(1)}% decay`);

  // Test 5.2: Apply decay
  const decayResult = await decay.applyDecay(testOppId);

  logTest('Decay application works',
    decayResult.decayApplied === true,
    `Applied ${(decayResult.decayRate * 100).toFixed(1)}% decay`);

  logTest('Engagement reduced after decay',
    decayResult.decayedEngagement < decayResult.originalEngagement,
    `${decayResult.originalEngagement} → ${decayResult.decayedEngagement}`);

  logTest('Lead score reduced after decay',
    decayResult.newLeadScore < decayResult.originalLeadScore,
    `${decayResult.originalLeadScore} → ${decayResult.newLeadScore}`);

  // Test 5.3: Get decay candidates
  const candidates = await decay.getDecayCandidates({ minDaysInactive: 7, limit: 10 });

  logTest('Decay candidates retrieval works',
    Array.isArray(candidates),
    `Found ${candidates.length} candidates`);

  // Test 5.4: Decay rate boundaries
  const noDayDecay = decay.calculateDecayRate(5); // Less than 7 days
  const maxDecay = decay.calculateDecayRate(100); // Should cap at 75%

  logTest('Decay rate boundaries correct',
    noDayDecay === 0 && maxDecay === 0.75,
    `5 days: ${noDayDecay}, 100 days: ${maxDecay}`);

  await decay.close();
  await calculator.close();
}

async function testBatchOperations() {
  console.log('\n📊 Test Group 6: Batch Operations\n');

  const calculator = new LeadScoreCalculator(DATABASE_CONFIG);

  // Create multiple test opportunities
  const batchOppIds = [];
  for (let i = 0; i < 5; i++) {
    const oppId = generateUUID();
    batchOppIds.push(oppId);
    testOpportunityIds.push(oppId);

    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
      VALUES ($1, 'QUALIFIED', 'manual', $2)
    `, [oppId, JSON.stringify({ industry: 'technology', size: 100 + i * 50 })]);
  }

  // Test 6.1: Batch calculate scores
  const batchResults = await calculator.batchCalculateScores(batchOppIds, { concurrency: 2 });

  logTest('Batch score calculation works',
    batchResults.length === 5,
    `Processed ${batchResults.length}/5 opportunities`);

  const successfulResults = batchResults.filter(r => !r.error);
  logTest('All batch calculations successful',
    successfulResults.length === 5,
    `${successfulResults.length}/5 successful`);

  await calculator.close();
}

async function testGradeDetermination() {
  console.log('\n📊 Test Group 7: Grade Determination\n');

  const calculator = new LeadScoreCalculator(DATABASE_CONFIG);

  // Test all grade boundaries
  const tests = [
    { score: 9000, expectedGrade: 'A+' },
    { score: 7000, expectedGrade: 'A' },
    { score: 5000, expectedGrade: 'B+' },
    { score: 3000, expectedGrade: 'B' },
    { score: 1500, expectedGrade: 'C' },
    { score: 500, expectedGrade: 'D' }
  ];

  tests.forEach(test => {
    const grade = calculator.determineGrade(test.score);
    logTest(`Grade ${test.expectedGrade} for score ${test.score}`,
      grade === test.expectedGrade,
      `Expected: ${test.expectedGrade}, Got: ${grade}`);
  });

  await calculator.close();
}

async function testScoreDistribution() {
  console.log('\n📊 Test Group 8: Score Distribution\n');

  const calculator = new LeadScoreCalculator(DATABASE_CONFIG);

  // Test 8.1: Get score distribution
  const distribution = await calculator.getScoreDistribution();

  logTest('Score distribution retrieval works',
    Array.isArray(distribution),
    `Found ${distribution.length} grade categories`);

  if (distribution.length > 0) {
    logTest('Distribution has expected properties',
      distribution[0].grade && typeof distribution[0].count === 'number',
      `Sample: ${distribution[0].grade} - ${distribution[0].count} leads`);
  }

  await calculator.close();
}

async function runCheckpoint1() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Sprint 35 - Checkpoint 1: Scoring Components        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    await testDatabaseSchema();
    await testLeadScoreCalculator();
    await testFitScoringService();
    await testScoreMonitoringService();
    await testScoreDecayService();
    await testBatchOperations();
    await testGradeDetermination();
    await testScoreDistribution();

    await cleanup();

    console.log('\n' + '═'.repeat(60));
    console.log('CHECKPOINT 1 RESULTS');
    console.log('═'.repeat(60));

    const passed = testResults.filter(t => t.passed).length;
    const total = testResults.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(`\nTotal Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Pass Rate: ${passRate}%\n`);

    if (passed === total) {
      console.log('🎉 ALL TESTS PASSED! Scoring components validated.\n');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed. Review output above.\n');
      testResults.filter(t => !t.passed).forEach(t => {
        console.log(`   ❌ ${t.name}`);
        if (t.details) console.log(`      ${t.details}`);
      });
      console.log('');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Checkpoint 1 failed:', error.message);
    console.error(error.stack);
    await cleanup();
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (!DATABASE_CONFIG) {
  console.error('❌ DATABASE_CONFIG not set');
  console.log('Set DATABASE_CONFIG environment variable');
  process.exit(1);
}

runCheckpoint1();
