/**
 * SIVA Phase 12 - Stress Test Suite
 *
 * Tests performance and reliability under concurrent load
 */

// Use Node's built-in fetch (Node 18+)
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const BASE_URL = process.env.CLOUD_RUN_URL || 'https://upr-web-service-191599223867.us-central1.run.app';
const ENRICH_ENDPOINT = `${BASE_URL}/api/enrich/contacts`;

// Stress test configuration
const STRESS_CONFIG = {
  concurrent_requests: 20, // Number of concurrent requests
  batch_size: 10, // Leads per request
  iterations: 3, // Number of test iterations
  timeout: 30000 // Request timeout (30s)
};

// Sample lead data generator
function generateTestLead(index) {
  const titles = [
    'Chief Human Resources Officer',
    'Head of Talent Acquisition',
    'HR Manager',
    'Recruitment Lead',
    'HR Coordinator',
    'VP of People',
    'Director of HR'
  ];

  const companies = [
    { name: 'Emirates NBD', domain: 'emiratesnbd.com', industry: 'Banking', size: 5000 },
    { name: 'Dubai Islamic Bank', domain: 'dib.ae', industry: 'Banking', size: 3000 },
    { name: 'Tech Startup DMCC', domain: 'techstartup.ae', industry: 'Technology', size: 150 },
    { name: 'Retail Corp', domain: 'retailcorp.ae', industry: 'Retail', size: 500 },
    { name: 'Financial Services LLC', domain: 'finservices.ae', industry: 'Finance', size: 800 }
  ];

  const company = companies[index % companies.length];
  const title = titles[index % titles.length];

  return {
    domain: company.domain,
    company: {
      id: `stress-test-${index}`,
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      size: company.size,
      locations: ['Dubai, UAE']
    },
    contacts: Array.from({ length: STRESS_CONFIG.batch_size }, (_, i) => ({
      name: `Test Contact ${index}-${i}`,
      designation: title,
      linkedin_url: `https://linkedin.com/in/test-${index}-${i}`,
      email_status: 'unknown'
    }))
  };
}

// Metrics tracker
const metrics = {
  total_requests: 0,
  successful: 0,
  failed: 0,
  timeouts: 0,
  errors: [],
  response_times: [],
  leads_processed: 0,
  siva_scoring_used: 0,
  fallback_used: 0
};

/**
 * Execute a single request
 */
async function executeRequest(requestId, testData) {
  const started = Date.now();

  try {
    const response = await Promise.race([
      fetch(ENRICH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), STRESS_CONFIG.timeout)
      )
    ]);

    const elapsed = Date.now() - started;
    metrics.response_times.push(elapsed);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.ok || !data.data || !data.data.results) {
      throw new Error('Invalid response structure');
    }

    // Track SIVA usage
    data.data.results.forEach(lead => {
      metrics.leads_processed++;
      if (lead.siva_source === 'siva_phase12') {
        metrics.siva_scoring_used++;
      } else {
        metrics.fallback_used++;
      }
    });

    metrics.successful++;
    return { success: true, elapsed, leads: data.data.results.length };

  } catch (error) {
    const elapsed = Date.now() - started;

    if (error.message === 'Timeout') {
      metrics.timeouts++;
    } else {
      metrics.failed++;
      metrics.errors.push({
        requestId,
        error: error.message,
        elapsed
      });
    }

    return { success: false, error: error.message, elapsed };
  }
}

/**
 * Run concurrent batch of requests
 */
async function runConcurrentBatch(batchNumber) {
  console.log(`\n📦 Batch ${batchNumber}: Launching ${STRESS_CONFIG.concurrent_requests} concurrent requests...`);

  const requests = Array.from({ length: STRESS_CONFIG.concurrent_requests }, (_, i) => {
    const requestId = `batch${batchNumber}-req${i}`;
    const testData = generateTestLead(batchNumber * STRESS_CONFIG.concurrent_requests + i);
    return executeRequest(requestId, testData);
  });

  const started = Date.now();
  const results = await Promise.all(requests);
  const batchTime = Date.now() - started;

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`   ✅ Success: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏱️  Batch Time: ${batchTime}ms`);

  metrics.total_requests += STRESS_CONFIG.concurrent_requests;

  return { successful, failed, batchTime };
}

/**
 * Calculate and display statistics
 */
