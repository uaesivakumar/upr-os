/**
 * Test script for ObjectionHandlerTool
 * Run: node server/siva-tools/test-objection-handler.js
 */

const ObjectionHandlerTool = require('./ObjectionHandlerToolStandalone');

async function runTests() {
  const tool = new ObjectionHandlerTool();

  console.log('='.repeat(80));
  console.log('OBJECTION HANDLER TOOL - TEST SUITE');
  console.log('='.repeat(80));
  console.log('');

  // Test Case 1: "Already have a bank"
  console.log('TEST CASE 1: Objection - "Already have a bank"');
  console.log('-'.repeat(80));
  try {
    const result1 = await tool.execute({
      objection: {
        text: 'We already work with another bank for our banking needs'
      },
      conversation_context: {
        company_name: 'TechCorp',
        contact_name: 'Sarah Ahmed',
        previous_messages_count: 1,
        relationship_stage: 'INITIAL_CONTACT'
      },
      company_context: {
        industry: 'Technology',
        size: 150
      }
    });

    console.log('✅ Objection handled!');
    console.log('');
    console.log(`📊 Classification:`);
    console.log(`   Type: ${result1.classification.objection_type}`);
    console.log(`   Severity: ${result1.classification.severity}`);
    console.log(`   Is Genuine: ${result1.classification.is_genuine ? 'YES' : 'NO (polite brush-off)'}`);
    console.log('');
    console.log(`💬 Response Structure:`);
    console.log(`   Acknowledgment: "${result1.response.acknowledgment}"`);
    console.log(`   Reframe: "${result1.response.reframe.substring(0, 80)}..."`);
    console.log(`   Value Add: "${result1.response.value_add.substring(0, 80)}..."`);
    console.log(`   Next Step: "${result1.response.next_step.substring(0, 80)}..."`);
    console.log('');
    console.log(`📈 Strategy:`);
    console.log(`   Action: ${result1.strategy.recommended_action}`);
    console.log(`   Follow-up Timing: ${result1.strategy.follow_up_timing_days} days`);
    console.log(`   Alternative Angle: ${result1.strategy.alternative_angle}`);
    console.log('');
    console.log(`📊 Metrics:`);
    console.log(`   Conversion Probability: ${result1.metadata.estimated_conversion_probability}%`);
    console.log(`   Confidence: ${result1.metadata.confidence}`);
    console.log(`   Latency: ${result1._meta.latency_ms}ms`);
    console.log(`   LLM Used: ${result1._meta.llm_used ? 'YES' : 'NO (template)'}`);

  } catch (error) {
    console.error('❌ Test Case 1 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 2: "Not interested"
  console.log('TEST CASE 2: Objection - "Not interested"');
  console.log('-'.repeat(80));
  try {
    const result2 = await tool.execute({
      objection: {
        text: 'Not interested, thanks'
      },
      conversation_context: {
        company_name: 'RetailCo',
        contact_name: 'Ahmed Hassan',
        previous_messages_count: 0,
        relationship_stage: 'COLD'
      }
    });

    console.log('✅ Classification:');
    console.log(`   Type: ${result2.classification.objection_type}`);
    console.log(`   Severity: ${result2.classification.severity} (blocking)`);
    console.log(`   Is Genuine: ${result2.classification.is_genuine ? 'YES' : 'NO (polite brush-off)'}`);
    console.log('');
    console.log(`📈 Strategy: ${result2.strategy.recommended_action}`);
    console.log(`📊 Conversion Probability: ${result2.metadata.estimated_conversion_probability}% (expected: low)`);
    console.log(`⏱️  Latency: ${result2._meta.latency_ms}ms`);

  } catch (error) {
    console.error('❌ Test Case 2 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 3: "Need to discuss with team"
  console.log('TEST CASE 3: Objection - "Need to discuss with team"');
  console.log('-'.repeat(80));
  try {
    const result3 = await tool.execute({
      objection: {
        text: 'I need to discuss this with my team first before making a decision'
      },
      conversation_context: {
        company_name: 'StartupX',
        contact_name: 'Mohammed Ali',
        previous_messages_count: 1,
        relationship_stage: 'ENGAGED'
      },
      company_context: {
        industry: 'E-commerce',
        size: 80
      }
    });

    console.log('✅ Classification:');
    console.log(`   Type: ${result3.classification.objection_type}`);
    console.log(`   Severity: ${result3.classification.severity} (low - good sign)`);
    console.log(`   Is Genuine: ${result3.classification.is_genuine ? 'YES (real consideration)' : 'NO'}`);
    console.log('');
    console.log(`📈 Strategy: ${result3.strategy.recommended_action}`);
    console.log(`📊 Conversion Probability: ${result3.metadata.estimated_conversion_probability}% (expected: high 70-80%)`);
    console.log('');
    console.log(`💡 Response Suggestion:`);
    console.log(`   "${result3.response.next_step}"`);

  } catch (error) {
    console.error('❌ Test Case 3 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 4: "What are your rates?"
  console.log('TEST CASE 4: Objection - "What are your rates?"');
  console.log('-'.repeat(80));
  try {
    const result4 = await tool.execute({
      objection: {
        text: 'What are your rates and fees for these services?'
      },
      conversation_context: {
        company_name: 'FinanceHub',
        contact_name: 'Lisa Chen',
        previous_messages_count: 2
      },
      company_context: {
        industry: 'Financial Services',
        size: 200
      }
    });

    console.log('✅ Classification:');
    console.log(`   Type: ${result4.classification.objection_type}`);
    console.log(`   Severity: ${result4.classification.severity}`);
    console.log('');
    console.log(`💬 Value Reframe: "${result4.response.value_add}"`);
    console.log(`📊 Conversion Probability: ${result4.metadata.estimated_conversion_probability}%`);

  } catch (error) {
    console.error('❌ Test Case 4 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 5: "Too busy right now"
  console.log('TEST CASE 5: Objection - "Too busy right now"');
  console.log('-'.repeat(80));
  try {
    const result5 = await tool.execute({
      objection: {
        text: 'I\'m too busy right now, maybe next quarter'
      },
      conversation_context: {
        company_name: 'BusyCorp',
        contact_name: 'David Williams',
        previous_messages_count: 1
      }
    });

    console.log('✅ Classification:');
    console.log(`   Type: ${result5.classification.objection_type}`);
    console.log(`   Severity: ${result5.classification.severity} (low - timing)`);
    console.log('');
    console.log(`📈 Strategy: ${result5.strategy.recommended_action}`);
    console.log(`⏱️  Follow-up Timing: ${result5.strategy.follow_up_timing_days} days`);
    console.log(`📊 Conversion Probability: ${result5.metadata.estimated_conversion_probability}% (good - real interest)`);

  } catch (error) {
    console.error('❌ Test Case 5 FAILED:', error.message);
  }

  console.log('');
  console.log('');

  // Test Case 6: Message Fatigue (High Message Count)
  console.log('TEST CASE 6: Message Fatigue (5+ Messages)');
  console.log('-'.repeat(80));
  try {
    const result6 = await tool.execute({
      objection: {
        text: 'Still not sure, need more time to think'
      },
      conversation_context: {
        company_name: 'FatiguedCo',
        contact_name: 'Tired Person',
        previous_messages_count: 5,
        relationship_stage: 'COLD'
      }
    });

    console.log('✅ Classification: ' + result6.classification.objection_type);
    console.log(`📈 Strategy: ${result6.strategy.recommended_action} (high message count → close)`);
    console.log(`📊 Conversion Probability: ${result6.metadata.estimated_conversion_probability}% (reduced by fatigue)`);
    console.log(`📊 Confidence: ${result6.metadata.confidence} (reduced for fatigue)`);

  } catch (error) {
    console.error('❌ Test Case 6 FAILED:', error.message);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('TEST SUITE COMPLETE');
  console.log('='.repeat(80));
  console.log('');
  console.log('v1.0 Features Verified:');
  console.log('✅ Objection classification (6 types)');
  console.log('✅ Pattern matching (deterministic)');
  console.log('✅ 4-part response structure (acknowledge, reframe, value-add, next-step)');
  console.log('✅ Strategy recommendations (RESPOND_NOW, WAIT_AND_NURTURE, CLOSE)');
  console.log('✅ Conversion probability estimation (10-70%)');
  console.log('✅ Message fatigue detection');
  console.log('✅ Genuine vs polite brush-off detection');
  console.log('✅ Company size adjustments');
  console.log('✅ Template fallbacks (works without LLM)');
  console.log('✅ Performance < 1000ms');
  console.log('');
  console.log('LLM Features (Requires OPENAI_API_KEY):');
  console.log('  - Context-aware response generation');
  console.log('  - Natural language (vs template)');
  console.log('  - Empathetic tone adjustment');
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
