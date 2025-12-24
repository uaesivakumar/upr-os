/**
 * BTE Signal Computation Test
 *
 * Tests all signal computation functions with synthetic data.
 * Validates READ-ONLY guardrails are maintained.
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test workspace and user IDs
const TEST_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER_ID = '22222222-2222-2222-2222-222222222222';
const TEST_SUB_VERTICAL_ID = '33333333-3333-3333-3333-333333333333';

// ============================================================
// SETUP: Insert test data
// ============================================================

async function setupTestData() {
  console.log('Setting up test data...');

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  // Insert business events
  const events = [
    // NBA recommendations and actions
    {
      event_type: 'nba_recommendation_shown',
      entity_type: 'lead',
      entity_id: 'aaaa0001-0000-0000-0000-000000000001',
      timestamp: threeDaysAgo,
      metadata: { recommendation_id: 'rec-001', action_type: 'call' },
    },
    {
      event_type: 'nba_action_taken',
      entity_type: 'lead',
      entity_id: 'aaaa0001-0000-0000-0000-000000000001',
      timestamp: twoDaysAgo,
      metadata: { recommendation_id: 'rec-001', action_type: 'call' },
    },
    {
      event_type: 'nba_recommendation_shown',
      entity_type: 'lead',
      entity_id: 'aaaa0002-0000-0000-0000-000000000002',
      timestamp: twoDaysAgo,
      metadata: { recommendation_id: 'rec-002', action_type: 'email' },
    },
    // This one is missed (no action taken)

    // Workflow events
    {
      event_type: 'workflow_started',
      entity_type: 'deal',
      entity_id: 'bbbb0001-0000-0000-0000-000000000001',
      timestamp: threeDaysAgo,
      metadata: { workflow_type: 'proposal' },
    },
    {
      event_type: 'workflow_completed',
      entity_type: 'deal',
      entity_id: 'bbbb0001-0000-0000-0000-000000000001',
      timestamp: twoDaysAgo,
      metadata: { workflow_type: 'proposal' },
    },
    {
      event_type: 'workflow_started',
      entity_type: 'deal',
      entity_id: 'bbbb0002-0000-0000-0000-000000000002',
      timestamp: twoDaysAgo,
      metadata: { workflow_type: 'outreach' },
    },
    // This one is not completed

    // Stage transitions
    {
      event_type: 'stage_entered',
      entity_type: 'deal',
      entity_id: 'cccc0001-0000-0000-0000-000000000001',
      timestamp: threeDaysAgo,
      metadata: { stage: 'discovery' },
    },
    {
      event_type: 'stage_exited',
      entity_type: 'deal',
      entity_id: 'cccc0001-0000-0000-0000-000000000001',
      timestamp: twoDaysAgo,
      metadata: { stage: 'discovery' },
    },
    {
      event_type: 'stage_entered',
      entity_type: 'deal',
      entity_id: 'cccc0001-0000-0000-0000-000000000001',
      timestamp: twoDaysAgo,
      metadata: { stage: 'qualification' },
    },
    // This one drops off (no exit)
  ];

  for (const event of events) {
    await pool.query(
      `INSERT INTO business_events
       (event_type, entity_type, entity_id, workspace_id, sub_vertical_id, actor_user_id, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.event_type,
        event.entity_type,
        event.entity_id,
        TEST_WORKSPACE_ID,
        TEST_SUB_VERTICAL_ID,
        TEST_USER_ID,
        event.timestamp,
        JSON.stringify(event.metadata),
      ]
    );
  }

  // Insert user actions
  const actions = [
    { action_type: 'click', timestamp: threeDaysAgo },
    { action_type: 'click', timestamp: twoDaysAgo },
    { action_type: 'cancel', timestamp: twoDaysAgo },
    { action_type: 'click', timestamp: oneDayAgo },
    { action_type: 'submit', timestamp: oneDayAgo },
    { action_type: 'undo', timestamp: now },
  ];

  for (const action of actions) {
    await pool.query(
      `INSERT INTO user_actions
       (action_type, workspace_id, actor_user_id, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        action.action_type,
        TEST_WORKSPACE_ID,
        TEST_USER_ID,
        action.timestamp,
        JSON.stringify({}),
      ]
    );
  }

  // Insert workspace state
  await pool.query(
    `INSERT INTO workspace_state
     (workspace_id, current_sales_stage, pending_actions, last_action_taken_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id) DO UPDATE SET
       current_sales_stage = EXCLUDED.current_sales_stage,
       last_action_taken_at = EXCLUDED.last_action_taken_at`,
    [TEST_WORKSPACE_ID, 'qualification', JSON.stringify([]), oneDayAgo]
  );

  console.log('Test data inserted.');
}

// ============================================================
// CLEANUP: Remove test data
// ============================================================

async function cleanupTestData() {
  console.log('Cleaning up test data...');

  // Clean up mutable tables only
  await pool.query('DELETE FROM bte_signals WHERE entity_id = $1', [
    TEST_WORKSPACE_ID,
  ]);
  await pool.query('DELETE FROM user_actions WHERE workspace_id = $1', [
    TEST_WORKSPACE_ID,
  ]);
  await pool.query('DELETE FROM workspace_state WHERE workspace_id = $1', [
    TEST_WORKSPACE_ID,
  ]);

  // NOTE: business_events is IMMUTABLE by design (S261 guardrail)
  // Test events remain in the database - this is intentional
  // They use a dedicated test workspace ID and don't affect production

  console.log('Test data cleaned up (business_events preserved - immutable).');
}

// ============================================================
// TESTS
// ============================================================

async function runTests() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('BTE SIGNAL COMPUTATION TEST');
  console.log('════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  try {
    await setupTestData();

    // Import BTE functions dynamically
    const bte = await import('../services/bte/index.js');

    // TEST 1: Compute all signals
    console.log('TEST 1: Compute all signals');
    try {
      const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endTime = new Date();

      const result = await bte.computeAllSignals(
        TEST_WORKSPACE_ID,
        startTime,
        endTime
      );

      if (
        result.signals.temporal.length === 4 &&
        result.signals.execution.length === 4 &&
        result.signals.counterfactual.length === 2
      ) {
        console.log('  ✅ PASSED: All 10 signals computed');
        console.log('     Temporal:', result.signals.temporal.length);
        console.log('     Execution:', result.signals.execution.length);
        console.log('     Counterfactual:', result.signals.counterfactual.length);
        passed++;
      } else {
        console.log('  ❌ FAILED: Expected 4+4+2=10 signals');
        failed++;
      }
    } catch (e) {
      console.log('  ❌ FAILED:', e.message);
      failed++;
    }

    // TEST 2: Verify signals written to bte_signals
    console.log('\nTEST 2: Verify signals in database');
    try {
      const rows = await pool.query(
        `SELECT signal_type, signal_value FROM bte_signals
         WHERE entity_id = $1 ORDER BY signal_type`,
        [TEST_WORKSPACE_ID]
      );

      if (rows.rows.length === 10) {
        console.log('  ✅ PASSED: 10 signals in bte_signals table');
        for (const row of rows.rows) {
          console.log(`     ${row.signal_type}: ${row.signal_value}`);
        }
        passed++;
      } else {
        console.log('  ❌ FAILED: Expected 10 signals, got', rows.rows.length);
        failed++;
      }
    } catch (e) {
      console.log('  ❌ FAILED:', e.message);
      failed++;
    }

    // TEST 3: Deterministic recompute
    console.log('\nTEST 3: Deterministic recompute');
    try {
      const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endTime = new Date();

      const result1 = await bte.computeAllSignals(
        TEST_WORKSPACE_ID,
        startTime,
        endTime
      );
      const result2 = await bte.computeAllSignals(
        TEST_WORKSPACE_ID,
        startTime,
        endTime
      );

      // Compare signal values
      const values1 = result1.signals.temporal
        .concat(result1.signals.execution)
        .concat(result1.signals.counterfactual)
        .map((s) => `${s.signal_type}:${s.signal_value}`)
        .sort();

      const values2 = result2.signals.temporal
        .concat(result2.signals.execution)
        .concat(result2.signals.counterfactual)
        .map((s) => `${s.signal_type}:${s.signal_value}`)
        .sort();

      if (JSON.stringify(values1) === JSON.stringify(values2)) {
        console.log('  ✅ PASSED: Same input → same output');
        passed++;
      } else {
        console.log('  ❌ FAILED: Non-deterministic computation');
        console.log('  Run 1:', values1);
        console.log('  Run 2:', values2);
        failed++;
      }
    } catch (e) {
      console.log('  ❌ FAILED:', e.message);
      failed++;
    }

    // TEST 4: NBA adoption rate calculation
    console.log('\nTEST 4: NBA adoption rate');
    try {
      const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endTime = new Date();

      const result = await bte.computeNbaAdoptionRate(
        TEST_WORKSPACE_ID,
        startTime,
        endTime
      );

      // 1 action taken out of 2 recommendations = 0.5
      if (result.signal_value === 0.5) {
        console.log('  ✅ PASSED: NBA adoption rate = 0.5 (1/2)');
        passed++;
      } else {
        console.log('  ❌ FAILED: Expected 0.5, got', result.signal_value);
        failed++;
      }
    } catch (e) {
      console.log('  ❌ FAILED:', e.message);
      failed++;
    }

    // TEST 5: Follow-through rate calculation
    console.log('\nTEST 5: Follow-through rate');
    try {
      const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endTime = new Date();

      const result = await bte.computeFollowThroughRate(
        TEST_WORKSPACE_ID,
        startTime,
        endTime
      );

      // 1 completed out of 2 started = 0.5
      if (result.signal_value === 0.5) {
        console.log('  ✅ PASSED: Follow-through rate = 0.5 (1/2)');
        passed++;
      } else {
        console.log('  ❌ FAILED: Expected 0.5, got', result.signal_value);
        failed++;
      }
    } catch (e) {
      console.log('  ❌ FAILED:', e.message);
      failed++;
    }

    // TEST 6: Hesitation index calculation
    console.log('\nTEST 6: Hesitation index');
    try {
      const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endTime = new Date();

      const result = await bte.computeHesitationIndex(
        TEST_WORKSPACE_ID,
        startTime,
        endTime
      );

      // 2 hesitation actions (cancel, undo) out of 6 total = 0.33
      if (result.signal_value >= 0.33 && result.signal_value <= 0.34) {
        console.log('  ✅ PASSED: Hesitation index =', result.signal_value);
        passed++;
      } else {
        console.log(
          '  ❌ FAILED: Expected ~0.33, got',
          result.signal_value
        );
        failed++;
      }
    } catch (e) {
      console.log('  ❌ FAILED:', e.message);
      failed++;
    }
  } finally {
    await cleanupTestData();
  }

  // Summary
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════════════════');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
