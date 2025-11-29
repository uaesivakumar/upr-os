#!/usr/bin/env node

/**
 * Sprint Service Lookup Tool
 * Usage: node scripts/sprint-service.js S48
 */

const SERVICES = {
  // Phase 0: Security Foundation - SaaS
  S48: { service: 'SaaS', name: 'Identity Intelligence & Vertical Lockdown', path: 'packages/saas/src/lib/auth/identity' },
  S49: { service: 'SaaS', name: 'Enterprise Security & DLP Foundation', path: 'packages/saas/src/lib/auth/security' },

  // Phase 1: Config Foundation - OS
  S50: { service: 'OS', name: 'Super-Admin API Provider Management', path: 'packages/upr-os/src/intelligence/providers' },
  S51: { service: 'OS', name: 'Super-Admin LLM Engine Routing', path: 'packages/upr-os/src/intelligence/llm-router' },
  S52: { service: 'OS', name: 'Super-Admin Vertical Pack System', path: 'packages/upr-os/src/intelligence/vertical-packs' },
  S53: { service: 'OS', name: 'Super-Admin Territory Management', path: 'packages/upr-os/src/intelligence/territory' },

  // Phase 2: Admin & Billing
  S54: { service: 'SaaS', name: 'Admin Panel Foundation', path: 'packages/saas/src/app/admin' },
  S55: { service: 'OS', name: 'Config-Driven OS Kernel', path: 'packages/upr-os/src/intelligence/config-kernel' },
  S56: { service: 'OS', name: 'Discovery Target Types', path: 'packages/upr-os/src/objects/schemas' },
  S57: { service: 'SaaS', name: 'Billing, Plans & Feature Flags', path: 'packages/saas/src/lib/billing' },

  // Phase 3: Journey Engine
  S58: { service: 'OS', name: 'Journey Engine Core', path: 'packages/upr-os/src/journey-engine/core' },
  S59: { service: 'OS', name: 'Journey Steps Library', path: 'packages/upr-os/src/journey-engine/steps' },
  S60: { service: 'OS', name: 'Journey Templates per Vertical', path: 'packages/upr-os/src/journey-engine/templates' },
  S61: { service: 'OS', name: 'Journey Monitoring', path: 'packages/upr-os/src/journey-engine/monitoring' },
  S62: { service: 'SaaS', name: 'Journey Builder UI', path: 'packages/saas/src/app/journey-builder' },

  // Phase 4: Workspace & Objects
  S63: { service: 'SaaS', name: 'Smart Workspace', path: 'packages/saas/src/app/workspace' },
  S64: { service: 'OS', name: 'Object Intelligence v2', path: 'packages/upr-os/src/objects' },
  S65: { service: 'OS', name: 'Evidence System v2', path: 'packages/upr-os/src/evidence' },

  // Phase 5: Autonomous Mode
  S66: { service: 'OS', name: 'Autonomous Agent Foundation', path: 'packages/upr-os/src/autonomous/agent' },
  S67: { service: 'OS', name: 'Autonomous Discovery', path: 'packages/upr-os/src/autonomous/discovery' },
  S68: { service: 'OS', name: 'Autonomous Outreach', path: 'packages/upr-os/src/autonomous/outreach' },
  S69: { service: 'OS', name: 'Autonomous Learning', path: 'packages/upr-os/src/autonomous/learning' },
  S70: { service: 'OS', name: 'Autonomous Dashboard', path: 'packages/upr-os/src/autonomous/dashboard' },

  // Phase 6: Intelligence Platform
  S71: { service: 'OS', name: 'Real-Time Signal Intelligence', path: 'packages/upr-os/src/signals' },
  S72: { service: 'OS', name: 'Predictive Intelligence', path: 'packages/upr-os/src/predictive' },
  S73: { service: 'OS', name: 'ML & Data Platform (Vertex AI)', path: 'packages/upr-os/src/data-platform' },

  // Phase 7: Launch Polish
  S74: { service: 'OS', name: 'Performance & Security Hardening', path: 'packages/upr-os/src' },
  S75: { service: 'Shared', name: 'Integrations Hub', path: 'packages/saas + packages/upr-os' },
  S76: { service: 'SaaS', name: 'Mobile & PWA', path: 'packages/saas/src/app' },

  // Phase 8: Marketplace
  S77: { service: 'SaaS', name: 'Marketplace Foundation', path: 'packages/saas/src/app/marketplace' },
};

// Get sprint from args
let sprint = process.argv[2];

if (!sprint) {
  console.log('Usage: node scripts/sprint-service.js <sprint-number>');
  console.log('Example: node scripts/sprint-service.js S48');
  process.exit(1);
}

// Normalize input
sprint = sprint.toUpperCase().replace(/^S?/, 'S');

const info = SERVICES[sprint];

if (!info) {
  console.log(`Unknown sprint: ${sprint}`);
  console.log('Valid sprints: S48-S77');
  process.exit(1);
}

const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);

console.log('');
console.log('━'.repeat(55));
console.log(`  ${sprint}: ${info.name}`);
console.log('━'.repeat(55));
console.log('');
console.log(`  Service:   ${info.service}`);
console.log(`  Path:      ${info.path}`);
console.log('');

if (info.service === 'SaaS') {
  console.log('  🎨 This is a PremiumRadar SaaS sprint');
  console.log('');
  console.log(`  Branch:    feat/${sprint.toLowerCase()}-saas-${slugify(info.name)}`);
  console.log(`  Commit:    feat(saas/${sprint.toLowerCase()}): ...`);
  console.log('');
  console.log('  Focus on:');
  console.log('    • Multi-tenant UI');
  console.log('    • Auth & Identity');
  console.log('    • Billing');
  console.log('    • User experience');
} else if (info.service === 'OS') {
  console.log('  🧠 This is a UPR OS (Intelligence Engine) sprint');
  console.log('');
  console.log(`  Branch:    feat/${sprint.toLowerCase()}-os-${slugify(info.name)}`);
  console.log(`  Commit:    feat(os/${sprint.toLowerCase()}): ...`);
  console.log('');
  console.log('  Focus on:');
  console.log('    • Intelligence logic');
  console.log('    • No tenant awareness');
  console.log('    • API-first design');
  console.log('    • Context via parameters');
} else {
  console.log('  🔗 This is a SHARED sprint (both services)');
  console.log('');
  console.log(`  Branch:    feat/${sprint.toLowerCase()}-shared-${slugify(info.name)}`);
  console.log(`  Commit:    feat(shared/${sprint.toLowerCase()}): ...`);
  console.log('');
  console.log('  Focus on:');
  console.log('    • UI components in SaaS');
  console.log('    • Backend logic in OS');
  console.log('    • Clear API boundary');
}

console.log('');
console.log('━'.repeat(55));
