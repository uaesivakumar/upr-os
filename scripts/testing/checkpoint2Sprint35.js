#!/usr/bin/env node
/**
 * Sprint 35 - Checkpoint 2: API & Integration Test
 *
 * Tests:
 * 1. Priority Ranking Service
 * 2. Most Actionable Logic
 * 3. Lead Queue Generation
 * 4. Integration between all services
 * 5. End-to-end scoring workflow
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
import { PriorityRankingService } from '../../server/services/priorityRankingService.js';
import { ScoreDecayService } from '../../server/services/scoreDecayService.js';

// Use direct connection config
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
    await pool.query('DELETE FROM opportunity_touchpoints WHERE opportunity_id = $1', [id]);
    await pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [id]);
  }

  console.log('✅ Cleanup complete\n');
}

async function testPriorityRankingService() {
  console.log('\n📊 Test Group 1: Priority Ranking Service\n');

  const calculator = new LeadScoreCalculator(DATABASE_CONFIG);
  const priorityService = new PriorityRankingService(DATABASE_CONFIG);

  // Create test opportunities with different profiles
  const opportunities = [
    {
      id: generateUUID(),
      state: 'NEGOTIATING',
      metadata: { industry: 'technology', size: 200, location: 'Dubai' }
    },
    {
      id: generateUUID(),
      state: 'ENGAGED',
      metadata: { industry: 'software', size: 100, location: 'Abu Dhabi' }
    },
    {
      id: generateUUID(),
      state: 'OUTREACH',
      metadata: { industry: 'consulting', size: 50, location: 'Riyadh' }
    },
    {
      id: generateUUID(),
      state: 'DORMANT',
      metadata: { industry: 'retail', size: 20, location: 'Cairo' }
    }
  ];

  // Insert test opportunities
  for (const opp of opportunities) {
    testOpportunityIds.push(opp.id);

    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
      VALUES ($1, $2, 'manual', $3)
    `, [opp.id, opp.state, JSON.stringify(opp.metadata)]);

    // Add touchpoints based on state
    const touchpointCount = opp.state === 'NEGOTIATING' ? 5 :
                            opp.state === 'ENGAGED' ? 3 :
                            opp.state === 'OUTREACH' ? 1 : 0;

    for (let i = 0; i < touchpointCount; i++) {
      await pool.query(`
        INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, outcome, occurred_at)
        VALUES ($1, 'email', 'positive', NOW() - INTERVAL '${i * 2} days')
      `, [opp.id]);
    }

    // Calculate scores
    await calculator.calculateLeadScore(opp.id);
  }

  // Test 1.1: Calculate priority scores
  const priorityResults = await Promise.all(
    opportunities.map(opp => priorityService.calculatePriorityScore(opp.id))
  );

  logTest('Priority scores calculated for all opportunities',
    priorityResults.every(r => !r.error && typeof r.priorityScore === 'number'),
    `Calculated ${priorityResults.filter(r => !r.error).length}/4 scores`);

  // Test 1.2: NEGOTIATING should have highest priority boost
  const negotiatingPriority = priorityResults.find(r =>
    opportunities.find(o => o.id === r.opportunityId && o.state === 'NEGOTIATING')
  );

  logTest('NEGOTIATING state gets priority boost',
    negotiatingPriority && negotiatingPriority.breakdown.stageBoost > 0,
    `Stage boost: ${negotiatingPriority?.breakdown.stageBoost}`);

  // Test 1.3: DORMANT should have negative priority
  const dormantPriority = priorityResults.find(r =>
    opportunities.find(o => o.id === r.opportunityId && o.state === 'DORMANT')
  );

  logTest('DORMANT state gets priority penalty',
    dormantPriority && dormantPriority.breakdown.stageBoost < 0,
    `Stage boost: ${dormantPriority?.breakdown.stageBoost}`);

  await calculator.close();
  await priorityService.close();
}

async function testMostActionableLogic() {
  console.log('\n📊 Test Group 2: Most Actionable Logic\n');

  const priorityService = new PriorityRankingService(DATABASE_CONFIG);

  // Test 2.1: Get most actionable leads
  const mostActionable = await priorityService.getMostActionable(10);

  logTest('Most actionable leads retrieved',
    Array.isArray(mostActionable) && mostActionable.length > 0,
    `Found ${mostActionable.length} leads`);

  // Test 2.2: Leads are ranked (decreasing priority)
  const isRanked = mostActionable.every((lead, i) => {
    if (i === 0) return true;
    const prevLead = mostActionable[i - 1];
    return (prevLead.priorityScore || 0) >= (lead.priorityScore || 0);
  });

  logTest('Leads ranked by priority score',
    isRanked,
    `Priority scores: ${mostActionable.slice(0, 3).map(l => l.priorityScore || 0).join(', ')}...`);

  // Test 2.3: Actionable reasons provided
  const hasReasons = mostActionable.every(lead =>
    lead.mostActionableReason && lead.mostActionableReason.length > 0
  );

  logTest('Actionable reasons provided',
    hasReasons,
    `Sample: "${mostActionable[0]?.mostActionableReason?.substring(0, 50)}..."`);

  // Test 2.4: Recommended actions provided
  const hasActions = mostActionable.every(lead =>
    lead.recommendedActions && Array.isArray(lead.recommendedActions)
  );

  logTest('Recommended actions provided',
    hasActions,
    `Sample: ${mostActionable[0]?.recommendedActions?.[0]}`);

  await priorityService.close();
}

async function testLeadQueueGeneration() {
  console.log('\n📊 Test Group 3: Lead Queue Generation\n');

  const priorityService = new PriorityRankingService(DATABASE_CONFIG);

  // Test 3.1: Get lead queue (personalized)
  const leadQueue = await priorityService.getLeadQueue('test-user-id', 20);

  logTest('Lead queue generated',
    Array.isArray(leadQueue),
    `Queue size: ${leadQueue.length}`);

  // Test 3.2: Test filters - grade filter
  const aGradeLeads = await priorityService.rankLeads({ grade: 'A', limit: 10 });

  logTest('Grade filter works',
    aGradeLeads.every(lead => lead.grade === 'A'),
    `Found ${aGradeLeads.length} A-grade leads`);

  // Test 3.3: Test filters - state filter
  const engagedLeads = await priorityService.rankLeads({ state: 'ENGAGED', limit: 10 });

  logTest('State filter works',
    engagedLeads.every(lead => lead.currentState === 'ENGAGED'),
    `Found ${engagedLeads.length} ENGAGED leads`);

  // Test 3.4: Test filters - min score
  const highScoreLeads = await priorityService.rankLeads({ minScore: 5000, limit: 10 });

  logTest('Min score filter works',
    highScoreLeads.every(lead => lead.leadScore >= 5000),
    `Found ${highScoreLeads.length} leads with score >= 5000`);

  await priorityService.close();
}

async function testServiceIntegration() {
  console.log('\n📊 Test Group 4: Service Integration\n');

  const calculator = new LeadScoreCalculator(DATABASE_CONFIG);
  const priorityService = new PriorityRankingService(DATABASE_CONFIG);
  const decayService = new ScoreDecayService(DATABASE_CONFIG);

  // Create test opportunity
  const testOppId = generateUUID();
  testOpportunityIds.push(testOppId);

  await pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
    VALUES ($1, 'ENGAGED', 'manual', $2)
  `, [testOppId, JSON.stringify({ industry: 'technology', size: 150, location: 'Dubai' })]);

  // Add old touchpoint for decay
  await pool.query(`
    INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, occurred_at)
    VALUES ($1, 'email', NOW() - INTERVAL '20 days')
  `, [testOppId]);

  // Test 4.1: Calculate lead score
  const scoreResult = await calculator.calculateLeadScore(testOppId);

  logTest('Lead score calculated',
    scoreResult && typeof scoreResult.leadScore === 'number',
    `Score: ${scoreResult?.leadScore}`);

  // Test 4.2: Calculate priority
  const priorityResult = await priorityService.calculatePriorityScore(testOppId);

  logTest('Priority score calculated',
    priorityResult && typeof priorityResult.priorityScore === 'number',
    `Priority: ${priorityResult?.priorityScore}`);

  // Test 4.3: Apply decay
  const decayResult = await decayService.applyDecay(testOppId);

  logTest('Decay applied successfully',
    decayResult && decayResult.decayApplied === true,
    `Decay rate: ${(decayResult?.decayRate * 100).toFixed(1)}%`);

  // Test 4.4: Recalculate priority after decay
  const newPriorityResult = await priorityService.calculatePriorityScore(testOppId);

  logTest('Priority updated after decay',
    newPriorityResult.priorityScore !== priorityResult.priorityScore,
    `${priorityResult.priorityScore} → ${newPriorityResult.priorityScore}`);

  await calculator.close();
  await priorityService.close();
  await decayService.close();
}

async function testEndToEndWorkflow() {
  console.log('\n📊 Test Group 5: End-to-End Workflow\n');

  const calculator = new LeadScoreCalculator(DATABASE_CONFIG);
  const priorityService = new PriorityRankingService(DATABASE_CONFIG);

  // Create 3 opportunities with different characteristics
  const oppIds = [];

  for (let i = 0; i < 3; i++) {
    const oppId = generateUUID();
    oppIds.push(oppId);
    testOpportunityIds.push(oppId);

    const states = ['QUALIFIED', 'ENGAGED', 'NEGOTIATING'];
    const sizes = [50, 150, 300];

    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
      VALUES ($1, $2, 'manual', $3)
    `, [oppId, states[i], JSON.stringify({
      industry: 'technology',
      size: sizes[i],
      location: 'Dubai'
    })]);

    // Add touchpoints
    for (let j = 0; j < (i + 1) * 2; j++) {
      await pool.query(`
        INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, outcome, occurred_at)
        VALUES ($1, 'email', 'positive', NOW() - INTERVAL '${j} days')
      `, [oppId]);
    }
  }

  // Test 5.1: Batch calculate scores
  const batchResults = await calculator.batchCalculateScores(oppIds);

  logTest('Batch scoring successful',
    batchResults.every(r => !r.error),
    `Scored ${batchResults.filter(r => !r.error).length}/3 opportunities`);

  // Test 5.2: Batch calculate priorities
  const priorityBatchResults = await priorityService.batchCalculatePriority(oppIds);

  logTest('Batch priority calculation successful',
    priorityBatchResults.every(r => !r.error),
    `Calculated ${priorityBatchResults.filter(r => !r.error).length}/3 priorities`);

  // Test 5.3: Retrieve prioritized queue
  const queue = await priorityService.getMostActionable(10);

  logTest('Prioritized queue includes new opportunities',
    queue.some(lead => oppIds.includes(lead.opportunityId)),
    `Queue contains ${queue.filter(l => oppIds.includes(l.opportunityId)).length}/3 new opps`);

  // Test 5.4: Verify all components present
  const firstLead = queue[0];
  const hasAllComponents = firstLead &&
                          typeof firstLead.leadScore === 'number' &&
                          typeof firstLead.priorityScore === 'number' &&
                          typeof firstLead.grade === 'string' &&
                          typeof firstLead.currentState === 'string';

  logTest('Queue leads have all required components',
    hasAllComponents,
    `Sample: Score=${firstLead?.leadScore}, Priority=${firstLead?.priorityScore}, Grade=${firstLead?.grade}`);

  await calculator.close();
  await priorityService.close();
}

async function runCheckpoint2() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         Sprint 35 - Checkpoint 2: API & Integration         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    await testPriorityRankingService();
    await testMostActionableLogic();
    await testLeadQueueGeneration();
    await testServiceIntegration();
    await testEndToEndWorkflow();

    await cleanup();

    console.log('\n' + '═'.repeat(60));
    console.log('CHECKPOINT 2 RESULTS');
    console.log('═'.repeat(60));

    const passed = testResults.filter(t => t.passed).length;
    const total = testResults.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(`\nTotal Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Pass Rate: ${passRate}%\n`);

    if (passed === total) {
      console.log('🎉 ALL TESTS PASSED! API & integration validated.\n');
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
    console.error('❌ Checkpoint 2 failed:', error.message);
    console.error(error.stack);
    await cleanup();
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runCheckpoint2();
