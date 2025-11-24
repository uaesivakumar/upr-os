#!/usr/bin/env node
/**
 * CHECKPOINT 2: Test Lifecycle State Engine and Persistence
 *
 * Tests:
 * 1. State Engine initialization
 * 2. State validation
 * 3. Transition validation
 * 4. State creation and persistence
 * 5. State queries
 * 6. Transition execution
 * 7. History tracking
 * 8. Analytics
 */

import { LifecycleStateEngine, LifecycleStates, TriggerTypes } from '../../server/services/lifecycleStateEngine.js';
import { LifecycleStatePersistence } from '../../server/services/lifecycleStatePersistence.js';

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

async function testEngineInitialization() {
  console.log('\n📋 Test 1: Engine Initialization\n');

  const engine = new LifecycleStateEngine();

  assert(engine !== null, 'Engine initialized');
  assert(typeof engine.transition === 'function', 'Engine has transition method');
  assert(typeof engine.getStates === 'function', 'Engine has getStates method');

  const states = engine.getStates();
  assert(states.length === 7, `Engine has 7 states (found ${states.length})`);
  assert(states.includes('DISCOVERED'), 'DISCOVERED state exists');
  assert(states.includes('QUALIFIED'), 'QUALIFIED state exists');
  assert(states.includes('OUTREACH'), 'OUTREACH state exists');
  assert(states.includes('ENGAGED'), 'ENGAGED state exists');
  assert(states.includes('NEGOTIATING'), 'NEGOTIATING state exists');
  assert(states.includes('DORMANT'), 'DORMANT state exists');
  assert(states.includes('CLOSED'), 'CLOSED state exists');
}

async function testStateValidation() {
  console.log('\n📋 Test 2: State Validation\n');

  const engine = new LifecycleStateEngine();

  assert(engine.isValidState('DISCOVERED'), 'DISCOVERED is valid');
  assert(engine.isValidState('QUALIFIED'), 'QUALIFIED is valid');
  assert(engine.isValidState('OUTREACH'), 'OUTREACH is valid');
  assert(!engine.isValidState('INVALID'), 'INVALID is not valid');
  assert(!engine.isValidState(''), 'Empty string is not valid');

  assert(engine.isValidSubState('WON'), 'WON is valid sub-state');
  assert(engine.isValidSubState('LOST'), 'LOST is valid sub-state');
  assert(engine.isValidSubState('DISQUALIFIED'), 'DISQUALIFIED is valid sub-state');
  assert(!engine.isValidSubState('INVALID'), 'INVALID is not valid sub-state');
}

async function testTransitionValidation() {
  console.log('\n📋 Test 3: Transition Validation\n');

  const engine = new LifecycleStateEngine();

  // Valid transitions
  assert(engine.isValidTransition('DISCOVERED', 'QUALIFIED'), 'DISCOVERED → QUALIFIED is valid');
  assert(engine.isValidTransition('QUALIFIED', 'OUTREACH'), 'QUALIFIED → OUTREACH is valid');
  assert(engine.isValidTransition('OUTREACH', 'ENGAGED'), 'OUTREACH → ENGAGED is valid');
  assert(engine.isValidTransition('ENGAGED', 'NEGOTIATING'), 'ENGAGED → NEGOTIATING is valid');
  assert(engine.isValidTransition('NEGOTIATING', 'CLOSED'), 'NEGOTIATING → CLOSED is valid');

  // Invalid transitions
  assert(!engine.isValidTransition('DISCOVERED', 'NEGOTIATING'), 'DISCOVERED → NEGOTIATING is invalid');
  assert(!engine.isValidTransition('QUALIFIED', 'NEGOTIATING'), 'QUALIFIED → NEGOTIATING direct is invalid (must go through OUTREACH → ENGAGED)');
  assert(!engine.isValidTransition('DORMANT', 'NEGOTIATING'), 'DORMANT → NEGOTIATING is invalid');

  // Get valid next states
  const discoveredNext = engine.getValidNextStates('DISCOVERED');
  assert(discoveredNext.includes('QUALIFIED'), 'DISCOVERED can go to QUALIFIED');
  assert(discoveredNext.includes('CLOSED'), 'DISCOVERED can go to CLOSED');

  const qualifiedNext = engine.getValidNextStates('QUALIFIED');
  assert(qualifiedNext.includes('OUTREACH'), 'QUALIFIED can go to OUTREACH');
  assert(!qualifiedNext.includes('NEGOTIATING'), 'QUALIFIED cannot go directly to NEGOTIATING');
}

