/**
 * Persona Fallback Test - Sprint 71
 *
 * Tests that SIVA tools correctly use the fallback persona
 * when database is not available.
 *
 * Run: node server/siva-tools/tests/test-persona-fallback.js
 */

// Test the persona helper functions (no database needed)
const { FALLBACK_PERSONA, findBlocker, findBooster, getTimingMultiplier, getTargetTitles } = require('../helpers/personaLoader');

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  SIVA Persona Fallback Tests - Sprint 71');
console.log('═══════════════════════════════════════════════════════════\n');

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

// Test 5: findBooster works
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
  console.log('   ✗ Should find signal recency booster');
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

// Summary
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
