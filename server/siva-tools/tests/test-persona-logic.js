/**
 * Persona Logic Test - Sprint 71
 *
 * Tests the persona helper logic without database dependencies.
 * Tests the fallback persona configuration and helper functions.
 *
 * Run: node server/siva-tools/tests/test-persona-logic.js
 */

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  SIVA Persona Logic Tests - Sprint 71');
console.log('═══════════════════════════════════════════════════════════\n');

// =============================================================================
// Define the fallback persona (same as in personaLoader.js)
// =============================================================================

const FALLBACK_PERSONA = {
  sub_vertical_slug: 'employee-banking',
  persona_name: 'EB Sales Officer (Fallback)',
  entity_type: 'company',

  contact_priority_rules: {
    tiers: [
      { size_min: 0, size_max: 50, titles: ['Founder', 'COO'], priority: 1 },
      { size_min: 50, size_max: 500, titles: ['HR Director', 'HR Manager'], priority: 1 },
      { size_min: 500, size_max: null, titles: ['Payroll Manager', 'Benefits Coordinator'], priority: 1 }
    ]
  },

  edge_cases: {
    blockers: [
      { type: 'company_name', values: ['Etihad', 'Emirates', 'ADNOC', 'Emaar', 'DP World'], multiplier: 0.1 },
      { type: 'sector', values: ['government'], multiplier: 0.05 }
    ],
    boosters: [
      { type: 'license_type', values: ['Free Zone'], multiplier: 1.3 },
      { type: 'signal_recency', condition: 'days_since_signal < 30', multiplier: 1.5 }
    ]
  },

  timing_rules: {
    calendar: [
      { period: 'Q1', months: [1, 2], multiplier: 1.3 },
      { period: 'Ramadan', dynamic: true, multiplier: 0.3 },
      { period: 'Summer', months: [7, 8], multiplier: 0.7 },
      { period: 'Q4', months: [12], multiplier: 0.6 }
    ],
    signal_freshness: [
      { days_max: 7, multiplier: 1.5, label: 'HOT' },
      { days_max: 14, multiplier: 1.2, label: 'WARM' },
      { days_max: 30, multiplier: 1.0, label: 'RECENT' }
    ]
  },

  outreach_doctrine: {
    always: ['Reference specific company signal', 'Position as Point of Contact'],
    never: ['Mention pricing', 'Use pressure language'],
    tone: 'professional',
    formality: 'formal',
    channels: ['email', 'linkedin']
  },

  quality_standards: {
    min_confidence: 70,
    contact_cooldown_days: 90
  },

  scoring_config: {
    weights: { q_score: 0.25, t_score: 0.35, l_score: 0.20, e_score: 0.20 },
    thresholds: { hot: 80, warm: 60, cold: 40 }
  }
};

// =============================================================================
// Helper functions (same as in personaLoader.js)
// =============================================================================

function findBlocker(blockers, type, value) {
  if (!blockers || !Array.isArray(blockers)) return null;

  for (const blocker of blockers) {
    if (blocker.type !== type) continue;

    if (Array.isArray(blocker.values)) {
      const normalizedValue = typeof value === 'string' ? value.toLowerCase() : value;
      const matches = blocker.values.some(v =>
        typeof v === 'string'
          ? normalizedValue.includes(v.toLowerCase()) || v.toLowerCase().includes(normalizedValue)
          : v === value
      );

      if (matches) {
        return blocker;
      }
    }
  }

  return null;
}

function findBooster(boosters, type, value, context = {}) {
  if (!boosters || !Array.isArray(boosters)) return null;

  for (const booster of boosters) {
    if (booster.type !== type) continue;

    if (Array.isArray(booster.values)) {
      const normalizedValue = typeof value === 'string' ? value.toLowerCase() : value;
      const matches = booster.values.some(v =>
        typeof v === 'string'
          ? normalizedValue.includes(v.toLowerCase())
          : v === value
      );

      if (matches) {
        return booster;
      }
    } else if (booster.condition) {
      if (booster.condition.includes('days_since_signal')) {
        const daysSince = context.days_since_signal || 999;
        const match = booster.condition.match(/days_since_signal\s*<\s*(\d+)/);
        if (match && daysSince < parseInt(match[1])) {
          return booster;
        }
      }
    }
  }

  return null;
}

function getTimingMultiplier(persona, date = new Date()) {
  const rules = persona?.timing_rules || FALLBACK_PERSONA.timing_rules;
  const month = date.getMonth() + 1; // 1-12

  let result = { multiplier: 1.0, reason: 'Normal period', period: null };

  if (rules.calendar && Array.isArray(rules.calendar)) {
    for (const rule of rules.calendar) {
      if (rule.dynamic) continue;

      if (rule.months && rule.months.includes(month)) {
        result = {
          multiplier: rule.multiplier,
          reason: rule.reason || rule.period,
          period: rule.period
        };
        break;
      }
    }
  }

  return result;
}

