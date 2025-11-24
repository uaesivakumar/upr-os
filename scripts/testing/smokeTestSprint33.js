#!/usr/bin/env node
/**
 * Sprint 33 Smoke Test - Opportunity Lifecycle Engine
 * Quick validation of all core functionality
 */

import { LifecycleStateEngine } from '../../server/services/lifecycleStateEngine.js';
import { LifecycleStatePersistence } from '../../server/services/lifecycleStatePersistence.js';
import { LifecycleTransitionTriggers } from '../../server/services/lifecycleTransitionTriggers.js';
import { LifecycleAutoTransition } from '../../server/services/lifecycleAutoTransition.js';
import { OutreachIntentMapper } from '../../server/services/outreachIntentMapper.js';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    testsPassed++;
    console.log(`✅ ${message}`);
  } else {
    testsFailed++;
    console.error(`❌ ${message}`);
  }
}

async function smokeTest() {
  console.log('\n' + '='.repeat(70));
  console.log('SPRINT 33 SMOKE TEST - OPPORTUNITY LIFECYCLE ENGINE');
  console.log('='.repeat(70));
  console.log('');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const triggers = new LifecycleTransitionTriggers(persistence);
  const autoTransition = new LifecycleAutoTransition(engine, triggers, { dryRun: true });
  const intentMapper = new OutreachIntentMapper(engine, persistence);

  try {
    // Test 1: Database Schema
    console.log('📋 Test 1: Database Schema\n');

    const tables = await persistence.pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('opportunity_lifecycle', 'lifecycle_transition_rules')
    `);
    assert(tables.rows.length === 2, 'Database tables exist');

    const rules = await persistence.getTransitionRules();
    assert(rules.length >= 5, `Transition rules seeded (${rules.length})`);

    // Test 2: State Engine
    console.log('\n📋 Test 2: State Engine\n');

    const states = engine.getStates();
    assert(states.length === 7, `7 states defined (${states.length})`);
    assert(states.includes('DISCOVERED'), 'DISCOVERED state exists');
    assert(states.includes('CLOSED'), 'CLOSED state exists');

    assert(engine.isValidTransition('DISCOVERED', 'QUALIFIED'), 'Valid transition accepted');
    assert(!engine.isValidTransition('DISCOVERED', 'NEGOTIATING'), 'Invalid transition rejected');

    // Test 3: State Persistence
    console.log('\n📋 Test 3: State Persistence\n');

    const testOppId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a29';
    await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

    const stateId = await persistence.createState({
      opportunityId: testOppId,
      state: 'DISCOVERED',
      triggerType: 'manual',
      triggerReason: 'Smoke test'
    });
    assert(stateId !== null, 'State created');

    const currentState = await persistence.getCurrentState(testOppId);
    assert(currentState.state === 'DISCOVERED', 'Current state retrieved');

    // Test 4: State Transitions
    console.log('\n📋 Test 4: State Transitions\n');

    const transitionResult = await engine.transition(testOppId, 'QUALIFIED', {
      triggerType: 'auto',
      triggerReason: 'Quality score: 85'
    });
    assert(transitionResult.success, 'Transition executed');

    const newState = await persistence.getCurrentState(testOppId);
    assert(newState.state === 'QUALIFIED', 'State transitioned correctly');

    const history = await persistence.getLifecycleHistory(testOppId);
    assert(history.length === 2, `History tracked (${history.length} entries)`);

    // Test 5: Transition Triggers
    console.log('\n📋 Test 5: Transition Triggers\n');

    const timeBasedConfig = { hours: 2 };
    const oldState = { seconds_in_state: 7200 + 60 };
    assert(
      triggers.evaluateTimeBased(timeBasedConfig, oldState),
      'Time-based condition evaluation'
    );

    const scoreConfig = { score_field: 'quality_score', min_score: 70 };
    const highScore = { metadata: { quality_score: 85 } };
    assert(
      triggers.evaluateScoreBased(scoreConfig, highScore),
      'Score-based condition evaluation'
    );

    // Test 6: Auto-Transition
    console.log('\n📋 Test 6: Auto-Transition Logic\n');

    const summary = await autoTransition.getSummary();
    assert(summary.total >= 0, 'Auto-transition summary generated');

    const stats = autoTransition.getStats();
    assert(stats !== null, 'Auto-transition stats available');

    // Test 7: Intent Mapper
    console.log('\n📋 Test 7: Intent Mapper\n');

    const sendOutreachIntent = intentMapper.getIntent('send_outreach_message');
    assert(sendOutreachIntent !== null, 'send_outreach_message intent exists');

    const allIntents = intentMapper.getAllIntents();
    assert(allIntents.length >= 20, `${allIntents.length} intents defined`);

    const validation = await intentMapper.validateIntent(testOppId, 'send_outreach_message');
    assert(validation.valid === true, 'Intent validation works');

    const intentResult = await intentMapper.executeIntent(testOppId, 'send_outreach_message', {
      reason: 'Smoke test outreach'
    });
    assert(intentResult.success, 'Intent execution works');

    const finalState = await persistence.getCurrentState(testOppId);
    assert(finalState.state === 'OUTREACH', 'Intent transitioned state correctly');

    // Test 8: Complete Journey
    console.log('\n📋 Test 8: Complete Opportunity Journey\n');

    const journeyOppId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a30';
    await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [journeyOppId]);

    // DISCOVERED → QUALIFIED → OUTREACH → ENGAGED → NEGOTIATING → CLOSED.WON
    await persistence.createState({
      opportunityId: journeyOppId,
      state: 'DISCOVERED',
      triggerType: 'manual',
      triggerReason: 'Smoke test'
    });

    await intentMapper.executeIntent(journeyOppId, 'qualify_company');
    await intentMapper.executeIntent(journeyOppId, 'send_outreach_message');
    await intentMapper.executeIntent(journeyOppId, 'log_meeting');
    await intentMapper.executeIntent(journeyOppId, 'send_proposal');
    await intentMapper.executeIntent(journeyOppId, 'mark_as_won', {
      reason: 'Deal closed successfully'
    });

    const journeyState = await persistence.getCurrentState(journeyOppId);
    assert(journeyState.state === 'CLOSED', 'Complete journey: reached CLOSED');
    assert(journeyState.sub_state === 'WON', 'Complete journey: WON');

    const journeyHistory = await persistence.getLifecycleHistory(journeyOppId);
    assert(journeyHistory.length === 6, `Complete journey: 6 states (${journeyHistory.length})`);

    // Test 9: Analytics
    console.log('\n📋 Test 9: Analytics\n');

    const analytics = await persistence.getStateAnalytics();
    assert(analytics !== null, 'State analytics available');

    const counts = await persistence.getStateCounts();
    assert(counts.length > 0, `State counts available (${counts.length})`);

    // Test 10: State Machine Graph
    console.log('\n📋 Test 10: State Machine Visualization\n');

    const graph = engine.getStateMachineGraph();
    assert(graph.nodes.length === 7, `Graph has 7 nodes (${graph.nodes.length})`);
    assert(graph.edges.length > 0, `Graph has edges (${graph.edges.length})`);

    // Cleanup
    console.log('\n🧹 Cleaning up test data...\n');
    await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id IN ($1, $2)', [testOppId, journeyOppId]);

    // Summary
    console.log('='.repeat(70));
    console.log('SMOKE TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Tests: ${testsRun}`);
    console.log(`Passed: ${testsPassed} ✅`);
    console.log(`Failed: ${testsFailed} ❌`);
    console.log(`Pass Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
    console.log('='.repeat(70));

    if (testsFailed === 0) {
      console.log('\n✅ SPRINT 33 SMOKE TEST: PASSED');
      console.log('🎉 Opportunity Lifecycle Engine is production-ready!');
      process.exit(0);
    } else {
      console.log('\n❌ SPRINT 33 SMOKE TEST: FAILED');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ SMOKE TEST ERROR:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await persistence.close();
  }
}

smokeTest();
