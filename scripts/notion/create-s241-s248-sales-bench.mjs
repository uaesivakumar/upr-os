/**
 * Create S241-S248 Sales-Bench v1 Sprints in Notion
 * PRD v1.3 Appendix Aligned
 *
 * Clarifications incorporated:
 * 1. Correlation: Spearman rank, same vertical+sub_vertical, n≥30, scenario-level
 * 2. Buyer Bot: Seed per ScenarioRun, persist seed, replay identical
 * 3. Advisory: CRS never alters SIVA runtime
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

// S241-S248 Sales-Bench v1 Sprint Definitions
const sprints = [
  // PHASE A: Core Schemas + Storage
  {
    number: 241,
    title: 'S241: Sales-Bench Foundation',
    goal: 'Establish isolated schema and core types for Sales-Bench',
    notes: 'Phase A. PRD v1.3 §2.1. Creates /os/sales-bench/ module, sales_bench schema, sales_scenarios and scenario_runs tables. Authority invariance foundation.',
    outcomes: 'sales_bench PostgreSQL schema, SalesScenario type, ScenarioRun type, hash verification, authority guards',
    highlights: 'Isolated schema prevents production contamination. Hash immutability enforced.',
    businessValue: 'Foundation for behavioral evaluation system. Enables SIVA quality measurement.',
    learnings: 'To be filled upon completion',
    features: [
      { name: 'Create /os/sales-bench/ module structure', type: 'Infrastructure', complexity: 'Medium', tags: ['Architecture'] },
      { name: 'Create sales_bench PostgreSQL schema (isolated)', type: 'Infrastructure', complexity: 'Low', tags: ['Database'] },
      { name: 'Implement SalesScenario type + table', type: 'Feature', complexity: 'Medium', tags: ['Database', 'Core'] },
      { name: 'Implement ScenarioRun type + table with seed field', type: 'Feature', complexity: 'Medium', tags: ['Database', 'Core'] },
      { name: 'Add hash verification for scenario immutability', type: 'Feature', complexity: 'Medium', tags: ['Security'] },
      { name: 'Authority invariance guard (foundation)', type: 'Feature', complexity: 'High', tags: ['Security'] },
    ],
  },
  {
    number: 242,
    title: 'S242: Scenario Management API',
    goal: 'Internal API for scenario CRUD (create, read - no update/delete)',
    notes: 'Phase A. PRD v1.3 §2.1, §7.3. Cross-vertical aggregation guard. Single vertical queries only.',
    outcomes: 'POST/GET /api/os/sales-bench/scenarios, validation, cross-vertical guard, vertical indexing',
    highlights: 'Scenarios are immutable after creation. Cross-vertical queries rejected.',
    businessValue: 'Enables scenario management for behavioral testing.',
    learnings: 'To be filled upon completion',
    features: [
      { name: 'Scenario creation endpoint', type: 'Feature', complexity: 'Medium', tags: ['API'] },
      { name: 'Scenario retrieval endpoint', type: 'Feature', complexity: 'Low', tags: ['API'] },
      { name: 'Scenario list endpoint with filters', type: 'Feature', complexity: 'Medium', tags: ['API'] },
      { name: 'Scenario validation logic', type: 'Feature', complexity: 'Medium', tags: ['Core', 'Security'] },
      { name: 'Cross-vertical aggregation guard (PRD §7.3)', type: 'Feature', complexity: 'High', tags: ['Security'] },
      { name: 'Vertical indexing for queries', type: 'Feature', complexity: 'Low', tags: ['Database'] },
    ],
  },
  // PHASE B: Buyer Bot Engine
  {
    number: 243,
    title: 'S243: Buyer Bot Framework',
    goal: 'Implement constitutional Buyer Bot structure with deterministic seeding',
    notes: 'Phase B. PRD v1.3 §5.1, §5.3. Hidden states, objection patterns, failure triggers, termination rules. Seed per ScenarioRun for replay.',
    outcomes: 'buyer_bots table, BuyerBot type, hidden states engine, failure triggers, behavioral variants, deterministic seeding',
    highlights: 'Buyer Bots are test harnesses with rules, not chatty simulators. Seed ensures replay reproduces identical behavior.',
    businessValue: 'Constitutional testing framework for SIVA sales behavior.',
    learnings: 'To be filled upon completion',
    features: [
      { name: 'Create buyer_bots table', type: 'Infrastructure', complexity: 'Medium', tags: ['Database'] },
      { name: 'Implement BuyerBot type with properties', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
      { name: 'Hidden states engine', type: 'Feature', complexity: 'High', tags: ['Core', 'AI'] },
      { name: 'Objection patterns engine', type: 'Feature', complexity: 'Medium', tags: ['Core', 'AI'] },
      { name: 'Failure triggers engine', type: 'Feature', complexity: 'High', tags: ['Core', 'Security'] },
      { name: 'Termination rules engine', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
      { name: 'Behavioral variants selector with deterministic seed', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
    ],
  },
  {
    number: 244,
    title: 'S244: Mandatory Adversarial Bots',
    goal: 'Create required adversarial bots per PRD v1.3 §5.2',
    notes: 'Phase B. PRD v1.3 §5.2. Guaranteed returns, AML structuring, competitor data. Kill Path scenarios where winning means refusing.',
    outcomes: 'mandatory_adversarial_coverage table, Banking adversarial bots, coverage validation, Kill Path association',
    highlights: 'Adversarial bots test refusal behavior. BLOCK on any attempt to close forbidden deals.',
    businessValue: 'Regulatory compliance testing. Ensures SIVA refuses illegal/unethical requests.',
    learnings: 'To be filled upon completion',
    features: [
      { name: 'Create mandatory_adversarial_coverage table', type: 'Infrastructure', complexity: 'Low', tags: ['Database'] },
      { name: 'Implement Guaranteed Returns adversarial bot', type: 'Feature', complexity: 'Medium', tags: ['AI', 'Security'] },
      { name: 'Implement AML Structuring adversarial bot', type: 'Feature', complexity: 'Medium', tags: ['AI', 'Security'] },
      { name: 'Implement Competitor Data adversarial bot', type: 'Feature', complexity: 'Medium', tags: ['AI', 'Security'] },
      { name: 'Adversarial coverage validation', type: 'Feature', complexity: 'Medium', tags: ['Security', 'Testing'] },
      { name: 'Kill Path association logic', type: 'Feature', complexity: 'Low', tags: ['Core'] },
    ],
  },
  // PHASE C: CRS Engine
  {
    number: 245,
    title: 'S245: CRS Foundation',
    goal: 'Implement CRS scoring infrastructure with all 8 dimensions',
    notes: 'Phase C. PRD v1.3 §4.2, §4.3. Machine-observable evidence (not prose). BLOCK bypasses CRS. CRS is ADVISORY ONLY - never alters SIVA runtime.',
    outcomes: 'crs_scores table, CRSScore type, CRSDimensions type (8), weights constant, weighted computation, evidence schema',
    highlights: 'CRS is advisory only. Evidence must be structured JSON. BLOCK outcome = CRS score 0.',
    businessValue: 'Behavioral quality measurement. Correlation with sales outcomes.',
    learnings: 'To be filled upon completion',
    features: [
      { name: 'Create crs_scores table', type: 'Infrastructure', complexity: 'Medium', tags: ['Database'] },
      { name: 'Implement CRSScore type', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
      { name: 'Implement CRSDimensions type (8 dimensions)', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
      { name: 'CRS weights constant (locked per §4.2)', type: 'Feature', complexity: 'Low', tags: ['Core'] },
      { name: 'Weighted score computation', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
      { name: 'Machine-observable evidence schema (not prose)', type: 'Feature', complexity: 'High', tags: ['Core', 'AI'] },
      { name: 'BLOCK bypass logic (CRS=0 on BLOCK)', type: 'Feature', complexity: 'Low', tags: ['Core', 'Security'] },
    ],
  },
  {
    number: 246,
    title: 'S246: CRS Dimension Scoring',
    goal: 'Implement scoring logic for all 8 CRS dimensions',
    notes: 'Phase C. PRD v1.3 §4.2. All weights locked. Policy Discipline is hard gate (not part of CRS score).',
    outcomes: '8 dimension scorers, Policy Discipline hard gate, aggregate CRS computation',
    highlights: 'Decision Compression (0.20), Action Bias (0.20), Objection Handling (0.15), and 5 more dimensions.',
    businessValue: 'Granular sales behavior quality measurement.',
    learnings: 'To be filled upon completion',
    features: [
      { name: 'Decision Compression scorer (0.20)', type: 'Feature', complexity: 'High', tags: ['AI', 'Core'] },
      { name: 'Action Bias scorer (0.20)', type: 'Feature', complexity: 'High', tags: ['AI', 'Core'] },
      { name: 'Objection Handling scorer (0.15)', type: 'Feature', complexity: 'High', tags: ['AI', 'Core'] },
      { name: 'Vertical Language Accuracy scorer (0.10)', type: 'Feature', complexity: 'Medium', tags: ['AI', 'Core'] },
      { name: 'Persona Assertiveness scorer (0.10)', type: 'Feature', complexity: 'Medium', tags: ['AI', 'Core'] },
      { name: 'Information Elicitation scorer (0.10)', type: 'Feature', complexity: 'Medium', tags: ['AI', 'Core'] },
      { name: 'Qualification Accuracy scorer (0.10)', type: 'Feature', complexity: 'Medium', tags: ['AI', 'Core'] },
      { name: 'Escalation Correctness scorer (0.05)', type: 'Feature', complexity: 'Medium', tags: ['AI', 'Core'] },
      { name: 'Policy Discipline hard gate', type: 'Feature', complexity: 'High', tags: ['Security'] },
    ],
  },
  // PHASE D: Path Execution
  {
    number: 247,
    title: 'S247: Golden & Kill Path Execution',
    goal: 'Execute scenarios with correct path handling and full replayability',
    notes: 'Phase D. PRD v1.3 §6.1, §6.2. Golden Path = step-wise adherence. Kill Path = correct refusal. Seed ensures replay identical.',
    outcomes: 'Execution engine, SIVA invocation, Buyer Bot handler, Golden/Kill path validation, run logging, replay verification',
    highlights: 'Same SIVA path as production. Seed-based determinism. Full audit trail.',
    businessValue: 'End-to-end behavioral testing with replay capability.',
    learnings: 'To be filled upon completion',
    features: [
      { name: 'Scenario execution engine', type: 'Feature', complexity: 'High', tags: ['Core'] },
      { name: 'SIVA invocation (production path)', type: 'Feature', complexity: 'High', tags: ['AI', 'API'] },
      { name: 'Buyer Bot conversation handler with seed', type: 'Feature', complexity: 'High', tags: ['AI', 'Core'] },
      { name: 'Golden Path step-wise validation (§6.1)', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
      { name: 'Kill Path refusal detection (§6.2)', type: 'Feature', complexity: 'Medium', tags: ['Core', 'Security'] },
      { name: 'Hard outcome determination (BLOCK > FAIL > PASS)', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
      { name: 'Full run logging (append-only)', type: 'Feature', complexity: 'Medium', tags: ['Database'] },
      { name: 'Replayability verification', type: 'Feature', complexity: 'High', tags: ['Testing'] },
    ],
  },
  // PHASE E: Human Calibration
  {
    number: 248,
    title: 'S248: Human Calibration Tooling',
    goal: 'Internal CLI for calibration workflow with Spearman correlation',
    notes: 'Phase E. PRD v1.3 §4.4. Spearman rank correlation, same vertical+sub_vertical only, n≥30 scenarios, scenario-level comparison. CALIBRATION_ADMIN role required for approval.',
    outcomes: 'crs_calibrations table, calibration run, human baseline ingestion, Spearman correlation, CLI commands, approver roles',
    highlights: 'Human calibration before GA. Correlation must be computed scenario-level, not aggregates. Internal CLI only.',
    businessValue: 'CRS thresholds calibrated against real human sales performance.',
    learnings: 'To be filled upon completion',
    features: [
      { name: 'Create crs_calibrations table', type: 'Infrastructure', complexity: 'Medium', tags: ['Database'] },
      { name: 'Calibration run structure', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
      { name: 'Human baseline data ingestion (CSV/JSON)', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
      { name: 'CRS distribution computation', type: 'Feature', complexity: 'High', tags: ['Core', 'AI'] },
      { name: 'Percentile threshold calculation (25/50/75)', type: 'Feature', complexity: 'Medium', tags: ['Core'] },
      { name: 'SIVA comparison run trigger', type: 'Feature', complexity: 'Medium', tags: ['Core', 'AI'] },
      { name: 'Spearman rank correlation (n≥30, scenario-level)', type: 'Feature', complexity: 'High', tags: ['Core'] },
      { name: 'Calibration approver roles (CALIBRATION_ADMIN)', type: 'Feature', complexity: 'Medium', tags: ['Security'] },
      { name: 'CLI commands (calibrate, status, approve)', type: 'Feature', complexity: 'Medium', tags: ['API'] },
    ],
  },
];

async function createOrUpdateSprint(sprint) {
  console.log(`\nProcessing ${sprint.title}...`);

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
      'Notes': { rich_text: [{ text: { content: `Part of ${sprint.title}. PRD v1.3 aligned.` } }] },
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
  console.log('CREATING S241-S248 SALES-BENCH v1 SPRINTS');
  console.log('PRD v1.3 Appendix Aligned');
  console.log('='.repeat(70));
  console.log('\nClarifications incorporated:');
  console.log('1. Correlation: Spearman rank, same vertical+sub_vertical, n≥30');
  console.log('2. Buyer Bot: Seed per ScenarioRun, replay identical');
  console.log('3. Advisory: CRS never alters SIVA runtime');
  console.log('');

  for (const sprint of sprints) {
    await createOrUpdateSprint(sprint);
    await createFeatures(sprint);
  }

  console.log('\n' + '='.repeat(70));
  console.log('NOTION CREATION COMPLETE');
  console.log('='.repeat(70));

  const totalFeatures = sprints.reduce((acc, s) => acc + s.features.length, 0);
  console.log(`\n## Sales-Bench v1 Sprints Created`);
  console.log(`\n**Repo:** OS`);
  console.log(`**Sprints Created:** ${sprints.length} (S241-S248)`);
  console.log(`**Features Created:** ${totalFeatures}`);
  console.log(`\n### Phase Breakdown:`);
  console.log(`| Phase | Sprints | Goal |`);
  console.log(`|-------|---------|------|`);
  console.log(`| A | S241-S242 | Core schemas + storage |`);
  console.log(`| B | S243-S244 | Buyer Bot engine |`);
  console.log(`| C | S245-S246 | CRS engine (8 dimensions) |`);
  console.log(`| D | S247 | Golden/Kill path execution |`);
  console.log(`| E | S248 | Human calibration tooling |`);
  console.log(`\n**Status:** All marked as Backlog`);
  console.log(`\n**V1 STOP:** After S248 - hold for real traffic before v2`);
}

main().catch(console.error);
