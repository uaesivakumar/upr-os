#!/usr/bin/env node
/**
 * Sprint 34 Checkpoint 2: Re-Engagement, Analytics & Automated Actions
 */

// Set DATABASE_URL
process.env.DATABASE_URL = "postgresql://upr_app:SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=@34.121.0.240:5432/upr_production?sslmode=disable";

import pg from 'pg';
const { Pool } = pg;
import { LifecycleReEngagement } from '../../server/services/lifecycleReEngagement.js';
import { LifecycleAnalytics } from '../../server/services/lifecycleAnalytics.js';
import { LifecycleAutomatedActions } from '../../server/services/lifecycleAutomatedActions.js';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    testsPassed++;
    console.log(`✅ ${message}`);
  } else {
    testsFailed++;
    console.error(`❌ ${message}`);
  }
}

async function checkpoint2() {
  console.log('\n' + '='.repeat(70));
  console.log('SPRINT 34 CHECKPOINT 2: RE-ENGAGEMENT, ANALYTICS & ACTIONS');
  console.log('='.repeat(70));
  console.log('');

  const dbConfig = {
    host: '34.121.0.240',
    port: 5432,
    user: 'upr_app',
    password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
    database: 'upr_production',
    ssl: false
  };

  const pool = new Pool(dbConfig);
  const reEngagement = new LifecycleReEngagement(dbConfig);
  const analytics = new LifecycleAnalytics(dbConfig);
  const automatedActions = new LifecycleAutomatedActions(null, dbConfig);

  try {
    // Section 1: Re-Engagement
    console.log('📋 Section 1: Re-Engagement Service\n');

    // Create test dormant opportunity
    const testOppId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a50';
    await pool.query('DELETE FROM re_engagement_attempts WHERE opportunity_id = $1', [testOppId]);
    await pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);

    await pool.query(`
      INSERT INTO opportunity_lifecycle (opportunity_id, state, entered_at, exited_at, trigger_type, trigger_reason)
      VALUES ($1, 'DORMANT', NOW() - INTERVAL '65 days', NULL, 'auto', 'Test')
    `, [testOppId]);

    const candidates = await reEngagement.identifyReEngagementCandidates({ minDaysDormant: 60 });
    assert(Array.isArray(candidates), 'Identify candidates returns array');
    assert(candidates.length > 0, `Found re-engagement candidates (${candidates.length})`);

    const testCandidate = candidates.find(c => c.opportunityId === testOppId);
    assert(testCandidate !== undefined, 'Test opportunity identified as candidate');
    assert(testCandidate.priority === 'medium', `Candidate priority correct (${testCandidate.priority})`);

    const template = reEngagement.getReEngagementTemplate(65);
    assert(template.name === 'gentle_checkin', `Template selection correct (${template.name})`);

    const scheduled = await reEngagement.scheduleReEngagementOutreach(testOppId, template.name);
    assert(scheduled.attemptId !== undefined, 'Outreach scheduled successfully');
    assert(scheduled.template === template.name, 'Scheduled template matches');

    const executed = await reEngagement.executeReEngagement(testOppId);
    assert(executed.success === true, 'Re-engagement executed successfully');
    assert(executed.attemptId !== undefined, 'Execution created attempt record');

    const tracked = await reEngagement.trackReEngagementResponse(executed.attemptId, 'responded');
    assert(tracked.outcome === 'responded', 'Response tracked correctly');

    const stats = await reEngagement.getReEngagementStats();
    assert(stats.totalAttempts >= 1, `Re-engagement stats available (${stats.totalAttempts} attempts)`);

    const history = await reEngagement.getReEngagementHistory(testOppId);
    assert(Array.isArray(history), 'Re-engagement history is array');
    assert(history.length >= 1, `History tracked (${history.length} entries)`);

    const batchResult = await reEngagement.batchReEngage({ minDaysDormant: 60, limit: 5, dryRun: true });
    assert(batchResult.dryRun === true, 'Batch dry-run mode works');
    assert(batchResult.candidatesFound >= 0, `Batch found ${batchResult.candidatesFound} candidates`);

    console.log('');

    // Section 2: Analytics
    console.log('📋 Section 2: Lifecycle Analytics\n');

    const cohorts = await analytics.analyzeCohorts({ groupBy: 'week', limit: 4 });
    assert(Array.isArray(cohorts), 'Cohort analysis returns array');
    console.log(`   Analyzed ${cohorts.length} cohorts`);

    const paths = await analytics.analyzePaths({ minOccurrences: 1 });
    assert(Array.isArray(paths), 'Path analysis returns array');
    if (paths.length > 0) {
      assert(paths[0].path !== undefined, 'Paths have path property');
      assert(paths[0].occurrenceCount !== undefined, 'Paths have occurrence count');
    }
    console.log(`   Found ${paths.length} transition paths`);

    const bottlenecks = await analytics.detectBottlenecks();
    assert(Array.isArray(bottlenecks), 'Bottleneck detection returns array');
    if (bottlenecks.length > 0) {
      assert(bottlenecks[0].state !== undefined, 'Bottlenecks have state');
      assert(bottlenecks[0].bottleneckType !== undefined, 'Bottlenecks have type');
    }
    console.log(`   Detected ${bottlenecks.length} potential bottlenecks`);

    const benchmarks = await analytics.getBenchmarks();
    assert(benchmarks.avgTimeToCloseDays !== undefined, 'Benchmarks have avg time to close');
    assert(benchmarks.winRate !== undefined, 'Benchmarks have win rate');
    console.log(`   Benchmarks: ${benchmarks.avgTimeToCloseDays} days to close, ${benchmarks.winRate}% win rate`);

    const forecast = await analytics.forecastPipeline(3);
    assert(forecast.forecastMonths === 3, 'Forecast for 3 months');
    assert(Array.isArray(forecast.projections), 'Forecast has projections');
    assert(forecast.projections.length === 3, 'Forecast has 3 projections');
    console.log(`   Generated ${forecast.projections.length} month forecast`);

    const recommendations = await analytics.getRecommendations();
    assert(Array.isArray(recommendations), 'Recommendations is array');
    console.log(`   Generated ${recommendations.length} recommendations`);

    console.log('');

    // Section 3: Automated Actions
    console.log('📋 Section 3: Automated Actions\n');

    const allTemplates = await automatedActions.getAllTemplates();
    assert(Array.isArray(allTemplates), 'Get all templates returns array');
    assert(allTemplates.length >= 6, `Action templates exist (${allTemplates.length})`);

    const qualifiedTemplates = await automatedActions.getActionTemplatesForState('QUALIFIED', 'entered');
    assert(Array.isArray(qualifiedTemplates), 'Get templates for state returns array');
    console.log(`   ${qualifiedTemplates.length} templates for QUALIFIED:entered`);

    const emailAction = await automatedActions.sendEmail(testOppId, {
      template_content: { subject: 'Test', template: 'test' }
    });
    assert(emailAction.success === true, 'Email action executes');
    assert(emailAction.action === 'email', 'Email action type correct');

    const taskAction = await automatedActions.createTask(testOppId, {
      template_content: { title: 'Test Task', description: 'Test' }
    });
    assert(taskAction.success === true, 'Task action executes');
    assert(taskAction.action === 'task', 'Task action type correct');

    const notificationAction = await automatedActions.sendNotification(testOppId, {
      template_content: { message: 'Test notification' }
    });
    assert(notificationAction.success === true, 'Notification action executes');
    assert(notificationAction.action === 'notification', 'Notification action type correct');

    const scheduledAction = await automatedActions.scheduleDelayedAction(testOppId, {
      name: 'delayed_test',
      action_type: 'email',
      time_delay_hours: 24
    });
    assert(scheduledAction.success === true, 'Delayed action schedules');
    assert(scheduledAction.delayHours === 24, 'Delay hours correct');

    const newTemplate = await automatedActions.upsertActionTemplate({
      name: 'Test Template',
      actionType: 'email',
      triggerState: 'DISCOVERED',
      triggerEvent: 'entered',
      templateContent: { subject: 'Test' }
    });
    assert(newTemplate.id !== undefined, 'Template created');
    assert(newTemplate.name === 'Test Template', 'Template name correct');

    const deactivated = await automatedActions.deactivateTemplate(newTemplate.id);
    assert(deactivated.is_active === false, 'Template deactivated');

    console.log('');

    // Cleanup
    console.log('🧹 Cleaning up test data...\n');
    await pool.query('DELETE FROM re_engagement_attempts WHERE opportunity_id = $1', [testOppId]);
    await pool.query('DELETE FROM opportunity_lifecycle WHERE opportunity_id = $1', [testOppId]);
    await pool.query('DELETE FROM lifecycle_action_templates WHERE id = $1', [newTemplate.id]);

    // Summary
    console.log('='.repeat(70));
    console.log('CHECKPOINT 2 SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Tests: ${testsRun}`);
    console.log(`Passed: ${testsPassed} ✅`);
    console.log(`Failed: ${testsFailed} ❌`);
    console.log(`Pass Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);
    console.log('='.repeat(70));

    if (testsFailed === 0) {
      console.log('\n✅ CHECKPOINT 2: PASSED');
      console.log('🚀 Re-Engagement, Analytics, and Automated Actions are ready!');
      process.exit(0);
    } else {
      console.log('\n❌ CHECKPOINT 2: FAILED');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ CHECKPOINT 2 ERROR:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
    await reEngagement.close();
    await analytics.close();
    await automatedActions.close();
  }
}

checkpoint2();
