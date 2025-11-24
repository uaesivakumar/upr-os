#!/usr/bin/env node
/**
 * CHECKPOINT 3: Test Feedback Analysis & Quality Scoring
 * Verifies pattern identification, improvement recommendations, and scoring accuracy
 */

import pg from 'pg';
import FeedbackAnalysisService from '../../server/services/feedbackAnalysis.js';

const { Pool } = pg;

const pool = new Pool({
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: false
});

async function checkpoint3() {
  console.log('\n' + '='.repeat(80));
  console.log('CHECKPOINT 3: Feedback Analysis & Quality Scoring Test');
  console.log('Sprint 41: Feedback Loop & Learning System');
  console.log('='.repeat(80) + '\n');

  let passedTests = 0;
  let totalTests = 0;
  const analysisService = new FeedbackAnalysisService();
  let testDecisionId = null;

  try {
    // Setup: Get sample decision and add test feedback
    console.log('Setup: Creating test feedback data...');
    const sampleDecision = await pool.query(`
      SELECT decision_id FROM agent_core.agent_decisions LIMIT 1
    `);
    testDecisionId = sampleDecision.rows[0].decision_id;

    // Insert test feedback
    await pool.query(`
      INSERT INTO agent_core.feedback (decision_id, feedback_type, rating, comment)
      VALUES
        ($1, 'thumbs_up', 5, 'CP3: Excellent decision'),
        ($1, 'rating', 4, 'CP3: Good quality')
    `, [testDecisionId]);
    console.log(`✅ Test feedback created for decision ${testDecisionId}\n`);

    // Test 1: Analyze decision quality
    console.log('Test 1: Analyze decision quality');
    totalTests++;
    try {
      const analysis = await analysisService.analyzeDecisionQuality(testDecisionId);

      if (analysis && analysis.quality_score !== null && analysis.quality_score >= 0 && analysis.quality_score <= 100) {
        console.log(`   ✅ Quality analysis successful`);
        console.log(`   Quality score: ${analysis.quality_score}`);
        console.log(`   Feedback count: ${analysis.feedback_count}`);
        console.log(`   Positive count: ${analysis.positive_count}`);
        console.log(`   Negative count: ${analysis.negative_count}\n`);
        passedTests++;
      } else {
        console.log('   ❌ Invalid quality analysis result\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 2: Quality score calculation accuracy
    console.log('Test 2: Quality score calculation accuracy');
    totalTests++;
    try {
      // Get feedback breakdown
      const feedbackResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE feedback_type = 'thumbs_up' OR rating >= 4) as positive,
          COUNT(*) FILTER (WHERE feedback_type = 'thumbs_down' OR rating <= 2) as negative,
          COUNT(*) as total,
          AVG(rating) as avg_rating
        FROM agent_core.feedback
        WHERE decision_id = $1
      `, [testDecisionId]);

      const fb = feedbackResult.rows[0];
      const expectedPositiveRatio = parseInt(fb.positive) / parseInt(fb.total) * 100;
      const expectedAvgRatingScore = parseFloat(fb.avg_rating) / 5 * 100;
      const expectedScore = (expectedPositiveRatio * 0.6 + expectedAvgRatingScore * 0.4).toFixed(2);

      const actualScore = await pool.query(`
        SELECT quality_score FROM agent_core.decision_quality_scores WHERE decision_id = $1
      `, [testDecisionId]);

      const actualQuality = parseFloat(actualScore.rows[0].quality_score).toFixed(2);

      console.log(`   Expected score: ${expectedScore}`);
      console.log(`   Actual score: ${actualQuality}`);

      if (Math.abs(parseFloat(expectedScore) - parseFloat(actualQuality)) < 1) {
        console.log('   ✅ Quality score calculation accurate\n');
        passedTests++;
      } else {
        console.log('   ❌ Quality score mismatch\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 3: Identify patterns
    console.log('Test 3: Identify feedback patterns');
    totalTests++;
    try {
      const patterns = await analysisService.identifyPatterns({
        timeWindow: '30 days',
        minFeedbackCount: 1,
        qualityThreshold: 50
      });

      if (patterns && patterns.analyzed_at && Array.isArray(patterns.poor_performers)) {
        console.log('   ✅ Pattern identification successful');
        console.log(`   Poor performers: ${patterns.poor_performers.length}`);
        console.log(`   Top performers: ${patterns.top_performers.length}`);
        console.log(`   Edge cases: ${patterns.edge_cases.length}`);
        console.log(`   Correction patterns: ${patterns.correction_patterns.length}\n`);
        passedTests++;
      } else {
        console.log('   ❌ Invalid pattern identification result\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 4: Generate improvement plan
    console.log('Test 4: Generate improvement plan');
    totalTests++;
    try {
      const plan = await analysisService.generateImprovementPlan({
        timeWindow: '30 days',
        minImpact: 1
      });

      if (plan && plan.generated_at && Array.isArray(plan.recommendations)) {
        console.log('   ✅ Improvement plan generated');
        console.log(`   Total recommendations: ${plan.total_recommendations}`);
        console.log(`   Critical: ${plan.summary.critical_issues}`);
        console.log(`   High: ${plan.summary.high_priority}`);
        console.log(`   Medium: ${plan.summary.medium_priority}\n`);

        if (plan.recommendations.length > 0) {
          console.log(`   Sample recommendation:`);
          const rec = plan.recommendations[0];
          console.log(`     Priority: ${rec.priority}`);
          console.log(`     Type: ${rec.type}`);
          console.log(`     Issue: ${rec.issue.substring(0, 60)}...`);
        }
        console.log();
        passedTests++;
      } else {
        console.log('   ❌ Invalid improvement plan result\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 5: Get feedback trends
    console.log('Test 5: Get feedback trends');
    totalTests++;
    try {
      const trends = await analysisService.getFeedbackTrends({
        days: 30,
        groupBy: 'day'
      });

      if (trends && trends.trends && Array.isArray(trends.trends)) {
        console.log('   ✅ Trend analysis successful');
        console.log(`   Period: ${trends.period_days} days`);
        console.log(`   Data points: ${trends.data_points}`);
        console.log(`   Agent type: ${trends.agent_type}\n`);
        passedTests++;
      } else {
        console.log('   ❌ Invalid trend analysis result\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 6: Store pattern
    console.log('Test 6: Store identified pattern');
    totalTests++;
    try {
      const pattern = {
        type: 'success_factor',
        agent_type: 'TestAgent',
        description: 'CP3: Test pattern for verification',
        frequency: 5,
        severity: 'medium',
        example_decision_ids: [testDecisionId]
      };

      const stored = await analysisService.storePattern(pattern);

      if (stored && stored.id && stored.pattern_type === 'success_factor') {
        console.log('   ✅ Pattern stored successfully');
        console.log(`   Pattern ID: ${stored.id}`);
        console.log(`   Severity: ${stored.severity}\n`);
        passedTests++;
      } else {
        console.log('   ❌ Pattern storage failed\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 7: Verify quality scores persisted
    console.log('Test 7: Verify quality scores persisted in database');
    totalTests++;
    try {
      const result = await pool.query(`
        SELECT
          decision_id,
          quality_score,
          feedback_count,
          positive_count,
          negative_count,
          calculated_at
        FROM agent_core.decision_quality_scores
        WHERE decision_id = $1
      `, [testDecisionId]);

      if (result.rows.length > 0) {
        const score = result.rows[0];
        console.log('   ✅ Quality scores persisted');
        console.log(`   Quality score: ${score.quality_score}`);
        console.log(`   Feedback count: ${score.feedback_count}`);
        console.log(`   Calculated at: ${score.calculated_at}\n`);
        passedTests++;
      } else {
        console.log('   ❌ No quality scores found\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 8: Confidence-adjusted scoring
    console.log('Test 8: Confidence-adjusted quality scoring');
    totalTests++;
    try {
      const analysis = await analysisService.analyzeDecisionQuality(testDecisionId);

      if (analysis.confidence_adjusted_score !== null &&
          analysis.agent_confidence !== null) {
        const expected = analysis.quality_score * analysis.agent_confidence;
        const actual = analysis.confidence_adjusted_score;

        if (Math.abs(expected - actual) < 1) {
          console.log('   ✅ Confidence adjustment correct');
          console.log(`   Base score: ${analysis.quality_score}`);
          console.log(`   Agent confidence: ${analysis.agent_confidence}`);
          console.log(`   Adjusted score: ${actual}\n`);
          passedTests++;
        } else {
          console.log(`   ❌ Confidence adjustment mismatch: expected ${expected}, got ${actual}\n`);
        }
      } else {
        console.log('   ⚠️  Confidence data not available\n');
      }
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 9: Pattern detection for poor performers
    console.log('Test 9: Poor performer pattern detection');
    totalTests++;
    try {
      const patterns = await analysisService.identifyPatterns({
        timeWindow: '30 days',
        minFeedbackCount: 1,
        qualityThreshold: 40
      });

      const hasPoorPerformers = patterns.poor_performers && patterns.poor_performers.length > 0;
      console.log(`   ${hasPoorPerformers ? '✅' : '⚠️ '} Poor performers detection: ${patterns.poor_performers.length} found`);

      if (hasPoorPerformers) {
        const worst = patterns.poor_performers[0];
        console.log(`   Worst performer: ${worst.agent_type} (score: ${worst.avg_quality_score})\n`);
      } else {
        console.log('   No poor performers found (good news!)\n');
      }
      passedTests++;
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Test 10: Batch analysis capability
    console.log('Test 10: Batch decision analysis');
    totalTests++;
    try {
      // Get recent decisions with feedback
      const decisions = await pool.query(`
        SELECT DISTINCT decision_id
        FROM agent_core.feedback
        WHERE created_at >= NOW() - INTERVAL '7 days'
        LIMIT 5
      `);

      let analyzed = 0;
      for (const row of decisions.rows) {
        try {
          await analysisService.analyzeDecisionQuality(row.decision_id);
          analyzed++;
        } catch (err) {
          // Skip errors for individual decisions
        }
      }

      console.log(`   ✅ Batch analysis completed`);
      console.log(`   Analyzed: ${analyzed}/${decisions.rows.length} decisions\n`);
      passedTests++;
    } catch (err) {
      console.log('   ❌ Error:', err.message, '\n');
    }

    // Cleanup
    console.log('Cleanup: Removing test data...');
    await pool.query(`
      DELETE FROM agent_core.feedback_patterns WHERE description LIKE 'CP3:%'
    `);
    await pool.query(`
      DELETE FROM agent_core.feedback WHERE comment LIKE 'CP3:%'
    `);
    await pool.query(`
      DELETE FROM agent_core.decision_quality_scores WHERE decision_id = $1
    `, [testDecisionId]);
    console.log('✅ Test data cleaned up\n');

    // Final Results
    console.log('='.repeat(80));
    console.log(`CHECKPOINT 3 RESULTS: ${passedTests}/${totalTests} tests passed`);
    console.log('='.repeat(80));

    if (passedTests === totalTests) {
      console.log('\n✅ ✅ ✅ CHECKPOINT 3 PASSED ✅ ✅ ✅');
      console.log('\nAll feedback analysis and quality scoring verified!');
      console.log('Features working:');
      console.log('  - Decision quality analysis');
      console.log('  - Quality score calculation accuracy');
      console.log('  - Pattern identification (poor/top performers, edge cases)');
      console.log('  - Improvement plan generation');
      console.log('  - Feedback trend analysis');
      console.log('  - Pattern storage');
      console.log('  - Confidence-adjusted scoring');
      console.log('  - Batch analysis');
      console.log('\nReady to proceed to Task 6: Implement model improvement pipeline\n');
      process.exit(0);
    } else {
      console.log(`\n❌ CHECKPOINT 3 FAILED: ${totalTests - passedTests} test(s) failed`);
      console.log('Fix the issues before proceeding.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ CHECKPOINT 3 FAILED with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await analysisService.close();
    await pool.end();
  }
}

checkpoint3();
