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
const SPRINTS_DB = process.env.SPRINTS_DB_ID;
const MODULE_FEATURES_DB = process.env.WORK_ITEMS_DB_ID;
const MODULES_DB = process.env.MODULES_DB_ID;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 Starting Sprint 20: SIVA Phase 4 - Infrastructure & Integration');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Sprint 20 task data
const sprint20Tasks = {
  'Phase 4.1: REST API Layer for SIVA Tools (Task 1)': {
    priority: 'P1',
    status: 'Not Started',
    sprint: 20,
    type: 'Feature',
    eta: 8,
    complexity: 'High',
    tags: ['Backend', 'AI Agent Core', 'API'],
    assignee: 'Claude Code',
    notes: 'Create HTTP endpoints for all 12 SIVA tools with request/response validation, error handling, rate limiting, and health checks. 14 POST endpoints total.',
    dependencies: '12 SIVA tools (Sprint 17), Express router, Ajv validation'
  },
  'Phase 4.2: Database Persistence Layer (Task 2)': {
    priority: 'P1',
    status: 'Not Started',
    sprint: 20,
    type: 'Feature',
    eta: 6,
    complexity: 'High',
    tags: ['Backend', 'AI Agent Core', 'Database'],
    assignee: 'Claude Code',
    notes: 'Persist all SIVA tool decisions to database for analysis and human override. 3 tables: agent_decisions, agent_overrides, persona_versions. Auto-logging after each tool execution.',
    dependencies: 'PostgreSQL, database migration, agent persistence service'
  },
  'Phase 4.3: Discovery Engine Integration (Task 3)': {
    priority: 'P1',
    status: 'Not Started',
    sprint: 20,
    type: 'Feature',
    eta: 5,
    complexity: 'High',
    tags: ['Backend', 'Discovery', 'Integration'],
    assignee: 'Claude Code',
    notes: 'Wire SIVA Tools 1, 3, 4 into signal discovery pipeline. Company quality scoring, edge case detection, timing optimization. Expected 30% reduction in low-quality signals processed.',
    dependencies: 'Multi-source orchestrator, SIVA tools, discovery pipeline'
  },
  'Phase 4.4: Enrichment Engine Integration (Task 4)': {
    priority: 'P1',
    status: 'Not Started',
    sprint: 20,
    type: 'Feature',
    eta: 5,
    complexity: 'High',
    tags: ['Backend', 'Enrichment', 'Integration'],
    assignee: 'Claude Code',
    notes: 'Wire SIVA Tools 2, 5, 7, 8 into enrichment pipeline. Contact tier filtering, banking product matching, composite Q-Score generation. Expected 50% cost reduction via filtering.',
    dependencies: 'Enrichment engine, SIVA tools, Q-Score pipeline'
  },
  'Phase 4.5: OpenTelemetry Monitoring (Task 5)': {
    priority: 'P2',
    status: 'Not Started',
    sprint: 20,
    type: 'Infrastructure',
    eta: 6,
    complexity: 'Medium',
    tags: ['Infrastructure', 'Monitoring', 'Observability'],
    assignee: 'Claude Code',
    notes: 'Full observability for SIVA tool performance. Per-tool latency tracking (p50/p95/p99), error rate monitoring, confidence distribution, Cloud Monitoring dashboards.',
    dependencies: 'OpenTelemetry SDK, Cloud Monitoring, Sentry'
  },
  'Phase 4.6: Persona Policy Engine (Task 6)': {
    priority: 'P2',
    status: 'Not Started',
    sprint: 20,
    type: 'Feature',
    eta: 4,
    complexity: 'Medium',
    tags: ['Backend', 'AI Agent Core', 'Governance'],
    assignee: 'Claude Code',
    notes: 'Central orchestration with ALWAYS/NEVER rule enforcement. Pre/post execution validation, confidence gates, policy violation reporting, edge case application.',
    dependencies: 'SIVA tools, policy rules, validation logic'
  }
};

