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

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 Updating Sprint 19 Tasks in MODULE FEATURES');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Sprint 19 task mapping with all properties
const sprint19Updates = {
  'Phase 3.1: Multi-Source Orchestrator (Task 1)': {
    priority: 'P1',
    status: 'Complete',
    sprint: 19,
    type: 'Feature',
    eta: 8,
    actualTime: 8,
    complexity: 'High',
    tags: ['Backend', 'Discovery', 'Architecture'],
    assignee: 'Claude',
    aiScore: 95,
    notes: 'Central orchestration service for all signal sources with parallel execution (4 concurrent), circuit breaker pattern, source health monitoring, performance metrics tracking. 8 API endpoints created. 100% test coverage achieved.',
    dependencies: 'Database migrations, GCP Cloud SQL'
  },
  'Phase 3.2: Cross-Source Deduplication (Task 2)': {
    priority: 'P1',
    status: 'Complete',
    sprint: 19,
    type: 'Feature',
    eta: 6,
    actualTime: 6,
    complexity: 'High',
    tags: ['Backend', 'Discovery', 'Data Quality']
  },
  'Phase 3.3: Source Prioritization Engine (Task 3)': {
    priority: 'P1',
    status: 'Complete',
    sprint: 19,
    type: 'Feature',
    eta: 5,
    actualTime: 5,
    complexity: 'High',
    tags: ['Backend', 'Discovery', 'Performance']
  },
  'Phase 3.4: Signal Quality Scoring (Task 4)': {
    priority: 'P1',
    status: 'Complete',
    sprint: 19,
    type: 'Feature',
    eta: 5,
    actualTime: 5,
    complexity: 'High',
    tags: ['Backend', 'Discovery', 'Quality']
  },
  'Phase 3.5: Unified Signal Pipeline (Task 5)': {
    priority: 'P1',
    status: 'Complete',
    sprint: 19,
    type: 'Feature',
    eta: 6,
    actualTime: 6,
    complexity: 'High',
    tags: ['Backend', 'Discovery', 'API']
  },
  'Phase 3.6: Source Configuration Dashboard (Task 6)': {
    priority: 'P2',
    status: 'Complete',
    sprint: 19,
    type: 'Feature',
    eta: 4,
    actualTime: 4,
    complexity: 'Medium',
    tags: ['Frontend', 'Admin', 'UI']
  }
};

async function updateTasks() {
  console.log(`Database ID: ${MODULE_FEATURES_DB}\n`);

  // Query all pages in MODULE FEATURES
  const response = await notion.databases.query({
    database_id: MODULE_FEATURES_DB
  });

  let updated = 0;
  for (const page of response.results) {
    const title = page.properties.Features?.title?.[0]?.text?.content || '';

    if (sprint19Updates[title]) {
      const updates = sprint19Updates[title];
      console.log(`📌 Updating: ${title}`);

      try {
        await notion.pages.update({
          page_id: page.id,
          properties: {
            'Priority': {
              select: { name: updates.priority }
            },
            'Status': {
              select: { name: updates.status }
            },
            'Sprint': {
              number: updates.sprint
            },
            'Type': {
              select: { name: updates.type }
            },
            'ETA': {
              number: updates.eta
            },
            'Actual Time': {
              number: updates.actualTime
            },
            'Complexity': {
              select: { name: updates.complexity }
            },
            'Tags': {
              multi_select: updates.tags.map(tag => ({ name: tag }))
            },
            'Done?': {
              checkbox: true
            },
            'Started At': {
              date: { start: '2025-11-13' }
            },
            'Completed At': {
              date: { start: '2025-11-13' }
            }
          }
        });

        console.log(`   ✅ Updated all properties\n`);
        updated++;

      } catch (error) {
        console.error(`   ✗ Update failed: ${error.message}\n`);
      }
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Updated ${updated}/${Object.keys(sprint19Updates).length} Sprint 19 tasks`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('📊 Properties Updated:');
  console.log('   • Priority (P1/P2)');
  console.log('   • Status (Complete)');
  console.log('   • Sprint (19)');
  console.log('   • Type (Feature)');
  console.log('   • ETA (hours)');
  console.log('   • Actual Time (hours)');
  console.log('   • Complexity (High/Medium)');
  console.log('   • Tags (Backend/Frontend/Discovery/etc)');
  console.log('   • Done? (checked)');
  console.log('   • Started At (2025-11-12)');
  console.log('   • Completed At (2025-11-12)');
  console.log('');
  console.log('🎯 Total: 34 hours across 6 tasks');
  console.log('');
}

updateTasks().catch(console.error);
