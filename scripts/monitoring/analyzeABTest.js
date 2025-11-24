#!/usr/bin/env node
/**
 * A/B Test Analysis Script - Sprint 27
 *
 * Analyzes A/B test results to compare rule versions
 *
 * Usage:
 *   node scripts/monitoring/analyzeABTest.js --tool=CompanyQualityTool --control=v2.2 --test=v2.3
 *
 * Output:
 * - Success rate comparison
 * - Confidence comparison
 * - Latency comparison
 * - Statistical significance
 * - Winner recommendation
 */

const db = require('../../utils/db');

async function analyzeABTest(toolName, controlVersion, testVersion) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`A/B Test Analysis: ${toolName}`);
  console.log(`Control: ${controlVersion} vs Test: ${testVersion}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Query performance metrics for both versions
    const query = `
      SELECT
        d.rule_version,
        COUNT(DISTINCT d.decision_id) as total_decisions,
        COUNT(DISTINCT f.feedback_id) as feedback_count,
        AVG(CASE WHEN f.outcome_positive = true THEN 1.0
                 WHEN f.outcome_positive = false THEN 0.0
                 ELSE NULL END) as success_rate,
        AVG(d.confidence_score) as avg_confidence,
        AVG(d.latency_ms) as avg_latency_ms,
        AVG(f.outcome_value) as avg_outcome_value,
        STDDEV(CASE WHEN f.outcome_positive = true THEN 1.0
                    WHEN f.outcome_positive = false THEN 0.0
                    ELSE NULL END) as success_rate_stddev
      FROM agent_core.agent_decisions d
      LEFT JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
      WHERE d.tool_name = $1
        AND d.decided_at >= NOW() - INTERVAL '7 days'
        AND d.rule_version IN ($2, $3)
      GROUP BY d.rule_version
      ORDER BY d.rule_version DESC
    `;

    const result = await db.query(query, [toolName, controlVersion, testVersion]);

    if (result.rows.length === 0) {
      console.log('❌ No data found for the specified tool and versions');
      console.log('\nTroubleshooting:');
      console.log('  1. Check that A/B testing is enabled (AB_TEST_ENABLED=true)');
      console.log('  2. Verify rule versions exist in database');
      console.log('  3. Ensure decisions have been logged in last 7 days\n');
      return;
    }

    // Extract metrics for each version
    const controlData = result.rows.find(r => r.rule_version === controlVersion);
    const testData = result.rows.find(r => r.rule_version === testVersion);

    // Display results
    console.log('📊 Performance Comparison\n');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`Metric                    ${controlVersion.padEnd(12)} ${testVersion.padEnd(12)} Delta`);
    console.log('─────────────────────────────────────────────────────────');

    // Total decisions
    const controlDecisions = controlData?.total_decisions || 0;
    const testDecisions = testData?.total_decisions || 0;
    console.log(`Total Decisions           ${String(controlDecisions).padEnd(12)} ${String(testDecisions).padEnd(12)} ${testDecisions - controlDecisions >= 0 ? '+' : ''}${testDecisions - controlDecisions}`);

    // Feedback count
    const controlFeedback = controlData?.feedback_count || 0;
    const testFeedback = testData?.feedback_count || 0;
    console.log(`Feedback Count            ${String(controlFeedback).padEnd(12)} ${String(testFeedback).padEnd(12)} ${testFeedback - controlFeedback >= 0 ? '+' : ''}${testFeedback - controlFeedback}`);

    // Success rate
    const controlSuccessRate = controlData?.success_rate !== null ? controlData.success_rate : null;
    const testSuccessRate = testData?.success_rate !== null ? testData.success_rate : null;

    if (controlSuccessRate !== null && testSuccessRate !== null) {
      const successRateDelta = ((testSuccessRate - controlSuccessRate) * 100).toFixed(1);
      console.log(`Success Rate              ${(controlSuccessRate * 100).toFixed(1)}%${' '.repeat(8)} ${(testSuccessRate * 100).toFixed(1)}%${' '.repeat(8)} ${successRateDelta >= 0 ? '+' : ''}${successRateDelta}%`);
    } else {
      console.log(`Success Rate              N/A${' '.repeat(9)} N/A${' '.repeat(9)} N/A`);
    }

    // Confidence
    const controlConfidence = controlData?.avg_confidence !== null ? controlData.avg_confidence : null;
    const testConfidence = testData?.avg_confidence !== null ? testData.avg_confidence : null;

    if (controlConfidence !== null && testConfidence !== null) {
      const confidenceDelta = (testConfidence - controlConfidence).toFixed(3);
      console.log(`Avg Confidence            ${controlConfidence.toFixed(3)}${' '.repeat(7)} ${testConfidence.toFixed(3)}${' '.repeat(7)} ${confidenceDelta >= 0 ? '+' : ''}${confidenceDelta}`);
    } else {
      console.log(`Avg Confidence            N/A${' '.repeat(9)} N/A${' '.repeat(9)} N/A`);
    }

    // Latency
    const controlLatency = controlData?.avg_latency_ms !== null ? controlData.avg_latency_ms : null;
    const testLatency = testData?.avg_latency_ms !== null ? testData.avg_latency_ms : null;

    if (controlLatency !== null && testLatency !== null) {
      const latencyDelta = (testLatency - controlLatency).toFixed(1);
      console.log(`Avg Latency (ms)          ${controlLatency.toFixed(1)}${' '.repeat(10 - String(controlLatency.toFixed(1)).length)} ${testLatency.toFixed(1)}${' '.repeat(10 - String(testLatency.toFixed(1)).length)} ${latencyDelta >= 0 ? '+' : ''}${latencyDelta}`);
    } else {
      console.log(`Avg Latency (ms)          N/A${' '.repeat(9)} N/A${' '.repeat(9)} N/A`);
    }

    // Outcome value
    const controlOutcomeValue = controlData?.avg_outcome_value !== null ? controlData.avg_outcome_value : null;
    const testOutcomeValue = testData?.avg_outcome_value !== null ? testData.avg_outcome_value : null;

    if (controlOutcomeValue !== null && testOutcomeValue !== null) {
      const outcomeValueDelta = (testOutcomeValue - controlOutcomeValue).toFixed(2);
      console.log(`Avg Outcome Value         ${controlOutcomeValue.toFixed(2)}${' '.repeat(10 - String(controlOutcomeValue.toFixed(2)).length)} ${testOutcomeValue.toFixed(2)}${' '.repeat(10 - String(testOutcomeValue.toFixed(2)).length)} ${outcomeValueDelta >= 0 ? '+' : ''}${outcomeValueDelta}`);
    } else {
      console.log(`Avg Outcome Value         N/A${' '.repeat(9)} N/A${' '.repeat(9)} N/A`);
    }

    console.log('─────────────────────────────────────────────────────────\n');

    // Statistical significance analysis
    console.log('📈 Statistical Analysis\n');

    // Sample size check
    const minSampleSize = 100;
    const controlSampleOk = controlFeedback >= minSampleSize;
    const testSampleOk = testFeedback >= minSampleSize;

    console.log(`Sample Size Status:`);
    console.log(`  ${controlVersion}: ${controlFeedback} feedback samples ${controlSampleOk ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT (need 100+)'}`);
    console.log(`  ${testVersion}: ${testFeedback} feedback samples ${testSampleOk ? '✅ SUFFICIENT' : '⚠️  INSUFFICIENT (need 100+)'}`);
    console.log();

    // Winner determination
    if (controlSampleOk && testSampleOk && controlSuccessRate !== null && testSuccessRate !== null) {
      const successRateDiff = Math.abs(testSuccessRate - controlSuccessRate);
      const minDifference = 0.05; // 5% minimum difference

      if (successRateDiff >= minDifference) {
        const winner = testSuccessRate > controlSuccessRate ? testVersion : controlVersion;
        const loser = winner === testVersion ? controlVersion : testVersion;
        const improvement = ((successRateDiff) * 100).toFixed(1);

        console.log(`🏆 Winner: ${winner}`);
        console.log(`   Success rate: ${(winner === testVersion ? testSuccessRate : controlSuccessRate) * 100}%`);
        console.log(`   Improvement over ${loser}: +${improvement}%`);
        console.log(`   Confidence: HIGH (sample size ≥100, difference ≥5%)\n`);

        console.log('✅ Recommendation: PROMOTE WINNER TO PRODUCTION\n');
        console.log('Next Steps:');
        console.log(`  1. Update rule version in production: ${loser} → ${winner}`);
        console.log(`  2. Monitor for 24 hours`);
        console.log(`  3. Archive old version: ${loser}`);
        console.log(`  4. Disable A/B testing (AB_TEST_ENABLED=false)\n`);

      } else {
        console.log(`⚖️  No Clear Winner`);
        console.log(`   Success rate difference: ${(successRateDiff * 100).toFixed(1)}% (below 5% threshold)`);
        console.log(`   Confidence: LOW\n`);

        console.log('⏳ Recommendation: CONTINUE A/B TEST\n');
        console.log('Next Steps:');
        console.log(`  1. Collect more feedback (current: ${Math.min(controlFeedback, testFeedback)} samples)`);
        console.log(`  2. Re-run analysis in 3-7 days`);
        console.log(`  3. If still no clear winner, keep control version (${controlVersion})\n`);
      }

    } else {
      console.log('⏳ Insufficient Data for Winner Determination\n');
      console.log('Recommendation: CONTINUE A/B TEST\n');
      console.log('Next Steps:');
      console.log(`  1. Collect more feedback (need 100+ samples per version)`);
      console.log(`  2. Current feedback: ${controlVersion}=${controlFeedback}, ${testVersion}=${testFeedback}`);
      console.log(`  3. Re-run analysis when sample size reaches 100+\n`);
    }

    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error analyzing A/B test:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Parse command-line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value;
  return acc;
}, {});

const toolName = args.tool || 'CompanyQualityTool';
const controlVersion = args.control || 'v2.2';
const testVersion = args.test || 'v2.3';

// Run analysis
analyzeABTest(toolName, controlVersion, testVersion);