function displayStatistics() {
  console.log('\n');
  console.log('━'.repeat(60));
  console.log('📊 Stress Test Results');
  console.log('━'.repeat(60));

  // Request statistics
  console.log('\n📈 Request Statistics:');
  console.log(`   Total Requests: ${metrics.total_requests}`);
  console.log(`   Successful: ${metrics.successful} (${((metrics.successful / metrics.total_requests) * 100).toFixed(1)}%)`);
  console.log(`   Failed: ${metrics.failed} (${((metrics.failed / metrics.total_requests) * 100).toFixed(1)}%)`);
  console.log(`   Timeouts: ${metrics.timeouts} (${((metrics.timeouts / metrics.total_requests) * 100).toFixed(1)}%)`);

  // Lead processing statistics
  console.log('\n👥 Lead Processing:');
  console.log(`   Total Leads: ${metrics.leads_processed}`);
  console.log(`   SIVA Scoring: ${metrics.siva_scoring_used} (${((metrics.siva_scoring_used / metrics.leads_processed) * 100).toFixed(1)}%)`);
  console.log(`   Fallback: ${metrics.fallback_used} (${((metrics.fallback_used / metrics.leads_processed) * 100).toFixed(1)}%)`);

  // Performance statistics
  if (metrics.response_times.length > 0) {
    const sorted = [...metrics.response_times].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    console.log('\n⏱️  Response Time Distribution:');
    console.log(`   Average: ${avg.toFixed(0)}ms`);
    console.log(`   Median (p50): ${p50}ms`);
    console.log(`   p95: ${p95}ms`);
    console.log(`   p99: ${p99}ms`);
    console.log(`   Min: ${min}ms`);
    console.log(`   Max: ${max}ms`);

    // Performance assessment
    console.log('\n🎯 Performance Assessment:');
    if (p95 < 3000) {
      console.log('   ✅ EXCELLENT - p95 under 3s');
    } else if (p95 < 5000) {
      console.log('   ✅ GOOD - p95 under 5s');
    } else if (p95 < 10000) {
      console.log('   ⚠️  ACCEPTABLE - p95 under 10s');
    } else {
      console.log('   ❌ POOR - p95 over 10s');
    }

    // Throughput
    const throughput = (metrics.leads_processed / (max / 1000)).toFixed(2);
    console.log(`   Throughput: ${throughput} leads/second`);
  }

  // Error breakdown
  if (metrics.errors.length > 0) {
    console.log('\n❌ Error Breakdown:');
    const errorTypes = {};
    metrics.errors.forEach(e => {
      errorTypes[e.error] = (errorTypes[e.error] || 0) + 1;
    });
    Object.entries(errorTypes).forEach(([error, count]) => {
      console.log(`   ${error}: ${count} occurrences`);
    });
  }

  // Test verdict
  console.log('\n');
  console.log('━'.repeat(60));
  const successRate = (metrics.successful / metrics.total_requests) * 100;
  const sivaRate = (metrics.siva_scoring_used / metrics.leads_processed) * 100;

  if (successRate >= 95 && sivaRate >= 80) {
    console.log('✅ STRESS TEST PASSED');
    console.log('   System is stable under concurrent load');
    console.log('   SIVA integration is working reliably');
  } else if (successRate >= 90 && sivaRate >= 70) {
    console.log('⚠️  STRESS TEST MARGINAL');
    console.log('   System is functional but has issues');
    console.log('   Consider optimization or debugging');
  } else {
    console.log('❌ STRESS TEST FAILED');
    console.log('   System is unstable under load');
    console.log('   Immediate attention required');
  }
  console.log('━'.repeat(60));
  console.log('\n');

  return successRate >= 95 && sivaRate >= 80;
}

/**
 * Run stress test suite
 */
async function runStressTests() {
  console.log('━'.repeat(60));
  console.log('🔥 SIVA Phase 12 - Stress Test Suite');
  console.log('━'.repeat(60));
  console.log(`Endpoint: ${ENRICH_ENDPOINT}`);
  console.log(`\nConfiguration:`);
  console.log(`   Concurrent Requests: ${STRESS_CONFIG.concurrent_requests}`);
  console.log(`   Leads per Request: ${STRESS_CONFIG.batch_size}`);
  console.log(`   Test Iterations: ${STRESS_CONFIG.iterations}`);
  console.log(`   Total Load: ${STRESS_CONFIG.concurrent_requests * STRESS_CONFIG.iterations} requests`);
  console.log(`   Total Leads: ${STRESS_CONFIG.concurrent_requests * STRESS_CONFIG.iterations * STRESS_CONFIG.batch_size} leads`);

  const overallStart = Date.now();

  // Run iterations
  for (let i = 1; i <= STRESS_CONFIG.iterations; i++) {
    await runConcurrentBatch(i);
    // Small delay between batches to prevent overwhelming the service
    if (i < STRESS_CONFIG.iterations) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const totalTime = Date.now() - overallStart;
  console.log(`\n⏱️  Total Test Duration: ${(totalTime / 1000).toFixed(1)}s`);

  // Display final statistics
  const passed = displayStatistics();

  process.exit(passed ? 0 : 1);
}

// Run stress tests
runStressTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
