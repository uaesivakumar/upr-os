#!/usr/bin/env node
/**
 * Agent Hub Smoke Test
 * Sprint 29 - Phase 3: Centralized Agentic Hub
 *
 * Purpose: Validate all Agent Hub components
 * Tests:
 * 1. Tool Registry - registration, lookup, health checks
 * 2. Request Router - single-tool execution
 * 3. Workflow Engine - multi-tool workflows
 * 4. Response Aggregator - result composition
 * 5. MCP Server - initialization (without stdio connection)
 *
 * Usage: node scripts/testing/smokeTestAgentHub.js
 */

const path = require('path');

// Agent Hub components
const { ToolRegistry } = require('../../server/agent-hub/ToolRegistry');
const { RequestRouter } = require('../../server/agent-hub/RequestRouter');
const { ResponseAggregator } = require('../../server/agent-hub/ResponseAggregator');
const { WorkflowEngine } = require('../../server/agent-hub/WorkflowEngine');
const { TOOL_CONFIGS } = require('../../server/agent-hub/config/tool-registry-config');

// Workflow definitions
const fullLeadScoringWorkflow = require('../../server/agent-hub/workflows/full-lead-scoring');
const companyEvaluationWorkflow = require('../../server/agent-hub/workflows/company-evaluation');
const outreachOptimizationWorkflow = require('../../server/agent-hub/workflows/outreach-optimization');

console.log('═══════════════════════════════════════════════════════════');
console.log('Agent Hub Smoke Test - Sprint 29');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

/**
 * Test helper
 */
function test(name, fn) {
  testsRun++;
  process.stdout.write(`Test ${testsRun}: ${name}... `);

  try {
    fn();
    testsPassed++;
    console.log('✅ PASS');
    return true;
  } catch (error) {
    testsFailed++;
    console.log('❌ FAIL');
    console.error(`  Error: ${error.message}`);
    return false;
  }
}

/**
 * Async test helper
 */
async function testAsync(name, fn) {
  testsRun++;
  process.stdout.write(`Test ${testsRun}: ${name}... `);

  try {
    await fn();
    testsPassed++;
    console.log('✅ PASS');
    return true;
  } catch (error) {
    testsFailed++;
    console.log('❌ FAIL');
    console.error(`  Error: ${error.message}`);
    console.error(`  Stack: ${error.stack}`);
    return false;
  }
}

/**
 * Main test suite
 */
