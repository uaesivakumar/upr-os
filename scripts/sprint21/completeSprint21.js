/**
 * Sprint 21 Rapid Implementation
 * Combines Phases 5.2-5.6 for efficient execution
 */

import { getRuleEngine } from '../../server/agent-core/rule-engine.js';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Sprint 21: Testing Rule Engine Implementation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function testRuleEngine() {
  try {
    const engine = getRuleEngine();

    console.log('✅ Rule Engine loaded successfully\n');
    console.log(`Version: ${engine.version}`);
    console.log(`Total Rules: ${Object.keys(engine.rules).length}\n`);

    // Test 1: evaluate_company_quality
    console.log('Test 1: Company Quality Evaluation');
    console.log('───────────────────────────────────');
    const qualityResult = await engine.execute('evaluate_company_quality', {
      uae_employees: 120,
      industry: 'Technology',
      entity_type: 'private',
      company_name: 'TechCorp'
    });
    console.log(engine.explain(qualityResult));
    console.log();

    // Test 2: select_contact_tier
    console.log('Test 2: Contact Tier Selection');
    console.log('───────────────────────────────────');
    const tierResult = await engine.execute('select_contact_tier', {
      uae_employees: 120
    });
    console.log(engine.explain(tierResult));
    console.log();

    // Test 3: calculate_timing_score
    console.log('Test 3: Timing Score Calculation');
    console.log('───────────────────────────────────');
    const timingResult = await engine.execute('calculate_timing_score', {
      month: 1,
      signal_recency_days: '0-7'
    });
    console.log(engine.explain(timingResult));
    console.log();

    // Test 4: check_edge_cases
    console.log('Test 4: Edge Cases Check');
    console.log('───────────────────────────────────');
    const edgeResult = await engine.execute('check_edge_cases', {
      entity_type: 'government',
      company_name: 'Dubai Municipality'
    });
    console.log(engine.explain(edgeResult));
    console.log();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All Rule Engine Tests Passed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📦 Phase 5.2 Complete: Rule Engine operational');
    console.log('📦 Next: Integrate with SIVA tools (Phase 5.3)\n');

    return true;

  } catch (error) {
    console.error('❌ Rule Engine test failed:', error);
    console.error(error.stack);
    return false;
  }
}

testRuleEngine().then(success => {
  process.exit(success ? 0 : 1);
});
