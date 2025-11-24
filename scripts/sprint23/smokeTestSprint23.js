#!/usr/bin/env node
/**
 * Sprint 23 Smoke Test - Multi-Tool Shadow Mode Verification
 *
 * Tests all 4 SIVA tools with shadow mode:
 * 1. CompanyQualityTool (full shadow mode - rule engine active)
 * 2. ContactTierTool (inline-only logging)
 * 3. TimingScoreTool (inline-only logging)
 * 4. BankingProductMatchTool (inline-only logging)
 *
 * Usage: API_URL="https://..." node scripts/sprint23/smokeTestSprint23.js
 */

const API_URL = process.env.API_URL || 'http://localhost:8080';

async function makeRequest(endpoint, payload) {
  const url = `${API_URL}${endpoint}`;
  console.log(`\n📡 Testing ${endpoint}...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }

    return { success: true, data, status: response.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function runSmokeTests() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('Sprint 23 Smoke Test - Multi-Tool Shadow Mode');
  console.log(`Target: ${API_URL}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // TEST 1: CompanyQualityTool (full shadow mode with rule engine)
  console.log('🧪 Test 1: CompanyQualityTool (full shadow mode)');
  const companyQualityTest = await makeRequest('/api/agent-core/v1/tools/evaluate_company_quality', {
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
  });

  if (companyQualityTest.success) {
    const result = companyQualityTest.data.result || companyQualityTest.data;
    const score = result.quality_score || result.score;
    const hasMetadata = result._meta || companyQualityTest.data._meta;
    console.log(`   ✅ PASS - Score: ${score}, Latency: ${hasMetadata?.latency_ms}ms`);
    console.log(`   📝 Shadow mode should log: inline + rule engine comparison`);
    results.passed++;
    results.tests.push({ name: 'CompanyQualityTool', status: 'PASS', score });
  } else {
    console.log(`   ❌ FAIL - ${companyQualityTest.error}`);
    results.failed++;
    results.tests.push({ name: 'CompanyQualityTool', status: 'FAIL', error: companyQualityTest.error });
  }

  // TEST 2: ContactTierTool (inline-only logging)
  console.log('\n🧪 Test 2: ContactTierTool (inline-only logging)');
  const contactTierTest = await makeRequest('/api/agent-core/v1/tools/select_contact_tier', {
    title: 'HR Director',
    department: 'HR',
    seniority_level: 'Director',
    company_size: 250,
    hiring_velocity_monthly: 12,
    company_maturity_years: 5
  });

  if (contactTierTest.success) {
    const result = contactTierTest.data.result || contactTierTest.data;
    const tier = result.tier;
    const priority = result.priority;
    const confidence = result.confidence;
    console.log(`   ✅ PASS - Tier: ${tier}, Priority: ${priority}, Confidence: ${confidence}`);
    console.log(`   📝 Shadow mode should log: inline result only`);
    results.passed++;
    results.tests.push({ name: 'ContactTierTool', status: 'PASS', tier, priority });
  } else {
    console.log(`   ❌ FAIL - ${contactTierTest.error}`);
    results.failed++;
    results.tests.push({ name: 'ContactTierTool', status: 'FAIL', error: contactTierTest.error });
  }

  // TEST 3: TimingScoreTool (inline-only logging)
  console.log('\n🧪 Test 3: TimingScoreTool (inline-only logging)');
  const timingScoreTest = await makeRequest('/api/agent-core/v1/tools/calculate_timing_score', {
    signal_type: 'hiring',
    signal_age: 7,
    current_date: new Date().toISOString().split('T')[0],
    fiscal_context: {
      quarter: 'Q4',
      is_ramadan: false,
      is_post_eid: false
    }
  });

  if (timingScoreTest.success) {
    const result = timingScoreTest.data.result || timingScoreTest.data;
    const multiplier = result.timing_multiplier || result.multiplier;
    const confidence = result.confidence;
    console.log(`   ✅ PASS - Multiplier: ${multiplier}, Confidence: ${confidence}`);
    console.log(`   📝 Shadow mode should log: inline result only`);
    results.passed++;
    results.tests.push({ name: 'TimingScoreTool', status: 'PASS', multiplier });
  } else {
    console.log(`   ❌ FAIL - ${timingScoreTest.error}`);
    results.failed++;
    results.tests.push({ name: 'TimingScoreTool', status: 'FAIL', error: timingScoreTest.error });
  }

  // TEST 4: BankingProductMatchTool (inline-only logging)
  console.log('\n🧪 Test 4: BankingProductMatchTool (inline-only logging)');
  const bankingProductTest = await makeRequest('/api/agent-core/v1/tools/match_banking_products', {
    company_size: 150,
    industry: 'technology',
    signals: ['expansion', 'hiring'],
    uae_employees: 120,
    average_salary_aed: 15000,
    segment: 'sme',
    has_free_zone_license: true
  });

  if (bankingProductTest.success) {
    const result = bankingProductTest.data.result || bankingProductTest.data;
    const products = result.recommended_products || result.products;
    const topProduct = products && products.length > 0 ? products[0] : null;
    console.log(`   ✅ PASS - Products: ${products?.length}, Top: ${topProduct?.product_name || topProduct?.name}`);
    console.log(`   📝 Shadow mode should log: inline result only`);
    results.passed++;
    results.tests.push({ name: 'BankingProductMatchTool', status: 'PASS', productCount: products?.length });
  } else {
    console.log(`   ❌ FAIL - ${bankingProductTest.error}`);
    results.failed++;
    results.tests.push({ name: 'BankingProductMatchTool', status: 'FAIL', error: bankingProductTest.error });
  }

  // Summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('📊 SMOKE TEST RESULTS');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`Total Tests: 4`);
  console.log(`Passed: ${results.passed} ✅`);
  console.log(`Failed: ${results.failed} ❌`);
  console.log(`Success Rate: ${Math.round(results.passed / 4 * 100)}%`);

  if (results.failed === 0) {
    console.log('\n🎉 All smoke tests passed!');
    console.log('\n📝 Expected Shadow Mode Logging:');
    console.log('   • CompanyQualityTool: 1 decision with inline + rule comparison');
    console.log('   • ContactTierTool: 1 decision with inline only');
    console.log('   • TimingScoreTool: 1 decision with inline only');
    console.log('   • BankingProductMatchTool: 1 decision with inline only');
    console.log('   • TOTAL: 4 new decisions in agent_core.agent_decisions');
  } else {
    console.log('\n⚠️  Some tests failed. Check errors above.');
  }

  console.log('\n💡 Next Steps:');
  console.log('   1. Wait 10-30 seconds for async logging to complete');
  console.log('   2. Run: bash scripts/sprint23/checkShadowModeProgress.sh');
  console.log('   3. Verify 4 new decisions logged in database');
  console.log('\n══════════════════════════════════════════════════════════════\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runSmokeTests().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
