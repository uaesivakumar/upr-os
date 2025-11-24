#!/usr/bin/env node
/**
 * Sprint 36 - Checkpoint 1: Optimization & Dashboard
 * Tests Tasks 1-2: Score optimization tools and dashboard services
 */

import pg from 'pg';
const { Pool } = pg;

import { ScoreOptimizationService } from '../../server/services/scoreOptimizationService.js';
import { ScoreDashboardService } from '../../server/services/scoreDashboardService.js';

const pool = new Pool({
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: false
});

const DATABASE_CONFIG = {
  host: '34.121.0.240',
  port: 5432,
  database: 'upr_production',
  user: 'upr_app',
  password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
  ssl: false
};

let testResults = [];

function logTest(name, passed, details = '') {
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${name}`);
  if (details) console.log(`   ${details}`);
  testResults.push({ name, passed, details });
}

async function testScoreOptimization() {
  console.log('\n📊 Test Group 1: Score Optimization Service\n');

  const optimizer = new ScoreOptimizationService(DATABASE_CONFIG);

  // Test 1: Get optimization suggestions
  const suggestions = await optimizer.getOptimizationSuggestions();
  logTest('Optimization suggestions generated',
    Array.isArray(suggestions),
    `Found ${suggestions.length} suggestions`);

  // Test 2: Analyze grade performance
  const gradePerf = await optimizer.analyzeGradePerformance();
  logTest('Grade performance analysis works',
    Object.keys(gradePerf).length > 0,
    `Analyzed ${Object.keys(gradePerf).length} grades`);

  // Test 3: Run A/B test
  const abTest = await optimizer.runABTest(
    { threshold: 8000 },
    { threshold: 8500 },
    { sampleSize: 100 }
  );
  logTest('A/B test framework functional',
    abTest.testId && abTest.status === 'running',
    `Test ID: ${abTest.testId}`);

  await optimizer.close();
}

async function testDashboard() {
  console.log('\n📊 Test Group 2: Score Dashboard Service\n');

  const dashboard = new ScoreDashboardService(DATABASE_CONFIG);

  // Test 4: Get score distribution
  const distribution = await dashboard.getScoreDistribution({ timeRange: 30 });
  logTest('Score distribution retrieved',
    distribution.distribution && distribution.distribution.length > 0,
    `Total leads: ${distribution.totalLeads}, Avg: ${distribution.avgScore}`);

  // Test 5: Get score trends
  const trends = await dashboard.getScoreTrends({ days: 30 });
  logTest('Score trends retrieved',
    trends.timeSeries && trends.timeSeries.length > 0,
    `${trends.timeSeries.length} data points over ${trends.period}`);

  // Test 6: Get top movers
  const movers = await dashboard.getTopMovers({ limit: 10 });
  logTest('Top movers identified',
    Array.isArray(movers),
    `Found ${movers.length} top movers`);

  // Test 7: Get conversion metrics
  const conversion = await dashboard.getConversionMetrics();
  logTest('Conversion metrics available',
    conversion.byGrade && conversion.byGrade.length > 0,
    `Overall rate: ${(conversion.overallConversionRate * 100).toFixed(1)}%`);

  // Test 8: Get system health
  const health = await dashboard.getSystemHealth();
  logTest('System health metrics retrieved',
    health.totalScored > 0 && health.status === 'healthy',
    `Total scored: ${health.totalScored}, Status: ${health.status}`);

  // Test 9: Get lead insights
  const insights = await dashboard.getLeadInsights();
  logTest('Lead insights generated',
    typeof insights.hotLeads === 'number',
    `Hot leads: ${insights.hotLeads}, Recommendations: ${insights.recommendations.length}`);

  // Test 10: Get complete dashboard
  const fullDashboard = await dashboard.getDashboard({ timeRange: 30 });
  logTest('Complete dashboard data retrieved',
    fullDashboard.distribution && fullDashboard.trends && fullDashboard.health,
    'All dashboard components present');

  await dashboard.close();
}

async function testDatabaseSchema() {
  console.log('\n📊 Test Group 3: Database Schema\n');

  // Test 11: Alert rules table
  const alertRules = await pool.query('SELECT COUNT(*) as count FROM score_alert_rules');
  logTest('Alert rules table exists and populated',
    parseInt(alertRules.rows[0].count) >= 4,
    `${alertRules.rows[0].count} default rules`);

  // Test 12: Tables created
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('score_alert_rules', 'score_alerts', 'lead_assignments',
                         'ml_predictions', 'conversion_outcomes')
  `);
  logTest('All new tables created',
    tables.rows.length === 5,
    `Created ${tables.rows.length}/5 tables`);

  // Test 13: Views created
  const views = await pool.query(`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name IN ('alert_summary_view', 'assignment_stats_view')
  `);
  logTest('Dashboard views created',
    views.rows.length === 2,
    `Created ${views.rows.length}/2 views`);
}

async function runCheckpoint1() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║    Sprint 36 - Checkpoint 1: Optimization & Dashboard       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    await testScoreOptimization();
    await testDashboard();
    await testDatabaseSchema();

    console.log('\n' + '═'.repeat(60));
    console.log('CHECKPOINT 1 RESULTS');
    console.log('═'.repeat(60));

    const passed = testResults.filter(t => t.passed).length;
    const total = testResults.length;
    const passRate = ((passed / total) * 100).toFixed(1);

    console.log(`\nTotal Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Pass Rate: ${passRate}%\n`);

    if (passed === total) {
      console.log('🎉 ALL TESTS PASSED! Optimization & Dashboard validated.\n');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed. Review output above.\n');
      testResults.filter(t => !t.passed).forEach(t => {
        console.log(`   ❌ ${t.name}`);
        if (t.details) console.log(`      ${t.details}`);
      });
      console.log('');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Checkpoint 1 failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runCheckpoint1();
