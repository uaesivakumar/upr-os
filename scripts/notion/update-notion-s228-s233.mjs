/**
 * Update Notion with S228-S233 Sprint Data
 * Model Capability Routing - Production Go-Live December 2025
 */

import { Client } from '@notionhq/client';

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) {
  console.error('NOTION_TOKEN not set');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';
const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

const TODAY = new Date().toISOString().split('T')[0];

// S228-S233 Sprint Definitions
const sprints = [
  {
    number: 228,
    title: 'S228: Capability Registry Core',
    goal: 'Create the capability abstraction layer that hides model names from SIVA',
    notes: 'SIVA never sees model names. 6 core capabilities defined: summarize_fast, reason_deep, classify_cheap, extract_structured, draft_safe, chat_low_risk',
    outcomes: 'os_model_capabilities table, model-capability mappings, get_models_for_capability() function',
    highlights: 'Capability abstraction is the key insight that commoditizes AI models',
    businessValue: 'When GPT-5 launches, we flip a config. SIVA code unchanged.',
    learnings: 'Each capability has latency_class, risk_class, replay_tolerance. Models declare which capabilities they support.',
    features: [
      { name: 'Create os_model_capabilities table', type: 'Feature', complexity: 'Medium', tags: ['Database', 'Architecture'] },
      { name: 'Define 6 core capabilities with metadata', type: 'Feature', complexity: 'Low', tags: ['Database'] },
      { name: 'Create model-capability mapping table', type: 'Feature', complexity: 'Medium', tags: ['Database'] },
      { name: 'Implement get_models_for_capability() function', type: 'Feature', complexity: 'Medium', tags: ['API', 'AI'] },
      { name: 'Add capability columns to llm_models table', type: 'Feature', complexity: 'Low', tags: ['Database'] },
      { name: 'Seed model-capability mappings for existing models', type: 'Feature', complexity: 'Low', tags: ['Database'] },
    ],
  },
  {
    number: 229,
    title: 'S229: Persona Capability Policy',
    goal: 'Enforce capability whitelist/blacklist per persona before routing',
    notes: 'If capability not in allowed_capabilities → 403 DENIED. If in forbidden_capabilities → denial wins (blacklist over whitelist)',
    outcomes: 'authorize_capability() function, os_capability_denials table, persona policy columns',
    highlights: 'Authorization happens BEFORE routing - deny fast, never invoke SIVA on denial',
    businessValue: 'Free tier cant access expensive reasoning. Enterprise gets all capabilities.',
    learnings: 'Blacklist always wins over whitelist. Every denial logged for audit.',
    features: [
      { name: 'Add allowed_capabilities to os_persona_policies', type: 'Feature', complexity: 'Low', tags: ['Database'] },
      { name: 'Add forbidden_capabilities to os_persona_policies', type: 'Feature', complexity: 'Low', tags: ['Database'] },
      { name: 'Implement authorize_capability() function', type: 'Feature', complexity: 'High', tags: ['API', 'Security'] },
      { name: 'Create os_capability_denials table', type: 'Feature', complexity: 'Medium', tags: ['Database'] },
      { name: 'Create authorize-capability API endpoint', type: 'Feature', complexity: 'Medium', tags: ['API'] },
      { name: 'Add budget constraints (max_cost_per_call, max_latency_ms)', type: 'Feature', complexity: 'Medium', tags: ['Database', 'API'] },
    ],
  },
  {
    number: 230,
    title: 'S230: Deterministic Model Router',
    goal: 'Route capability requests to models with fixed weights, no randomness',
    notes: 'Same inputs = same model. Fixed weights: 50% stability, 30% cost, 20% latency. Ties broken by model_id.',
    outcomes: 'selectModel() function, routing score formula, os_routing_decisions table',
    highlights: '10 identical requests = same model 10 times. No randomness. No load balancing.',
    businessValue: 'Every decision explainable. Auditors can verify any decision is reproducible.',
    learnings: 'Determinism is critical for debugging, audit, and trust. No AI magic - everything explainable.',
    features: [
      { name: 'Implement selectModel() function with fixed weights', type: 'Feature', complexity: 'High', tags: ['AI', 'API'] },
      { name: 'Create routing score formula (stability/cost/latency)', type: 'Feature', complexity: 'Medium', tags: ['AI'] },
      { name: 'Create os_routing_decisions table', type: 'Feature', complexity: 'Medium', tags: ['Database'] },
      { name: 'Implement budget gating (exclude over-budget models)', type: 'Feature', complexity: 'Medium', tags: ['API'] },
      { name: 'Add NO_ELIGIBLE_MODEL hard failure', type: 'Feature', complexity: 'Low', tags: ['API'] },
    ],
  },
  {
    number: 231,
    title: 'S231: Replay Safety',
    goal: 'Make every routing decision replayable with deviation detection',
    notes: 'Append-only routing log. On replay: exact model or deviation flagged. No silent substitutions.',
    outcomes: 'resolve_model_for_replay() function, interaction_id column, v_routing_decision_audit view',
    highlights: 'If original model unavailable, deviation is FLAGGED not hidden. Replay is law.',
    businessValue: 'Compliance: auditors can verify what happened on March 15th at 2pm.',
    learnings: 'No overwrites. No updates. Append-only. Replay is exact or flagged, never hidden.',
    features: [
      { name: 'Add interaction_id column to os_routing_decisions', type: 'Feature', complexity: 'Low', tags: ['Database'] },
      { name: 'Implement resolve_model_for_replay() function', type: 'Feature', complexity: 'High', tags: ['Database', 'API'] },
      { name: 'Create v_routing_decision_audit view', type: 'Feature', complexity: 'Medium', tags: ['Database'] },
      { name: 'Implement replayInteraction() in model-router.js', type: 'Feature', complexity: 'Medium', tags: ['API'] },
      { name: 'Add deviation_reason enum (MODEL_INACTIVE, MODEL_INELIGIBLE, etc)', type: 'Feature', complexity: 'Low', tags: ['Database'] },
    ],
  },
  {
    number: 232,
    title: 'S232: Model Radar UI',
    goal: 'Super Admin visibility into capabilities, models, and routing decisions',
    notes: 'UI observes only, never controls. Eligibility toggle is resource control, not routing override.',
    outcomes: 'Model Radar page in Super Admin, capabilities/models/routing-decisions API endpoints',
    highlights: 'NO force_model, NO default_model override. The UI is a window, not a door.',
    businessValue: 'Admins can see whats happening without being able to game the system.',
    learnings: 'Read-only admin UI builds trust. All decisions explainable by algorithm.',
    features: [
      { name: 'Create Model Radar page in Super Admin', type: 'Feature', complexity: 'High', tags: ['UI', 'Super Admin'] },
      { name: 'Build Capability Registry Grid component', type: 'Feature', complexity: 'Medium', tags: ['UI'] },
      { name: 'Build Model Table with capability chips', type: 'Feature', complexity: 'Medium', tags: ['UI'] },
      { name: 'Implement eligibility toggle (is_eligible)', type: 'Feature', complexity: 'Low', tags: ['API', 'UI'] },
      { name: 'Build Routing Decision Viewer with filters', type: 'Feature', complexity: 'Medium', tags: ['UI'] },
      { name: 'Create routing-decisions API endpoint', type: 'Feature', complexity: 'Medium', tags: ['API'] },
      { name: 'Block force_model and override attempts (405)', type: 'Feature', complexity: 'Low', tags: ['Security'] },
    ],
  },
  {
    number: 233,
    title: 'S233: Capability Routing Validation Suite',
    goal: 'Prove the full chain is non-bypassable with 23 automated tests',
    notes: 'Tests prove: Authority → Persona Policy → Capability Authorization → Model Router → Routing Log → Replay',
    outcomes: 's233-capability-routing.test.js with 23 tests, FK fix migration',
    highlights: 'Found and fixed FK CASCADE bug - changed to RESTRICT. Fix the architecture, then retest.',
    businessValue: 'CI can verify routing chain integrity on every deploy.',
    learnings: 'Validation tests found real architecture bug (FK CASCADE). Dont patch around issues - fix the architecture.',
    features: [
      { name: 'Create comprehensive validation test suite', type: 'Testing', complexity: 'High', tags: ['Testing'] },
      { name: 'Test 1: Capability Registry Integrity (3 tests)', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
      { name: 'Test 2: Persona Whitelist Enforcement (4 tests)', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
      { name: 'Test 3: Forbidden Overrides Allowed (2 tests)', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
      { name: 'Test 4: Budget Gating (3 tests)', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
      { name: 'Test 5: Deterministic Routing (2 tests)', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
      { name: 'Test 6: Eligibility Toggle (3 tests)', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
      { name: 'Test 7: Replay Determinism (6 tests)', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
      { name: 'Fix FK constraint CASCADE → RESTRICT', type: 'Bug', complexity: 'Low', tags: ['Database', 'Security'] },
    ],
  },
];

async function createOrUpdateSprint(sprint) {
  console.log(`\nProcessing ${sprint.title}...`);

  // Check if sprint exists
  const existing = await notion.databases.query({
    database_id: SPRINTS_DB,
    filter: {
      property: 'Sprint',
      title: { contains: `S${sprint.number}:` },
    },
  });

  const properties = {
    'Sprint': { title: [{ text: { content: sprint.title } }] },
    'Status': { select: { name: 'Done' } },
    'Repo': { select: { name: 'OS' } },
    'Goal': { rich_text: [{ text: { content: sprint.goal } }] },
    'Sprint Notes': { rich_text: [{ text: { content: sprint.notes } }] },
    'Outcomes': { rich_text: [{ text: { content: sprint.outcomes } }] },
    'Highlights': { rich_text: [{ text: { content: sprint.highlights } }] },
    'Business Value': { rich_text: [{ text: { content: sprint.businessValue } }] },
    'Learnings': { rich_text: [{ text: { content: sprint.learnings } }] },
    'Completed At': { date: { start: TODAY } },
    'Synced At': { date: { start: TODAY } },
  };

  let sprintPageId;
  if (existing.results.length > 0) {
    // Update existing
    const page = existing.results[0];
    await notion.pages.update({
      page_id: page.id,
      properties,
    });
    sprintPageId = page.id;
    console.log(`  Updated sprint: ${sprint.title}`);
  } else {
    // Create new
    const page = await notion.pages.create({
      parent: { database_id: SPRINTS_DB },
      properties,
    });
    sprintPageId = page.id;
    console.log(`  Created sprint: ${sprint.title}`);
  }

  return sprintPageId;
}

async function createFeatures(sprint) {
  console.log(`  Creating ${sprint.features.length} features...`);

  for (const feature of sprint.features) {
    // Check if feature exists
    const existing = await notion.databases.query({
      database_id: FEATURES_DB,
      filter: {
        and: [
          { property: 'Sprint', number: { equals: sprint.number } },
          { property: 'Features', title: { contains: feature.name.substring(0, 30) } },
        ],
      },
    });

    const properties = {
      'Features': { title: [{ text: { content: feature.name } }] },
      'Sprint': { number: sprint.number },
      'Status': { select: { name: 'Done' } },
      'Repo': { select: { name: 'OS' } },
      'Priority': { select: { name: 'High' } },
      'Complexity': { select: { name: feature.complexity } },
      'Type': { select: { name: feature.type } },
      'Notes': { rich_text: [{ text: { content: `Part of ${sprint.title}` } }] },
      'Tags': { multi_select: feature.tags.map(t => ({ name: t })) },
      'Assignee': { rich_text: [{ text: { content: 'Claude (TC)' } }] },
      'Done?': { checkbox: true },
      'Completed At': { date: { start: TODAY } },
    };

    if (existing.results.length > 0) {
      await notion.pages.update({
        page_id: existing.results[0].id,
        properties,
      });
      console.log(`    Updated: ${feature.name.substring(0, 40)}...`);
    } else {
      await notion.pages.create({
        parent: { database_id: FEATURES_DB },
        properties,
      });
      console.log(`    Created: ${feature.name.substring(0, 40)}...`);
    }
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('UPDATING NOTION WITH S228-S233 SPRINT DATA');
  console.log('Model Capability Routing - Production Go-Live December 2025');
  console.log('='.repeat(70));

  for (const sprint of sprints) {
    await createOrUpdateSprint(sprint);
    await createFeatures(sprint);
  }

  console.log('\n' + '='.repeat(70));
  console.log('NOTION UPDATE COMPLETE');
  console.log('='.repeat(70));

  // Summary
  const totalFeatures = sprints.reduce((acc, s) => acc + s.features.length, 0);
  console.log(`\nSummary:`);
  console.log(`  Sprints updated: ${sprints.length} (S228-S233)`);
  console.log(`  Features created/updated: ${totalFeatures}`);
  console.log(`  Status: All marked as Done`);
  console.log(`  Repo: OS`);
}

main().catch(console.error);