async function startSprint20() {
  console.log(`Sprints DB ID: ${SPRINTS_DB}`);
  console.log(`Module Features DB ID: ${MODULE_FEATURES_DB}`);
  console.log(`Modules DB ID: ${MODULES_DB}\n`);

  // 1. Create Sprint 20 entry in SPRINTS database
  console.log('━━━ Step 1: Creating Sprint 20 in SPRINTS ━━━\n');

  try {
    const sprint20 = await notion.pages.create({
      parent: { database_id: SPRINTS_DB },
      properties: {
        'Sprint Number': {
          number: 20
        },
        'Status': {
          select: { name: 'Active' }
        },
        'Started At': {
          date: { start: '2025-11-14' }
        },
        'Goal': {
          rich_text: [{
            text: {
              content: 'Wire 12 SIVA tools into production pipeline with REST API, database persistence, and monitoring'
            }
          }]
        },
        'Business Value': {
          rich_text: [{
            text: {
              content: 'AI Agent Core integration enables intelligent lead scoring, contact selection, and outreach optimization. Expected 30% improvement in lead quality, 50% reduction in enrichment costs.'
            }
          }]
        },
        'Phases Updated': {
          multi_select: [
            { name: 'Phase 4: Infrastructure & Integration' }
          ]
        }
      }
    });

    console.log('✅ Sprint 20 created in SPRINTS database');
    console.log(`   Page ID: ${sprint20.id}\n`);
  } catch (error) {
    console.error('❌ Error creating Sprint 20:', error.message);
  }

  // 2. Create 6 tasks in MODULE FEATURES database
  console.log('━━━ Step 2: Creating 6 tasks in MODULE FEATURES ━━━\n');

  let created = 0;
  for (const [title, task] of Object.entries(sprint20Tasks)) {
    console.log(`📌 Creating: ${title}`);

    try {
      await notion.pages.create({
        parent: { database_id: MODULE_FEATURES_DB },
        properties: {
          'Features': {
            title: [{ text: { content: title } }]
          },
          'Priority': {
            select: { name: task.priority }
          },
          'Status': {
            select: { name: task.status }
          },
          'Sprint': {
            number: task.sprint
          },
          'Type': {
            select: { name: task.type }
          },
          'ETA': {
            number: task.eta
          },
          'Complexity': {
            select: { name: task.complexity }
          },
          'Tags': {
            multi_select: task.tags.map(tag => ({ name: tag }))
          },
          'Assignee': {
            rich_text: [{ text: { content: task.assignee } }]
          },
          'Notes': {
            rich_text: [{ text: { content: task.notes } }]
          },
          'Dependencies': {
            rich_text: [{ text: { content: task.dependencies } }]
          },
          'Done?': {
            checkbox: false
          }
        }
      });

      console.log(`   ✅ Created\n`);
      created++;

    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}\n`);
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Created ${created}/${Object.keys(sprint20Tasks).length} tasks in MODULE FEATURES`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 3. Update MODULES database
  console.log('━━━ Step 3: Updating MODULES database ━━━\n');

  try {
    // Update AI Agent Core module
    const modulesResponse = await notion.databases.query({
      database_id: MODULES_DB
    });

    const aiAgentCore = modulesResponse.results.find(
      page => page.properties.Name?.title?.[0]?.text?.content === 'AI Agent Core'
    );

    if (aiAgentCore) {
      await notion.pages.update({
        page_id: aiAgentCore.id,
        properties: {
          'Completion %': {
            number: 0.4  // Starting point before Sprint 20
          },
          'Status': {
            select: { name: 'In Progress' }
          }
        }
      });

      console.log('✅ Updated AI Agent Core module to 0.4% (pre-Sprint 20)');
    }

    // Update Discovery Engine module (enhancing from 15%)
    const discoveryEngine = modulesResponse.results.find(
      page => page.properties.Name?.title?.[0]?.text?.content === 'Discovery Engine'
    );

    if (discoveryEngine) {
      console.log('✅ Discovery Engine remains at 15% (will update post-Sprint 20)');
    }

  } catch (error) {
    console.error('❌ Error updating MODULES:', error.message);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 Sprint 20 Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Sprint: 20');
  console.log('Goal: SIVA Phase 4 - Infrastructure & Integration');
  console.log('Tasks: 6 tasks (34 hours)');
  console.log('Duration: 2 weeks (Nov 14-28, 2025)');
  console.log('Status: Ready to begin\n');
  console.log('Focus Areas:');
  console.log('  • REST API Layer for 12 SIVA tools');
  console.log('  • Database persistence (agent_decisions)');
  console.log('  • Discovery Engine integration (Tools 1,3,4)');
  console.log('  • Enrichment Engine integration (Tools 2,5,7,8)');
  console.log('  • OpenTelemetry monitoring');
  console.log('  • Persona Policy Engine\n');
  console.log('Expected Outcomes:');
  console.log('  • AI Agent Core: 0.4% → 50%+');
  console.log('  • Discovery Engine: 15% → 30%+');
  console.log('  • Project Overall: 40% → 50%+');
  console.log('  • 23 new API endpoints');
  console.log('  • Full SIVA tool observability\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

startSprint20().catch(console.error);
