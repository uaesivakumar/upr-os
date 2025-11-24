#!/usr/bin/env node
/**
 * Sprint 37 - Comprehensive Smoke Test
 * Phase 11: Multi-Agent Collaboration & Reflection
 *
 * End-to-end validation of:
 * - Multi-agent system foundation
 * - Specialized agents (Discovery, Validation, Critic)
 * - Agent coordination and workflows
 * - Reflection and learning
 * - Agent monitoring and health
 */

import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

import { BaseAgent } from '../../server/agents/BaseAgent.js';
import { DiscoveryAgent } from '../../server/agents/DiscoveryAgent.js';
import { ValidationAgent } from '../../server/agents/ValidationAgent.js';
import { CriticAgent } from '../../server/agents/CriticAgent.js';
import { AgentRegistryService } from '../../server/services/agentRegistryService.js';
import { AgentCoordinationService } from '../../server/services/agentCoordinationService.js';
import { ReflectionService } from '../../server/services/reflectionService.js';
import { AgentMonitoringService } from '../../server/services/agentMonitoringService.js';

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
const testWorkflowIds = [];

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

  for (const workflowId of testWorkflowIds) {
    await pool.query('DELETE FROM agent_workflows WHERE workflow_id = $1', [workflowId]);
  }

  for (const agentId of testAgentIds) {
    await pool.query('DELETE FROM agent_communications WHERE from_agent IN (SELECT id FROM agents WHERE agent_id = $1) OR to_agent IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agent_reflections WHERE agent_id IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agent_tasks WHERE assigned_to IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agent_consensus WHERE task_id LIKE $1', ['%' + agentId + '%']);
    await pool.query('DELETE FROM agents WHERE agent_id = $1', [agentId]);
  }

  log('✅ Cleanup complete');
}

