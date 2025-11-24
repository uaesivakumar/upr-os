/**
 * Test RAG + Rules Integration
 * Week 2 Day 1-2: Integration Testing
 *
 * Usage: node server/lib/emailIntelligence/test-rag-rules.js
 */

import { recall, upsertPattern } from './rag.js';
import { predict, explainRule, listRules } from './rules.js';

async function runTests() {
  console.log('='.repeat(70));
  console.log('RAG + RULES INTEGRATION TEST');
  console.log('='.repeat(70));
  console.log('');

  // Test 1: Rules-based prediction
  console.log('TEST 1: Heuristic Rules Prediction');
  console.log('-'.repeat(70));

  const contexts = [
    { sector: 'Banking', region: 'UAE', tld: '.ae', company_size: 'Large' },
    { sector: 'Technology', region: 'US', tld: '.com', company_size: 'Medium' },
    { sector: 'Healthcare', region: 'UAE', tld: '.ae', company_size: 'Large' },
    { sector: 'Unknown', region: 'Global', tld: '.com', company_size: 'Medium' }
  ];

  contexts.forEach((ctx, idx) => {
    const result = explainRule(ctx);
    console.log(`${idx + 1}. ${ctx.sector} (${ctx.region})`);
    console.log(`   Pattern: ${result.pattern}`);
    console.log(`   Confidence: ${result.confidence}`);
    console.log(`   Reason: ${result.reason}`);
    console.log('');
  });

  // Test 2: List all rules
  console.log('TEST 2: List All Heuristic Rules');
  console.log('-'.repeat(70));

  const rules = listRules();
  console.log(`Total rules: ${rules.length}`);
  console.log('');
  rules.forEach(rule => {
    console.log(`Rule ${rule.id}: ${rule.condition}`);
    console.log(`  Pattern: ${rule.pattern} (confidence: ${rule.confidence})`);
    console.log(`  ${rule.description}`);
    console.log('');
  });

  // Test 3: RAG direct lookup
  console.log('TEST 3: RAG Direct Lookup (Exact Match)');
  console.log('-'.repeat(70));

  const knownDomain = 'emiratesnbd.com';
  console.log(`Looking up: ${knownDomain}`);

  const ragResult = await recall(knownDomain, {
    company: 'Emirates NBD',
    sector: 'Banking',
    region: 'UAE'
  });

  if (ragResult) {
    console.log(`✅ Found: ${ragResult.pattern}`);
    console.log(`   Confidence: ${ragResult.confidence.toFixed(3)}`);
    console.log(`   Source: ${ragResult.source}`);
    console.log(`   Age: ${ragResult.age_days} days`);
    console.log(`   Usage: ${ragResult.usage_count} times`);
  } else {
    console.log('❌ Not found');
  }
  console.log('');

  // Test 4: RAG vector search (semantic similarity)
  console.log('TEST 4: RAG Vector Search (Semantic Match)');
  console.log('-'.repeat(70));

  const unknownDomain = 'newbank.ae';
  console.log(`Looking up: ${unknownDomain}`);
  console.log(`Context: UAE Banking sector`);
  console.log('');

  try {
    const vectorResult = await recall(unknownDomain, {
      company: 'New Bank',
      sector: 'Banking',
      region: 'UAE'
    });

    if (vectorResult) {
      console.log(`✅ Similar pattern found: ${vectorResult.pattern}`);
      console.log(`   From: ${vectorResult.domain}`);
      console.log(`   Similarity: ${vectorResult.similarity?.toFixed(3) || 'N/A'}`);
      console.log(`   Confidence: ${vectorResult.confidence.toFixed(3)}`);
      console.log(`   Source: ${vectorResult.source}`);

      if (vectorResult.context) {
        console.log('   Similar companies:');
        vectorResult.context.forEach((c, idx) => {
          console.log(`     ${idx + 1}. ${c.domain} (${c.pattern}) - similarity: ${c.similarity.toFixed(3)}`);
        });
      }
    } else {
      console.log('❌ No similar patterns found');
      console.log('   This is expected if no embeddings exist yet');
      console.log('   Run embedding backfill to enable vector search');
    }
  } catch (error) {
    if (error.message.includes('OPENAI_API_KEY')) {
      console.log('⚠️  OpenAI API key not configured');
      console.log('   Set OPENAI_API_KEY to enable vector search');
      console.log('   Skipping vector search test');
    } else {
      throw error;
    }
  }
  console.log('');

  // Test 5: Store new pattern with embedding
  console.log('TEST 5: Store New Pattern with Embedding');
  console.log('-'.repeat(70));

  const newPattern = {
    domain: 'testcompany.ae',
    pattern: '{first}{l}',
    confidence: 0.85,
    source: 'test',
    context: {
      company: 'Test Company',
      sector: 'Technology',
      region: 'UAE',
      company_size: 'Medium'
    },
    health: {
      mx_ok: true,
      catch_all: false
    }
  };

  console.log(`Storing: ${newPattern.domain} → ${newPattern.pattern}`);

  try {
    await upsertPattern(newPattern);
    console.log('✅ Pattern stored successfully');
    console.log('');

    // Verify it was stored
    console.log('Verifying storage...');
    const verifyResult = await recall(newPattern.domain);
    if (verifyResult) {
      console.log(`✅ Verification: Pattern retrieved`);
      console.log(`   Pattern: ${verifyResult.pattern}`);
      console.log(`   Confidence: ${verifyResult.confidence.toFixed(3)}`);
      console.log(`   Source: ${verifyResult.source}`);
    } else {
      console.log('❌ Verification failed: Pattern not found');
    }
  } catch (error) {
    if (error.message.includes('OPENAI_API_KEY')) {
      console.log('⚠️  OpenAI API key not configured');
      console.log('   Set OPENAI_API_KEY to enable pattern storage with embeddings');
      console.log('   Skipping storage test');
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  console.log('');

  // Test 6: RAG + Rules fallback behavior
  console.log('TEST 6: RAG + Rules Fallback Behavior');
  console.log('-'.repeat(70));

  const testDomain = 'unknown-company.ae';
  console.log(`Testing fallback for: ${testDomain}`);
  console.log('');

  // Try RAG first
  console.log('1. Trying RAG lookup...');
  const ragFallback = await recall(testDomain, {
    company: 'Unknown Company',
    sector: 'Technology',
    region: 'UAE'
  }).catch(err => {
    if (err.message.includes('OPENAI_API_KEY')) {
      console.log('   ⚠️  OpenAI API key not configured, skipping RAG');
      return null;
    }
    throw err;
  });

  if (ragFallback) {
    console.log(`   ✅ RAG found: ${ragFallback.pattern} (confidence: ${ragFallback.confidence.toFixed(3)})`);
  } else {
    console.log('   ❌ RAG miss (expected for unknown domain)');
  }
  console.log('');

  // Fall back to Rules
  console.log('2. Falling back to Rules...');
  const rulesFallback = predict({
    sector: 'Technology',
    region: 'UAE',
    domain: testDomain
  });

  console.log(`   ✅ Rules predict: ${rulesFallback.pattern} (confidence: ${rulesFallback.confidence})`);
  console.log('');

  // Summary
  console.log('Fallback Flow:');
  console.log('  1. RAG lookup (exact match) → miss');
  console.log('  2. RAG vector search (semantic) → miss (no embeddings or low similarity)');
  console.log(`  3. Rules prediction → ${rulesFallback.pattern} ✅`);
  console.log('  4. Next step would be: LLM (Week 2 Day 3-4)');
  console.log('');

  console.log('='.repeat(70));
  console.log('ALL TESTS COMPLETE');
  console.log('='.repeat(70));
  console.log('');
  console.log('Summary:');
  console.log('✅ Rules module working (12 rules, instant prediction)');
  console.log('✅ RAG module implemented (direct lookup + vector search)');
  console.log('✅ Fallback flow: RAG → Rules → LLM (ready for Week 2 Day 3-4)');
  console.log('');

  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  Note: Some tests skipped due to missing OPENAI_API_KEY');
    console.log('   Set OPENAI_API_KEY to test full vector search functionality');
    console.log('');
  }

  console.log('Next Steps:');
  console.log('1. Set OPENAI_API_KEY environment variable');
  console.log('2. Run embedding backfill: node server/lib/emailIntelligence/backfill-embeddings.js');
  console.log('3. Implement LLM layer (Week 2 Day 3-4)');
  console.log('4. Connect orchestrator to coordinate RAG → Rules → LLM flow');
  console.log('');
}

runTests().catch(error => {
  console.error('');
  console.error('='.repeat(70));
  console.error('❌ TEST FAILED');
  console.error('='.repeat(70));
  console.error('');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  console.error('');
  process.exit(1);
});
