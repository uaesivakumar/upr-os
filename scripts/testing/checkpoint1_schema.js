#!/usr/bin/env node
/**
 * CHECKPOINT 1: Test Opportunity Lifecycle Database Schema
 *
 * Tests:
 * 1. Migration runs successfully
 * 2. Tables exist with correct structure
 * 3. Views are created
 * 4. Functions work correctly
 * 5. Constraints are enforced
 * 6. Indexes exist
 */

import pg from 'pg';
const { Pool } = pg;
import { readFileSync } from 'fs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

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

async function runMigration() {
  console.log('\n🔄 Running database migration...\n');
  const migration = readFileSync('./db/migrations/2025_11_18_opportunity_lifecycle.sql', 'utf-8');

  try {
    await pool.query(migration);
    console.log('✅ Migration executed successfully\n');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    return false;
  }
}

async function testTableExists() {
  console.log('📋 Test 1: Table Existence\n');

  const result = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('opportunity_lifecycle', 'lifecycle_transition_rules')
  `);

  assert(result.rows.length === 2, 'Both tables created (opportunity_lifecycle, lifecycle_transition_rules)');

  const tables = result.rows.map(r => r.table_name);
  assert(tables.includes('opportunity_lifecycle'), 'opportunity_lifecycle table exists');
  assert(tables.includes('lifecycle_transition_rules'), 'lifecycle_transition_rules table exists');
}

async function testTableStructure() {
  console.log('\n📋 Test 2: Table Structure\n');

  // Test opportunity_lifecycle columns
  const lifecycleColumns = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'opportunity_lifecycle'
    ORDER BY ordinal_position
  `);

  const expectedColumns = [
    'id', 'opportunity_id', 'state', 'sub_state', 'entered_at',
    'exited_at', 'duration_seconds', 'trigger_type', 'trigger_reason',
    'triggered_by', 'previous_state', 'next_state', 'metadata',
    'created_at', 'updated_at'
  ];

  const actualColumns = lifecycleColumns.rows.map(r => r.column_name);

  for (const col of expectedColumns) {
    assert(actualColumns.includes(col), `Column '${col}' exists in opportunity_lifecycle`);
  }

  // Test state column constraint
  const stateColumn = lifecycleColumns.rows.find(r => r.column_name === 'state');
  assert(stateColumn !== undefined, 'State column exists');
  assert(stateColumn.data_type === 'character varying', 'State is VARCHAR type');
}

async function testConstraints() {
  console.log('\n📋 Test 3: Constraints\n');

  // Test state constraint
  try {
    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type)
      VALUES (gen_random_uuid(), 'INVALID_STATE', 'manual')
    `);
    assert(false, 'State constraint prevents invalid states');
  } catch (error) {
    assert(true, 'State constraint prevents invalid states');
  }

  // Test trigger_type constraint
  try {
    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type)
      VALUES (gen_random_uuid(), 'DISCOVERED', 'invalid_type')
    `);
    assert(false, 'Trigger type constraint enforced');
  } catch (error) {
    assert(true, 'Trigger type constraint enforced');
  }

  // Clean up any test data
  await pool.query(`DELETE FROM opportunity_lifecycle WHERE state = 'INVALID_STATE' OR trigger_type = 'invalid_type'`);
}

async function testViews() {
  console.log('\n📋 Test 4: Views\n');

  // Test opportunity_current_state view
  const viewResult = await pool.query(`
    SELECT * FROM information_schema.views
    WHERE table_schema = 'public'
    AND table_name IN ('opportunity_current_state', 'lifecycle_analytics')
  `);

  assert(viewResult.rows.length === 2, 'Both views created');

  // Test view query works
  const currentStateResult = await pool.query(`SELECT * FROM opportunity_current_state LIMIT 1`);
  assert(currentStateResult !== null, 'opportunity_current_state view is queryable');

  const analyticsResult = await pool.query(`SELECT * FROM lifecycle_analytics LIMIT 1`);
  assert(analyticsResult !== null, 'lifecycle_analytics view is queryable');
}

async function testFunctions() {
  console.log('\n📋 Test 5: Functions\n');

  // Check functions exist
  const functionsResult = await pool.query(`
    SELECT routine_name
    FROM information_schema.routines
    WHERE routine_schema = 'public'
    AND routine_name IN ('get_lifecycle_history', 'get_current_state', 'update_lifecycle_updated_at')
  `);

  assert(functionsResult.rows.length === 3, 'All 3 functions created');

  // Test get_current_state function with test data
  const testOppId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; // Test UUID

  // Insert test data
  await pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, trigger_reason)
    VALUES ($1, 'DISCOVERED', 'manual', 'Test checkpoint')
  `, [testOppId]);

  // Test function
  const funcResult = await pool.query(`SELECT * FROM get_current_state($1)`, [testOppId]);
  assert(funcResult.rows.length === 1, 'get_current_state function returns result');
  assert(funcResult.rows[0].state === 'DISCOVERED', 'get_current_state returns correct state');

  // Test get_lifecycle_history function
  const historyResult = await pool.query(`SELECT * FROM get_lifecycle_history($1)`, [testOppId]);
  assert(historyResult.rows.length === 1, 'get_lifecycle_history function returns result');

  // Clean up test data
  await pool.query(`DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1`, [testOppId]);
}

async function testIndexes() {
  console.log('\n📋 Test 6: Indexes\n');

  const indexesResult = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'opportunity_lifecycle'
  `);

  const indexes = indexesResult.rows.map(r => r.indexname);

  assert(indexes.length >= 4, `At least 4 indexes created (found ${indexes.length})`);
  assert(indexes.some(idx => idx.includes('current')), 'Current state index exists');
  assert(indexes.some(idx => idx.includes('auto')), 'Auto-transition index exists');
}

