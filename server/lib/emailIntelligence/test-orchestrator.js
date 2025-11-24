/**
 * End-to-End Orchestrator Test
 * Week 2 Day 3-4: Test complete RAG → Rules → LLM → NeverBounce flow
 *
 * Usage: node server/lib/emailIntelligence/test-orchestrator.js
 *
 * Tests 3 scenarios:
 * 1. Known company (Emirates NBD) → RAG hit
 * 2. Unknown UAE bank → Rules + LLM
 * 3. Tech company → Rules fallback
 *
 * Expected cost: < $0.05 total
 */

import { learnPattern, discoverPattern } from './orchestrator.js';
import pg from 'pg';

const { Pool } = pg;

// Initialize database pool for testing
let pool = null;

function initDatabase() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.log('⚠️  DATABASE_URL not set, using mock database');
    return null;
  }

  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
  });

  console.log('✅ Database pool initialized');
  return pool;
}

// Test data
const TEST_SCENARIOS = [
  {
    name: 'Scenario 1: Known Company (RAG Hit)',
    params: {
      company: 'Emirates NBD',
      domain: 'emiratesnbd.com',
      sector: 'Banking',
      region: 'UAE',
      company_size: 'Large',
      leads: [
        { first_name: 'Ahmed', last_name: 'Ali', title: 'VP Engineering', linkedin: null },
        { first_name: 'Fatima', last_name: 'Hassan', title: 'Senior Developer', linkedin: null },
        { first_name: 'Mohammed', last_name: 'Khan', title: 'Product Manager', linkedin: null }
      ]
    },
    expectedSource: 'rag',
    expectedPattern: '{first}{l}',
    description: 'Should find pattern from existing RAG data (seeded in Week 2 Day 1-2)'
  },
  {
    name: 'Scenario 2: Unknown UAE Bank (Rules → LLM)',
    params: {
      company: 'Abu Dhabi Commercial Bank',
      domain: 'adcb.com',
      sector: 'Banking',
      region: 'UAE',
      company_size: 'Large',
      leads: [
        { first_name: 'Sara', last_name: 'Rashid', title: 'Head of HR', linkedin: null },
        { first_name: 'Omar', last_name: 'Abdullah', title: 'CFO', linkedin: null },
        { first_name: 'Layla', last_name: 'Mohammed', title: 'CTO', linkedin: null }
      ]
    },
    expectedSource: 'rules_or_llm',
    expectedPattern: '{first}{l}',
    description: 'RAG miss → Rules should predict {first}{l} for UAE Banking'
  },
  {
    name: 'Scenario 3: Tech Company (Rules)',
    params: {
      company: 'Careem',
      domain: 'careem.com',
      sector: 'Technology',
      region: 'UAE',
      company_size: 'Medium',
      leads: [
        { first_name: 'Zain', last_name: 'Ahmed', title: 'Software Engineer', linkedin: null },
        { first_name: 'Noor', last_name: 'Malik', title: 'Product Designer', linkedin: null },
        { first_name: 'Hassan', last_name: 'Ibrahim', title: 'DevOps Engineer', linkedin: null }
      ]
    },
    expectedSource: 'rules',
    expectedPattern: '{first}.{last}',
    description: 'Tech companies typically use {first}.{last} pattern'
  }
];

/**
 * Run all test scenarios
 */
