#!/usr/bin/env node
/**
 * CHECKPOINT 3: Test Transition Triggers and Auto-Transition Logic
 *
 * Tests:
 * 1. Transition rules loading
 * 2. Condition evaluation (time, activity, score, event)
 * 3. Eligible opportunity detection
 * 4. Auto-transition execution
 * 5. Batch processing
 * 6. Error handling
 * 7. Statistics tracking
 */

import { LifecycleStateEngine } from '../../server/services/lifecycleStateEngine.js';
import { LifecycleStatePersistence } from '../../server/services/lifecycleStatePersistence.js';
import { LifecycleTransitionTriggers, ConditionTypes } from '../../server/services/lifecycleTransitionTriggers.js';
import { LifecycleAutoTransition } from '../../server/services/lifecycleAutoTransition.js';

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

async function testTriggersInitialization() {
  console.log('\n📋 Test 1: Triggers Initialization\n');

  const persistence = new LifecycleStatePersistence();
  const triggers = new LifecycleTransitionTriggers(persistence);

  assert(triggers !== null, 'Triggers initialized');
  assert(typeof triggers.evaluateRule === 'function', 'Triggers has evaluateRule method');
  assert(typeof triggers.getActiveRules === 'function', 'Triggers has getActiveRules method');

  await persistence.close();
}

async function testLoadTransitionRules() {
  console.log('\n📋 Test 2: Load Transition Rules\n');

  const persistence = new LifecycleStatePersistence();
  const triggers = new LifecycleTransitionTriggers(persistence);

  const rules = await triggers.getActiveRules();

  assert(rules.length >= 5, `At least 5 rules loaded (found ${rules.length})`);
  assert(rules[0].rule_name !== null, 'Rules have names');
  assert(rules[0].from_state !== null, 'Rules have from_state');
  assert(rules[0].to_state !== null, 'Rules have to_state');
  assert(rules[0].condition_type !== null, 'Rules have condition_type');

  // Test filtering by state
  const qualifiedRules = await triggers.getActiveRules('QUALIFIED');
  assert(qualifiedRules.length > 0, 'Can filter rules by from_state');
  assert(qualifiedRules.every(r => r.from_state === 'QUALIFIED'), 'Filtered rules match state');

  await persistence.close();
}

async function testTimeBasedCondition() {
  console.log('\n📋 Test 3: Time-Based Condition Evaluation\n');

  const persistence = new LifecycleStatePersistence();
  const triggers = new LifecycleTransitionTriggers(persistence);

  // Test 2 hours condition
  const twoHoursConfig = { hours: 2 };
  const recentState = { seconds_in_state: 3600 }; // 1 hour
  const oldState = { seconds_in_state: 7200 + 60 }; // 2 hours + 1 minute

  assert(
    !triggers.evaluateTimeBased(twoHoursConfig, recentState),
    'Recent state (1h) does not meet 2h threshold'
  );

  assert(
    triggers.evaluateTimeBased(twoHoursConfig, oldState),
    'Old state (2h+) meets 2h threshold'
  );

  // Test days condition
  const thirtyDaysConfig = { days: 30 };
  const youngState = { seconds_in_state: 25 * 86400 }; // 25 days
  const oldDormantState = { seconds_in_state: 35 * 86400 }; // 35 days

  assert(
    !triggers.evaluateTimeBased(thirtyDaysConfig, youngState),
    'Young state (25d) does not meet 30d threshold'
  );

  assert(
    triggers.evaluateTimeBased(thirtyDaysConfig, oldDormantState),
    'Old state (35d) meets 30d threshold'
  );

  await persistence.close();
}

async function testActivityBasedCondition() {
  console.log('\n📋 Test 4: Activity-Based Condition Evaluation\n');

  const persistence = new LifecycleStatePersistence();
  const triggers = new LifecycleTransitionTriggers(persistence);

  const thirtyDaysConfig = { days_inactive: 30 };
  const activeState = { seconds_in_state: 20 * 86400 }; // 20 days
  const inactiveState = { seconds_in_state: 32 * 86400 }; // 32 days

  assert(
    !triggers.evaluateActivityBased(thirtyDaysConfig, activeState),
    'Active state (20d) not considered inactive'
  );

  assert(
    triggers.evaluateActivityBased(thirtyDaysConfig, inactiveState),
    'Inactive state (32d) detected'
  );

  await persistence.close();
}

