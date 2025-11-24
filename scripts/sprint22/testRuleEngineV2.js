/**
 * Test Rule Engine v2.0 - Sprint 22
 *
 * Validates that the extended rule engine can execute the new
 * additive_scoring rule type for CompanyQualityTool
 */

import { RuleEngine } from '../../server/agent-core/rule-engine.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testRuleEngineV2() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('Rule Engine v2.0 - Test Suite');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load v2.0 rules
  const rulesPath = path.join(__dirname, '../../server/agent-core/cognitive_extraction_logic_v2.0.json');
  const engine = new RuleEngine(rulesPath);

  console.log('✅ Loaded Rule Engine v2.0');
  console.log(`   Version: ${engine.version}`);
  console.log(`   Rules: ${Object.keys(engine.rules).length}\n`);

  // Test Case 1: High-quality company (strong signals)
  console.log('Test 1: High-Quality Company (Strong Signals)');
  console.log('─────────────────────────────────────────────────────');

  const testInput1 = {
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
  };

  const result1 = await engine.execute('evaluate_company_quality', testInput1);

  console.log(`Score: ${result1.result.score}/100`);
  console.log(`Confidence: ${(result1.result.confidence * 100).toFixed(0)}%`);
  console.log(`Key Factors: ${result1.result.key_factors.join(', ')}`);
  console.log(`Edge Cases: ${result1.result.edge_cases_applied.join(', ') || 'None'}`);
  console.log(`Execution Time: ${result1.executionTimeMs}ms`);
  console.log('\nReasoning:');
  result1.result.reasoning.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.factor}: +${r.points} - ${r.explanation}`);
  });
  console.log('');

  // Expected: ~90-100 (40 salary+uae + 20 size + 15 industry) × 1.3 free zone = ~97

  // Test Case 2: Enterprise brand (should be rejected)
  console.log('\nTest 2: Enterprise Brand (Should Be Rejected)');
  console.log('─────────────────────────────────────────────────────');

  const testInput2 = {
    company_name: 'Emirates Airlines',
    domain: 'emirates.com',
    industry: 'Aviation',
    uae_signals: {
      has_ae_domain: false,
      has_uae_address: true
    },
    salary_indicators: {
      salary_level: 'high'
    },
    size: 50000,
    size_bucket: 'enterprise'
  };

  const result2 = await engine.execute('evaluate_company_quality', testInput2);

  console.log(`Score: ${result2.result.score}/100`);
  console.log(`Confidence: ${(result2.result.confidence * 100).toFixed(0)}%`);
  console.log(`Edge Cases: ${result2.result.edge_cases_applied.join(', ')}`);
  console.log(`Execution Time: ${result2.executionTimeMs}ms\n`);

  // Expected: ~5 (should be heavily penalized by ×0.1)

  // Test Case 3: Medium quality (partial signals)
  console.log('\nTest 3: Medium Quality (Partial Signals)');
  console.log('─────────────────────────────────────────────────────');

  const testInput3 = {
    company_name: 'Local Startup',
    domain: 'localstartup.ae',
    industry: 'Retail',
    uae_signals: {
      has_ae_domain: true,
      has_uae_address: false
    },
    salary_indicators: {
      avg_salary: 9000
    },
    size: 30,
    size_bucket: 'small'
  };

  const result3 = await engine.execute('evaluate_company_quality', testInput3);

  console.log(`Score: ${result3.result.score}/100`);
  console.log(`Confidence: ${(result3.result.confidence * 100).toFixed(0)}%`);
  console.log(`Execution Time: ${result3.executionTimeMs}ms\n`);

  // Expected: ~30-40 (moderate signals)

  // Test Case 4: Government sector (should be rejected)
  console.log('\nTest 4: Government Sector (Should Be Rejected)');
  console.log('─────────────────────────────────────────────────────');

  const testInput4 = {
    company_name: 'Ministry of Innovation',
    domain: 'moi.gov.ae',
    industry: 'Government',
    sector: 'Government',
    uae_signals: {
      has_ae_domain: true,
      has_uae_address: true
    },
    salary_indicators: {
      salary_level: 'high'
    },
    size: 200
  };

  const result4 = await engine.execute('evaluate_company_quality', testInput4);

  console.log(`Score: ${result4.result.score}/100`);
  console.log(`Confidence: ${(result4.result.confidence * 100).toFixed(0)}%`);
  console.log(`Edge Cases: ${result4.result.edge_cases_applied.join(', ')}`);
  console.log(`Execution Time: ${result4.executionTimeMs}ms\n`);

  // Expected: ~3-4 (heavily penalized by ×0.05)

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('Test Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ Test 1: ${result1.result.score >= 90 ? 'PASS' : 'FAIL'} (Expected: ≥90, Got: ${result1.result.score})`);
  console.log(`✅ Test 2: ${result2.result.score <= 10 ? 'PASS' : 'FAIL'} (Expected: ≤10, Got: ${result2.result.score})`);
  console.log(`✅ Test 3: ${result3.result.score >= 20 && result3.result.score <= 50 ? 'PASS' : 'FAIL'} (Expected: 20-50, Got: ${result3.result.score})`);
  console.log(`✅ Test 4: ${result4.result.score <= 5 ? 'PASS' : 'FAIL'} (Expected: ≤5, Got: ${result4.result.score})`);

  const allPassed = (
    result1.result.score >= 90 &&
    result2.result.score <= 10 &&
    result3.result.score >= 20 && result3.result.score <= 50 &&
    result4.result.score <= 5
  );

  if (allPassed) {
    console.log('\n🎉 All tests PASSED - Rule Engine v2.0 is working correctly!');
  } else {
    console.log('\n❌ Some tests FAILED - Check rule definitions');
  }

  return allPassed;
}

// Run tests
testRuleEngineV2()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