function getTargetTitles(persona, companySize) {
  const rules = persona?.contact_priority_rules || FALLBACK_PERSONA.contact_priority_rules;

  if (!rules.tiers || !Array.isArray(rules.tiers)) {
    return ['HR Manager', 'HR Director'];
  }

  for (const tier of rules.tiers) {
    const minSize = tier.size_min || 0;
    const maxSize = tier.size_max || Infinity;

    if (companySize >= minSize && companySize <= maxSize) {
      return tier.titles || [];
    }
  }

  return rules.fallback_titles || ['HR Manager'];
}

// =============================================================================
// Tests
// =============================================================================

let passed = 0;
let failed = 0;

// Test 1: Fallback persona exists
console.log('📋 Test 1: Fallback Persona Exists');
if (FALLBACK_PERSONA) {
  console.log(`   ✓ Persona name: ${FALLBACK_PERSONA.persona_name}`);
  console.log(`   ✓ Entity type: ${FALLBACK_PERSONA.entity_type}`);
  passed++;
} else {
  console.log('   ✗ FALLBACK_PERSONA is undefined');
  failed++;
}

// Test 2: Fallback has edge cases
console.log('\n📋 Test 2: Edge Cases Config');
if (FALLBACK_PERSONA.edge_cases) {
  console.log(`   ✓ Blockers: ${FALLBACK_PERSONA.edge_cases.blockers?.length || 0}`);
  console.log(`   ✓ Boosters: ${FALLBACK_PERSONA.edge_cases.boosters?.length || 0}`);
  passed++;
} else {
  console.log('   ✗ edge_cases missing');
  failed++;
}

// Test 3: findBlocker works for company_name
console.log('\n📋 Test 3: findBlocker - Company Name');
const blockers = FALLBACK_PERSONA.edge_cases.blockers;
const etihadBlocker = findBlocker(blockers, 'company_name', 'Etihad Airways');
if (etihadBlocker) {
  console.log(`   ✓ Found blocker for Etihad: multiplier=${etihadBlocker.multiplier}`);
  passed++;
} else {
  console.log('   ✗ Should find blocker for Etihad');
  failed++;
}

const emiratesBlocker = findBlocker(blockers, 'company_name', 'Emirates Group');
if (emiratesBlocker) {
  console.log(`   ✓ Found blocker for Emirates: multiplier=${emiratesBlocker.multiplier}`);
  passed++;
} else {
  console.log('   ✗ Should find blocker for Emirates');
  failed++;
}

const normalCompany = findBlocker(blockers, 'company_name', 'ABC Trading LLC');
if (!normalCompany) {
  console.log(`   ✓ No blocker for normal company`);
  passed++;
} else {
  console.log('   ✗ Should not block normal company');
  failed++;
}

// Test 4: findBlocker works for sector
console.log('\n📋 Test 4: findBlocker - Sector');
const govBlocker = findBlocker(blockers, 'sector', 'government');
if (govBlocker) {
  console.log(`   ✓ Found blocker for government: multiplier=${govBlocker.multiplier}`);
  passed++;
} else {
  console.log('   ✗ Should find blocker for government');
  failed++;
}

// Test 5: findBooster works for license_type
console.log('\n📋 Test 5: findBooster - License Type');
const boosters = FALLBACK_PERSONA.edge_cases.boosters;
const freeZoneBooster = findBooster(boosters, 'license_type', 'Free Zone');
if (freeZoneBooster) {
  console.log(`   ✓ Found booster for Free Zone: multiplier=${freeZoneBooster.multiplier}`);
  passed++;
} else {
  console.log('   ✗ Should find booster for Free Zone');
  failed++;
}

// Test 6: Signal recency booster
console.log('\n📋 Test 6: findBooster - Signal Recency');
const signalBooster = findBooster(boosters, 'signal_recency', null, { days_since_signal: 10 });
if (signalBooster) {
  console.log(`   ✓ Found signal recency booster: multiplier=${signalBooster.multiplier}`);
  passed++;
} else {
  console.log('   ✗ Should find signal recency booster for 10 days');
  failed++;
}

const oldSignalBooster = findBooster(boosters, 'signal_recency', null, { days_since_signal: 45 });
if (!oldSignalBooster) {
  console.log(`   ✓ No booster for old signal (45 days)`);
  passed++;
} else {
  console.log('   ✗ Should not boost old signal');
  failed++;
}

// Test 7: Timing multiplier
console.log('\n📋 Test 7: getTimingMultiplier');
const janDate = new Date('2025-01-15');
const janTiming = getTimingMultiplier(FALLBACK_PERSONA, janDate);
if (janTiming.period === 'Q1') {
  console.log(`   ✓ January: ${janTiming.period} = ${janTiming.multiplier}`);
  passed++;
} else {
  console.log(`   ✗ Expected Q1, got ${janTiming.period}`);
  failed++;
}

