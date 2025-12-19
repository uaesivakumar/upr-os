/**
 * Update Notion with S241-S248 Sales-Bench v1 Sprints
 * PRD v1.3 Appendix - Behavioral Evaluation System for SIVA
 */

import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';
const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

const TODAY = new Date().toISOString().split('T')[0];

// S241-S248 Sprint definitions
const SPRINTS = [
  {
    number: 241,
    title: 'S241: Sales-Bench Foundation',
    goal: 'Establish Sales-Bench module with types, guards, and authority invariance',
    notes: 'PRD v1.3 Appendix §0-§2. Foundation for SIVA behavioral evaluation. Advisory only - never alters runtime.',
    outcomes: 'Types: SalesScenario, ScenarioRun. Guards: AuthorityInvariance. Cross-vertical prohibition.',
    highlights: 'SalesScenario as primary eval unit. Versioned, immutable, replayable. BLOCK overrides all outcomes.',
    businessValue: 'Enables systematic SIVA behavioral testing without production impact.',
    learnings: 'Authority invariance is critical - Sales-Bench must never modify envelopes/personas/policies.',
    features: [
      { name: 'SalesScenario type definition', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Types', 'Foundation'] },
      { name: 'ScenarioRun type with deterministic seeding', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Types', 'Foundation'] },
      { name: 'Authority invariance guards', priority: 'High', complexity: 'High', type: 'Feature', tags: ['Security', 'Guards'] },
      { name: 'Cross-vertical aggregation prohibition', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['PRD', 'Compliance'] },
      { name: 'Hard outcome precedence (PASS/FAIL/BLOCK)', priority: 'Medium', complexity: 'Low', type: 'Feature', tags: ['Types'] },
    ],
  },
  {
    number: 242,
    title: 'S242: Scenario Management API',
    goal: 'Build scenario and run storage with CRUD endpoints',
    notes: 'PRD v1.3 §2.1. Scenarios are immutable after creation. Runs are append-only.',
    outcomes: 'scenario-store.js, run-store.js, /scenarios and /runs API routes.',
    highlights: 'Scenarios versioned with content hash. Runs use deterministic seeds for replay.',
    businessValue: 'Central repository for all Sales-Bench test scenarios.',
    learnings: 'Immutability ensures reproducible evaluations across time.',
    features: [
      { name: 'Scenario storage (scenario-store.js)', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Storage', 'Database'] },
      { name: 'Run storage with append-only semantics', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Storage', 'Database'] },
      { name: 'GET/POST/DELETE /scenarios endpoints', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['API'] },
      { name: 'GET/POST /runs endpoints', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['API'] },
      { name: 'Scenario versioning with content hash', priority: 'Medium', complexity: 'Medium', type: 'Feature', tags: ['Versioning'] },
      { name: 'Cross-vertical guard on scenario queries', priority: 'Medium', complexity: 'Low', type: 'Feature', tags: ['Security'] },
    ],
  },
  {
    number: 243,
    title: 'S243: Buyer Bot Framework',
    goal: 'Implement Buyer Bot types, storage, and response engine',
    notes: 'PRD v1.3 §5. Constitutional test harnesses with hidden states and failure triggers.',
    outcomes: 'buyer-bot.js types, buyer-bot-store.js, buyer-bot-engine.js, /buyer-bots API.',
    highlights: 'Hidden states (budget_exhausted, competitor_committed). Failure triggers. Behavioral variants.',
    businessValue: 'Simulated buyers for testing SIVA sales conversations.',
    learnings: 'Deterministic seeding per run ensures replay produces identical bot behavior.',
    features: [
      { name: 'BuyerBot type with hidden states', priority: 'High', complexity: 'High', type: 'Feature', tags: ['Types', 'AI'] },
      { name: 'Failure trigger definitions', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Types'] },
      { name: 'BotVariant for behavioral variation', priority: 'Medium', complexity: 'Medium', type: 'Feature', tags: ['Types'] },
      { name: 'Buyer Bot storage (buyer-bot-store.js)', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Storage', 'Database'] },
      { name: 'Buyer Bot response engine', priority: 'High', complexity: 'High', type: 'Feature', tags: ['Engine', 'AI'] },
      { name: 'Deterministic turn seeding (generateTurnSeed)', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Determinism'] },
      { name: 'GET/POST/PATCH/DELETE /buyer-bots API', priority: 'Medium', complexity: 'Medium', type: 'Feature', tags: ['API'] },
    ],
  },
  {
    number: 244,
    title: 'S244: Mandatory Adversarial Bots',
    goal: 'Define 5 required adversarial bots for Kill path testing',
    notes: 'PRD v1.3 §5.2. Kill paths MUST test against all mandatory adversarial bots.',
    outcomes: '5 mandatory bots: Budget Blocker, Compliance Gatekeeper, Competitor Advocate, Info Gatherer, Aggressive Skeptic.',
    highlights: 'Each bot has specific failure triggers. Kill path requires 100% mandatory bot coverage.',
    businessValue: 'Ensures SIVA gracefully handles adversarial buyer scenarios.',
    learnings: 'Mandatory bots catch edge cases that would slip through normal testing.',
    features: [
      { name: 'Budget Blocker adversarial bot', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Bots', 'Adversarial'] },
      { name: 'Compliance Gatekeeper adversarial bot', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Bots', 'Adversarial'] },
      { name: 'Competitor Advocate adversarial bot', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Bots', 'Adversarial'] },
      { name: 'Information Gatherer adversarial bot', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Bots', 'Adversarial'] },
      { name: 'Aggressive Skeptic adversarial bot', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Bots', 'Adversarial'] },
      { name: 'Mandatory bot coverage validation', priority: 'Medium', complexity: 'Medium', type: 'Feature', tags: ['Validation'] },
      { name: '/mandatory API endpoints', priority: 'Medium', complexity: 'Low', type: 'Feature', tags: ['API'] },
    ],
  },
  {
    number: 245,
    title: 'S245: CRS Foundation',
    goal: 'Establish CRS types with 8 dimensions and fixed weights',
    notes: 'PRD v1.3 §4.2. CRS is ADVISORY ONLY - never alters SIVA runtime behavior.',
    outcomes: 'crs.js types, crs-store.js, 8 dimensions with weights summing to 1.0.',
    highlights: 'Fixed weights: Qualification(0.15), Needs Discovery(0.15), Value Articulation(0.15), Objection Handling(0.15), Process Adherence(0.10), Compliance(0.10), Relationship Build(0.10), Next Step Secured(0.10).',
    businessValue: 'Quantitative measurement of SIVA sales conversation quality.',
    learnings: 'Fixed weights prevent gaming - cannot tune weights to improve scores.',
    features: [
      { name: 'CRS_DIMENSIONS enum (8 dimensions)', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Types', 'CRS'] },
      { name: 'CRS_WEIGHTS fixed weights (sum=1.0)', priority: 'High', complexity: 'Low', type: 'Feature', tags: ['Types', 'CRS'] },
      { name: 'CRS score storage (crs-store.js)', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Storage', 'Database'] },
      { name: 'Score rating classification (Poor/Fair/Good/Excellent)', priority: 'Medium', complexity: 'Low', type: 'Feature', tags: ['Types'] },
      { name: 'CRS advisory-only database trigger', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['Database', 'Security'] },
      { name: 'S245 database migration', priority: 'High', complexity: 'Medium', type: 'Infrastructure', tags: ['Database', 'Migration'] },
    ],
  },
  {
    number: 246,
    title: 'S246: CRS Dimension Scoring',
    goal: 'Implement dimension scorer engine for conversation analysis',
    notes: 'PRD v1.3 §4.3. Pattern-based scoring with evidence extraction.',
    outcomes: 'dimension-scorer.js, /crs API endpoints.',
    highlights: 'Each dimension scored 0.0-1.0 with evidence refs. Pattern matching for key indicators.',
    businessValue: 'Automated CRS scoring reduces manual evaluation effort.',
    learnings: 'Evidence refs enable human calibrators to verify scoring accuracy.',
    features: [
      { name: 'Dimension scorer engine (dimension-scorer.js)', priority: 'High', complexity: 'High', type: 'Feature', tags: ['Engine', 'AI'] },
      { name: 'Qualification dimension scoring', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['CRS', 'Scoring'] },
      { name: 'Needs Discovery dimension scoring', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['CRS', 'Scoring'] },
      { name: 'Value Articulation dimension scoring', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['CRS', 'Scoring'] },
      { name: 'Objection Handling dimension scoring', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['CRS', 'Scoring'] },
      { name: 'Evidence extraction for each dimension', priority: 'Medium', complexity: 'Medium', type: 'Feature', tags: ['CRS'] },
      { name: 'GET/POST /crs API endpoints', priority: 'Medium', complexity: 'Medium', type: 'Feature', tags: ['API'] },
    ],
  },
  {
    number: 247,
    title: 'S247: Golden & Kill Path Execution',
    goal: 'Implement path executor for scenario execution',
    notes: 'PRD v1.3 §6. Golden paths = positive sales. Kill paths = adversarial refusal.',
    outcomes: 'path-executor.js, /execution API with run, batch, replay, validate-mandatory.',
    highlights: 'Deterministic replay with same seed. Batch execution with mandatory bot coverage.',
    businessValue: 'Systematic execution of Sales-Bench test scenarios.',
    learnings: 'Kill paths must include all 5 mandatory adversarial bots.',
    features: [
      { name: 'Path executor engine (path-executor.js)', priority: 'High', complexity: 'High', type: 'Feature', tags: ['Engine'] },
      { name: 'Golden path execution (positive sales)', priority: 'High', complexity: 'High', type: 'Feature', tags: ['Execution'] },
      { name: 'Kill path execution (adversarial refusal)', priority: 'High', complexity: 'High', type: 'Feature', tags: ['Execution'] },
      { name: 'POST /execution/run - single scenario', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['API'] },
      { name: 'POST /execution/batch - multiple scenarios', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['API'] },
      { name: 'POST /execution/replay - deterministic replay', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['API', 'Determinism'] },
      { name: 'POST /execution/validate-mandatory - coverage check', priority: 'Medium', complexity: 'Low', type: 'Feature', tags: ['API', 'Validation'] },
    ],
  },
  {
    number: 248,
    title: 'S248: Human Calibration Tooling',
    goal: 'Build calibration engine with Spearman rank correlation',
    notes: 'PRD v1.3 §8. Human experts review and calibrate CRS scores. n>=30 for valid correlation.',
    outcomes: 'calibration-engine.js, /calibration API with queue, review, submit, stats, session, inter-rater.',
    highlights: 'Spearman rank correlation for calibration quality. Session-based calibration workflow.',
    businessValue: 'Human-in-the-loop calibration ensures CRS accuracy over time.',
    learnings: 'Inter-rater reliability metrics catch calibrator disagreements.',
    features: [
      { name: 'Spearman rank correlation implementation', priority: 'High', complexity: 'High', type: 'Feature', tags: ['Statistics', 'Calibration'] },
      { name: 'Calibration quality thresholds', priority: 'High', complexity: 'Low', type: 'Feature', tags: ['Calibration'] },
      { name: 'GET /calibration/queue - pending calibrations', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['API'] },
      { name: 'GET /calibration/review/:id - review interface', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['API'] },
      { name: 'POST /calibration/submit - submit calibration', priority: 'High', complexity: 'Medium', type: 'Feature', tags: ['API'] },
      { name: 'GET /calibration/stats - calibration statistics', priority: 'Medium', complexity: 'Medium', type: 'Feature', tags: ['API', 'Statistics'] },
      { name: 'POST /calibration/session - session management', priority: 'Medium', complexity: 'Medium', type: 'Feature', tags: ['API'] },
      { name: 'GET /calibration/inter-rater - reliability metrics', priority: 'Medium', complexity: 'Medium', type: 'Feature', tags: ['API', 'Statistics'] },
    ],
  },
];

async function findSprintByNumber(sprintNum) {
  const response = await notion.databases.query({
    database_id: SPRINTS_DB,
    filter: {
      property: 'Sprint',
      title: { contains: `S${sprintNum}:` },
    },
  });
  return response.results[0];
}

async function createSprint(sprint) {
  console.log(`Creating sprint S${sprint.number}...`);

  const response = await notion.pages.create({
    parent: { database_id: SPRINTS_DB },
    properties: {
      'Sprint': { title: [{ text: { content: sprint.title } }] },
      'Status': { select: { name: 'Done' } },
      'Repo': { select: { name: 'OS' } },
      'Goal': { rich_text: [{ text: { content: sprint.goal } }] },
      'Sprint Notes': { rich_text: [{ text: { content: sprint.notes } }] },
      'Outcomes': { rich_text: [{ text: { content: sprint.outcomes } }] },
      'Highlights': { rich_text: [{ text: { content: sprint.highlights } }] },
      'Business Value': { rich_text: [{ text: { content: sprint.businessValue } }] },
      'Learnings': { rich_text: [{ text: { content: sprint.learnings } }] },
      'Branch': { rich_text: [{ text: { content: 'main' } }] },
      'Commit': { rich_text: [{ text: { content: '6e2d2b4' } }] },
      'Git Tag': { rich_text: [{ text: { content: `sprint-s${sprint.number}-complete` } }] },
      'Started At': { date: { start: TODAY } },
      'Completed At': { date: { start: TODAY } },
      'Synced At': { date: { start: TODAY } },
      'Phases Updated': { multi_select: [{ name: 'Done' }] },
      'Commits Count': { number: 1 },
    },
  });

  return response.id;
}

async function updateSprint(pageId, sprint) {
  console.log(`Updating sprint S${sprint.number}...`);

  await notion.pages.update({
    page_id: pageId,
    properties: {
      'Status': { select: { name: 'Done' } },
      'Repo': { select: { name: 'OS' } },
      'Goal': { rich_text: [{ text: { content: sprint.goal } }] },
      'Sprint Notes': { rich_text: [{ text: { content: sprint.notes } }] },
      'Outcomes': { rich_text: [{ text: { content: sprint.outcomes } }] },
      'Highlights': { rich_text: [{ text: { content: sprint.highlights } }] },
      'Business Value': { rich_text: [{ text: { content: sprint.businessValue } }] },
      'Learnings': { rich_text: [{ text: { content: sprint.learnings } }] },
      'Branch': { rich_text: [{ text: { content: 'main' } }] },
      'Commit': { rich_text: [{ text: { content: '6e2d2b4' } }] },
      'Git Tag': { rich_text: [{ text: { content: `sprint-s${sprint.number}-complete` } }] },
      'Completed At': { date: { start: TODAY } },
      'Synced At': { date: { start: TODAY } },
      'Phases Updated': { multi_select: [{ name: 'Done' }] },
    },
  });
}

async function createFeature(sprintNum, feature) {
  await notion.pages.create({
    parent: { database_id: FEATURES_DB },
    properties: {
      'Features': { title: [{ text: { content: feature.name } }] },
      'Sprint': { number: sprintNum },
      'Status': { select: { name: 'Done' } },
      'Repo': { select: { name: 'OS' } },
      'Priority': { select: { name: feature.priority } },
      'Complexity': { select: { name: feature.complexity } },
      'Type': { select: { name: feature.type } },
      'Notes': { rich_text: [{ text: { content: `PRD v1.3 Appendix - Sales-Bench S${sprintNum}` } }] },
      'Tags': { multi_select: feature.tags.map(t => ({ name: t })) },
      'Assignee': { rich_text: [{ text: { content: 'Claude (TC)' } }] },
      'Done?': { checkbox: true },
      'Started At': { date: { start: TODAY } },
      'Completed At': { date: { start: TODAY } },
    },
  });
}

async function getExistingFeatures(sprintNum) {
  const response = await notion.databases.query({
    database_id: FEATURES_DB,
    filter: {
      property: 'Sprint',
      number: { equals: sprintNum },
    },
  });
  return response.results.map(f =>
    f.properties.Features?.title?.[0]?.plain_text || ''
  );
}

async function main() {
  console.log('='.repeat(60));
  console.log('UPDATING NOTION: S241-S248 Sales-Bench v1');
  console.log('='.repeat(60));
  console.log('');

  let sprintsCreated = 0;
  let sprintsUpdated = 0;
  let featuresCreated = 0;

  for (const sprint of SPRINTS) {
    console.log(`\n--- S${sprint.number}: ${sprint.title.split(': ')[1]} ---`);

    // Find or create sprint
    const existingSprint = await findSprintByNumber(sprint.number);

    if (existingSprint) {
      await updateSprint(existingSprint.id, sprint);
      sprintsUpdated++;
    } else {
      await createSprint(sprint);
      sprintsCreated++;
    }

    // Get existing features to avoid duplicates
    const existingFeatures = await getExistingFeatures(sprint.number);

    // Create features
    for (const feature of sprint.features) {
      if (existingFeatures.includes(feature.name)) {
        console.log(`  [skip] ${feature.name} (exists)`);
        continue;
      }

      await createFeature(sprint.number, feature);
      featuresCreated++;
      console.log(`  [+] ${feature.name}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Sprints created: ${sprintsCreated}`);
  console.log(`Sprints updated: ${sprintsUpdated}`);
  console.log(`Features created: ${featuresCreated}`);
  console.log('');
  console.log('Sales-Bench v1 (S241-S248) synced to Notion');
}

main().catch(console.error);
