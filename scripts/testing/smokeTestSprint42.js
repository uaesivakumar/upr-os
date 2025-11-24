#!/usr/bin/env node
/**
 * SMOKE TEST: Sprint 42 - Multi-Agent System
 *
 * Validates entire Sprint 42 implementation by running all checkpoints
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('\n' + '='.repeat(80));
console.log('SMOKE TEST: SPRINT 42 - MULTI-AGENT SYSTEM');
console.log('='.repeat(80) + '\n');

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://upr_app:SZgIpBmgAH8EoIfOtD/uNADpmUTgtMKYpOzaxqAt5VU=@34.121.0.240:5432/upr_production?sslmode=disable";

/**
 * Run a checkpoint test
 */
function runCheckpoint(checkpointFile, checkpointName) {
  return new Promise((resolve, reject) => {
    console.log(`Running ${checkpointName}...`);
    console.log('-'.repeat(80));

    const scriptPath = path.join(__dirname, checkpointFile);
    const child = spawn('node', [scriptPath], {
      env: { ...process.env, DATABASE_URL },
      stdio: 'pipe'
    });

    let output = '';
    let passed = false;

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);

      if (text.includes('CHECKPOINT') && text.includes('PASSED')) {
        passed = true;
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      if (code === 0 && passed) {
        console.log(`\n✅ ${checkpointName} PASSED\n`);
        resolve(true);
      } else {
        console.log(`\n❌ ${checkpointName} FAILED (exit code: ${code})\n`);
        reject(new Error(`${checkpointName} failed`));
      }
    });

    child.on('error', (error) => {
      console.error(`\n❌ Error running ${checkpointName}:`, error.message);
      reject(error);
    });
  });
}

/**
 * Run all checkpoints
 */
async function runAllCheckpoints() {
  try {
    // CHECKPOINT 1: Infrastructure
    await runCheckpoint('checkpoint1Sprint42.js', 'CHECKPOINT 1: Agent Infrastructure');

    // CHECKPOINT 2: Specialized Agents
    await runCheckpoint('checkpoint2Sprint42.js', 'CHECKPOINT 2: Specialized Agents');

    // CHECKPOINT 3: End-to-End Workflow
    await runCheckpoint('checkpoint3Sprint42.js', 'CHECKPOINT 3: End-to-End Workflow');

    // All passed
    console.log('='.repeat(80));
    console.log('SMOKE TEST RESULTS');
    console.log('='.repeat(80));
    console.log('✅ ✅ ✅ ALL CHECKPOINTS PASSED ✅ ✅ ✅');
    console.log('\nSprint 42: Multi-Agent System is fully operational!\n');
    console.log('Features validated:');
    console.log('  ✓ Agent communication protocol');
    console.log('  ✓ Agent coordinator service');
    console.log('  ✓ Discovery agent (pattern analysis)');
    console.log('  ✓ Validation agent (data verification)');
    console.log('  ✓ Critic agent (quality evaluation)');
    console.log('  ✓ Consensus mechanism');
    console.log('  ✓ Message and decision logging');
    console.log('  ✓ Agent health monitoring');
    console.log('  ✓ End-to-end multi-agent workflows\n');

    process.exit(0);
  } catch (error) {
    console.log('='.repeat(80));
    console.log('SMOKE TEST RESULTS');
    console.log('='.repeat(80));
    console.log('❌ SMOKE TEST FAILED');
    console.log(`\nError: ${error.message}\n`);
    process.exit(1);
  }
}

// Run smoke test
runAllCheckpoints();
