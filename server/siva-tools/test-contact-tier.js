/**
 * Quick test script for ContactTierToolStandalone
 */

const ContactTierTool = require('./ContactTierToolStandalone');

async function runTests() {
  const tool = new ContactTierTool();

  console.log('='.repeat(60));
  console.log('SIVA ContactTierTool - Test Suite');
  console.log('='.repeat(60));

  // Test 1: C-Level contact (should be STRATEGIC)
  console.log('\n✓ Test 1: CEO of tech startup (STRATEGIC expected)');
  const test1 = await tool.execute({
    title: 'CEO',
    company_size: 150
  });
  console.log(`  Tier: ${test1.tier} (Priority ${test1.priority})`);
  console.log(`  Confidence: ${test1.confidence}`);
  console.log(`  Reasoning: ${test1.reasoning}`);
  console.log(`  Seniority Score: ${test1.metadata.score_breakdown.seniority_score}/40`);
  console.log(`  Department Score: ${test1.metadata.score_breakdown.department_score}/30`);
  console.log(`  Company Size Score: ${test1.metadata.score_breakdown.company_size_score}/30`);
  console.log(`  Latency: ${test1._meta.latency_ms}ms`);

  // Test 2: HR Director (should be STRATEGIC)
  console.log('\n✓ Test 2: HR Director in mid-size company (STRATEGIC expected)');
  const test2 = await tool.execute({
    title: 'Director of Human Resources',
    seniority_level: 'Director',
    department: 'HR',
    company_size: 250
  });
  console.log(`  Tier: ${test2.tier} (Priority ${test2.priority})`);
  console.log(`  Reasoning: ${test2.reasoning}`);
  console.log(`  Target Titles: ${test2.target_titles.join(', ')}`);

  // Test 3: Payroll Manager in large company (should be PRIMARY)
  console.log('\n✓ Test 3: Payroll Manager in large company (PRIMARY expected)');
  const test3 = await tool.execute({
    title: 'Payroll Manager',
    seniority_level: 'Manager',
    department: 'Finance',
    company_size: 800
  });
  console.log(`  Tier: ${test3.tier} (Priority ${test3.priority})`);
  console.log(`  Reasoning: ${test3.reasoning}`);
  console.log(`  Fallback Titles: ${test3.fallback_titles.join(', ')}`);

  // Test 4: Marketing Manager (should be SECONDARY)
  console.log('\n✓ Test 4: Marketing Manager (SECONDARY expected)');
  const test4 = await tool.execute({
    title: 'Marketing Manager',
    seniority_level: 'Manager',
    department: 'Other',
    company_size: 300
  });
  console.log(`  Tier: ${test4.tier} (Priority ${test4.priority})`);
  console.log(`  Confidence: ${test4.confidence}`);
  console.log(`  Reasoning: ${test4.reasoning}`);

  // Test 5: Junior HR Analyst (should be SECONDARY or BACKUP)
  console.log('\n✓ Test 5: HR Analyst in large enterprise (SECONDARY/BACKUP expected)');
  const test5 = await tool.execute({
    title: 'HR Analyst',
    seniority_level: 'Individual',
    department: 'HR',
    company_size: 1500
  });
  console.log(`  Tier: ${test5.tier} (Priority ${test5.priority})`);
  console.log(`  Reasoning: ${test5.reasoning}`);

  // Test 6: Founder of small startup (STRATEGIC with special target titles)
  console.log('\n✓ Test 6: Founder of 2-month-old startup (STRATEGIC expected)');
  const test6 = await tool.execute({
    title: 'Founder & CEO',
    company_size: 15,
    company_maturity_years: 0.2, // ~2 months
    hiring_velocity_monthly: 3
  });
  console.log(`  Tier: ${test6.tier} (Priority ${test6.priority})`);
  console.log(`  Confidence: ${test6.confidence}`);
  console.log(`  Target Titles: ${test6.target_titles.join(', ')}`);
  console.log(`  Inferred Seniority: ${test6.metadata.inferred_seniority}`);
  console.log(`  Inferred Department: ${test6.metadata.inferred_department}`);

  // Test 7: High hiring velocity company
  console.log('\n✓ Test 7: VP Talent Acquisition with high hiring velocity');
  const test7 = await tool.execute({
    title: 'VP Talent Acquisition',
    seniority_level: 'VP',
    department: 'HR',
    company_size: 300,
    hiring_velocity_monthly: 15
  });
  console.log(`  Tier: ${test7.tier} (Priority ${test7.priority})`);
  console.log(`  Target Titles: ${test7.target_titles.slice(0, 5).join(', ')}...`);
  console.log(`  Reasoning: ${test7.reasoning}`);

  // Test 8: Ambiguous title (low confidence expected)
  console.log('\n✓ Test 8: Ambiguous single-word title (low confidence expected)');
  const test8 = await tool.execute({
    title: 'Executive',
    company_size: 500
  });
  console.log(`  Tier: ${test8.tier} (Priority ${test8.priority})`);
  console.log(`  Confidence: ${test8.confidence} (should be < 0.8)`);
  console.log(`  Inferred Seniority: ${test8.metadata.inferred_seniority}`);
  console.log(`  Inferred Department: ${test8.metadata.inferred_department}`);

  // Test 9: CFO of mid-size company (STRATEGIC)
  console.log('\n✓ Test 9: CFO of mid-size company (STRATEGIC expected)');
  const test9 = await tool.execute({
    title: 'Chief Financial Officer',
    company_size: 400
  });
  console.log(`  Tier: ${test9.tier} (Priority ${test9.priority})`);
  console.log(`  Reasoning: ${test9.reasoning}`);

  // Test 10: Office Manager in small company (PRIMARY/STRATEGIC)
  console.log('\n✓ Test 10: Office Manager in small company (STRATEGIC expected)');
  const test10 = await tool.execute({
    title: 'Office Manager',
    company_size: 80
  });
  console.log(`  Tier: ${test10.tier} (Priority ${test10.priority})`);
  console.log(`  Reasoning: ${test10.reasoning}`);
  console.log(`  Inferred Seniority: ${test10.metadata.inferred_seniority}`);
  console.log(`  Inferred Department: ${test10.metadata.inferred_department}`);

  console.log('\n' + '='.repeat(60));
  console.log('✓ All tests completed successfully!');
  console.log('='.repeat(60));

  // Summary statistics
  console.log('\nSummary:');
  const allTests = [test1, test2, test3, test4, test5, test6, test7, test8, test9, test10];
  const avgLatency = allTests.reduce((sum, t) => sum + t._meta.latency_ms, 0) / allTests.length;
  const avgConfidence = allTests.reduce((sum, t) => sum + t.confidence, 0) / allTests.length;

  console.log(`  Average Latency: ${avgLatency.toFixed(2)}ms (SLA: ≤200ms P50, ≤600ms P95)`);
  console.log(`  Average Confidence: ${avgConfidence.toFixed(2)}`);
  console.log(`  STRATEGIC: ${allTests.filter(t => t.tier === 'STRATEGIC').length}/10`);
  console.log(`  PRIMARY: ${allTests.filter(t => t.tier === 'PRIMARY').length}/10`);
  console.log(`  SECONDARY: ${allTests.filter(t => t.tier === 'SECONDARY').length}/10`);
  console.log(`  BACKUP: ${allTests.filter(t => t.tier === 'BACKUP').length}/10`);
}

runTests().catch(err => {
  console.error('Error running tests:', err);
  process.exit(1);
});
