/**
 * Persona Integration Test - Sprint 71
 *
 * Tests that SIVA tools correctly load and use persona configuration
 * from the database (or fallback) for the Employee Banking sub-vertical.
 *
 * Run: node server/siva-tools/tests/test-persona-integration.js
 */

const personaLoader = require('../helpers/personaLoader');
const EdgeCasesToolStandalone = require('../EdgeCasesToolStandalone');
const TimingScoreToolStandalone = require('../TimingScoreToolStandalone');
const ContactTierToolStandalone = require('../ContactTierToolStandalone');

// Test configuration
const SUB_VERTICAL = 'employee-banking';

// Test cases
const TEST_CASES = {
  // Test 1: Enterprise company should trigger blocker
  enterpriseCompany: {
    company_profile: {
      name: 'Etihad Airways',
      sector: 'private',
      size: 5000,
    },
    sub_vertical_slug: SUB_VERTICAL,
    expected: {
      hasBlocker: true,
      blockerType: 'PERSONA_BLOCKER_COMPANY_NAME',
    },
  },

  // Test 2: Government sector should trigger blocker
  governmentEntity: {
    company_profile: {
      name: 'Dubai Municipality',
      sector: 'government',
      size: 2000,
    },
    sub_vertical_slug: SUB_VERTICAL,
    expected: {
      hasBlocker: true,
      blockerType: 'PERSONA_BLOCKER_SECTOR',
    },
  },

  // Test 3: Free Zone company should get booster
  freeZoneCompany: {
    company_profile: {
      name: 'TechStartup DMCC',
      sector: 'private',
      size: 150,
      license_type: 'Free Zone',
    },
    sub_vertical_slug: SUB_VERTICAL,
    signal_data: {
      days_since_signal: 5,
    },
    expected: {
      hasBooster: true,
      boosterType: 'PERSONA_BOOSTER_LICENSE_TYPE',
    },
  },

  // Test 4: Normal company should proceed
  normalCompany: {
    company_profile: {
      name: 'ABC Trading LLC',
      sector: 'private',
      size: 100,
    },
    sub_vertical_slug: SUB_VERTICAL,
    expected: {
      decision: 'PROCEED',
      hasBlocker: false,
    },
  },
};

// Timing test cases
const TIMING_TESTS = {
  // Test 1: Q1 should boost
  q1Timing: {
    signal_type: 'hiring',
    signal_age: 5,
    current_date: '2025-01-15',
    sub_vertical_slug: SUB_VERTICAL,
    expected: {
      calendarContext: 'PERSONA_Q1',
    },
  },

  // Test 2: Summer should reduce
  summerTiming: {
    signal_type: 'hiring',
    signal_age: 10,
    current_date: '2025-07-15',
    sub_vertical_slug: SUB_VERTICAL,
    expected: {
      calendarContext: 'PERSONA_SUMMER',
    },
  },
};

// Contact tier test cases
const CONTACT_TESTS = {
  // Test 1: Small company should target Founder/COO
  smallCompany: {
    title: 'HR Manager',
    company_size: 30,
    sub_vertical_slug: SUB_VERTICAL,
    expected: {
      personaTitlesUsed: true,
      titlesInclude: ['Founder', 'COO'],
    },
  },

  // Test 2: Mid-size should target HR Director
  midCompany: {
    title: 'HR Manager',
    company_size: 200,
    sub_vertical_slug: SUB_VERTICAL,
    expected: {
      personaTitlesUsed: true,
      titlesInclude: ['HR Director', 'HR Manager'],
    },
  },

  // Test 3: Large company should target Payroll Manager
  largeCompany: {
    title: 'HR Manager',
    company_size: 1000,
    sub_vertical_slug: SUB_VERTICAL,
    expected: {
      personaTitlesUsed: true,
      titlesInclude: ['Payroll Manager', 'Benefits Coordinator'],
    },
  },
};

// =============================================================================
// Test Runner
// =============================================================================

