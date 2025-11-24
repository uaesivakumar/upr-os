/**
 * Quick test script for CompanyQualityToolStandalone
 */

const CompanyQualityTool = require('./CompanyQualityToolStandalone');

async function runTests() {
  const tool = new CompanyQualityTool();

  console.log('='.repeat(60));
  console.log('SIVA CompanyQualityTool - Test Suite');
  console.log('='.repeat(60));

  // Test 1: Perfect FinTech startup in Dubai
  console.log('\n✓ Test 1: Perfect FinTech startup in Dubai Free Zone');
  const test1 = await tool.execute({
    company_name: 'PayTech DIFC',
    domain: 'paytech.ae',
    industry: 'FinTech',
    uae_signals: {
      has_ae_domain: true,
      has_uae_address: true,
      linkedin_location: 'DIFC, Dubai'
    },
    size_bucket: 'scaleup',
    size: 80,
    salary_indicators: {
      salary_level: 'high',
      avg_salary: 18000
    },
    license_type: 'Free Zone'
  });

  console.log(`  Score: ${test1.quality_score}/100`);
  console.log(`  Confidence: ${test1.confidence}`);
  console.log(`  Latency: ${test1._meta.latency_ms}ms`);
  console.log(`  Edge Cases: ${test1.edge_cases_applied.join(', ') || 'None'}`);
  console.log(`  Reasoning:`);
  test1.reasoning.forEach(r => console.log(`    - ${r.factor}: +${r.points} points`));

  // Test 2: Enterprise brand (should be rejected)
  console.log('\n✓ Test 2: Enterprise brand (Emirates) - should auto-skip');
  const test2 = await tool.execute({
    company_name: 'Emirates',
    domain: 'emirates.com',
    industry: 'Aviation',
    uae_signals: {
      has_ae_domain: true,
      has_uae_address: true
    },
    size_bucket: 'enterprise',
    salary_indicators: { salary_level: 'high' }
  });

  console.log(`  Score: ${test2.quality_score}/100 (should be very low)`);
  console.log(`  Edge Cases: ${test2.edge_cases_applied.join(', ')}`);

  // Test 3: Government sector (should be rejected)
  console.log('\n✓ Test 3: Government entity - should auto-skip');
  const test3 = await tool.execute({
    company_name: 'Government Entity',
    domain: 'gov.ae',
    industry: 'Public Services',
    sector: 'Government',
    uae_signals: {
      has_ae_domain: true,
      has_uae_address: true
    },
    size_bucket: 'enterprise',
    salary_indicators: { salary_level: 'high' }
  });

  console.log(`  Score: ${test3.quality_score}/100 (should be very low)`);
  console.log(`  Edge Cases: ${test3.edge_cases_applied.join(', ')}`);

  // Test 4: Tech company in sweet spot
  console.log('\n✓ Test 4: Mid-size tech company (150 employees)');
  const test4 = await tool.execute({
    company_name: 'Tech Startup UAE',
    domain: 'techstartup.ae',
    industry: 'Technology',
    uae_signals: {
      has_ae_domain: true,
      has_uae_address: true
    },
    size_bucket: 'scaleup',
    size: 150,
    salary_indicators: {
      salary_level: 'high'
    }
  });

  console.log(`  Score: ${test4.quality_score}/100`);
  console.log(`  Confidence: ${test4.confidence}`);

  // Test 5: Company with incomplete data (low confidence)
  console.log('\n✓ Test 5: Company with incomplete data (low confidence expected)');
  const test5 = await tool.execute({
    company_name: 'Unknown Co',
    domain: 'unknown.com',
    industry: 'Other',
    uae_signals: {
      has_ae_domain: false,
      has_uae_address: false
    },
    size_bucket: 'startup'
  });

  console.log(`  Score: ${test5.quality_score}/100`);
  console.log(`  Confidence: ${test5.confidence} (should be < 0.75)`);

  console.log('\n' + '='.repeat(60));
  console.log('✓ All tests completed successfully!');
  console.log('='.repeat(60));
}

runTests().catch(err => {
  console.error('Error running tests:', err);
  process.exit(1);
});
