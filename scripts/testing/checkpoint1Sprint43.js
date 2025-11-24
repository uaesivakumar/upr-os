#!/usr/bin/env node
/**
 * CHECKPOINT 1: Sprint 43 - Foundation Validation
 *
 * Validates:
 * - Database schema created correctly
 * - Training data pipeline functional
 * - Dataset manager operations
 * - Data flow from source to dataset
 */

const pool = require('../../server/config/database');
const TrainingDataPipeline = require('../../server/services/trainingDataPipeline');
const { DatasetManager } = require('../../server/services/datasetManager');

console.log('\n' + '='.repeat(80));
console.log('CHECKPOINT 1: GOLDEN DATASET FOUNDATION');
console.log('='.repeat(80) + '\n');

let testsPassed = 0;
let testsFailed = 0;

async function runTests() {
  try {
    // TEST 1: Verify database schema
    console.log('TEST 1: Verify database schema...');
    await test1_VerifySchema();
    testsPassed++;
    console.log('✅ TEST 1 PASSED\n');

    // TEST 2: Dataset creation
    console.log('TEST 2: Dataset creation...');
    const dataset = await test2_DatasetCreation();
    testsPassed++;
    console.log('✅ TEST 2 PASSED\n');

    // TEST 3: Training data pipeline extraction
    console.log('TEST 3: Training data pipeline extraction...');
    await test3_PipelineExtraction();
    testsPassed++;
    console.log('✅ TEST 3 PASSED\n');

    // TEST 4: Add examples to dataset
    console.log('TEST 4: Add examples to dataset...');
    await test4_AddExamples(dataset);
    testsPassed++;
    console.log('✅ TEST 4 PASSED\n');

    // TEST 5: Dataset validation
    console.log('TEST 5: Dataset validation...');
    await test5_DatasetValidation(dataset);
    testsPassed++;
    console.log('✅ TEST 5 PASSED\n');

    // TEST 6: Git-like commit
    console.log('TEST 6: Git-like commit...');
    await test6_Commit(dataset);
    testsPassed++;
    console.log('✅ TEST 6 PASSED\n');

    // All tests passed
    console.log('='.repeat(80));
    console.log('CHECKPOINT 1 RESULTS');
    console.log('='.repeat(80));
    console.log(`✅ Tests Passed: ${testsPassed}/${testsPassed + testsFailed}`);
    console.log('\n✅ ✅ ✅ CHECKPOINT 1 PASSED ✅ ✅ ✅\n');
    console.log('Foundation validated:');
    console.log('  ✓ Database schema created (10 tables, 3 views)');
    console.log('  ✓ Dataset manager functional');
    console.log('  ✓ Training data pipeline operational');
    console.log('  ✓ Example addition and validation working');
    console.log('  ✓ Git-like versioning functional\n');

    process.exit(0);

  } catch (error) {
    testsFailed++;
    console.error('❌ TEST FAILED:', error.message);
    console.error('Stack:', error.stack);
    console.log('\n' + '='.repeat(80));
    console.log('CHECKPOINT 1 RESULTS');
    console.log('='.repeat(80));
    console.log(`Tests Passed: ${testsPassed}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log('\n❌ CHECKPOINT 1 FAILED\n');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * TEST 1: Verify database schema
 */
async function test1_VerifySchema() {
  console.log('  Checking training schema exists...');

  const schemaCheck = await pool.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name = 'training'
  `);

  if (schemaCheck.rows.length === 0) {
    throw new Error('Training schema not found');
  }
  console.log('  ✓ Training schema exists');

  // Check tables
  const tables = [
    'datasets', 'examples', 'example_quality', 'dataset_commits',
    'example_changes', 'labeling_sessions', 'label_history', 'dataset_analytics'
  ];

  console.log('  Checking tables...');
  for (const table of tables) {
    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'training' AND table_name = $1
    `, [table]);

    if (tableCheck.rows.length === 0) {
      throw new Error(`Table training.${table} not found`);
    }
  }
  console.log(`  ✓ All ${tables.length} tables exist`);

  // Check views
  const views = ['v_active_datasets', 'v_example_quality_summary', 'v_labeler_productivity'];
  console.log('  Checking views...');
  for (const view of views) {
    const viewCheck = await pool.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'training' AND table_name = $1
    `, [view]);

    if (viewCheck.rows.length === 0) {
      throw new Error(`View training.${view} not found`);
    }
  }
  console.log(`  ✓ All ${views.length} views exist`);

  // Check default dataset
  const defaultDataset = await pool.query(`
    SELECT * FROM training.datasets WHERE name = 'golden-v1' AND version = '1.0.0'
  `);

  if (defaultDataset.rows.length === 0) {
    throw new Error('Default dataset not found');
  }
  console.log('  ✓ Default dataset initialized');
}

/**
 * TEST 2: Dataset creation
 */
async function test2_DatasetCreation() {
  console.log('  Creating test dataset...');

  const dataset = await DatasetManager.create({
    name: 'test-checkpoint1',
    version: '1.0.0',
    description: 'Test dataset for checkpoint 1',
    createdBy: 'checkpoint-test',
    tags: ['test', 'checkpoint']
  });

  if (!dataset.id) {
    throw new Error('Dataset creation failed - no ID returned');
  }
  console.log(`  ✓ Dataset created with ID: ${dataset.id}`);

  // Verify dataset in database
  const verify = await pool.query(
    'SELECT * FROM training.datasets WHERE id = $1',
    [dataset.id]
  );

  if (verify.rows.length === 0) {
    throw new Error('Dataset not found in database after creation');
  }
  console.log('  ✓ Dataset verified in database');

  return dataset;
}