async function testScoreBasedCondition() {
  console.log('\n📋 Test 5: Score-Based Condition Evaluation\n');

  const persistence = new LifecycleStatePersistence();
  const triggers = new LifecycleTransitionTriggers(persistence);

  const minScoreConfig = { score_field: 'quality_score', min_score: 70 };
  const lowScoreState = { metadata: { quality_score: 55 } };
  const highScoreState = { metadata: { quality_score: 85 } };

  assert(
    !triggers.evaluateScoreBased(minScoreConfig, lowScoreState),
    'Low score (55) does not meet threshold (70)'
  );

  assert(
    triggers.evaluateScoreBased(minScoreConfig, highScoreState),
    'High score (85) meets threshold (70)'
  );

  // Test range
  const rangeConfig = { score_field: 'quality_score', min_score: 60, max_score: 80 };
  const midScoreState = { metadata: { quality_score: 70 } };
  const veryHighScoreState = { metadata: { quality_score: 90 } };

  assert(
    triggers.evaluateScoreBased(rangeConfig, midScoreState),
    'Mid score (70) in range [60-80]'
  );

  assert(
    !triggers.evaluateScoreBased(rangeConfig, veryHighScoreState),
    'Very high score (90) outside range [60-80]'
  );

  await persistence.close();
}

async function testEventBasedCondition() {
  console.log('\n📋 Test 6: Event-Based Condition Evaluation\n');

  const persistence = new LifecycleStatePersistence();
  const triggers = new LifecycleTransitionTriggers(persistence);

  const maxAttemptsConfig = { max_attempts: 5, no_response: true };

  const fewAttemptsState = {
    metadata: { attempts_count: 3, no_response: true }
  };

  const maxAttemptsState = {
    metadata: { attempts_count: 5, no_response: true }
  };

  const maxAttemptsButResponse = {
    metadata: { attempts_count: 5, no_response: false }
  };

  assert(
    !triggers.evaluateEventBased(maxAttemptsConfig, fewAttemptsState),
    'Few attempts (3/5) not eligible'
  );

  assert(
    triggers.evaluateEventBased(maxAttemptsConfig, maxAttemptsState),
    'Max attempts (5/5) + no response eligible'
  );

  assert(
    !triggers.evaluateEventBased(maxAttemptsConfig, maxAttemptsButResponse),
    'Max attempts but has response not eligible'
  );

  await persistence.close();
}