async function smokeTest() {
  console.log('\\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Sprint 37 Smoke Test: Multi-Agent Collaboration        ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\\n');

  try {
    // Initialize services
    const registry = new AgentRegistryService(DATABASE_CONFIG);
    const coordinator = new AgentCoordinationService(DATABASE_CONFIG);
    const reflection = new ReflectionService(DATABASE_CONFIG);
    const monitoring = new AgentMonitoringService(DATABASE_CONFIG);

    // ================================================================
    // SCENARIO 1: Agent System Foundation
    // ================================================================
    log('\\n📋 SCENARIO 1: Multi-Agent System Foundation');
    log('=' .repeat(60));

    // Test 1: Initialize specialized agents
    const discoveryAgent = new DiscoveryAgent({}, DATABASE_CONFIG);
    await discoveryAgent.initialize();
    testAgentIds.push(discoveryAgent.agentId);

    const validationAgent = new ValidationAgent({}, DATABASE_CONFIG);
    await validationAgent.initialize();
    testAgentIds.push(validationAgent.agentId);

    const criticAgent = new CriticAgent({}, DATABASE_CONFIG);
    await criticAgent.initialize();
    testAgentIds.push(criticAgent.agentId);

    logTest('Scenario 1 - Initialize Agents',
      discoveryAgent.dbId && validationAgent.dbId && criticAgent.dbId,
      `3 agents initialized`);

    // Test 2: Agent registration and discovery
    const discovered = await registry.discoverAgents(['pattern_discovery'], 'AVAILABLE');
    logTest('Scenario 1 - Agent Discovery',
      discovered.length >= 1,
      `${discovered.length} agents discovered`);

    // Test 3: Agent statistics
    const stats = await registry.getAgentStatistics();
    logTest('Scenario 1 - Agent Statistics',
      stats.totalAgents >= 3,
      `Total: ${stats.totalAgents}, Idle: ${stats.idleAgents}`);

    // ================================================================
    // SCENARIO 2: Agent Collaboration Workflow
    // ================================================================
    log('\\n📋 SCENARIO 2: Multi-Agent Collaboration Workflow');
    log('=' .repeat(60));

    // Test 4: Discovery agent finds patterns
    const patternsTask = {
      taskType: 'discover_patterns',
      data: {},
      options: { minSupport: 0.05 }
    };
    const patternsResult = await discoveryAgent.process(patternsTask);

    logTest('Scenario 2 - Discovery Agent Process',
      patternsResult.success,
      `Patterns: ${patternsResult.result?.totalPatterns || 0}`);

    // Test 5: Validation agent validates findings
    const validateTask = {
      taskType: 'validate_data',
      data: { patterns: patternsResult.result?.totalPatterns || 0, confidence: 0.8 },
      rules: {
        required: ['patterns', 'confidence'],
        types: { patterns: 'number', confidence: 'number' }
      }
    };
    const validateResult = await validationAgent.process(validateTask);

    logTest('Scenario 2 - Validation Agent Process',
      validateResult.success && validateResult.result?.valid,
      `Valid: ${validateResult.result?.valid}`);

    // Test 6: Critic agent critiques findings
    const critiqueTask = {
      taskType: 'critique',
      data: {
        decisionType: 'pattern_analysis',
        details: { patterns: patternsResult.result, validation: validateResult.result },
        rationale: 'Pattern analysis from discovery agent'
      }
    };
    const critiqueResult = await criticAgent.process(critiqueTask);

    logTest('Scenario 2 - Critic Agent Process',
      critiqueResult.success,
      `Assessment: ${critiqueResult.result?.overallAssessment?.toFixed(2) || 'N/A'}`);

    // ================================================================
    // SCENARIO 3: Agent Communication
    // ================================================================
    log('\\n📋 SCENARIO 3: Inter-Agent Communication');
    log('=' .repeat(60));

    // Test 7: Send message between agents
    const commResult = await discoveryAgent.communicate(
      validationAgent.agentId,
      { request: 'validate_patterns', data: { patterns: 5 } },
      'REQUEST'
    );

    logTest('Scenario 3 - Send Message',
      commResult.sent,
      `Message ID: ${commResult.messageId.substring(0, 8)}...`);

    // Test 8: Receive and acknowledge messages
    const messages = await validationAgent.receiveMessages(false);
    logTest('Scenario 3 - Receive Messages',
      messages.length >= 1,
      `${messages.length} messages received`);

    if (messages.length > 0) {
      await validationAgent.acknowledgeMessage(messages[0].messageId);
      const acknowledgedMessages = await validationAgent.receiveMessages(true);
      logTest('Scenario 3 - Acknowledge Messages',
        acknowledgedMessages.length >= 1,
        'Messages acknowledged');
    }

    // ================================================================
    // SCENARIO 4: Workflow Orchestration
    // ================================================================
    log('\\n📋 SCENARIO 4: Workflow Orchestration');
    log('=' .repeat(60));

    // Test 9: Create sequential workflow
    const seqWorkflow = await coordinator.createWorkflow(
      'SEQUENTIAL',
      {
        steps: [
          { name: 'discover', type: 'discovery' },
          { name: 'validate', type: 'validation' },
          { name: 'critique', type: 'critique' }
        ]
      },
      'Pattern Analysis Workflow'
    );
    testWorkflowIds.push(seqWorkflow.workflow_id);

    logTest('Scenario 4 - Create Sequential Workflow',
      seqWorkflow.workflow_id && seqWorkflow.workflow_type === 'SEQUENTIAL',
      `Workflow ID: ${seqWorkflow.workflow_id.substring(0, 16)}...`);

    // Test 10: Execute workflow
    const workflowResult = await coordinator.executeWorkflow(
      seqWorkflow.workflow_id,
      { data: 'test input' }
    );

    logTest('Scenario 4 - Execute Sequential Workflow',
      workflowResult.status === 'COMPLETED',
      `Status: ${workflowResult.status}, Duration: ${workflowResult.duration}ms`);

    // Test 11: Create parallel workflow
    const parallelWorkflow = await coordinator.createWorkflow(
      'PARALLEL',
      {
        agents: [
          { name: 'agent-1', agentType: 'Discovery' },
          { name: 'agent-2', agentType: 'Validation' },
          { name: 'agent-3', agentType: 'Critic' }
        ]
      },
      'Multi-Agent Analysis'
    );
    testWorkflowIds.push(parallelWorkflow.workflow_id);

    const parallelResult = await coordinator.executeWorkflow(
      parallelWorkflow.workflow_id,
      { task: 'analyze_lead' }
    );

    logTest('Scenario 4 - Execute Parallel Workflow',
      parallelResult.status === 'COMPLETED',
      `${parallelResult.results?.results?.length || 0} agents completed`);

    // Test 12: Monitor workflow
    const workflowStatus = await coordinator.monitorWorkflow(seqWorkflow.workflow_id);
    logTest('Scenario 4 - Monitor Workflow',
      workflowStatus.found && workflowStatus.status === 'COMPLETED',
      `Status: ${workflowStatus.status}`);

    // ================================================================
    // SCENARIO 5: Consensus Building
    // ================================================================
    log('\\n📋 SCENARIO 5: Consensus Building');
    log('=' .repeat(60));

    // Test 13: Build consensus from multiple opinions
    const opinions = [
      { agent: 'discovery', decision: 'approve', confidence: 0.8 },
      { agent: 'validation', decision: 'approve', confidence: 0.9 },
      { agent: 'critic', decision: 'revise', confidence: 0.7 }
    ];

    const consensus = await coordinator.buildConsensus(opinions, 'MAJORITY_VOTE');

    logTest('Scenario 5 - Build Consensus',
      consensus.consensusId && consensus.agreementScore !== undefined,
      `Agreement: ${consensus.agreementScore?.toFixed(2) || 'N/A'}`);

    // Test 14: Aggregate results
    const results = [
      { success: true, output: { score: 85 } },
      { success: true, output: { score: 90 } },
      { success: true, output: { score: 80 } }
    ];

    const aggregated = await coordinator.aggregateResults(results, 'AVERAGE');

    logTest('Scenario 5 - Aggregate Results',
      aggregated.successCount === 3,
      `${aggregated.successCount}/${aggregated.totalCount} successful`);

    // ================================================================
    // SCENARIO 6: Reflection & Learning
    // ================================================================
    log('\\n📋 SCENARIO 6: Reflection & Learning');
    log('=' .repeat(60));

    // Test 15: Record decision
    const decisionId = `decision-${crypto.randomUUID()}`;
    const decision = await reflection.recordDecision(
      discoveryAgent.agentId,
      {
        id: decisionId,
        action: 'identify_pattern',
        factors: ['industry', 'location']
      }
    );

    logTest('Scenario 6 - Record Decision',
      decision.recorded,
      `Decision ID: ${decision.decisionId.substring(0, 16)}...`);

    // Test 16: Record outcome
    const outcome = await reflection.recordOutcome(decisionId, {
      success: true,
      patternsFound: 3
    });

    logTest('Scenario 6 - Record Outcome',
      outcome.outcomeRecorded,
      'Outcome recorded');

    // Test 17: Trigger reflection
    const reflectionResult = await reflection.triggerReflection(decisionId);

    logTest('Scenario 6 - Trigger Reflection',
      reflectionResult.triggered && reflectionResult.reflection,
      `Learnings: ${reflectionResult.reflection?.learnings?.length || 0}`);

    // Test 18: Get reflection history
    const history = await reflection.getReflectionHistory(discoveryAgent.agentId);

    logTest('Scenario 6 - Reflection History',
      history.reflections.length >= 1,
      `${history.count} reflections found`);

    // Test 19: Share insights
    const insights = {
      fromAgent: discoveryAgent.agentId,
      type: 'PATTERN_INSIGHT',
      data: { insight: 'Industry patterns correlate with conversion' }
    };

    const shared = await reflection.shareInsights(insights, [
      validationAgent.agentId,
      criticAgent.agentId
    ]);

    logTest('Scenario 6 - Share Insights',
      shared.insightsShared === 2,
      `Shared with ${shared.insightsShared} agents`);

    // ================================================================
    // SCENARIO 7: Agent Monitoring
    // ================================================================
    log('\\n📋 SCENARIO 7: Agent Monitoring & Health');
    log('=' .repeat(60));

    // Test 20: Track agent health
    const health = await monitoring.trackAgentHealth(discoveryAgent.agentId);

    logTest('Scenario 7 - Track Agent Health',
      health.found && health.health,
      `Health: ${health.health?.status}, Score: ${health.health?.score?.toFixed(2)}`);

    // Test 21: Measure performance
    const performance = await monitoring.measurePerformance(discoveryAgent.agentId, 24);

    logTest('Scenario 7 - Measure Performance',
      performance.totalTasks !== undefined,
      `Tasks: ${performance.totalTasks}, Success rate: ${(performance.successRate * 100).toFixed(1)}%`);

    // Test 22: Collaboration score
    const collabScore = await monitoring.calculateCollaborationScore([
      discoveryAgent.agentId,
      validationAgent.agentId
    ]);

    logTest('Scenario 7 - Collaboration Score',
      collabScore.score !== undefined,
      `Score: ${collabScore.score?.toFixed(2)}, Quality: ${collabScore.quality}`);

    // Test 23: Detect anomalies
    const anomalies = await monitoring.detectAnomalies(discoveryAgent.agentId);

    logTest('Scenario 7 - Detect Anomalies',
      anomalies.status !== undefined,
      `Status: ${anomalies.status}, Anomalies: ${anomalies.anomaliesDetected}`);

    // Test 24: Generate alerts
    const alerts = await monitoring.generateAlerts({
      minSuccessRate: 0.5,
      maxResponseTime: 10000
    });

    logTest('Scenario 7 - Generate Alerts',
      alerts.alertsGenerated !== undefined,
      `${alerts.alertsGenerated} alerts generated`);

    // Test 25: Monitoring dashboard
    const dashboard = await monitoring.getDashboard({ timeRange: 24 });

    logTest('Scenario 7 - Monitoring Dashboard',
      dashboard.overview && dashboard.health,
      `System health: ${dashboard.health?.status}`);

    // ================================================================
    // SCENARIO 8: End-to-End Multi-Agent Workflow
    // ================================================================
    log('\\n📋 SCENARIO 8: End-to-End Multi-Agent Workflow');
    log('=' .repeat(60));

    // Test 26: Complete collaboration cycle
    // 1. Discovery finds patterns
    const e2eDiscovery = await discoveryAgent.process({
      taskType: 'detect_trends',
      data: {},
      options: { window: 30 }
    });

    // 2. Validation validates
    const e2eValidation = await validationAgent.process({
      taskType: 'validate_data',
      data: e2eDiscovery.result,
      rules: { required: ['trend'] }
    });

    // 3. Critic critiques
    const e2eCritique = await criticAgent.process({
      taskType: 'identify_risks',
      data: { action: 'trend_analysis', data: e2eDiscovery.result }
    });

    // 4. Build consensus
    const e2eConsensus = await coordinator.buildConsensus([
      { agent: 'discovery', result: e2eDiscovery },
      { agent: 'validation', result: e2eValidation },
      { agent: 'critic', result: e2eCritique }
    ], 'MAJORITY_VOTE');

    logTest('Scenario 8 - End-to-End Workflow',
      e2eDiscovery.success && e2eValidation.success && e2eCritique.success && e2eConsensus.consensusId,
      'Complete collaboration cycle successful');

    // ================================================================
    // CLEANUP
    // ================================================================
    await cleanup();

    // Close services
    await registry.close();
    await coordinator.close();
    await reflection.close();
    await monitoring.close();
    await discoveryAgent.close();
    await validationAgent.close();
    await criticAgent.close();

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
      console.log('🎉 ALL SMOKE TESTS PASSED! Sprint 37 is production-ready.\\n');
      console.log('✅ Multi-Agent System validated:');
      console.log('   - Agent foundation (BaseAgent, 3 specialized agents)');
      console.log('   - Agent coordination & workflows (sequential, parallel)');
      console.log('   - Inter-agent communication');
      console.log('   - Consensus building');
      console.log('   - Reflection & learning');
      console.log('   - Agent monitoring & health');
      console.log('   - End-to-end collaboration workflows\\n');
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
