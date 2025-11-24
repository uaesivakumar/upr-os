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

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Complete Sprint 19');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============================================================================
// Helper function to find Sprint
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

// ============================================================================
// Complete Sprint 19
// ============================================================================

async function completeSprint19() {
  console.log('📊 Marking Sprint 19 as Complete in SPRINTS database...\n');

  const sprint19 = await findSprint(19);
  if (!sprint19) {
    console.error('❌ Sprint 19 not found');
    return;
  }

  await notion.pages.update({
    page_id: sprint19.id,
    properties: {
      'Status': { select: { name: 'Complete' } },
      'Started At': { date: { start: '2025-11-12' } },
      'Completed At': { date: { start: '2025-11-12' } },
      'Git Tag': { rich_text: [{ text: { content: 'f8f7902' } }] },
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

  console.log('✅ Sprint 19 marked as Complete\n');
  console.log('📋 Sprint 19 Summary:');
  console.log('   Status: Complete');
  console.log('   Started: 2025-11-12');
  console.log('   Completed: 2025-11-12');
  console.log('   Duration: 1 day (planned 2 weeks!)');
  console.log('   Git Tag: f8f7902');
  console.log('\n📦 Tasks Completed:');
  console.log('   ✅ Task 1: Multi-Source Orchestrator (8h)');
  console.log('   ✅ Task 2: Cross-Source Deduplication (6h)');
  console.log('   ✅ Task 3: Source Prioritization Engine (5h)');
  console.log('   ✅ Task 4: Signal Quality Scoring (5h)');
  console.log('   ✅ Task 5: Unified Signal Pipeline (6h)');
  console.log('   ✅ Task 6: Source Configuration Dashboard (4h)');
  console.log('\n🎯 Total: 34/34 hours (100% complete)');
  console.log('\n📈 Impact:');
  console.log('   Discovery Engine: 0.9% → 15% (16x improvement)');
  console.log('   Project Progress: 34% → 40%');
  console.log('   Code Added: ~2,700 lines');
  console.log('   API Endpoints: 19 new endpoints');
  console.log('   Database Migrations: 3');
}

// ============================================================================
// Run
// ============================================================================

completeSprint19().catch(console.error);
