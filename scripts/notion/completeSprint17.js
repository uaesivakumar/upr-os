import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
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
console.log('📋 Sprint 17 Completion & Sprint 18 Setup');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============================================================================
// PART 1: Update Sprint 17 with complete information
// ============================================================================

async function findSprint(sprintNumber) {
  const response = await notion.databases.query({
    database_id: JOURNAL_DB,
    filter: {
      property: "Sprint",
      title: {
        equals: `Sprint ${sprintNumber}`
      }
    }
  });
  return response.results.length > 0 ? response.results[0] : null;
}

async function updateSprint17() {
  console.log('📊 Step 1: Updating Sprint 17 in SPRINTS database...\n');

  const sprint17 = await findSprint(17);
  if (!sprint17) {
    console.error('❌ Sprint 17 not found');
    return;
  }

  await notion.pages.update({
    page_id: sprint17.id,
    properties: {
      'Status': { select: { name: 'Complete' } },
      'Started At': { date: { start: '2025-11-09' } },
      'Completed At': { date: { start: '2025-11-09' } },
      'Git Tag': { rich_text: [{ text: { content: '6558d3e' } }] },
      'Goal': {
        rich_text: [{
          text: {
            content: 'Database performance optimization, API security hardening, and SIVA Phase 12 lead scoring integration with production-ready metrics'
          }
        }]
      },
      'Business Value': {
        rich_text: [{
          text: {
            content: '2x-5x query performance improvement, 313 leads/sec throughput, 100% SIVA success rate, production-ready infrastructure'
          }
        }]
      },
      'Phases Updated': {
        multi_select: [
          { name: 'Phase 1: Database Infrastructure' },
          { name: 'Phase 2: API Security' },
          { name: 'Phase 12: Lead Scoring Engine' }
        ]
      }
    }
  });

  console.log('✅ Sprint 17 updated with complete information\n');
}

// ============================================================================
// PART 2: Update Sprint 18 with task breakdown
// ============================================================================

async function updateSprint18() {
  console.log('📊 Step 2: Updating Sprint 18 in SPRINTS database...\n');

  const sprint18 = await findSprint(18);
  if (!sprint18) {
    console.error('❌ Sprint 18 not found');
    return;
  }

  await notion.pages.update({
    page_id: sprint18.id,
    properties: {
      'Status': { select: { name: 'Active' } },
      'Started At': { date: { start: '2025-11-09' } },
      'Git Tag': { rich_text: [{ text: { content: 'TBD' } }] },
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
            content: 'Continuous automated lead discovery, resilient webhook delivery (5 retries), intelligent signal prioritization, comprehensive production monitoring'
          }
        }]
      },
      'Phases Updated': {
        multi_select: [
          { name: 'Phase 3: RADAR Automation' },
          { name: 'Phase 4: Webhook Reliability' },
          { name: 'Phase 5: Signal Intelligence' },
          { name: 'Phase 6: Production Monitoring' }
        ]
      }
    }
  });

  console.log('✅ Sprint 18 updated with task breakdown\n');
}

// ============================================================================
// PART 3: Complete Phase 12 in MODULE FEATURES
// ============================================================================

async function completePhase12() {
  console.log('📊 Step 3: Marking Phase 12 as Complete in MODULE FEATURES...\n');

  const response = await notion.databases.query({
    database_id: WORK_ITEMS_DB,
    page_size: 100
  });

  const phase12 = response.results.find(page => {
    const name = page.properties.Features?.title?.[0]?.text?.content || '';
    return name.includes('Phase 12');
  });

  if (!phase12) {
    console.error('❌ Phase 12 not found in MODULE FEATURES');
    return;
  }

  await notion.pages.update({
    page_id: phase12.id,
    properties: {
      'Status': { select: { name: 'Complete' } },
      'Completion': { number: 100 },
      'Started At': { date: { start: '2025-11-09' } },
      'Completed At': { date: { start: '2025-11-09' } },
      'Sprint': { rich_text: [{ text: { content: 'Sprint 17' } }] },
      'Notes': {
        rich_text: [{
          text: {
            content: `Sprint 17 Complete ✅ | SIVA Phase 12 integration 100% functional | Tools 1, 2, 8 integrated (CompanyQualityTool, ContactTierTool, CompositeScoreTool) | Performance: 313 leads/sec, p95 < 2s, 100% success rate (600/600 leads tested) | Natural language reasoning output | Graceful fallback handling | Production-ready with exceptional metrics | Test infrastructure: smoke tests (4 cases) + stress tests (600 leads) | SIVA_PHASE12_TEST_RESULTS.md documented | Last updated: ${new Date().toISOString().split('T')[0]}`
          }
        }]
      }
    }
  });

  console.log('✅ Phase 12 marked as Complete\n');
}

