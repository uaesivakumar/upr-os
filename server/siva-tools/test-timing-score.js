/**
 * Quick test script for TimingScoreToolStandalone
 */

const TimingScoreTool = require('./TimingScoreToolStandalone');

async function runTests() {
  const tool = new TimingScoreTool();

  console.log('='.repeat(60));
  console.log('SIVA TimingScoreTool - Test Suite');
  console.log('='.repeat(60));

  // Test 1: Perfect timing (Q1 + fresh signal)
  console.log('\n✓ Test 1: Q1 budget season + fresh signal (OPTIMAL expected)');
  const test1 = await tool.execute({
    signal_age: 3,
    signal_type: 'hiring',
    current_date: '2025-01-15',
    fiscal_context: { quarter: 'Q1' }
  });
  console.log(`  Multiplier: ×${test1.timing_multiplier} (expected ~1.95)`);
  console.log(`  Category: ${test1.category}`);
  console.log(`  Confidence: ${test1.confidence}`);
  console.log(`  Reasoning: ${test1.reasoning}`);
  console.log(`  Latency: ${test1._meta.latency_ms}ms`);

  // Test 2: Ramadan period (POOR expected)
  console.log('\n✓ Test 2: During Ramadan (POOR expected)');
  const test2 = await tool.execute({
    current_date: '2025-03-15',
    fiscal_context: { is_ramadan: true }
  });
  console.log(`  Multiplier: ×${test2.timing_multiplier} (expected ~0.3)`);
  console.log(`  Category: ${test2.category}`);
  console.log(`  Calendar Context: ${test2.metadata.calendar_context}`);
  console.log(`  Next Optimal: ${test2.metadata.next_optimal_window}`);

  // Test 3: Summer + stale signal (POOR expected)
  console.log('\n✓ Test 3: Summer slowdown + stale signal (POOR expected)');
  const test3 = await tool.execute({
    signal_age: 200,
    signal_type: 'hiring',
    current_date: '2025-07-20',
    fiscal_context: { quarter: 'Q3', is_summer: true }
  });
  console.log(`  Multiplier: ×${test3.timing_multiplier} (expected ~0.21)`);
  console.log(`  Category: ${test3.category}`);
  console.log(`  Signal Freshness: ${test3.metadata.signal_freshness}`);
  console.log(`  Reasoning: ${test3.reasoning}`);

  // Test 4: Standard timing (GOOD expected)
  console.log('\n✓ Test 4: Q2 standard with recent signal (GOOD expected)');
  const test4 = await tool.execute({
    signal_age: 45,
    signal_type: 'funding',
    current_date: '2025-05-10',
    fiscal_context: { quarter: 'Q2' }
  });
  console.log(`  Multiplier: ×${test4.timing_multiplier}`);
  console.log(`  Category: ${test4.category}`);
  console.log(`  Signal Freshness: ${test4.metadata.signal_freshness}`);

  // Test 5: Q4 budget freeze + recent signal (FAIR expected)
  console.log('\n✓ Test 5: Q4 budget freeze + warm signal (FAIR expected)');
  const test5 = await tool.execute({
    signal_age: 10,
    signal_type: 'expansion',
    current_date: '2025-12-15',
    fiscal_context: { quarter: 'Q4' }
  });
  console.log(`  Multiplier: ×${test5.timing_multiplier} (expected ~0.78)`);
  console.log(`  Category: ${test5.category}`);
  console.log(`  Calendar: ${test5.metadata.calendar_multiplier}`);
  console.log(`  Signal Recency: ${test5.metadata.signal_recency_multiplier}`);

  // Test 6: Post-Eid recovery (FAIR expected)
  console.log('\n✓ Test 6: Post-Eid recovery period (FAIR expected)');
  const test6 = await tool.execute({
    current_date: '2025-04-05',
    fiscal_context: { is_post_eid: true }
  });
  console.log(`  Multiplier: ×${test6.timing_multiplier} (expected ~0.8)`);
  console.log(`  Category: ${test6.category}`);
  console.log(`  Calendar Context: ${test6.metadata.calendar_context}`);

  // Test 7: Hiring signal fast decay
  console.log('\n✓ Test 7: Hiring signal with fast decay (60 days)');
  const test7 = await tool.execute({
    signal_age: 60,
    signal_type: 'hiring',
    current_date: '2025-02-01',
    fiscal_context: { quarter: 'Q1' }
  });
  console.log(`  Multiplier: ×${test7.timing_multiplier}`);
  console.log(`  Signal Type: hiring (fast decay rate: 0.90/week)`);
  console.log(`  Signal Freshness: ${test7.metadata.signal_freshness}`);

  // Test 8: Expansion signal slow decay
  console.log('\n✓ Test 8: Expansion signal with slow decay (60 days)');
  const test8 = await tool.execute({
    signal_age: 60,
    signal_type: 'expansion',
    current_date: '2025-02-01',
    fiscal_context: { quarter: 'Q1' }
  });
  console.log(`  Multiplier: ×${test8.timing_multiplier}`);
  console.log(`  Signal Type: expansion (slow decay rate: 0.98/week)`);
  console.log(`  Comparison: expansion has higher multiplier than hiring for same age`);

  // Test 9: UAE National Day
  console.log('\n✓ Test 9: UAE National Day (Dec 2) - reduced activity');
  const test9 = await tool.execute({
    current_date: '2025-12-02'
  });
  console.log(`  Multiplier: ×${test9.timing_multiplier} (expected ~0.8)`);
  console.log(`  Calendar Context: ${test9.metadata.calendar_context}`);

  // Test 10: Pre-Ramadan rush (Q2)
  console.log('\n✓ Test 10: Pre-Ramadan rush in Q2');
  const test10 = await tool.execute({
    current_date: '2025-02-20', // ~1 week before Ramadan
    fiscal_context: { quarter: 'Q2' }
  });
  console.log(`  Multiplier: ×${test10.timing_multiplier}`);
  console.log(`  Calendar Context: ${test10.metadata.calendar_context}`);
  console.log(`  Reasoning: ${test10.reasoning}`);

  // Test 11: HOT signal (< 7 days)
  console.log('\n✓ Test 11: Very fresh signal - strike while hot!');
  const test11 = await tool.execute({
    signal_age: 2,
    signal_type: 'funding',
    current_date: '2025-05-10',
    fiscal_context: { quarter: 'Q2' }
  });
  console.log(`  Multiplier: ×${test11.timing_multiplier}`);
  console.log(`  Signal Freshness: ${test11.metadata.signal_freshness} (HOT)`);
  console.log(`  Signal Recency Multiplier: ${test11.metadata.signal_recency_multiplier} (should be ~1.5)`);

  // Test 12: No signal age provided (lower confidence)
  console.log('\n✓ Test 12: No signal age provided (lower confidence expected)');
  const test12 = await tool.execute({
    current_date: '2025-01-15',
    fiscal_context: { quarter: 'Q1' }
  });
  console.log(`  Multiplier: ×${test12.timing_multiplier}`);
  console.log(`  Confidence: ${test12.confidence} (should be < 0.85 due to missing signal age)`);
  console.log(`  Signal Freshness: ${test12.metadata.signal_freshness}`);

  console.log('\n' + '='.repeat(60));
  console.log('✓ All tests completed successfully!');
  console.log('='.repeat(60));

  // Summary statistics
  console.log('\nSummary:');
  const allTests = [test1, test2, test3, test4, test5, test6, test7, test8, test9, test10, test11, test12];
  const avgLatency = allTests.reduce((sum, t) => sum + t._meta.latency_ms, 0) / allTests.length;
  const avgConfidence = allTests.reduce((sum, t) => sum + t.confidence, 0) / allTests.length;
  const avgMultiplier = allTests.reduce((sum, t) => sum + t.timing_multiplier, 0) / allTests.length;

  console.log(`  Average Latency: ${avgLatency.toFixed(2)}ms (SLA: ≤120ms P50, ≤300ms P95)`);
  console.log(`  Average Confidence: ${avgConfidence.toFixed(2)}`);
  console.log(`  Average Multiplier: ${avgMultiplier.toFixed(2)}`);
  console.log(`  OPTIMAL: ${allTests.filter(t => t.category === 'OPTIMAL').length}/12`);
  console.log(`  GOOD: ${allTests.filter(t => t.category === 'GOOD').length}/12`);
  console.log(`  FAIR: ${allTests.filter(t => t.category === 'FAIR').length}/12`);
  console.log(`  POOR: ${allTests.filter(t => t.category === 'POOR').length}/12`);

  // Test signal decay comparison
  console.log('\nSignal Decay Comparison (60-day old signals):');
  console.log(`  Hiring (fast decay 0.90): ×${test7.timing_multiplier}`);
  console.log(`  Expansion (slow decay 0.98): ×${test8.timing_multiplier}`);
  console.log(`  Difference: ${((test8.timing_multiplier / test7.timing_multiplier - 1) * 100).toFixed(1)}% higher for expansion`);
}

runTests().catch(err => {
  console.error('Error running tests:', err);
  process.exit(1);
});
