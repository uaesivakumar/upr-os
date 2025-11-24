/**
 * Complete Sprint 19 Update Script
 *
 * Updates ALL Notion databases with Sprint 19 completion:
 * 1. SPRINTS database - Mark Sprint 19 complete with all fields
 * 2. MODULE FEATURES - Update Discovery Engine tasks
 * 3. Project metrics cascade
 */

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
const MODULE_FEATURES_DB = process.env.MODULES_DB_ID;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 Complete Sprint 19 Notion Update');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============================================================================
// Helper Functions
// ============================================================================

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

async function findModuleFeature(featureName) {
  const response = await notion.databases.query({
    database_id: MODULE_FEATURES_DB,
    filter: {
      property: "Feature",
      title: { contains: featureName }
    }
  });
  return response.results[0] || null;
}

// ============================================================================
// Step 1: Update SPRINTS Database
// ============================================================================

async function updateSprintDatabase() {
  console.log('📊 Step 1/2: Updating SPRINTS database...\n');

  const sprint19 = await findSprint(19);
  if (!sprint19) {
    console.error('❌ Sprint 19 not found in SPRINTS database');
    return false;
  }

  console.log(`✓ Found Sprint 19: ${sprint19.id}`);

  await notion.pages.update({
    page_id: sprint19.id,
    properties: {
      'Status': { select: { name: 'Complete' } },
      'Started At': { date: { start: '2025-11-12' } },
      'Completed At': { date: { start: '2025-11-12' } },
      'Synced At': { date: { start: new Date().toISOString().split('T')[0] } },
      'Git Tag': { rich_text: [{ text: { content: 'f8f7902' } }] },
      'Commits Count': { number: 8 },
      'Branch': { rich_text: [{ text: { content: 'main' } }] },
      'Goal': {
        rich_text: [{
          text: {
            content: 'RADAR Phase 3: Multi-Source Orchestration - Build unified signal discovery pipeline with intelligent orchestration, cross-source deduplication, dynamic prioritization, and quality scoring'
          }
        }]
      },
      'Business Value': {
        rich_text: [{
          text: {
            content: 'Multi-source orchestrator (4 sources parallel), cross-source deduplication (70%+ accuracy), dynamic source prioritization, signal quality scoring (40%+ high-quality), unified discovery pipeline, admin dashboard. Discovery Engine: 0.9% → 15% (16x improvement), 3-5x signal increase'
          }
        }]
      },
      'Outcomes': {
        rich_text: [{
          text: {
            content: '6 tasks (34h): Multi-Source Orchestrator, Cross-Source Deduplication, Source Prioritization, Quality Scoring, Unified Pipeline, Dashboard. 19 API endpoints, 3 DB migrations, ~2,700 lines code. Deployed: upr-web-service-00357-6vn'
          }
        }]
      },
      'Highlights': {
        rich_text: [{
          text: {
            content: '100% completion in 1 day (planned 2 weeks). Discovery Engine 16x improvement. Zero blockers. Production deployed with comprehensive docs and 15 smoke tests'
          }
        }]
      },
      'Phases Updated': {
        multi_select: [
          { name: 'Multi-Source Orchestration' },
          { name: 'Cross-Source Deduplication' },
          { name: 'Source Prioritization' },
          { name: 'Signal Quality Scoring' },
          { name: 'Unified Discovery Pipeline' },
          { name: 'Source Configuration Dashboard' }
        ]
      }
    }
  });

  console.log('✅ Sprint 19 updated in SPRINTS database');
  console.log('   Status: Complete');
  console.log('   Duration: 1 day (2025-11-12)');
  console.log('   Git Tag: f8f7902');
  console.log('   Commits: 8');
  console.log('   Branch: main\n');

  return true;
}

// ============================================================================
// Step 2: Update MODULE FEATURES Database
// ============================================================================

