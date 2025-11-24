#!/usr/bin/env node
/**
 * Test Scoring Adjustments - Sprint 28
 *
 * Demonstrates the scoring adjustments system:
 * 1. Creates sample feedback data
 * 2. Calculates adjustments
 * 3. Shows before/after confidence scores
 * 4. Displays adjustment history
 *
 * Usage:
 *   node scripts/monitoring/test-scoring-adjustments.js
 */

const db = require('../../utils/db');
const scoringAdjustments = require('../../server/agent-core/scoring-adjustments.js');
const { v4: uuidv4 } = require('uuid');

async function testScoringAdjustments() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Testing Scoring Adjustments System');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // ═══════════════════════════════════════════════════════
    // Step 1: Create sample feedback data (if needed)
    // ═══════════════════════════════════════════════════════

    console.log('📊 Step 1: Checking existing feedback data\n');

    const feedbackCountQuery = await db.query(`
      SELECT
        d.tool_name,
        d.rule_version,
        COUNT(*) as feedback_count,
        AVG(CASE WHEN f.outcome_positive = true THEN 1.0 ELSE 0.0 END) as success_rate
      FROM agent_core.agent_decisions d
      INNER JOIN agent_core.decision_feedback f ON d.decision_id = f.decision_id
      WHERE d.decided_at >= NOW() - INTERVAL '30 days'
      GROUP BY d.tool_name, d.rule_version
      ORDER BY feedback_count DESC
      LIMIT 5
    `);

    console.log('Existing feedback summary:');
    console.table(feedbackCountQuery.rows.map(r => ({
      tool: r.tool_name,
      version: r.rule_version,
      feedback_count: parseInt(r.feedback_count),
      success_rate: `${(parseFloat(r.success_rate) * 100).toFixed(1)}%`
    })));
    console.log();

    // ═══════════════════════════════════════════════════════
    // Step 2: Test adjustment calculation for each tool
    // ═══════════════════════════════════════════════════════

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 Step 2: Calculating adjustments for all tools\n');

    const toolsToTest = [
      { name: 'CompanyQualityTool', version: 'v2.0' },
      { name: 'ContactTierTool', version: 'v2.0' },
      { name: 'TimingScoreTool', version: 'v2.0' },
      { name: 'BankingProductMatchTool', version: 'v1.0' }
    ];

    const adjustmentResults = [];

    for (const tool of toolsToTest) {
      console.log(`\n🔍 Tool: ${tool.name} (${tool.version})`);

      const adjustment = await scoringAdjustments.getAdjustment(tool.name, tool.version);

      console.log(`Adjustment Factor: ${adjustment.factor > 0 ? '+' : ''}${(adjustment.factor * 100).toFixed(1)}%`);
      console.log(`Adjustment Confidence: ${(adjustment.confidence * 100).toFixed(1)}%`);
      console.log(`Metadata:`, JSON.stringify(adjustment.metadata, null, 2));

      adjustmentResults.push({
        tool: tool.name,
        version: tool.version,
        adjustment_factor: `${adjustment.factor > 0 ? '+' : ''}${(adjustment.factor * 100).toFixed(1)}%`,
        adjustment_confidence: `${(adjustment.confidence * 100).toFixed(1)}%`,
        sample_size: adjustment.metadata.sample_size || 0,
        success_rate: adjustment.metadata.success_rate
          ? `${(adjustment.metadata.success_rate * 100).toFixed(1)}%`
          : 'N/A'
      });
    }

    console.log('\n\n📋 Adjustment Summary:');
    console.table(adjustmentResults);

    // ═══════════════════════════════════════════════════════
    // Step 3: Demonstrate adjustment application
    // ═══════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 Step 3: Demonstrating adjustment application\n');

    const baseConfidences = [0.60, 0.70, 0.80, 0.90, 0.95];
    const testTool = toolsToTest[0];  // CompanyQualityTool
    const testAdjustment = adjustmentResults[0];

    console.log(`Using ${testTool.name} adjustment: ${testAdjustment.adjustment_factor}\n`);

    const adjustmentObj = await scoringAdjustments.getAdjustment(testTool.name, testTool.version);

    console.log('Before → After Confidence Scores:');
    console.table(baseConfidences.map(base => {
      const adjusted = scoringAdjustments.applyAdjustment(base, adjustmentObj);
      return {
        base_confidence: base.toFixed(2),
        adjusted_confidence: adjusted.toFixed(2),
        change: `${((adjusted - base) * 100).toFixed(1)}%`,
        level: adjusted >= 0.9 ? 'HIGH' : adjusted >= 0.75 ? 'MEDIUM' : 'LOW'
      };
    }));

    // ═══════════════════════════════════════════════════════
    // Step 4: View adjustment history
    // ═══════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 Step 4: Viewing adjustment history\n');

    for (const tool of toolsToTest.slice(0, 2)) {  // First 2 tools
      console.log(`\n📈 ${tool.name} (${tool.version}) - Recent History:`);

      const history = await scoringAdjustments.getAdjustmentHistory(tool.name, tool.version, 10);

      if (history.length > 0) {
        console.table(history.map(h => ({
          calculated_at: new Date(h.calculated_at).toISOString().split('T')[0],
          adjustment_factor: `${parseFloat(h.adjustment_factor) > 0 ? '+' : ''}${(parseFloat(h.adjustment_factor) * 100).toFixed(1)}%`,
          success_rate: h.success_rate ? `${(parseFloat(h.success_rate) * 100).toFixed(1)}%` : 'N/A',
          avg_confidence: h.avg_confidence ? parseFloat(h.avg_confidence).toFixed(2) : 'N/A',
          sample_size: parseInt(h.sample_size)
        })));
      } else {
        console.log('  No adjustment history found (first run)');
      }
    }

    // ═══════════════════════════════════════════════════════
    // Step 5: Cache stats
    // ═══════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 Step 5: Cache Statistics\n');

    const cacheStats = scoringAdjustments.getCacheStats();
    console.log('Cache Size:', cacheStats.size);
    console.log('Cached Tools:');
    cacheStats.entries.forEach(entry => {
      console.log(`  - ${entry}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Test Completed Successfully!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run test
testScoringAdjustments();
