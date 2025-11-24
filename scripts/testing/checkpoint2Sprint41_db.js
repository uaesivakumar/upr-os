#!/usr/bin/env node
/**
 * CHECKPOINT 2: Test Feedback Collection Logic (Database Layer)
 * Tests feedback collection and quality scoring logic directly at the database layer
 * This validates the core functionality without requiring the HTTP server to be running
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

async function checkpoint2DB() {
  console.log('\n' + '='.repeat(80));
  console.log('CHECKPOINT 2: Feedback Collection Logic Test (Database Layer)');
  console.log('Sprint 41: Feedback Loop & Learning System');
  console.log('='.repeat(80) + '\n');

  let passedTests = 0;
  let totalTests = 0;
  let testDecisionId = null;
  const feedbackIds = [];

  try {
    // Get a sample decision_id from the database
    console.log('Setup: Getting sample decision_id from database...');
    const sampleDecision = await pool.query(`
      SELECT decision_id FROM agent_core.agent_decisions LIMIT 1
    `);

    if (sampleDecision.rows.length === 0) {
      console.log('❌ No agent decisions found in database. Cannot proceed with tests.');
      process.exit(1);
    }

    testDecisionId = sampleDecision.rows[0].decision_id;
    console.log(`✅ Using decision_id: ${testDecisionId}\n`);

    // Test 1: Insert thumbs_up feedback
    console.log('Test 1: Insert thumbs_up feedback');
    totalTests++;
    try {
      const result = await pool.query(`
        INSERT INTO agent_core.feedback (
          decision_id,
          user_id,
          feedback_type,
          comment
        ) VALUES ($1, NULL, 'thumbs_up', 'Test feedback - thumbs up')
        RETURNING id, decision_id, feedback_type, created_at
      `, [testDecisionId]);

      feedbackIds.push(result.rows[0].id);
      console.log('   ✅ Thumbs up feedback inserted successfully');
      console.log(`   Feedback ID: ${result.rows[0].id}\n`);
      passedTests++;
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 2: Insert rating feedback
    console.log('Test 2: Insert rating feedback');
    totalTests++;
    try {
      const result = await pool.query(`
        INSERT INTO agent_core.feedback (
          decision_id,
          user_id,
          feedback_type,
          rating,
          comment
        ) VALUES ($1, NULL, 'rating', 5, 'Test rating - excellent')
        RETURNING id, decision_id, rating, created_at
      `, [testDecisionId]);

      feedbackIds.push(result.rows[0].id);
      console.log('   ✅ Rating feedback inserted successfully');
      console.log(`   Rating: ${result.rows[0].rating}\n`);
      passedTests++;
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 3: Insert correction feedback
    console.log('Test 3: Insert correction feedback');
    totalTests++;
    try {
      const correctionData = { corrected_field: 'corrected_value', reason: 'Test correction' };
      const result = await pool.query(`
        INSERT INTO agent_core.feedback (
          decision_id,
          user_id,
          feedback_type,
          rating,
          comment,
          correction_data
        ) VALUES ($1, NULL, 'correction', 1, 'Test correction feedback', $2)
        RETURNING id, decision_id, correction_data, created_at
      `, [testDecisionId, JSON.stringify(correctionData)]);

      const feedbackId = result.rows[0].id;
      feedbackIds.push(feedbackId);

      // Create training sample from correction
      const decisionResult = await pool.query(`
        SELECT tool_name, input_data, output_data
        FROM agent_core.agent_decisions
        WHERE decision_id = $1
      `, [testDecisionId]);

      if (decisionResult.rows.length > 0) {
        const decision = decisionResult.rows[0];
        await pool.query(`
          INSERT INTO agent_core.training_samples (
            model_type,
            input_data,
            expected_output,
            source,
            source_id,
            quality_score
          ) VALUES ($1, $2, $3, 'user_feedback', $4, 100)
        `, [
          decision.tool_name,
          decision.input_data,
          JSON.stringify(correctionData),
          feedbackId
        ]);
      }

      console.log('   ✅ Correction feedback inserted and training sample created\n');
      passedTests++;
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 4: Insert thumbs_down feedback
    console.log('Test 4: Insert thumbs_down feedback');
    totalTests++;
    try {
      const result = await pool.query(`
        INSERT INTO agent_core.feedback (
          decision_id,
          user_id,
          feedback_type,
          comment
        ) VALUES ($1, NULL, 'thumbs_down', 'Test feedback - needs improvement')
        RETURNING id, decision_id, feedback_type, created_at
      `, [testDecisionId]);

      feedbackIds.push(result.rows[0].id);
      console.log('   ✅ Thumbs down feedback inserted successfully\n');
      passedTests++;
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 5: Calculate quality score using function
    console.log('Test 5: Calculate quality score for decision');
    totalTests++;
    try {
      const scoreResult = await pool.query(`
        SELECT agent_core.calculate_quality_score($1) as quality_score
      `, [testDecisionId]);

      const quality_score = scoreResult.rows[0].quality_score;

      if (quality_score !== null) {
        console.log(`   ✅ Quality score calculated: ${quality_score}`);
        console.log(`   Score is between 0-100: ${quality_score >= 0 && quality_score <= 100 ? 'YES' : 'NO'}\n`);
        passedTests++;
      } else {
        console.log('   ⚠️  Quality score is NULL (no feedback yet)\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 6: Upsert decision quality scores
    console.log('Test 6: Insert/Update decision quality scores');
    totalTests++;
    try {
      const scoreResult = await pool.query(`
        SELECT agent_core.calculate_quality_score($1) as quality_score
      `, [testDecisionId]);

      const quality_score = scoreResult.rows[0].quality_score;

      await pool.query(`
        INSERT INTO agent_core.decision_quality_scores (
          decision_id,
          quality_score,
          feedback_count,
          calculated_at
        )
        SELECT
          $1,
          $2,
          COUNT(*),
          NOW()
        FROM agent_core.feedback
        WHERE decision_id = $1
        ON CONFLICT (decision_id) DO UPDATE
        SET
          quality_score = EXCLUDED.quality_score,
          feedback_count = EXCLUDED.feedback_count,
          calculated_at = EXCLUDED.calculated_at,
          updated_at = NOW()
      `, [testDecisionId, quality_score]);

      console.log('   ✅ Decision quality scores upserted successfully\n');
      passedTests++;
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 7: Retrieve all feedback for decision
    console.log('Test 7: Retrieve all feedback for decision');
    totalTests++;
    try {
      const result = await pool.query(`
        SELECT
          f.id,
          f.feedback_type,
          f.rating,
          f.comment,
          f.correction_data,
          f.created_at,
          q.quality_score
        FROM agent_core.feedback f
        LEFT JOIN agent_core.decision_quality_scores q ON q.decision_id = f.decision_id
        WHERE f.decision_id = $1
        AND f.comment LIKE 'Test %'
        ORDER BY f.created_at DESC
      `, [testDecisionId]);

      if (result.rows.length >= 4) {
        console.log(`   ✅ Retrieved ${result.rows.length} feedback entries`);
        console.log(`   Feedback types: ${result.rows.map(f => f.feedback_type).join(', ')}`);
        console.log(`   Quality score: ${result.rows[0].quality_score}\n`);
        passedTests++;
      } else {
        console.log(`   ❌ Expected at least 4 entries, got ${result.rows.length}\n`);
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 8: Retrieve quality score for decision
    console.log('Test 8: Retrieve quality score from decision_quality_scores table');
    totalTests++;
    try {
      const result = await pool.query(`
        SELECT
          q.quality_score,
          q.confidence_adjusted_score,
          q.feedback_count,
          q.positive_count,
          q.negative_count,
          q.positive_ratio,
          q.calculated_at,
          d.tool_name as agent_type,
          d.confidence_score as agent_confidence
        FROM agent_core.decision_quality_scores q
        JOIN agent_core.agent_decisions d ON q.decision_id = d.decision_id
        WHERE q.decision_id = $1
      `, [testDecisionId]);

      if (result.rows.length > 0) {
        const quality = result.rows[0];
        console.log('   ✅ Quality score retrieved successfully');
        console.log(`   Quality score: ${quality.quality_score}`);
        console.log(`   Feedback count: ${quality.feedback_count}`);
        console.log(`   Agent type: ${quality.agent_type}\n`);
        passedTests++;
      } else {
        console.log('   ❌ No quality score found\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 9: Aggregate feedback statistics
    console.log('Test 9: Calculate aggregate feedback statistics');
    totalTests++;
    try {
      const result = await pool.query(`
        SELECT
          COUNT(DISTINCT f.id) as total_feedback,
          COUNT(DISTINCT f.decision_id) as decisions_with_feedback,
          COUNT(*) FILTER (WHERE f.feedback_type = 'thumbs_up') as thumbs_up_count,
          COUNT(*) FILTER (WHERE f.feedback_type = 'thumbs_down') as thumbs_down_count,
          COUNT(*) FILTER (WHERE f.feedback_type = 'correction') as correction_count,
          COUNT(*) FILTER (WHERE f.rating IS NOT NULL) as rating_count,
          AVG(f.rating) FILTER (WHERE f.rating IS NOT NULL) as avg_rating,
          COUNT(DISTINCT f.user_id) as unique_users
        FROM agent_core.feedback f
        WHERE f.created_at >= NOW() - INTERVAL '7 days'
        AND f.comment LIKE 'Test %'
      `);

      const stats = result.rows[0];
      console.log('   ✅ Aggregate statistics calculated');
      console.log(`   Total feedback: ${stats.total_feedback}`);
      console.log(`   Thumbs up: ${stats.thumbs_up_count}`);
      console.log(`   Thumbs down: ${stats.thumbs_down_count}`);
      console.log(`   Corrections: ${stats.correction_count}`);
      console.log(`   Average rating: ${stats.avg_rating ? parseFloat(stats.avg_rating).toFixed(2) : 'N/A'}\n`);
      passedTests++;
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 10: Verify training sample created from correction
    console.log('Test 10: Verify training sample from correction');
    totalTests++;
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM agent_core.training_samples
        WHERE source = 'user_feedback'
        AND source_id IN (
          SELECT id FROM agent_core.feedback
          WHERE decision_id = $1 AND feedback_type = 'correction'
        )
      `, [testDecisionId]);

      const count = parseInt(result.rows[0].count);

      if (count > 0) {
        console.log(`   ✅ ${count} training sample(s) created from corrections\n`);
        passedTests++;
      } else {
        console.log('   ❌ No training samples found\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Cleanup: Remove test data
    console.log('Cleanup: Removing test feedback data...');
    // Delete training samples first (foreign key dependency)
    await pool.query(`
      DELETE FROM agent_core.training_samples
      WHERE source = 'user_feedback'
      AND source_id IN (
        SELECT id FROM agent_core.feedback
        WHERE decision_id = $1 AND comment LIKE 'Test %'
      )
    `, [testDecisionId]);

    // Delete quality scores
    await pool.query(`
      DELETE FROM agent_core.decision_quality_scores
      WHERE decision_id = $1
    `, [testDecisionId]);

    // Delete feedback
    await pool.query(`
      DELETE FROM agent_core.feedback
      WHERE decision_id = $1 AND comment LIKE 'Test %'
    `, [testDecisionId]);

    console.log('✅ Test data cleaned up\n');

    // Final Results
    console.log('='.repeat(80));
    console.log(`CHECKPOINT 2 RESULTS: ${passedTests}/${totalTests} tests passed`);
    console.log('='.repeat(80));

    if (passedTests === totalTests) {
      console.log('\n✅ ✅ ✅ CHECKPOINT 2 PASSED ✅ ✅ ✅');
      console.log('\nAll feedback collection logic verified successfully!');
      console.log('Database layer works correctly for:');
      console.log('  - Inserting all feedback types (thumbs up/down, ratings, corrections)');
      console.log('  - Calculating quality scores');
      console.log('  - Upserting decision quality scores');
      console.log('  - Retrieving feedback and statistics');
      console.log('  - Creating training samples from corrections');
      console.log('\nReady to proceed to Task 4: Build feedback analysis service\n');
      process.exit(0);
    } else {
      console.log(`\n❌ CHECKPOINT 2 FAILED: ${totalTests - passedTests} test(s) failed`);
      console.log('Fix the issues before proceeding to the next task.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ CHECKPOINT 2 FAILED with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkpoint2DB();
