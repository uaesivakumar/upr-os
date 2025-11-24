#!/usr/bin/env node
/**
 * CHECKPOINT 3: End-to-End Multi-Agent Workflow
 * Sprint 42: Multi-Agent System
 *
 * This test simulates a real-world scenario where all three agents
 * collaborate to analyze historical data, validate findings, critique
 * the analysis, and reach consensus on a decision.
 *
 * Workflow:
 * 1. Discovery Agent analyzes historical agent decisions
 * 2. Validation Agent verifies the discovered patterns
 * 3. Critic Agent evaluates the quality of the analysis
 * 4. All agents participate in consensus for final decision
 * 5. Results are logged and can be queried
 */

const DiscoveryAgent = require('../../server/agents/adapters/DiscoveryAgentAdapter');
const ValidationAgent = require('../../server/agents/adapters/ValidationAgentAdapter');
const CriticAgent = require('../../server/agents/adapters/CriticAgentAdapter');
const agentCoordinator = require('../../server/services/agentCoordinator');
const AgentDecisionLogger = require('../../server/services/agentDecisionLogger');
const { AgentProtocol, ActionType } = require('../../server/agents/AgentProtocol');
const pool = require('../../server/config/database');

console.log('\n' + '='.repeat(80));
console.log('CHECKPOINT 3: END-TO-END MULTI-AGENT WORKFLOW');
console.log('='.repeat(80) + '\n');

let testsPassed = 0;
let testsFailed = 0;

// Test agents
let discoveryAgent, validationAgent, criticAgent;

/**
 * Setup: Initialize and register all agents
 */
async function setup() {
  console.log('Setting up agents...\n');

  // Create and initialize agents
  discoveryAgent = new DiscoveryAgent();
  validationAgent = new ValidationAgent();
  criticAgent = new CriticAgent();

  await discoveryAgent.initialize();
  await validationAgent.initialize();
  await criticAgent.initialize();

  // Register agents
  agentCoordinator.registerAgent('discovery-agent', discoveryAgent);
  agentCoordinator.registerAgent('validation-agent', validationAgent);
  agentCoordinator.registerAgent('critic-agent', criticAgent);

  console.log('✅ All agents initialized and registered\n');
}

/**
 * Test 1: Discovery Phase - Pattern Analysis
 */
async function test1_DiscoveryPhase() {
  console.log('Test 1: Discovery Phase - Historical Pattern Analysis');
  console.log('-'.repeat(80));

  try {
    // Request pattern discovery
    const request = AgentProtocol.createRequest({
      from: 'coordinator',
      to: 'discovery-agent',
      action: ActionType.ANALYZE,
      data: { timeWindow: '30 days' },
      context: { phase: 'discovery', workflow: 'quality-analysis' }
    });

    await agentCoordinator.sendMessage(request);
    const response = await agentCoordinator.waitForResponse(request.messageId, 10000);

    const patterns = response.payload.data.patterns;
    const hypotheses = response.payload.data.hypotheses;

    console.log('✅ Discovery phase complete');
    console.log(`   Time window: 30 days`);
    console.log(`   Patterns discovered: ${patterns.length}`);
    console.log(`   Hypotheses generated: ${hypotheses.length}`);
    console.log(`   Discovery confidence: ${response.payload.data.confidence}\n`);

    testsPassed++;
    return { patterns, hypotheses, confidence: response.payload.data.confidence };
  } catch (error) {
    console.error('❌ Test 1 Failed:', error.message + '\n');
    testsFailed++;
    return null;
  }
}

/**
 * Test 2: Validation Phase - Verify Discoveries
 */