async function testTransitionRules() {
  console.log('\n📋 Test 7: Transition Rules Seeded\n');

  const rulesResult = await pool.query(`SELECT COUNT(*) as count FROM lifecycle_transition_rules`);
  const count = parseInt(rulesResult.rows[0].count);

  assert(count >= 5, `At least 5 default rules seeded (found ${count})`);

  // Test specific rules exist
  const qualifiedToOutreach = await pool.query(`
    SELECT * FROM lifecycle_transition_rules
    WHERE rule_name = 'qualified_to_outreach'
  `);
  assert(qualifiedToOutreach.rows.length === 1, 'qualified_to_outreach rule exists');
  assert(qualifiedToOutreach.rows[0].from_state === 'QUALIFIED', 'Rule has correct from_state');
  assert(qualifiedToOutreach.rows[0].to_state === 'OUTREACH', 'Rule has correct to_state');

  const engagedToDormant = await pool.query(`
    SELECT * FROM lifecycle_transition_rules
    WHERE rule_name = 'engaged_to_dormant'
  `);
  assert(engagedToDormant.rows.length === 1, 'engaged_to_dormant rule exists');
}

async function testDataInsertion() {
  console.log('\n📋 Test 8: Data Insertion and Lifecycle\n');

  const testOppId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12';

  // Insert initial state
  await pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, trigger_reason, metadata)
    VALUES ($1, 'DISCOVERED', 'auto', 'New company added', '{"source": "import"}')
  `, [testOppId]);

  assert(true, 'Can insert DISCOVERED state');

  // Transition to QUALIFIED
  await pool.query(`
    UPDATE opportunity_lifecycle
    SET exited_at = NOW(), next_state = 'QUALIFIED'
    WHERE opportunity_id = $1 AND state = 'DISCOVERED' AND exited_at IS NULL
  `, [testOppId]);

  await pool.query(`
    INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, trigger_reason, previous_state, metadata)
    VALUES ($1, 'QUALIFIED', 'auto', 'Quality score: 85', 'DISCOVERED', '{"quality_score": 85}')
  `, [testOppId]);

  assert(true, 'Can transition DISCOVERED → QUALIFIED');

  // Check current state
  const currentState = await pool.query(`
    SELECT state FROM opportunity_current_state WHERE opportunity_id = $1
  `, [testOppId]);

  assert(currentState.rows[0].state === 'QUALIFIED', 'Current state is QUALIFIED');

  // Check history
  const history = await pool.query(`
    SELECT * FROM get_lifecycle_history($1)
  `, [testOppId]);

  assert(history.rows.length === 2, 'History shows 2 states');
  assert(history.rows[0].state === 'DISCOVERED', 'History first state is DISCOVERED');
  assert(history.rows[1].state === 'QUALIFIED', 'History second state is QUALIFIED');

  // Clean up
  await pool.query(`DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1`, [testOppId]);
}

async function runCheckpoint() {
  console.log('='.repeat(70));
  console.log('CHECKPOINT 1: DATABASE SCHEMA TESTS');
  console.log('='.repeat(70));

  try {
    // Run migration
    const migrationSuccess = await runMigration();
    if (!migrationSuccess) {
      console.error('\n❌ Migration failed - cannot continue tests');
      process.exit(1);
    }

    // Run all tests
    await testTableExists();
    await testTableStructure();
    await testConstraints();
    await testViews();
    await testFunctions();
    await testIndexes();
    await testTransitionRules();
    await testDataInsertion();

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('CHECKPOINT 1 RESULTS');
    console.log('='.repeat(70));
    console.log(`Total Tests: ${testsRun}`);
    console.log(`Passed: ${testsPassed} ✅`);
    console.log(`Failed: ${testsFailed} ❌`);
    console.log(`Pass Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
    console.log('='.repeat(70));

    if (testsFailed === 0) {
      console.log('\n✅ CHECKPOINT 1: PASSED - Database schema is ready!');
      process.exit(0);
    } else {
      console.log('\n❌ CHECKPOINT 1: FAILED - Please fix the issues above');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ CHECKPOINT 1: ERROR', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runCheckpoint();