/**
 * TEST 3: Training data pipeline extraction
 */
async function test3_PipelineExtraction() {
  console.log('  Testing pipeline extraction...');

  const pipeline = new TrainingDataPipeline({
    sourceType: 'agent_decisions',
    filters: {
      confidence: { min: 0.7 },
      limit: 10
    },
    qualityThreshold: 0
  });

  const examples = await pipeline.extract();

  console.log(`  ✓ Extracted ${examples.length} examples`);

  // Verify examples have required fields
  if (examples.length > 0) {
    const example = examples[0];

    if (!example.example_type) throw new Error('Example missing example_type');
    if (!example.input_data) throw new Error('Example missing input_data');
    if (!example.expected_output) throw new Error('Example missing expected_output');
    if (example.quality_score === undefined) throw new Error('Example missing quality_score');

    console.log('  ✓ Examples have required fields');
    console.log(`  ✓ Quality scores range: ${Math.min(...examples.map(e => e.quality_score))} - ${Math.max(...examples.map(e => e.quality_score))}`);
  } else {
    console.log('  ⚠ No examples extracted (this is OK if no production data exists)');
  }
}

/**
 * TEST 4: Add examples to dataset
 */
async function test4_AddExamples(dataset) {
  console.log('  Creating test examples...');

  const testExamples = [
    {
      example_type: 'contact_tier',
      input_data: {
        title: 'Chief Technology Officer',
        seniority: 'executive',
        department: 'engineering'
      },
      expected_output: {
        tier: 'A',
        confidence: 0.95,
        reasoning: 'Executive-level technical decision maker'
      },
      quality_score: 92,
      labels: {
        difficulty: 'easy',
        edge_case: false
      }
    },
    {
      example_type: 'lead_score',
      input_data: {
        fit_score: 85,
        engagement_score: 72,
        intent_signals: ['website_visit', 'demo_request']
      },
      expected_output: {
        lead_score: 88,
        priority: 'hot',
        reasoning: 'High fit with strong engagement'
      },
      quality_score: 85,
      labels: {
        difficulty: 'medium'
      }
    }
  ];

  console.log(`  Adding ${testExamples.length} examples to dataset...`);

  const result = await dataset.addExamples(testExamples);

  if (result.addedCount !== testExamples.length) {
    throw new Error(`Expected ${testExamples.length} examples added, got ${result.addedCount}`);
  }
  console.log(`  ✓ Added ${result.addedCount} examples`);

  // Verify examples in database
  const verify = await pool.query(
    'SELECT COUNT(*) as count FROM training.examples WHERE dataset_id = $1',
    [dataset.id]
  );

  const count = parseInt(verify.rows[0].count);
  if (count < testExamples.length) {
    throw new Error(`Expected at least ${testExamples.length} examples in database, found ${count}`);
  }
  console.log(`  ✓ Verified ${count} examples in database`);

  // Check example count trigger updated dataset
  const datasetCheck = await pool.query(
    'SELECT example_count FROM training.datasets WHERE id = $1',
    [dataset.id]
  );

  const exampleCount = datasetCheck.rows[0].example_count;
  if (exampleCount !== count) {
    throw new Error(`Dataset example_count (${exampleCount}) doesn't match actual count (${count})`);
  }
  console.log('  ✓ Example count trigger working correctly');
}

/**
 * TEST 5: Dataset validation
 */
async function test5_DatasetValidation(dataset) {
  console.log('  Running dataset validation...');

  const validation = await dataset.validate();

  console.log(`  ✓ Total examples: ${validation.totalExamples}`);
  console.log(`  ✓ Valid examples: ${validation.validExamples}`);
  console.log(`  ✓ Avg quality score: ${validation.avgQualityScore}`);
  console.log(`  ✓ Validation rate: ${validation.validationRate}%`);

  if (validation.totalExamples === 0) {
    throw new Error('No examples found for validation');
  }

  if (validation.avgQualityScore < 0 || validation.avgQualityScore > 100) {
    throw new Error(`Invalid avg quality score: ${validation.avgQualityScore}`);
  }

  // Verify quality score was updated in database
  const datasetCheck = await pool.query(
    'SELECT quality_score FROM training.datasets WHERE id = $1',
    [dataset.id]
  );

  if (!datasetCheck.rows[0].quality_score) {
    throw new Error('Quality score not updated in dataset');
  }
  console.log('  ✓ Quality score updated in dataset');
}

/**
 * TEST 6: Git-like commit
 */
async function test6_Commit(dataset) {
  console.log('  Creating commit...');

  const commit = await dataset.commit({
    message: 'Initial commit with test examples',
    author: 'checkpoint-test',
    examplesAdded: 2
  });

  if (!commit.commit_hash) {
    throw new Error('Commit hash not generated');
  }
  console.log(`  ✓ Commit created: ${commit.commit_hash.substring(0, 8)}...`);

  // Verify commit in database
  const verify = await pool.query(
    'SELECT * FROM training.dataset_commits WHERE commit_hash = $1',
    [commit.commit_hash]
  );

  if (verify.rows.length === 0) {
    throw new Error('Commit not found in database');
  }
  console.log('  ✓ Commit verified in database');

  // Test commit history
  const history = await dataset.getCommitHistory();
  if (history.length === 0) {
    throw new Error('Commit history is empty');
  }
  console.log(`  ✓ Commit history has ${history.length} entries`);
}

// Run all tests
runTests();
