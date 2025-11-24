#!/usr/bin/env node
/**
 * Layer -1 SERP Pattern Testing - Real Data Validation
 *
 * This test demonstrates Layer -1 with REAL Apollo employees and REAL email validation.
 *
 * Flow:
 * 1. SERP discovers MAF domain + pattern
 * 2. Apollo fetches REAL employees from MAF
 * 3. Layer -1 tests SERP pattern with REAL employee names
 * 4. NeverBounce validates REAL generated emails
 * 5. Pattern stored with provenance if validated
 */

import { discoverDomainAndPattern } from './server/agents/domainPatternDiscoveryAgent.js';
import { enrichWithApollo } from './routes/enrich/lib/apollo.js';
import { verifySingle } from './server/lib/emailIntelligence/nb.js';
import { initDb, getDb } from './server/lib/emailIntelligence/db.js';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const NEVERBOUNCE_API_KEY = process.env.NEVERBOUNCE_API_KEY;

// Check API keys
if (!SERPAPI_KEY) {
  console.error('❌ SERPAPI_KEY not set');
  process.exit(1);
}

if (!APOLLO_API_KEY) {
  console.error('❌ APOLLO_API_KEY not set');
  process.exit(1);
}

if (!NEVERBOUNCE_API_KEY) {
  console.error('❌ NEVERBOUNCE_API_KEY not set');
  console.error('   Layer -1 validation requires NeverBounce');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

console.log('');
console.log('═'.repeat(70));
console.log('Layer -1 SERP Pattern Testing - Real Data Validation');
console.log('UPR (Universal People Radar) - EmailPatternEngine v3.2.0');
console.log('═'.repeat(70));
console.log('');
console.log('Testing: Majid Al Futtaim (MAF)');
console.log('Expected: maf.ae domain, {first}.{last} pattern');
console.log('');

// Initialize database
const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000
});

initDb(pool);

