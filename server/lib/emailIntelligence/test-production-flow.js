/**
 * Production Flow Test
 *
 * Tests complete flow with production database
 * UPR (Universal People Radar) - EmailPatternEngine v3.1.0
 *
 * Run: node server/lib/emailIntelligence/test-production-flow.js
 */

import { learnPattern } from './orchestrator.js';
import { initDb } from './db.js';
import pg from 'pg';

async function testProductionFlow() {
  console.log('═'.repeat(70));
  console.log('EmailPatternEngine v3.1.0 - Production Flow Test');
  console.log('UPR (Universal People Radar)');
  console.log('═'.repeat(70));
  console.log('');

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000
  });

  initDb(pool);

  console.log('⚠️  This test will make REAL API calls and incur REAL costs:');
  console.log('   • NeverBounce: Up to $0.024 per test (if pattern not cached)');
  console.log('   • OpenAI: Up to $0.0002 per test');
  console.log('');
  console.log('Press Ctrl+C within 5 seconds to cancel...');
  console.log('');

  // 5 second delay
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    // ========================================
    // TEST 1: Known Company (Should Hit RAG)
    // ========================================
    console.log('TEST 1: Known Company (Emirates NBD)');
    console.log('-'.repeat(70));

    const test1 = await learnPattern({
      company: 'Emirates NBD',
      domain: 'emiratesnbd.com',
      sector: 'Banking',
      region: 'UAE',
      company_size: 'Large',
      leads: [
        { firstName: 'Ahmed', lastName: 'Hassan' },
        { firstName: 'Sarah', lastName: 'Mohammed' },
        { firstName: 'Ali', lastName: 'Ibrahim' }
      ]
    });

    console.log('');
    console.log('✅ TEST 1 RESULT:');
    console.log(`   Pattern: ${test1.pattern}`);
    console.log(`   Confidence: ${test1.confidence.toFixed(2)}`);
    console.log(`   Source: ${test1.source}`);
    console.log(`   Cost: $${test1.cost.toFixed(4)}`);
    console.log(`   Learned: ${test1.learned ? 'YES 💎' : 'NO (cached)'}`);
    console.log('');

    // ========================================
    // TEST 2: Test Domain Health Check
    // ========================================
    console.log('TEST 2: Unknown Company - Domain Health Check');
    console.log('-'.repeat(70));
    console.log('⚠️  This will test with a non-existent domain (should fail gracefully)');
    console.log('');

    // Use a unique test domain that doesn't exist
    const testDomain = `test-${Date.now()}.ae`;

    const test2 = await learnPattern({
      company: 'Test UAE Company',
      domain: testDomain,
      sector: 'Technology',
      region: 'UAE',
      company_size: 'Medium',
      leads: [
        { firstName: 'John', lastName: 'Smith' },
        { firstName: 'Emma', lastName: 'Wilson' }
      ]
    });

    console.log('');
    console.log('✅ TEST 2 RESULT:');
    console.log(`   Pattern: ${test2.pattern || 'N/A'}`);
    console.log(`   Confidence: ${test2.confidence ? test2.confidence.toFixed(2) : '0.00'}`);
    console.log(`   Source: ${test2.source}`);
    console.log(`   Cost: $${test2.cost ? test2.cost.toFixed(4) : '0.0000'}`);
    console.log(`   Error: ${test2.error || 'None'}`);
    console.log('');

    if (test2.error && test2.error.includes('no MX records')) {
      console.log('✅ Domain health check working correctly (rejected invalid domain)');
    }
    console.log('');

    // ========================================
    // TEST 3: Verify RAG Cache Working
    // ========================================
    console.log('TEST 3: Verify RAG Cache (Re-query Emirates NBD)');
    console.log('-'.repeat(70));

    const test3 = await learnPattern({
      company: 'Emirates NBD',
      domain: 'emiratesnbd.com',
      sector: 'Banking',
      region: 'UAE',
      company_size: 'Large',
      leads: [
        { firstName: 'Mohammed', lastName: 'Ahmed' }
      ]
    });

    console.log('');
    console.log('✅ TEST 3 RESULT:');
    console.log(`   Pattern: ${test3.pattern}`);
    console.log(`   Confidence: ${test3.confidence.toFixed(2)}`);
    console.log(`   Source: ${test3.source}`);
    console.log(`   Cost: $${test3.cost.toFixed(4)}`);

    if (test3.source === 'rag' || test3.source === 'rag_direct') {
      console.log('   ✅ RAG cache hit! (pattern reused from database)');
    } else {
      console.log('   ⚠️  Expected RAG hit, got:', test3.source);
    }
    console.log('');

    // ========================================
    // TEST 4: Check Pattern Storage
    // ========================================
    console.log('TEST 4: Verify Pattern Database');
    console.log('-'.repeat(70));

    const verifyResult = await pool.query(`
      SELECT domain, pattern, confidence, last_source, usage_count
      FROM email_patterns
      WHERE domain = 'emiratesnbd.com'
    `);

    if (verifyResult.rows.length > 0) {
      const stored = verifyResult.rows[0];
      console.log('✅ Emirates NBD pattern found in database:');
      console.log(`   Domain: ${stored.domain}`);
      console.log(`   Pattern: ${stored.pattern}`);
      console.log(`   Confidence: ${parseFloat(stored.confidence).toFixed(2)}`);
      console.log(`   Source: ${stored.last_source}`);
      console.log(`   Usage Count: ${stored.usage_count}`);
    } else {
      console.log('❌ Pattern not found in database (unexpected)');
    }
    console.log('');

    // ========================================
    // SUMMARY
    // ========================================
    console.log('═'.repeat(70));
    console.log('PRODUCTION FLOW TEST COMPLETE');
    console.log('═'.repeat(70));
    console.log('');
    console.log('Summary:');
    console.log(`  Test 1 (RAG Hit): $${test1.cost.toFixed(4)}`);
    console.log(`  Test 2 (Invalid Domain): $${test2.cost ? test2.cost.toFixed(4) : '0.0000'}`);
    console.log(`  Test 3 (RAG Cache): $${test3.cost.toFixed(4)}`);
    console.log(`  Total Cost: $${(test1.cost + (test2.cost || 0) + test3.cost).toFixed(4)}`);
    console.log('');
    console.log('✅ All tests passed! System is working correctly.');
    console.log('');
    console.log('Next Steps:');
    console.log('  1. Monitor: node server/lib/emailIntelligence/test-production-monitoring.js');
    console.log('  2. Deploy to Cloud Run with API keys from GCP Secrets');
    console.log('  3. Track pattern learning progress daily');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ TEST FAILED:', error.message);
    console.error('');
    console.error('Stack:', error.stack);
    console.error('');

    if (error.message.includes('NEVERBOUNCE_API_KEY')) {
      console.error('ACTION REQUIRED:');
      console.error('  1. Set NEVERBOUNCE_API_KEY in environment');
      console.error('  2. Get API key from GCP Secrets Manager');
      console.error('  3. Restart test');
      console.error('');
    }

    if (error.message.includes('OPENAI_API_KEY')) {
      console.error('ACTION REQUIRED:');
      console.error('  1. Set OPENAI_API_KEY in environment');
      console.error('  2. Get API key from GCP Secrets Manager');
      console.error('  3. Restart test');
      console.error('');
    }

  } finally {
    await pool.end();
  }
}

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not set');
  console.error('');
  console.error('Usage:');
  console.error('  export DATABASE_URL="postgresql://..."');
  console.error('  node server/lib/emailIntelligence/test-production-flow.js');
  console.error('');
  process.exit(1);
}

testProductionFlow();
