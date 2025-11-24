#!/usr/bin/env node
/**
 * Sprint 35 - Comprehensive Smoke Test
 * Phase 12: Lead Scoring Engine
 *
 * End-to-end validation of:
 * - Lead Score Calculation (Q-Score × Engagement × Fit)
 * - Fit Scoring (5 dimensions)
 * - Score Monitoring & History
 * - Score Decay Logic
 * - Priority Ranking
 * - Most Actionable Lead Selection
 * - Batch Operations
 */

import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

function generateUUID() {
  return crypto.randomUUID();
}

import { LeadScoreCalculator } from '../../server/services/leadScoreCalculator.js';
import { FitScoringService } from '../../server/services/fitScoringService.js';
import { ScoreMonitoringService } from '../../server/services/scoreMonitoringService.js';
import { ScoreDecayService } from '../../server/services/scoreDecayService.js';
import { PriorityRankingService } from '../../server/services/priorityRankingService.js';

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

let passed = 0;
let failed = 0;
const results = [];
const testOpportunityIds = [];

function log(message) {
  console.log(`[${new Date().toISOString().substring(11, 19)}] ${message}`);
}

function logTest(name, success, details = '') {
  const status = success ? '✅ PASS' : '❌ FAIL';
  const message = `${status}: ${name}${details ? ' - ' + details : ''}`;
  log(message);
  results.push({ name, success, details });

  if (success) {
    passed++;
  } else {
    failed++;
  }
}

async function cleanup() {
  log('🧹 Cleaning up test data...');

  for (const id of testOpportunityIds) {
    await pool.query('DELETE FROM lead_scores WHERE opportunity_id = $1', [id]);
    await pool.query('DELETE FROM lead_score_history WHERE opportunity_id = $1', [id]);
    await pool.query('DELETE FROM opportunity_touchpoints WHERE opportunity_id = $1', [id]);
    await pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [id]);
  }

  log('✅ Cleanup complete');
}

