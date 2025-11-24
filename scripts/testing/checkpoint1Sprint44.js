#!/usr/bin/env node
/**
 * Sprint 44 - Checkpoint 1: Database and Automation Foundation
 *
 * Tests:
 * 1. Database tables created
 * 2. Triggers functioning
 * 3. Real-time score queue
 * 4. Decay automation
 * 5. Configuration system
 * 6. Alert creation
 * 7. Assignment tracking
 */

import pg from 'pg';
const { Pool } = pg;
import { RealtimeScoreService } from '../../server/services/realtimeScoreService.js';
import { DecaySchedulerService } from '../../server/services/decaySchedulerService.js';
import { ScoreAlertService } from '../../server/services/scoreAlertService.js';

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

async function runCheckpoint1() {
  console.log('🚀 Sprint 44 - Checkpoint 1: Database and Automation Foundation\n');
  console.log('='.repeat(80));

  // Initialize pool with explicit config
  pool = new Pool({
    host: '34.121.0.240',
    port: 5432,
    user: 'upr_app',
    password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
    database: 'upr_production',
    ssl: false
  });

  try {
    // Test 1: Verify database tables created
    console.log('\n📋 TEST 1: Database Tables');
    console.log('-'.repeat(80));

    const expectedTables = [
      'score_alerts',
      'lead_assignments',
      'ab_tests',
      'ab_test_assignments',
      'score_recalc_queue',
      'scoring_config'
    ];

    for (const tableName of expectedTables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )
      `, [tableName]);

      logTest(
        `Table ${tableName} exists`,
        result.rows[0].exists,
        result.rows[0].exists ? 'Table found' : 'Table missing'
      );
    }

    // Test 2: Verify scoring configuration
    console.log('\n⚙️  TEST 2: Scoring Configuration');
    console.log('-'.repeat(80));

    const expectedConfigs = [
      'grade_thresholds',
      'priority_weights',
      'decay_config',
      'realtime_scoring',
      'routing_rules',
      'alert_thresholds'
    ];

    for (const configKey of expectedConfigs) {
      const result = await pool.query(`
        SELECT config_value, is_active
        FROM scoring_config
        WHERE config_key = $1
      `, [configKey]);

      logTest(
        `Configuration ${configKey} exists`,
        result.rows.length > 0,
        result.rows.length > 0 ?
          `Active: ${result.rows[0].is_active}` :
          'Configuration missing'
      );
    }

    // Test 3: Test real-time scoring trigger
    console.log('\n⚡ TEST 3: Real-time Scoring Triggers');
    console.log('-'.repeat(80));

    // Get a test opportunity
    const oppResult = await pool.query(`
      SELECT opportunity_id
      FROM opportunity_lifecycle
      LIMIT 1
    `);

    if (oppResult.rows.length > 0) {
      const testOppId = oppResult.rows[0].opportunity_id;

      // Clear existing queue entries for test
      await pool.query(`
        DELETE FROM score_recalc_queue
        WHERE opportunity_id = $1
      `, [testOppId]);

      // Insert a touchpoint to trigger queue
      await pool.query(`
        INSERT INTO opportunity_touchpoints (
          opportunity_id,
          touchpoint_type,
          occurred_at,
          outcome,
          content_summary
        ) VALUES ($1, 'email', NOW(), 'positive', 'Test touchpoint for checkpoint 1')
      `, [testOppId]);

      // Check if queued
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for trigger

      const queueResult = await pool.query(`
        SELECT * FROM score_recalc_queue
        WHERE opportunity_id = $1
        AND trigger_reason = 'touchpoint_added'
        ORDER BY created_at DESC
        LIMIT 1
      `, [testOppId]);

      logTest(
        'Touchpoint trigger queues score recalculation',
        queueResult.rows.length > 0,
        queueResult.rows.length > 0 ?
          `Queue ID: ${queueResult.rows[0].id.substring(0, 8)}...` :
          'No queue entry created'
      );
    } else {
      logTest('Touchpoint trigger test', false, 'No test opportunity found');
    }

    // Test 4: Test queue processing
    console.log('\n🔄 TEST 4: Queue Processing');
    console.log('-'.repeat(80));

    const dbConfig = {
      host: '34.121.0.240',
      port: 5432,
      user: 'upr_app',
      password: 'SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=',
      database: 'upr_production',
      ssl: false
    };

    const realtimeService = new RealtimeScoreService(dbConfig);

    // Get queue status before processing
    const statusBefore = await realtimeService.getQueueStatus();
    logTest(
      'Get queue status',
      true,
      `Pending: ${statusBefore.pending.count}, Processing: ${statusBefore.processing.count}`
    );

    // Process queue (small batch)
    const processResult = await realtimeService.processQueue({ batchSize: 5 });
    logTest(
      'Process queue batch',
      !processResult.error,
      processResult.message ||
        `Processed ${processResult.successful || 0}/${processResult.total || 0}`
    );

    await realtimeService.close();

    // Test 5: Test manual queue entry
    console.log('\n📥 TEST 5: Manual Queue Entry');
    console.log('-'.repeat(80));

    const realtimeService2 = new RealtimeScoreService(dbConfig);

    if (oppResult.rows.length > 0) {
      const testOppId = oppResult.rows[0].opportunity_id;

      const queueResult = await realtimeService2.queueRecalculation(
        testOppId,
        'checkpoint_test',
        2
      );

      logTest(
        'Manually queue score recalculation',
        queueResult.queueId !== null,
        `Queue ID: ${queueResult.queueId?.substring(0, 8) || 'none'}...`
      );
    } else {
      logTest('Manual queue test', false, 'No test opportunity found');
    }

    await realtimeService2.close();

    // Test 6: Test alert service
    console.log('\n🔔 TEST 6: Alert Service');
    console.log('-'.repeat(80));

    const alertService = new ScoreAlertService(dbConfig);

    if (oppResult.rows.length > 0) {
      const testOppId = oppResult.rows[0].opportunity_id;

      // Create test alert
      const alert = await alertService.createAlert({
        opportunityId: testOppId,
        type: 'SCORE_INCREASE',
        severity: 'MEDIUM',
        message: 'Test alert from checkpoint 1',
        metadata: JSON.stringify({ test: true })
      });

      logTest(
        'Create score alert',
        alert && alert.id,
        alert ? `Alert ID: ${alert.id.substring(0, 8)}...` : 'Failed to create'
      );

      // Get alerts
      const alerts = await alertService.getAlerts({ limit: 5 });
      logTest(
        'Retrieve alerts',
        Array.isArray(alerts),
        `Found ${alerts.length} alerts`
      );
    } else {
      logTest('Alert service test', false, 'No test opportunity found');
    }

    await alertService.close();

    // Test 7: Test decay scheduler
    console.log('\n⏰ TEST 7: Decay Scheduler');
    console.log('-'.repeat(80));

    const decayScheduler = new DecaySchedulerService(dbConfig);

    // Get decay config
    const decayConfig = await decayScheduler.getConfig('decay_config');
    logTest(
      'Load decay configuration',
      decayConfig !== null,
      decayConfig ? `Enabled: ${decayConfig.enabled}` : 'Config not found'
    );

    // Run dry-run decay
    const decayResult = await decayScheduler.runDecay({ dryRun: true });
    logTest(
      'Run decay dry-run',
      decayResult.status === 'success' || decayResult.status === 'disabled',
      `Status: ${decayResult.status}, Found ${decayResult.total || 0} eligible`
    );

    // Get execution history
    const history = await decayScheduler.getExecutionHistory({ limit: 5 });
    logTest(
      'Get decay execution history',
      Array.isArray(history),
      `Found ${history.length} executions`
    );

    await decayScheduler.close();

    // Test 8: Test configuration functions
    console.log('\n🎛️  TEST 8: Configuration Functions');
    console.log('-'.repeat(80));

    // Test queue_score_recalc function
    if (oppResult.rows.length > 0) {
      const testOppId = oppResult.rows[0].opportunity_id;

      const funcResult = await pool.query(`
        SELECT queue_score_recalc($1, $2, $3) as queue_id
      `, [testOppId, 'function_test', 5]);

      logTest(
        'queue_score_recalc function works',
        funcResult.rows[0].queue_id !== null,
        `Returns UUID: ${funcResult.rows[0].queue_id?.substring(0, 8) || 'none'}...`
      );
    } else {
      logTest('queue_score_recalc function', false, 'No test opportunity found');
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 CHECKPOINT 1 SUMMARY\n');
    console.log(`Tests Run:    ${testsRun}`);
    console.log(`Tests Passed: ${testsPassed} ✅`);
    console.log(`Tests Failed: ${testsFailed} ❌`);
    console.log(`Success Rate: ${((testsPassed / testsRun) * 100).toFixed(1)}%`);

    if (testsFailed === 0) {
      console.log('\n🎉 CHECKPOINT 1 PASSED - Database and Automation Foundation Ready!');
    } else {
      console.log('\n⚠️  CHECKPOINT 1 INCOMPLETE - Some tests failed');
    }

    console.log('='.repeat(80));

    process.exit(testsFailed === 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Checkpoint 1 Error:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run checkpoint
runCheckpoint1();
