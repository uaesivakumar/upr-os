#!/usr/bin/env node
/**
 * Sprint 25 - Day 3: BankingProductMatch Rule Engine Testing
 *
 * Tests BankingProductMatchRuleEngineV1 against inline implementation with 5 sample cases
 * Target: 95%+ match rate
 *
 * Test cases cover:
 * 1. Small startup (10 employees, fintech, expansion signal)
 * 2. SME (45 employees, technology, hiring+expansion signals)
 * 3. Mid-market (300 employees, healthcare, funding signal)
 * 4. Enterprise (750 employees, construction, no signals)
 * 5. Large enterprise (1500 employees, hospitality, multiple signals)
 *
 * Usage: node scripts/sprint25/testBankingProductRuleEngine.js
 */

import { BankingProductMatchRuleEngineV1 } from '../../server/agent-core/BankingProductMatchRuleEngineV1.js';
import BankingProductMatchToolStandalone from '../../server/siva-tools/BankingProductMatchToolStandalone.js';

const tool = new BankingProductMatchToolStandalone();
const engine = new BankingProductMatchRuleEngineV1();

console.log('═══════════════════════════════════════════════════════════');
console.log('Sprint 25 - BankingProductMatch Rule Engine Testing');
console.log('Testing v1.0 rule engine against inline implementation');
console.log('Target: 95%+ match rate across 5 test cases');
console.log('═══════════════════════════════════════════════════════════\n');

const testCases = [
  {
    name: 'Test 1: Small startup (fintech, expansion)',
    input: {
      company_size: 10,
      industry: 'fintech',
      signals: ['expansion'],
      uae_employees: 10,
      average_salary_aed: 12000,
      has_free_zone_license: true
    },
    expectedSegment: 'startup'
  },
  {
    name: 'Test 2: SME (technology, hiring+expansion)',
    input: {
      company_size: 45,
      industry: 'technology',
      signals: ['hiring', 'expansion'],
      uae_employees: 45,
      average_salary_aed: 15000,
      has_free_zone_license: false
    },
    expectedSegment: 'sme'
  },
  {
    name: 'Test 3: Mid-market (healthcare, funding)',
    input: {
      company_size: 300,
      industry: 'healthcare',
      signals: ['funding'],
      uae_employees: 300,
      average_salary_aed: 18000,
      has_free_zone_license: false
    },
    expectedSegment: 'mid-market'
  },
  {
    name: 'Test 4: Enterprise (construction, no signals)',
    input: {
      company_size: 750,
      industry: 'construction',
      signals: [],
      uae_employees: 750,
      average_salary_aed: 8000,
      has_free_zone_license: false
    },
    expectedSegment: 'enterprise'
  },
  {
    name: 'Test 5: Large enterprise (hospitality, multiple signals)',
    input: {
      company_size: 1500,
      industry: 'hospitality',
      signals: ['expansion', 'hiring', 'award'],
      uae_employees: 1500,
      average_salary_aed: 10000,
      has_free_zone_license: true
    },
    expectedSegment: 'enterprise'
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
      const productCountMatch = inlineResult.recommended_products.length === ruleResult.recommended_products.length;

      // Compare top 3 products (product_id and fit_score)
      let topProductsMatch = true;
      const topN = Math.min(3, inlineResult.recommended_products.length, ruleResult.recommended_products.length);
      for (let i = 0; i < topN; i++) {
        const inlineProduct = inlineResult.recommended_products[i];
        const ruleProduct = ruleResult.recommended_products[i];
        if (inlineProduct.product_id !== ruleProduct.product_id ||
            Math.abs(inlineProduct.fit_score - ruleProduct.fit_score) > 2) {
          topProductsMatch = false;
          break;
        }
      }

      const segmentMatch = inlineResult.metadata.segment_match === ruleResult.metadata.segment_match;
      const confidenceLevelMatch = inlineResult.metadata.confidenceLevel === ruleResult.metadata.confidenceLevel;

      const overallMatch = productCountMatch && topProductsMatch && segmentMatch && confidenceLevelMatch;

      console.log(`Inline Result:`);
      console.log(`  Products: ${inlineResult.recommended_products.length}, Segment: ${inlineResult.metadata.segment_match}, Confidence: ${inlineResult.metadata.confidenceLevel}`);
      console.log(`  Top 3: ${inlineResult.recommended_products.slice(0, 3).map(p => `${p.product_name} (${p.fit_score})`).join(', ')}`);

      console.log(`\nRule Engine Result:`);
      console.log(`  Products: ${ruleResult.recommended_products.length}, Segment: ${ruleResult.metadata.segment_match}, Confidence: ${ruleResult.metadata.confidenceLevel}`);
      console.log(`  Top 3: ${ruleResult.recommended_products.slice(0, 3).map(p => `${p.product_name} (${p.fit_score})`).join(', ')}`);

      console.log(`\nComparison:`);
      console.log(`  Product Count Match: ${productCountMatch ? '✅' : '❌'}`);
      console.log(`  Top 3 Products Match: ${topProductsMatch ? '✅' : '❌'}`);
      console.log(`  Segment Match: ${segmentMatch ? '✅' : '❌'}`);
      console.log(`  Confidence Level Match: ${confidenceLevelMatch ? '✅' : '❌'}`);

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
          products: inlineResult.recommended_products.length,
          segment: inlineResult.metadata.segment_match,
          confidenceLevel: inlineResult.metadata.confidenceLevel,
          topProduct: inlineResult.recommended_products[0]?.product_name
        },
        rule: {
          products: ruleResult.recommended_products.length,
          segment: ruleResult.metadata.segment_match,
          confidenceLevel: ruleResult.metadata.confidenceLevel,
          topProduct: ruleResult.recommended_products[0]?.product_name
        }
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
    console.log(`\nBankingProductMatch Rule Engine v1.0 is ready for integration.`);
  } else if (matchRate >= 80) {
    console.log(`\n⚠️  GOOD - Rule engine achieves 80%+ match rate, but needs tuning.`);
  } else {
    console.log(`\n❌ NEEDS WORK - Rule engine below 80% match rate, requires debugging.`);
  }

  console.log('\n📋 Detailed Results:');
  results.forEach((result, i) => {
    const status = result.pass ? '✅' : '❌';
    console.log(`  ${status} ${result.test}`);
    if (!result.pass && !result.error) {
      console.log(`      Inline: ${result.inline.topProduct} (${result.inline.segment}, ${result.inline.confidenceLevel})`);
      console.log(`      Rule:   ${result.rule.topProduct} (${result.rule.segment}, ${result.rule.confidenceLevel})`);
    }
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

  const outputPath = path.join(__dirname, 'bankingProductRuleEngineTestResults.json');
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
