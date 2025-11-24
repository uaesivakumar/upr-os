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
console.log('✅ Complete Sprint 18');
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
// Complete Sprint 18
// ============================================================================

async function completeSprint18() {
  console.log('📊 Marking Sprint 18 as Complete in SPRINTS database...\n');

  const sprint18 = await findSprint(18);
  if (!sprint18) {
    console.error('❌ Sprint 18 not found');
    return;
  }

  await notion.pages.update({
    page_id: sprint18.id,
    properties: {
      'Status': { select: { name: 'Complete' } },
      'Started At': { date: { start: '2025-11-09' } },
      'Completed At': { date: { start: '2025-11-10' } },
      'Git Tag': { rich_text: [{ text: { content: 'a857854' } }] },
      'Goal': {
        rich_text: [{
          text: {
            content: 'Automate RADAR discovery (daily runs, LinkedIn signals), production reliability (webhook retry, error recovery), and signal quality improvements (confidence scoring)'
          }
        }]
      },
      'Business Value': {
        rich_text: [{
          text: {
            content: 'Automated RADAR (Cloud Scheduler), LinkedIn signal detection, webhook retry system, signal confidence scoring, error recovery dashboard, production monitoring (SLO tracking, cost alerts, Sentry)'
          }
        }]
      },
      'Phases Updated': {
        multi_select: [
          { name: 'RADAR Automation' },
          { name: 'LinkedIn Signal Source' },
          { name: 'Webhook Reliability' },
          { name: 'Signal Intelligence' },
          { name: 'Error Recovery Dashboard' },
          { name: 'Production Monitoring' }
        ]
      }
    }
  });

  console.log('✅ Sprint 18 marked as Complete\n');
  console.log('📋 Sprint 18 Summary:');
  console.log('   Status: Complete');
  console.log('   Started: 2025-11-09');
  console.log('   Completed: 2025-11-10');
  console.log('   Duration: 2 days');
  console.log('   Git Tag: a857854');
  console.log('\n📦 Tasks Completed:');
  console.log('   ✅ Task 4: Automated RADAR Scheduling (4h)');
  console.log('   ✅ Task 6: Webhook Retry Logic (3h)');
  console.log('   ✅ Task 7: Signal Confidence Scoring (5h)');
  console.log('   ✅ Task 9: Production Monitoring (4h)');
  console.log('   ✅ Task 5: LinkedIn Signal Source (7h)');
  console.log('   ✅ Task 8: Error Recovery Dashboard (6h)');
  console.log('\n🎯 Total: 29/29 hours (100% complete)');
}

// ============================================================================
// Run
// ============================================================================

completeSprint18().catch(console.error);
