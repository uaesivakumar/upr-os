/**
 * SIVA Phase 12 - Smoke Test Suite
 *
 * Tests basic functionality of SIVA Lead Scoring integration
 * in the enrichment endpoint.
 */

// Use Node's built-in fetch (Node 18+)
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Test against production Cloud Run endpoint
const BASE_URL = process.env.CLOUD_RUN_URL || 'https://upr-web-service-191599223867.us-central1.run.app';
const ENRICH_ENDPOINT = `${BASE_URL}/api/enrich/contacts`;

// Test data - realistic banking contacts
const TEST_CASES = [
  {
    name: 'High Quality Lead - Strategic Contact',
    domain: 'emiratesnbd.com',
    company: {
      id: 'test-001',
      name: 'Emirates NBD',
      domain: 'emiratesnbd.com',
      industry: 'Banking',
      size: 5000,
      locations: ['Dubai, UAE']
    },
    contacts: [
      {
        name: 'Ahmed Al Mansouri',
        designation: 'Chief Human Resources Officer',
        linkedin_url: 'https://linkedin.com/in/ahmed-almansouri',
        email_status: 'unknown'
      }
    ],
    expected: {
      tier: 'HOT',
      qScore_min: 75,
      confidence_min: 0.75
    }
  },
  {
    name: 'Medium Quality Lead - Primary Contact',
    domain: 'startupco.ae',
    company: {
      id: 'test-002',
      name: 'Startup Tech Co',
      domain: 'startupco.ae',
      industry: 'Technology',
      size: 150,
      locations: ['DIFC, Dubai']
    },
    contacts: [
      {
        name: 'Sarah Johnson',
        designation: 'Head of Talent Acquisition',
        linkedin_url: 'https://linkedin.com/in/sarahjohnson',
        email_status: 'unknown'
      }
    ],
    expected: {
      tier: 'WARM',
      qScore_min: 50,
      qScore_max: 75,
      confidence_min: 0.50
    }
  },
  {
    name: 'Low Quality Lead - Backup Contact',
    domain: 'smallbiz.com',
    company: {
      id: 'test-003',
      name: 'Small Business LLC',
      domain: 'smallbiz.com',
      industry: 'Retail',
      size: 25,
      locations: ['Abu Dhabi']
    },
    contacts: [
      {
        name: 'John Doe',
        designation: 'HR Coordinator',
        linkedin_url: 'https://linkedin.com/in/johndoe',
        email_status: 'unknown'
      }
    ],
    expected: {
      tier: 'COLD',
      qScore_max: 50,
      confidence_max: 0.50
    }
  },
  {
    name: 'Edge Case - Missing Data',
    domain: 'unknown.com',
    company: {
      id: 'test-004',
      name: 'Unknown Company',
      domain: 'unknown.com'
    },
    contacts: [
      {
        name: 'Test User',
        email_status: 'unknown'
      }
    ],
    expected: {
      should_fallback: true
    }
  }
];

// Test results tracker
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: [],
  timings: []
};

/**
 * Run a single smoke test case
 */
async function runTest(testCase) {
  console.log(`\n🧪 Running: ${testCase.name}`);
  console.log('─'.repeat(60));

  const started = Date.now();

  try {
    const response = await fetch(ENRICH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        domain: testCase.domain,
        company: testCase.company,
        contacts: testCase.contacts
      })
    });

    const elapsed = Date.now() - started;
    results.timings.push(elapsed);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log(`✅ Response received in ${elapsed}ms`);

    // Validate response structure
    if (!data.ok || !data.data || !data.data.results) {
      throw new Error('Invalid response structure');
    }

    const lead = data.data.results[0];
    console.log('\n📊 SIVA Scoring Results:');
    console.log(`   Confidence: ${lead.confidence?.toFixed(3) || 'N/A'}`);
    console.log(`   Q-Score: ${lead.qScore || 'N/A'}`);
    console.log(`   Tier: ${lead.tier || 'N/A'}`);
    console.log(`   Source: ${lead.siva_source || 'N/A'}`);

    if (lead.siva_reasoning) {
      console.log(`   Reasoning: ${lead.siva_reasoning.substring(0, 100)}...`);
    }

    // Validate expectations
    const validations = [];

    if (testCase.expected.should_fallback) {
      validations.push({
        name: 'Should use fallback',
        passed: lead.siva_source === 'fallback' || lead.siva_source === 'fallback_error'
      });
    } else {
      validations.push({
        name: 'Should use SIVA scoring',
        passed: lead.siva_source === 'siva_phase12'
      });

      if (testCase.expected.tier) {
        validations.push({
          name: `Tier should be ${testCase.expected.tier}`,
          passed: lead.tier === testCase.expected.tier
        });
      }

      if (testCase.expected.qScore_min) {
        validations.push({
          name: `Q-Score >= ${testCase.expected.qScore_min}`,
          passed: lead.qScore >= testCase.expected.qScore_min
        });
      }

      if (testCase.expected.qScore_max) {
        validations.push({
          name: `Q-Score <= ${testCase.expected.qScore_max}`,
          passed: lead.qScore <= testCase.expected.qScore_max
        });
      }

      if (testCase.expected.confidence_min) {
        validations.push({
          name: `Confidence >= ${testCase.expected.confidence_min}`,
          passed: lead.confidence >= testCase.expected.confidence_min
        });
      }

      if (testCase.expected.confidence_max) {
        validations.push({
          name: `Confidence <= ${testCase.expected.confidence_max}`,
          passed: lead.confidence <= testCase.expected.confidence_max
        });
      }
    }

    console.log('\n🔍 Validations:');
    let testPassed = true;
    validations.forEach(v => {
      const icon = v.passed ? '✅' : '❌';
      console.log(`   ${icon} ${v.name}`);
      if (!v.passed) testPassed = false;
    });

    results.total++;
    if (testPassed) {
      results.passed++;
      console.log(`\n✅ TEST PASSED`);
    } else {
      results.failed++;
      console.log(`\n❌ TEST FAILED`);
    }

  } catch (error) {
    results.total++;
    results.failed++;
    results.errors.push({
      test: testCase.name,
      error: error.message
    });
    console.log(`\n❌ TEST ERROR: ${error.message}`);
  }
}

/**
 * Run all smoke tests
 */
async function runSmokeTests() {
  console.log('━'.repeat(60));
  console.log('🧪 SIVA Phase 12 - Smoke Test Suite');
  console.log('━'.repeat(60));
  console.log(`Endpoint: ${ENRICH_ENDPOINT}\n`);

  for (const testCase of TEST_CASES) {
    await runTest(testCase);
  }

  // Summary
  console.log('\n');
  console.log('━'.repeat(60));
  console.log('📊 Test Summary');
  console.log('━'.repeat(60));
  console.log(`Total Tests: ${results.total}`);
  console.log(`Passed: ${results.passed} ✅`);
  console.log(`Failed: ${results.failed} ❌`);

  if (results.timings.length > 0) {
    const avgTime = results.timings.reduce((a, b) => a + b, 0) / results.timings.length;
    const maxTime = Math.max(...results.timings);
    const minTime = Math.min(...results.timings);

    console.log(`\n⏱️  Performance:`);
    console.log(`   Average: ${avgTime.toFixed(0)}ms`);
    console.log(`   Min: ${minTime}ms`);
    console.log(`   Max: ${maxTime}ms`);
  }

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(e => {
      console.log(`   ${e.test}: ${e.error}`);
    });
  }

  console.log('\n');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runSmokeTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
