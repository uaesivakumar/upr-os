#!/usr/bin/env node
/**
 * Sprint 37 - Checkpoint 1: Foundation & Agent Implementations
 * Tests: BaseAgent, DiscoveryAgent, ValidationAgent, CriticAgent, AgentRegistryService
 */

import pg from 'pg';
import crypto from 'crypto';
const { Pool } = pg;

import { BaseAgent } from '../../server/agents/BaseAgent.js';
import { DiscoveryAgent } from '../../server/agents/DiscoveryAgent.js';
import { ValidationAgent } from '../../server/agents/ValidationAgent.js';
import { CriticAgent } from '../../server/agents/CriticAgent.js';
import { AgentRegistryService } from '../../server/services/agentRegistryService.js';

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
    await pool.query('DELETE FROM agent_communications WHERE from_agent IN (SELECT id FROM agents WHERE agent_id = $1) OR to_agent IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agent_reflections WHERE agent_id IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agent_tasks WHERE assigned_to IN (SELECT id FROM agents WHERE agent_id = $1)', [agentId]);
    await pool.query('DELETE FROM agents WHERE agent_id = $1', [agentId]);
  }

  log('✅ Cleanup complete');
}

async function checkpoint1() {
  console.log('\\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Sprint 37 Checkpoint 1: Foundation & Agent Implementations║');
  console.log('╚═══════════════════════════════════════════════════════════╝\\n');

  try {
    // ================================================================
    // SCENARIO 1: Database Schema
    // ================================================================
    log('\\n📋 SCENARIO 1: Database Schema Validation');
    log('=' .repeat(60));

    // Test 1: Tables exist
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('agents', 'agent_tasks', 'agent_communications', 'agent_reflections', 'agent_workflows', 'agent_consensus')
    `);
    logTest('Scenario 1 - Tables Created',
      tables.rows.length === 6,
      `${tables.rows.length}/6 tables found`);

    // Test 2: Views exist
    const views = await pool.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name IN ('agent_performance_view', 'workflow_summary_view', 'agent_collaboration_view')
    `);
    logTest('Scenario 1 - Views Created',
      views.rows.length === 3,
      `${views.rows.length}/3 views found`);

    // Test 3: Functions exist
    const functions = await pool.query(`
      SELECT proname FROM pg_proc
      WHERE proname IN ('update_agent_metrics', 'find_available_agents', 'calculate_consensus_score')
    `);
    logTest('Scenario 1 - Functions Created',
      functions.rows.length === 3,
      `${functions.rows.length}/3 functions found`);

    // ================================================================
    // SCENARIO 2: Agent Registry Service
    // ================================================================
    log('\\n📋 SCENARIO 2: Agent Registry Service');
    log('=' .repeat(60));

    const registry = new AgentRegistryService(DATABASE_CONFIG);

    // Test 4: Register agent
    const testAgentId = `test-agent-${crypto.randomUUID().substring(0, 8)}`;
    testAgentIds.push(testAgentId);

    const registered = await registry.registerAgent(
      testAgentId,
      'Custom',
      ['test_capability'],
      { test: true }
    );

    logTest('Scenario 2 - Register Agent',
      registered.agent_id === testAgentId,
      `Agent ID: ${registered.agent_id}`);

    // Test 5: Get agent status
    const status = await registry.getAgentStatus(testAgentId);
    logTest('Scenario 2 - Get Agent Status',
      status.found && status.agentId === testAgentId,
      `Status: ${status.status}, Found: ${status.found}`);

    // Test 6: Discover agents
    const discovered = await registry.discoverAgents(['test_capability'], 'AVAILABLE');
    logTest('Scenario 2 - Discover Agents',
      discovered.length >= 1,
      `${discovered.length} agents found`);

    // Test 7: Get agent statistics
    const stats = await registry.getAgentStatistics();
    logTest('Scenario 2 - Agent Statistics',
      stats.totalAgents >= 1,
      `Total: ${stats.totalAgents}, Idle: ${stats.idleAgents}`);

    // ================================================================
    // SCENARIO 3: BaseAgent Functionality
    // ================================================================
    log('\\n📋 SCENARIO 3: Base Agent Implementation');
    log('=' .repeat(60));

    // Test 8: Initialize BaseAgent
    const baseAgent = new BaseAgent('Custom', ['test'], {}, DATABASE_CONFIG);
    const initResult = await baseAgent.initialize();
    testAgentIds.push(baseAgent.agentId);

    logTest('Scenario 3 - Initialize BaseAgent',
      initResult.success && baseAgent.dbId !== null,
      `Agent ID: ${baseAgent.agentId}`);

    // Test 9: Get capabilities
    const capabilities = baseAgent.getCapabilities();
    logTest('Scenario 3 - Get Capabilities',
      Array.isArray(capabilities) && capabilities.includes('test'),
      `Capabilities: ${capabilities.join(', ')}`);

    // Test 10: Get status
    const agentStatus = baseAgent.getStatus();
    logTest('Scenario 3 - Get Status',
      agentStatus.status === 'IDLE',
      `Status: ${agentStatus.status}`);

    // ================================================================
    // SCENARIO 4: DiscoveryAgent
    // ================================================================
    log('\\n📋 SCENARIO 4: Discovery Agent');
    log('=' .repeat(60));

    const discoveryAgent = new DiscoveryAgent({}, DATABASE_CONFIG);
    await discoveryAgent.initialize();
    testAgentIds.push(discoveryAgent.agentId);

    // Test 11: Discover patterns
    const patternsTask = {
      taskType: 'discover_patterns',
      data: {},
      options: { minSupport: 0.05 }
    };
    const patternsResult = await discoveryAgent.process(patternsTask);

    logTest('Scenario 4 - Discover Patterns',
      patternsResult.success && patternsResult.result,
      `Patterns found: ${patternsResult.result?.totalPatterns || 0}`);

    // Test 12: Identify anomalies
    const anomaliesTask = {
      taskType: 'identify_anomalies',
      data: {},
      options: { threshold: 2.5 }
    };
    const anomaliesResult = await discoveryAgent.process(anomaliesTask);

    logTest('Scenario 4 - Identify Anomalies',
      anomaliesResult.success,
      `Anomalies: ${anomaliesResult.result?.anomaliesFound || 0}`);

    // Test 13: Detect trends
    const trendsTask = {
      taskType: 'detect_trends',
      data: {},
      options: { window: 30 }
    };
    const trendsResult = await discoveryAgent.process(trendsTask);

    logTest('Scenario 4 - Detect Trends',
      trendsResult.success,
      `Trend: ${trendsResult.result?.trend || 'UNKNOWN'}`);

    // ================================================================
    // SCENARIO 5: ValidationAgent
    // ================================================================
    log('\\n📋 SCENARIO 5: Validation Agent');
    log('=' .repeat(60));

    const validationAgent = new ValidationAgent({}, DATABASE_CONFIG);
    await validationAgent.initialize();
    testAgentIds.push(validationAgent.agentId);

    // Test 14: Validate data
    const validateDataTask = {
      taskType: 'validate_data',
      data: { name: 'Test', score: 5000 },
      rules: {
        required: ['name', 'score'],
        types: { name: 'string', score: 'number' }
      }
    };
    const validateResult = await validationAgent.process(validateDataTask);

    logTest('Scenario 5 - Validate Data',
      validateResult.success && validateResult.result.valid,
      `Valid: ${validateResult.result?.valid}, Score: ${validateResult.result?.score}`);

    // Test 15: Validate decision
    const validateDecisionTask = {
      taskType: 'validate_decision',
      data: { action: 'assign', priority: 'HIGH' },
      rules: [
        { name: 'has_action', condition: { field: 'action', operator: 'equals', value: 'assign' }, severity: 'HIGH' }
      ]
    };
    const decisionResult = await validationAgent.process(validateDecisionTask);

    logTest('Scenario 5 - Validate Decision',
      decisionResult.success,
      `Valid: ${decisionResult.result?.valid}, Passed: ${decisionResult.result?.passed}`);

    // Test 16: Verify quality
    const qualityTask = {
      taskType: 'verify_quality',
      data: { name: 'Test', createdAt: new Date(), type: 'lead' },
      options: { threshold: 0.5 }
    };
    const qualityResult = await validationAgent.process(qualityTask);

    logTest('Scenario 5 - Verify Quality',
      qualityResult.success,
      `Quality: ${qualityResult.result?.quality?.toFixed(2)}, Meets threshold: ${qualityResult.result?.meetsThreshold}`);

    // ================================================================
    // SCENARIO 6: CriticAgent
    // ================================================================
    log('\\n📋 SCENARIO 6: Critic Agent');
    log('=' .repeat(60));

    const criticAgent = new CriticAgent({}, DATABASE_CONFIG);
    await criticAgent.initialize();
    testAgentIds.push(criticAgent.agentId);

    // Test 17: Critique decision
    const critiqueTask = {
      taskType: 'critique',
      data: {
        decisionType: 'lead_assignment',
        details: {
          opportunityId: crypto.randomUUID(),
          assignedTo: 'rep-senior-001',
          priority: 'MEDIUM'
        },
        rationale: 'High score lead'
      }
    };
    const critiqueResult = await criticAgent.process(critiqueTask);

    logTest('Scenario 6 - Critique Decision',
      critiqueResult.success,
      `Assessment: ${critiqueResult.result?.overallAssessment?.toFixed(2)}`);

    // Test 18: Identify risks
    const risksTask = {
      taskType: 'identify_risks',
      data: {
        action: 'outreach',
        data: { channel: 'email' },
        urgent: true,
        validated: false
      }
    };
    const risksResult = await criticAgent.process(risksTask);

    logTest('Scenario 6 - Identify Risks',
      risksResult.success,
      `Risks: ${risksResult.result?.totalRisks}, Overall: ${risksResult.result?.overallRisk}`);

    // Test 19: Suggest alternatives
    const alternativesTask = {
      taskType: 'suggest_alternatives',
      data: {
        type: 'lead_assignment',
        approach: 'direct_assignment'
      },
      options: { maxAlternatives: 3 }
    };
    const alternativesResult = await criticAgent.process(alternativesTask);

    logTest('Scenario 6 - Suggest Alternatives',
      alternativesResult.success && alternativesResult.result?.alternatives,
      `Alternatives: ${alternativesResult.result?.alternatives?.length || 0}`);

    // ================================================================
    // SCENARIO 7: Agent Communication & Reflection
    // ================================================================
    log('\\n📋 SCENARIO 7: Agent Communication & Reflection');
    log('=' .repeat(60));

    // Test 20: Agent communication
    const commResult = await discoveryAgent.communicate(
      validationAgent.agentId,
      { request: 'validate_findings', data: { patterns: 5 } },
      'REQUEST'
    );

    logTest('Scenario 7 - Agent Communication',
      commResult.sent,
      `Message ID: ${commResult.messageId}`);

    // Test 21: Receive messages
    const messages = await validationAgent.receiveMessages(false);
    logTest('Scenario 7 - Receive Messages',
      messages.length >= 1,
      `${messages.length} messages received`);

    // Test 22: Acknowledge message
    if (messages.length > 0) {
      const ackResult = await validationAgent.acknowledgeMessage(messages[0].messageId);
      logTest('Scenario 7 - Acknowledge Message',
        ackResult && ackResult.acknowledged,
        'Message acknowledged');
    } else {
      logTest('Scenario 7 - Acknowledge Message', false, 'No messages to acknowledge');
    }

    // Test 23: Agent reflection
    const reflectionResult = await discoveryAgent.reflect(
      { id: 'decision-001', type: 'pattern_discovery', action: 'identified_5_patterns' },
      { success: true, patternsFound: 5 }
    );

    logTest('Scenario 7 - Agent Reflection',
      reflectionResult.reflectionId && reflectionResult.analysis,
      `Reflection ID: ${reflectionResult.reflectionId}`);

    // ================================================================
    // CLEANUP
    // ================================================================
    await cleanup();

    // Close services
    await registry.close();
    await baseAgent.close();
    await discoveryAgent.close();
    await validationAgent.close();
    await criticAgent.close();

    // ================================================================
    // FINAL RESULTS
    // ================================================================
    console.log('\\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  CHECKPOINT 1 RESULTS                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\\n');

    console.log(`Total Tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Pass Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\\n`);

    if (failed === 0) {
      console.log('🎉 ALL CHECKPOINT 1 TESTS PASSED!\\n');
      console.log('✅ Foundation validated:');
      console.log('   - Database schema (6 tables, 3 views, 3 functions)');
      console.log('   - Agent Registry Service');
      console.log('   - Base Agent implementation');
      console.log('   - Discovery Agent');
      console.log('   - Validation Agent');
      console.log('   - Critic Agent');
      console.log('   - Agent communication');
      console.log('   - Agent reflection\\n');
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
    console.error('\\n❌ Checkpoint 1 failed with error:', error.message);
    console.error(error.stack);
    await cleanup();
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkpoint1();
