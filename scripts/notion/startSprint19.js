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

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 Starting Sprint 19: RADAR Phase 3');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Sprint 19: RADAR Phase 3 - Multi-Source Orchestration
const SPRINT_19_TASKS = [
  {
    name: "Task 1: Multi-Source Orchestrator",
    module: "Discovery Engine",
    priority: "P1",
    type: "Feature",
    eta: 8,
    sprint: 19,
    tags: ["backend", "radar", "sprint19", "orchestration"],
    description: "Central orchestration service for all signal sources. Parallel execution, error handling, health monitoring for News, LinkedIn, Job Boards, Twitter/X sources.",
    status: "To Do"
  },
  {
    name: "Task 2: Cross-Source Deduplication",
    module: "Discovery Engine",
    priority: "P1",
    type: "Feature",
    eta: 6,
    sprint: 19,
    tags: ["backend", "radar", "sprint19", "deduplication"],
    description: "Eliminate duplicate signals across different sources. Fuzzy matching, similarity detection using company+trigger+description. Merge duplicates keeping highest confidence.",
    status: "To Do"
  },
  {
    name: "Task 3: Source Prioritization Engine",
    module: "Discovery Engine",
    priority: "P1",
    type: "Feature",
    eta: 5,
    sprint: 19,
    tags: ["backend", "radar", "sprint19", "prioritization"],
    description: "Intelligently prioritize sources based on performance. Dynamic source weights, priority queue execution, adaptive selection based on reliability and quality.",
    status: "To Do"
  },
  {
    name: "Task 4: Signal Quality Scoring",
    module: "Discovery Engine",
    priority: "P2",
    type: "Feature",
    eta: 5,
    sprint: 19,
    tags: ["backend", "radar", "sprint19", "quality"],
    description: "Enhanced quality scoring across sources. Cross-source quality comparison, multi-source validation bonus (+0.1), freshness decay, engagement metrics.",
    status: "To Do"
  },
  {
    name: "Task 5: Unified Signal Pipeline",
    module: "Discovery Engine",
    priority: "P1",
    type: "Feature",
    eta: 6,
    sprint: 19,
    tags: ["backend", "api", "sprint19", "pipeline"],
    description: "Single endpoint for all signal discovery (POST /api/radar/discover). Pipeline configuration, source selection, results aggregation, performance monitoring.",
    status: "To Do"
  },
  {
    name: "Task 6: Source Configuration Dashboard",
    module: "Discovery Engine",
    priority: "P2",
    type: "Feature",
    eta: 4,
    sprint: 19,
    tags: ["frontend", "admin", "sprint19", "dashboard"],
    description: "Admin UI for managing signal sources at /admin/sources. Enable/disable sources, view health metrics, adjust priorities, test individual sources.",
    status: "To Do"
  }
];

async function findSprint(sprintNumber) {
  const response = await notion.databases.query({
    database_id: JOURNAL_DB,
    filter: {
      property: "Sprint",
      title: { equals: `Sprint ${sprintNumber}` }
    }
  });

  return response.results[0] || null;
}

async function createSprint19() {
  console.log('📊 Step 1: Creating Sprint 19 in SPRINTS database...\n');

  // Check if Sprint 19 already exists
  const existing = await findSprint(19);
  if (existing) {
    console.log('⚠️  Sprint 19 already exists in Notion');
    return existing;
  }

  // Create Sprint 19
  const sprint = await notion.pages.create({
    parent: { database_id: JOURNAL_DB },
    properties: {
      'Sprint': { title: [{ text: { content: 'Sprint 19' } }] },
      'Status': { select: { name: 'Active' } },
      'Started At': { date: { start: '2025-11-12' } },
      'Git Tag': { rich_text: [{ text: { content: '6307b75' } }] },
      'Goal': {
        rich_text: [{
          text: {
            content: 'RADAR Phase 3: Multi-Source Orchestration - Build unified signal discovery pipeline with intelligent orchestration, deduplication, and source prioritization'
          }
        }]
      },
      'Business Value': {
        rich_text: [{
          text: {
            content: '3-5x signal volume increase (10-15/day → 30-50/day), 70%+ deduplication accuracy, 40%+ high-quality signals, Discovery Engine 0.9% → 15%+'
          }
        }]
      },
      'Phases Updated': {
        multi_select: [
          { name: 'RADAR Phase 3: Multi-Source' },
          { name: 'Discovery Engine Enhancement' }
        ]
      }
    }
  });

  console.log('✅ Sprint 19 created in SPRINTS database\n');
  return sprint;
}

async function createSprintTasks() {
  console.log('📋 Step 2: Creating Sprint 19 tasks in MODULE FEATURES...\n');

  let created = 0;

  for (const task of SPRINT_19_TASKS) {
    try {
      // Create task in MODULE FEATURES (WORK_ITEMS_DB)
      await notion.pages.create({
        parent: { database_id: WORK_ITEMS_DB },
        properties: {
          'Features': { title: [{ text: { content: task.name } }] },
          'Status': { select: { name: task.status } },
          'Priority': { select: { name: task.priority } },
          'Module': { select: { name: task.module } },
          'Sprint': { number: task.sprint },
          'ETA (days)': { number: task.eta },
          'Type': { select: { name: task.type } },
          'Tags': {
            multi_select: task.tags.map(tag => ({ name: tag }))
          },
          'Description': {
            rich_text: [{ text: { content: task.description } }]
          }
        }
      });

      console.log(`   ✅ Created: ${task.name}`);
      created++;
    } catch (error) {
      console.error(`   ❌ Failed to create: ${task.name}`, error.message);
    }
  }

  console.log(`\n✅ Created ${created}/${SPRINT_19_TASKS.length} tasks\n`);
}

async function main() {
  try {
    // Step 1: Create Sprint 19
    await createSprint19();

    // Step 2: Create Sprint 19 tasks
    await createSprintTasks();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Sprint 19 Setup Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 Sprint 19 Summary:');
    console.log('   Sprint: 19');
    console.log('   Status: Active');
    console.log('   Goal: RADAR Phase 3 - Multi-Source Orchestration');
    console.log('   Started: 2025-11-12');
    console.log('   Tasks: 6 (34 hours)');
    console.log('   Module: Discovery Engine');
    console.log('\n📋 Next Steps:');
    console.log('   1. View Sprint 19 in Notion SPRINTS database');
    console.log('   2. View tasks in MODULE FEATURES database');
    console.log('   3. Start Task 1: Multi-Source Orchestrator');
    console.log('   4. Update task status as you progress\n');

  } catch (error) {
    console.error('❌ Error setting up Sprint 19:', error);
    throw error;
  }
}

main();