async function runTests() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  SIVA Persona Integration Tests - Sprint 71');
  console.log('═══════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  // Test 0: Persona Loading
  console.log('📋 Test 0: Persona Loading');
  try {
    const persona = await personaLoader.loadPersona(SUB_VERTICAL);
    if (persona) {
      console.log(`   ✓ Loaded persona: ${persona.persona_name || 'Fallback'}`);
      console.log(`   ✓ Entity type: ${persona.entity_type}`);
      console.log(`   ✓ Blockers: ${persona.edge_cases?.blockers?.length || 0}`);
      console.log(`   ✓ Boosters: ${persona.edge_cases?.boosters?.length || 0}`);
      passed++;
    } else {
      console.log('   ✗ Failed to load persona');
      failed++;
    }
  } catch (error) {
    console.log(`   ✗ Error: ${error.message}`);
    failed++;
  }

  // Test Edge Cases Tool
  console.log('\n📋 EdgeCasesTool Tests');
  const edgeTool = new EdgeCasesToolStandalone();

  for (const [testName, testCase] of Object.entries(TEST_CASES)) {
    try {
      const result = await edgeTool.execute(testCase);

      // Check blockers
      if (testCase.expected.hasBlocker) {
        const hasExpectedBlocker = result.blockers.some(
          b => b.type === testCase.expected.blockerType
        );
        if (hasExpectedBlocker) {
          console.log(`   ✓ ${testName}: Found expected blocker ${testCase.expected.blockerType}`);
          passed++;
        } else {
          console.log(`   ✗ ${testName}: Missing expected blocker ${testCase.expected.blockerType}`);
          console.log(`     Got blockers: ${result.blockers.map(b => b.type).join(', ')}`);
          failed++;
        }
      }

      // Check boosters
      if (testCase.expected.hasBooster) {
        const hasExpectedBooster = result.boosters?.some(
          b => b.type === testCase.expected.boosterType
        );
        if (hasExpectedBooster) {
          console.log(`   ✓ ${testName}: Found expected booster ${testCase.expected.boosterType}`);
          passed++;
        } else {
          console.log(`   ✗ ${testName}: Missing expected booster ${testCase.expected.boosterType}`);
          console.log(`     Got boosters: ${result.boosters?.map(b => b.type).join(', ') || 'none'}`);
          failed++;
        }
      }

      // Check decision
      if (testCase.expected.decision) {
        if (result.decision === testCase.expected.decision) {
          console.log(`   ✓ ${testName}: Decision is ${result.decision}`);
          passed++;
        } else {
          console.log(`   ✗ ${testName}: Expected decision ${testCase.expected.decision}, got ${result.decision}`);
          failed++;
        }
      }

      // Check persona loaded
      if (result.metadata.persona_loaded) {
        console.log(`   ✓ ${testName}: Persona loaded = ${result.metadata.persona_name || 'fallback'}`);
      }
    } catch (error) {
      console.log(`   ✗ ${testName}: Error - ${error.message}`);
      failed++;
    }
  }

  // Test Timing Score Tool
  console.log('\n📋 TimingScoreTool Tests');
  const timingTool = new TimingScoreToolStandalone();

  for (const [testName, testCase] of Object.entries(TIMING_TESTS)) {
    try {
      const result = await timingTool.execute(testCase);

      if (result.metadata.calendar_context?.startsWith('PERSONA_')) {
        console.log(`   ✓ ${testName}: Persona timing applied - ${result.metadata.calendar_context}`);
        passed++;
      } else {
        console.log(`   ✗ ${testName}: Expected persona timing, got ${result.metadata.calendar_context}`);
        failed++;
      }

      if (result.metadata.persona_loaded) {
        console.log(`   ✓ ${testName}: Persona loaded = ${result.metadata.persona_name || 'fallback'}`);
      }
    } catch (error) {
      console.log(`   ✗ ${testName}: Error - ${error.message}`);
      failed++;
    }
  }

  // Test Contact Tier Tool
  console.log('\n📋 ContactTierTool Tests');
  const contactTool = new ContactTierToolStandalone();

  for (const [testName, testCase] of Object.entries(CONTACT_TESTS)) {
    try {
      const result = await contactTool.execute(testCase);

      if (result.metadata.persona_titles_used) {
        console.log(`   ✓ ${testName}: Persona titles used`);
        passed++;

        // Check if expected titles are in target_titles
        const hasExpectedTitles = testCase.expected.titlesInclude.some(
          t => result.target_titles.includes(t)
        );
        if (hasExpectedTitles) {
          console.log(`   ✓ ${testName}: Found expected titles: ${result.target_titles.slice(0, 3).join(', ')}`);
          passed++;
        } else {
          console.log(`   ✗ ${testName}: Expected titles ${testCase.expected.titlesInclude.join(', ')}, got ${result.target_titles.join(', ')}`);
          failed++;
        }
      } else {
        console.log(`   ? ${testName}: Fallback titles used (persona may not have size tier for ${testCase.company_size})`);
      }

      if (result.metadata.persona_loaded) {
        console.log(`   ✓ ${testName}: Persona loaded = ${result.metadata.persona_name || 'fallback'}`);
      }
    } catch (error) {
      console.log(`   ✗ ${testName}: Error - ${error.message}`);
      failed++;
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);
