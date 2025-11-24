#!/usr/bin/env node
/**
 * CHECKPOINT 1: Verify Database Schema for Sprint 41
 * Tests that all feedback loop tables, views, functions, and constraints are created correctly
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: false
});

async function checkpoint1() {
  console.log('\n' + '='.repeat(80));
  console.log('CHECKPOINT 1: Database Schema Verification');
  console.log('Sprint 41: Feedback Loop & Learning System');
  console.log('='.repeat(80) + '\n');

  let passedTests = 0;
  let totalTests = 0;

  try {
    // Test 1: Verify all 8 tables exist
    console.log('Test 1: Verify all 8 feedback loop tables exist');
    totalTests++;
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'agent_core'
      AND table_name IN (
        'feedback',
        'decision_quality_scores',
        'experiments',
        'experiment_assignments',
        'experiment_metrics',
        'model_versions',
        'training_samples',
        'feedback_patterns'
      )
      ORDER BY table_name;
    `);

    const expectedTables = [
      'decision_quality_scores',
      'experiment_assignments',
      'experiment_metrics',
      'experiments',
      'feedback',
      'feedback_patterns',
      'model_versions',
      'training_samples'
    ];

    const actualTables = tablesResult.rows.map(r => r.table_name);
    if (JSON.stringify(actualTables) === JSON.stringify(expectedTables)) {
      console.log('   ✅ All 8 tables created successfully\n');
      passedTests++;
    } else {
      console.log('   ❌ Missing tables:', expectedTables.filter(t => !actualTables.includes(t)));
      console.log('   Found:', actualTables, '\n');
    }

    // Test 2: Verify feedback table schema
    console.log('Test 2: Verify feedback table schema');
    totalTests++;
    const feedbackSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'agent_core' AND table_name = 'feedback'
      ORDER BY ordinal_position;
    `);

    const requiredColumns = ['id', 'decision_id', 'user_id', 'feedback_type', 'rating', 'comment', 'correction_data', 'context', 'created_at', 'updated_at'];
    const actualColumns = feedbackSchema.rows.map(r => r.column_name);

    if (requiredColumns.every(col => actualColumns.includes(col))) {
      console.log('   ✅ Feedback table has all required columns');
      // Verify decision_id is UUID type
      const decisionIdCol = feedbackSchema.rows.find(r => r.column_name === 'decision_id');
      if (decisionIdCol.data_type === 'uuid') {
        console.log('   ✅ decision_id is UUID type (correct foreign key)\n');
        passedTests++;
      } else {
        console.log(`   ❌ decision_id is ${decisionIdCol.data_type}, expected uuid\n`);
      }
    } else {
      console.log('   ❌ Missing columns:', requiredColumns.filter(col => !actualColumns.includes(col)), '\n');
    }

    // Test 3: Verify decision_quality_scores table schema
    console.log('Test 3: Verify decision_quality_scores table schema');
    totalTests++;
    const qualitySchema = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'agent_core' AND table_name = 'decision_quality_scores'
      ORDER BY ordinal_position;
    `);

    const qualityColumns = qualitySchema.rows.map(r => r.column_name);
    const requiredQualityColumns = ['id', 'decision_id', 'quality_score', 'confidence_adjusted_score', 'feedback_count', 'positive_count', 'negative_count', 'positive_ratio'];

    if (requiredQualityColumns.every(col => qualityColumns.includes(col))) {
      console.log('   ✅ decision_quality_scores table has all required columns\n');
      passedTests++;
    } else {
      console.log('   ❌ Missing columns:', requiredQualityColumns.filter(col => !qualityColumns.includes(col)), '\n');
    }

    // Test 4: Verify materialized view exists
    console.log('Test 4: Verify feedback_summary materialized view');
    totalTests++;
    const viewResult = await pool.query(`
      SELECT schemaname, matviewname
      FROM pg_matviews
      WHERE schemaname = 'agent_core'
      AND matviewname = 'feedback_summary';
    `);

    if (viewResult.rows.length === 1) {
      console.log('   ✅ feedback_summary materialized view created\n');
      passedTests++;
    } else {
      console.log('   ❌ feedback_summary materialized view not found\n');
    }

    // Test 5: Verify calculate_quality_score function
    console.log('Test 5: Verify calculate_quality_score function');
    totalTests++;
    const funcResult = await pool.query(`
      SELECT routine_name, data_type as return_type
      FROM information_schema.routines
      WHERE routine_schema = 'agent_core'
      AND routine_name = 'calculate_quality_score';
    `);

    if (funcResult.rows.length === 1 && funcResult.rows[0].return_type === 'numeric') {
      console.log('   ✅ calculate_quality_score function created (returns numeric)\n');
      passedTests++;
    } else {
      console.log('   ❌ calculate_quality_score function not found or incorrect return type\n');
    }

    // Test 6: Verify refresh_feedback_summary function
    console.log('Test 6: Verify refresh_feedback_summary function');
    totalTests++;
    const refreshFuncResult = await pool.query(`
      SELECT routine_name, data_type as return_type
      FROM information_schema.routines
      WHERE routine_schema = 'agent_core'
      AND routine_name = 'refresh_feedback_summary';
    `);

    if (refreshFuncResult.rows.length === 1 && refreshFuncResult.rows[0].return_type === 'void') {
      console.log('   ✅ refresh_feedback_summary function created\n');
      passedTests++;
    } else {
      console.log('   ❌ refresh_feedback_summary function not found\n');
    }

    // Test 7: Verify foreign key constraint
    console.log('Test 7: Verify foreign key constraint (feedback -> agent_decisions)');
    totalTests++;
    const fkResult = await pool.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'agent_core'
      AND tc.table_name = 'feedback'
      AND kcu.column_name = 'decision_id';
    `);

    if (fkResult.rows.length > 0 && fkResult.rows[0].foreign_table_name === 'agent_decisions') {
      console.log('   ✅ Foreign key constraint correctly references agent_decisions.decision_id\n');
      passedTests++;
    } else {
      console.log('   ❌ Foreign key constraint not found or incorrect\n');
    }

    // Test 8: Test inserting sample data
    console.log('Test 8: Test sample data insertion');
    totalTests++;
    try {
      // Get a sample decision_id from agent_decisions
      const sampleDecision = await pool.query(`
        SELECT decision_id FROM agent_core.agent_decisions LIMIT 1
      `);

      if (sampleDecision.rows.length > 0) {
        const testDecisionId = sampleDecision.rows[0].decision_id;

        // Insert test feedback
        await pool.query(`
          INSERT INTO agent_core.feedback (decision_id, feedback_type, rating, comment)
          VALUES ($1, 'thumbs_up', 5, 'Test feedback for checkpoint')
          RETURNING id;
        `, [testDecisionId]);

        console.log('   ✅ Successfully inserted test feedback');

        // Test quality score calculation
        const scoreResult = await pool.query(`
          SELECT agent_core.calculate_quality_score($1) as quality_score;
        `, [testDecisionId]);

        console.log(`   ✅ Quality score calculation works: ${scoreResult.rows[0].quality_score || 'NULL (expected for single feedback)'}`);

        // Clean up test data
        await pool.query(`
          DELETE FROM agent_core.feedback WHERE decision_id = $1 AND comment = 'Test feedback for checkpoint';
        `, [testDecisionId]);

        console.log('   ✅ Test data cleaned up\n');
        passedTests++;
      } else {
        console.log('   ⚠️  No existing decisions to test with (skipping test)\n');
      }
    } catch (err) {
      console.log('   ❌ Error during data insertion test:', err.message, '\n');
    }

    // Test 9: Verify indexes
    console.log('Test 9: Verify indexes on critical columns');
    totalTests++;
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'agent_core'
      AND tablename IN ('feedback', 'decision_quality_scores')
      ORDER BY indexname;
    `);

    const criticalIndexes = ['idx_feedback_decision_id', 'idx_quality_scores_decision_id'];
    const actualIndexes = indexResult.rows.map(r => r.indexname);

    if (criticalIndexes.every(idx => actualIndexes.includes(idx))) {
      console.log('   ✅ Critical indexes created for performance\n');
      passedTests++;
    } else {
      console.log('   ❌ Missing indexes:', criticalIndexes.filter(idx => !actualIndexes.includes(idx)), '\n');
    }

    // Final Results
    console.log('='.repeat(80));
    console.log(`CHECKPOINT 1 RESULTS: ${passedTests}/${totalTests} tests passed`);
    console.log('='.repeat(80));

    if (passedTests === totalTests) {
      console.log('\n✅ ✅ ✅ CHECKPOINT 1 PASSED ✅ ✅ ✅');
      console.log('\nAll database schema components verified successfully!');
      console.log('Ready to proceed to Task 3: Implement feedback collection endpoints\n');
      process.exit(0);
    } else {
      console.log(`\n❌ CHECKPOINT 1 FAILED: ${totalTests - passedTests} test(s) failed`);
      console.log('Fix the issues before proceeding to the next task.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ CHECKPOINT 1 FAILED with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkpoint1();
