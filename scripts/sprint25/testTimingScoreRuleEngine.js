#!/usr/bin/env node
/**
 * Sprint 25 - Day 1: TimingScore Rule Engine Testing
 *
 * Tests TimingScoreRuleEngineV1 against inline implementation with 5 sample cases
 * Target: 95%+ match rate
 *
 * Test cases cover:
 * 1. Q4 Early Freeze + HOT signal (hiring) - GOOD timing
 * 2. Q1 Budget Season + WARM signal (funding) - OPTIMAL timing
 * 3. Ramadan + COLD signal (expansion) - POOR timing
 * 4. Q3 Summer + STALE signal (other) - POOR timing
 * 5. Q2 Standard + RECENT signal (award) - GOOD timing
 *
 * Usage: node scripts/sprint25/testTimingScoreRuleEngine.js
 */

import { TimingScoreRuleEngineV1 } from '../../server/agent-core/TimingScoreRuleEngineV1.js';
import TimingScoreToolStandalone from '../../server/siva-tools/TimingScoreToolStandalone.js';

const tool = new TimingScoreToolStandalone();
const engine = new TimingScoreRuleEngineV1();

console.log('═══════════════════════════════════════════════════════════');
console.log('Sprint 25 - TimingScore Rule Engine Testing');
console.log('Testing v1.0 rule engine against inline implementation');
console.log('Target: 95%+ match rate across 5 test cases');
console.log('═══════════════════════════════════════════════════════════\n');

const testCases = [
  {
    name: 'Test 1: Q4 Early Freeze + HOT signal (hiring)',
    input: {
      signal_type: 'hiring',
      signal_age: 7,
      current_date: '2025-11-15',
      fiscal_context: {}
    },
    expectedCategory: 'GOOD',
    expectedMultiplierRange: [1.2, 1.25]
  },
  {
    name: 'Test 2: Q1 Budget Season + WARM signal (funding)',
    input: {
      signal_type: 'funding',
      signal_age: 10,
      current_date: '2025-01-20',
      fiscal_context: { quarter: 'Q1' }
    },
    expectedCategory: 'OPTIMAL',
    expectedMultiplierRange: [1.5, 1.7]
  },
  {
    name: 'Test 3: Ramadan + COLD signal (expansion)',
    input: {
      signal_type: 'expansion',
      signal_age: 150,
      current_date: '2025-03-15',
      fiscal_context: { is_ramadan: true }
    },
    expectedCategory: 'POOR',
    expectedMultiplierRange: [0.1, 0.2]
  },
  {
    name: 'Test 4: Q3 Summer + STALE signal (other)',
    input: {
      signal_type: 'other',
      signal_age: 200,
      current_date: '2025-07-20',
      fiscal_context: { is_summer: true }
    },
    expectedCategory: 'POOR',
    expectedMultiplierRange: [0.0, 0.3]
  },
  {
    name: 'Test 5: Q2 Standard + RECENT signal (award)',
    input: {
      signal_type: 'award',
      signal_age: 25,
      current_date: '2025-05-10',
      fiscal_context: { quarter: 'Q2' }
    },
    expectedCategory: 'GOOD',
    expectedMultiplierRange: [1.0, 1.2]
  }
];

async function runTests() {
  let passCount = 0;
  const results = [];

  for (const testCase of testCases) {
    console.log(`\n🔍 ${testCase.name}`);
    console.log('─────────────────────────────────────────────────────────');

    try {
      // Run inline implementation
      const inlineResult = await tool._executeInternal(testCase.input);

      // Run rule engine
      const ruleResult = await engine.execute(testCase.input);

      // Compare results
      const multiplierMatch = Math.abs(inlineResult.timing_multiplier - ruleResult.timing_multiplier) < 0.02;
      const categoryMatch = inlineResult.category === ruleResult.category;
      const contextMatch = inlineResult.metadata.calendar_context === ruleResult.metadata.calendar_context;
      const freshnessMatch = inlineResult.metadata.signal_freshness === ruleResult.metadata.signal_freshness;

      const overallMatch = multiplierMatch && categoryMatch && contextMatch && freshnessMatch;

      console.log(`Inline Result:`);
      console.log(`  Multiplier: ${inlineResult.timing_multiplier}, Category: ${inlineResult.category}`);
      console.log(`  Calendar: ${inlineResult.metadata.calendar_context}, Freshness: ${inlineResult.metadata.signal_freshness}`);

      console.log(`\nRule Engine Result:`);
      console.log(`  Multiplier: ${ruleResult.timing_multiplier}, Category: ${ruleResult.category}`);
      console.log(`  Calendar: ${ruleResult.metadata.calendar_context}, Freshness: ${ruleResult.metadata.signal_freshness}`);

      console.log(`\nComparison:`);
      console.log(`  Multiplier Match: ${multiplierMatch ? '✅' : '❌'} (diff: ${Math.abs(inlineResult.timing_multiplier - ruleResult.timing_multiplier).toFixed(3)})`);
      console.log(`  Category Match: ${categoryMatch ? '✅' : '❌'}`);
      console.log(`  Calendar Context Match: ${contextMatch ? '✅' : '❌'}`);
      console.log(`  Signal Freshness Match: ${freshnessMatch ? '✅' : '❌'}`);

      if (overallMatch) {
        console.log(`\n✅ PASS - Perfect match!`);
        passCount++;
      } else {
        console.log(`\n⚠️  PARTIAL MATCH - Some fields differ`);
      }

      results.push({
        test: testCase.name,
        pass: overallMatch,
        inline: {
          multiplier: inlineResult.timing_multiplier,
          category: inlineResult.category,
          calendar: inlineResult.metadata.calendar_context,
          freshness: inlineResult.metadata.signal_freshness
        },
        rule: {
          multiplier: ruleResult.timing_multiplier,
          category: ruleResult.category,
          calendar: ruleResult.metadata.calendar_context,
          freshness: ruleResult.metadata.signal_freshness
        },
        diff: Math.abs(inlineResult.timing_multiplier - ruleResult.timing_multiplier)
      });

    } catch (error) {
      console.log(`\n❌ ERROR: ${error.message}`);
      console.error(error.stack);
      results.push({
        test: testCase.name,
        pass: false,
        error: error.message
      });
    }
  }

  // Summary
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');

  const matchRate = (passCount / testCases.length) * 100;
  console.log(`\nTests Passed: ${passCount}/${testCases.length} (${matchRate.toFixed(1)}%)`);

  if (matchRate >= 95) {
    console.log(`\n✅ SUCCESS - Rule engine achieves 95%+ match rate!`);
    console.log(`\nTimingScore Rule Engine v1.0 is ready for integration.`);
  } else if (matchRate >= 80) {
    console.log(`\n⚠️  GOOD - Rule engine achieves 80%+ match rate, but needs tuning.`);
  } else {
    console.log(`\n❌ NEEDS WORK - Rule engine below 80% match rate, requires debugging.`);
  }

  console.log('\n📋 Detailed Results:');
  results.forEach((result, i) => {
    const status = result.pass ? '✅' : '❌';
    const diff = result.diff !== undefined ? ` (diff: ${result.diff.toFixed(3)})` : '';
    console.log(`  ${status} ${result.test}${diff}`);
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ Testing complete!');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Write results to file
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const outputPath = path.join(__dirname, 'timingScoreRuleEngineTestResults.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    matchRate,
    passCount,
    totalTests: testCases.length,
    results
  }, null, 2));
  console.log(`📁 Results saved to: ${outputPath}\n`);

  process.exit(matchRate >= 95 ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
