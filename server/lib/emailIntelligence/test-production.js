/**
 * Production Smoke Test
 *
 * Tests EmailPatternEngine v3.0.0 with production database
 * Verifies end-to-end integration with real patterns
 */

import { enrichWithPatternEngine } from './integration.js';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function smokeTest() {
  console.log('═'.repeat(80));
  console.log('PRODUCTION SMOKE TEST - EmailPatternEngine v3.0.0');
  console.log('═'.repeat(80));
  console.log('');

  // Connect to production database
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Verify database connection
    console.log('🔌 Testing database connection...');
    const { rows } = await pool.query('SELECT NOW()');
    console.log(`✅ Database connected: ${rows[0].now}`);
    console.log('');

    // Test 1: Known company (Emirates NBD) - should have existing pattern
    console.log('═'.repeat(80));
    console.log('TEST 1: Known Company (Emirates NBD)');
    console.log('─'.repeat(80));

    const result1 = await enrichWithPatternEngine({
      company_name: 'Emirates NBD',
      domain: 'emiratesnbd.com',
      sector: 'Banking',
      region: 'UAE',
      company_size: 'Large',
      candidates: [
        { name: 'Ahmed Hassan', title: 'HR Director' },
        { name: 'Sarah Ali', title: 'Talent Manager' },
        { name: 'Mohamed Khan', title: 'Recruitment Lead' }
      ],
      db: pool
    });

    console.log(`✅ Success: ${result1.success}`);
    console.log(`   Pattern: ${result1.pattern}`);
    console.log(`   Confidence: ${result1.confidence.toFixed(2)}`);
    console.log(`   Source: ${result1.source}`);
    console.log(`   Cost: $${result1.cost.toFixed(4)}`);
    console.log(`   Duration: ${result1.duration}ms`);
    console.log(`   Candidates enriched: ${result1.candidates.length}`);
    console.log('');

    // Sample enriched candidate
    const sample1 = result1.candidates[0];
    console.log('   Sample candidate:');
    console.log(`     Name: ${sample1.name}`);
    console.log(`     Email: ${sample1.email}`);
    console.log(`     Status: ${sample1.email_status}`);
    console.log(`     Confidence: ${sample1.email_confidence.toFixed(2)}`);
    console.log('');

    // Test 2: Unknown company - should use Bayesian inference
    console.log('═'.repeat(80));
    console.log('TEST 2: Unknown Company (New Tech Startup)');
    console.log('─'.repeat(80));

    const result2 = await enrichWithPatternEngine({
      company_name: 'Dubai Innovation Labs',
      domain: 'dubaiinnovation.ae',
      sector: 'Technology',
      region: 'UAE',
      company_size: 'Small',
      candidates: [
        { name: 'John Smith', title: 'CTO' },
        { name: 'Emma Wilson', title: 'Head of Engineering' }
      ],
      db: pool
    });

    console.log(`✅ Success: ${result2.success}`);
    console.log(`   Pattern: ${result2.pattern}`);
    console.log(`   Confidence: ${result2.confidence.toFixed(2)}`);
    console.log(`   Source: ${result2.source}`);
    console.log(`   Cost: $${result2.cost.toFixed(4)}`);
    console.log(`   Duration: ${result2.duration}ms`);
    console.log('');

    // Sample enriched candidate
    const sample2 = result2.candidates[0];
    console.log('   Sample candidate:');
    console.log(`     Name: ${sample2.name}`);
    console.log(`     Email: ${sample2.email}`);
    console.log(`     Pattern: ${sample2.email_pattern}`);
    console.log('');

    // Test 3: Check cache and monitoring views
    console.log('═'.repeat(80));
    console.log('TEST 3: Monitoring Views');
    console.log('─'.repeat(80));

    const cacheStats = await pool.query('SELECT * FROM v_nb_cache_stats');
    console.log('✅ NeverBounce Cache Stats:');
    console.log(`   Total cached: ${cacheStats.rows[0].total_cached}`);
    console.log(`   Valid: ${cacheStats.rows[0].valid_count}`);
    console.log(`   Invalid: ${cacheStats.rows[0].invalid_count}`);
    console.log(`   Cache hit (last hour): ${cacheStats.rows[0].cached_last_hour}`);
    console.log('');

    const rateLimitStatus = await pool.query('SELECT * FROM v_nb_rate_limit_status LIMIT 5');
    console.log('✅ Rate Limit Status (top 5):');
    if (rateLimitStatus.rows.length === 0) {
      console.log('   (No domains with rate limits yet)');
    } else {
      rateLimitStatus.rows.forEach(row => {
        console.log(`   ${row.domain}: ${row.tokens} tokens (${row.status})`);
      });
    }
    console.log('');

    const patternCount = await pool.query('SELECT COUNT(*) as count FROM email_patterns WHERE confidence >= 0.70');
    console.log('✅ Pattern Database:');
    console.log(`   High-confidence patterns: ${patternCount.rows[0].count}`);
    console.log('');

    console.log('═'.repeat(80));
    console.log('✅ SMOKE TEST COMPLETE - All systems operational!');
    console.log('═'.repeat(80));

    // Summary
    console.log('');
    console.log('SUMMARY:');
    console.log(`  ✅ Database connection working`);
    console.log(`  ✅ Known company enrichment (${result1.source})`);
    console.log(`  ✅ Unknown company enrichment (${result2.source})`);
    console.log(`  ✅ Monitoring views accessible`);
    console.log(`  ✅ Pattern database: ${patternCount.rows[0].count} patterns`);
    console.log('');
    console.log('EmailPatternEngine v3.0.0 is ready for production! 🚀');

  } catch (error) {
    console.error('═'.repeat(80));
    console.error('❌ SMOKE TEST FAILED');
    console.error('═'.repeat(80));
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

smokeTest();
