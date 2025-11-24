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
const MODULE_FEATURES_DB = process.env.WORK_ITEMS_DB_ID;

// Module IDs from MODULES database
const MODULES = {
  'Discovery Engine': '2a266151-dd16-8144-a851-ebb29e824ed9',
  'Admin Console': '2a266151-dd16-8166-a864-eb985f974e8c'
};

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📦 Adding Sprint 19 Tasks to MODULE FEATURES');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const sprint19Tasks = [
  {
    name: 'Phase 3.1: Multi-Source Orchestrator (Task 1)',
    module: 'Discovery Engine',
    complexity: 'High',
    completedAt: '2025-11-12',
    description: 'Central orchestration service for all signal sources with parallel execution (4 concurrent), circuit breaker pattern, health monitoring, 8 API endpoints'
  },
  {
    name: 'Phase 3.2: Cross-Source Deduplication (Task 2)',
    module: 'Discovery Engine',
    complexity: 'High',
    completedAt: '2025-11-12',
    description: 'Intelligent signal deduplication using fuzzy matching (Levenshtein 80%+), URL similarity, description comparison. 70%+ accuracy expected'
  },
  {
    name: 'Phase 3.3: Source Prioritization Engine (Task 3)',
    module: 'Discovery Engine',
    complexity: 'High',
    completedAt: '2025-11-12',
    description: 'Dynamic priority calculation based on performance metrics (success 40%, quality 30%, volume 20%, speed 10%). Manual overrides, recommendations engine, 6 API endpoints'
  },
  {
    name: 'Phase 3.4: Signal Quality Scoring (Task 4)',
    module: 'Discovery Engine',
    complexity: 'High',
    completedAt: '2025-11-12',
    description: 'Comprehensive quality scoring with 4-factor formula, multi-source validation bonus (+15%), quality tiers (EXCELLENT→POOR), analytics. 40%+ high-quality signals'
  },
  {
    name: 'Phase 3.5: Unified Signal Pipeline (Task 5)',
    module: 'Discovery Engine',
    complexity: 'High',
    completedAt: '2025-11-12',
    description: 'Single unified discovery endpoint with 15-min caching, pagination, quality filtering, automatic sorting. 4 API endpoints'
  },
  {
    name: 'Phase 3.6: Source Configuration Dashboard (Task 6)',
    module: 'Admin Console',
    complexity: 'High',
    completedAt: '2025-11-12',
    description: 'React admin dashboard for source management with 4 tabs (Sources, Priorities, Analytics, Recommendations), health monitoring, priority tuning'
  }
];

async function addTasks() {
  console.log(`Database ID: ${MODULE_FEATURES_DB}\n`);

  let added = 0;
  for (const task of sprint19Tasks) {
    try {
      console.log(`+ Creating: ${task.name}`);

      const moduleId = MODULES[task.module];
      if (!moduleId) {
        throw new Error(`Module ID not found for: ${task.module}`);
      }

      await notion.pages.create({
        parent: { database_id: MODULE_FEATURES_DB },
        properties: {
          'Features': {
            title: [{ text: { content: task.name } }]
          },
          'Modules': {
            relation: [{ id: moduleId }]
          },
          'Complexity': {
            select: { name: task.complexity }
          },
          'Completed At': {
            date: { start: task.completedAt }
          },
          'Done?': {
            checkbox: true
          }
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: { content: task.description }
              }]
            }
          }
        ]
      });

      added++;
      console.log(`  ✅ Added\n`);

    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}\n`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Sprint 19 Tasks Added: ${added}/${sprint19Tasks.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Summary:');
  console.log('   • Multi-Source Orchestrator (8h)');
  console.log('   • Cross-Source Deduplication (6h)');
  console.log('   • Source Prioritization Engine (5h)');
  console.log('   • Signal Quality Scoring (5h)');
  console.log('   • Unified Signal Pipeline (6h)');
  console.log('   • Source Configuration Dashboard (4h)');
  console.log('   Total: 34 hours\n');
  console.log('🎯 Impact: Discovery Engine 0.9% → 15% (16x improvement)');
  console.log('');
}

addTasks().catch(console.error);
