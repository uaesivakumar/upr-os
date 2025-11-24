#!/usr/bin/env node
/**
 * Sprint 23 Stress Test - Shadow Mode Performance Under Load
 *
 * Tests all 4 SIVA tools under load to verify:
 * 1. Shadow mode doesn't slow down API responses
 * 2. Decision logging handles concurrent requests
 * 3. No database connection pool exhaustion
 * 4. Error rates remain low under load
 *
 * Usage: API_URL="https://..." CONCURRENCY=10 ITERATIONS=50 node scripts/sprint23/stressTestSprint23.js
 */

const API_URL = process.env.API_URL || 'http://localhost:8080';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10');
const ITERATIONS = parseInt(process.env.ITERATIONS || '50');

async function makeRequest(endpoint, payload) {
  const url = `${API_URL}${endpoint}`;
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const latency = Date.now() - startTime;

    if (!response.ok) {
      return { success: false, latency, status: response.status, error: JSON.stringify(data) };
    }

    return { success: true, latency, status: response.status, data };
  } catch (error) {
    return { success: false, latency: Date.now() - startTime, error: error.message };
  }
}

const TEST_PAYLOADS = {
  companyQuality: {
    endpoint: '/api/agent-core/v1/tools/evaluate_company_quality',
    payload: {
      company_name: 'Emirates Tech Solutions',
      domain: 'emiratestech.ae',
      industry: 'Technology',
      uae_signals: {
        has_ae_domain: true,
        has_uae_address: true,
        linkedin_location: 'Dubai, UAE'
      },
      salary_indicators: {
        salary_level: 'high',
        avg_salary: 15000
      },
      size: 250,
      size_bucket: 'midsize',
      license_type: 'Free Zone',
      sector: 'Private'
    }
  },
  contactTier: {
    endpoint: '/api/agent-core/v1/tools/select_contact_tier',
    payload: {
      title: 'HR Director',
      department: 'HR',
      seniority_level: 'Director',
      company_size: 250,
      hiring_velocity_monthly: 12,
      company_maturity_years: 5
    }
  },
  timingScore: {
    endpoint: '/api/agent-core/v1/tools/calculate_timing_score',
    payload: {
      signal_type: 'hiring',
      signal_age: 7,
      current_date: new Date().toISOString().split('T')[0],
      fiscal_context: {
        quarter: 'Q4',
        is_ramadan: false,
        is_post_eid: false
      }
    }
  },
  bankingProduct: {
    endpoint: '/api/agent-core/v1/tools/match_banking_products',
    payload: {
      company_size: 150,
      industry: 'technology',
      signals: ['expansion', 'hiring'],
      uae_employees: 120,
      average_salary_aed: 15000,
      segment: 'sme',
      has_free_zone_license: true
    }
  }
};

