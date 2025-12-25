/**
 * Super Admin API Test
 *
 * S264 Validation:
 * 1. Non-SUPER_ADMIN cannot access APIs
 * 2. All responses are aggregate-level by default
 * 3. BTE is the sole source of behavioral insight
 * 4. Persona mutation is OS-only and audited
 * 5. Drill-down requires explicit intent
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test IDs (valid UUID format)
const SUPER_ADMIN_ID = 'a0000001-b001-c001-d001-e00000000001';
const REGULAR_USER_ID = 'a0000002-b002-c002-d002-e00000000002';
const TEST_ENTERPRISE_ID = 'a0000003-b003-c003-d003-e00000000003';
const TEST_WORKSPACE_ID = 'a0000004-b004-c004-d004-e00000000004';
const TEST_SUB_VERTICAL_ID = 'a0000005-b005-c005-d005-e00000000005';

// Mock request/response
function mockRequest(userId, url, query = {}, body = {}, params = {}) {
  return {
    headers: { 'x-os-user-id': userId },
    originalUrl: url,
    url,
    query,
    body,
    params,
  };
}

function mockResponse() {
  const res = {
    statusCode: 200,
    data: null,
  };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.data = data;
    return res;
  };
  return res;
}

// ============================================================
// SETUP
// ============================================================

async function setup() {
  console.log('Setting up test data...');

  // Create test enterprise
  await pool.query(`
    INSERT INTO enterprises (enterprise_id, name, type, region, status)
    VALUES ($1, 'Test Enterprise', 'REAL', 'UAE', 'ACTIVE')
    ON CONFLICT (enterprise_id) DO NOTHING
  `, [TEST_ENTERPRISE_ID]);

  // Create test workspace
  await pool.query(`
    INSERT INTO workspaces (workspace_id, enterprise_id, name, sub_vertical_id, status)
    VALUES ($1, $2, 'Test Workspace', $3, 'ACTIVE')
    ON CONFLICT (workspace_id) DO NOTHING
  `, [TEST_WORKSPACE_ID, TEST_ENTERPRISE_ID, TEST_SUB_VERTICAL_ID]);

  // Create Super Admin user
  await pool.query(`
    INSERT INTO os_user_identities (user_id, enterprise_id, workspace_id, sub_vertical_id, role, mode, status)
    VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'REAL', 'ACTIVE')
    ON CONFLICT (user_id) DO NOTHING
  `, [SUPER_ADMIN_ID, TEST_ENTERPRISE_ID, TEST_WORKSPACE_ID, TEST_SUB_VERTICAL_ID]);

  // Create regular user
  await pool.query(`
    INSERT INTO os_user_identities (user_id, enterprise_id, workspace_id, sub_vertical_id, role, mode, status)
    VALUES ($1, $2, $3, $4, 'USER', 'REAL', 'ACTIVE')
    ON CONFLICT (user_id) DO NOTHING
  `, [REGULAR_USER_ID, TEST_ENTERPRISE_ID, TEST_WORKSPACE_ID, TEST_SUB_VERTICAL_ID]);

  console.log('Test data created.');
}

// ============================================================
// TESTS
// ============================================================

async function runTests() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('S264 SUPER ADMIN API VALIDATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Import middleware
  const { requireSuperAdmin, requireDrillDownIntent, resolveUserIdentity } = await import('../middleware/superadmin-auth.js');

  // TEST 1: Non-SUPER_ADMIN cannot access APIs
  console.log('TEST 1: Non-SUPER_ADMIN access denied');
  {
    const req = mockRequest(REGULAR_USER_ID, '/api/os/superadmin/enterprises/health');
    const res = mockResponse();
    let nextCalled = false;

    await requireSuperAdmin(req, res, () => { nextCalled = true; });

    if (res.statusCode === 403 && res.data?.error === 'FORBIDDEN' && !nextCalled) {
      console.log('  ✅ PASSED: Regular user denied with 403 FORBIDDEN');
      passed++;
    } else {
      console.log('  ❌ FAILED: Expected 403 FORBIDDEN, got', res.statusCode, res.data);
      failed++;
    }
  }

  // TEST 2: SUPER_ADMIN can access APIs
  console.log('\nTEST 2: SUPER_ADMIN access granted');
  {
    const req = mockRequest(SUPER_ADMIN_ID, '/api/os/superadmin/enterprises/health');
    const res = mockResponse();
    let nextCalled = false;

    await requireSuperAdmin(req, res, () => { nextCalled = true; });

    if (nextCalled && req.superAdmin?.role === 'SUPER_ADMIN') {
      console.log('  ✅ PASSED: Super Admin access granted');
      passed++;
    } else {
      console.log('  ❌ FAILED: Super Admin should have access');
      failed++;
    }
  }

  // TEST 3: Missing user identity denied
  console.log('\nTEST 3: Missing user identity denied');
  {
    const req = mockRequest(null, '/api/os/superadmin/enterprises/health');
    const res = mockResponse();
    let nextCalled = false;

    await requireSuperAdmin(req, res, () => { nextCalled = true; });

    if (res.statusCode === 401 && res.data?.error === 'UNAUTHORIZED' && !nextCalled) {
      console.log('  ✅ PASSED: Missing identity denied with 401');
      passed++;
    } else {
      console.log('  ❌ FAILED: Expected 401, got', res.statusCode);
      failed++;
    }
  }

  // TEST 4: Drill-down requires intent
  console.log('\nTEST 4: Drill-down requires explicit intent');
  {
    const req = mockRequest(SUPER_ADMIN_ID, '/api/os/superadmin/drill-down/enterprise/123');
    req.superAdmin = { user_id: SUPER_ADMIN_ID, role: 'SUPER_ADMIN' };
    const res = mockResponse();
    let nextCalled = false;

    await requireDrillDownIntent(req, res, () => { nextCalled = true; });

    if (res.statusCode === 400 && res.data?.error === 'INTENT_REQUIRED' && !nextCalled) {
      console.log('  ✅ PASSED: Missing intent denied with 400');
      passed++;
    } else {
      console.log('  ❌ FAILED: Expected 400 INTENT_REQUIRED');
      failed++;
    }
  }

  // TEST 5: Drill-down with intent allowed
  console.log('\nTEST 5: Drill-down with ?intent=investigate allowed');
  {
    const req = mockRequest(SUPER_ADMIN_ID, '/api/os/superadmin/drill-down/enterprise/123?intent=investigate', { intent: 'investigate' });
    req.superAdmin = { user_id: SUPER_ADMIN_ID, role: 'SUPER_ADMIN' };
    req.params = { enterprise_id: '123' };
    const res = mockResponse();
    let nextCalled = false;

    await requireDrillDownIntent(req, res, () => { nextCalled = true; });

    if (nextCalled) {
      console.log('  ✅ PASSED: Drill-down with intent allowed');
      passed++;
    } else {
      console.log('  ❌ FAILED: Drill-down with intent should be allowed');
      failed++;
    }
  }

  // TEST 6: User identity resolution
  console.log('\nTEST 6: User identity resolution');
  {
    const req = mockRequest(SUPER_ADMIN_ID, '/test');
    const user = await resolveUserIdentity(req);

    if (user && user.role === 'SUPER_ADMIN' && user.user_id === SUPER_ADMIN_ID) {
      console.log('  ✅ PASSED: User identity resolved correctly');
      passed++;
    } else {
      console.log('  ❌ FAILED: User identity not resolved');
      failed++;
    }
  }

  // Summary
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('════════════════════════════════════════════════════════════════');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  try {
    await setup();
    await runTests();
  } catch (error) {
    console.error('Test error:', error);
    await pool.end();
    process.exit(1);
  }
}

main();