async function testFindEligibleOpportunities() {
  console.log('\n📋 Test 7: Find Eligible Opportunities\n');

  const persistence = new LifecycleStatePersistence();
  const triggers = new LifecycleTransitionTriggers(persistence);

  // Create test opportunity in QUALIFIED state
  const testOppId = '10eebc99-9c0b-4ef8-bb6d-6bb9bd380a18';

  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  // Create opportunity that's been in QUALIFIED for 3 hours
  await persistence.pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, trigger_reason, entered_at)
    VALUES ($1, 'QUALIFIED', 'manual', 'Test', NOW() - INTERVAL '3 hours')
  `, [testOppId]);

  // Get the qualified_to_outreach rule
  const rules = await triggers.getActiveRules('QUALIFIED');
  const qualifiedToOutreachRule = rules.find(r => r.rule_name === 'qualified_to_outreach');

  if (qualifiedToOutreachRule) {
    const eligible = await triggers.findEligibleOpportunities(qualifiedToOutreachRule);
    assert(eligible.length >= 1, `Found eligible opportunities (${eligible.length})`);
    assert(
      eligible.some(o => o.opportunity_id === testOppId),
      'Test opportunity detected as eligible'
    );
  } else {
    assert(false, 'qualified_to_outreach rule should exist');
  }

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testAutoTransitionInitialization() {
  console.log('\n📋 Test 8: Auto-Transition Initialization\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const triggers = new LifecycleTransitionTriggers(persistence);
  const autoTransition = new LifecycleAutoTransition(engine, triggers, { dryRun: true });

  assert(autoTransition !== null, 'Auto-transition initialized');
  assert(typeof autoTransition.runAll === 'function', 'Has runAll method');
  assert(typeof autoTransition.runSpecific === 'function', 'Has runSpecific method');
  assert(typeof autoTransition.getSummary === 'function', 'Has getSummary method');
  assert(autoTransition.options.dryRun === true, 'Dry run mode enabled');

  await persistence.close();
}

async function testAutoTransitionDryRun() {
  console.log('\n📋 Test 9: Auto-Transition Dry Run\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const triggers = new LifecycleTransitionTriggers(persistence);
  const autoTransition = new LifecycleAutoTransition(engine, triggers, { dryRun: true });

  // Create test opportunity eligible for transition
  const testOppId = '20eebc99-9c0b-4ef8-bb6d-6bb9bd380a19';

  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  await persistence.pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, trigger_reason, entered_at)
    VALUES ($1, 'QUALIFIED', 'manual', 'Test', NOW() - INTERVAL '3 hours')
  `, [testOppId]);

  // Run dry run
  const summary = await autoTransition.getSummary();

  assert(summary.total >= 0, 'Summary returns total count');
  assert(summary.by_transition !== null, 'Summary has by_transition breakdown');

  // Verify opportunity is still in QUALIFIED (dry run didn't actually transition)
  const currentState = await persistence.getCurrentState(testOppId);
  assert(currentState.state === 'QUALIFIED', 'Opportunity still in QUALIFIED after dry run');

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testAutoTransitionExecution() {
  console.log('\n📋 Test 10: Auto-Transition Execution (Live)\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const triggers = new LifecycleTransitionTriggers(persistence);
  const autoTransition = new LifecycleAutoTransition(engine, triggers, { dryRun: false });

  // Create test opportunity eligible for transition
  const testOppId = '30eebc99-9c0b-4ef8-bb6d-6bb9bd380a20';

  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  await persistence.pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, trigger_reason, entered_at)
    VALUES ($1, 'QUALIFIED', 'manual', 'Test', NOW() - INTERVAL '3 hours')
  `, [testOppId]);

  // Run specific transition
  const result = await autoTransition.runSpecific('qualified_to_outreach');

  assert(result.total >= 1, `Processed at least 1 opportunity (${result.total})`);
  assert(result.succeeded >= 1, `At least 1 transition succeeded (${result.succeeded})`);

  // Verify opportunity transitioned to OUTREACH
  const currentState = await persistence.getCurrentState(testOppId);
  assert(currentState.state === 'OUTREACH', 'Opportunity transitioned to OUTREACH');

  // Check history
  const history = await persistence.getLifecycleHistory(testOppId);
  assert(history.length === 2, 'History has 2 states');
  assert(history[1].trigger_type === 'auto', 'Second transition was automatic');

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testStatistics() {
  console.log('\n📋 Test 11: Statistics Tracking\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const triggers = new LifecycleTransitionTriggers(persistence);
  const autoTransition = new LifecycleAutoTransition(engine, triggers, { dryRun: true });

  const stats = autoTransition.getStats();

  assert(stats.totalChecked >= 0, 'Stats track totalChecked');
  assert(stats.totalTransitioned >= 0, 'Stats track totalTransitioned');
  assert(stats.totalErrors >= 0, 'Stats track totalErrors');
  assert(Array.isArray(stats.runHistory), 'Stats have runHistory array');

  await persistence.close();
}

async function runCheckpoint() {
  console.log('='.repeat(70));
  console.log('CHECKPOINT 3: TRANSITION TRIGGERS AND AUTO-TRANSITION TESTS');
  console.log('='.repeat(70));

  try {
    await testTriggersInitialization();
    await testLoadTransitionRules();
    await testTimeBasedCondition();
    await testActivityBasedCondition();
    await testScoreBasedCondition();
    await testEventBasedCondition();
    await testFindEligibleOpportunities();
    await testAutoTransitionInitialization();
    await testAutoTransitionDryRun();
    await testAutoTransitionExecution();
    await testStatistics();

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('CHECKPOINT 3 RESULTS');
    console.log('='.repeat(70));
    console.log(`Total Tests: ${testsRun}`);
    console.log(`Passed: ${testsPassed} ✅`);
    console.log(`Failed: ${testsFailed} ❌`);
    console.log(`Pass Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
    console.log('='.repeat(70));

    if (testsFailed === 0) {
      console.log('\n✅ CHECKPOINT 3: PASSED - Transition logic is ready!');
      process.exit(0);
    } else {
      console.log('\n❌ CHECKPOINT 3: FAILED - Please fix the issues above');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ CHECKPOINT 3: ERROR', error);
    process.exit(1);
  }
}

runCheckpoint();
