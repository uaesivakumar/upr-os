/**
 * Test script for OutreachChannelTool
 * Run: node server/siva-tools/test-outreach-channel.js
 */

const OutreachChannelTool = require('./OutreachChannelToolStandalone');

async function runTests() {
  const tool = new OutreachChannelTool();

  console.log('='.repeat(80));
  console.log('OUTREACH CHANNEL TOOL - TEST SUITE');
  console.log('='.repeat(80));
  console.log('');

  // Test Case 1: High deliverability STRATEGIC contact
  console.log('TEST CASE 1: High Deliverability STRATEGIC Contact');
  console.log('-'.repeat(80));
  try {
    const result1 = await tool.execute({
      contact_tier: 'STRATEGIC',
      email_deliverability: 0.95,
      has_linkedin_profile: true,
      company_size: 150,
      industry: 'FinTech'
    });

    console.log('✅ Input: STRATEGIC tier, 0.95 deliverability');
    console.log(`✅ Primary channel: ${result1.primary_channel}`);
    console.log(`✅ Fallback channel: ${result1.fallback_channel}`);
    console.log(`✅ Priority: ${result1.priority}`);
    console.log(`✅ Confidence: ${result1.confidence} (${result1.metadata.confidenceLevel})`);
    console.log(`✅ Latency: ${result1._meta.latency_ms}ms`);
  } catch (error) {
    console.error('❌ Test Case 1 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 2: Low deliverability contact
  console.log('TEST CASE 2: Low Deliverability Contact');
  console.log('-'.repeat(80));
  try {
    const result2 = await tool.execute({
      contact_tier: 'PRIMARY',
      email_deliverability: 0.55,
      has_linkedin_profile: true,
      company_size: 50
    });

    console.log('✅ Input: PRIMARY tier, 0.55 deliverability (LOW)');
    console.log(`✅ Primary channel: ${result2.primary_channel}`);
    console.log(`✅ Confidence: ${result2.confidence} (${result2.metadata.confidenceLevel})`);
    console.log(`✅ Latency: ${result2._meta.latency_ms}ms`);
    console.log('⚠️ Note: v1.0 always returns EMAIL; v2.0 will use LinkedIn for low deliverability');
  } catch (error) {
    console.error('❌ Test Case 2 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 3: Medium deliverability
  console.log('TEST CASE 3: Medium Deliverability');
  console.log('-'.repeat(80));
  try {
    const result3 = await tool.execute({
      contact_tier: 'SECONDARY',
      email_deliverability: 0.75,
      has_linkedin_profile: false,
      company_size: 200
    });

    console.log('✅ Input: SECONDARY tier, 0.75 deliverability');
    console.log(`✅ Primary channel: ${result3.primary_channel}`);
    console.log(`✅ Confidence: ${result3.confidence} (${result3.metadata.confidenceLevel})`);
    console.log(`✅ Latency: ${result3._meta.latency_ms}ms`);
  } catch (error) {
    console.error('❌ Test Case 3 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 4: Perfect deliverability
  console.log('TEST CASE 4: Perfect Deliverability');
  console.log('-'.repeat(80));
  try {
    const result4 = await tool.execute({
      contact_tier: 'STRATEGIC',
      email_deliverability: 1.0,
      has_linkedin_profile: true,
      company_size: 100
    });

    console.log('✅ Input: STRATEGIC tier, 1.0 deliverability (PERFECT)');
    console.log(`✅ Primary channel: ${result4.primary_channel}`);
    console.log(`✅ Confidence: ${result4.confidence} (${result4.metadata.confidenceLevel})`);
    console.log(`✅ Latency: ${result4._meta.latency_ms}ms`);
  } catch (error) {
    console.error('❌ Test Case 4 FAILED:', error.message);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('TEST SUITE COMPLETE');
  console.log('='.repeat(80));
  console.log('');
  console.log('v1.0 Behavior: Always EMAIL primary channel');
  console.log('v2.0 Coming: LinkedIn primary for low deliverability/large companies');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
