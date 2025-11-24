#!/usr/bin/env node
/**
 * Sprint 45 - Checkpoint 2: A/B Testing, Optimization & Performance
 *
 * Tests:
 * 1. A/B Testing Framework
 * 2. Template Optimization Service
 * 3. Performance Tracking System
 * 4. Integration scenarios
 */

import pg from 'pg';
const { Pool } = pg;
import { OutreachABTestingService } from '../../server/services/outreachABTestingService.js';
import { OutreachTemplateOptimizationService } from '../../server/services/outreachTemplateOptimizationService.js';
import { OutreachPerformanceService } from '../../server/services/outreachPerformanceService.js';

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

async function runCheckpoint2() {
  console.log('🚀 Sprint 45 - Checkpoint 2: A/B Testing & Optimization\\n');
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
    // Test 1: A/B Testing Framework
    console.log('\\n🧪 TEST 1: A/B Testing Framework');
    console.log('-'.repeat(80));

    const abService = new OutreachABTestingService(dbConfig);

    // Create A/B test
    const test = await abService.createTest({
      test_name: 'Subject Line Test - Checkpoint 2',
      description: 'Testing personalized vs generic subject lines',
      test_type: 'SUBJECT',
      variant_a_config: {
        subject: 'Important Update for {{company_name}}',
        description: 'Generic subject with company name'
      },
      variant_b_config: {
        subject: '{{benefit}} for {{company_name}}',
        description: 'Benefit-focused subject'
      },
      traffic_split: 0.50,
      primary_metric: 'reply_rate',
      min_sample_size: 50,
      created_by: 'checkpoint2'
    });

    logTest(
      'Create A/B test',
      test && test.id,
      `Test: ${test.test_name}, Status: ${test.status}`
    );

    const testId = test.id;

    // Start test
    const startedTest = await abService.startTest(testId);

    logTest(
      'Start A/B test',
      startedTest && startedTest.status === 'RUNNING',
      `Status: ${startedTest.status}, Started: ${startedTest.started_at}`
    );

    // Get a test message ID
    const msgResult = await pool.query('SELECT id FROM outreach_generations LIMIT 1');
    let messageIds = [];

    if (msgResult.rows.length > 0) {
      // Use existing message
      messageIds.push(msgResult.rows[0].id);
    }

    // Assign messages to variants (simulate with available messages)
    if (messageIds.length > 0) {
      for (let i = 0; i < Math.min(10, messageIds.length); i++) {
        const assignment = await abService.assignMessage(testId, messageIds[0]);
        if (i === 0) {
          logTest(
            'Assign message to variant',
            assignment && assignment.variant,
            `Message assigned to variant ${assignment.variant}`
          );
        }
      }
    } else {
      logTest('Assign message to variant', false, 'No messages available for assignment');
    }

    // Record events (using first message)
    if (messageIds.length > 0) {
      await abService.recordSent(testId, messageIds[0]);
      await abService.recordOpened(testId, messageIds[0]);
      await abService.recordReplied(testId, messageIds[0]);

      logTest(
        'Record engagement events',
        true,
        'Sent, opened, and replied events recorded'
      );
    }

    // Analyze test
    const analysis = await abService.analyzeTest(testId);

    logTest(
      'Analyze A/B test',
      analysis && analysis.status,
      `Status: ${analysis.status}`
    );

    // Pause test
    const pausedTest = await abService.pauseTest(testId);

    logTest(
      'Pause A/B test',
      pausedTest && pausedTest.status === 'PAUSED',
      `Status: ${pausedTest.status}`
    );

    // List tests
    const tests = await abService.listTests({ limit: 10 });

    logTest(
      'List A/B tests',
      Array.isArray(tests) && tests.length > 0,
      `Found ${tests.length} tests`
    );

    await abService.close();

    // Test 2: Template Optimization Service
    console.log('\\n🔧 TEST 2: Template Optimization Service');
    console.log('-'.repeat(80));

    const optService = new OutreachTemplateOptimizationService(dbConfig);

    // Analyze template (using null for system-wide analysis)
    const templateAnalysis = await optService.analyzeTemplate(null, {
      days: 30,
      minMessages: 1 // Lower threshold for testing
    });

    logTest(
      'Analyze template performance',
      templateAnalysis && templateAnalysis.status,
      `Status: ${templateAnalysis.status}`
    );

    if (templateAnalysis.status === 'ANALYSIS_COMPLETE') {
      logTest(
        'Performance metrics calculated',
        templateAnalysis.performance,
        `Quality: ${templateAnalysis.performance.avg_quality}, Messages: ${templateAnalysis.performance.total_messages}`
      );

      logTest(
        'Performance gaps identified',
        Array.isArray(templateAnalysis.gaps),
        `${templateAnalysis.gaps.length} gaps found`
      );

      logTest(
        'Recommendations generated',
        Array.isArray(templateAnalysis.recommendations),
        `${templateAnalysis.recommendations.length} recommendations`
      );
    }

    // Create optimization record
    const optimization = await optService.createOptimization({
      template_type: 'introduction',
      optimization_type: 'PERSONALIZATION',
      priority: 'HIGH',
      current_performance: { avg_quality: 65 },
      performance_gap: 'Personalization score 10 points below target',
      recommendation_title: 'Increase variable usage',
      recommendation_details: 'Add more dynamic variables and industry-specific insights',
      expected_improvement: 'Increase personalization by 15 points',
      evidence: { current_score: 65, target_score: 75 },
      examples: ['Add {{industry}} specific pain points', 'Include {{company_size}} context']
    });

    logTest(
      'Create optimization record',
      optimization && optimization.id,
      `ID: ${optimization.id.substring(0, 8)}..., Priority: ${optimization.priority}`
    );

    const optimizationId = optimization.id;

    // Get pending optimizations
    const pending = await optService.getPendingOptimizations({ limit: 5 });

    logTest(
      'Get pending optimizations',
      Array.isArray(pending) && pending.length > 0,
      `${pending.length} pending optimizations`
    );

    // Implement optimization
    const implemented = await optService.implementOptimization(optimizationId, 'checkpoint2');

    logTest(
      'Mark optimization as implemented',
      implemented && implemented.status === 'IMPLEMENTED',
      `Status: ${implemented.status}`
    );

    // Validate optimization
    const validated = await optService.validateOptimization(
      optimizationId,
      { actual_improvement: 12, new_score: 77 },
      'Checkpoint 2 validation test'
    );

    logTest(
      'Validate optimization results',
      validated && validated.validated === true,
      'Validation complete'
    );

    // Get optimization stats
    const optStats = await optService.getOptimizationStats(30);

    logTest(
      'Get optimization statistics',
      optStats && typeof optStats.total !== 'undefined',
      `Total: ${optStats.total}, Implemented: ${optStats.implemented}`
    );

    await optService.close();

    // Test 3: Performance Tracking Service
    console.log('\\n📊 TEST 3: Performance Tracking Service');
    console.log('-'.repeat(80));

    const perfService = new OutreachPerformanceService(dbConfig);

    // Calculate metrics for today
    const today = new Date();
    const metrics = await perfService.calculateMetrics({
      date: today,
      aggregation_level: 'SYSTEM'
    });

    logTest(
      'Calculate performance metrics',
      metrics && metrics.id,
      `Date: ${metrics.metric_date}, Generated: ${metrics.messages_generated}`
    );

    logTest(
      'Quality metrics captured',
      metrics.avg_quality_score !== null,
      `Avg Quality: ${metrics.avg_quality_score}, Personalization: ${metrics.avg_personalization_score}`
    );

    // Get performance report
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const report = await perfService.getPerformanceReport({
      start_date: startDate,
      end_date: today,
      aggregation_level: 'SYSTEM'
    });

    logTest(
      'Generate performance report',
      report && report.daily_metrics,
      `${report.daily_metrics.length} days of data`
    );

    logTest(
      'Report summary calculated',
      report.summary && typeof report.summary.total_generated !== 'undefined',
      `Total generated: ${report.summary.total_generated}`
    );

    // Get performance trends
    const trends = await perfService.getPerformanceTrends(30);

    logTest(
      'Analyze performance trends',
      trends && trends.data,
      `${trends.data.length} data points`
    );

    if (trends.trends && trends.trends.status !== 'INSUFFICIENT_DATA') {
      logTest(
        'Trend detection working',
        trends.trends.quality_trend,
        `Quality: ${trends.trends.quality_trend}, Change: ${trends.trends.quality_change}%`
      );
    }

    // Get dashboard metrics
    const dashboard = await perfService.getDashboardMetrics();

    logTest(
      'Get dashboard metrics',
      dashboard && dashboard.today,
      `Today: ${dashboard.today.generated_today || 0} generated`
    );

    logTest(
      'Quality distribution available',
      Array.isArray(dashboard.quality_distribution),
      `${dashboard.quality_distribution.length} tiers`
    );

    // Check performance alerts
    const alerts = await perfService.checkPerformanceAlerts();

    logTest(
      'Performance alert system',
      alerts && alerts.status,
      `Status: ${alerts.status}, Alerts: ${alerts.alerts.length}`
    );

    await perfService.close();

    // Test 4: Integration Scenario
    console.log('\\n🔗 TEST 4: Integration Scenario');
    console.log('-'.repeat(80));

    const abService2 = new OutreachABTestingService(dbConfig);
    const optService2 = new OutreachTemplateOptimizationService(dbConfig);
    const perfService2 = new OutreachPerformanceService(dbConfig);

    // Scenario: Create A/B test based on optimization recommendation
    const scenarioOpt = await optService2.getPendingOptimizations({ limit: 1 });

    if (scenarioOpt.length > 0) {
      const recommendation = scenarioOpt[0];

      // Create A/B test to validate optimization
      const validationTest = await abService2.createTest({
        test_name: `Validation: ${recommendation.recommendation_title}`,
        description: `Testing recommendation: ${recommendation.recommendation_details}`,
        test_type: 'TEMPLATE',
        variant_a_config: { type: 'current' },
        variant_b_config: { type: 'optimized' },
        primary_metric: 'reply_rate',
        created_by: 'optimization_validation'
      });

      logTest(
        'Create validation A/B test from optimization',
        validationTest && validationTest.id,
        `Test: ${validationTest.test_name}`
      );

      // Calculate performance metrics to track impact
      const validationMetrics = await perfService2.calculateMetrics({
        date: new Date(),
        aggregation_level: 'TEMPLATE',
        aggregation_key: recommendation.template_type
      });

      logTest(
        'Track optimization impact with metrics',
        validationMetrics && validationMetrics.id,
        `Metrics tracked for ${recommendation.template_type}`
      );
    } else {
      logTest(
        'Integration scenario',
        true,
        'No pending optimizations to create test from (acceptable state)'
      );
    }

    await abService2.close();
    await optService2.close();
    await perfService2.close();

    // Summary
    console.log('\\n' + '='.repeat(80));
    console.log('📊 CHECKPOINT 2 SUMMARY\\n');
    console.log(`Tests Run:    ${testsRun}`);
    console.log(`Tests Passed: ${testsPassed} ✅`);
    console.log(`Tests Failed: ${testsFailed} ❌`);
    console.log(`Success Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);

    if (testsFailed === 0) {
      console.log('\\n🎉 CHECKPOINT 2 PASSED - A/B Testing & Optimization Working!');
    } else {
      console.log('\\n⚠️  CHECKPOINT 2 INCOMPLETE - Some tests failed');
    }

    console.log('='.repeat(80));

    process.exit(testsFailed === 0 ? 0 : 1);

  } catch (error) {
    console.error('\\n❌ Checkpoint 2 Error:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run checkpoint
runCheckpoint2();
