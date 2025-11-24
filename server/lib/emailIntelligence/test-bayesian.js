/**
 * Test Hierarchical Bayesian Evidence System
 * Demonstrates the "never return no evidence" principle
 */

import { predict, shouldCallLLM, getTopCandidates } from './rules.js';

console.log('═'.repeat(80));
console.log('HIERARCHICAL BAYESIAN EVIDENCE SYSTEM TEST');
console.log('═'.repeat(80));
console.log('');

console.log('Testing prediction WITHOUT database (cold start)...');
console.log('');

const testContext = {
  company: 'Test Bank',
  domain: 'testbank.ae',
  sector: 'Banking',
  region: 'UAE',
  company_size: 'Medium'
};

predict(testContext).then(result => {
  console.log('═'.repeat(80));
  console.log('RESULT');
  console.log('═'.repeat(80));
  console.log('');

  console.log(`Pattern: ${result.pattern}`);
  console.log(`Confidence: ${result.confidence.toFixed(2)}`);
  console.log(`Reason: ${result.reason}`);
  console.log('');

  // Show trace for mathematical transparency
  if (result.trace) {
    console.log('TRACE (Mathematical Breakdown):');
    console.log(`  β (Dirichlet prior strength): ${result.trace.beta}`);
    console.log(`  α({first}.{last}) = β * freq = ${result.trace.beta} * 0.40 = ${result.trace.prior_counts['{first}.{last}'].toFixed(2)}`);
    console.log(`  Total counts: ${Object.values(result.trace.total_counts).reduce((a,b) => a+b, 0).toFixed(2)}`);
    console.log('');
  }

  console.log('Posterior Distribution:');
  const sorted = Object.entries(result.posterior)
    .sort(([, a], [, b]) => b - a);

  sorted.forEach(([pattern, prob], idx) => {
    const bar = '█'.repeat(Math.floor(prob * 50));
    console.log(`  ${idx + 1}. ${pattern.padEnd(20)} ${prob.toFixed(3)} ${bar}`);
  });
  console.log('');

  console.log('Uncertainty Metrics:');
  console.log(`  Entropy: ${result.uncertainty.entropy.toFixed(2)} (high = uncertain)`);
  console.log(`  Margin:  ${result.uncertainty.margin.toFixed(2)} (low = close race)`);
  console.log(`  Uncertain: ${result.uncertainty.is_uncertain ? 'YES' : 'NO'}`);
  console.log('');

  console.log('Evidence Layers:');
  Object.entries(result.evidence).forEach(([layer, data]) => {
    if (layer === 'global') {
      console.log(`  ${layer}: ${Object.keys(data).length} patterns (fallback priors)`);
    } else if (Object.keys(data).length > 0) {
      console.log(`  ${layer}: ${JSON.stringify(data)}`);
    } else {
      console.log(`  ${layer}: (no data)`);
    }
  });
  console.log('');

  // LLM Gate
  const needsLLM = shouldCallLLM(result);
  console.log('═'.repeat(80));
  console.log('LLM GATE');
  console.log('═'.repeat(80));
  console.log(`Should call LLM: ${needsLLM ? 'YES' : 'NO'}`);
  console.log(`Reason: ${needsLLM ? 'High uncertainty or low confidence' : 'Confident enough to proceed without LLM'}`);
  console.log('');

  if (needsLLM) {
    const candidates = getTopCandidates(result, 2);
    console.log('Top-2 candidates for LLM:');
    candidates.forEach(({pattern, probability}, idx) => {
      console.log(`  ${idx + 1}. ${pattern} (P=${probability.toFixed(3)})`);
    });
    console.log('');
    console.log('→ LLM will choose between these 2 patterns (not open-ended research)');
  } else {
    console.log('→ Skip LLM, proceed directly to NeverBounce validation');
  }
  console.log('');

  console.log('═'.repeat(80));
  console.log('KEY INSIGHT');
  console.log('═'.repeat(80));
  console.log('Even with ZERO database evidence (cold start), the system:');
  console.log('✅ Returns a principled prediction (global prior)');
  console.log('✅ Computes full posterior distribution');
  console.log('✅ Measures uncertainty (entropy & margin)');
  console.log('✅ Gates LLM calls based on uncertainty');
  console.log('✅ Never says "no evidence found"');
  console.log('');
  console.log('As database fills with validated patterns, posterior will shift');
  console.log('from global prior → sector/region evidence → exact domain match.');
  console.log('');

}).catch(error => {
  console.error('Test error:', error);
  console.error(error.stack);
  process.exit(1);
});