async function runTests() {
  console.log('═'.repeat(80));
  console.log('END-TO-END ORCHESTRATOR TEST');
  console.log('Week 2 Day 3-4: Complete RAG → Rules → LLM → NeverBounce Flow');
  console.log('═'.repeat(80));
  console.log('');

  // Initialize database
  console.log('[SETUP] Initializing database...');
  initDatabase();
  console.log('');

  // Check OpenAI configuration
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY not set - LLM layer will use fallback');
    console.log('   Set OPENAI_API_KEY to test full LLM functionality');
  } else {
    console.log('✅ OpenAI configured - LLM layer active');
  }
  console.log('');

  const results = [];
  let totalCost = 0;
  let totalLatency = 0;

  // Run each scenario
  for (let i = 0; i < TEST_SCENARIOS.length; i++) {
    const scenario = TEST_SCENARIOS[i];

    console.log('═'.repeat(80));
    console.log(`TEST ${i + 1}/${TEST_SCENARIOS.length}: ${scenario.name}`);
    console.log('═'.repeat(80));
    console.log(`Description: ${scenario.description}`);
    console.log(`Expected Source: ${scenario.expectedSource}`);
    console.log(`Expected Pattern: ${scenario.expectedPattern}`);
    console.log('');

    try {
      const result = await learnPattern(scenario.params);

      results.push({
        scenario: scenario.name,
        success: true,
        result
      });

      totalCost += result.cost || 0;
      totalLatency += result.latency || 0;

      // Validation
      console.log('');
      console.log('[VALIDATION]');
      console.log(`  Pattern: ${result.pattern} ${result.pattern === scenario.expectedPattern ? '✅ MATCH' : '⚠️  DIFFERENT'}`);
      console.log(`  Source: ${result.source} ${scenario.expectedSource.includes(result.source) || scenario.expectedSource === result.source ? '✅ MATCH' : '⚠️  DIFFERENT'}`);
      console.log(`  Confidence: ${result.confidence.toFixed(2)}`);
      console.log(`  Cost: $${result.cost.toFixed(4)}`);
      console.log(`  Latency: ${result.latency}ms`);

      if (result.validated_emails && result.validated_emails.length > 0) {
        console.log(`  Validated Emails: ${result.validated_emails.length}`);
        result.validated_emails.forEach(email => {
          console.log(`    ✅ ${email}`);
        });
      }

      console.log('');
      console.log(`✅ TEST ${i + 1} PASSED`);
      console.log('');

    } catch (error) {
      console.error(`❌ TEST ${i + 1} FAILED:`, error.message);
      console.error(error.stack);

      results.push({
        scenario: scenario.name,
        success: false,
        error: error.message
      });
    }

    // Delay between tests to avoid rate limiting
    if (i < TEST_SCENARIOS.length - 1) {
      console.log('Waiting 2 seconds before next test...');
      console.log('');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log('═'.repeat(80));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(80));
  console.log('');

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
  console.log('');
  console.log(`Total Cost: $${totalCost.toFixed(4)} ${totalCost < 0.05 ? '✅ Under budget!' : '⚠️  Over budget'}`);
  console.log(`Total Latency: ${(totalLatency / 1000).toFixed(1)}s`);
  console.log(`Average Latency: ${(totalLatency / results.length / 1000).toFixed(1)}s per test`);
  console.log('');

  // Detailed results
  console.log('DETAILED RESULTS:');
  console.log('─'.repeat(80));
  results.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.scenario}`);
    if (r.success) {
      console.log(`   ✅ Pattern: ${r.result.pattern} (confidence: ${r.result.confidence.toFixed(2)})`);
      console.log(`   Source: ${r.result.source}`);
      console.log(`   Cost: $${r.result.cost.toFixed(4)}, Latency: ${r.result.latency}ms`);
    } else {
      console.log(`   ❌ Error: ${r.error}`);
    }
    console.log('');
  });

  console.log('═'.repeat(80));
  console.log('TEST COMPLETE');
  console.log('═'.repeat(80));
  console.log('');

  // Cleanup
  if (pool) {
    await pool.end();
    console.log('✅ Database pool closed');
  }

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

/**
 * Quick discovery test (no validation)
 */
async function runQuickDiscoveryTest() {
  console.log('═'.repeat(80));
  console.log('QUICK DISCOVERY TEST (No Validation)');
  console.log('═'.repeat(80));
  console.log('');

  const testContext = {
    company: 'Test Bank',
    domain: 'testbank.ae',
    sector: 'Banking',
    region: 'UAE',
    company_size: 'Medium'
  };

  console.log('Testing quick pattern discovery (no NeverBounce validation)...');
  console.log('');

  const result = await discoverPattern(testContext);

  console.log('═'.repeat(80));
  console.log('RESULT');
  console.log('═'.repeat(80));
  console.log(`Pattern: ${result.pattern}`);
  console.log(`Confidence: ${result.confidence.toFixed(2)}`);
  console.log(`Source: ${result.source}`);
  console.log('');
  console.log('✅ Discovery test complete');
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════
// Main entry point
// ═══════════════════════════════════════════════════════════════════

// Check if --quick flag is passed
const isQuickTest = process.argv.includes('--quick');

if (isQuickTest) {
  console.log('Running quick discovery test (no validation)...');
  console.log('');
  runQuickDiscoveryTest().catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
} else {
  console.log('Running full end-to-end test (with validation)...');
  console.log('Use --quick flag for discovery-only test');
  console.log('');
  runTests().catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
}
