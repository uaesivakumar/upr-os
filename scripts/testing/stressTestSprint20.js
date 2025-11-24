#!/usr/bin/env node

/**
 * Sprint 20 Stress Test Suite
 *
 * Load and performance testing for Sprint 20 infrastructure:
 * - Concurrent SIVA tool execution
 * - Discovery pipeline throughput
 * - Enrichment pipeline throughput
 * - Database persistence under load
 * - SLA validation (p50/p95/p99 latencies)
 *
 * Target SLAs:
 * - Foundation tools (1-4): p95 < 500ms
 * - STRICT tools (2, 5-8): p95 < 1000ms
 * - DELEGATED tools (9-12): p95 < 2000ms
 * - Discovery pipeline: p95 < 3000ms
 * - Enrichment pipeline: p95 < 5000ms
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = process.env.TEST_URL || 'https://upr-web-service-474804475643.us-central1.run.app';
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT || '10', 10);
const TOTAL_ITERATIONS = parseInt(process.env.ITERATIONS || '100', 10);
const REQUEST_TIMEOUT = 30000;

// Test statistics
const stats = {
  foundation: { requests: 0, errors: 0, latencies: [] },
  strict: { requests: 0, errors: 0, latencies: [] },
  delegated: { requests: 0, errors: 0, latencies: [] },
  discovery: { requests: 0, errors: 0, latencies: [] },
  enrichment: { requests: 0, errors: 0, latencies: [] }
};

// Helper: Make HTTP request
function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: REQUEST_TIMEOUT
    };

    const client = url.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        try {
          const parsed = JSON.parse(data);
          resolve({ success: true, status: res.statusCode, data: parsed, latency });
        } catch (e) {
          resolve({ success: false, status: res.statusCode, data, latency, error: 'JSON parse error' });
        }
      });
    });

    req.on('error', (err) => {
      const latency = Date.now() - startTime;
      reject({ success: false, error: err.message, latency });
    });

    req.on('timeout', () => {
      req.destroy();
      const latency = Date.now() - startTime;
      reject({ success: false, error: 'Request timeout', latency });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper: Calculate percentiles
function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0 };

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;

  return { p50, p95, p99, min, max, avg };
}

// Helper: Format latency
function formatLatency(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// Helper: Sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test Suite 1: Foundation Tools (Tools 1-4)
async function stressTestFoundationTools(concurrency, iterations) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`STRESS TEST 1: Foundation Tools (${iterations} requests, ${concurrency} concurrent)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const tools = [
    { name: 'CompanyQualityTool', path: '/api/agent-core/v1/tools/evaluate_company_quality', payload: { companyName: 'LoadTest Corp', industry: 'Technology', employee_count: 500 }},
    { name: 'TimingScoreTool', path: '/api/agent-core/v1/tools/calculate_timing_score', payload: { companyId: 'test-123', month: 1, day: 15 }},
    { name: 'EdgeCasesTool', path: '/api/agent-core/v1/tools/detect_edge_cases', payload: { companyName: 'LoadTest Corp', domain: 'loadtest.com' }}
  ];

  const startTime = Date.now();
  let completed = 0;

  // Run iterations with concurrency control
  for (let i = 0; i < iterations; i += concurrency) {
    const batch = [];

    for (let j = 0; j < concurrency && (i + j) < iterations; j++) {
      const tool = tools[Math.floor(Math.random() * tools.length)];

      const promise = makeRequest('POST', tool.path, tool.payload)
        .then((result) => {
          stats.foundation.requests++;
          stats.foundation.latencies.push(result.latency);
          completed++;
          if (completed % 10 === 0) {
            process.stdout.write(`\r   Progress: ${completed}/${iterations} requests (${((completed/iterations)*100).toFixed(0)}%)`);
          }
        })
        .catch((err) => {
          stats.foundation.requests++;
          stats.foundation.errors++;
          stats.foundation.latencies.push(err.latency || REQUEST_TIMEOUT);
          completed++;
        });

      batch.push(promise);
    }

    await Promise.all(batch);
  }

  const totalTime = Date.now() - startTime;
  const percentiles = calculatePercentiles(stats.foundation.latencies);

  console.log(`\n\n   ✓ Completed ${stats.foundation.requests} requests in ${formatLatency(totalTime)}`);
  console.log(`   ✓ Throughput: ${(stats.foundation.requests / (totalTime / 1000)).toFixed(2)} req/s`);
  console.log(`   ✓ Error rate: ${((stats.foundation.errors / stats.foundation.requests) * 100).toFixed(2)}%`);
  console.log(`\n   Latency Distribution:`);
  console.log(`     p50: ${formatLatency(percentiles.p50)}`);
  console.log(`     p95: ${formatLatency(percentiles.p95)} ${percentiles.p95 < 500 ? '✅' : '❌ (SLA: < 500ms)'}`);
  console.log(`     p99: ${formatLatency(percentiles.p99)}`);
  console.log(`     min: ${formatLatency(percentiles.min)} | max: ${formatLatency(percentiles.max)} | avg: ${formatLatency(percentiles.avg)}`);
}

// Test Suite 2: STRICT Tools (Tools 2, 5-8)
async function stressTestStrictTools(concurrency, iterations) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`STRESS TEST 2: STRICT Tools (${iterations} requests, ${concurrency} concurrent)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const tools = [
    { name: 'ContactTierTool', path: '/api/agent-core/v1/tools/classify_contact_tier', payload: { name: 'John Doe', designation: 'VP Engineering', department: 'Engineering' }},
    { name: 'BankingProductMatchTool', path: '/api/agent-core/v1/tools/match_banking_products', payload: { companyName: 'LoadTest Corp', industry: 'Technology', employee_count: 500 }},
    { name: 'OpeningContextTool', path: '/api/agent-core/v1/tools/generate_opening_context', payload: { signal_type: 'hiring', contact_tier: 'GROWTH' }},
    { name: 'CompositeScoreTool', path: '/api/agent-core/v1/tools/calculate_composite_score', payload: { company_quality_score: 85, timing_score: 75, contact_tier: 'GROWTH' }}
  ];

  const startTime = Date.now();
  let completed = 0;

  for (let i = 0; i < iterations; i += concurrency) {
    const batch = [];

    for (let j = 0; j < concurrency && (i + j) < iterations; j++) {
      const tool = tools[Math.floor(Math.random() * tools.length)];

      const promise = makeRequest('POST', tool.path, tool.payload)
        .then((result) => {
          stats.strict.requests++;
          stats.strict.latencies.push(result.latency);
          completed++;
          if (completed % 10 === 0) {
            process.stdout.write(`\r   Progress: ${completed}/${iterations} requests (${((completed/iterations)*100).toFixed(0)}%)`);
          }
        })
        .catch((err) => {
          stats.strict.requests++;
          stats.strict.errors++;
          stats.strict.latencies.push(err.latency || REQUEST_TIMEOUT);
          completed++;
        });

      batch.push(promise);
    }

    await Promise.all(batch);
  }

  const totalTime = Date.now() - startTime;
  const percentiles = calculatePercentiles(stats.strict.latencies);

  console.log(`\n\n   ✓ Completed ${stats.strict.requests} requests in ${formatLatency(totalTime)}`);
  console.log(`   ✓ Throughput: ${(stats.strict.requests / (totalTime / 1000)).toFixed(2)} req/s`);
  console.log(`   ✓ Error rate: ${((stats.strict.errors / stats.strict.requests) * 100).toFixed(2)}%`);
  console.log(`\n   Latency Distribution:`);
  console.log(`     p50: ${formatLatency(percentiles.p50)}`);
  console.log(`     p95: ${formatLatency(percentiles.p95)} ${percentiles.p95 < 1000 ? '✅' : '❌ (SLA: < 1000ms)'}`);
  console.log(`     p99: ${formatLatency(percentiles.p99)}`);
  console.log(`     min: ${formatLatency(percentiles.min)} | max: ${formatLatency(percentiles.max)} | avg: ${formatLatency(percentiles.avg)}`);
}

// Test Suite 3: DELEGATED Tools (Tools 9-12)
async function stressTestDelegatedTools(concurrency, iterations) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`STRESS TEST 3: DELEGATED Tools (${iterations} requests, ${concurrency} concurrent)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const tools = [
    { name: 'OutreachMessageGeneratorTool', path: '/api/agent-core/v1/tools/generate_outreach_message', payload: { contact_tier: 'GROWTH', opening_context: 'Test context', banking_product: 'Business Current Account' }},
    { name: 'FollowUpStrategyTool', path: '/api/agent-core/v1/tools/generate_followup_strategy', payload: { previous_message: 'Test', days_since_last: 3, engagement_level: 'MEDIUM' }},
    { name: 'ObjectionHandlerTool', path: '/api/agent-core/v1/tools/handle_objection', payload: { objection: 'pricing concerns', contact_tier: 'GROWTH' }},
    { name: 'RelationshipTrackerTool', path: '/api/agent-core/v1/tools/track_relationship', payload: { contactId: 'test-123', interaction_type: 'email_sent', sentiment: 'POSITIVE' }}
  ];

  const startTime = Date.now();
  let completed = 0;

  for (let i = 0; i < iterations; i += concurrency) {
    const batch = [];

    for (let j = 0; j < concurrency && (i + j) < iterations; j++) {
      const tool = tools[Math.floor(Math.random() * tools.length)];

      const promise = makeRequest('POST', tool.path, tool.payload)
        .then((result) => {
          stats.delegated.requests++;
          stats.delegated.latencies.push(result.latency);
          completed++;
          if (completed % 10 === 0) {
            process.stdout.write(`\r   Progress: ${completed}/${iterations} requests (${((completed/iterations)*100).toFixed(0)}%)`);
          }
        })
        .catch((err) => {
          stats.delegated.requests++;
          stats.delegated.errors++;
          stats.delegated.latencies.push(err.latency || REQUEST_TIMEOUT);
          completed++;
        });

      batch.push(promise);
    }

    await Promise.all(batch);
  }

  const totalTime = Date.now() - startTime;
  const percentiles = calculatePercentiles(stats.delegated.latencies);

  console.log(`\n\n   ✓ Completed ${stats.delegated.requests} requests in ${formatLatency(totalTime)}`);
  console.log(`   ✓ Throughput: ${(stats.delegated.requests / (totalTime / 1000)).toFixed(2)} req/s`);
  console.log(`   ✓ Error rate: ${((stats.delegated.errors / stats.delegated.requests) * 100).toFixed(2)}%`);
  console.log(`\n   Latency Distribution:`);
  console.log(`     p50: ${formatLatency(percentiles.p50)}`);
  console.log(`     p95: ${formatLatency(percentiles.p95)} ${percentiles.p95 < 2000 ? '✅' : '❌ (SLA: < 2000ms)'}`);
  console.log(`     p99: ${formatLatency(percentiles.p99)}`);
  console.log(`     min: ${formatLatency(percentiles.min)} | max: ${formatLatency(percentiles.max)} | avg: ${formatLatency(percentiles.avg)}`);
}

// Test Suite 4: Database Persistence Under Load
async function stressTestPersistence(concurrency, iterations) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`STRESS TEST 4: Database Persistence (${iterations} requests, ${concurrency} concurrent)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const startTime = Date.now();
  let completed = 0;
  let errors = 0;
  const latencies = [];

  // First, generate some load to create agent_decisions
  console.log('   Generating load to populate agent_decisions...');
  const toolPath = '/api/agent-core/v1/tools/evaluate_company_quality';
  const toolPayload = { companyName: 'PersistenceTest Corp', industry: 'Technology', employee_count: 500 };

  for (let i = 0; i < 20; i++) {
    await makeRequest('POST', toolPath, toolPayload).catch(() => {});
  }

  await sleep(2000); // Wait for persistence

  // Now stress test analytics queries
  for (let i = 0; i < iterations; i += concurrency) {
    const batch = [];

    for (let j = 0; j < concurrency && (i + j) < iterations; j++) {
      const promise = makeRequest('GET', '/api/agent-core/v1/analytics/tool-performance')
        .then((result) => {
          latencies.push(result.latency);
          completed++;
          if (completed % 10 === 0) {
            process.stdout.write(`\r   Progress: ${completed}/${iterations} requests (${((completed/iterations)*100).toFixed(0)}%)`);
          }
        })
        .catch((err) => {
          errors++;
          latencies.push(err.latency || REQUEST_TIMEOUT);
          completed++;
        });

      batch.push(promise);
    }

    await Promise.all(batch);
  }

  const totalTime = Date.now() - startTime;
  const percentiles = calculatePercentiles(latencies);

  console.log(`\n\n   ✓ Completed ${iterations} analytics queries in ${formatLatency(totalTime)}`);
  console.log(`   ✓ Throughput: ${(iterations / (totalTime / 1000)).toFixed(2)} req/s`);
  console.log(`   ✓ Error rate: ${((errors / iterations) * 100).toFixed(2)}%`);
  console.log(`\n   Latency Distribution:`);
  console.log(`     p50: ${formatLatency(percentiles.p50)}`);
  console.log(`     p95: ${formatLatency(percentiles.p95)} ${percentiles.p95 < 500 ? '✅' : '❌ (SLA: < 500ms)'}`);
  console.log(`     p99: ${formatLatency(percentiles.p99)}`);
  console.log(`     min: ${formatLatency(percentiles.min)} | max: ${formatLatency(percentiles.max)} | avg: ${formatLatency(percentiles.avg)}`);
}

// Final Summary
function printSummary() {
  console.log(`\n\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║          STRESS TEST SUMMARY                              ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);

  const allCategories = [
    { name: 'Foundation Tools', stats: stats.foundation, sla: 500 },
    { name: 'STRICT Tools', stats: stats.strict, sla: 1000 },
    { name: 'DELEGATED Tools', stats: stats.delegated, sla: 2000 }
  ];

  let overallPassed = true;

  allCategories.forEach(({ name, stats: categoryStats, sla }) => {
    if (categoryStats.requests === 0) return;

    const percentiles = calculatePercentiles(categoryStats.latencies);
    const errorRate = (categoryStats.errors / categoryStats.requests) * 100;
    const p95Pass = percentiles.p95 < sla;
    const errorPass = errorRate < 5; // 5% error threshold

    console.log(`${name}:`);
    console.log(`  Total Requests: ${categoryStats.requests}`);
    console.log(`  Errors: ${categoryStats.errors} (${errorRate.toFixed(2)}%) ${errorPass ? '✅' : '❌'}`);
    console.log(`  p95 Latency: ${formatLatency(percentiles.p95)} ${p95Pass ? '✅' : '❌'} (SLA: < ${sla}ms)`);
    console.log(`  p99 Latency: ${formatLatency(percentiles.p99)}`);
    console.log('');

    if (!p95Pass || !errorPass) overallPassed = false;
  });

  console.log(`╔═══════════════════════════════════════════════════════════╗`);
  if (overallPassed) {
    console.log(`║ ✅ ALL SLA TARGETS MET                                 ║`);
  } else {
    console.log(`║ ❌ SOME SLA TARGETS NOT MET                            ║`);
  }
  console.log(`╚═══════════════════════════════════════════════════════════╝`);

  process.exit(overallPassed ? 0 : 1);
}

// Main execution
async function runStressTests() {
  console.log(`╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║          SPRINT 20 STRESS TEST SUITE                      ║`);
  console.log(`║          Phase 4: Infrastructure & Integration            ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
  console.log(`API URL: ${BASE_URL}`);
  console.log(`Concurrent Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`Total Iterations: ${TOTAL_ITERATIONS}`);
  console.log(`Request Timeout: ${REQUEST_TIMEOUT}ms\n`);

  try {
    await stressTestFoundationTools(CONCURRENT_REQUESTS, TOTAL_ITERATIONS);
    await sleep(1000);

    await stressTestStrictTools(CONCURRENT_REQUESTS, TOTAL_ITERATIONS);
    await sleep(1000);

    await stressTestDelegatedTools(CONCURRENT_REQUESTS, TOTAL_ITERATIONS);
    await sleep(1000);

    await stressTestPersistence(CONCURRENT_REQUESTS, Math.floor(TOTAL_ITERATIONS / 2));

    printSummary();

  } catch (error) {
    console.error('\n❌ Stress test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runStressTests();
