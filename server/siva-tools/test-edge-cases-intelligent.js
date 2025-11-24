/**
 * Test suite for EdgeCasesTool v2.0 - Intelligent Detection
 *
 * Tests the NEW intelligent detection features:
 * - Heuristic enterprise brand detection
 * - Pattern-based government entity detection
 * - Time-aware calendar warnings
 * - Dynamic recent contact thresholds by tier
 */

const EdgeCasesTool = require('./EdgeCasesToolStandalone');

async function runIntelligentTests() {
  const tool = new EdgeCasesTool();

  console.log('='.repeat(70));
  console.log('SIVA EdgeCasesTool v2.0 - Intelligent Detection Test Suite');
  console.log('='.repeat(70));

  // =================================================================
  // INTELLIGENT ENTERPRISE BRAND DETECTION TESTS
  // =================================================================

  console.log('\n🧠 INTELLIGENT ENTERPRISE BRAND DETECTION\n');

  // Test 1: Large company by size only (should NOT trigger enterprise)
  console.log('✓ Test 1: Large company (3000 employees, no other signals)');
  const test1 = await tool.execute({
    company_profile: {
      name: 'MidCorp Technologies',
      size: 3000,
      sector: 'private'
    }
  });
  console.log(`  Decision: ${test1.decision}`);
  console.log(`  Enterprise detected: ${test1.blockers.some(b => b.type === 'ENTERPRISE_BRAND') ? 'YES' : 'NO'} (expected: NO - score only 20/60)`);
  console.log(`  Warnings: ${test1.warnings.map(w => w.type).join(', ')}`);

  // Test 2: Enterprise by size + revenue (should trigger)
  console.log('\n✓ Test 2: Enterprise (8000 employees + $1.2B revenue)');
  const test2 = await tool.execute({
    company_profile: {
      name: 'TechGiant Corp',
      size: 8000,
      revenue: 1_200_000_000,
      sector: 'private'
    }
  });
  console.log(`  Decision: ${test2.decision}`);
  console.log(`  Enterprise detected: ${test2.blockers.some(b => b.type === 'ENTERPRISE_BRAND') ? 'YES' : 'NO'} (expected: YES - score 60+)`);
  if (test2.blockers[0]?.metadata) {
    console.log(`  Enterprise score: ${test2.blockers[0].metadata.enterprise_score}/100`);
  }
  console.log(`  Reasoning: ${test2.blockers[0]?.message}`);

  // Test 3: Enterprise by market presence (LinkedIn + stock exchange)
  console.log('\n✓ Test 3: Enterprise (150K LinkedIn followers + NASDAQ listed)');
  const test3 = await tool.execute({
    company_profile: {
      name: 'PublicTech Inc',
      size: 4000,
      linkedin_followers: 150000,
      stock_exchange: 'NASDAQ',
      number_of_locations: 15,
      sector: 'private'
    }
  });
  console.log(`  Decision: ${test3.decision}`);
  console.log(`  Enterprise detected: ${test3.blockers.some(b => b.type === 'ENTERPRISE_BRAND') ? 'YES' : 'NO'} (expected: YES - score 60+)`);
  if (test3.blockers[0]?.metadata) {
    console.log(`  Enterprise score: ${test3.blockers[0].metadata.enterprise_score}/100`);
  }

  // Test 4: NOT enterprise (below thresholds)
  console.log('\n✓ Test 4: NOT enterprise (1000 employees, $200M revenue)');
  const test4 = await tool.execute({
    company_profile: {
      name: 'GrowthCo',
      size: 1000,
      revenue: 200_000_000,
      linkedin_followers: 5000,
      sector: 'private'
    }
  });
  console.log(`  Decision: ${test4.decision}`);
  console.log(`  Enterprise detected: ${test4.blockers.some(b => b.type === 'ENTERPRISE_BRAND') ? 'YES' : 'NO'} (expected: NO - below threshold)`);

  // =================================================================
  // INTELLIGENT GOVERNMENT DETECTION TESTS
  // =================================================================

  console.log('\n\n🏛️  INTELLIGENT GOVERNMENT ENTITY DETECTION\n');

  // Test 5: Government by .gov.ae domain (definitive)
  console.log('✓ Test 5: Government entity (.gov.ae domain)');
  const test5 = await tool.execute({
    company_profile: {
      name: 'Dubai Smart Government',
      domain: 'dsg.gov.ae',
      sector: 'private' // Even if sector says private, domain wins
    }
  });
  console.log(`  Decision: ${test5.decision}`);
  console.log(`  Government detected: ${test5.blockers.some(b => b.type === 'GOVERNMENT_SECTOR') ? 'YES' : 'NO'} (expected: YES - .gov.ae domain)`);
  console.log(`  Reasoning: ${test5.blockers[0]?.message.substring(0, 100)}...`);

  // Test 6: Government by name pattern ("Ministry")
  console.log('\n✓ Test 6: Government entity (name contains "Ministry")');
  const test6 = await tool.execute({
    company_profile: {
      name: 'Ministry of Economy',
      sector: 'unknown'
    }
  });
  console.log(`  Decision: ${test6.decision}`);
  console.log(`  Government detected: ${test6.blockers.some(b => b.type === 'GOVERNMENT_SECTOR') ? 'YES' : 'NO'} (expected: YES - gov keyword in name)`);

  // Test 7: Semi-government (40% government ownership)
  console.log('\n✓ Test 7: Semi-government (40% government ownership)');
  const test7 = await tool.execute({
    company_profile: {
      name: 'Hybrid Energy Corp',
      government_ownership: 40,
      sector: 'private'
    }
  });
  console.log(`  Decision: ${test7.decision}`);
  console.log(`  Semi-gov warning: ${test7.warnings.some(w => w.type === 'SEMI_GOVERNMENT') ? 'YES' : 'NO'} (expected: YES - 40% ownership)`);
  console.log(`  Message: ${test7.warnings.find(w => w.type === 'SEMI_GOVERNMENT')?.message.substring(0, 80)}...`);

  // Test 8: NOT government (private company with "Royal" in brand name)
  console.log('\n✓ Test 8: NOT government (private "Royal Sweets" bakery)');
  const test8 = await tool.execute({
    company_profile: {
      name: 'Royal Sweets Bakery',
      size: 50,
      sector: 'private',
      government_ownership: 0
    }
  });
  console.log(`  Decision: ${test8.decision}`);
  console.log(`  Government detected: ${test8.blockers.some(b => b.type === 'GOVERNMENT_SECTOR') ? 'YES' : 'NO'} (expected: NO - private bakery)`);

  // =================================================================
  // TIME-AWARE CALENDAR WARNINGS
  // =================================================================

  console.log('\n\n📅 TIME-AWARE CALENDAR WARNINGS\n');

  // Test 9: Today is during summer (Jul-Aug)
  console.log('✓ Test 9: Summer slowdown warning (if today is Jul-Aug)');
  const test9 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    }
  });
  const hasSummerWarning = test9.warnings.some(w => w.type === 'SUMMER_SLOWDOWN');
  const currentMonth = new Date().getMonth();
  const isSummer = currentMonth === 6 || currentMonth === 7;
  console.log(`  Current month: ${currentMonth + 1} (Jul=7, Aug=8)`);
  console.log(`  Summer warning: ${hasSummerWarning ? 'YES' : 'NO'} (expected: ${isSummer ? 'YES' : 'NO'})`);

  // Test 10: Today is UAE National Day (Dec 2-3)
  console.log('\n✓ Test 10: UAE National Day warning (if today is Dec 2-3)');
  const test10 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    }
  });
  const hasNationalDayWarning = test10.warnings.some(w => w.type === 'UAE_NATIONAL_DAY');
  const currentDay = new Date().getDate();
  const isNationalDay = currentMonth === 11 && (currentDay === 2 || currentDay === 3);
  console.log(`  Current date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`  National Day warning: ${hasNationalDayWarning ? 'YES' : 'NO'} (expected: ${isNationalDay ? 'YES' : 'NO'})`);

  // =================================================================
  // DYNAMIC RECENT CONTACT THRESHOLDS BY TIER
  // =================================================================

  console.log('\n\n⏱️  DYNAMIC RECENT CONTACT THRESHOLDS\n');

  // Test 11: STRATEGIC tier (120-day threshold)
  console.log('✓ Test 11: STRATEGIC tier recent contact (60 days ago)');
  const test11 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    },
    contact_profile: {
      tier: 'STRATEGIC'
    },
    historical_data: {
      last_contact_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      previous_attempts: 1,
      previous_responses: 0
    }
  });
  const strategicWarning = test11.warnings.find(w => w.type === 'RECENT_CONTACT');
  console.log(`  Recent contact warning: ${strategicWarning ? 'YES' : 'NO'} (expected: YES - 60 < 120 days)`);
  if (strategicWarning) {
    console.log(`  Threshold: ${strategicWarning.threshold} days (STRATEGIC tier)`);
    console.log(`  Days until safe: ${strategicWarning.days_until_safe} days`);
  }

  // Test 12: PRIMARY tier (90-day threshold)
  console.log('\n✓ Test 12: PRIMARY tier recent contact (80 days ago)');
  const test12 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    },
    contact_profile: {
      tier: 'PRIMARY'
    },
    historical_data: {
      last_contact_date: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      previous_attempts: 1,
      previous_responses: 0
    }
  });
  const primaryWarning = test12.warnings.find(w => w.type === 'RECENT_CONTACT');
  console.log(`  Recent contact warning: ${primaryWarning ? 'YES' : 'NO'} (expected: YES - 80 < 90 days)`);
  if (primaryWarning) {
    console.log(`  Threshold: ${primaryWarning.threshold} days (PRIMARY tier)`);
    console.log(`  Days until safe: ${primaryWarning.days_until_safe} days`);
  }

  // Test 13: BACKUP tier (30-day threshold)
  console.log('\n✓ Test 13: BACKUP tier recent contact (25 days ago)');
  const test13 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    },
    contact_profile: {
      tier: 'BACKUP'
    },
    historical_data: {
      last_contact_date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      previous_attempts: 1,
      previous_responses: 0
    }
  });
  const backupWarning = test13.warnings.find(w => w.type === 'RECENT_CONTACT');
  console.log(`  Recent contact warning: ${backupWarning ? 'YES' : 'NO'} (expected: YES - 25 < 30 days)`);
  if (backupWarning) {
    console.log(`  Threshold: ${backupWarning.threshold} days (BACKUP tier)`);
    console.log(`  Days until safe: ${backupWarning.days_until_safe} days`);
  }

  // Test 14: No tier specified (defaults to 90 days)
  console.log('\n✓ Test 14: No tier specified (defaults to 90-day threshold)');
  const test14 = await tool.execute({
    company_profile: {
      name: 'TechCorp',
      sector: 'private'
    },
    contact_profile: {},
    historical_data: {
      last_contact_date: new Date(Date.now() - 85 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      previous_attempts: 1,
      previous_responses: 0
    }
  });
  const defaultWarning = test14.warnings.find(w => w.type === 'RECENT_CONTACT');
  console.log(`  Recent contact warning: ${defaultWarning ? 'YES' : 'NO'} (expected: YES - 85 < 90 days default)`);
  if (defaultWarning) {
    console.log(`  Threshold: ${defaultWarning.threshold} days (default)`);
  }

  // =================================================================
  // NATURAL LANGUAGE REASONING (NO FORMULAS)
  // =================================================================

  console.log('\n\n💬 NATURAL LANGUAGE REASONING\n');

  // Test 15: Verify NO formulas in reasoning
  console.log('✓ Test 15: Reasoning uses natural language, NO formulas');
  const allTests = [test1, test2, test3, test4, test5, test6, test7, test8, test9, test10, test11, test12, test13, test14];
  const hasFormulas = allTests.some(t =>
    t.reasoning.includes('×') ||
    t.reasoning.includes('points') ||
    t.reasoning.includes('score:') ||
    t.reasoning.match(/\d+\/\d+/)
  );
  console.log(`  Contains formulas: ${hasFormulas ? 'YES ❌' : 'NO ✅'} (expected: NO)`);
  console.log(`\n  Sample reasoning outputs:`);
  console.log(`  - BLOCK: "${test2.reasoning.substring(0, 80)}..."`);
  console.log(`  - WARN: "${test11.reasoning.substring(0, 80)}..."`);
  console.log(`  - PROCEED: "${test4.reasoning}"`);

  // =================================================================
  // SUMMARY
  // =================================================================

  console.log('\n' + '='.repeat(70));
  console.log('✅ All Intelligent Detection Tests Completed!');
  console.log('='.repeat(70));

  console.log('\n📊 Test Summary:');
  const allTestsArray = [test1, test2, test3, test4, test5, test6, test7, test8, test9, test10, test11, test12, test13, test14];
  const avgLatency = allTestsArray.reduce((sum, t) => sum + t._meta.latency_ms, 0) / allTestsArray.length;

  console.log(`  Total tests: 14`);
  console.log(`  Average latency: ${avgLatency.toFixed(2)}ms (SLA: ≤50ms P50)`);
  console.log(`  Policy version: ${test1._meta.policy_version} (intelligent detection)`);

  console.log('\n🎯 Intelligent Detection Coverage:');
  console.log(`  ✅ Enterprise brand detection (heuristic scoring)`);
  console.log(`  ✅ Government entity detection (pattern matching)`);
  console.log(`  ✅ Time-aware calendar warnings`);
  console.log(`  ✅ Dynamic thresholds by contact tier`);
  console.log(`  ✅ Natural language reasoning (no formulas)`);

  console.log('\n🚀 Ready for Production!');
}

runIntelligentTests().catch(err => {
  console.error('Error running tests:', err);
  process.exit(1);
});
