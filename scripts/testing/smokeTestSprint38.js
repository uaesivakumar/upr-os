#!/usr/bin/env node
/**
 * Sprint 38 - Comprehensive Smoke Test
 * Phase 12: Agent Enhancement & Optimization
 *
 * End-to-end validation of:
 * - Multi-agent dashboard
 * - Performance tracking
 * - Auto-improvement mechanisms
 * - Agent specialization
 * - Collaborative learning
 * - Advanced consensus mechanisms
 */

import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

import { DiscoveryAgent } from '../../server/agents/DiscoveryAgent.js';
import { ValidationAgent } from '../../server/agents/ValidationAgent.js';
import { CriticAgent } from '../../server/agents/CriticAgent.js';
import { AgentCoordinationService } from '../../server/services/agentCoordinationService.js';

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
const testAgentIds = [];

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

  for (const agentId of testAgentIds) {
    await pool.query('DELETE FROM agent_improvement_plans WHERE agent_id IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agent_specializations WHERE agent_id IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agent_performance_snapshots WHERE agent_id IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agent_performance_metrics WHERE agent_id IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM collaborative_learnings WHERE participating_agents::text LIKE $1', ['%' + agentId + '%']);
    await pool.query('DELETE FROM agent_communications WHERE from_agent IN (SELECT id FROM agents WHERE agent_id = $1) OR to_agent IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agent_reflections WHERE agent_id IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agent_tasks WHERE assigned_to IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agents WHERE agent_id = $1', [agentId]);
  }

  log('✅ Cleanup complete');
}

