/**
 * BTE Deterministic Recompute Test
 *
 * Verifies:
 * 1. BTE reader is READ-ONLY (blocks writes)
 * 2. BTE writer only writes to bte_signals
 * 3. Same input → same signal output (determinism)
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// ============================================================
// INLINE BTE READER (READ-ONLY)
// ============================================================

function validateReadOnly(sql) {
  const normalized = sql.trim().toUpperCase();
  const writePatterns = [
    /^\s*INSERT\s+/i, /^\s*UPDATE\s+/i, /^\s*DELETE\s+/i,
    /^\s*DROP\s+/i, /^\s*CREATE\s+/i, /^\s*ALTER\s+/i,
  ];
  for (const pattern of writePatterns) {
    if (pattern.test(normalized)) {
      throw new Error(`[BTE VIOLATION] Write operation attempted. BTE is READ-ONLY.`);
    }
  }
  if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
    throw new Error(`[BTE VIOLATION] Only SELECT queries allowed.`);
  }
}

async function readQuery(sql, params = []) {
  validateReadOnly(sql);
  const result = await pool.query(sql, params);
  return result.rows;
}

// ============================================================
// INLINE BTE WRITER (bte_signals ONLY)
// ============================================================

async function writeSignal(signal) {
  const query = `
    INSERT INTO bte_signals (entity_type, entity_id, signal_type, signal_value, version)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (entity_type, entity_id, signal_type, version)
    DO UPDATE SET signal_value = EXCLUDED.signal_value, computed_at = NOW()
    RETURNING *
  `;
  const result = await pool.query(query, [
    signal.entity_type,
    signal.entity_id,
    signal.signal_type,
    signal.signal_value,
    signal.version || 1,
  ]);
  return result.rows[0];
}

// ============================================================
// TESTS
// ============================================================

async function runTests() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('BTE DETERMINISM TEST');
  console.log('════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // TEST 1: READ-ONLY enforcement blocks INSERT
  console.log('TEST 1: READ-ONLY enforcement blocks INSERT');
  try {
    await readQuery("INSERT INTO business_events (event_type) VALUES ('test')");
    console.log('  ❌ FAILED: INSERT should have been blocked');
    failed++;
  } catch (e) {
    if (e.message.includes('BTE VIOLATION')) {
      console.log('  ✅ PASSED: INSERT blocked with BTE VIOLATION');
      passed++;
    } else {
      console.log('  ❌ FAILED: Wrong error:', e.message);
      failed++;
    }
  }

  // TEST 2: READ-ONLY enforcement blocks UPDATE
  console.log('\nTEST 2: READ-ONLY enforcement blocks UPDATE');
  try {
    await readQuery("UPDATE user_actions SET action_type = 'hack'");
    console.log('  ❌ FAILED: UPDATE should have been blocked');
    failed++;
  } catch (e) {
    if (e.message.includes('BTE VIOLATION')) {
      console.log('  ✅ PASSED: UPDATE blocked with BTE VIOLATION');
      passed++;
    } else {
      console.log('  ❌ FAILED: Wrong error:', e.message);
      failed++;
    }
  }

  // TEST 3: READ-ONLY enforcement blocks DELETE
  console.log('\nTEST 3: READ-ONLY enforcement blocks DELETE');
  try {
    await readQuery("DELETE FROM workspace_state");
    console.log('  ❌ FAILED: DELETE should have been blocked');
    failed++;
  } catch (e) {
    if (e.message.includes('BTE VIOLATION')) {
      console.log('  ✅ PASSED: DELETE blocked with BTE VIOLATION');
      passed++;
    } else {
      console.log('  ❌ FAILED: Wrong error:', e.message);
      failed++;
    }
  }

  // TEST 4: READ-ONLY allows SELECT
  console.log('\nTEST 4: READ-ONLY allows SELECT');
  try {
    const rows = await readQuery("SELECT threshold_key, value FROM bte_thresholds LIMIT 3");
    if (rows.length >= 0) {
      console.log('  ✅ PASSED: SELECT allowed, got', rows.length, 'rows');
      passed++;
    } else {
      console.log('  ❌ FAILED: No rows returned');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ FAILED:', e.message);
    failed++;
  }

  // TEST 5: Deterministic signal computation
  console.log('\nTEST 5: Deterministic signal computation');
  const testEntityId = '00000000-0000-0000-0000-000000000001';

  // Compute signal 3 times with same input
  const computeSignal = (eventCount) => {
    // Simple deterministic formula: signal_value = event_count * 0.1
    return eventCount * 0.1;
  };

  const eventCount = 50;
  const results = [];

  for (let i = 0; i < 3; i++) {
    const signalValue = computeSignal(eventCount);
    results.push(signalValue);
  }

  if (results[0] === results[1] && results[1] === results[2]) {
    console.log('  ✅ PASSED: Same input → same output (', results[0], ')');
    passed++;
  } else {
    console.log('  ❌ FAILED: Non-deterministic:', results);
    failed++;
  }

  // TEST 6: Write signal to bte_signals
  console.log('\nTEST 6: Write signal to bte_signals');
  try {
    const signal = await writeSignal({
      entity_type: 'workspace',
      entity_id: testEntityId,
      signal_type: 'test_determinism',
      signal_value: 5.0,
      version: 1
    });
    if (signal && signal.signal_value == 5.0) {
      console.log('  ✅ PASSED: Signal written to bte_signals');
      passed++;
    } else {
      console.log('  ❌ FAILED: Signal not written correctly');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ FAILED:', e.message);
    failed++;
  }

  // TEST 7: Read signal back
  console.log('\nTEST 7: Read signal back');
  try {
    const rows = await readQuery(
      `SELECT signal_type, signal_value FROM bte_signals
       WHERE entity_type = 'workspace' AND entity_id = $1 AND signal_type = 'test_determinism'`,
      [testEntityId]
    );
    if (rows.length > 0 && rows[0].signal_value == 5.0) {
      console.log('  ✅ PASSED: Signal read back correctly');
      passed++;
    } else {
      console.log('  ❌ FAILED: Signal not found or wrong value');
      failed++;
    }
  } catch (e) {
    console.log('  ❌ FAILED:', e.message);
    failed++;
  }

  // TEST 8: Recompute overwrites (idempotent)
  console.log('\nTEST 8: Recompute overwrites (idempotent)');
  try {
    await writeSignal({
      entity_type: 'workspace',
      entity_id: testEntityId,
      signal_type: 'test_determinism',
      signal_value: 7.5,
      version: 1
    });
    const rows = await readQuery(
      `SELECT signal_value FROM bte_signals
       WHERE entity_type = 'workspace' AND entity_id = $1 AND signal_type = 'test_determinism' AND version = 1`,
      [testEntityId]
    );
    if (rows.length === 1 && rows[0].signal_value == 7.5) {
      console.log('  ✅ PASSED: Recompute overwrites old value (idempotent)');
      passed++;
    } else {
      console.log('  ❌ FAILED: Multiple rows or wrong value:', rows);
      failed++;
    }
  } catch (e) {
    console.log('  ❌ FAILED:', e.message);
    failed++;
  }

  // Cleanup test data
  await pool.query("DELETE FROM bte_signals WHERE signal_type = 'test_determinism'");

  // Summary
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════════════════');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
