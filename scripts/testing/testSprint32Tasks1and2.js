#!/usr/bin/env node
/**
 * Sprint 32 - Tasks 1 & 2 Testing Checkpoint
 *
 * Tests:
 * - Task 1: Doctrine prompts are installed and accessible
 * - Task 2: A/B testing infrastructure works correctly
 */

const { Pool } = require('pg');
const { PromptABTestingService } = require('../../server/services/promptABTestingService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const abTestService = new PromptABTestingService(pool);

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  testsRun++;
  if (condition) {
    console.log(`✅ ${testName}`);
    testsPassed++;
  } else {
    console.log(`❌ ${testName}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('🧪 Sprint 32 - Tasks 1 & 2 Testing Checkpoint\n');

  try {
    // ═══════════════════════════════════════════════════════════
    // TASK 1: DOCTRINE PROMPTS
    // ═══════════════════════════════════════════════════════════

    console.log('📝 Task 1: Doctrine Prompts\n');

    // Test 1.1: Company research prompt exists
    const companyPrompt = await pool.query(
      `SELECT * FROM prompt_versions
       WHERE name = 'company_research' AND version = 'v1.0-doctrine' AND active = true`
    );
    assert(companyPrompt.rows.length === 1, 'Test 1.1: Company research prompt exists');

    // Test 1.2: Contact qualification prompt exists
    const contactPrompt = await pool.query(
      `SELECT * FROM prompt_versions
       WHERE name = 'contact_qualification' AND version = 'v1.0-doctrine' AND active = true`
    );
    assert(contactPrompt.rows.length === 1, 'Test 1.2: Contact qualification prompt exists');

    // Test 1.3: Outreach strategy prompt exists
    const strategyPrompt = await pool.query(
      `SELECT * FROM prompt_versions
       WHERE name = 'outreach_strategy' AND version = 'v1.0-doctrine' AND active = true`
    );
    assert(strategyPrompt.rows.length === 1, 'Test 1.3: Outreach strategy prompt exists');

    // Test 1.4: Prompts have valid schemas
    const promptsWithSchema = await pool.query(
      `SELECT name, schema FROM prompt_versions
       WHERE name IN ('company_research', 'contact_qualification', 'outreach_strategy')
         AND version = 'v1.0-doctrine'`
    );
    const allHaveSchemas = promptsWithSchema.rows.every(row =>
      row.schema && typeof row.schema === 'object' && row.schema.type === 'object'
    );
    assert(allHaveSchemas, 'Test 1.4: All prompts have valid JSON schemas');

    // Test 1.5: Prompts have golden test sets
    const promptsWithGolden = await pool.query(
      `SELECT name, golden_set FROM prompt_versions
       WHERE name IN ('company_research', 'contact_qualification', 'outreach_strategy')
         AND version = 'v1.0-doctrine'`
    );
    const allHaveGolden = promptsWithGolden.rows.every(row =>
      Array.isArray(row.golden_set) && row.golden_set.length > 0
    );
    assert(allHaveGolden, 'Test 1.5: All prompts have golden test sets');

    console.log('');

    // ═══════════════════════════════════════════════════════════
    // TASK 2: A/B TESTING INFRASTRUCTURE
    // ═══════════════════════════════════════════════════════════

    console.log('📊 Task 2: A/B Testing Infrastructure\n');

    // Test 2.1: prompt_executions table exists
    const executionsTable = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'prompt_executions'`
    );
    assert(executionsTable.rows.length === 1, 'Test 2.1: prompt_executions table exists');

    // Test 2.2: prompt_ab_tests table exists
    const abTestsTable = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'prompt_ab_tests'`
    );
    assert(abTestsTable.rows.length === 1, 'Test 2.2: prompt_ab_tests table exists');

    // Test 2.3: prompt_performance_metrics view exists
    const metricsView = await pool.query(
      `SELECT matviewname FROM pg_matviews
       WHERE matviewname = 'prompt_performance_metrics'`
    );
    assert(metricsView.rows.length === 1, 'Test 2.3: prompt_performance_metrics view exists');

    // Test 2.4: Log a test execution
    const executionId = await abTestService.logExecution({
      prompt_name: 'company_research',
      prompt_version: 'v1.0-doctrine',
      execution_time_ms: 1250,
      success: true,
      input_variables: { company_name: 'Test Corp', industry: 'Technology' },
      output_data: { quality_score: 75, tier: 'QUALIFIED' },
      output_quality_score: 75
    });
    assert(executionId !== null && executionId !== undefined, 'Test 2.4: Can log prompt execution');

    // Test 2.5: Verify execution was logged
    const execution = await pool.query(
      'SELECT * FROM prompt_executions WHERE id = $1',
      [executionId]
    );
    assert(
      execution.rows.length === 1 &&
      execution.rows[0].prompt_name === 'company_research',
      'Test 2.5: Execution logged correctly'
    );

    // Test 2.6: Create an A/B test
    const abTest = await abTestService.createABTest({
      prompt_name: 'company_research',
      traffic_split: { 'v1.0-doctrine': 1.0 },
      min_sample_size: 50,
      confidence_threshold: 0.95
    });
    assert(abTest && abTest.prompt_name === 'company_research', 'Test 2.6: Can create A/B test');

    // Test 2.7: Get A/B test
    const retrievedTest = await abTestService.getABTest('company_research');
    assert(
      retrievedTest &&
      retrievedTest.prompt_name === 'company_research' &&
      retrievedTest.min_sample_size === 50,
      'Test 2.7: Can retrieve A/B test'
    );

    // Test 2.8: Refresh performance metrics
    await abTestService.refreshMetrics();
    const metrics = await abTestService.getPromptPerformance('company_research');
    assert(
      metrics.length > 0 &&
      metrics[0].prompt_name === 'company_research',
      'Test 2.8: Can refresh and retrieve performance metrics'
    );

    // Test 2.9: Update execution conversion
    await abTestService.updateExecutionConversion(executionId, {
      message_sent: true,
      message_opened: true
    });
    const updatedExecution = await pool.query(
      'SELECT message_sent, message_opened FROM prompt_executions WHERE id = $1',
      [executionId]
    );
    assert(
      updatedExecution.rows[0].message_sent === true &&
      updatedExecution.rows[0].message_opened === true,
      'Test 2.9: Can update execution conversion data'
    );

    // Test 2.10: List A/B tests
    const allTests = await abTestService.listABTests();
    assert(
      allTests.length > 0,
      'Test 2.10: Can list A/B tests'
    );

    // Test 2.11: Toggle A/B test
    const toggledTest = await abTestService.toggleABTest('company_research', false);
    assert(
      toggledTest && toggledTest.test_enabled === false,
      'Test 2.11: Can toggle A/B test enabled/disabled'
    );

    // Re-enable for cleanup
    await abTestService.toggleABTest('company_research', true);

    console.log('');

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════

    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Total Tests: ${testsRun}`);
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log('═══════════════════════════════════════════════════════');

    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed! Tasks 1 & 2 complete.\n');
      console.log('✅ Task 1: Doctrine Prompts (3/3 prompts installed)');
      console.log('✅ Task 2: A/B Testing Infrastructure (fully functional)\n');
    } else {
      console.log(`\n⚠️  ${testsFailed} test(s) failed. Please review.\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // abTestService uses the same pool, so only close once
    await pool.end();
  }
}

runTests();
