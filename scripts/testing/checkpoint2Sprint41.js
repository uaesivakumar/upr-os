#!/usr/bin/env node
/**
 * CHECKPOINT 2: Test Feedback Collection API
 * Tests all feedback collection endpoints work correctly
 */

import fetch from 'node-fetch';
import pg from 'pg';
const { Pool } = pg;

const API_URL = process.env.API_URL || 'http://localhost:8080';

const pool = new Pool({
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: false
});

async function checkpoint2() {
  console.log('\n' + '='.repeat(80));
  console.log('CHECKPOINT 2: Feedback Collection API Test');
  console.log('Sprint 41: Feedback Loop & Learning System');
  console.log('='.repeat(80) + '\n');

  let passedTests = 0;
  let totalTests = 0;
  let testDecisionId = null;

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

    // Test 1: POST /api/feedback/decision - Thumbs up
    console.log('Test 1: POST /api/feedback/decision (thumbs_up)');
    totalTests++;
    try {
      const response = await fetch(`${API_URL}/api/feedback/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision_id: testDecisionId,
          feedback_type: 'thumbs_up',
          comment: 'Test feedback - thumbs up'
        })
      });

      const data = await response.json();

      if (response.ok && data.ok && data.feedback && data.feedback.feedback_type === 'thumbs_up') {
        console.log('   ✅ Thumbs up feedback submitted successfully');
        console.log(`   Quality score: ${data.feedback.quality_score || 'N/A'}\n`);
        passedTests++;
      } else {
        console.log('   ❌ Failed:', data.error || 'Unknown error\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 2: POST /api/feedback/rating
    console.log('Test 2: POST /api/feedback/rating');
    totalTests++;
    try {
      const response = await fetch(`${API_URL}/api/feedback/rating`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision_id: testDecisionId,
          rating: 5,
          comment: 'Test rating - excellent'
        })
      });

      const data = await response.json();

      if (response.ok && data.ok && data.feedback && data.feedback.rating === 5) {
        console.log('   ✅ Rating feedback submitted successfully');
        console.log(`   Quality score: ${data.quality_score || 'N/A'}\n`);
        passedTests++;
      } else {
        console.log('   ❌ Failed:', data.error || 'Unknown error\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 3: POST /api/feedback/correction
    console.log('Test 3: POST /api/feedback/correction');
    totalTests++;
    try {
      const response = await fetch(`${API_URL}/api/feedback/correction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision_id: testDecisionId,
          correction_data: {
            corrected_field: 'corrected_value',
            reason: 'Test correction'
          },
          comment: 'Test correction feedback'
        })
      });

      const data = await response.json();

      if (response.ok && data.ok && data.message.includes('training data')) {
        console.log('   ✅ Correction feedback submitted and added to training data');
        console.log(`   Quality score: ${data.quality_score || 'N/A'}\n`);
        passedTests++;
      } else {
        console.log('   ❌ Failed:', data.error || 'Unknown error\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 4: POST /api/feedback/decision - Thumbs down
    console.log('Test 4: POST /api/feedback/decision (thumbs_down)');
    totalTests++;
    try {
      const response = await fetch(`${API_URL}/api/feedback/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision_id: testDecisionId,
          feedback_type: 'thumbs_down',
          comment: 'Test feedback - needs improvement'
        })
      });

      const data = await response.json();

      if (response.ok && data.ok && data.feedback.feedback_type === 'thumbs_down') {
        console.log('   ✅ Thumbs down feedback submitted successfully');
        console.log(`   Quality score: ${data.feedback.quality_score || 'N/A'}\n`);
        passedTests++;
      } else {
        console.log('   ❌ Failed:', data.error || 'Unknown error\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 5: GET /api/feedback/decision/:decision_id
    console.log('Test 5: GET /api/feedback/decision/:decision_id');
    totalTests++;
    try {
      const response = await fetch(`${API_URL}/api/feedback/decision/${testDecisionId}`);
      const data = await response.json();

      if (response.ok && data.ok && data.feedback && data.feedback.length >= 4) {
        console.log(`   ✅ Retrieved ${data.count} feedback entries for decision`);
        console.log(`   Feedback types: ${data.feedback.map(f => f.feedback_type).join(', ')}\n`);
        passedTests++;
      } else {
        console.log(`   ❌ Expected at least 4 feedback entries, got ${data.count || 0}\n`);
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 6: GET /api/feedback/quality/:decision_id
    console.log('Test 6: GET /api/feedback/quality/:decision_id');
    totalTests++;
    try {
      const response = await fetch(`${API_URL}/api/feedback/quality/${testDecisionId}`);
      const data = await response.json();

      if (response.ok && data.ok && data.quality) {
        console.log('   ✅ Quality score retrieved successfully');
        console.log(`   Quality score: ${data.quality.quality_score}`);
        console.log(`   Feedback count: ${data.quality.feedback_count}`);
        console.log(`   Positive count: ${data.quality.positive_count}`);
        console.log(`   Negative count: ${data.quality.negative_count}\n`);
        passedTests++;
      } else {
        console.log('   ❌ Failed to retrieve quality score\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 7: GET /api/feedback/stats
    console.log('Test 7: GET /api/feedback/stats');
    totalTests++;
    try {
      const response = await fetch(`${API_URL}/api/feedback/stats?days=7`);
      const data = await response.json();

      if (response.ok && data.ok && data.stats) {
        console.log('   ✅ Feedback statistics retrieved successfully');
        console.log(`   Total feedback: ${data.stats.total_feedback}`);
        console.log(`   Decisions with feedback: ${data.stats.decisions_with_feedback}`);
        console.log(`   Thumbs up: ${data.stats.thumbs_up}`);
        console.log(`   Thumbs down: ${data.stats.thumbs_down}`);
        console.log(`   Average rating: ${data.stats.avg_rating || 'N/A'}`);

        if (data.quality_distribution) {
          console.log(`   Quality distribution: ${data.quality_distribution.length} tiers`);
        }

        if (data.agent_trends) {
          console.log(`   Agent trends: ${data.agent_trends.length} agent types\n`);
        }
        passedTests++;
      } else {
        console.log('   ❌ Failed to retrieve stats\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 8: Validation - Missing required fields
    console.log('Test 8: Validation - Missing required fields');
    totalTests++;
    try {
      const response = await fetch(`${API_URL}/api/feedback/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Missing decision_id
          feedback_type: 'thumbs_up'
        })
      });

      const data = await response.json();

      if (response.status === 400 && !data.ok && data.error.includes('decision_id')) {
        console.log('   ✅ Validation correctly rejects missing decision_id\n');
        passedTests++;
      } else {
        console.log('   ❌ Validation did not catch missing decision_id\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 9: Validation - Invalid rating
    console.log('Test 9: Validation - Invalid rating value');
    totalTests++;
    try {
      const response = await fetch(`${API_URL}/api/feedback/rating`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision_id: testDecisionId,
          rating: 10 // Invalid: should be 1-5
        })
      });

      const data = await response.json();

      if (response.status === 400 && !data.ok && data.error.includes('between 1 and 5')) {
        console.log('   ✅ Validation correctly rejects invalid rating\n');
        passedTests++;
      } else {
        console.log('   ❌ Validation did not catch invalid rating\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 10: Verify data in database
    console.log('Test 10: Verify feedback stored in database');
    totalTests++;
    try {
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM agent_core.feedback
        WHERE decision_id = $1
        AND comment LIKE 'Test %'
      `, [testDecisionId]);

      const count = parseInt(result.rows[0].count);

      if (count >= 4) {
        console.log(`   ✅ Verified ${count} test feedback entries in database\n`);
        passedTests++;
      } else {
        console.log(`   ❌ Expected at least 4 entries, found ${count}\n`);
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Cleanup: Remove test data
    console.log('Cleanup: Removing test feedback data...');
    await pool.query(`
      DELETE FROM agent_core.feedback
      WHERE decision_id = $1
      AND comment LIKE 'Test %'
    `, [testDecisionId]);
    console.log('✅ Test data cleaned up\n');

    // Final Results
    console.log('='.repeat(80));
    console.log(`CHECKPOINT 2 RESULTS: ${passedTests}/${totalTests} tests passed`);
    console.log('='.repeat(80));

    if (passedTests === totalTests) {
      console.log('\n✅ ✅ ✅ CHECKPOINT 2 PASSED ✅ ✅ ✅');
      console.log('\nAll feedback collection API endpoints verified successfully!');
      console.log('Ready to proceed to Task 4: Build feedback analysis service\n');
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

checkpoint2();
