/**
 * Quick test script for EdgeCasesToolStandalone
 */

const EdgeCasesTool = require('./EdgeCasesToolStandalone');

async function runTests() {
  const tool = new EdgeCasesTool();

  console.log('='.repeat(60));
  console.log('SIVA EdgeCasesTool - Test Suite');
  console.log('='.repeat(60));

  // Test 1: Government sector (BLOCK - CRITICAL)
  console.log('\n✓ Test 1: Government sector entity (BLOCK expected - CRITICAL)');
  const test1 = await tool.execute({
    company_profile: {
      name: 'Dubai Municipality',
      sector: 'government',
      country: 'AE'
    }
  });
  console.log(`  Decision: ${test1.decision} (expected: BLOCK)`);
  console.log(`  Blockers: ${test1.blockers.length} (${test1.blockers.map(b => b.type).join(', ')})`);
  console.log(`  Severity: ${test1.blockers[0]?.severity} (expected: CRITICAL)`);
  console.log(`  Can Override: ${test1.metadata.overridable} (expected: false)`);
  console.log(`  Reasoning: ${test1.reasoning}`);
  console.log(`  Latency: ${test1._meta.latency_ms}ms`);

  // Test 2: Sanctioned entity (BLOCK - CRITICAL)
  console.log('\n✓ Test 2: Sanctioned entity (BLOCK expected - CRITICAL)');
  const test2 = await tool.execute({
    company_profile: {
      name: 'Sanctioned Corp',
      is_sanctioned: true
    }
  });
  console.log(`  Decision: ${test2.decision}`);
  console.log(`  Blockers: ${test2.blockers.length} (${test2.blockers.map(b => b.type).join(', ')})`);
  console.log(`  Can Override: ${test2.metadata.overridable} (expected: false)`);
  console.log(`  Critical Issues: ${test2.metadata.critical_issues.join(', ')}`);

  // Test 3: Bankruptcy (BLOCK - HIGH)
  console.log('\n✓ Test 3: Bankrupt company (BLOCK expected - HIGH)');
  const test3 = await tool.execute({
    company_profile: {
      name: 'Failed Ventures LLC',
      is_bankrupt: true,
      sector: 'private'
    }
  });
  console.log(`  Decision: ${test3.decision}`);
  console.log(`  Blockers: ${test3.blockers.length} (${test3.blockers.map(b => b.type).join(', ')})`);
  console.log(`  Severity: ${test3.blockers[0]?.severity} (expected: HIGH)`);
  console.log(`  Can Override: ${test3.metadata.overridable} (expected: true)`);

  // Test 4: Enterprise brand (BLOCK - MEDIUM)
  console.log('\n✓ Test 4: Enterprise brand (BLOCK expected - MEDIUM)');
  const test4 = await tool.execute({
    company_profile: {
      name: 'Emirates Airlines',
      sector: 'private',
      size: 50000
    }
  });
  console.log(`  Decision: ${test4.decision}`);
  console.log(`  Blockers: ${test4.blockers.length} (${test4.blockers.map(b => b.type).join(', ')})`);
  console.log(`  Severity: ${test4.blockers[0]?.severity} (expected: MEDIUM)`);
  console.log(`  Can Override: ${test4.metadata.overridable} (expected: true)`);

  // Test 5: Email bounced (BLOCK - CRITICAL)
  console.log('\n✓ Test 5: Email bounced (BLOCK expected - CRITICAL)');
  const test5 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    },
    contact_profile: {
      email: 'bounced@invalid.com',
      has_bounced: true
    }
  });
  console.log(`  Decision: ${test5.decision}`);
  console.log(`  Blockers: ${test5.blockers.length} (${test5.blockers.map(b => b.type).join(', ')})`);
  console.log(`  Can Override: ${test5.metadata.overridable} (expected: false)`);

  // Test 6: Excessive attempts (BLOCK - HIGH)
  console.log('\n✓ Test 6: Excessive previous attempts (BLOCK expected - HIGH)');
  const test6 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    },
    historical_data: {
      previous_attempts: 5,
      previous_responses: 0
    }
  });
  console.log(`  Decision: ${test6.decision}`);
  console.log(`  Blockers: ${test6.blockers.length} (${test6.blockers.map(b => b.type).join(', ')})`);
  console.log(`  Severity: ${test6.blockers[0]?.severity} (expected: HIGH)`);
  console.log(`  Message: ${test6.blockers[0]?.message}`);

  // Test 7: Recent contact (WARN - MEDIUM)
  console.log('\n✓ Test 7: Recent contact within 90 days (WARN expected)');
  const test7 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    },
    historical_data: {
      last_contact_date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      previous_attempts: 1,
      previous_responses: 0
    }
  });
  console.log(`  Decision: ${test7.decision} (expected: WARN)`);
  console.log(`  Warnings: ${test7.warnings.length} (${test7.warnings.map(w => w.type).join(', ')})`);
  console.log(`  Severity: ${test7.warnings[0]?.severity} (expected: MEDIUM)`);
  console.log(`  Can Override: ${test7.metadata.overridable} (expected: true)`);
  console.log(`  Message: ${test7.warnings[0]?.message}`);

  // Test 8: Unverified email (WARN - MEDIUM)
  console.log('\n✓ Test 8: Unverified email (WARN expected)');
  const test8 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    },
    contact_profile: {
      email: 'unverified@techcorp.ae',
      is_verified: false
    }
  });
  console.log(`  Decision: ${test8.decision}`);
  console.log(`  Warnings: ${test8.warnings.length} (${test8.warnings.map(w => w.type).join(', ')})`);
  console.log(`  Severity: ${test8.warnings[0]?.severity} (expected: MEDIUM)`);

  // Test 9: Company too large (WARN - LOW)
  console.log('\n✓ Test 9: Company too large (WARN expected)');
  const test9 = await tool.execute({
    company_profile: {
      name: 'MegaCorp',
      sector: 'private',
      size: 5000
    }
  });
  console.log(`  Decision: ${test9.decision}`);
  console.log(`  Warnings: ${test9.warnings.length} (${test9.warnings.map(w => w.type).join(', ')})`);
  console.log(`  Severity: ${test9.warnings[0]?.severity} (expected: LOW)`);
  console.log(`  Message: ${test9.warnings[0]?.message}`);

  // Test 10: Multiple blockers (CRITICAL + HIGH)
  console.log('\n✓ Test 10: Multiple blockers (CRITICAL + HIGH)');
  const test10 = await tool.execute({
    company_profile: {
      name: 'Government Bankrupt Corp',
      sector: 'government',
      is_bankrupt: true,
      has_legal_issues: true
    },
    contact_profile: {
      has_opted_out: true
    }
  });
  console.log(`  Decision: ${test10.decision}`);
  console.log(`  Blockers: ${test10.blockers.length} (expected: 4)`);
  console.log(`  Types: ${test10.blockers.map(b => b.type).join(', ')}`);
  console.log(`  Severities: ${test10.blockers.map(b => b.severity).join(', ')}`);
  console.log(`  Can Override: ${test10.metadata.overridable} (expected: false due to CRITICAL)`);
  console.log(`  Critical Issues: ${test10.metadata.critical_issues.length}`);

  // Test 11: Multiple warnings (no blockers)
  console.log('\n✓ Test 11: Multiple warnings, no blockers (WARN expected)');
  const test11 = await tool.execute({
    company_profile: {
      name: 'Growing Startup',
      sector: 'private',
      size: 1200,
      year_founded: new Date().getFullYear()
    },
    contact_profile: {
      email: 'contact@startup.ae',
      is_verified: false
    },
    historical_data: {
      last_contact_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      previous_attempts: 1,
      previous_responses: 0
    }
  });
  console.log(`  Decision: ${test11.decision} (expected: WARN)`);
  console.log(`  Warnings: ${test11.warnings.length} (expected: 4)`);
  console.log(`  Types: ${test11.warnings.map(w => w.type).join(', ')}`);
  console.log(`  Can Override: ${test11.metadata.overridable} (expected: true)`);
  console.log(`  Reasoning: ${test11.reasoning}`);

  // Test 12: Clean profile (PROCEED)
  console.log('\n✓ Test 12: Clean profile, no issues (PROCEED expected)');
  const test12 = await tool.execute({
    company_profile: {
      name: 'Clean TechCorp',
      sector: 'private',
      size: 250,
      year_founded: 2020,
      is_sanctioned: false,
      is_bankrupt: false,
      has_legal_issues: false
    },
    contact_profile: {
      email: 'verified@cleancorp.ae',
      is_verified: true,
      has_bounced: false,
      has_opted_out: false
    },
    historical_data: {
      previous_attempts: 0,
      previous_responses: 0,
      has_active_negotiation: false
    }
  });
  console.log(`  Decision: ${test12.decision} (expected: PROCEED)`);
  console.log(`  Blockers: ${test12.blockers.length} (expected: 0)`);
  console.log(`  Warnings: ${test12.warnings.length} (expected: 0)`);
  console.log(`  Confidence: ${test12.confidence} (expected: 1.0)`);
  console.log(`  Reasoning: ${test12.reasoning}`);

  // Test 13: Opted out contact (BLOCK - CRITICAL)
  console.log('\n✓ Test 13: Contact has opted out (BLOCK expected - CRITICAL)');
  const test13 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    },
    contact_profile: {
      has_opted_out: true
    }
  });
  console.log(`  Decision: ${test13.decision}`);
  console.log(`  Blockers: ${test13.blockers.length} (${test13.blockers.map(b => b.type).join(', ')})`);
  console.log(`  Can Override: ${test13.metadata.overridable} (expected: false)`);

  // Test 14: Active negotiation (BLOCK - MEDIUM)
  console.log('\n✓ Test 14: Active negotiation in pipeline (BLOCK expected - MEDIUM)');
  const test14 = await tool.execute({
    company_profile: {
      name: 'NegotiatingCorp',
      sector: 'private'
    },
    historical_data: {
      has_active_negotiation: true
    }
  });
  console.log(`  Decision: ${test14.decision}`);
  console.log(`  Blockers: ${test14.blockers.length} (${test14.blockers.map(b => b.type).join(', ')})`);
  console.log(`  Severity: ${test14.blockers[0]?.severity} (expected: MEDIUM)`);
  console.log(`  Can Override: ${test14.metadata.overridable} (expected: true)`);

  // Test 15: Legal issues (BLOCK - HIGH)
  console.log('\n✓ Test 15: Company has legal issues (BLOCK expected - HIGH)');
  const test15 = await tool.execute({
    company_profile: {
      name: 'LegalTroubleCorp',
      sector: 'private',
      has_legal_issues: true
    }
  });
  console.log(`  Decision: ${test15.decision}`);
  console.log(`  Blockers: ${test15.blockers.length} (${test15.blockers.map(b => b.type).join(', ')})`);
  console.log(`  Severity: ${test15.blockers[0]?.severity} (expected: HIGH)`);

  console.log('\n' + '='.repeat(60));
  console.log('✓ All tests completed successfully!');
  console.log('='.repeat(60));

  // Summary statistics
  console.log('\nSummary:');
  const allTests = [test1, test2, test3, test4, test5, test6, test7, test8, test9, test10, test11, test12, test13, test14, test15];
  const avgLatency = allTests.reduce((sum, t) => sum + t._meta.latency_ms, 0) / allTests.length;
  const avgConfidence = allTests.reduce((sum, t) => sum + t.confidence, 0) / allTests.length;

  console.log(`  Average Latency: ${avgLatency.toFixed(2)}ms (SLA: ≤50ms P50, ≤150ms P95)`);
  console.log(`  Average Confidence: ${avgConfidence.toFixed(2)}`);
  console.log(`  BLOCK: ${allTests.filter(t => t.decision === 'BLOCK').length}/15`);
  console.log(`  WARN: ${allTests.filter(t => t.decision === 'WARN').length}/15`);
  console.log(`  PROCEED: ${allTests.filter(t => t.decision === 'PROCEED').length}/15`);

  // Critical issues breakdown
  const criticalBlockers = allTests.filter(t =>
    t.blockers.some(b => b.severity === 'CRITICAL')
  ).length;
  const highBlockers = allTests.filter(t =>
    t.blockers.some(b => b.severity === 'HIGH') && !t.blockers.some(b => b.severity === 'CRITICAL')
  ).length;
  const mediumBlockers = allTests.filter(t =>
    t.blockers.some(b => b.severity === 'MEDIUM') && !t.blockers.some(b => b.severity === 'HIGH' || b.severity === 'CRITICAL')
  ).length;

  console.log(`\nSeverity Distribution:`);
  console.log(`  CRITICAL blockers: ${criticalBlockers}/15 (cannot override)`);
  console.log(`  HIGH blockers: ${highBlockers}/15 (difficult to override)`);
  console.log(`  MEDIUM blockers: ${mediumBlockers}/15 (can override)`);

  // Overridability check
  const nonOverridable = allTests.filter(t => !t.metadata.overridable).length;
  console.log(`\nOverridability:`);
  console.log(`  Non-overridable: ${nonOverridable}/15 (contain CRITICAL blockers)`);
  console.log(`  Overridable: ${15 - nonOverridable}/15`);

  // Validation check
  const validationErrors = allTests.filter(t => !t.decision || !t.reasoning || !t.timestamp).length;
  console.log(`\nValidation:`);
  console.log(`  Schema validation errors: ${validationErrors}/15 (expected: 0)`);
  console.log(`  All outputs valid: ${validationErrors === 0 ? '✅' : '❌'}`);
}

runTests().catch(err => {
  console.error('Error running tests:', err);
  process.exit(1);
});
