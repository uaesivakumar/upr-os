#!/usr/bin/env node
/**
 * Apollo API Integration Test
 *
 * Verifies Apollo API is accessible and returns real employee data
 * Tests data quality for EmailPatternEngine validation requirements
 */

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const TEST_COMPANIES = [
  { name: 'Dubai Islamic Bank', domain: 'dib.ae', region: 'UAE' },
  { name: 'Emirates NBD', domain: 'emiratesnbd.com', region: 'UAE' },
  { name: 'First Abu Dhabi Bank', domain: 'fab.ae', region: 'UAE' }
];

if (!APOLLO_API_KEY) {
  console.error('');
  console.error('❌ APOLLO_API_KEY not set');
  console.error('');
  console.error('Set environment variable:');
  console.error('  export APOLLO_API_KEY="your-api-key"');
  console.error('');
  console.error('Or get from GCP Secret Manager:');
  console.error('  export APOLLO_API_KEY=$(gcloud secrets versions access latest --secret=APOLLO_API_KEY)');
  console.error('');
  process.exit(1);
}

async function testApolloCompany(company) {
  console.log('─'.repeat(70));
  console.log(`Testing: ${company.name} (${company.domain})`);
  console.log('─'.repeat(70));
  console.log('');

  try {
    const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify({
        q_organization_domains: company.domain,
        person_locations: [company.region || 'United Arab Emirates'],
        person_titles: ['hr', 'human resources', 'director', 'manager', 'vp', 'vice president'],
        per_page: 10,
        page: 1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Apollo API error: ${response.status} ${response.statusText}`);
      console.error(`   ${errorText}`);
      console.error('');
      return { success: false, company: company.name };
    }

    const data = await response.json();
    const people = data.people || [];

    console.log(`✅ Found ${people.length} employees`);
    console.log('');

    if (people.length === 0) {
      console.log('⚠️  No employees found for this company');
      console.log('');
      return { success: true, company: company.name, employees: 0, qualified: 0 };
    }

    // Check data quality for EmailPatternEngine requirements
    let withFullName = 0;
    let withTitle = 0;
    let qualified = 0;

    console.log('Sample Employees:');
    people.slice(0, 5).forEach((person, idx) => {
      const firstName = person.first_name || '';
      const lastName = person.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      const title = person.title || '';
      const email = person.email || '';

      console.log(`  ${idx + 1}. ${fullName || person.name || 'Unknown'}`);
      console.log(`     Title: ${title || 'N/A'}`);
      if (email) console.log(`     Email: ${email}`);
      console.log('');

      // Count quality metrics
      if (firstName && lastName && firstName.length >= 2 && lastName.length >= 2) {
        withFullName++;
      }
      if (title) {
        withTitle++;
      }
      if (firstName && lastName && firstName.length >= 2 && lastName.length >= 2 && title) {
        qualified++;
      }
    });

    // Overall stats
    people.forEach(person => {
      const firstName = person.first_name || '';
      const lastName = person.last_name || '';
      const title = person.title || '';

      if (firstName && lastName && firstName.length >= 2 && lastName.length >= 2) {
        withFullName++;
      }
      if (title) {
        withTitle++;
      }
      if (firstName && lastName && firstName.length >= 2 && lastName.length >= 2 && title) {
        qualified++;
      }
    });

    console.log('Data Quality:');
    console.log(`  Full names (first + last): ${withFullName}/${people.length} (${(withFullName/people.length*100).toFixed(0)}%)`);
    console.log(`  Job titles: ${withTitle}/${people.length} (${(withTitle/people.length*100).toFixed(0)}%)`);
    console.log(`  Qualified for pattern engine: ${qualified}/${people.length} (${(qualified/people.length*100).toFixed(0)}%)`);
    console.log('');

    if (qualified >= 3) {
      console.log('✅ SUFFICIENT DATA for EmailPatternEngine validation!');
      console.log(`   ${qualified} employees have full name + title (need 3+)`);
    } else {
      console.log('⚠️  INSUFFICIENT DATA for EmailPatternEngine validation');
      console.log(`   Only ${qualified}/3 qualified employees (need full name + title)`);
    }
    console.log('');

    return {
      success: true,
      company: company.name,
      employees: people.length,
      qualified: qualified,
      meets_requirements: qualified >= 3
    };

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('');
    return { success: false, company: company.name, error: error.message };
  }
}

async function runTests() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('Apollo API Integration Test');
  console.log('UPR (Universal People Radar) - EmailPatternEngine');
  console.log('═'.repeat(70));
  console.log('');
  console.log('Testing Apollo API connectivity and data quality...');
  console.log('');

  const results = [];

  for (const company of TEST_COMPANIES) {
    const result = await testApolloCompany(company);
    results.push(result);
  }

  console.log('═'.repeat(70));
  console.log('Test Summary');
  console.log('═'.repeat(70));
  console.log('');

  const successful = results.filter(r => r.success).length;
  const meetsRequirements = results.filter(r => r.meets_requirements).length;

  results.forEach(result => {
    if (result.success) {
      const status = result.meets_requirements ? '✅' : '⚠️';
      console.log(`${status} ${result.company}: ${result.qualified || 0} qualified employees`);
    } else {
      console.log(`❌ ${result.company}: FAILED (${result.error || 'API error'})`);
    }
  });

  console.log('');
  console.log(`Tests run: ${results.length}`);
  console.log(`Successful: ${successful}/${results.length}`);
  console.log(`Meet pattern engine requirements: ${meetsRequirements}/${results.length}`);
  console.log('');

  if (successful === results.length && meetsRequirements >= 2) {
    console.log('═'.repeat(70));
    console.log('✅ Apollo Integration Test: PASSED');
    console.log('═'.repeat(70));
    console.log('');
    console.log('✅ Apollo API is working correctly');
    console.log('✅ Returning real employee data with full names and titles');
    console.log('✅ Data quality meets EmailPatternEngine requirements (3+ qualified employees)');
    console.log('');
    console.log('Next steps:');
    console.log('1. ✅ Apollo API key configured and working');
    console.log('2. ⏳ Update enrichment flow to use EmailPatternEngine');
    console.log('3. ⏳ Deploy to production and test end-to-end');
    console.log('');
  } else {
    console.log('═'.repeat(70));
    console.log('⚠️  Apollo Integration Test: PARTIAL PASS');
    console.log('═'.repeat(70));
    console.log('');
    console.log('⚠️  Some tests failed or returned insufficient data');
    console.log('');
    console.log('Recommendations:');
    console.log('- Check Apollo API credits');
    console.log('- Verify company domains are correct');
    console.log('- Try different search parameters');
    console.log('');
  }
}

runTests().catch(err => {
  console.error('');
  console.error('❌ Fatal error:', err.message);
  console.error('');
  process.exit(1);
});