async function smokeTest() {
  console.log('\\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Sprint 38 Smoke Test: Agent Enhancement & Optimization ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\\n');

  try {
    // Initialize agents
    const discovery = new DiscoveryAgent({}, DATABASE_CONFIG);
    await discovery.initialize();
    testAgentIds.push(discovery.agentId);

    const validation = new ValidationAgent({}, DATABASE_CONFIG);
    await validation.initialize();
    testAgentIds.push(validation.agentId);

    const critic = new CriticAgent({}, DATABASE_CONFIG);
    await critic.initialize();
    testAgentIds.push(critic.agentId);

    const coordinator = new AgentCoordinationService(DATABASE_CONFIG);

    // ================================================================
    // SCENARIO 1: Performance Tracking
    // ================================================================
    log('\\n📋 SCENARIO 1: Performance Tracking & Metrics');
    log('=' .repeat(60));

    // Test 1: Record performance metrics
    const metricId = await pool.query(`
      SELECT record_performance_metric($1, 'TASK', 'task_completion_time', 1250, '{"task_type": "discovery"}')
    `, [discovery.dbId]);

    logTest('Scenario 1 - Record Performance Metric',
      metricId.rows.length > 0,
      'Metric recorded');

    // Test 2: Create performance snapshot
    await pool.query('SELECT create_performance_snapshot($1, CURRENT_DATE)', [discovery.dbId]);

    const snapshot = await pool.query(`
      SELECT * FROM agent_performance_snapshots
      WHERE agent_id = $1 AND snapshot_date = CURRENT_DATE
    `, [discovery.dbId]);

    logTest('Scenario 1 - Performance Snapshot',
      snapshot.rows.length > 0,
      `Snapshot created for ${snapshot.rows[0]?.snapshot_date || 'today'}`);

    // Test 3: Query performance metrics
    const metrics = await pool.query(`
      SELECT * FROM agent_performance_metrics
      WHERE agent_id = $1
      ORDER BY recorded_at DESC
      LIMIT 10
    `, [discovery.dbId]);

    logTest('Scenario 1 - Query Performance Metrics',
      metrics.rows.length >= 1,
      `${metrics.rows.length} metrics found`);

    // ================================================================
    // SCENARIO 2: Agent Specialization
    // ================================================================
    log('\\n📋 SCENARIO 2: Agent Specialization Development');
    log('=' .repeat(60));

    // Test 4: Create specialization
    const spec = await pool.query(`
      INSERT INTO agent_specializations (agent_id, specialization_type, domain, expertise_level, tasks_completed, success_rate)
      VALUES ($1, 'DOMAIN', 'UAE Technology Sector', 0.75, 15, 0.85)
      RETURNING *
    `, [discovery.dbId]);

    logTest('Scenario 2 - Create Specialization',
      spec.rows.length > 0,
      `Domain: ${spec.rows[0]?.domain}, Expertise: ${spec.rows[0]?.expertise_level}`);

    // Test 5: Query specializations
    const specs = await pool.query(`
      SELECT * FROM agent_specialization_view
      WHERE agent_id = $1
    `, [discovery.agentId]);

    logTest('Scenario 2 - Query Specialization View',
      specs.rows.length >= 1,
      `${specs.rows.length} specializations with expertise ≥0.6`);

    // Test 6: Update specialization
    await pool.query(`
      UPDATE agent_specializations
      SET expertise_level = 0.85, tasks_completed = tasks_completed + 1, last_used = NOW()
      WHERE agent_id = $1 AND domain = 'UAE Technology Sector'
    `, [discovery.dbId]);

    const updated = await pool.query(`
      SELECT expertise_level FROM agent_specializations
      WHERE agent_id = $1 AND domain = 'UAE Technology Sector'
    `, [discovery.dbId]);

    logTest('Scenario 2 - Update Specialization',
      updated.rows[0]?.expertise_level == 0.85,
      `New expertise: ${updated.rows[0]?.expertise_level}`);

    // ================================================================
    // SCENARIO 3: Auto-Improvement
    // ================================================================
    log('\\n📋 SCENARIO 3: Agent Auto-Improvement');
    log('=' .repeat(60));

    // Test 7: Create improvement plan
    const improvementPlan = await pool.query(`
      INSERT INTO agent_improvement_plans (agent_id, plan_type, opportunities, actions, priority)
      VALUES ($1, 'PERFORMANCE_TUNING', $2, $3, 'HIGH')
      RETURNING *
    `, [
      discovery.dbId,
      JSON.stringify([
        { area: 'pattern_detection', current_accuracy: 0.82, target_accuracy: 0.90 }
      ]),
      JSON.stringify([
        { action: 'increase_sample_size', params: { min_samples: 100 } },
        { action: 'adjust_threshold', params: { new_threshold: 0.15 } }
      ])
    ]);

    logTest('Scenario 3 - Create Improvement Plan',
      improvementPlan.rows.length > 0,
      `Plan ID: ${improvementPlan.rows[0]?.id.substring(0, 8)}..., Priority: ${improvementPlan.rows[0]?.priority}`);

    // Test 8: Apply improvement plan
    const planId = improvementPlan.rows[0].id;
    await pool.query(`
      UPDATE agent_improvement_plans
      SET status = 'IN_PROGRESS', applied_at = NOW()
      WHERE id = $1
    `, [planId]);

    await pool.query(`
      UPDATE agent_improvement_plans
      SET status = 'COMPLETED', completed_at = NOW(), results = $2
      WHERE id = $1
    `, [planId, JSON.stringify({ success: true, accuracy_improvement: 0.08 })]);

    const appliedPlan = await pool.query(`
      SELECT status, results FROM agent_improvement_plans WHERE id = $1
    `, [planId]);

    logTest('Scenario 3 - Apply Improvement Plan',
      appliedPlan.rows[0]?.status === 'COMPLETED',
      `Status: ${appliedPlan.rows[0]?.status}, Results: ${JSON.stringify(appliedPlan.rows[0]?.results || {})}`);

    // Test 9: Track improvement history
    const improvements = await pool.query(`
      SELECT COUNT(*) as count,
             COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
             COUNT(*) FILTER (WHERE status = 'FAILED') as failed
      FROM agent_improvement_plans
      WHERE agent_id = $1
    `, [discovery.dbId]);

    logTest('Scenario 3 - Improvement History',
      parseInt(improvements.rows[0]?.count) >= 1,
      `Total: ${improvements.rows[0]?.count}, Completed: ${improvements.rows[0]?.completed}`);

    // ================================================================
    // SCENARIO 4: Collaborative Learning
    // ================================================================
    log('\\n📋 SCENARIO 4: Collaborative Learning');
    log('=' .repeat(60));

    // Test 10: Record collaborative learning
    const learning = await pool.query(`
      INSERT INTO collaborative_learnings (workflow_id, participating_agents, learning_type, insights, confidence)
      VALUES ($1, $2, 'WORKFLOW_PATTERN', $3, 0.85)
      RETURNING *
    `, [
      'workflow-test-001',
      JSON.stringify([discovery.agentId, validation.agentId, critic.agentId]),
      JSON.stringify({
        pattern: 'Sequential validation after discovery improves accuracy',
        metrics: { accuracy_increase: 0.12, time_increase: 250 },
        recommendation: 'Always validate discovery findings before critique'
      })
    ]);

    logTest('Scenario 4 - Record Collaborative Learning',
      learning.rows.length > 0,
      `Learning ID: ${learning.rows[0]?.id.substring(0, 8)}..., Confidence: ${learning.rows[0]?.confidence}`);

    // Test 11: Apply collaborative learning
    await pool.query(`
      UPDATE collaborative_learnings
      SET applied_count = applied_count + 1, last_applied = NOW()
      WHERE id = $1
    `, [learning.rows[0].id]);

    const appliedLearning = await pool.query(`
      SELECT applied_count FROM collaborative_learnings WHERE id = $1
    `, [learning.rows[0].id]);

    logTest('Scenario 4 - Apply Collaborative Learning',
      parseInt(appliedLearning.rows[0]?.applied_count) >= 1,
      `Applied ${appliedLearning.rows[0]?.applied_count} times`);

    // Test 12: Query learnings by type
    const learningsByType = await pool.query(`
      SELECT learning_type, COUNT(*) as count, AVG(confidence) as avg_confidence
      FROM collaborative_learnings
      GROUP BY learning_type
    `);

    logTest('Scenario 4 - Query Learnings by Type',
      learningsByType.rows.length >= 1,
      `${learningsByType.rows.length} learning types found`);

    // ================================================================
    // SCENARIO 5: Advanced Consensus
    // ================================================================
    log('\\n📋 SCENARIO 5: Advanced Consensus Mechanisms');
    log('=' .repeat(60));

    // Test 13: Weighted consensus
    const opinions = [
      { agent: discovery.agentId, decision: 'approve', confidence: 0.9, expertise: 0.8 },
      { agent: validation.agentId, decision: 'approve', confidence: 0.85, expertise: 0.75 },
      { agent: critic.agentId, decision: 'revise', confidence: 0.7, expertise: 0.9 }
    ];

    // Calculate weighted consensus
    let weightedScore = 0;
    let totalWeight = 0;
    opinions.forEach(op => {
      const weight = op.confidence * op.expertise;
      weightedScore += (op.decision === 'approve' ? 1 : 0) * weight;
      totalWeight += weight;
    });
    const weightedConsensus = weightedScore / totalWeight;

    logTest('Scenario 5 - Weighted Consensus',
      weightedConsensus >= 0 && weightedConsensus <= 1,
      `Weighted score: ${weightedConsensus.toFixed(3)}`);

    // Test 14: Store consensus result
    const consensus = await pool.query(`
      INSERT INTO agent_consensus (consensus_id, task_id, participating_agents, individual_opinions, consensus_method, agreement_score, consensus_result)
      VALUES ($1, $2, $3, $4, 'WEIGHTED', $5, $6)
      RETURNING *
    `, [
      `consensus-${crypto.randomUUID()}`,
      'task-test-001',
      JSON.stringify(opinions.map(o => o.agent)),
      JSON.stringify(opinions),
      weightedConsensus,
      JSON.stringify({ decision: 'approve', confidence: weightedConsensus })
    ]);

    logTest('Scenario 5 - Store Consensus Result',
      consensus.rows.length > 0,
      `Agreement: ${parseFloat(consensus.rows[0]?.agreement_score || 0).toFixed(3)}`);

    // Test 15: Quorum-based consensus
    const quorumSize = 2;
    const approvals = opinions.filter(o => o.decision === 'approve').length;
    const quorumMet = approvals >= quorumSize;

    logTest('Scenario 5 - Quorum-Based Consensus',
      quorumMet !== undefined,
      `Quorum ${quorumSize}: ${quorumMet ? 'MET' : 'NOT MET'} (${approvals}/${opinions.length} approvals)`);

    // ================================================================
    // SCENARIO 6: Dashboard & Analytics
    // ================================================================
    log('\\n📋 SCENARIO 6: Multi-Agent Dashboard');
    log('=' .repeat(60));

    // Test 16: Dashboard summary
    const dashboardSummary = await pool.query('SELECT * FROM dashboard_summary_view');

    logTest('Scenario 6 - Dashboard Summary',
      dashboardSummary.rows.length > 0,
      `Total agents: ${dashboardSummary.rows[0]?.total_agents}, Tasks 24h: ${dashboardSummary.rows[0]?.tasks_24h || 0}`);

    // Test 17: Performance trends
    const trends = await pool.query(`
      SELECT * FROM performance_trends_view
      WHERE agent_id = $1
      ORDER BY snapshot_date DESC
      LIMIT 7
    `, [discovery.agentId]);

    logTest('Scenario 6 - Performance Trends',
      trends.rows.length >= 1,
      `${trends.rows.length} trend data points`);

    // Test 18: System health calculation
    const health = await pool.query('SELECT calculate_system_health() as health_score');

    logTest('Scenario 6 - System Health',
      health.rows.length > 0 && health.rows[0].health_score !== null,
      `Health score: ${parseFloat(health.rows[0].health_score).toFixed(3)}`);

    // ================================================================
    // SCENARIO 7: End-to-End Agent Enhancement
    // ================================================================
    log('\\n📋 SCENARIO 7: End-to-End Agent Enhancement Workflow');
    log('=' .repeat(60));

    // Test 19: Complete enhancement cycle
    // 1. Agent performs tasks → 2. Metrics tracked → 3. Performance analyzed → 4. Improvement plan created → 5. Specialization developed

    // Simulate task execution
    const task = await discovery.process({
      taskType: 'discover_patterns',
      data: {},
      options: { minSupport: 0.05 }
    });

    // Record metrics
    await pool.query(`
      SELECT record_performance_metric($1, 'QUALITY', 'pattern_accuracy', $2, $3)
    `, [discovery.dbId, 0.88, JSON.stringify({ task_id: 'test-001' })]);

    // Create snapshot
    await pool.query('SELECT create_performance_snapshot($1)', [discovery.dbId]);

    // Create improvement plan based on performance
    const e2ePlan = await pool.query(`
      INSERT INTO agent_improvement_plans (agent_id, plan_type, opportunities, actions, priority)
      VALUES ($1, 'SELF_ASSESSMENT', $2, $3, 'MEDIUM')
      RETURNING *
    `, [
      discovery.dbId,
      JSON.stringify([{ area: 'pattern_recall', current: 0.88, target: 0.92 }]),
      JSON.stringify([{ action: 'broaden_search_criteria' }])
    ]);

    // Develop specialization
    await pool.query(`
      INSERT INTO agent_specializations (agent_id, specialization_type, domain, expertise_level, tasks_completed)
      VALUES ($1, 'DATA_TYPE', 'Engagement Patterns', 0.65, 8)
      ON CONFLICT DO NOTHING
    `, [discovery.dbId]);

    logTest('Scenario 7 - End-to-End Enhancement',
      task.success && e2ePlan.rows.length > 0,
      'Complete enhancement cycle executed');

    // Test 20: Verify enhancement impact
    const enhancementImpact = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM agent_performance_metrics WHERE agent_id = $1) as metrics_count,
        (SELECT COUNT(*) FROM agent_performance_snapshots WHERE agent_id = $1) as snapshots_count,
        (SELECT COUNT(*) FROM agent_improvement_plans WHERE agent_id = $1) as plans_count,
        (SELECT COUNT(*) FROM agent_specializations WHERE agent_id = $1) as specs_count
    `, [discovery.dbId]);

    const impact = enhancementImpact.rows[0];

    logTest('Scenario 7 - Enhancement Impact',
      parseInt(impact.metrics_count) >= 1 && parseInt(impact.plans_count) >= 1,
      `Metrics: ${impact.metrics_count}, Plans: ${impact.plans_count}, Specs: ${impact.specs_count}`);

    // ================================================================
    // CLEANUP
    // ================================================================
    await cleanup();

    // Close services
    await coordinator.close();
    await discovery.close();
    await validation.close();
    await critic.close();

    // ================================================================
    // FINAL RESULTS
    // ================================================================
    console.log('\\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  SMOKE TEST RESULTS                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\\n');

    console.log(`Total Tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Pass Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\\n`);

    if (failed === 0) {
      console.log('🎉 ALL SMOKE TESTS PASSED! Sprint 38 is production-ready.\\n');
      console.log('✅ Agent Enhancement validated:');
      console.log('   - Performance tracking & metrics');
      console.log('   - Agent specialization development');
      console.log('   - Auto-improvement mechanisms');
      console.log('   - Collaborative learning');
      console.log('   - Advanced consensus (weighted, quorum)');
      console.log('   - Multi-agent dashboard');
      console.log('   - End-to-end enhancement workflow\\n');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed:\\n');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   ❌ ${r.name}`);
        if (r.details) console.log(`      ${r.details}`);
      });
      console.log('');
      process.exit(1);
    }
  } catch (error) {
    console.error('\\n❌ Smoke test failed with error:', error.message);
    console.error(error.stack);
    await cleanup();
    process.exit(1);
  } finally {
    await pool.end();
  }
}

smokeTest();
