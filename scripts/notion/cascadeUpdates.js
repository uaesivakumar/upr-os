import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const JOURNAL_DB = process.env.JOURNAL_DB_ID || process.env.NOTION_JOURNAL_DB;
const WORK_ITEMS_DB = process.env.WORK_ITEMS_DB_ID || process.env.NOTION_WORKITEMS_DB;
const MODULES_DB = process.env.MODULES_DB_ID;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔄 Cascade Update: SPRINTS → MODULE FEATURES → MODULES');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============================================================================
// STEP 1: Map Sprint to Modules
// ============================================================================

const SPRINT_TO_MODULE_MAP = {
  17: {
    'Database Infrastructure': 'Infra & DevOps',
    'API Security': 'Infra & DevOps',
    'Lead Scoring Engine': 'Enrichment Engine'
  },
  18: {
    'RADAR Automation': 'Discovery Engine',
    'Webhook Reliability': 'Infra & DevOps',
    'Signal Intelligence': 'Discovery Engine',
    'Production Monitoring': 'Infra & DevOps'
  }
};

// ============================================================================
// STEP 2: Update MODULE FEATURES from SPRINTS
// ============================================================================

async function cascadeSprintToFeatures(sprintNumber) {
  console.log(`📊 Step 1: Cascading Sprint ${sprintNumber} updates to MODULE FEATURES...\n`);

  // Get sprint details
  const sprintResponse = await notion.databases.query({
    database_id: JOURNAL_DB,
    filter: {
      property: "Sprint",
      title: { equals: `Sprint ${sprintNumber}` }
    }
  });

  if (sprintResponse.results.length === 0) {
    console.error(`❌ Sprint ${sprintNumber} not found`);
    return;
  }

  const sprint = sprintResponse.results[0];
  const sprintStatus = sprint.properties.Status?.select?.name;
  const completedAt = sprint.properties['Completed At']?.date?.start;

  console.log(`   Sprint ${sprintNumber} Status: ${sprintStatus}`);
  console.log(`   Completed At: ${completedAt || 'N/A'}\n`);

  // Get all features for this sprint
  const featuresResponse = await notion.databases.query({
    database_id: WORK_ITEMS_DB,
    filter: {
      property: "Sprint",
      number: { equals: sprintNumber }
    }
  });

  console.log(`   Found ${featuresResponse.results.length} features for Sprint ${sprintNumber}\n`);

  let updatedCount = 0;

  for (const feature of featuresResponse.results) {
    const featureName = feature.properties.Features?.title?.[0]?.text?.content || 'Untitled';
    const currentStatus = feature.properties.Status?.select?.name;

    // If sprint is complete, mark feature as complete
    if (sprintStatus === 'Complete' && currentStatus !== 'Complete') {
      await notion.pages.update({
        page_id: feature.id,
        properties: {
          'Status': { select: { name: 'Complete' } },
          'Done?': { checkbox: true },
          'Completed At': completedAt ? { date: { start: completedAt } } : {}
        }
      });

      console.log(`   ✅ Updated: ${featureName} → Complete`);
      updatedCount++;
    }
  }

  console.log(`\n   📊 Updated ${updatedCount} features to Complete\n`);
  return featuresResponse.results;
}

// ============================================================================
// STEP 3: Update MODULES from MODULE FEATURES
// ============================================================================

async function cascadeFeaturesToModules(sprintNumber) {
  console.log(`📊 Step 2: Cascading MODULE FEATURES updates to MODULES...\n`);

  const moduleMap = SPRINT_TO_MODULE_MAP[sprintNumber];
  if (!moduleMap) {
    console.log('   ⚠️  No module mapping found for this sprint\n');
    return;
  }

  // Get all modules
  const modulesResponse = await notion.databases.query({
    database_id: MODULES_DB,
    page_size: 100
  });

  const modules = {};
  modulesResponse.results.forEach(page => {
    const name = page.properties.Name?.title?.[0]?.text?.content;
    if (name) modules[name] = page;
  });

  // Update each affected module
  for (const [phaseName, moduleName] of Object.entries(moduleMap)) {
    const module = modules[moduleName];
    if (!module) {
      console.log(`   ⚠️  Module "${moduleName}" not found, skipping ${phaseName}`);
      continue;
    }

    // Get all features related to this module
    const featuresResponse = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      filter: {
        property: "Sprint",
        number: { equals: sprintNumber }
      }
    });

    // Filter features that belong to this phase
    const relevantFeatures = featuresResponse.results.filter(f => {
      const name = f.properties.Features?.title?.[0]?.text?.content || '';
      return name.includes(phaseName) || name.includes(`Phase ${sprintNumber}`);
    });

    if (relevantFeatures.length === 0) continue;

    // Calculate module progress
    const completedFeatures = relevantFeatures.filter(f =>
      f.properties.Status?.select?.name === 'Complete'
    ).length;

    const progress = Math.round((completedFeatures / relevantFeatures.length) * 100);

    // Update module
    await notion.pages.update({
      page_id: module.id,
      properties: {
        'Progress %': { number: progress },
        'Current Sprint': { number: sprintNumber },
        'Status': { select: { name: progress === 100 ? 'Complete' : 'Active' } },
        'Last Updated': { date: { start: new Date().toISOString().split('T')[0] } }
      }
    });

    console.log(`   ✅ Updated Module: ${moduleName}`);
    console.log(`      Phase: ${phaseName}`);
    console.log(`      Progress: ${progress}% (${completedFeatures}/${relevantFeatures.length} features)`);
    console.log(`      Status: ${progress === 100 ? 'Complete' : 'Active'}\n`);
  }
}

