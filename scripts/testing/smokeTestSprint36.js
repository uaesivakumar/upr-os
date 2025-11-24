#!/usr/bin/env node
/**
 * Sprint 36 - Comprehensive Smoke Test
 * Phase 13: Lead Scoring Analytics & Optimization
 *
 * End-to-end validation of:
 * - Score Optimization Tools
 * - Lead Scoring Dashboard
 * - Score Alerts
 * - Score-Based Routing
 * - Score Explanations
 * - Full analytics workflow
 */

import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

function generateUUID() {
  return crypto.randomUUID();
}

import { ScoreOptimizationService } from '../../server/services/scoreOptimizationService.js';
import { ScoreDashboardService } from '../../server/services/scoreDashboardService.js';
import { ScoreAlertService } from '../../server/services/scoreAlertService.js';
import { ScoreRoutingService } from '../../server/services/scoreRoutingService.js';
import { ScoreExplanationService } from '../../server/services/scoreExplanationService.js';
import { LeadScoreCalculator } from '../../server/services/leadScoreCalculator.js';

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

let passed = 0;
let failed = 0;
const results = [];
const testOpportunityIds = [];

function log(message) {
  console.log(`[${new Date().toISOString().substring(11, 19)}] ${message}`);
}

function logTest(name, success, details = '') {
  const status = success ? '✅ PASS' : '❌ FAIL';
  const message = `${status}: ${name}${details ? ' - ' + details : ''}`;
  log(message);
  results.push({ name, success, details });

  if (success) {
    passed++;
  } else {
    failed++;
  }
}

async function cleanup() {
  log('🧹 Cleaning up test data...');

  for (const id of testOpportunityIds) {
    await pool.query('DELETE FROM score_alerts WHERE opportunity_id = $1', [id]);
    await pool.query('DELETE FROM lead_assignments WHERE opportunity_id = $1', [id]);
    await pool.query('DELETE FROM lead_scores WHERE opportunity_id = $1', [id]);
    await pool.query('DELETE FROM lead_score_history WHERE opportunity_id = $1', [id]);
    await pool.query('DELETE FROM opportunity_touchpoints WHERE opportunity_id = $1', [id]);
    await pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [id]);
  }

  log('✅ Cleanup complete');
}

