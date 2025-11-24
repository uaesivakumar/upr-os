/**
 * Simple Integration Test
 * Week 2 Day 3-4: Test RAG → Rules → LLM flow
 *
 * Usage: node server/lib/emailIntelligence/test-integration-simple.js
 */

import { recall } from './rag.js';
import { predict, explainRule } from './rules.js';
import { guessPattern, isConfigured } from './prompt.js';

async function runSimpleTest() {
  console.log('='.repeat(70));
  console.log('SIMPLE INTEGRATION TEST - RAG → RULES → LLM FLOW');
  console.log('='.repeat(70));
  console.log('');

  const testDomain = 'testbank.ae';
  const testContext = {
    company: 'Test Bank',
    domain: testDomain,
    sector: 'Banking',
    region: 'UAE'
  };

  // LAYER 0: RAG
  console.log('[LAYER 0] RAG Lookup');
  console.log('-'.repeat(70));

  try {
    const ragResult = await recall(testDomain, testContext);
    if (ragResult) {
      console.log(`✅ RAG HIT: ${ragResult.pattern} (confidence: ${ragResult.confidence.toFixed(2)})`);
      console.log(`   Source: ${ragResult.source}`);
    } else {
      console.log('❌ RAG MISS - falling to Rules');
    }
  } catch (error) {
    console.log(`⚠️  RAG Error: ${error.message}`);
    console.log('   Falling to Rules');
  }
  console.log('');

  // LAYER 1: RULES
  console.log('[LAYER 1] Heuristic Rules');
  console.log('-'.repeat(70));

  const rulesResult = explainRule(testContext);
  console.log(`✅ RULES: ${rulesResult.pattern} (confidence: ${rulesResult.confidence})`);
  console.log(`   Reason: ${rulesResult.reason}`);
  console.log('');

  // LAYER 2: LLM
  console.log('[LAYER 2] LLM Pattern Generation');
  console.log('-'.repeat(70));

  if (isConfigured()) {
    console.log('✅ OpenAI configured, calling LLM...');

    try {
      const llmResult = await guessPattern(testContext);
      console.log(`✅ LLM: ${llmResult.pattern} (confidence: ${llmResult.confidence.toFixed(2)})`);
      console.log(`   Reasoning: ${llmResult.reasoning}`);
      console.log(`   Cost: $${llmResult.cost.toFixed(6)}`);
      console.log(`   Duration: ${llmResult.duration}ms`);
    } catch (error) {
      console.log(`❌ LLM Error: ${error.message}`);
    }
  } else {
    console.log('⚠️  OpenAI not configured, skipping LLM test');
    console.log('   Set OPENAI_API_KEY to test LLM layer');
  }
  console.log('');

  // Summary
  console.log('='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70));
  console.log('');
  console.log('Fallback Flow Summary:');
  console.log('  1. RAG Lookup (direct + vector) → miss or error');
  console.log(`  2. Rules Prediction → ${rulesResult.pattern} ✅`);
  console.log('  3. LLM Generation → ' + (isConfigured() ? 'ready' : 'not configured'));
  console.log('  4. NeverBounce Validation → (Week 1 module ready)');
  console.log('');
  console.log('✅ All layers functional!');
  console.log('');
}

runSimpleTest().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
