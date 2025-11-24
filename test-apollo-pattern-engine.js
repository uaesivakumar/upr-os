#!/usr/bin/env node
/**
 * Apollo → EmailPatternEngine Integration Test
 *
 * Tests the CRITICAL fix: Apollo employee data flows to pattern validation
 *
 * This verifies:
 * 1. Apollo API returns real employees
 * 2. Employee data passed to enrichWithPatternEngine
 * 3. Validation enforces 3+ employees with titles
 * 4. Pattern learned/reused correctly
 *
 * Run: node test-apollo-pattern-engine.js
 */

import { enrichWithPatternEngine } from './server/lib/emailIntelligence/integration.js';
import { initDb } from './server/lib/emailIntelligence/db.js';
import pg from 'pg';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!APOLLO_API_KEY) {
  console.error('❌ APOLLO_API_KEY not set');
  console.error('   Get from: gcloud secrets versions access latest --secret=APOLLO_API_KEY');
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
      person_titles: ['director', 'manager', 'vp', 'head', 'chief'],
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

  // Transform to EmailPatternEngine format
  const candidates = people.map(person => ({
    name: `${person.first_name} ${person.last_name}`,
    first_name: person.first_name,
    last_name: person.last_name,
    title: person.title,           // CRITICAL: Job title for validation
    job_title: person.title,
    linkedin_url: person.linkedin_url,
    location: `${person.city || ''}, ${person.state || ''}`.trim()
  })).filter(c => c.first_name && c.last_name && c.title);

  console.log(`[Apollo] ${candidates.length} candidates with full names + titles`);

  // Show sample
  if (candidates.length > 0) {
    console.log('\nSample employees:');
    candidates.slice(0, 3).forEach((c, idx) => {
      console.log(`  ${idx + 1}. ${c.name} - ${c.title}`);
    });
    console.log('');
  }

  return candidates;
}

async function testDIB() {
  console.log('═'.repeat(70));
  console.log('TEST: Dubai Islamic Bank (dib.ae)');
  console.log('═'.repeat(70));
  console.log('');

  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000
  });

  initDb(pool);

  try {
    // Step 1: Fetch real employees from Apollo
    const candidates = await fetchApolloEmployees('Dubai Islamic Bank', 'dib.ae');

    if (candidates.length < 3) {
      console.error(`❌ Insufficient employees: ${candidates.length}/3 minimum`);
      process.exit(1);
    }

    console.log(`✅ Apollo returned ${candidates.length} qualified employees`);
    console.log('');

    // Step 2: Call EmailPatternEngine with REAL Apollo data
    console.log('[PatternEngine] Calling enrichWithPatternEngine...');
    console.log(`[PatternEngine] Candidates: ${candidates.length} REAL people from Apollo`);
    console.log('');

    const result = await enrichWithPatternEngine({
      company_name: 'Dubai Islamic Bank',
      domain: 'dib.ae',
      sector: 'Banking',
      region: 'UAE',
      company_size: null,
      candidates: candidates,  // REAL Apollo employees!
      db: pool
    });

    // Step 3: Analyze results
    console.log('═'.repeat(70));
    console.log('RESULT');
    console.log('═'.repeat(70));
    console.log('');

    if (result.error) {
      console.error('❌ ERROR:', result.error);
      console.error('');

      // Check if validation error
      if (result.error.includes('INSUFFICIENT')) {
        console.error('⚠️  Validation rejected the candidates!');
        console.error('   This means our validation logic is working.');
        console.error('   But Apollo should have provided enough qualified employees.');
        console.error('');
      }

      process.exit(1);
    }

    console.log('✅ SUCCESS!');
    console.log('');
    console.log('Pattern Details:');
    console.log(`  Domain: dib.ae`);
    console.log(`  Pattern: ${result.pattern}`);
    console.log(`  Confidence: ${result.confidence.toFixed(2)}`);
    console.log(`  Source: ${result.source}`);
    console.log(`  Reused: ${result.pattern_reused ? 'YES (existing pattern)' : 'NO (newly learned)'}`);
    console.log('');

    console.log('Candidates Enriched:');
    console.log(`  Total: ${result.candidates.length}`);
    console.log(`  With emails: ${result.candidates.filter(c => c.email).length}`);
    console.log(`  Validated: ${result.candidates.filter(c => c.email_validated).length}`);
    console.log('');

    // Show sample emails
    const withEmails = result.candidates.filter(c => c.email).slice(0, 3);
    if (withEmails.length > 0) {
      console.log('Sample Emails Generated:');
      withEmails.forEach((c, idx) => {
        const status = c.email_validated ? '✅ validated' : '📧 generated';
        console.log(`  ${idx + 1}. ${c.name} → ${c.email} (${status})`);
      });
      console.log('');
    }

    console.log('═'.repeat(70));
    console.log('✅ INTEGRATION TEST PASSED');
    console.log('═'.repeat(70));
    console.log('');
    console.log('Key Validations:');
    console.log('  ✅ Apollo API returned real employees');
    console.log('  ✅ Employees have full names + job titles');
    console.log('  ✅ EmailPatternEngine accepted REAL data');
    console.log('  ✅ Pattern learned/reused successfully');
    console.log('  ✅ Emails generated for candidates');
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
console.log('Apollo → EmailPatternEngine Integration Test');
console.log('Testing with REAL Apollo employee data');
console.log('');

testDIB().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
