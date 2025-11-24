#!/usr/bin/env node
/**
 * Sprint 25 - Smoke Test: All 4 Rule Engines
 *
 * Tests all 4 SIVA tools in production to verify they are operational:
 * 1. CompanyQuality (v2.2) - 97.88% match rate
 * 2. ContactTier (v2.0) - 100% match rate
 * 3. TimingScore (v1.0) - 100% match rate
 * 4. BankingProductMatch (v1.0) - 100% match rate
 *
 * Success criteria: All 4 tools respond with 200 OK and valid output
 *
 * Usage: API_URL="https://..." node scripts/testing/smokeTestSprint25.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

console.log('═══════════════════════════════════════════════════════════');
console.log('Sprint 25 - Smoke Test: All 4 Rule Engines');
console.log(`Testing against: ${API_URL}`);
console.log('═══════════════════════════════════════════════════════════\n');

const tests = [
  {
    name: 'CompanyQuality Tool (v2.2)',
    endpoint: '/api/agent-core/v1/tools/evaluate_company_quality',
    payload: {
      company_name: 'TechCorp UAE',
      domain: 'techcorp.ae',
      industry: 'Technology',
      uae_signals: {
        has_ae_domain: true,
        has_uae_address: true,
        linkedin_location: 'Dubai, UAE'
      },
      salary_indicators: {
        salary_level: 'high',
        avg_salary: 18000
      },
      size: 150,
      size_bucket: 'midsize',
      license_type: 'Free Zone',
      sector: 'Private'
    },
    expectedFields: ['quality_score', 'reasoning', 'confidence', 'metadata']
  },
  {
    name: 'ContactTier Tool (v2.0)',
    endpoint: '/api/agent-core/v1/tools/select_contact_tier',
    payload: {
      title: 'HR Director',
      department: 'HR',
      seniority_level: 'Director',
      company_size: 250,
      hiring_velocity_monthly: 5,
      company_maturity_years: 8
    },
    expectedFields: ['tier', 'priority', 'confidence', 'target_titles']
  },
  {
    name: 'TimingScore Tool (v1.0)',
    endpoint: '/api/agent-core/v1/tools/calculate_timing_score',
    payload: {
      signal_type: 'hiring',
      signal_age: 7,
      current_date: '2025-11-15',
      fiscal_context: {}
    },
    expectedFields: ['timing_multiplier', 'category', 'confidence', 'reasoning']
  },
  {
    name: 'BankingProductMatch Tool (v1.0)',
    endpoint: '/api/agent-core/v1/tools/match_banking_products',
    payload: {
      company_size: 45,
      industry: 'technology',
      signals: ['hiring', 'expansion'],
      uae_employees: 45,
      average_salary_aed: 15000,
      has_free_zone_license: false
    },
    expectedFields: ['recommended_products', 'confidence', 'metadata']
  }
];

async function runSmokeTests() {
  let passCount = 0;
  const results = [];

  for (const test of tests) {
    console.log(`\n🔍 Testing: ${test.name}`);
    console.log('─────────────────────────────────────────────────────────');

    try {
      const url = `${API_URL}${test.endpoint}`;
      console.log(`  URL: ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(test.payload)
      });

      console.log(`  Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`  Response received (${JSON.stringify(data).length} bytes)`);

      // Check for success field
      if (!data.success) {
        throw new Error(`API returned success=false: ${JSON.stringify(data)}`);
      }

      // Check for expected fields in result
      const result = data.result;
      const missingFields = test.expectedFields.filter(field => !(field in result));

      if (missingFields.length > 0) {
        throw new Error(`Missing expected fields: ${missingFields.join(', ')}`);
      }

      console.log(`  ✅ All expected fields present`);

      // Show key result data
      if (result.quality_score !== undefined) {
        console.log(`  Quality Score: ${result.quality_score}, Confidence: ${result.confidence}`);
      } else if (result.tier !== undefined) {
        console.log(`  Tier: ${result.tier}, Priority: ${result.priority}, Confidence: ${result.confidence}`);
      } else if (result.timing_multiplier !== undefined) {
        console.log(`  Timing Multiplier: ${result.timing_multiplier}, Category: ${result.category}, Confidence: ${result.confidence}`);
      } else if (result.recommended_products !== undefined) {
        console.log(`  Products: ${result.recommended_products.length}, Top: ${result.recommended_products[0]?.product_name}, Confidence: ${result.confidence}`);
      }

      console.log(`\n  ✅ PASS`);
      passCount++;

      results.push({
        test: test.name,
        pass: true,
        status: response.status,
        latency: data.metadata?.executionTimeMs || result._meta?.latency_ms || 'N/A'
      });

    } catch (error) {
      console.log(`\n  ❌ FAIL: ${error.message}`);
      results.push({
        test: test.name,
        pass: false,
        error: error.message
      });
    }
  }

  // Summary
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('📊 SMOKE TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');

  const passRate = (passCount / tests.length) * 100;
  console.log(`\nTests Passed: ${passCount}/${tests.length} (${passRate.toFixed(1)}%)`);

  if (passRate === 100) {
    console.log(`\n✅ SUCCESS - All 4 rule engines operational!`);
  } else {
    console.log(`\n❌ FAILURE - Some rule engines are not operational`);
  }

  console.log('\n📋 Detailed Results:');
  results.forEach((result) => {
    const status = result.pass ? '✅' : '❌';
    const latency = result.latency !== 'N/A' ? ` (${result.latency}ms)` : '';
    console.log(`  ${status} ${result.test}${latency}`);
    if (!result.pass) {
      console.log(`      Error: ${result.error}`);
    }
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Smoke test complete!');
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(passRate === 100 ? 0 : 1);
}

// Run smoke tests
runSmokeTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
