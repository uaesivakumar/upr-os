#!/usr/bin/env node
/**
 * Sprint 23: Validate ContactTier Shadow Mode Integration
 *
 * Tests that ContactTierTool correctly:
 * 1. Executes inline logic
 * 2. Logs decisions to agent_core.agent_decisions
 * 3. Handles various input scenarios
 */

const ContactTierToolStandalone = require('../../server/siva-tools/ContactTierToolStandalone');
const db = require('../../utils/db');

// Test cases covering different contact profiles
const testCases = [
  {
    name: 'C-Level contact (small startup)',
    input: {
      title: 'CEO',
      company_size: 25,
      company_maturity_years: 1,
      hiring_velocity_monthly: 3
    },
    expected: {
      tier: 'STRATEGIC',
      priority: 1,
      target_titles_includes: ['Founder', 'CEO']
    }
  },
  {
    name: 'HR Director (mid-size company)',
    input: {
      title: 'HR Director',
      department: 'HR',
      seniority_level: 'Director',
      company_size: 250,
      hiring_velocity_monthly: 12
    },
    expected: {
      tier: 'STRATEGIC',
      priority: 1,
      target_titles_includes: ['Head of Talent Acquisition']  // High hiring velocity
    }
  },
  {
    name: 'VP Finance (large enterprise)',
    input: {
      title: 'VP of Finance',
      department: 'Finance',
      seniority_level: 'VP',
      company_size: 1500
    },
    expected: {
      tier: 'STRATEGIC',
      priority: 1
    }
  },
  {
    name: 'HR Manager (small company)',
    input: {
      title: 'HR Manager',
      department: 'HR',
      seniority_level: 'Manager',
      company_size: 120,
      company_maturity_years: 5
    },
    expected: {
      tier: 'STRATEGIC',
      priority: 1,
      target_titles_includes: ['HR Director', 'HR Manager']
    }
  },
  {
    name: 'Operations Manager (mid-size)',
    input: {
      title: 'Operations Manager',
      department: 'Admin',
      seniority_level: 'Manager',
      company_size: 350
    },
    expected: {
      tier: 'PRIMARY',
      priority: 2
    }
  },
  {
    name: 'Individual contributor (HR)',
    input: {
      title: 'HR Specialist',
      department: 'HR',
      seniority_level: 'Individual',
      company_size: 600
    },
    expected: {
      tier: 'SECONDARY',
      priority: 3,
      target_titles_includes: ['Payroll Manager']
    }
  },
  {
    name: 'Unknown seniority (inferred from title)',
    input: {
      title: 'Chief Technology Officer',
      company_size: 450
    },
    expected: {
      tier: 'STRATEGIC',
      priority: 1,
      inferred: true
    }
  },
  {
    name: 'Individual contributor (other department)',
    input: {
      title: 'Marketing Analyst',
      company_size: 800
    },
    expected: {
      tier: 'BACKUP',
      priority: 4
    }
  }
];

async function runTests() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('ContactTier Shadow Mode Validation');
  console.log('Sprint 23 - Testing inline logic + decision logging');
  console.log('══════════════════════════════════════════════════════════════\n');

  const tool = new ContactTierToolStandalone();
  let passed = 0;
  let failed = 0;
  const results = [];

  // Get count of decisions before tests
  const beforeCount = await db.query(`
    SELECT COUNT(*) as count
    FROM agent_core.agent_decisions
    WHERE tool_name = 'ContactTierTool'
  `);

  console.log(`📊 Current ContactTier decisions in database: ${beforeCount.rows[0].count}\n`);

  for (const testCase of testCases) {
    console.log(`🔍 Test: ${testCase.name}`);
    console.log(`   Input: ${JSON.stringify(testCase.input)}`);

    try {
      const result = await tool.execute(testCase.input);

      // Validate tier and priority
      const tierMatch = result.tier === testCase.expected.tier;
      const priorityMatch = result.priority === testCase.expected.priority;

      // Validate target titles if specified
      let titlesMatch = true;
      if (testCase.expected.target_titles_includes) {
        titlesMatch = testCase.expected.target_titles_includes.every(title =>
          result.target_titles.includes(title)
        );
      }

      // Validate inference if specified
      let inferenceMatch = true;
      if (testCase.expected.inferred) {
        inferenceMatch = result.metadata.inferred_seniority || result.metadata.inferred_department;
      }

      const success = tierMatch && priorityMatch && titlesMatch && inferenceMatch;

      if (success) {
        console.log(`   ✅ PASS - Tier: ${result.tier}, Priority: ${result.priority}, Confidence: ${result.confidence}`);
        passed++;
      } else {
        console.log(`   ❌ FAIL`);
        console.log(`      Expected: tier=${testCase.expected.tier}, priority=${testCase.expected.priority}`);
        console.log(`      Got: tier=${result.tier}, priority=${result.priority}`);
        failed++;
      }

      results.push({
        test: testCase.name,
        status: success ? 'PASS' : 'FAIL',
        result: {
          tier: result.tier,
          priority: result.priority,
          confidence: result.confidence,
          latency_ms: result._meta.latency_ms
        }
      });

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failed++;
      results.push({
        test: testCase.name,
        status: 'ERROR',
        error: error.message
      });
    }

    console.log('');
  }

  // Wait a bit for async logging to complete
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Check if decisions were logged
  const afterCount = await db.query(`
    SELECT COUNT(*) as count
    FROM agent_core.agent_decisions
    WHERE tool_name = 'ContactTierTool'
  `);

  const newDecisions = parseInt(afterCount.rows[0].count) - parseInt(beforeCount.rows[0].count);

  console.log('══════════════════════════════════════════════════════════════');
  console.log('📊 RESULTS SUMMARY');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`Total Tests: ${testCases.length}`);
  console.log(`Passed: ${passed} (${Math.round(passed / testCases.length * 100)}%)`);
  console.log(`Failed: ${failed}`);
  console.log(`\n📝 Decision Logging:`);
  console.log(`   New decisions logged: ${newDecisions} (expected: ${testCases.length})`);

  if (newDecisions === testCases.length) {
    console.log(`   ✅ All decisions successfully logged to database`);
  } else {
    console.log(`   ⚠️  Warning: Expected ${testCases.length} new decisions, got ${newDecisions}`);
  }

  // Show sample logged decision
  const sampleDecision = await db.query(`
    SELECT
      decision_id,
      rule_version,
      (output_data->'inline'->>'tier') as tier,
      (output_data->'inline'->>'priority')::int as priority,
      confidence_score,
      latency_ms,
      created_at
    FROM agent_core.agent_decisions
    WHERE tool_name = 'ContactTierTool'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  if (sampleDecision.rows.length > 0) {
    console.log(`\n📋 Sample Logged Decision:`);
    console.log(`   Decision ID: ${sampleDecision.rows[0].decision_id}`);
    console.log(`   Tier: ${sampleDecision.rows[0].tier}`);
    console.log(`   Priority: ${sampleDecision.rows[0].priority}`);
    console.log(`   Confidence: ${sampleDecision.rows[0].confidence_score}`);
    console.log(`   Latency: ${sampleDecision.rows[0].latency_ms}ms`);
    console.log(`   Version: ${sampleDecision.rows[0].rule_version}`);
  }

  console.log('\n══════════════════════════════════════════════════════════════\n');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