// ============================================================================
// PART 4: Create Sprint 18 phase entries in MODULE FEATURES
// ============================================================================

async function createSprint18Phases() {
  console.log('📊 Step 4: Creating Sprint 18 phase entries in MODULE FEATURES...\n');

  const phases = [
    {
      name: 'Phase 3: RADAR Automation',
      category: 'RADAR',
      status: 'In Progress',
      completion: 0,
      sprint: 'Sprint 18',
      startDate: '2025-11-09',
      notes: 'Task 4: Automated RADAR Scheduling (4h) - Cloud Scheduler for daily runs at 9 AM Dubai time, budget cap $5/run, email digest, error notifications. Task 5: LinkedIn Signal Source (7h) - Company announcements, leadership changes, executive hires, office openings, product launches via RapidAPI LinkedIn API.',
      businessValue: 'Continuous automated lead discovery, 10+ signals/day, reduced manual effort'
    },
    {
      name: 'Phase 4: Webhook Reliability',
      category: 'Infrastructure',
      status: 'Not Started',
      completion: 0,
      sprint: 'Sprint 18',
      startDate: null,
      notes: 'Task 6: Webhook Retry Logic (3h) - Bull MQ exponential backoff (5 attempts: immediate, 1m, 5m, 15m, 1h), dead letter queue for failures, admin dashboard for retry stats.',
      businessValue: 'Resilient webhook delivery, zero data loss, automatic recovery'
    },
    {
      name: 'Phase 5: Signal Intelligence',
      category: 'RADAR',
      status: 'Not Started',
      completion: 0,
      sprint: 'Sprint 18',
      startDate: null,
      notes: 'Task 7: Signal Confidence Scoring (5h) - Source credibility (40%), signal freshness (30%), data completeness (30%). Scores 0-100, UI displays High/Medium/Low, signals sorted by confidence.',
      businessValue: 'Intelligent signal prioritization, improved lead quality, data-driven decisions'
    },
    {
      name: 'Phase 6: Production Monitoring',
      category: 'Infrastructure',
      status: 'Not Started',
      completion: 0,
      sprint: 'Sprint 18',
      startDate: null,
      notes: 'Task 8: Error Recovery Dashboard (6h) - Admin UI for failed operations (enrichment, webhooks, RADAR), manual/bulk retry, error analytics. Task 9: Production Monitoring (4h) - Cloud Monitoring dashboards, Sentry alerts (error rate > 5%), cost tracking, SLO tracking (99.5% uptime, p95 < 2.5s).',
      businessValue: 'Proactive issue detection, rapid recovery, cost control, SLO compliance'
    }
  ];

  for (const phase of phases) {
    // Check if phase already exists
    const existing = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      filter: {
        property: 'Features',
        title: {
          contains: phase.name
        }
      }
    });

    if (existing.results.length > 0) {
      console.log(`  ⚠️  ${phase.name} already exists, skipping...`);
      continue;
    }

    // Create new phase entry
    const properties = {
      'Features': { title: [{ text: { content: phase.name } }] },
      'Category': { select: { name: phase.category } },
      'Status': { select: { name: phase.status } },
      'Completion': { number: phase.completion },
      'Sprint': { rich_text: [{ text: { content: phase.sprint } }] },
      'Notes': { rich_text: [{ text: { content: phase.notes } }] },
      'Business Value': { rich_text: [{ text: { content: phase.businessValue } }] }
    };

    if (phase.startDate) {
      properties['Started At'] = { date: { start: phase.startDate } };
    }

    await notion.pages.create({
      parent: { database_id: WORK_ITEMS_DB },
      properties
    });

    console.log(`  ✅ Created: ${phase.name}`);
  }

  console.log('\n✅ Sprint 18 phases created in MODULE FEATURES\n');
}

// ============================================================================
// RUN ALL UPDATES
// ============================================================================

async function run() {
  try {
    await updateSprint17();
    await updateSprint18();
    await completePhase12();
    await createSprint18Phases();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Sprint 17 Completion & Sprint 18 Setup Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 Summary:');
    console.log('   • Sprint 17: Marked as Complete with full details');
    console.log('   • Sprint 18: Marked as Active with task breakdown');
    console.log('   • Phase 12: Marked as Complete in MODULE FEATURES');
    console.log('   • Sprint 18 Phases: Created in MODULE FEATURES\n');
    console.log('➡️  View in Notion:');
    console.log('   SPRINTS: https://www.notion.so/UPR-Roadmap-2a266151dd16806c8caae5726ae4bf3e');
    console.log('   MODULE FEATURES: (check your workspace)\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

run();
