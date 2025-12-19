/**
 * Create S234-S240 Sprints in Notion
 * POST-PROD GOVERNANCE ROADMAP
 * Prime Directive: Nothing may weaken determinism, authority, or replayability
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

// S234-S240 Sprint Definitions (POST-PROD GOVERNANCE)
const sprints = [
  {
    number: 234,
    title: 'S234: Capability Governance Hardening',
    goal: 'Prevent capability sprawl and silent power creep',
    notes: 'capabilities.lock.json with schema, hash stored in DB, CI enforcement. Most systems rot here - we stop it early.',
    outcomes: 'capabilities.lock.json, hash verification in DB, CI check for capability changes',
    highlights: 'Immutable capability registry, no silent capability mutations',
    businessValue: 'Prevents capability sprawl. Any capability change requires explicit migration.',
    learnings: 'Capabilities are contracts. Changing them breaks trust. Lock them.',
    features: [
      { name: 'Create capabilities.lock.json schema', type: 'Feature', complexity: 'Medium', tags: ['Architecture', 'Security'] },
      { name: 'Add capability_key, description, allowed_inputs schema', type: 'Feature', complexity: 'Medium', tags: ['Database'] },
      { name: 'Add forbidden_outputs and cost_class fields', type: 'Feature', complexity: 'Low', tags: ['Database'] },
      { name: 'Store hash of capabilities.lock.json in DB', type: 'Feature', complexity: 'Medium', tags: ['Database', 'Security'] },
      { name: 'CI check: existing capability change → FAIL', type: 'Testing', complexity: 'High', tags: ['Testing', 'Security'] },
      { name: 'CI check: new capability without migration → FAIL', type: 'Testing', complexity: 'High', tags: ['Testing', 'Security'] },
    ],
  },
  {
    number: 235,
    title: 'S235: Persona Policy Compiler',
    goal: 'Eliminate hand-written persona logic forever',
    notes: 'Persona policies compiled to read-only runtime artifacts. No dynamic persona evaluation in SIVA or SaaS. Policy diff viewer.',
    outcomes: 'Compiled persona artifacts, policy diff viewer, runtime mutation detection',
    highlights: 'Persona becomes LAW, not configuration. No runtime evaluation.',
    businessValue: 'Policy changes require explicit version bump. No silent persona drift.',
    learnings: 'Persona is policy, not personality. Compile it, dont interpret it.',
    features: [
      { name: 'Design persona policy artifact format', type: 'Feature', complexity: 'High', tags: ['Architecture'] },
      { name: 'Build persona policy compiler', type: 'Feature', complexity: 'High', tags: ['API', 'Core'] },
      { name: 'Remove dynamic persona evaluation from SIVA', type: 'Feature', complexity: 'Medium', tags: ['AI', 'Security'] },
      { name: 'Remove dynamic persona evaluation from SaaS', type: 'Feature', complexity: 'Medium', tags: ['Frontend', 'Security'] },
      { name: 'Create policy diff viewer (old vs new)', type: 'Feature', complexity: 'Medium', tags: ['UI', 'Super Admin'] },
      { name: 'Test: persona mutation at runtime → hard fail', type: 'Testing', complexity: 'High', tags: ['Testing'] },
      { name: 'Test: policy change without version bump → fail', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
    ],
  },
  {
    number: 236,
    title: 'S236: Evidence Binding v1',
    goal: 'Bind outputs to evidence by construction, not intention',
    notes: 'Evidence ID required for scoring, recommendations, explanations. Capability declares requires_evidence. Missing evidence → escalate or block.',
    outcomes: 'Evidence binding enforcement, capability evidence declarations, automatic escalation',
    highlights: 'No evidence becomes a system error, not a human mistake.',
    businessValue: 'Every output is traceable to evidence. No hallucinations without provenance.',
    learnings: 'Evidence is truth. Require it by construction, not by policy.',
    features: [
      { name: 'Add requires_evidence field to capabilities', type: 'Feature', complexity: 'Low', tags: ['Database'] },
      { name: 'Enforce evidence ID for scoring calls', type: 'Feature', complexity: 'Medium', tags: ['API', 'Security'] },
      { name: 'Enforce evidence ID for recommendations', type: 'Feature', complexity: 'Medium', tags: ['API', 'Security'] },
      { name: 'Enforce evidence ID for explanations', type: 'Feature', complexity: 'Medium', tags: ['API', 'Security'] },
      { name: 'Missing evidence → escalation or block', type: 'Feature', complexity: 'High', tags: ['API', 'Security'] },
      { name: 'Test: evidence-required capability without evidence → FAIL', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
      { name: 'Test: stale evidence beyond TTL → warning/escalation', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
    ],
  },
  {
    number: 237,
    title: 'S237: Escalation UX + Human Loop',
    goal: 'Make escalation safe, visible, and unavoidable',
    notes: 'Escalation surface (UI/API), mandatory reasons enum, human decision logging, replay includes human decisions.',
    outcomes: 'Escalation UI, reasons enum, human audit trail, replay with human decisions',
    highlights: 'Humans become accountable actors, not silent patches.',
    businessValue: 'Every human override is logged. Auditors can trace human interventions.',
    learnings: 'Escalation is not failure - its governance. Make it visible.',
    features: [
      { name: 'Create escalation UI surface', type: 'Feature', complexity: 'High', tags: ['UI', 'Super Admin'] },
      { name: 'Create escalation API endpoint', type: 'Feature', complexity: 'Medium', tags: ['API'] },
      { name: 'Define mandatory escalation reasons enum', type: 'Feature', complexity: 'Low', tags: ['Database'] },
      { name: 'Implement human decision logging', type: 'Feature', complexity: 'Medium', tags: ['Database', 'Security'] },
      { name: 'Include human decisions in replay', type: 'Feature', complexity: 'High', tags: ['API', 'Core'] },
      { name: 'Test: risk ≥ threshold without escalation → FAIL', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
      { name: 'Test: human override without audit → FAIL', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
    ],
  },
  {
    number: 238,
    title: 'S238: Capability Cost & Latency Budgets',
    goal: 'Stop cost explosions before finance notices',
    notes: 'Per-capability: max_tokens, max_latency, allowed_models. Router auto-downgrade rules. Budget breach alerts.',
    outcomes: 'Capability budgets, auto-downgrade, breach alerting',
    highlights: 'Cost control is systemic, not reactive.',
    businessValue: 'No surprise bills. Budget enforcement at the capability level.',
    learnings: 'Budget is a constraint, not a suggestion. Enforce it.',
    features: [
      { name: 'Add max_tokens per capability', type: 'Feature', complexity: 'Low', tags: ['Database'] },
      { name: 'Add max_latency per capability', type: 'Feature', complexity: 'Low', tags: ['Database'] },
      { name: 'Add allowed_models per capability', type: 'Feature', complexity: 'Medium', tags: ['Database'] },
      { name: 'Implement router auto-downgrade rules', type: 'Feature', complexity: 'High', tags: ['API', 'AI'] },
      { name: 'Create budget breach alerting system', type: 'Feature', complexity: 'Medium', tags: ['API', 'Backend'] },
      { name: 'Test: capability exceeds budget silently → FAIL', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
      { name: 'Test: router substitution without log → FAIL', type: 'Testing', complexity: 'Medium', tags: ['Testing'] },
    ],
  },
  {
    number: 239,
    title: 'S239: Multi-Tenant Blast Radius Controls',
    goal: 'One tenant can never poison another',
    notes: 'Tenant-isolated: capability usage, cost budgets, evidence pools. Rate limits per tenant. Kill-switch per tenant.',
    outcomes: 'Tenant isolation, rate limits, kill-switch, cross-tenant protection',
    highlights: 'Enterprise-ready isolation. One bad tenant cannot affect others.',
    businessValue: 'Enterprise customers require isolation guarantees. This delivers it.',
    learnings: 'Multi-tenancy is about blast radius. Contain failures.',
    features: [
      { name: 'Tenant-isolated capability usage tracking', type: 'Feature', complexity: 'High', tags: ['Database', 'Security'] },
      { name: 'Tenant-isolated cost budgets', type: 'Feature', complexity: 'Medium', tags: ['Database', 'API'] },
      { name: 'Tenant-isolated evidence pools', type: 'Feature', complexity: 'High', tags: ['Database', 'Security'] },
      { name: 'Per-tenant rate limits', type: 'Feature', complexity: 'Medium', tags: ['API', 'Security'] },
      { name: 'Per-tenant kill-switch', type: 'Feature', complexity: 'Medium', tags: ['API', 'Super Admin'] },
      { name: 'Test: cross-tenant data access → FAIL', type: 'Testing', complexity: 'High', tags: ['Testing', 'Security'] },
      { name: 'Test: tenant overrun affecting others → FAIL', type: 'Testing', complexity: 'High', tags: ['Testing', 'Security'] },
    ],
  },
  {
    number: 240,
    title: 'S240: Constitutional Freeze + Externalization',
    goal: 'Lock the system and prepare to scale humans, not chaos',
    notes: 'UPR_CONSTITUTION.md, public architecture narrative, internal contributor handbook, final no-exceptions statement.',
    outcomes: 'UPR_CONSTITUTION.md, architecture docs, contributor handbook',
    highlights: 'The system outlives individuals. Freeze the constitution.',
    businessValue: 'Scalable governance. New contributors cannot break the system.',
    learnings: 'Constitution is law. Everything else is negotiable.',
    features: [
      { name: 'Write UPR_CONSTITUTION.md', type: 'Feature', complexity: 'High', tags: ['Architecture'] },
      { name: 'Create public architecture narrative (sanitized)', type: 'Feature', complexity: 'Medium', tags: ['Architecture'] },
      { name: 'Write internal contributor handbook', type: 'Feature', complexity: 'Medium', tags: ['Architecture'] },
      { name: 'Final "no exceptions" statement', type: 'Feature', complexity: 'Low', tags: ['Architecture'] },
      { name: 'Capability Review Checklist', type: 'Feature', complexity: 'Low', tags: ['Architecture'] },
      { name: 'Contributor PR Template', type: 'Feature', complexity: 'Low', tags: ['Architecture'] },
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
    'Status': { select: { name: 'Backlog' } },
    'Repo': { select: { name: 'OS' } },
    'Goal': { rich_text: [{ text: { content: sprint.goal } }] },
    'Sprint Notes': { rich_text: [{ text: { content: sprint.notes } }] },
    'Outcomes': { rich_text: [{ text: { content: sprint.outcomes } }] },
    'Highlights': { rich_text: [{ text: { content: sprint.highlights } }] },
    'Business Value': { rich_text: [{ text: { content: sprint.businessValue } }] },
    'Learnings': { rich_text: [{ text: { content: sprint.learnings } }] },
    'Synced At': { date: { start: TODAY } },
  };

  let sprintPageId;
  if (existing.results.length > 0) {
    const page = existing.results[0];
    await notion.pages.update({
      page_id: page.id,
      properties,
    });
    sprintPageId = page.id;
    console.log(`  Updated sprint: ${sprint.title}`);
  } else {
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
      'Status': { select: { name: 'Backlog' } },
      'Repo': { select: { name: 'OS' } },
      'Priority': { select: { name: 'High' } },
      'Complexity': { select: { name: feature.complexity } },
      'Type': { select: { name: feature.type } },
      'Notes': { rich_text: [{ text: { content: `Part of ${sprint.title}` } }] },
      'Tags': { multi_select: feature.tags.map(t => ({ name: t })) },
      'Assignee': { rich_text: [{ text: { content: 'Claude (TC)' } }] },
      'Done?': { checkbox: false },
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
  console.log('CREATING S234-S240 POST-PROD GOVERNANCE ROADMAP');
  console.log('Prime Directive: Nothing may weaken determinism, authority, or replayability');
  console.log('='.repeat(70));

  for (const sprint of sprints) {
    await createOrUpdateSprint(sprint);
    await createFeatures(sprint);
  }

  console.log('\n' + '='.repeat(70));
  console.log('NOTION CREATION COMPLETE');
  console.log('='.repeat(70));

  // Summary
  const totalFeatures = sprints.reduce((acc, s) => acc + s.features.length, 0);
  console.log(`\n## Notion Creation Complete`);
  console.log(`\n**Repo:** OS`);
  console.log(`**Sprints Created:** ${sprints.length} (S234-S240)`);
  console.log(`**Features Created:** ${totalFeatures}`);
  console.log(`\n### Sprint Breakdown:`);
  console.log(`| Sprint | Goal | Features |`);
  console.log(`|--------|------|----------|`);
  for (const s of sprints) {
    console.log(`| S${s.number} | ${s.goal.substring(0, 40)}... | ${s.features.length} |`);
  }
  console.log(`\n**Status:** All marked as Backlog`);
  console.log(`\n**AWAITING APPROVAL**`);
  console.log(`\nView in Notion:`);
  console.log(`- Sprints: https://www.notion.so/5c32e26d641a4711a9fb619703943fb9`);
  console.log(`- Features: https://www.notion.so/26ae5afe4b5f4d97b4025c459f188944`);
  console.log(`\nReply "approved" to begin execution.`);
}

main().catch(console.error);