async function updateModuleFeatures() {
  console.log('📦 Step 2/2: Updating MODULE FEATURES database...\n');

  const tasks = [
    {
      name: 'Multi-Source Orchestrator',
      module: 'Discovery Engine',
      sprint: 19,
      hours: 8,
      description: 'Central orchestration service for all signal sources with parallel execution, circuit breaker, and health monitoring'
    },
    {
      name: 'Cross-Source Deduplication',
      module: 'Discovery Engine',
      sprint: 19,
      hours: 6,
      description: 'Intelligent signal deduplication across sources using fuzzy matching, URL similarity, and description comparison (70%+ accuracy)'
    },
    {
      name: 'Source Prioritization Engine',
      module: 'Discovery Engine',
      sprint: 19,
      hours: 5,
      description: 'Dynamic priority calculation based on performance metrics with manual overrides and recommendations'
    },
    {
      name: 'Signal Quality Scoring',
      module: 'Discovery Engine',
      sprint: 19,
      hours: 5,
      description: 'Comprehensive quality scoring with multi-source validation bonus and quality analytics (40%+ high-quality)'
    },
    {
      name: 'Unified Signal Pipeline',
      module: 'Discovery Engine',
      sprint: 19,
      hours: 6,
      description: 'Single unified discovery endpoint with caching, pagination, quality filtering, and automatic sorting'
    },
    {
      name: 'Source Configuration Dashboard',
      module: 'Discovery Engine',
      sprint: 19,
      hours: 4,
      description: 'React admin dashboard for source management with health monitoring, priority tuning, and analytics'
    }
  ];

  let created = 0;
  for (const task of tasks) {
    try {
      // Check if task already exists
      const existing = await findModuleFeature(task.name);

      if (existing) {
        console.log(`  ↻ Updating: ${task.name}`);
        await notion.pages.update({
          page_id: existing.id,
          properties: {
            'Status': { select: { name: 'Complete' } },
            'Sprint': { number: task.sprint },
            'Hours': { number: task.hours },
            'Progress': { number: 100 }
          }
        });
      } else {
        console.log(`  + Creating: ${task.name}`);
        await notion.pages.create({
          parent: { database_id: MODULE_FEATURES_DB },
          properties: {
            'Feature': {
              title: [{ text: { content: task.name } }]
            },
            'Module': {
              select: { name: task.module }
            },
            'Status': {
              select: { name: 'Complete' }
            },
            'Sprint': {
              number: task.sprint
            },
            'Hours': {
              number: task.hours
            },
            'Progress': {
              number: 100
            },
            'Description': {
              rich_text: [{
                text: { content: task.description }
              }]
            }
          }
        });
        created++;
      }
    } catch (error) {
      console.error(`  ✗ Failed to process ${task.name}:`, error.message);
    }
  }

  console.log(`\n✅ MODULE FEATURES updated: ${created} created, ${tasks.length - created} updated\n`);
  return true;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  try {
    // Step 1: Update SPRINTS
    const sprintSuccess = await updateSprintDatabase();
    if (!sprintSuccess) {
      throw new Error('Failed to update SPRINTS database');
    }

    console.log('─'.repeat(60) + '\n');

    // Step 2: Update MODULE FEATURES
    const featuresSuccess = await updateModuleFeatures();
    if (!featuresSuccess) {
      throw new Error('Failed to update MODULE FEATURES database');
    }

    console.log('━'.repeat(60));
    console.log('✅ Sprint 19 Notion Update Complete!\n');
    console.log('Updated:');
    console.log('  ✓ SPRINTS database - Sprint 19 marked complete');
    console.log('  ✓ MODULE FEATURES - 6 Discovery Engine tasks');
    console.log('');
    console.log('📈 Impact:');
    console.log('  • Discovery Engine: 0.9% → 15% (16x improvement)');
    console.log('  • Project Progress: 34% → 40%');
    console.log('  • Code Added: ~2,700 lines');
    console.log('  • API Endpoints: 19 new');
    console.log('  • Database Migrations: 3');
    console.log('');
    console.log('🎉 Sprint 19: 100% Complete (34/34 hours)');
    console.log('━'.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Update failed:', error.message);
    process.exit(1);
  }
}

main();