async function testPersistenceInitialization() {
  console.log('\n📋 Test 4: Persistence Initialization\n');

  const persistence = new LifecycleStatePersistence();

  assert(persistence !== null, 'Persistence initialized');
  assert(typeof persistence.createState === 'function', 'Persistence has createState method');
  assert(typeof persistence.getCurrentState === 'function', 'Persistence has getCurrentState method');
  assert(typeof persistence.getLifecycleHistory === 'function', 'Persistence has getLifecycleHistory method');

  await persistence.close();
}

async function testStateCreation() {
  console.log('\n📋 Test 5: State Creation and Persistence\n');

  const persistence = new LifecycleStatePersistence();
  const testOppId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13';

  // Clean up any existing test data
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  // Create DISCOVERED state
  const stateId = await persistence.createState({
    opportunityId: testOppId,
    state: 'DISCOVERED',
    triggerType: 'manual',
    triggerReason: 'Checkpoint test',
    metadata: { test: true }
  });

  assert(stateId !== null, 'State created with ID');

  // Get current state
  const currentState = await persistence.getCurrentState(testOppId);
  assert(currentState !== null, 'Current state retrieved');
  assert(currentState.state === 'DISCOVERED', 'Current state is DISCOVERED');
  assert(currentState.seconds_in_state >= 0, 'Time in state calculated');

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testTransitionExecution() {
  console.log('\n📋 Test 6: Transition Execution\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const testOppId = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14';

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  // Create initial state
  await persistence.createState({
    opportunityId: testOppId,
    state: 'DISCOVERED',
    triggerType: 'manual',
    triggerReason: 'Test start'
  });

  // Execute transition DISCOVERED → QUALIFIED
  const result = await engine.transition(testOppId, 'QUALIFIED', {
    triggerType: TriggerTypes.AUTO,
    triggerReason: 'Quality score: 85',
    metadata: { quality_score: 85 }
  });

  assert(result.success, 'Transition succeeded');
  assert(result.transition.from === 'DISCOVERED', 'Transition from DISCOVERED');
  assert(result.transition.to === 'QUALIFIED', 'Transition to QUALIFIED');

  // Verify current state changed
  const currentState = await persistence.getCurrentState(testOppId);
  assert(currentState.state === 'QUALIFIED', 'Current state is now QUALIFIED');

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testHistoryTracking() {
  console.log('\n📋 Test 7: History Tracking\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const testOppId = 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15';

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  // Create journey: DISCOVERED → QUALIFIED → OUTREACH
  await persistence.createState({
    opportunityId: testOppId,
    state: 'DISCOVERED',
    triggerType: 'manual',
    triggerReason: 'Initial'
  });

  await engine.transition(testOppId, 'QUALIFIED', {
    triggerType: TriggerTypes.AUTO,
    triggerReason: 'Quality check passed'
  });

  await engine.transition(testOppId, 'OUTREACH', {
    triggerType: TriggerTypes.AUTO,
    triggerReason: 'Auto-transition after 2h'
  });

  // Get history
  const history = await persistence.getLifecycleHistory(testOppId);

  assert(history.length === 3, `History has 3 entries (found ${history.length})`);
  assert(history[0].state === 'DISCOVERED', 'First state is DISCOVERED');
  assert(history[1].state === 'QUALIFIED', 'Second state is QUALIFIED');
  assert(history[2].state === 'OUTREACH', 'Third state is OUTREACH');
  assert(history[0].exited_at !== null, 'DISCOVERED has exit time');
  assert(history[2].exited_at === null, 'OUTREACH has no exit time (current)');

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testStateQueries() {
  console.log('\n📋 Test 8: State Queries\n');

  const persistence = new LifecycleStatePersistence();
  const testOppId1 = 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16';
  const testOppId2 = 'f1eebc99-9c0b-4ef8-bb6d-6bb9bd380a17';

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id IN ($1, $2)', [testOppId1, testOppId2]);

  // Create opportunities in different states
  await persistence.createState({
    opportunityId: testOppId1,
    state: 'OUTREACH',
    triggerType: 'auto',
    triggerReason: 'Test'
  });

  await persistence.createState({
    opportunityId: testOppId2,
    state: 'OUTREACH',
    triggerType: 'auto',
    triggerReason: 'Test'
  });

  // Query opportunities in OUTREACH
  const inOutreach = await persistence.getOpportunitiesInState('OUTREACH', { limit: 10 });
  assert(inOutreach.length >= 2, `At least 2 opportunities in OUTREACH (found ${inOutreach.length})`);

  // Get state counts
  const counts = await persistence.getStateCounts();
  assert(counts.length > 0, 'State counts returned');
  const outreachCount = counts.find(c => c.state === 'OUTREACH');
  assert(outreachCount && outreachCount.count >= 2, 'OUTREACH has at least 2 opportunities');

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id IN ($1, $2)', [testOppId1, testOppId2]);
  await persistence.close();
}

async function testAnalytics() {
  console.log('\n📋 Test 9: Analytics\n');

  const persistence = new LifecycleStatePersistence();

  // Get analytics
  const analytics = await persistence.getStateAnalytics();
  assert(analytics !== null, 'Analytics returned');

  // Get common paths
  const paths = await persistence.getCommonPaths(5);
  assert(Array.isArray(paths), 'Common paths is array');

  // Get transition rules
  const rules = await persistence.getTransitionRules();
  assert(rules.length >= 5, `At least 5 transition rules (found ${rules.length})`);
  assert(rules[0].rule_name !== null, 'Rules have names');
  assert(rules[0].from_state !== null, 'Rules have from_state');
  assert(rules[0].to_state !== null, 'Rules have to_state');

  await persistence.close();
}

async function testStateMachineGraph() {
  console.log('\n📋 Test 10: State Machine Graph\n');

  const engine = new LifecycleStateEngine();

  const graph = engine.getStateMachineGraph();

  assert(graph.nodes.length === 7, `Graph has 7 nodes (found ${graph.nodes.length})`);
  assert(graph.edges.length > 0, `Graph has edges (found ${graph.edges.length})`);

  // Check node structure
  const discoveredNode = graph.nodes.find(n => n.id === 'DISCOVERED');
  assert(discoveredNode !== undefined, 'DISCOVERED node exists');
  assert(discoveredNode.isEntry === true, 'DISCOVERED is entry state');
  assert(discoveredNode.color !== undefined, 'Node has color');

  const closedNode = graph.nodes.find(n => n.id === 'CLOSED');
  assert(closedNode !== undefined, 'CLOSED node exists');
  assert(closedNode.isTerminal === true, 'CLOSED is terminal state');
}

async function runCheckpoint() {
  console.log('='.repeat(70));
  console.log('CHECKPOINT 2: STATE ENGINE AND PERSISTENCE TESTS');
  console.log('='.repeat(70));

  try {
    await testEngineInitialization();
    await testStateValidation();
    await testTransitionValidation();
    await testPersistenceInitialization();
    await testStateCreation();
    await testTransitionExecution();
    await testHistoryTracking();
    await testStateQueries();
    await testAnalytics();
    await testStateMachineGraph();

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('CHECKPOINT 2 RESULTS');
    console.log('='.repeat(70));
    console.log(`Total Tests: ${testsRun}`);
    console.log(`Passed: ${testsPassed} ✅`);
    console.log(`Failed: ${testsFailed} ❌`);
    console.log(`Pass Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
    console.log('='.repeat(70));

    if (testsFailed === 0) {
      console.log('\n✅ CHECKPOINT 2: PASSED - State Engine and Persistence are ready!');
      process.exit(0);
    } else {
      console.log('\n❌ CHECKPOINT 2: FAILED - Please fix the issues above');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ CHECKPOINT 2: ERROR', error);
    process.exit(1);
  }
}

runCheckpoint();