async function smokeTest() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Sprint 35 Smoke Test: Lead Scoring Engine            ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize services
    const calculator = new LeadScoreCalculator(DATABASE_CONFIG);
    const fitScoring = new FitScoringService(DATABASE_CONFIG);
    const monitoring = new ScoreMonitoringService(DATABASE_CONFIG);
    const decay = new ScoreDecayService(DATABASE_CONFIG);
    const priority = new PriorityRankingService(DATABASE_CONFIG);

    // ================================================================
    // SCENARIO 1: High-Quality Tech Lead in Dubai
    // ================================================================
    log('\n📋 SCENARIO 1: High-Quality Tech Lead in Dubai');
    log('=' .repeat(60));

    const scenario1Id = generateUUID();
    testOpportunityIds.push(scenario1Id);

    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
      VALUES ($1, 'ENGAGED', 'manual', $2)
    `, [scenario1Id, JSON.stringify({
      industry: 'Technology',
      size: 250,
      location: 'Dubai, UAE',
      technologies: ['React', 'Node.js', 'AWS', 'Docker'],
      funding_raised: 10000000,
      quality_score: '90'
    })]);

    // Add recent touchpoints
    for (let i = 0; i < 5; i++) {
      await pool.query(`
        INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, outcome, occurred_at)
        VALUES ($1, 'email', 'positive', NOW() - INTERVAL '${i * 2} days')
      `, [scenario1Id]);
    }

    // Test 1: Calculate fit score
    const fit1 = await fitScoring.calculateFitScore(scenario1Id);
    logTest('Scenario 1 - Fit Score',
      fit1.fitScore >= 80,
      `Score: ${fit1.fitScore}/100 (Industry: ${fit1.breakdown.industry}, Size: ${fit1.breakdown.size}, Location: ${fit1.breakdown.location})`);

    // Test 2: Calculate lead score
    const score1 = await calculator.calculateLeadScore(scenario1Id);
    logTest('Scenario 1 - Lead Score',
      score1.leadScore >= 6000,
      `Score: ${score1.leadScore} (Q: ${score1.qScore}, E: ${score1.engagementScore}, F: ${score1.fitScore}) Grade: ${score1.grade}`);

    // Test 3: Calculate priority
    const priority1 = await priority.calculatePriorityScore(scenario1Id);
    logTest('Scenario 1 - Priority Score',
      priority1.priorityScore > 3000,
      `Priority: ${priority1.priorityScore} (Stage boost: ${priority1.breakdown.stageBoost})`);

    // ================================================================
    // SCENARIO 2: Poor Fit Lead (Low Industry Fit)
    // ================================================================
    log('\n📋 SCENARIO 2: Poor Fit Lead (Agriculture, Small, Remote)');
    log('=' .repeat(60));

    const scenario2Id = generateUUID();
    testOpportunityIds.push(scenario2Id);

    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
      VALUES ($1, 'QUALIFIED', 'manual', $2)
    `, [scenario2Id, JSON.stringify({
      industry: 'Agriculture',
      size: 8,
      location: 'Remote',
      quality_score: '45'
    })]);

    // Test 4: Poor fit score
    const fit2 = await fitScoring.calculateFitScore(scenario2Id);
    logTest('Scenario 2 - Poor Fit Detected',
      fit2.fitScore <= 30,
      `Score: ${fit2.fitScore}/100`);

    // Test 5: Low lead score
    const score2 = await calculator.calculateLeadScore(scenario2Id);
    logTest('Scenario 2 - Low Lead Score',
      score2.leadScore < 3000 && score2.grade !== 'A+' && score2.grade !== 'A',
      `Score: ${score2.leadScore}, Grade: ${score2.grade}`);

    // ================================================================
    // SCENARIO 3: Score Decay (Inactive Lead)
    // ================================================================
    log('\n📋 SCENARIO 3: Score Decay for Inactive Lead');
    log('=' .repeat(60));

    const scenario3Id = generateUUID();
    testOpportunityIds.push(scenario3Id);

    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
      VALUES ($1, 'OUTREACH', 'manual', $2)
    `, [scenario3Id, JSON.stringify({
      industry: 'Technology',
      size: 100,
      location: 'Abu Dhabi',
      quality_score: '75'
    })]);

    // Add old touchpoint (30 days ago)
    await pool.query(`
      INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, occurred_at)
      VALUES ($1, 'email', NOW() - INTERVAL '30 days')
    `, [scenario3Id]);

    const score3Initial = await calculator.calculateLeadScore(scenario3Id);

    // Test 6: Apply decay
    const decayResult = await decay.applyDecay(scenario3Id);
    logTest('Scenario 3 - Decay Applied',
      decayResult.decayApplied && decayResult.decayRate > 0,
      `Decay rate: ${(decayResult.decayRate * 100).toFixed(1)}%, Engagement: ${decayResult.originalEngagement} → ${decayResult.decayedEngagement}`);

    // Test 7: Score reduced
    logTest('Scenario 3 - Score Reduced After Decay',
      decayResult.newLeadScore < decayResult.originalLeadScore,
      `Score: ${decayResult.originalLeadScore} → ${decayResult.newLeadScore}`);

    // ================================================================
    // SCENARIO 4: Score Monitoring & History
    // ================================================================
    log('\n📋 SCENARIO 4: Score Monitoring & Change Detection');
    log('=' .repeat(60));

    const scenario4Id = generateUUID();
    testOpportunityIds.push(scenario4Id);

    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
      VALUES ($1, 'ENGAGED', 'manual', $2)
    `, [scenario4Id, JSON.stringify({
      industry: 'Technology',
      size: 150
    })]);

    // Initial score
    const score4Initial = await calculator.calculateLeadScore(scenario4Id);

    // Add more touchpoints to improve engagement
    for (let i = 0; i < 5; i++) {
      await pool.query(`
        INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, outcome, occurred_at)
        VALUES ($1, 'call', 'positive', NOW() - INTERVAL '${i} hours')
      `, [scenario4Id]);
    }

    // Recalculate
    await new Promise(resolve => setTimeout(resolve, 100));
    const score4New = await calculator.calculateLeadScore(scenario4Id);

    // Test 8: Score change detected
    const scoreIncreased = score4New.leadScore > score4Initial.leadScore;
    logTest('Scenario 4 - Score Increase Detected',
      scoreIncreased,
      `Score: ${score4Initial.leadScore} → ${score4New.leadScore}`);

    // Test 9: History recorded
    const history = await monitoring.getScoreHistory(scenario4Id);
    logTest('Scenario 4 - Score History Tracked',
      history.length >= 2,
      `${history.length} history entries`);

    // ================================================================
    // SCENARIO 5: Priority Ranking & Most Actionable
    // ================================================================
    log('\n📋 SCENARIO 5: Priority Ranking & Most Actionable Leads');
    log('=' .repeat(60));

    // Create multiple leads with different characteristics
    const batchIds = [];
    const states = ['NEGOTIATING', 'ENGAGED', 'OUTREACH'];
    const qualities = [90, 75, 60];

    for (let i = 0; i < 3; i++) {
      const oppId = generateUUID();
      batchIds.push(oppId);
      testOpportunityIds.push(oppId);

      await pool.query(`
        INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
        VALUES ($1, $2, 'manual', $3)
      `, [oppId, states[i], JSON.stringify({
        industry: 'Technology',
        size: 100 + (i * 50),
        location: 'Dubai',
        quality_score: qualities[i].toString()
      })]);

      // Add touchpoints (more for higher priority)
      for (let j = 0; j < (3 - i) * 2; j++) {
        await pool.query(`
          INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, outcome, occurred_at)
          VALUES ($1, 'email', 'positive', NOW() - INTERVAL '${j} days')
        `, [oppId]);
      }
    }

    // Test 10: Batch calculate scores
    const batchScores = await calculator.batchCalculateScores(batchIds);
    logTest('Scenario 5 - Batch Scoring',
      batchScores.every(r => !r.error),
      `${batchScores.filter(r => !r.error).length}/3 successful`);

    // Test 11: Batch calculate priorities
    const batchPriorities = await priority.batchCalculatePriority(batchIds);
    logTest('Scenario 5 - Batch Priority Calculation',
      batchPriorities.every(r => !r.error),
      `${batchPriorities.filter(r => !r.error).length}/3 successful`);

    // Test 12: Most actionable leads
    const mostActionable = await priority.getMostActionable(10);
    logTest('Scenario 5 - Most Actionable Leads Retrieved',
      mostActionable.length >= 3,
      `Found ${mostActionable.length} leads`);

    // Test 13: NEGOTIATING should be highest priority
    const negotiatingLead = mostActionable.find(l => batchIds.includes(l.opportunityId) && l.currentState === 'NEGOTIATING');
    logTest('Scenario 5 - NEGOTIATING Lead Prioritized',
      negotiatingLead && negotiatingLead.rank <= 3,
      `Rank: ${negotiatingLead?.rank}, Priority: ${negotiatingLead?.priorityScore}`);

    // Test 14: Actionable reasons provided
    logTest('Scenario 5 - Actionable Reasons Provided',
      mostActionable.every(l => l.mostActionableReason && l.recommendedActions),
      `Sample: "${mostActionable[0]?.mostActionableReason?.substring(0, 40)}..."`);

    // ================================================================
    // SCENARIO 6: Score Distribution
    // ================================================================
    log('\n📋 SCENARIO 6: Score Distribution Analysis');
    log('=' .repeat(60));

    const distribution = await calculator.getScoreDistribution();

    // Test 15: Distribution retrieved
    logTest('Scenario 6 - Score Distribution Retrieved',
      Array.isArray(distribution) && distribution.length > 0,
      `${distribution.length} grade categories`);

    // Test 16: Distribution has grade breakdown
    const hasGradeBreakdown = distribution.every(d =>
      d.grade && typeof d.count === 'number' && typeof d.avgScore === 'number'
    );
    logTest('Scenario 6 - Grade Breakdown Complete',
      hasGradeBreakdown,
      `Grades: ${distribution.map(d => `${d.grade}(${d.count})`).join(', ')}`);

    // ================================================================
    // SCENARIO 7: Database Views & Functions
    // ================================================================
    log('\n📋 SCENARIO 7: Database Views & Functions');
    log('=' .repeat(60));

    // Test 17: Lead queue view
    const queueView = await pool.query('SELECT * FROM lead_queue_view LIMIT 5');
    logTest('Scenario 7 - Lead Queue View Works',
      queueView.rows.length > 0,
      `Retrieved ${queueView.rows.length} leads from view`);

    // Test 18: Score distribution view
    const distView = await pool.query('SELECT * FROM score_distribution_view');
    logTest('Scenario 7 - Score Distribution View Works',
      distView.rows.length > 0,
      `${distView.rows.length} grade categories in view`);

    // Test 19: Calculate priority score function
    const funcResult = await pool.query('SELECT calculate_priority_score($1) as priority', [scenario1Id]);
    logTest('Scenario 7 - Priority Score Function Works',
      funcResult.rows[0].priority !== null,
      `Priority: ${funcResult.rows[0].priority}`);

    // ================================================================
    // CLEANUP
    // ================================================================
    await cleanup();

    // Close services
    await calculator.close();
    await fitScoring.close();
    await monitoring.close();
    await decay.close();
    await priority.close();

    // ================================================================
    // FINAL RESULTS
    // ================================================================
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  SMOKE TEST RESULTS                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log(`Total Tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Pass Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

    if (failed === 0) {
      console.log('🎉 ALL SMOKE TESTS PASSED! Sprint 35 is production-ready.\n');
      console.log('✅ Lead Scoring Engine validated:');
      console.log('   - Score calculation (Q-Score × Engagement × Fit)');
      console.log('   - Fit scoring (5 dimensions)');
      console.log('   - Score monitoring & history');
      console.log('   - Score decay logic');
      console.log('   - Priority ranking');
      console.log('   - Most actionable logic');
      console.log('   - Batch operations');
      console.log('   - Database views & functions\n');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed:\n');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   ❌ ${r.name}`);
        if (r.details) console.log(`      ${r.details}`);
      });
      console.log('');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Smoke test failed with error:', error.message);
    console.error(error.stack);
    await cleanup();
    process.exit(1);
  } finally {
    await pool.end();
  }
}

smokeTest();
