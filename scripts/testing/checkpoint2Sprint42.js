#!/usr/bin/env node
/**
 * CHECKPOINT 2: Test Specialized Agents
 * Sprint 42: Multi-Agent System
 *
 * Tests:
 * 1. Discovery Agent - Pattern analysis and hypothesis generation
 * 2. Validation Agent - Data verification and validation
 * 3. Critic Agent - Quality evaluation and critiques
 * 4. Agent Registration - All agents register successfully
 * 5. Inter-Agent Communication - Agents communicate via coordinator
 * 6. Consensus Voting - All agents participate in consensus
 */

const DiscoveryAgent = require('../../server/agents/adapters/DiscoveryAgentAdapter');
const ValidationAgent = require('../../server/agents/adapters/ValidationAgentAdapter');
const CriticAgent = require('../../server/agents/adapters/CriticAgentAdapter');
const agentCoordinator = require('../../server/services/agentCoordinator');
const { AgentProtocol, ActionType } = require('../../server/agents/AgentProtocol');
const pool = require('../../server/config/database');

console.log('\n' + '='.repeat(80));
console.log('CHECKPOINT 2: SPECIALIZED AGENTS TEST');
console.log('='.repeat(80) + '\n');

let testsPassed = 0;
let testsFailed = 0;

// Test agents
let discoveryAgent, validationAgent, criticAgent;

/**
 * Test 1: Initialize All Agents
 */
