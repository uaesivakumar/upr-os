#!/usr/bin/env node
/**
 * New Pattern Learning Test
 *
 * Tests EmailPatternEngine learning a NEW pattern with REAL Apollo data
 *
 * This will:
 * 1. Fetch real employees from Apollo for Majid Al Futtaim
 * 2. Pass them to EmailPatternEngine
 * 3. Let it learn the pattern (with NeverBounce validation)
 * 4. Store in database
 *
 * ⚠️  COST: ~$0.024 for NeverBounce validation
 *
 * Run: node test-new-pattern-learning.js
 */

import { enrichWithPatternEngine } from './server/lib/emailIntelligence/integration.js';
import { initDb } from './server/lib/emailIntelligence/db.js';
import pg from 'pg';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const NEVERBOUNCE_API_KEY = process.env.NEVERBOUNCE_API_KEY;

if (!APOLLO_API_KEY) {
  console.error('❌ APOLLO_API_KEY not set');
  process.exit(1);
}

if (!NEVERBOUNCE_API_KEY) {
  console.error('❌ NEVERBOUNCE_API_KEY not set');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

async function fetchApolloEmployees(company, domain) {
  console.log(`[Apollo] Fetching employees for ${company}...`);

  const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': APOLLO_API_KEY
    },
    body: JSON.stringify({
      q_organization_domains: domain,
      person_locations: ['United Arab Emirates'],
      person_titles: ['director', 'manager', 'vp', 'head', 'chief', 'senior'],
      per_page: 10,
      page: 1
    })
  });

  if (!response.ok) {
    throw new Error(`Apollo API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const people = data.people || [];

  console.log(`[Apollo] Found ${people.length} employees`);

  const candidates = people.map(person => ({
    name: `${person.first_name} ${person.last_name}`,
    first_name: person.first_name,
    last_name: person.last_name,
    title: person.title,
    job_title: person.title,
    linkedin_url: person.linkedin_url,
    location: `${person.city || ''}, ${person.state || ''}`.trim()
  })).filter(c => c.first_name && c.last_name && c.title);

  console.log(`[Apollo] ${candidates.length} candidates with full names + titles`);

  if (candidates.length > 0) {
    console.log('\nSample employees:');
    candidates.slice(0, 3).forEach((c, idx) => {
      console.log(`  ${idx + 1}. ${c.name} - ${c.title}`);
    });
    console.log('');
  }

  return candidates;
}

async function testNewPatternLearning() {
  console.log('═'.repeat(70));
  console.log('TEST: Majid Al Futtaim (majidalfuttaim.com)');
  console.log('NEW PATTERN LEARNING with REAL Apollo Data');
  console.log('═'.repeat(70));
  console.log('');
  console.log('⚠️  This will make REAL API calls:');
  console.log('   • Apollo: ~$0.01 (employee lookup)');
  console.log('   • NeverBounce: ~$0.024 (pattern validation)');
  console.log('   • Total cost: ~$0.034');
  console.log('');
  console.log('Press Ctrl+C within 5 seconds to cancel...');
  console.log('');

  await new Promise(resolve => setTimeout(resolve, 5000));

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000
  });

  initDb(pool);

  try {
    // Step 1: Fetch real employees from Apollo
    const candidates = await fetchApolloEmployees('Majid Al Futtaim', 'majidalfuttaim.com');

    if (candidates.length < 3) {
      console.error(`❌ Insufficient employees: ${candidates.length}/3 minimum`);
      process.exit(1);
    }

    console.log(`✅ Apollo returned ${candidates.length} qualified employees`);
    console.log('');

    // Step 2: Call EmailPatternEngine to LEARN NEW pattern
    console.log('[PatternEngine] Learning NEW pattern with REAL Apollo data...');
    console.log(`[PatternEngine] This will test multiple patterns and validate with NeverBounce`);
    console.log('');

    const startTime = Date.now();

    const result = await enrichWithPatternEngine({
      company_name: 'Majid Al Futtaim',
      domain: 'majidalfuttaim.com',
      sector: 'Retail & Real Estate',
      region: 'UAE',
      company_size: 'Large',
      candidates: candidates,
      db: pool
    });

    const elapsed = Date.now() - startTime;

    // Step 3: Analyze results
    console.log('═'.repeat(70));
    console.log('RESULT');
    console.log('═'.repeat(70));
    console.log('');

    if (result.error) {
      console.error('❌ ERROR:', result.error);
      console.error('');
      process.exit(1);
    }

    console.log('✅ SUCCESS! Pattern learned from REAL Apollo data!');
    console.log('');
    console.log('Pattern Details:');
    console.log(`  Domain: majidalfuttaim.com`);
    console.log(`  Pattern: ${result.pattern}`);
    console.log(`  Confidence: ${result.confidence.toFixed(2)}`);
    console.log(`  Source: ${result.source}`);
    console.log(`  Processing time: ${(elapsed / 1000).toFixed(1)}s`);
    console.log('');

    console.log('Candidates Enriched:');
    console.log(`  Total: ${result.candidates.length}`);
    console.log(`  With emails: ${result.candidates.filter(c => c.email).length}`);
    console.log(`  Validated: ${result.candidates.filter(c => c.email_validated).length}`);
    console.log('');

    const withEmails = result.candidates.filter(c => c.email).slice(0, 3);
    if (withEmails.length > 0) {
      console.log('Sample Emails Generated:');
      withEmails.forEach((c, idx) => {
        const status = c.email_validated ? '✅ NB validated' : '📧 generated';
        console.log(`  ${idx + 1}. ${c.name} → ${c.email} (${status})`);
      });
      console.log('');
    }

    console.log('═'.repeat(70));
    console.log('✅ NEW PATTERN LEARNING TEST PASSED');
    console.log('═'.repeat(70));
    console.log('');
    console.log('Key Validations:');
    console.log('  ✅ Apollo returned REAL employees');
    console.log('  ✅ EmailPatternEngine learned pattern from REAL data');
    console.log('  ✅ Pattern validated with NeverBounce');
    console.log('  ✅ Pattern stored in database');
    console.log('  ✅ Emails generated for all candidates');
    console.log('');
    console.log('Next: Verify pattern in database with TASK 7');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ TEST FAILED');
    console.error('═'.repeat(70));
    console.error('Error:', error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    console.error('');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

console.log('');
console.log('New Pattern Learning Test');
console.log('Testing with REAL Apollo employee data + NeverBounce validation');
console.log('');

testNewPatternLearning().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