async function test2_ValidationPhase(discoveryResults) {
  console.log('Test 2: Validation Phase - Verify Discovery Findings');
  console.log('-'.repeat(80));

  try {
    if (!discoveryResults) {
      throw new Error('No discovery results to validate');
    }

    // Request validation of discovered patterns
    const request = AgentProtocol.createRequest({
      from: 'coordinator',
      to: 'validation-agent',
      action: ActionType.VALIDATE,
      data: {
        dataToValidate: {
          patterns: discoveryResults.patterns,
          confidence_score: discoveryResults.confidence
        },
        rules: { minPatterns: 0, minConfidence: 0.3 }
      },
      context: { phase: 'validation', workflow: 'quality-analysis' }
    });

    await agentCoordinator.sendMessage(request);
    const response = await agentCoordinator.waitForResponse(request.messageId, 10000);

    const validation = response.payload.data;

    console.log('✅ Validation phase complete');
    console.log(`   Valid: ${validation.valid}`);
    console.log(`   Issues found: ${validation.issues.length}`);
    console.log(`   Warnings: ${validation.warnings.length}`);
    console.log(`   Validation confidence: ${validation.confidence}\n`);

    testsPassed++;
    return validation;
  } catch (error) {
    console.error('❌ Test 2 Failed:', error.message + '\n');
    testsFailed++;
    return null;
  }
}

/**
 * Test 3: Critique Phase - Quality Evaluation
 */
async function test3_CritiquePhase(discoveryResults, validationResults) {
  console.log('Test 3: Critique Phase - Quality Assessment');
  console.log('-'.repeat(80));

  try {
    if (!discoveryResults || !validationResults) {
      throw new Error('Missing results for critique');
    }

    // Request critique of the entire analysis
    const request = AgentProtocol.createRequest({
      from: 'coordinator',
      to: 'critic-agent',
      action: ActionType.CRITIQUE,
      data: {
        decision: {
          patterns: discoveryResults.patterns,
          validationResult: validationResults.valid
        },
        reasoning: `Discovered ${discoveryResults.patterns.length} patterns with ${discoveryResults.confidence} confidence. Validation result: ${validationResults.valid}`,
        confidence: Math.min(discoveryResults.confidence, validationResults.confidence)
      },
      context: { phase: 'critique', workflow: 'quality-analysis' }
    });

    await agentCoordinator.sendMessage(request);
    const response = await agentCoordinator.waitForResponse(request.messageId, 10000);

    const critique = response.payload.data.critique;

    console.log('✅ Critique phase complete');
    console.log(`   Overall score: ${critique.overallScore.toFixed(2)}`);
    console.log(`   Strengths: ${critique.strengths.length}`);
    console.log(`   Weaknesses: ${critique.weaknesses.length}`);
    console.log(`   Biases detected: ${critique.biases.length}`);
    console.log(`   Recommendation: ${response.payload.data.recommendation}\n`);

    testsPassed++;
    return {
      critique,
      recommendation: response.payload.data.recommendation
    };
  } catch (error) {
    console.error('❌ Test 3 Failed:', error.message + '\n');
    testsFailed++;
    return null;
  }
}

/**
 * Test 4: Consensus Phase - Collaborative Decision
 */
async function test4_ConsensusPhase(critiqueResults) {
  console.log('Test 4: Consensus Phase - Multi-Agent Decision');
  console.log('-'.repeat(80));

  try {
    if (!critiqueResults) {
      throw new Error('Missing critique results for consensus');
    }

    // Request consensus on the final decision
    const consensus = await agentCoordinator.requestConsensus({
      decision: {
        action: critiqueResults.recommendation,
        confidence: critiqueResults.critique.overallScore
      },
      context: {
        phase: 'consensus',
        workflow: 'quality-analysis',
        critiqueScore: critiqueResults.critique.overallScore
      },
      timeout: 15000
    });

    console.log('✅ Consensus achieved');
    console.log(`   Consensus level: ${consensus.level}`);
    console.log(`   Consensus score: ${consensus.consensusScore}%`);
    console.log(`   Participating agents: ${consensus.votes.length}`);
    console.log(`   Final decision: ${JSON.stringify(consensus.decision)}\n`);

    testsPassed++;
    return consensus;
  } catch (error) {
    console.error('❌ Test 4 Failed:', error.message + '\n');
    testsFailed++;
    return null;
  }
}