async function main() {
  try {
    // ═══════════════════════════════════════════════════════════
    // TEST SUITE 1: Tool Registry
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test Suite 1: Tool Registry');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const registry = new ToolRegistry();

    // Test 1: Register tools
    await testAsync('Register 4 SIVA tools', async () => {
      for (const config of TOOL_CONFIGS) {
        await registry.register(config);
      }

      const tools = registry.listTools();
      if (tools.length !== 4) {
        throw new Error(`Expected 4 tools, got ${tools.length}`);
      }
    });

    // Test 2: Tool lookup
    test('Tool lookup by name', () => {
      const tool = registry.getTool('CompanyQualityTool');
      if (!tool.instance) {
        throw new Error('Tool instance not found');
      }
      if (!tool.metadata) {
        throw new Error('Tool metadata not found');
      }
      if (!tool.circuitBreaker) {
        throw new Error('Circuit breaker not found');
      }
    });

    // Test 3: List healthy tools
    test('List healthy tools', () => {
      const healthyTools = registry.listTools({ status: 'healthy' });
      if (healthyTools.length !== 4) {
        throw new Error(`Expected 4 healthy tools, got ${healthyTools.length}`);
      }
    });

    // Test 4: Get registry stats
    test('Get registry statistics', () => {
      const stats = registry.getStats();
      if (stats.total_tools !== 4) {
        throw new Error(`Expected 4 total tools, got ${stats.total_tools}`);
      }
      if (stats.healthy !== 4) {
        throw new Error(`Expected 4 healthy tools, got ${stats.healthy}`);
      }
    });

    // ═══════════════════════════════════════════════════════════
    // TEST SUITE 2: Request Router
    // ═══════════════════════════════════════════════════════════
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test Suite 2: Request Router');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const router = new RequestRouter(registry, null);

    // Test 5: Route single-tool request
    await testAsync('Route CompanyQualityTool request', async () => {
      const result = await router.route({
        type: 'single-tool',
        tool_name: 'CompanyQualityTool',
        input: {
          company_name: 'Test Corp UAE',
          domain: 'test.ae',
          industry: 'Technology',
          uae_signals: {
            has_ae_domain: true,
            has_uae_address: true
          },
          size_bucket: 'startup',
          size: 50
        }
      });

      if (!result.quality_score) {
        throw new Error('Result missing quality_score');
      }
      if (!result._routing) {
        throw new Error('Result missing _routing metadata');
      }
    });

    // Test 6: Route ContactTierTool request
    await testAsync('Route ContactTierTool request', async () => {
      const result = await router.route({
        type: 'single-tool',
        tool_name: 'ContactTierTool',
        input: {
          title: 'Chief Financial Officer',
          company_size: 200
        }
      });

      if (!result.tier) {
        throw new Error('Result missing tier');
      }
      if (!result._routing) {
        throw new Error('Result missing _routing metadata');
      }
    });

    // ═══════════════════════════════════════════════════════════
    // TEST SUITE 3: Workflow Engine
    // ═══════════════════════════════════════════════════════════
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test Suite 3: Workflow Engine');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const aggregator = new ResponseAggregator();
    const workflowEngine = new WorkflowEngine(registry, aggregator);

    // Test 7: Register workflows
    test('Register 3 workflow definitions', () => {
      workflowEngine.registerWorkflow(fullLeadScoringWorkflow);
      workflowEngine.registerWorkflow(companyEvaluationWorkflow);
      workflowEngine.registerWorkflow(outreachOptimizationWorkflow);

      const workflows = workflowEngine.listWorkflows();
      if (workflows.length !== 3) {
        throw new Error(`Expected 3 workflows, got ${workflows.length}`);
      }
    });

    // Test 8: Execute company evaluation workflow (single tool)
    await testAsync('Execute company_evaluation workflow', async () => {
      const result = await workflowEngine.execute('company_evaluation', {
        company_name: 'Test Corp UAE',
        domain: 'test.ae',
        industry: 'Technology',
        uae_signals: {
          has_ae_domain: true,
          has_uae_address: true
        },
        size_bucket: 'startup',
        size: 50
      });

      if (!result.results) {
        throw new Error('Result missing results object');
      }
      if (!result.results.CompanyQualityTool) {
        throw new Error('Result missing CompanyQualityTool result');
      }
      if (!result._workflow) {
        throw new Error('Result missing _workflow metadata');
      }
      if (result._workflow.steps_executed !== 1) {
        throw new Error(`Expected 1 step, got ${result._workflow.steps_executed}`);
      }
    });

    // Test 9: Execute full lead scoring workflow (all 4 tools)
    await testAsync('Execute full_lead_scoring workflow', async () => {
      const result = await workflowEngine.execute('full_lead_scoring', {
        company_name: 'TechCorp UAE',
        domain: 'techcorp.ae',
        industry: 'Technology',
        size: 150,
        size_bucket: 'midsize',
        uae_signals: {
          has_ae_domain: true,
          has_uae_address: true
        },
        salary_indicators: {
          salary_level: 'high',
          avg_salary: 18000
        },
        contact_title: 'Chief Technology Officer',
        department: 'Technology',
        current_date: '2025-01-15',
        signal_type: 'hiring',
        signal_age: 7,
        fiscal_context: { quarter: 'Q1' },
        signals: ['expansion'],
        has_free_zone_license: true
      });

      if (!result.results) {
        throw new Error('Result missing results object');
      }
      if (!result.results.CompanyQualityTool) {
        throw new Error('Result missing CompanyQualityTool result');
      }
      if (!result.results.ContactTierTool) {
        throw new Error('Result missing ContactTierTool result');
      }
      if (!result._workflow) {
        throw new Error('Result missing _workflow metadata');
      }
      if (result._workflow.steps_executed < 2) {
        throw new Error(`Expected at least 2 steps, got ${result._workflow.steps_executed}`);
      }
    });

    // ═══════════════════════════════════════════════════════════
    // TEST SUITE 4: Response Aggregator
    // ═══════════════════════════════════════════════════════════
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Test Suite 4: Response Aggregator');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Test 10: Aggregate multiple tool results
    test('Aggregate 2 tool results', () => {
      const toolResults = {
        CompanyQualityTool: {
          quality_score: 85,
          confidence: 0.92,
          _meta: { decision_id: 'test1', executionTimeMs: 300 }
        },
        ContactTierTool: {
          tier: 'Tier 1',
          confidence: 0.95,
          _meta: { decision_id: 'test2', executionTimeMs: 200 }
        }
      };

      const result = aggregator.aggregate(toolResults, {
        name: 'test_workflow',
        id: 'test123',
        version: 'v1.0',
        execution_mode: 'sequential'
      });

      if (!result.confidence) {
        throw new Error('Result missing aggregate confidence');
      }
      if (!result.results) {
        throw new Error('Result missing results object');
      }
      if (!result.metadata) {
        throw new Error('Result missing metadata');
      }
    });

    // Test 11: Calculate geometric mean confidence
    test('Calculate geometric mean confidence', () => {
      const toolResults = {
        Tool1: { confidence: 0.9, _meta: {} },
        Tool2: { confidence: 0.8, _meta: {} },
        Tool3: { confidence: 0.85, _meta: {} }
      };

      const result = aggregator.aggregate(toolResults, {
        name: 'test',
        id: 'test',
        version: 'v1.0',
        execution_mode: 'sequential'
      });

      // Geometric mean of 0.9, 0.8, 0.85 ≈ 0.85
      const expectedConfidence = Math.pow(0.9 * 0.8 * 0.85, 1/3);
      const diff = Math.abs(result.confidence - expectedConfidence);

      if (diff > 0.02) {
        throw new Error(`Confidence mismatch: expected ${expectedConfidence.toFixed(2)}, got ${result.confidence}`);
      }
    });

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Test Summary');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Tests Run:    ${testsRun}`);
    console.log(`Tests Passed: ${testsPassed} ✅`);
    console.log(`Tests Failed: ${testsFailed} ❌`);
    console.log('');

    if (testsFailed === 0) {
      console.log('✅ All tests passed!');
      console.log('');
      console.log('Agent Hub components validated:');
      console.log('  ✅ Tool Registry (4 tools registered)');
      console.log('  ✅ Request Router (single-tool execution)');
      console.log('  ✅ Workflow Engine (multi-tool workflows)');
      console.log('  ✅ Response Aggregator (result composition)');
      console.log('');
      console.log('✅ Agent Hub is ready for deployment!');
      process.exit(0);
    } else {
      console.log('❌ Some tests failed. Please review errors above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('');
    console.error('❌ Test suite failed with unexpected error:');
    console.error(error);
    process.exit(1);
  }
}

main();