// ============================================================================
// STEP 4: Generate Project Status Report
// ============================================================================

async function generateProjectStatus() {
  console.log('📊 Step 3: Generating Project Status Report...\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('PROJECT STATUS DASHBOARD');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get latest sprints
  const sprintsResponse = await notion.databases.query({
    database_id: JOURNAL_DB,
    sorts: [{ property: 'Sprint', direction: 'descending' }],
    page_size: 3
  });

  console.log('📅 RECENT SPRINTS:\n');
  sprintsResponse.results.forEach(sprint => {
    const num = sprint.properties.Sprint?.title?.[0]?.text?.content?.replace('Sprint ', '');
    const status = sprint.properties.Status?.select?.name || 'Unknown';
    const goal = sprint.properties.Goal?.rich_text?.[0]?.text?.content || 'N/A';
    const statusEmoji = status === 'Complete' ? '✅' : status === 'Active' ? '🔄' : '⏸️';

    console.log(`   ${statusEmoji} Sprint ${num}: ${status}`);
    console.log(`      Goal: ${goal.substring(0, 80)}${goal.length > 80 ? '...' : ''}\n`);
  });

  // Get all modules
  const modulesResponse = await notion.databases.query({
    database_id: MODULES_DB,
    sorts: [{ property: 'Progress %', direction: 'descending' }]
  });

  console.log('📦 MODULES STATUS:\n');
  modulesResponse.results.forEach(module => {
    const name = module.properties.Name?.title?.[0]?.text?.content;
    const progress = module.properties['Progress %']?.number || 0;
    const status = module.properties.Status?.select?.name || 'Unknown';
    const sprint = module.properties['Current Sprint']?.number || 'N/A';

    const progressBar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));
    const statusEmoji = status === 'Complete' ? '✅' : status === 'Active' ? '🔄' : '📋';

    console.log(`   ${statusEmoji} ${name}`);
    console.log(`      [${progressBar}] ${progress}%`);
    console.log(`      Status: ${status} | Current Sprint: ${sprint}\n`);
  });

  // Calculate overall project progress
  const totalProgress = modulesResponse.results.reduce((sum, m) =>
    sum + (m.properties['Progress %']?.number || 0), 0
  );
  const avgProgress = Math.round(totalProgress / modulesResponse.results.length);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📈 OVERALL PROJECT PROGRESS: ${avgProgress}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// ============================================================================
// MAIN: Run cascade for specified sprint
// ============================================================================

async function run() {
  try {
    const sprintNumber = parseInt(process.argv[2]) || 17;

    console.log(`🎯 Running cascade updates for Sprint ${sprintNumber}...\n`);

    await cascadeSprintToFeatures(sprintNumber);
    await cascadeFeaturesToModules(sprintNumber);
    await generateProjectStatus();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Cascade Update Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 Summary:');
    console.log('   • SPRINTS → MODULE FEATURES: Synced');
    console.log('   • MODULE FEATURES → MODULES: Synced');
    console.log('   • Project Status: Generated\n');
    console.log('➡️  View in Notion:');
    console.log('   • SPRINTS: Sprint ' + sprintNumber + ' status propagated');
    console.log('   • MODULE FEATURES: Updated with sprint status');
    console.log('   • MODULES: Progress calculated from features\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}

export { cascadeSprintToFeatures, cascadeFeaturesToModules, generateProjectStatus };
