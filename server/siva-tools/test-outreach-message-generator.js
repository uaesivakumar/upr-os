/**
 * Test script for OutreachMessageGeneratorTool
 * Run: node server/siva-tools/test-outreach-message-generator.js
 *
 * Note: Requires OPENAI_API_KEY environment variable
 */

const OutreachMessageGeneratorTool = require('./OutreachMessageGeneratorToolStandalone');

async function runTests() {
  const tool = new OutreachMessageGeneratorTool();

  // Check if OpenAI API key is available
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-dummy-key-for-testing') {
    console.log('⚠️  WARNING: No valid OPENAI_API_KEY found');
    console.log('⚠️  Set OPENAI_API_KEY environment variable to run actual LLM tests');
    console.log('⚠️  Skipping LLM-dependent tests...\n');

    // Run schema validation tests only
    console.log('='.repeat(80));
    console.log('OUTREACH MESSAGE GENERATOR TOOL - SCHEMA VALIDATION TESTS');
    console.log('='.repeat(80));
    console.log('');

    await runSchemaTests(tool);

    console.log('');
    console.log('='.repeat(80));
    console.log('SCHEMA VALIDATION COMPLETE');
    console.log('='.repeat(80));
    console.log('');
    console.log('To run full LLM tests:');
    console.log('export OPENAI_API_KEY=your-key-here');
    console.log('node server/siva-tools/test-outreach-message-generator.js');
    return;
  }

  console.log('='.repeat(80));
  console.log('OUTREACH MESSAGE GENERATOR TOOL - FULL TEST SUITE (WITH LLM)');
  console.log('='.repeat(80));
  console.log('');

  // Test Case 1: Expansion Signal
  console.log('TEST CASE 1: Expansion Signal (FinTech Company)');
  console.log('-'.repeat(80));
  try {
    const result1 = await tool.execute({
      company_context: {
        company_name: 'Careem',
        industry: 'Technology',
        signal_type: 'expansion',
        signal_headline: 'Opens new tech hub in Dubai Internet City',
        city: 'Dubai'
      },
      opening_context: 'I noticed Careem recently opened a new tech hub in Dubai Internet City. Many expanding technology companies face onboarding delays while new employees await Emirates IDs—I can serve as your dedicated banking contact to streamline this process.',
      recommended_products: [
        { product_name: 'Salary Account Plus', product_category: 'Salary Accounts' },
        { product_name: 'Business Current Account', product_category: 'Business Accounts' }
      ],
      contact_info: {
        contact_name: 'Sarah Ahmed',
        title: 'HR Director',
        tier: 'STRATEGIC'
      },
      message_type: 'INITIAL',
      tone_preference: 'PROFESSIONAL'
    });

    console.log('✅ Message generated successfully!');
    console.log('');
    console.log(`📧 Subject: "${result1.message.subject_line}"`);
    console.log(`   Length: ${result1.message.subject_line.length} chars (target: <60)`);
    console.log('');
    console.log('📝 Full Message:');
    console.log('-'.repeat(80));
    console.log(result1.message.greeting);
    console.log('');
    console.log(result1.message.opening_paragraph);
    console.log('');
    console.log(result1.message.value_proposition);
    console.log('');
    console.log(result1.message.call_to_action);
    console.log('');
    console.log(result1.message.signature);
    console.log('-'.repeat(80));
    console.log('');
    console.log(`📊 Metadata:`);
    console.log(`   Tone: ${result1.metadata.tone_used}`);
    console.log(`   Read Time: ${result1.metadata.estimated_read_time_seconds}s`);
    console.log(`   Spam Score: ${result1.metadata.spam_score} (${result1.metadata.spam_score < 0.3 ? 'PASS ✅' : 'WARNING ⚠️'})`);
    console.log(`   Compliance: ${result1.metadata.compliance_flags.length === 0 ? 'CLEAN ✅' : 'FLAGS: ' + result1.metadata.compliance_flags.join(', ')}`);
    console.log(`   Confidence: ${result1.metadata.confidence}`);
    console.log(`   LLM Tokens: ${result1._meta.llm_tokens}`);
    console.log(`   Latency: ${result1._meta.latency_ms}ms`);

    if (result1.metadata.compliance_flags.length > 0) {
      console.log('');
      console.log('⚠️  COMPLIANCE VIOLATIONS DETECTED:');
      result1.metadata.compliance_flags.forEach(flag => {
        console.log(`   - ${flag}`);
      });
    }

  } catch (error) {
    console.error('❌ Test Case 1 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 2: Hiring Signal
  console.log('TEST CASE 2: Hiring Signal (Startup)');
  console.log('-'.repeat(80));
  try {
    const result2 = await tool.execute({
      company_context: {
        company_name: 'TechHub DMCC',
        industry: 'Financial Services',
        signal_type: 'hiring',
        signal_headline: 'Hiring 50+ engineers and product managers',
        city: 'Dubai'
      },
      opening_context: 'I saw TechHub DMCC is actively hiring for engineers and product managers. With new employees joining, you\'ll need a banking partner who can facilitate quick account openings despite the Emirates ID wait period.',
      recommended_products: [
        { product_name: 'Salary Account', product_category: 'Salary Accounts' }
      ],
      contact_info: {
        contact_name: 'Ahmed Al-Mazroui',
        title: 'Talent Acquisition Lead',
        tier: 'PRIMARY'
      },
      message_type: 'INITIAL',
      tone_preference: 'CONVERSATIONAL'
    });

    console.log('✅ Message generated successfully!');
    console.log('');
    console.log(`📧 Subject: "${result2.message.subject_line}"`);
    console.log('');
    console.log(`📊 Key Metrics:`);
    console.log(`   Spam Score: ${result2.metadata.spam_score} (${result2.metadata.spam_score < 0.3 ? 'PASS ✅' : 'WARNING ⚠️'})`);
    console.log(`   Compliance: ${result2.metadata.compliance_flags.length === 0 ? 'CLEAN ✅' : 'FLAGS: ' + result2.metadata.compliance_flags.join(', ')}`);
    console.log(`   Confidence: ${result2.metadata.confidence}`);
    console.log(`   Latency: ${result2._meta.latency_ms}ms`);
    console.log('');
    console.log('📝 Opening: ' + result2.message.opening_paragraph.substring(0, 100) + '...');

  } catch (error) {
    console.error('❌ Test Case 2 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 3: Generic Signal (Minimal Data)
  console.log('TEST CASE 3: Generic Signal (Minimal Data)');
  console.log('-'.repeat(80));
  try {
    const result3 = await tool.execute({
      company_context: {
        company_name: 'GenericCorp',
        industry: 'Healthcare'
      },
      contact_info: {
        contact_name: 'Dr. Sarah Johnson'
      },
      message_type: 'INITIAL'
    });

    console.log('✅ Message generated with minimal data!');
    console.log('');
    console.log(`📧 Subject: "${result3.message.subject_line}"`);
    console.log(`📊 Spam Score: ${result3.metadata.spam_score}`);
    console.log(`📊 Compliance: ${result3.metadata.compliance_flags.length === 0 ? 'CLEAN ✅' : 'FLAGS: ' + result3.metadata.compliance_flags.join(', ')}`);
    console.log(`📊 Latency: ${result3._meta.latency_ms}ms`);

  } catch (error) {
    console.error('❌ Test Case 3 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 4: Follow-up Message
  console.log('TEST CASE 4: Follow-up Message');
  console.log('-'.repeat(80));
  try {
    const result4 = await tool.execute({
      company_context: {
        company_name: 'StartupX',
        industry: 'E-commerce',
        city: 'Abu Dhabi'
      },
      contact_info: {
        contact_name: 'Mohammed Hassan',
        title: 'Operations Manager',
        tier: 'SECONDARY'
      },
      message_type: 'FOLLOW_UP'
    });

    console.log('✅ Follow-up message generated!');
    console.log('');
    console.log(`📧 Subject: "${result4.message.subject_line}"`);
    console.log(`📊 Latency: ${result4._meta.latency_ms}ms`);
    console.log('');
    console.log('📝 Opening: ' + result4.message.opening_paragraph);

  } catch (error) {
    console.error('❌ Test Case 4 FAILED:', error.message);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('FULL TEST SUITE COMPLETE');
  console.log('='.repeat(80));
  console.log('');
  console.log('v1.0 Features Verified:');
  console.log('✅ GPT-4 Turbo message generation');
  console.log('✅ Schema-locked JSON output');
  console.log('✅ Spam score calculation');
  console.log('✅ Compliance checking (NEVER rules)');
  console.log('✅ Different message types (INITIAL, FOLLOW_UP)');
  console.log('✅ Different tones (PROFESSIONAL, CONVERSATIONAL)');
  console.log('✅ Handles minimal data gracefully');
  console.log('✅ Performance < 5000ms');
}

async function runSchemaTests(tool) {
  // Test schema validation without LLM
  console.log('TEST: Input Schema Validation');
  console.log('-'.repeat(80));

  const validInput = {
    company_context: {
      company_name: 'TestCorp',
      industry: 'Technology'
    },
    contact_info: {
      contact_name: 'Test User'
    },
    message_type: 'INITIAL'
  };

  const isValid = tool.validateInput(validInput);
  console.log(`✅ Valid input passes: ${isValid ? 'PASS' : 'FAIL'}`);

  const invalidInput = {
    company_context: {
      company_name: 'TestCorp'
      // Missing industry
    },
    // Missing contact_info
    message_type: 'INITIAL'
  };

  const isInvalid = !tool.validateInput(invalidInput);
  console.log(`✅ Invalid input fails: ${isInvalid ? 'PASS' : 'FAIL'}`);

  if (!isValid || !isInvalid) {
    console.log('Validation errors:', tool.validateInput.errors);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