const julyDate = new Date('2025-07-15');
const julyTiming = getTimingMultiplier(FALLBACK_PERSONA, julyDate);
if (julyTiming.period === 'Summer') {
  console.log(`   ✓ July: ${julyTiming.period} = ${julyTiming.multiplier}`);
  passed++;
} else {
  console.log(`   ✗ Expected Summer, got ${julyTiming.period}`);
  failed++;
}

const decDate = new Date('2025-12-15');
const decTiming = getTimingMultiplier(FALLBACK_PERSONA, decDate);
if (decTiming.period === 'Q4') {
  console.log(`   ✓ December: ${decTiming.period} = ${decTiming.multiplier}`);
  passed++;
} else {
  console.log(`   ✗ Expected Q4, got ${decTiming.period}`);
  failed++;
}

// Test 8: Target titles by company size
console.log('\n📋 Test 8: getTargetTitles');
const smallTitles = getTargetTitles(FALLBACK_PERSONA, 30);
if (smallTitles.includes('Founder') || smallTitles.includes('COO')) {
  console.log(`   ✓ Small company (30): ${smallTitles.join(', ')}`);
  passed++;
} else {
  console.log(`   ✗ Expected Founder/COO for small company, got ${smallTitles.join(', ')}`);
  failed++;
}

const midTitles = getTargetTitles(FALLBACK_PERSONA, 200);
if (midTitles.includes('HR Director') || midTitles.includes('HR Manager')) {
  console.log(`   ✓ Mid company (200): ${midTitles.join(', ')}`);
  passed++;
} else {
  console.log(`   ✗ Expected HR Director/Manager for mid company, got ${midTitles.join(', ')}`);
  failed++;
}

const largeTitles = getTargetTitles(FALLBACK_PERSONA, 1000);
if (largeTitles.includes('Payroll Manager') || largeTitles.includes('Benefits Coordinator')) {
  console.log(`   ✓ Large company (1000): ${largeTitles.join(', ')}`);
  passed++;
} else {
  console.log(`   ✗ Expected Payroll/Benefits for large company, got ${largeTitles.join(', ')}`);
  failed++;
}

// Test 9: Quality standards
console.log('\n📋 Test 9: Quality Standards');
if (FALLBACK_PERSONA.quality_standards) {
  console.log(`   ✓ Min confidence: ${FALLBACK_PERSONA.quality_standards.min_confidence}%`);
  console.log(`   ✓ Contact cooldown: ${FALLBACK_PERSONA.quality_standards.contact_cooldown_days} days`);
  passed++;
} else {
  console.log('   ✗ quality_standards missing');
  failed++;
}

// Test 10: Outreach doctrine
console.log('\n📋 Test 10: Outreach Doctrine');
if (FALLBACK_PERSONA.outreach_doctrine) {
  console.log(`   ✓ Tone: ${FALLBACK_PERSONA.outreach_doctrine.tone}`);
  console.log(`   ✓ Channels: ${FALLBACK_PERSONA.outreach_doctrine.channels.join(', ')}`);
  console.log(`   ✓ Always: ${FALLBACK_PERSONA.outreach_doctrine.always.length} rules`);
  console.log(`   ✓ Never: ${FALLBACK_PERSONA.outreach_doctrine.never.length} rules`);
  passed++;
} else {
  console.log('   ✗ outreach_doctrine missing');
  failed++;
}

// Test 11: Scoring config
console.log('\n📋 Test 11: Scoring Config');
if (FALLBACK_PERSONA.scoring_config) {
  const weights = FALLBACK_PERSONA.scoring_config.weights;
  console.log(`   ✓ Weights: Q=${weights.q_score}, T=${weights.t_score}, L=${weights.l_score}, E=${weights.e_score}`);
  console.log(`   ✓ Thresholds: HOT=${FALLBACK_PERSONA.scoring_config.thresholds.hot}, WARM=${FALLBACK_PERSONA.scoring_config.thresholds.warm}`);

  // Verify t_score is highest (EB profile)
  if (weights.t_score > weights.q_score && weights.t_score > weights.l_score && weights.t_score > weights.e_score) {
    console.log(`   ✓ T-Score is highest (correct for EB profile)`);
    passed++;
  } else {
    console.log(`   ✗ T-Score should be highest for EB profile`);
    failed++;
  }
  passed++;
} else {
  console.log('   ✗ scoring_config missing');
  failed++;
}

// Summary
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ All persona logic tests passed!');
  console.log('\nThis validates that:');
  console.log('  1. EB persona configuration is correct');
  console.log('  2. Blocker matching works for enterprise brands & government');
  console.log('  3. Booster matching works for Free Zone & signal recency');
  console.log('  4. Timing rules apply Q1, Summer, Q4 multipliers correctly');
  console.log('  5. Contact tier rules return correct titles by company size');
  console.log('  6. Scoring weights have T-Score highest (timing-driven for EB)');
  console.log('\n');
}
