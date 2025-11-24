#!/usr/bin/env node
/**
 * CHECKPOINT 1: Test Agent Infrastructure
 * Sprint 42: Multi-Agent System
 *
 * Tests:
 * 1. Agent Protocol - Message creation and validation
 * 2. Agent Coordinator - Registration and routing
 * 3. Database Tables - Schema verification
 * 4. Message Persistence - Database writes
 */

const { AgentProtocol, AgentMessage, MessageType, ActionType } = require('../../server/agents/AgentProtocol');
const agentCoordinator = require('../../server/services/agentCoordinator');
const pool = require('../../server/config/database');

console.log('\n' + '='.repeat(80));
console.log('CHECKPOINT 1: AGENT INFRASTRUCTURE TEST');
console.log('='.repeat(80) + '\n');

let testsPassed = 0;
let testsFailed = 0;

/**
 * Test 1: Agent Protocol - Message Creation
 */
async function test1_MessageCreation() {
  console.log('Test 1: Agent Protocol - Message Creation');
  console.log('-'.repeat(80));

  try {
    // Create REQUEST message
    const request = AgentProtocol.createRequest({
      from: 'test-agent-1',
      to: 'test-agent-2',
      action: ActionType.ANALYZE,
      data: { test: 'data' },
      context: { testContext: true }
    });

    if (!request.messageId || !request.correlationId) {
      throw new Error('Message missing required IDs');
    }

    if (request.type !== MessageType.REQUEST) {
      throw new Error(`Wrong message type: ${request.type}`);
    }

    console.log('✅ REQUEST message created successfully');
    console.log(`   Message ID: ${request.messageId}`);
    console.log(`   Correlation ID: ${request.correlationId}`);

    // Create RESPONSE message
    const response = AgentProtocol.createResponse({
      from: 'test-agent-2',
      to: 'test-agent-1',
      action: ActionType.ANALYZE,
      data: { result: 'success' },
      context: {},
      correlationId: request.correlationId
    });

    if (response.correlationId !== request.correlationId) {
      throw new Error('Correlation ID mismatch');
    }

    console.log('✅ RESPONSE message created successfully');
    console.log(`   Linked to request: ${response.correlationId}\n`);

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 1 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Test 2: Agent Protocol - Message Validation
 */
async function test2_MessageValidation() {
  console.log('Test 2: Agent Protocol - Message Validation');
  console.log('-'.repeat(80));

  try {
    // Valid message
    const validMessage = AgentProtocol.createRequest({
      from: 'agent-1',
      to: 'agent-2',
      action: ActionType.VALIDATE,
      data: {}
    });

    const validResult = AgentProtocol.validate(validMessage);
    if (!validResult.valid) {
      throw new Error(`Valid message failed validation: ${validResult.errors.join(', ')}`);
    }

    console.log('✅ Valid message passed validation');

    // Invalid message (missing required fields)
    const invalidMessage = new AgentMessage({
      type: 'INVALID_TYPE',
      from: 'agent-1',
      to: 'agent-2',
      payload: {}
    });

    const invalidResult = AgentProtocol.validate(invalidMessage);
    if (invalidResult.valid) {
      throw new Error('Invalid message passed validation');
    }

    console.log('✅ Invalid message correctly rejected');
    console.log(`   Errors: ${invalidResult.errors.join(', ')}\n`);

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 2 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Test 3: Database Tables - Schema Verification
 */
async function test3_DatabaseTables() {
  console.log('Test 3: Database Tables - Schema Verification');
  console.log('-'.repeat(80));

  try {
    // Check agent_messages table
    const messagesResult = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'agent_core'
       AND table_name = 'agent_messages'
       ORDER BY ordinal_position`
    );

    if (messagesResult.rows.length === 0) {
      throw new Error('agent_messages table not found');
    }

    console.log('✅ agent_messages table exists');
    console.log(`   Columns: ${messagesResult.rows.length}`);

    // Check agent_performance table
    const performanceResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM information_schema.tables
       WHERE table_schema = 'agent_core'
       AND table_name = 'agent_performance'`
    );

    if (performanceResult.rows[0].count === '0') {
      throw new Error('agent_performance table not found');
    }

    console.log('✅ agent_performance table exists');

    // Check consensus_votes table
    const votesResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM information_schema.tables
       WHERE table_schema = 'agent_core'
       AND table_name = 'consensus_votes'`
    );

    if (votesResult.rows[0].count === '0') {
      throw new Error('consensus_votes table not found');
    }

    console.log('✅ consensus_votes table exists');

    // Check new agent_decisions columns
    const decisionsResult = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'agent_core'
       AND table_name = 'agent_decisions'
       AND column_name IN ('agent_id', 'agent_type', 'parent_decision_id', 'consensus_score')`
    );

    if (decisionsResult.rows.length !== 4) {
      throw new Error(`Missing columns in agent_decisions. Found ${decisionsResult.rows.length}/4`);
    }

    console.log('✅ agent_decisions table has new columns');
    console.log(`   New columns: agent_id, agent_type, parent_decision_id, consensus_score\n`);

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 3 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Test 4: Message Persistence - Database Writes
 */
async function test4_MessagePersistence() {
  console.log('Test 4: Message Persistence - Database Writes');
  console.log('-'.repeat(80));

  const testMessageId = '00000000-0000-4000-8000-000000000042';
  const testCorrelationId = '00000000-0000-4000-8000-000000000043';

  try {
    // Insert test message
    await pool.query(
      `INSERT INTO agent_core.agent_messages
       (message_id, correlation_id, from_agent, to_agent, message_type, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        testMessageId,
        testCorrelationId,
        'test-agent-1',
        'test-agent-2',
        'REQUEST',
        JSON.stringify({ action: 'TEST', data: {}, context: {} })
      ]
    );

    console.log('✅ Message inserted successfully');

    // Retrieve test message
    const result = await pool.query(
      `SELECT * FROM agent_core.agent_messages WHERE message_id = $1`,
      [testMessageId]
    );

    if (result.rows.length === 0) {
      throw new Error('Inserted message not found');
    }

    const message = result.rows[0];
    if (message.from_agent !== 'test-agent-1') {
      throw new Error('Message data mismatch');
    }

    console.log('✅ Message retrieved successfully');
    console.log(`   From: ${message.from_agent} → To: ${message.to_agent}`);

    // Cleanup test data
    await pool.query(
      `DELETE FROM agent_core.agent_messages WHERE message_id = $1`,
      [testMessageId]
    );

    console.log('✅ Test data cleaned up\n');

    testsPassed++;
    return true;
  } catch (error) {
    // Try to cleanup even if test failed
    try {
      await pool.query(
        `DELETE FROM agent_core.agent_messages WHERE message_id = $1`,
        [testMessageId]
      );
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    console.error('❌ Test 4 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Test 5: Agent Coordinator - Basic Operations
 */
async function test5_AgentCoordinator() {
  console.log('Test 5: Agent Coordinator - Basic Operations');
  console.log('-'.repeat(80));

  try {
    // Check coordinator is available
    if (!agentCoordinator) {
      throw new Error('Agent coordinator not available');
    }

    console.log('✅ Agent coordinator loaded');

    // Check coordinator methods
    const methods = ['registerAgent', 'unregisterAgent', 'sendMessage', 'requestConsensus'];
    for (const method of methods) {
      if (typeof agentCoordinator[method] !== 'function') {
        throw new Error(`Missing method: ${method}`);
      }
    }

    console.log('✅ All coordinator methods available');
    console.log(`   Methods: ${methods.join(', ')}\n`);

    testsPassed++;
    return true;
  } catch (error) {
    console.error('❌ Test 5 Failed:', error.message + '\n');
    testsFailed++;
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('Starting infrastructure tests...\n');

  await test1_MessageCreation();
  await test2_MessageValidation();
  await test3_DatabaseTables();
  await test4_MessagePersistence();
  await test5_AgentCoordinator();

  // Results
  console.log('='.repeat(80));
  console.log('TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Tests Passed: ${testsPassed}/5`);
  console.log(`Tests Failed: ${testsFailed}/5`);

  if (testsFailed === 0) {
    console.log('\n✅ ✅ ✅ CHECKPOINT 1 PASSED ✅ ✅ ✅');
    console.log('Agent infrastructure is ready for implementation!\n');
  } else {
    console.log('\n❌ CHECKPOINT 1 FAILED');
    console.log('Fix errors before proceeding to agent implementation.\n');
    process.exit(1);
  }

  // Cleanup
  await pool.end();
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