async function smokeTest() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Sprint 36 Smoke Test: Scoring Analytics & Optimization  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize services
    const calculator = new LeadScoreCalculator(DATABASE_CONFIG);
    const optimizer = new ScoreOptimizationService(DATABASE_CONFIG);
    const dashboard = new ScoreDashboardService(DATABASE_CONFIG);
    const alertService = new ScoreAlertService(DATABASE_CONFIG);
    const routing = new ScoreRoutingService(DATABASE_CONFIG);
    const explanation = new ScoreExplanationService(DATABASE_CONFIG);

    // ================================================================
    // SCENARIO 1: Score Optimization Tools
    // ================================================================
    log('\n📋 SCENARIO 1: Score Optimization & Analysis');
    log('=' .repeat(60));

    // Test 1: Get optimization suggestions
    const suggestions = await optimizer.getOptimizationSuggestions();
    logTest('Scenario 1 - Optimization Suggestions',
      Array.isArray(suggestions) && suggestions.length > 0,
      `${suggestions.length} suggestions generated`);

    // Test 2: Grade performance analysis
    const gradePerf = await optimizer.analyzeGradePerformance();
    logTest('Scenario 1 - Grade Performance Analysis',
      typeof gradePerf === 'object',
      `Analyzed ${Object.keys(gradePerf).length} grades`);

    // Test 3: A/B test framework
    const abTest = await optimizer.runABTest(
      { threshold: 8000 },
      { threshold: 8500 },
      { sampleSize: 100, duration: 30 }
    );
    logTest('Scenario 1 - A/B Test Framework',
      abTest.testId && abTest.status === 'running',
      `Test created: ${abTest.testId}`);

    // ================================================================
    // SCENARIO 2: Dashboard & Analytics
    // ================================================================
    log('\n📋 SCENARIO 2: Dashboard & Real-Time Analytics');
    log('=' .repeat(60));

    // Create test leads for dashboard
    const dashboardLeads = [];
    for (let i = 0; i < 5; i++) {
      const oppId = generateUUID();
      dashboardLeads.push(oppId);
      testOpportunityIds.push(oppId);

      await pool.query(`
        INSERT INTO opportunity_lifecycle (opportunity_id, state, trigger_type, metadata)
        VALUES ($1, 'ENGAGED', 'manual', $2)
      `, [oppId, JSON.stringify({
        industry: 'Technology',
        size: 100 + (i * 50),
        location: 'Dubai'
      })]);

      // Add touchpoints
      for (let j = 0; j < (i + 1) * 2; j++) {
        await pool.query(`
          INSERT INTO opportunity_touchpoints (opportunity_id, touchpoint_type, outcome, occurred_at)
          VALUES ($1, 'email', 'positive', NOW() - INTERVAL '${j} days')
        `, [oppId]);
      }

      // Calculate scores
      await calculator.calculateLeadScore(oppId);
    }

    // Test 4: Score distribution
    const distribution = await dashboard.getScoreDistribution({ timeRange: 30 });
    logTest('Scenario 2 - Score Distribution',
      distribution.distribution && distribution.totalLeads >= 5,
      `${distribution.totalLeads} leads, Avg: ${distribution.avgScore}`);

    // Test 5: Score trends
    const trends = await dashboard.getScoreTrends({ days: 30 });
    logTest('Scenario 2 - Score Trends',
      trends.timeSeries && trends.timeSeries.length > 0,
      `${trends.timeSeries.length} data points`);

    // Test 6: Top movers
    const movers = await dashboard.getTopMovers({ limit: 10 });
    logTest('Scenario 2 - Top Movers',
      Array.isArray(movers),
      `${movers.length} top movers identified`);

    // Test 7: Conversion metrics
    const conversion = await dashboard.getConversionMetrics();
    logTest('Scenario 2 - Conversion Metrics',
      conversion.byGrade && conversion.scoreVsConversion,
      `Correlation: ${conversion.scoreVsConversion.correlation}`);

    // Test 8: System health
    const health = await dashboard.getSystemHealth();
    logTest('Scenario 2 - System Health',
      health.totalScored >= 5 && health.status === 'healthy',
      `Total scored: ${health.totalScored}, Status: ${health.status}`);

    // Test 9: Complete dashboard
    const fullDashboard = await dashboard.getDashboard({ timeRange: 30 });
    logTest('Scenario 2 - Complete Dashboard',
      fullDashboard.distribution && fullDashboard.trends && fullDashboard.health,
      'All dashboard components present');

    // ================================================================
    // SCENARIO 3: Score Alerts
    // ================================================================
    log('\n📋 SCENARIO 3: Score Alerts & Notifications');
    log('=' .repeat(60));

    const alertOppId = dashboardLeads[0];

    // Test 10: Score increase alert
    const increaseAlerts = await alertService.checkScoreChange(alertOppId, 5000, 6500);
    logTest('Scenario 3 - Score Increase Alert',
      increaseAlerts.length > 0,
      `Alert generated: ${increaseAlerts[0]?.message || 'none'}`);

    // Test 11: Score decrease alert
    const decreaseAlerts = await alertService.checkScoreChange(alertOppId, 7000, 5000);
    logTest('Scenario 3 - Score Decrease Alert',
      decreaseAlerts.length > 0,
      `Alert generated: ${decreaseAlerts[0]?.message || 'none'}`);

    // Test 12: Get alerts
    const allAlerts = await alertService.getAlerts({ limit: 50 });
    logTest('Scenario 3 - Alert Retrieval',
      Array.isArray(allAlerts) && allAlerts.length >= 2,
      `${allAlerts.length} alerts found`);

    // Test 13: Acknowledge alert
    if (allAlerts.length > 0) {
      const testUserId = generateUUID();
      const acknowledged = await alertService.acknowledgeAlert(allAlerts[0].id, testUserId);
      logTest('Scenario 3 - Alert Acknowledgment',
        acknowledged && acknowledged.acknowledged === true,
        'Alert acknowledged successfully');
    }

    // ================================================================
    // SCENARIO 4: Score-Based Routing
    // ================================================================
    log('\n📋 SCENARIO 4: Intelligent Lead Routing');
    log('=' .repeat(60));

    // Test 14: Route high-value lead (A+ grade)
    const highValueOppId = dashboardLeads[0];
    const highValueRouting = await routing.routeLead(highValueOppId);
    logTest('Scenario 4 - High-Value Lead Routing',
      highValueRouting.assignedTo && highValueRouting.priority,
      `Assigned to: ${highValueRouting.assignedTo}, Priority: ${highValueRouting.priority}`);

    // Test 15: Assign lead
    const seniorRepId = generateUUID();
    const assignment = await routing.assignLead(
      highValueOppId,
      seniorRepId,
      { priority: 'URGENT', reason: 'A+ grade lead' }
    );
    logTest('Scenario 4 - Lead Assignment',
      assignment && assignment.opportunity_id === highValueOppId,
      `Assigned to ${seniorRepId.substring(0, 8)}`);

    // Test 16: Get rep assignments
    const repAssignments = await routing.getAssignments(seniorRepId);
    logTest('Scenario 4 - Rep Assignment Tracking',
      repAssignments.length >= 1,
      `Rep has ${repAssignments.length} active assignments`);

    // ================================================================
    // SCENARIO 5: Score Explanations
    // ================================================================
    log('\n📋 SCENARIO 5: Score Transparency & Explanations');
    log('=' .repeat(60));

    const explainOppId = dashboardLeads[0];

    // Test 17: Generate score explanation
    const explanation1 = await explanation.explainScore(explainOppId);
    logTest('Scenario 5 - Score Explanation Generated',
      explanation1.breakdown && explanation1.formula,
      `Score: ${explanation1.leadScore}, Grade: ${explanation1.grade}`);

    // Test 18: Breakdown components
    logTest('Scenario 5 - Score Breakdown Complete',
      explanation1.breakdown.qScore &&
      explanation1.breakdown.engagementScore &&
      explanation1.breakdown.fitScore,
      'All score components explained');

    // Test 19: Recommendations provided
    logTest('Scenario 5 - Recommendations Generated',
      Array.isArray(explanation1.recommendations) && explanation1.recommendations.length > 0,
      `${explanation1.recommendations.length} recommendations`);

    // Test 20: Risks identified
    logTest('Scenario 5 - Risk Identification',
      Array.isArray(explanation1.risks),
      `${explanation1.risks.length} risks identified`);

    // ================================================================
    // SCENARIO 6: Database Schema Validation
    // ================================================================
    log('\n📋 SCENARIO 6: Database Schema & Integrity');
    log('=' .repeat(60));

    // Test 21: Alert rules seeded
    const alertRules = await pool.query('SELECT COUNT(*) as count FROM score_alert_rules WHERE enabled = true');
    logTest('Scenario 6 - Alert Rules Seeded',
      parseInt(alertRules.rows[0].count) >= 4,
      `${alertRules.rows[0].count} active rules`);

    // Test 22: Views created
    const views = await pool.query(`
      SELECT COUNT(*) as count FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name IN ('alert_summary_view', 'assignment_stats_view')
    `);
    logTest('Scenario 6 - Analytics Views Created',
      parseInt(views.rows[0].count) === 2,
      '2/2 views present');

    // Test 23: Functions created
    const functions = await pool.query(`
      SELECT COUNT(*) as count FROM pg_proc
      WHERE proname = 'check_rep_capacity'
    `);
    logTest('Scenario 6 - Routing Functions Created',
      parseInt(functions.rows[0].count) >= 1,
      'Capacity check function present');

    // ================================================================
    // CLEANUP
    // ================================================================
    await cleanup();

    // Close services
    await calculator.close();
    await optimizer.close();
    await dashboard.close();
    await alertService.close();
    await routing.close();
    await explanation.close();

    // ================================================================
    // FINAL RESULTS
    // ================================================================
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  SMOKE TEST RESULTS                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log(`Total Tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Pass Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

    if (failed === 0) {
      console.log('🎉 ALL SMOKE TESTS PASSED! Sprint 36 is production-ready.\n');
      console.log('✅ Lead Scoring Analytics validated:');
      console.log('   - Score optimization tools');
      console.log('   - Real-time dashboard & analytics');
      console.log('   - Automated score alerts');
      console.log('   - Intelligent lead routing');
      console.log('   - Score explanations & transparency');
      console.log('   - Database schema & views\n');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed:\n');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   ❌ ${r.name}`);
        if (r.details) console.log(`      ${r.details}`);
      });
      console.log('');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Smoke test failed with error:', error.message);
    console.error(error.stack);
    await cleanup();
    process.exit(1);
  } finally {
    await pool.end();
  }
}

smokeTest();