/**
 * Test 5: Logging Verification - Check Database Persistence
 */
async function test5_LoggingVerification() {
  console.log('Test 5: Logging Verification - Database Persistence');
  console.log('-'.repeat(80));

  try {
    // Check that messages were logged
    const messageCount = await pool.query(
      `SELECT COUNT(*) as count
       FROM agent_core.agent_messages
       WHERE created_at >= NOW() - INTERVAL '5 minutes'`
    );

    // Check system stats
    const stats = await AgentDecisionLogger.getSystemStats('5 minutes');

    console.log('✅ Logging verification complete');
    console.log(`   Messages logged: ${messageCount.rows[0].count}`);
    console.log(`   Active agents: ${stats.messages.active_senders}`);
    console.log(`   Total requests: ${stats.messages.total_requests}`);
    console.log(`   Total responses: ${stats.messages.total_responses}\n`);

    if (parseInt(messageCount.rows[0].count) === 0) {
      throw new Error('No messages were logged to database');
    }

    testsPassed++;
    return stats;
  } catch (error) {
    console.error('❌ Test 5 Failed:', error.message + '\n');
    testsFailed++;
    return null;
  }
}

/**
 * Test 6: Agent Health Check
 */
async function test6_FinalHealthCheck() {
  console.log('Test 6: Final Agent Health Check');
  console.log('-'.repeat(80));

  try {
    const health = await agentCoordinator.getAgentHealth();

    const allHealthy = health.every(h => h.status === 'healthy');
    if (!allHealthy) {
      const unhealthy = health.filter(h => h.status !== 'healthy');
      throw new Error(`Unhealthy agents after workflow: ${unhealthy.map(h => h.agentId).join(', ')}`);
    }

    console.log('✅ All agents healthy after workflow');
    health.forEach(h => {
      const state = h.agentState;
      console.log(`   ${h.agentId}: ${h.status} (activities: ${state.discoveryCount || state.validationCount || state.critiqueCount})`);
    });
    console.log();

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 6 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Run complete end-to-end workflow
 */
async function runWorkflow() {
  console.log('Starting end-to-end multi-agent workflow...\ n');

  // Setup
  await setup();

  // Execute workflow phases
  const discoveryResults = await test1_DiscoveryPhase();
  const validationResults = await test2_ValidationPhase(discoveryResults);
  const critiqueResults = await test3_CritiquePhase(discoveryResults, validationResults);
  const consensusResults = await test4_ConsensusPhase(critiqueResults);

  // Verify logging and health
  await test5_LoggingVerification();
  await test6_FinalHealthCheck();

  // Results
  console.log('='.repeat(80));
  console.log('TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Tests Passed: ${testsPassed}/6`);
  console.log(`Tests Failed: ${testsFailed}/6`);

  if (testsFailed === 0) {
    console.log('\n✅ ✅ ✅ CHECKPOINT 3 PASSED ✅ ✅ ✅');
    console.log('End-to-end multi-agent workflow successful!');
    console.log('\nWorkflow Summary:');
    console.log(`  - Discovery: ${discoveryResults ? discoveryResults.patterns.length : 0} patterns found`);
    console.log(`  - Validation: ${validationResults ? validationResults.valid ? 'VALID' : 'INVALID' : 'N/A'}`);
    console.log(`  - Critique: ${critiqueResults ? critiqueResults.recommendation : 'N/A'}`);
    console.log(`  - Consensus: ${consensusResults ? consensusResults.level : 'N/A'} (${consensusResults ? consensusResults.consensusScore : 0}%)\n`);
  } else {
    console.log('\n❌ CHECKPOINT 3 FAILED');
    console.log('End-to-end workflow encountered errors.\ n');
    process.exit(1);
  }

  // Cleanup
  await agentCoordinator.shutdown();
  await pool.end();
}

// Run workflow
runWorkflow().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