async function runStressTest() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('Sprint 23 Stress Test - Shadow Mode Performance');
  console.log(`Target: ${API_URL}`);
  console.log(`Concurrency: ${CONCURRENCY} concurrent requests`);
  console.log(`Iterations: ${ITERATIONS} requests per tool`);
  console.log(`Total Requests: ${ITERATIONS * 4} (${ITERATIONS} × 4 tools)`);
  console.log('══════════════════════════════════════════════════════════════\n');

  const results = {
    companyQuality: { success: 0, failed: 0, latencies: [] },
    contactTier: { success: 0, failed: 0, latencies: [] },
    timingScore: { success: 0, failed: 0, latencies: [] },
    bankingProduct: { success: 0, failed: 0, latencies: [] }
  };

  const startTime = Date.now();

  // Create batches of concurrent requests
  const batches = Math.ceil(ITERATIONS / CONCURRENCY);

  for (let batch = 0; batch < batches; batch++) {
    const batchStart = batch * CONCURRENCY;
    const batchEnd = Math.min((batch + 1) * CONCURRENCY, ITERATIONS);
    const batchSize = batchEnd - batchStart;

    console.log(`\n📊 Batch ${batch + 1}/${batches} (${batchSize} requests per tool)...`);

    // Run all 4 tools concurrently in this batch
    const promises = [];

    for (let i = batchStart; i < batchEnd; i++) {
      promises.push(
        makeRequest(TEST_PAYLOADS.companyQuality.endpoint, TEST_PAYLOADS.companyQuality.payload)
          .then(r => ({ tool: 'companyQuality', result: r })),
        makeRequest(TEST_PAYLOADS.contactTier.endpoint, TEST_PAYLOADS.contactTier.payload)
          .then(r => ({ tool: 'contactTier', result: r })),
        makeRequest(TEST_PAYLOADS.timingScore.endpoint, TEST_PAYLOADS.timingScore.payload)
          .then(r => ({ tool: 'timingScore', result: r })),
        makeRequest(TEST_PAYLOADS.bankingProduct.endpoint, TEST_PAYLOADS.bankingProduct.payload)
          .then(r => ({ tool: 'bankingProduct', result: r }))
      );
    }

    const batchResults = await Promise.all(promises);

    // Aggregate results
    batchResults.forEach(({ tool, result }) => {
      if (result.success) {
        results[tool].success++;
        results[tool].latencies.push(result.latency);
      } else {
        results[tool].failed++;
      }
    });

    console.log(`   ✓ Completed ${batchResults.length} requests`);

    // Add delay between batches to avoid rate limiting (50ms)
    if (batch < batches - 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  const totalTime = Date.now() - startTime;

  // Calculate statistics
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('📊 STRESS TEST RESULTS');
  console.log('══════════════════════════════════════════════════════════════\n');

  const toolNames = {
    companyQuality: 'CompanyQualityTool',
    contactTier: 'ContactTierTool',
    timingScore: 'TimingScoreTool',
    bankingProduct: 'BankingProductMatchTool'
  };

  let totalSuccess = 0;
  let totalFailed = 0;
  let overallLatencies = [];

  Object.keys(results).forEach(tool => {
    const r = results[tool];
    const latencies = r.latencies;
    const successRate = r.success + r.failed > 0 ? (r.success / (r.success + r.failed) * 100).toFixed(2) : 0;

    totalSuccess += r.success;
    totalFailed += r.failed;
    overallLatencies = overallLatencies.concat(latencies);

    if (latencies.length > 0) {
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);

      console.log(`${toolNames[tool]}:`);
      console.log(`   Success: ${r.success}/${r.success + r.failed} (${successRate}%)`);
      console.log(`   Latency: avg=${avg}ms, p50=${p50}ms, p95=${p95}ms, p99=${p99}ms`);
      console.log('');
    }
  });

  // Overall statistics
  console.log('══════════════════════════════════════════════════════════════');
  console.log('OVERALL STATISTICS');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`Total Requests: ${totalSuccess + totalFailed}`);
  console.log(`Successful: ${totalSuccess} (${(totalSuccess / (totalSuccess + totalFailed) * 100).toFixed(2)}%)`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Throughput: ${((totalSuccess + totalFailed) / (totalTime / 1000)).toFixed(2)} req/s`);

  if (overallLatencies.length > 0) {
    overallLatencies.sort((a, b) => a - b);
    const p50 = overallLatencies[Math.floor(overallLatencies.length * 0.5)];
    const p95 = overallLatencies[Math.floor(overallLatencies.length * 0.95)];
    const p99 = overallLatencies[Math.floor(overallLatencies.length * 0.99)];
    const avg = (overallLatencies.reduce((a, b) => a + b, 0) / overallLatencies.length).toFixed(2);

    console.log(`\nLatency Distribution:`);
    console.log(`   Average: ${avg}ms`);
    console.log(`   P50: ${p50}ms`);
    console.log(`   P95: ${p95}ms`);
    console.log(`   P99: ${p99}ms`);
  }

  // Expected shadow mode logging
  console.log('\n📝 Expected Shadow Mode Logging:');
  console.log(`   • Total decisions logged: ${totalSuccess} (async, may take 10-30s)`);
  console.log(`   • CompanyQuality: ${results.companyQuality.success} (inline + rule engine)`);
  console.log(`   • ContactTier: ${results.contactTier.success} (inline only)`);
  console.log(`   • TimingScore: ${results.timingScore.success} (inline only)`);
  console.log(`   • BankingProductMatch: ${results.bankingProduct.success} (inline only)`);

  // Success criteria
  const successRate = (totalSuccess / (totalSuccess + totalFailed) * 100);
  const avgLatency = overallLatencies.length > 0 ?
    (overallLatencies.reduce((a, b) => a + b, 0) / overallLatencies.length) : 0;

  const p95Latency = overallLatencies.length > 0 ?
    overallLatencies[Math.floor(overallLatencies.length * 0.95)] : 0;

  console.log('\n🎯 Success Criteria:');
  console.log(`   ✓ Success rate > 95%: ${successRate >= 95 ? '✅' : '❌'} (${successRate.toFixed(2)}%)`);
  console.log(`   ✓ Average latency < 800ms: ${avgLatency < 800 ? '✅' : '❌'} (${avgLatency.toFixed(2)}ms)`);
  console.log(`   ✓ P95 latency < 2000ms: ${p95Latency < 2000 ? '✅' : '❌'} (${p95Latency}ms)`);

  const allPassed = successRate >= 95 && avgLatency < 800 && p95Latency < 2000;

  if (allPassed) {
    console.log('\n🎉 Stress test PASSED! Shadow mode performs well under load.');
  } else {
    console.log('\n⚠️  Stress test FAILED. Review metrics above.');
  }

  console.log('\n💡 Next Steps:');
  console.log('   1. Wait 30-60 seconds for async decision logging to complete');
  console.log('   2. Run: bash scripts/sprint23/checkShadowModeProgress.sh');
  console.log(`   3. Verify ~${totalSuccess} new decisions in database`);
  console.log('\n══════════════════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

// Run stress test
runStressTest().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
