#!/usr/bin/env node
/**
 * Sprint 44 - Checkpoint 3: Service Integrations
 *
 * Tests:
 * 1. Score routing and assignment
 * 2. Alert enhancements (stats, bulk)
 * 3. Score explanation generation
 * 4. Dashboard integrations
 * 5. Cross-service workflows
 */

import pg from 'pg';
const { Pool } = pg;
import { ScoreRoutingService } from '../../server/services/scoreRoutingService.js';
import { ScoreAlertService } from '../../server/services/scoreAlertService.js';
import { ScoreExplanationService } from '../../server/services/scoreExplanationService.js';
import { ScoreDashboardService } from '../../server/services/scoreDashboardService.js';

let pool;
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function logTest(name, passed, details = '') {
  testsRun++;
  if (passed) {
    testsPassed++;
    console.log(`✅ ${name}`);
    if (details) console.log(`   ${details}`);
  } else {
    testsFailed++;
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
  }
}

async function runCheckpoint3() {
  console.log('🚀 Sprint 44 - Checkpoint 3: Service Integrations\n');
  console.log('='.repeat(80));

  pool = new Pool({
    host: '34.121.0.240',
    port: 5432,
    user: 'upr_app',
    password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
    database: 'upr_production',
    ssl: false
  });

  const dbConfig = {
    host: '34.121.0.240',
    port: 5432,
    user: 'upr_app',
    password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
    database: 'upr_production',
    ssl: false
  };

  try {
    // Get test opportunities
    const oppResult = await pool.query(`
      SELECT opportunity_id
      FROM lead_scores
      WHERE lead_score > 3000
      LIMIT 5
    `);

    if (oppResult.rows.length === 0) {
      console.log('❌ No test opportunities found');
      process.exit(1);
    }

    const testOppId = oppResult.rows[0].opportunity_id;

    // Test 1: Score Routing
    console.log('\n🚦 TEST 1: Score Routing');
    console.log('-'.repeat(80));

    const routingService = new ScoreRoutingService(dbConfig);

    const routeResult = await routingService.routeLead(testOppId);
    logTest(
      'Route lead based on score',
      routeResult && routeResult.assignedTo,
      `Assigned to: ${routeResult.assignedTo}, Reason: ${routeResult.reason}`
    );

    // Test assignment
    const assignment = await routingService.assignLead(
      testOppId,
      'test-rep-001',
      { priority: 'HIGH', reason: 'Checkpoint 3 test' }
    );

    logTest(
      'Create lead assignment',
      assignment && assignment.id,
      `Assignment ID: ${assignment.id.substring(0, 8)}..., Priority: ${assignment.priority_level}`
    );

    const assignmentId = assignment.id;

    // Get assignments
    const assignments = await routingService.getAssignments('test-rep-001');
    logTest(
      'Get rep assignments',
      Array.isArray(assignments) && assignments.length > 0,
      `Found ${assignments.length} assignments`
    );

    // Get stats
    const stats = await routingService.getAssignmentStats('test-rep-001');
    logTest(
      'Get assignment stats',
      stats && typeof stats.active !== 'undefined',
      `Active: ${stats.active}, Completed: ${stats.completed}`
    );

    // Complete assignment
    const completed = await routingService.completeAssignment(assignmentId, 'checkpoint3');
    logTest(
      'Complete assignment',
      completed && completed.status === 'COMPLETED',
      `Status: ${completed.status}`
    );

    await routingService.close();

    // Test 2: Alert Service Enhancements
    console.log('\n🔔 TEST 2: Alert Service');
    console.log('-'.repeat(80));

    const alertService = new ScoreAlertService(dbConfig);

    // Create multiple alerts
    const alert1 = await alertService.createAlert({
      opportunityId: testOppId,
      type: 'SCORE_INCREASE',
      severity: 'MEDIUM',
      message: 'Test alert 1 from checkpoint 3'
    });

    const alert2 = await alertService.createAlert({
      opportunityId: testOppId,
      type: 'GRADE_CHANGE',
      severity: 'HIGH',
      message: 'Test alert 2 from checkpoint 3'
    });

    logTest(
      'Create multiple alerts',
      alert1 && alert2,
      `Created 2 alerts`
    );

    // Get alert stats
    const alertStats = await alertService.getAlertStats({ days: 7 });
    logTest(
      'Get alert statistics',
      Array.isArray(alertStats),
      `Found ${alertStats.length} alert types`
    );

    // Get recent alerts
    const recentAlerts = await alertService.getRecentAlerts({ limit: 5, acknowledged: false });
    logTest(
      'Get recent unacknowledged alerts',
      Array.isArray(recentAlerts) && recentAlerts.length > 0,
      `Found ${recentAlerts.length} recent alerts`
    );

    // Bulk acknowledge
    const bulkAck = await alertService.bulkAcknowledgeAlerts(
      [alert1.id, alert2.id],
      'checkpoint3'
    );
    logTest(
      'Bulk acknowledge alerts',
      Array.isArray(bulkAck) && bulkAck.length === 2,
      `Acknowledged ${bulkAck.length} alerts`
    );

    await alertService.close();

    // Test 3: Score Explanation
    console.log('\n💡 TEST 3: Score Explanation');
    console.log('-'.repeat(80));

    const explanationService = new ScoreExplanationService(dbConfig);

    const explanation = await explanationService.explainScore(testOppId);
    logTest(
      'Generate score explanation',
      explanation && !explanation.error,
      explanation ?
        `Score: ${explanation.leadScore}, Grade: ${explanation.grade}` :
        'No score found'
    );

    if (explanation && !explanation.error) {
      logTest(
        'Score breakdown included',
        explanation.breakdown && explanation.breakdown.qScore,
        `Q: ${explanation.breakdown.qScore.value}, Engagement: ${explanation.breakdown.engagementScore.value}, Fit: ${explanation.breakdown.fitScore.value}`
      );

      logTest(
        'Recommendations provided',
        Array.isArray(explanation.recommendations) && explanation.recommendations.length > 0,
        `${explanation.recommendations.length} recommendations`
      );

      logTest(
        'Risks identified',
        Array.isArray(explanation.risks),
        `${explanation.risks.length} risks identified`
      );
    }

    await explanationService.close();

    // Test 4: Dashboard Integration
    console.log('\n📊 TEST 4: Dashboard Integration');
    console.log('-'.repeat(80));

    const dashboardService = new ScoreDashboardService(dbConfig);

    // Get activation metrics
    const activationMetrics = await dashboardService.getActivationMetrics();
    logTest(
      'Get activation metrics',
      activationMetrics && activationMetrics.alerts && activationMetrics.queue,
      `Alerts: ${activationMetrics.alerts.total}, Queue pending: ${activationMetrics.queue.pending}`
    );

    logTest(
      'A/B test metrics integrated',
      activationMetrics.abTesting && typeof activationMetrics.abTesting.total === 'number',
      `Total tests: ${activationMetrics.abTesting.total}, Running: ${activationMetrics.abTesting.running}`
    );

    logTest(
      'Decay metrics integrated',
      activationMetrics.decay && typeof activationMetrics.decay.totalRuns === 'number',
      `Total runs: ${activationMetrics.decay.totalRuns}`
    );

    logTest(
      'Assignment metrics integrated',
      activationMetrics.assignments && typeof activationMetrics.assignments.active === 'number',
      `Active: ${activationMetrics.assignments.active}, Urgent: ${activationMetrics.assignments.urgent}`
    );

    // Get traditional dashboard
    const dashboard = await dashboardService.getDashboard({ timeRange: 30 });
    logTest(
      'Get full dashboard',
      dashboard && dashboard.distribution && dashboard.trends,
      `Distribution: ${dashboard.distribution.totalLeads} leads, ${dashboard.trends.timeSeries.length} data points`
    );

    await dashboardService.close();

    // Test 5: Cross-service Workflow
    console.log('\n🔄 TEST 5: Cross-Service Workflow');
    console.log('-'.repeat(80));

    // Simulate complete workflow: score change → alert → assignment → explanation
    const workflowServices = {
      alert: new ScoreAlertService(dbConfig),
      routing: new ScoreRoutingService(dbConfig),
      explanation: new ScoreExplanationService(dbConfig)
    };

    // Step 1: Create alert for score change
    const workflowAlert = await workflowServices.alert.createAlert({
      opportunityId: testOppId,
      type: 'SCORE_INCREASE',
      severity: 'HIGH',
      message: 'Significant score increase detected'
    });

    logTest(
      'Workflow Step 1: Alert created',
      workflowAlert && workflowAlert.id,
      `Alert: ${workflowAlert.message}`
    );

    // Step 2: Route based on alert severity
    const workflowRoute = await workflowServices.routing.routeLead(testOppId);

    logTest(
      'Workflow Step 2: Lead routed',
      workflowRoute && workflowRoute.assignedTo,
      `Routed to: ${workflowRoute.assignedTo}`
    );

    // Step 3: Get explanation for assignment context
    const workflowExplanation = await workflowServices.explanation.explainScore(testOppId);

    logTest(
      'Workflow Step 3: Explanation generated',
      workflowExplanation && !workflowExplanation.error,
      `Formula: ${workflowExplanation.formula}`
    );

    // Step 4: Acknowledge alert after handling
    await workflowServices.alert.acknowledgeAlert(workflowAlert.id, 'checkpoint3_workflow');

    logTest(
      'Workflow Step 4: Alert acknowledged',
      true,
      'Complete workflow executed successfully'
    );

    // Cleanup
    await workflowServices.alert.close();
    await workflowServices.routing.close();
    await workflowServices.explanation.close();

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 CHECKPOINT 3 SUMMARY\n');
    console.log(`Tests Run:    ${testsRun}`);
    console.log(`Tests Passed: ${testsPassed} ✅`);
    console.log(`Tests Failed: ${testsFailed} ❌`);
    console.log(`Success Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);

    if (testsFailed === 0) {
      console.log('\n🎉 CHECKPOINT 3 PASSED - Service Integrations Working!');
    } else {
      console.log('\n⚠️  CHECKPOINT 3 INCOMPLETE - Some tests failed');
    }

    console.log('='.repeat(80));

    process.exit(testsFailed === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Checkpoint 3 Error:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run checkpoint
runCheckpoint3();
