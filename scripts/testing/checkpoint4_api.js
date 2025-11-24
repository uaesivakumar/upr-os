#!/usr/bin/env node
/**
 * CHECKPOINT 4: Test API and Intent Mapper
 *
 * Tests:
 * 1. Intent mapper initialization
 * 2. Intent validation
 * 3. Intent execution
 * 4. API endpoint simulation
 * 5. Batch operations
 * 6. Error handling
 */

import { LifecycleStateEngine } from '../../server/services/lifecycleStateEngine.js';
import { LifecycleStatePersistence } from '../../server/services/lifecycleStatePersistence.js';
import { OutreachIntentMapper, INTENT_MAPPINGS } from '../../server/services/outreachIntentMapper.js';

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

async function testIntentMapperInitialization() {
  console.log('\n📋 Test 1: Intent Mapper Initialization\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const mapper = new OutreachIntentMapper(engine, persistence);

  assert(mapper !== null, 'Intent mapper initialized');
  assert(typeof mapper.executeIntent === 'function', 'Has executeIntent method');
  assert(typeof mapper.validateIntent === 'function', 'Has validateIntent method');
  assert(typeof mapper.getValidIntents === 'function', 'Has getValidIntents method');

  await persistence.close();
}

async function testIntentMappings() {
  console.log('\n📋 Test 2: Intent Mappings\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const mapper = new OutreachIntentMapper(engine, persistence);

  // Check key intents exist
  const sendOutreach = mapper.getIntent('send_outreach_message');
  assert(sendOutreach !== null, 'send_outreach_message intent exists');
  assert(sendOutreach.targetState === 'OUTREACH', 'send_outreach_message targets OUTREACH');

  const logMeeting = mapper.getIntent('log_meeting');
  assert(logMeeting !== null, 'log_meeting intent exists');
  assert(logMeeting.targetState === 'ENGAGED', 'log_meeting targets ENGAGED');

  const sendProposal = mapper.getIntent('send_proposal');
  assert(sendProposal !== null, 'send_proposal intent exists');
  assert(sendProposal.targetState === 'NEGOTIATING', 'send_proposal targets NEGOTIATING');

  const markWon = mapper.getIntent('mark_as_won');
  assert(markWon !== null, 'mark_as_won intent exists');
  assert(markWon.targetState === 'CLOSED', 'mark_as_won targets CLOSED');
  assert(markWon.subState === 'WON', 'mark_as_won has WON sub-state');

  const disqualify = mapper.getIntent('disqualify');
  assert(disqualify !== null, 'disqualify intent exists');
  assert(disqualify.subState === 'DISQUALIFIED', 'disqualify has DISQUALIFIED sub-state');

  // Get all intents
  const allIntents = mapper.getAllIntents();
  assert(allIntents.length >= 20, `At least 20 intents defined (found ${allIntents.length})`);

  await persistence.close();
}

async function testIntentValidation() {
  console.log('\n📋 Test 3: Intent Validation\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const mapper = new OutreachIntentMapper(engine, persistence);

  const testOppId = '40eebc99-9c0b-4ef8-bb6d-6bb9bd380a21';

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  // Create opportunity in QUALIFIED state
  await persistence.createState({
    opportunityId: testOppId,
    state: 'QUALIFIED',
    triggerType: 'manual',
    triggerReason: 'Test'
  });

  // Valid intent from QUALIFIED
  const validIntent = await mapper.validateIntent(testOppId, 'send_outreach_message');
  assert(validIntent.valid === true, 'send_outreach_message valid from QUALIFIED');

  // Invalid intent from QUALIFIED
  const invalidIntent = await mapper.validateIntent(testOppId, 'send_proposal');
  assert(invalidIntent.valid === false, 'send_proposal invalid from QUALIFIED');

  // Unknown intent
  const unknownIntent = await mapper.validateIntent(testOppId, 'unknown_intent');
  assert(unknownIntent.valid === false, 'Unknown intent rejected');

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testIntentExecution() {
  console.log('\n📋 Test 4: Intent Execution\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const mapper = new OutreachIntentMapper(engine, persistence);

  const testOppId = '50eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  // Create opportunity in QUALIFIED state
  await persistence.createState({
    opportunityId: testOppId,
    state: 'QUALIFIED',
    triggerType: 'manual',
    triggerReason: 'Test'
  });

  // Execute intent: send_outreach_message
  const result = await mapper.executeIntent(testOppId, 'send_outreach_message', {
    reason: 'Starting outreach campaign',
    metadata: { campaign: 'test_campaign' }
  });

  assert(result.success === true, 'Intent executed successfully');
  assert(result.intent === 'send_outreach_message', 'Correct intent returned');

  // Verify state changed
  const currentState = await persistence.getCurrentState(testOppId);
  assert(currentState.state === 'OUTREACH', 'State transitioned to OUTREACH');
  assert(currentState.trigger_type === 'event', 'Trigger type is event');
  assert(currentState.metadata.intent === 'send_outreach_message', 'Intent stored in metadata');

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testGetValidIntents() {
  console.log('\n📋 Test 5: Get Valid Intents for State\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const mapper = new OutreachIntentMapper(engine, persistence);

  const testOppId = '60eebc99-9c0b-4ef8-bb6d-6bb9bd380a23';

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  // Create opportunity in OUTREACH state
  await persistence.createState({
    opportunityId: testOppId,
    state: 'OUTREACH',
    triggerType: 'manual',
    triggerReason: 'Test'
  });

  // Get valid intents
  const validIntents = await mapper.getValidIntents(testOppId);

  assert(validIntents.length > 0, `Valid intents found (${validIntents.length})`);
  assert(
    validIntents.some(i => i.name === 'log_response'),
    'log_response is valid from OUTREACH'
  );
  assert(
    validIntents.some(i => i.name === 'log_meeting'),
    'log_meeting is valid from OUTREACH'
  );
  assert(
    !validIntents.some(i => i.name === 'send_proposal'),
    'send_proposal is not valid from OUTREACH'
  );

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testIntentJourney() {
  console.log('\n📋 Test 6: Complete Intent Journey\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const mapper = new OutreachIntentMapper(engine, persistence);

  const testOppId = '70eebc99-9c0b-4ef8-bb6d-6bb9bd380a24';

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  // Journey: DISCOVERED → QUALIFIED → OUTREACH → ENGAGED → NEGOTIATING → CLOSED.WON

  // 1. Add company (DISCOVERED)
  await persistence.createState({
    opportunityId: testOppId,
    state: 'DISCOVERED',
    triggerType: 'manual',
    triggerReason: 'Test'
  });

  // 2. Qualify
  await mapper.executeIntent(testOppId, 'qualify_company');
  let state = await persistence.getCurrentState(testOppId);
  assert(state.state === 'QUALIFIED', 'Journey step 1: QUALIFIED');

  // 3. Start outreach
  await mapper.executeIntent(testOppId, 'send_outreach_message');
  state = await persistence.getCurrentState(testOppId);
  assert(state.state === 'OUTREACH', 'Journey step 2: OUTREACH');

  // 4. Log meeting
  await mapper.executeIntent(testOppId, 'log_meeting');
  state = await persistence.getCurrentState(testOppId);
  assert(state.state === 'ENGAGED', 'Journey step 3: ENGAGED');

  // 5. Send proposal
  await mapper.executeIntent(testOppId, 'send_proposal');
  state = await persistence.getCurrentState(testOppId);
  assert(state.state === 'NEGOTIATING', 'Journey step 4: NEGOTIATING');

  // 6. Close deal
  await mapper.executeIntent(testOppId, 'mark_as_won', {
    reason: 'Deal closed successfully'
  });
  state = await persistence.getCurrentState(testOppId);
  assert(state.state === 'CLOSED', 'Journey step 5: CLOSED');
  assert(state.sub_state === 'WON', 'Journey step 5: WON');

  // Check history
  const history = await persistence.getLifecycleHistory(testOppId);
  assert(history.length === 6, `Complete journey tracked (${history.length} states)`);

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testBatchIntentExecution() {
  console.log('\n📋 Test 7: Batch Intent Execution\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const mapper = new OutreachIntentMapper(engine, persistence);

  const testOppId1 = '80eebc99-9c0b-4ef8-bb6d-6bb9bd380a25';
  const testOppId2 = '81eebc99-9c0b-4ef8-bb6d-6bb9bd380a26';

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id IN ($1, $2)', [testOppId1, testOppId2]);

  // Create opportunities
  await persistence.createState({
    opportunityId: testOppId1,
    state: 'QUALIFIED',
    triggerType: 'manual',
    triggerReason: 'Test'
  });

  await persistence.createState({
    opportunityId: testOppId2,
    state: 'QUALIFIED',
    triggerType: 'manual',
    triggerReason: 'Test'
  });

  // Batch execute
  const results = await mapper.executeIntents([
    { opportunityId: testOppId1, intent: 'send_outreach_message', options: {} },
    { opportunityId: testOppId2, intent: 'send_outreach_message', options: {} }
  ]);

  assert(results.length === 2, 'Batch executed 2 intents');
  assert(results[0].success === true, 'First intent succeeded');
  assert(results[1].success === true, 'Second intent succeeded');

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id IN ($1, $2)', [testOppId1, testOppId2]);
  await persistence.close();
}

async function testIntentStatistics() {
  console.log('\n📋 Test 8: Intent Statistics\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const mapper = new OutreachIntentMapper(engine, persistence);

  // Clear history first
  mapper.clearHistory();

  const testOppId = '90eebc99-9c0b-4ef8-bb6d-6bb9bd380a27';

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  // Create opportunity
  await persistence.createState({
    opportunityId: testOppId,
    state: 'QUALIFIED',
    triggerType: 'manual',
    triggerReason: 'Test'
  });

  // Execute some intents
  await mapper.executeIntent(testOppId, 'send_outreach_message');

  // Get stats
  const stats = mapper.getIntentStats();

  assert(stats.total >= 1, `Total intents tracked (${stats.total})`);
  assert(stats.successful >= 1, `Successful intents tracked (${stats.successful})`);
  assert(stats.successRate !== '0%', 'Success rate calculated');

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function testErrorHandling() {
  console.log('\n📋 Test 9: Error Handling\n');

  const persistence = new LifecycleStatePersistence();
  const engine = new LifecycleStateEngine(persistence);
  const mapper = new OutreachIntentMapper(engine, persistence);

  const testOppId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a28';

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

  // Create opportunity in QUALIFIED state
  await persistence.createState({
    opportunityId: testOppId,
    state: 'QUALIFIED',
    triggerType: 'manual',
    triggerReason: 'Test'
  });

  // Try invalid intent
  try {
    await mapper.executeIntent(testOppId, 'send_proposal'); // Invalid from QUALIFIED
    assert(false, 'Should throw error for invalid intent');
  } catch (error) {
    assert(true, 'Invalid intent throws error');
  }

  // Try unknown intent
  try {
    await mapper.executeIntent(testOppId, 'unknown_intent');
    assert(false, 'Should throw error for unknown intent');
  } catch (error) {
    assert(true, 'Unknown intent throws error');
  }

  // Try intent requiring reason without providing it
  await persistence.pool.query('UPDATE opportunity_lifecycle SET exited_at = NOW() WHERE opportunity_id = $1 AND state = $2', [testOppId, 'QUALIFIED']);
  await persistence.createState({
    opportunityId: testOppId,
    state: 'NEGOTIATING',
    triggerType: 'manual',
    triggerReason: 'Test',
    previousState: 'QUALIFIED'
  });

  try {
    await mapper.executeIntent(testOppId, 'mark_as_won'); // Requires reason
    assert(false, 'Should throw error when reason is required but not provided');
  } catch (error) {
    assert(true, 'Missing required reason throws error');
  }

  // Clean up
  await persistence.pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
  await persistence.close();
}

async function runCheckpoint() {
  console.log('='.repeat(70));
  console.log('CHECKPOINT 4: API AND INTENT MAPPER TESTS');
  console.log('='.repeat(70));

  try {
    await testIntentMapperInitialization();
    await testIntentMappings();
    await testIntentValidation();
    await testIntentExecution();
    await testGetValidIntents();
    await testIntentJourney();
    await testBatchIntentExecution();
    await testIntentStatistics();
    await testErrorHandling();

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('CHECKPOINT 4 RESULTS');
    console.log('='.repeat(70));
    console.log(`Total Tests: ${testsRun}`);
    console.log(`Passed: ${testsPassed} ✅`);
    console.log(`Failed: ${testsFailed} ❌`);
    console.log(`Pass Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
    console.log('='.repeat(70));

    if (testsFailed === 0) {
      console.log('\n✅ CHECKPOINT 4: PASSED - API and Intent Mapper are ready!');
      process.exit(0);
    } else {
      console.log('\n❌ CHECKPOINT 4: FAILED - Please fix the issues above');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ CHECKPOINT 4: ERROR', error);
    process.exit(1);
  }
}

runCheckpoint();
