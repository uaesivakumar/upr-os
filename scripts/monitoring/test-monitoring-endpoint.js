#!/usr/bin/env node
/**
 * Test Monitoring Endpoint - Sprint 28
 *
 * Tests the /api/monitoring/check-rule-performance endpoint
 * locally before deploying to Cloud Scheduler
 *
 * Usage:
 *   node scripts/monitoring/test-monitoring-endpoint.js [--production]
 */

const fetch = require('node-fetch');

async function testMonitoringEndpoint(isProduction = false) {
  const baseUrl = isProduction
    ? 'https://upr-web-service-191599223867.us-central1.run.app'
    : 'http://localhost:8080';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('Testing Monitoring Endpoint');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Environment: ${isProduction ? 'PRODUCTION' : 'LOCAL'}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Endpoint: /api/monitoring/check-rule-performance\n`);

  try {
    console.log('📋 Test 1: Health Check\n');

    const healthResponse = await fetch(`${baseUrl}/api/monitoring/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const healthData = await healthResponse.json();
    console.log('Status:', healthResponse.status);
    console.log('Response:', JSON.stringify(healthData, null, 2));

    if (healthResponse.ok && healthData.status === 'healthy') {
      console.log('✅ Health check passed\n');
    } else {
      console.log('❌ Health check failed\n');
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('📋 Test 2: Rule Performance Check\n');

    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/api/monitoring/check-rule-performance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: 'test-script',
        triggered_at: new Date().toISOString()
      })
    });

    const responseData = await response.json();
    const duration = Date.now() - startTime;

    console.log('Status:', response.status);
    console.log('Duration:', `${duration}ms`);
    console.log('Response:', JSON.stringify(responseData, null, 2));

    if (response.ok) {
      console.log('\n✅ Endpoint test passed');
      console.log('\nSummary:');
      console.log(`  Success: ${responseData.success}`);
      console.log(`  Alerts Triggered: ${responseData.summary?.alerts_triggered || 'unknown'}`);
      console.log(`  Critical Count: ${responseData.summary?.critical_count || 0}`);
      console.log(`  Warning Count: ${responseData.summary?.warning_count || 0}`);

      if (responseData.output) {
        console.log('\n📊 Monitoring Script Output:\n');
        console.log(responseData.output);
      }
    } else {
      console.log('\n❌ Endpoint test failed');
      console.log('Error:', responseData.error || 'Unknown error');

      if (responseData.output) {
        console.log('\n📊 Partial Output:\n');
        console.log(responseData.output);
      }

      if (responseData.errors) {
        console.log('\n❌ Errors:\n');
        console.log(responseData.errors);
      }

      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Test failed with exception:', error.message);
    console.error(error);
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ All Tests Passed!');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Parse command-line arguments
const isProduction = process.argv.includes('--production');

// Run test
testMonitoringEndpoint(isProduction);