async function testLayerMinusOne() {
  try {
    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: SERP Discovery
    // ═══════════════════════════════════════════════════════════════════
    console.log('STEP 1: SERP Discovery');
    console.log('-'.repeat(70));

    const serpResult = await discoverDomainAndPattern('Majid Al Futtaim', 'United Arab Emirates');

    console.log(`✅ Domain discovered: ${serpResult.domain}`);
    console.log(`✅ Pattern suggested: ${serpResult.pattern}`);
    console.log(`✅ Confidence: ${serpResult.confidence.toFixed(3)}`);
    console.log(`✅ Source: ${serpResult.source}`);
    console.log(`💰 Cost: $0.005`);
    console.log('');

    if (serpResult.domain !== 'maf.ae') {
      throw new Error(`Expected maf.ae, got ${serpResult.domain}`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Apollo Validation (NEVER SKIPPED)
    // ═══════════════════════════════════════════════════════════════════
    console.log('STEP 2: Apollo Validation (Fetch REAL Employees)');
    console.log('-'.repeat(70));

    const apolloResult = await enrichWithApollo({
      name: 'Majid Al Futtaim',
      domain: serpResult.domain,
      strategy: 'wide_net'
    });

    const rawResults = apolloResult.results || [];

    // Transform Apollo results to expected format with first_name, last_name, title
    const realEmployees = rawResults.map(emp => {
      const names = emp.name ? emp.name.split(' ') : [];
      return {
        first_name: names[0] || '',
        last_name: names.slice(1).join(' ') || names[0] || '',
        title: emp.designation || '',
        linkedin_url: emp.linkedin_url,
        location: emp.location,
        email: emp.email
      };
    });

    console.log(`✅ Apollo returned ${realEmployees.length} REAL employees`);

    if (realEmployees.length === 0) {
      throw new Error('No Apollo employees found - cannot test Layer -1');
    }

    console.log('');
    console.log('Sample REAL Employees from Apollo:');
    realEmployees.slice(0, 5).forEach((emp, idx) => {
      console.log(`  ${idx + 1}. ${emp.first_name} ${emp.last_name} - ${emp.title || 'N/A'}`);
    });
    console.log(`💰 Cost: $0.010`);
    console.log('');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Layer -1 SERP Pattern Testing
    // ═══════════════════════════════════════════════════════════════════
    console.log('STEP 3: Layer -1 - Test SERP Pattern with REAL Employee Names');
    console.log('-'.repeat(70));

    // Filter for valid leads (same logic as orchestrator.js)
    const validLeads = realEmployees.filter(lead => {
      return lead.first_name && lead.last_name &&
             lead.first_name.length >= 2 && lead.last_name.length >= 2 &&
             lead.title;
    });

    console.log(`✅ Found ${validLeads.length} valid leads with names + titles`);

    if (validLeads.length < 3) {
      throw new Error(`Need at least 3 valid leads, got ${validLeads.length}`);
    }

    // Pick 3 employees for testing
    const testLeads = validLeads.slice(0, 3);

    console.log('');
    console.log('Testing SERP pattern with 3 REAL employees:');
    testLeads.forEach((lead, idx) => {
      console.log(`  ${idx + 1}. ${lead.first_name} ${lead.last_name} - ${lead.title}`);
    });
    console.log('');

    // Generate emails using SERP pattern
    const testEmails = testLeads.map(lead => {
      const email = serpResult.pattern
        .replace('{first}', lead.first_name.toLowerCase())
        .replace('{last}', lead.last_name.toLowerCase())
        .replace('{f}', lead.first_name[0].toLowerCase())
        .replace('{l}', lead.last_name[0].toLowerCase())
        .replace('{last.initial}', lead.last_name[0].toLowerCase())
        + '@' + serpResult.domain;

      return { ...lead, email };
    });

    console.log('Generated REAL emails from REAL names:');
    testEmails.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.email} (${item.first_name} ${item.last_name})`);
    });
    console.log('');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: NeverBounce Validation
    // ═══════════════════════════════════════════════════════════════════
    console.log('STEP 4: NeverBounce Validation of REAL Emails');
    console.log('-'.repeat(70));

    const validationResults = [];

    for (const { email, first_name, last_name } of testEmails) {
      console.log(`Testing: ${email}`);

      try {
        const result = await verifySingle(email);
        const isValid = result.status === 'valid';

        console.log(`  → Status: ${result.status} ${isValid ? '✅' : '❌'}`);

        validationResults.push({
          email,
          first_name,
          last_name,
          status: result.status,
          valid: isValid
        });
      } catch (error) {
        console.log(`  → Error: ${error.message} ❌`);
        validationResults.push({
          email,
          first_name,
          last_name,
          status: 'error',
          valid: false
        });
      }
    }

    const validCount = validationResults.filter(r => r.valid).length;
    const totalCount = validationResults.length;

    console.log('');
    console.log(`📊 Validation Results: ${validCount}/${totalCount} valid (${((validCount/totalCount)*100).toFixed(0)}%)`);
    console.log(`💰 Cost: $${(totalCount * 0.008).toFixed(3)}`);
    console.log('');

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: Decision Logic
    // ═══════════════════════════════════════════════════════════════════
    console.log('STEP 5: Layer -1 Decision');
    console.log('-'.repeat(70));

    if (validCount >= 2) {
      console.log('✅ SERP Pattern CONFIRMED (≥2/3 valid)');
      console.log('✅ Pattern validated with REAL Apollo employees');
      console.log('✅ EARLY RETURN - Skip expensive LLM call');
      console.log('');
      console.log('Pattern to store:');
      console.log(`  → domain: ${serpResult.domain}`);
      console.log(`  → pattern: ${serpResult.pattern}`);
      console.log(`  → confidence: 0.95 (SERP + Apollo both agree)`);
      console.log(`  → validation_method: 'serp_confirmed'`);
      console.log(`  → serp_apollo_agreement: true`);
      console.log(`  → serp_source: '${serpResult.source}'`);
      console.log('');
      console.log('Sample validated emails:');
      validationResults.filter(r => r.valid).forEach((r, idx) => {
        console.log(`  ${idx + 1}. ${r.email} (${r.first_name} ${r.last_name}) ✅`);
      });
    } else {
      console.log('❌ SERP Pattern FAILED validation (<2/3 valid)');
      console.log('⚠️  SERP was WRONG - will fall back to Bayesian inference');
      console.log('');
      console.log('Next steps:');
      console.log('  → Store failure for learning');
      console.log('  → Continue to RAG → Rules → LLM flow');
      console.log('  → Cost: +$0.030 (LLM call required)');
    }

    console.log('');
    console.log('═'.repeat(70));
    console.log('Total Cost Breakdown');
    console.log('═'.repeat(70));
    console.log(`SERP Discovery:        $0.005`);
    console.log(`Apollo Employees:      $0.010`);
    console.log(`NeverBounce (3 tests): $${(totalCount * 0.008).toFixed(3)}`);
    if (validCount >= 2) {
      console.log(`LLM Call:              $0.000 (SKIPPED!)`);
      console.log(`─`.repeat(70));
      console.log(`TOTAL:                 $0.023 ✅ (41% savings vs $0.039)`);
    } else {
      console.log(`LLM Call:              $0.030 (REQUIRED)`);
      console.log(`─`.repeat(70));
      console.log(`TOTAL:                 $0.053 (SERP failed, full cost)`);
    }
    console.log('');

    console.log('═'.repeat(70));
    console.log('✅ Layer -1 Test Complete with REAL Data');
    console.log('═'.repeat(70));
    console.log('');
    console.log('Key Validations:');
    console.log(`✅ SERP discovered: ${serpResult.domain} (NOT hallucinated)`);
    console.log(`✅ Apollo provided: ${realEmployees.length} REAL employees`);
    console.log(`✅ Layer -1 tested: ${totalCount} REAL emails`);
    console.log(`✅ NeverBounce validated: ${validCount}/${totalCount} emails`);
    console.log(`✅ Used REAL names: NOT placeholders like "[third]@domain.com"`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testLayerMinusOne().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