async function test1_InitializeAgents() {
  console.log('Test 1: Initialize All Agents');
  console.log('-'.repeat(80));

  try {
    // Create agents
    discoveryAgent = new DiscoveryAgent();
    validationAgent = new ValidationAgent();
    criticAgent = new CriticAgent();

    // Initialize agents
    await discoveryAgent.initialize();
    await validationAgent.initialize();
    await criticAgent.initialize();

    console.log('✅ Discovery Agent initialized');
    console.log('✅ Validation Agent initialized');
    console.log('✅ Critic Agent initialized\n');

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 1 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Test 2: Register Agents with Coordinator
 */
async function test2_RegisterAgents() {
  console.log('Test 2: Register Agents with Coordinator');
  console.log('-'.repeat(80));

  try {
    // Register all agents
    agentCoordinator.registerAgent('discovery-agent', discoveryAgent);
    agentCoordinator.registerAgent('validation-agent', validationAgent);
    agentCoordinator.registerAgent('critic-agent', criticAgent);

    const agentCount = agentCoordinator.getAgentCount();
    if (agentCount !== 3) {
      throw new Error(`Expected 3 agents, got ${agentCount}`);
    }

    console.log('✅ All 3 agents registered successfully');
    console.log(`   Total agents: ${agentCount}\n`);

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 2 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Test 3: Discovery Agent - Pattern Analysis
 */
async function test3_DiscoveryAgent() {
  console.log('Test 3: Discovery Agent - Pattern Analysis');
  console.log('-'.repeat(80));

  try {
    // Create analysis request
    const request = AgentProtocol.createRequest({
      from: 'coordinator',
      to: 'discovery-agent',
      action: ActionType.ANALYZE,
      data: { timeWindow: '7 days' },
      context: {}
    });

    // Send message through coordinator
    await agentCoordinator.sendMessage(request);

    // Wait for response
    const response = await agentCoordinator.waitForResponse(request.messageId, 10000);

    if (!response.payload.data.patterns) {
      throw new Error('No patterns returned from Discovery Agent');
    }

    console.log('✅ Discovery Agent analyzed data');
    console.log(`   Patterns found: ${response.payload.data.patterns.length}`);
    console.log(`   Confidence: ${response.payload.data.confidence}\n`);

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 3 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Test 4: Validation Agent - Data Validation
 */
async function test4_ValidationAgent() {
  console.log('Test 4: Validation Agent - Data Validation');
  console.log('-'.repeat(80));

  try {
    // Create validation request
    const request = AgentProtocol.createRequest({
      from: 'coordinator',
      to: 'validation-agent',
      action: ActionType.VALIDATE,
      data: {
        dataToValidate: {
          companyName: 'Test Company',
          confidence_score: 0.85
        }
      },
      context: {}
    });

    // Send message through coordinator
    await agentCoordinator.sendMessage(request);

    // Wait for response
    const response = await agentCoordinator.waitForResponse(request.messageId, 10000);

    if (response.payload.data.valid === undefined) {
      throw new Error('No validation result from Validation Agent');
    }

    console.log('✅ Validation Agent validated data');
    console.log(`   Valid: ${response.payload.data.valid}`);
    console.log(`   Issues: ${response.payload.data.issues.length}`);
    console.log(`   Confidence: ${response.payload.data.confidence}\n`);

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 4 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Test 5: Critic Agent - Quality Evaluation
 */
async function test5_CriticAgent() {
  console.log('Test 5: Critic Agent - Quality Evaluation');
  console.log('-'.repeat(80));

  try {
    // Create critique request
    const request = AgentProtocol.createRequest({
      from: 'coordinator',
      to: 'critic-agent',
      action: ActionType.CRITIQUE,
      data: {
        decision: { result: 'approve' },
        reasoning: 'This decision is based on historical patterns and data validation',
        confidence: 0.8
      },
      context: {}
    });

    // Send message through coordinator
    await agentCoordinator.sendMessage(request);

    // Wait for response
    const response = await agentCoordinator.waitForResponse(request.messageId, 10000);

    if (!response.payload.data.critique) {
      throw new Error('No critique from Critic Agent');
    }

    const critique = response.payload.data.critique;

    console.log('✅ Critic Agent provided critique');
    console.log(`   Overall Score: ${critique.overallScore.toFixed(2)}`);
    console.log(`   Strengths: ${critique.strengths.length}`);
    console.log(`   Weaknesses: ${critique.weaknesses.length}`);
    console.log(`   Recommendation: ${response.payload.data.recommendation}\n`);

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 5 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Test 6: Consensus Mechanism
 */
async function test6_Consensus() {
  console.log('Test 6: Consensus Mechanism');
  console.log('-'.repeat(80));

  try {
    // Request consensus
    const consensus = await agentCoordinator.requestConsensus({
      decision: { action: 'approve', confidence: 0.85 },
      context: { testMode: true },
      timeout: 15000
    });

    if (!consensus || !consensus.decision) {
      throw new Error('Consensus failed');
    }

    console.log('✅ Consensus achieved');
    console.log(`   Consensus Score: ${consensus.consensusScore}%`);
    console.log(`   Level: ${consensus.level}`);
    console.log(`   Votes: ${consensus.votes.length}/3 agents\n`);

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 6 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Test 7: Agent Status Check
 */
async function test7_AgentStatus() {
  console.log('Test 7: Agent Status Check');
  console.log('-'.repeat(80));

  try {
    const health = await agentCoordinator.getAgentHealth();

    if (health.length !== 3) {
      throw new Error(`Expected 3 agents in health check, got ${health.length}`);
    }

    const allHealthy = health.every(h => h.status === 'healthy');
    if (!allHealthy) {
      const unhealthy = health.filter(h => h.status !== 'healthy');
      console.log('Unhealthy agent details:', JSON.stringify(unhealthy, null, 2));
      throw new Error(`Unhealthy agents: ${unhealthy.map(h => h.agentId).join(', ')}`);
    }

    console.log('✅ All agents are healthy');
    health.forEach(h => {
      console.log(`   ${h.agentId}: ${h.status}`);
    });
    console.log();

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 7 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('Starting specialized agent tests...\n');

  await test1_InitializeAgents();
  await test2_RegisterAgents();
  await test3_DiscoveryAgent();
  await test4_ValidationAgent();
  await test5_CriticAgent();
  await test6_Consensus();
  await test7_AgentStatus();

  // Results
  console.log('='.repeat(80));
  console.log('TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Tests Passed: ${testsPassed}/7`);
  console.log(`Tests Failed: ${testsFailed}/7`);

  if (testsFailed === 0) {
    console.log('\n✅ ✅ ✅ CHECKPOINT 2 PASSED ✅ ✅ ✅');
    console.log('All specialized agents are operational!\n');
  } else {
    console.log('\n❌ CHECKPOINT 2 FAILED');
    console.log('Fix errors before proceeding to integration.\n');
    process.exit(1);
  }

  // Cleanup
  await agentCoordinator.shutdown();
  await pool.end();
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
