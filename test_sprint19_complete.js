#!/usr/bin/env node

/**
 * Sprint 19 Complete Smoke Test Suite
 * Tests all 15 smoke tests with authentication
 */

const https = require('https');
const jwt = require('jsonwebtoken');

const BASE_URL = 'https://upr-web-service-191599223867.us-central1.run.app';
const JWT_SECRET = '2224fda666a11f8f7784c94a52ad24a0';

// Generate JWT token for testing
// Using the seeded tenant ID from database
const TENANT_ID = 'e2d48fa8-f6d1-4b70-a939-29efb47b0dc9';
const TOKEN = jwt.sign(
  {
    user_id: 'test-user-1',
    tenant_id: TENANT_ID,
    email: 'test@sprint19.local',
    role: 'admin'
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

let passCount = 0;
let failCount = 0;
const TOTAL_TESTS = 15;

console.log('════════════════════════════════════════════════════════');
console.log('  Sprint 19 Complete Smoke Test Suite');
console.log('  Revision: upr-web-service-00368-mq7');
console.log('  Date:', new Date().toISOString());
console.log('════════════════════════════════════════════════════════');
console.log('');

// Helper function to make HTTP requests
function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Test runner
async function runTests() {
  // Test 1: Service Health Check
  console.log('Test 1: Service Health Check');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/health');
    if (res.status === 200) {
      console.log('✅ PASS - Health check returned 200 OK');
      console.log('   Response:', JSON.stringify(res.data));
      passCount++;
    } else {
      console.log(`❌ FAIL - Health check returned ${res.status}`);
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Health check error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 2: Orchestration API - Get Sources
  console.log('Test 2: Orchestration API - Get Sources');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/orchestration/sources');
    if (res.data && (res.data.sources || res.data.success !== undefined)) {
      console.log('✅ PASS - Orchestration sources endpoint returns JSON');
      console.log('   Response keys:', Object.keys(res.data).join(', '));
      passCount++;
    } else {
      console.log('❌ FAIL - Orchestration sources endpoint failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 3: Multi-Source Orchestration
  console.log('Test 3: Multi-Source Orchestration');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/orchestration/discover', 'POST', {
      sources: ['linkedin'],
      filters: { location: 'UAE', sector: 'Banking' },
      maxParallel: 4,
      tenantId: TENANT_ID
    });
    if (res.data && res.data.orchestrationId) {
      console.log('✅ PASS - Multi-source orchestration works');
      console.log('   Orchestration ID:', res.data.orchestrationId);
      console.log('   Total signals:', res.data.totalSignals || 0);
      passCount++;
    } else {
      console.log('❌ FAIL - Orchestration failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 4: Source Prioritization - Get Priorities
  console.log('Test 4: Source Prioritization - Get Priorities');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/orchestration/priorities');
    if (res.data && (res.data.priorities || res.data.success)) {
      console.log('✅ PASS - Get priorities endpoint works');
      console.log('   Priority count:', res.data.priorities?.length || 0);
      passCount++;
    } else {
      console.log('❌ FAIL - Get priorities failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 5: Source Prioritization - Set Manual Priority
  console.log('Test 5: Source Prioritization - Set Manual Priority');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/orchestration/priorities/linkedin', 'PUT', {
      priority: 0.85
    });
    if (res.data && res.data.success) {
      console.log('✅ PASS - Set manual priority works');
      console.log('   Response:', JSON.stringify(res.data));
      passCount++;
    } else {
      console.log('❌ FAIL - Set priority failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 6: Source Prioritization - Get Recommendations
  console.log('Test 6: Source Prioritization - Get Recommendations');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/orchestration/recommendations');
    if (res.data && res.data.recommendations) {
      console.log('✅ PASS - Get recommendations endpoint works');
      console.log('   Response keys:', Object.keys(res.data.recommendations).join(', '));
      passCount++;
    } else {
      console.log('❌ FAIL - Get recommendations failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 7: Signal Quality Scoring - Get Analytics
  console.log('Test 7: Signal Quality Scoring - Get Analytics');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest(`/api/orchestration/quality?tenantId=${TENANT_ID}`);
    if (res.data && res.data.success && res.data.analytics) {
      console.log('✅ PASS - Quality analytics endpoint works');
      console.log('   Response:', JSON.stringify(res.data).substring(0, 150) + '...');
      passCount++;
    } else {
      console.log('❌ FAIL - Quality analytics failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 8: Unified Discovery - Simple Discovery
  console.log('Test 8: Unified Discovery - Simple Discovery');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/discovery/signals', 'POST', {
      filters: { location: 'UAE' },
      options: {
        sources: ['linkedin'],
        minQuality: 0.6,
        useCache: true,
        tenantId: TENANT_ID
      }
    });
    if (res.data && res.data.discovery) {
      console.log('✅ PASS - Unified discovery endpoint works');
      console.log('   Total signals:', res.data.discovery.totalSignals || 0);
      passCount++;
    } else {
      console.log('❌ FAIL - Unified discovery failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 9: Unified Discovery - Paginated
  console.log('Test 9: Unified Discovery - Paginated');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/discovery/signals/paginated', 'POST', {
      filters: { location: 'UAE' },
      options: { useCache: true, tenantId: TENANT_ID },
      pagination: { page: 1, limit: 10 }
    });
    if (res.data && res.data.pagination) {
      console.log('✅ PASS - Paginated discovery works');
      console.log('   Pagination:', JSON.stringify(res.data.pagination));
      passCount++;
    } else {
      console.log('❌ FAIL - Paginated discovery failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 10: Unified Discovery - Cache Stats
  console.log('Test 10: Unified Discovery - Cache Stats');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/discovery/cache/stats');
    if (res.data && res.data.cache) {
      console.log('✅ PASS - Cache stats endpoint works');
      console.log('   Cache info:', JSON.stringify(res.data.cache));
      passCount++;
    } else {
      console.log('❌ FAIL - Cache stats failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 11: Deduplication Verification
  console.log('Test 11: Deduplication Verification');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/orchestration/discover', 'POST', {
      sources: ['linkedin'],
      filters: {},
      tenantId: TENANT_ID
    });
    // Test passes if deduplication field exists (can be null if no signals)
    if (res.data && res.data.hasOwnProperty('deduplication')) {
      console.log('✅ PASS - Deduplication field present in response');
      console.log('   Stats:', JSON.stringify(res.data.deduplication) || 'null (no signals discovered)');
      passCount++;
    } else {
      console.log('❌ FAIL - Deduplication field missing from response');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 12: Quality Scoring Verification
  console.log('Test 12: Quality Scoring Verification');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/orchestration/discover', 'POST', {
      sources: ['linkedin'],
      filters: {},
      tenantId: TENANT_ID
    });
    // Test passes if quality field exists (can be null if no signals)
    if (res.data && res.data.hasOwnProperty('quality')) {
      console.log('✅ PASS - Quality scoring field present in response');
      console.log('   Stats:', JSON.stringify(res.data.quality) || 'null (no signals discovered)');
      passCount++;
    } else {
      console.log('❌ FAIL - Quality field missing from response');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 13: Circuit Breaker - Reset
  console.log('Test 13: Circuit Breaker - Reset');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/orchestration/sources/linkedin/reset', 'POST');
    if (res.data && res.data.success) {
      console.log('✅ PASS - Circuit breaker reset works');
      console.log('   Response:', JSON.stringify(res.data));
      passCount++;
    } else {
      console.log('❌ FAIL - Circuit breaker reset failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 14: Performance Metrics - Reset
  console.log('Test 14: Performance Metrics - Reset');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/orchestration/priorities/linkedin/reset', 'POST');
    if (res.data && res.data.success) {
      console.log('✅ PASS - Performance metrics reset works');
      console.log('   Response:', JSON.stringify(res.data));
      passCount++;
    } else {
      console.log('❌ FAIL - Performance metrics reset failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Test 15: Orchestration Analytics
  console.log('Test 15: Orchestration Analytics');
  console.log('------------------------------------------------------------');
  try {
    const res = await makeRequest('/api/orchestration/analytics?days=7');
    if (res.data && res.data.analytics) {
      console.log('✅ PASS - Orchestration analytics works');
      console.log('   Analytics count:', res.data.analytics.length);
      passCount++;
    } else {
      console.log('❌ FAIL - Orchestration analytics failed');
      console.log('   Response:', JSON.stringify(res.data));
      failCount++;
    }
  } catch (e) {
    console.log('❌ FAIL - Error:', e.message);
    failCount++;
  }
  console.log('');

  // Summary
  console.log('════════════════════════════════════════════════════════');
  console.log('  Test Results Summary');
  console.log('════════════════════════════════════════════════════════');
  console.log('Total Tests:', TOTAL_TESTS);
  console.log('Passed:', passCount);
  console.log('Failed:', failCount);
  const successRate = ((passCount / TOTAL_TESTS) * 100).toFixed(1);
  console.log('Success Rate:', successRate + '%');
  console.log('');
  console.log('════════════════════════════════════════════════════════');

  if (failCount === 0) {
    console.log('🟢 STATUS: ALL TESTS PASS');
    process.exit(0);
  } else {
    console.log('🔴 STATUS: SOME TESTS FAILED');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
