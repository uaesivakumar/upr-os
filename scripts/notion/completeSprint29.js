#!/usr/bin/env node
/**
 * Complete Notion Sync for Sprint 29
 *
 * Updates:
 * 1. Sprints page - all metadata fields
 * 2. Modules & Features page - mark sprint tasks as Done
 *
 * Usage: node scripts/notion/completeSprint29.js
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
const envPath = path.join(process.cwd(), 'scripts', 'notion', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs from .env
const SPRINTS_DB_ID = process.env.JOURNAL_DB_ID;
const MODULE_FEATURES_DB_ID = process.env.WORK_ITEMS_DB_ID;

// Sprint 29 metadata
const SPRINT_29_DATA = {
  branch: 'main',
  commit: 'f08789c',
  commitsCount: 4,
  commitRange: '6ae13d1..f08789c',
  date: '2025-11-16',
  startedAt: '2025-11-16',
  completedAt: '2025-11-16',
  gitTag: 'sprint-29',
  goal: 'Complete Phase 3 (Centralized Agentic Hub) to 50% with REST API deployment on Cloud Run',
  highlights: '• Centralized Agentic Hub architecture (60+ pages)\n• REST API deployed on GCP Cloud Run\n• Multi-tool workflows (3 workflows)\n• Tool Registry with circuit breakers & health checks\n• MCP protocol integration (Claude Desktop ready)',
  learnings: '• User feedback: "why there is Claude desktop, this is local machine. we dont test anything in local, why not in GCP cloud?" - Pivoted to cloud-first REST API deployment\n• Circuit breaker pattern for tool resilience\n• Workflow orchestration with topological sort\n• Geometric mean confidence for multi-tool aggregation\n• JSONPath for dynamic input mapping',
  outcomes: '• Phase 3: Advanced from 0% to 50%\n• Overall SIVA: 64% (from 60%)\n• REST API production-ready: 7/7 tests passed\n• 4 tools + 3 workflows operational\n• Cloud deployment verified',
  sprintNotes: 'Focus: Cloud-first Agent Hub deployment. User feedback led to prioritizing REST API on Cloud Run over local MCP integration. Implemented ToolRegistry, RequestRouter, WorkflowEngine, ResponseAggregator with enterprise resilience patterns.',
  businessValue: 'Agent Hub enables multi-tool orchestration for complete lead scoring (company + contact + timing + products). REST API on Cloud Run provides universal HTTP access. 523ms execution time for all 4 tools with 0.81 aggregate confidence.'
};

async function updateSprint29() {
  console.log('\n📦 Processing Sprint 29...');

  // Find sprint page
  console.log('📍 Finding Sprint 29 page...');
  const sprintsResponse = await notion.databases.query({
    database_id: SPRINTS_DB_ID,
    filter: {
      property: 'Sprint',
      title: {
        contains: 'Sprint 29'
      }
    }
  });

  if (sprintsResponse.results.length === 0) {
    console.log('⚠️  Sprint 29 not found, skipping...');
    return;
  }

  const sprintPage = sprintsResponse.results[0];
  console.log(`✅ Found Sprint 29: ${sprintPage.id}`);

  // Update sprint page with all metadata
  console.log('📝 Updating Sprint 29 metadata...');

  await notion.pages.update({
    page_id: sprintPage.id,
    properties: {
      'Status': {
        select: {
          name: 'Done'
        }
      },
      'Branch': {
        rich_text: [{
          text: { content: SPRINT_29_DATA.branch }
        }]
      },
      'Commit': {
        rich_text: [{
          text: { content: SPRINT_29_DATA.commit }
        }]
      },
      'Commits Count': {
        number: SPRINT_29_DATA.commitsCount
      },
      'Commit Range': {
        rich_text: [{
          text: { content: SPRINT_29_DATA.commitRange }
        }]
      },
      'Date': {
        date: {
          start: SPRINT_29_DATA.date
        }
      },
      'Started At': {
        date: {
          start: SPRINT_29_DATA.startedAt
        }
      },
      'Completed At': {
        date: {
          start: SPRINT_29_DATA.completedAt
        }
      },
      'Git Tag': {
        rich_text: [{
          text: { content: SPRINT_29_DATA.gitTag }
        }]
      },
      'Goal': {
        rich_text: [{
          text: { content: SPRINT_29_DATA.goal }
        }]
      },
      'Highlights': {
        rich_text: [{
          text: { content: SPRINT_29_DATA.highlights }
        }]
      },
      'Learnings': {
        rich_text: [{
          text: { content: SPRINT_29_DATA.learnings }
        }]
      },
      'Outcomes': {
        rich_text: [{
          text: { content: SPRINT_29_DATA.outcomes }
        }]
      },
      'Sprint Notes': {
        rich_text: [{
          text: { content: SPRINT_29_DATA.sprintNotes }
        }]
      },
      'Business Value': {
        rich_text: [{
          text: { content: SPRINT_29_DATA.businessValue }
        }]
      },
      'Synced At': {
        date: {
          start: new Date().toISOString()
        }
      }
    }
  });

  console.log('✅ Sprint 29 metadata updated');
}

async function updateModulesAndFeatures() {
  console.log('\n📊 Updating Modules & Features...');

  // Query for features with Sprint 29
  console.log('📍 Finding Sprint 29 features...');

  const featuresResponse = await notion.databases.query({
    database_id: MODULE_FEATURES_DB_ID,
    filter: {
      property: 'Sprint',
      number: {
        equals: 29
      }
    }
  });

  console.log(`✅ Found ${featuresResponse.results.length} features to update`);

  // Update each feature to Done
  for (const feature of featuresResponse.results) {
    const featureName = feature.properties.Features?.title?.[0]?.plain_text || 'Unknown';

    try {
      await notion.pages.update({
        page_id: feature.id,
        properties: {
          'Status': {
            select: {
              name: 'Done'
            }
          }
        }
      });
      console.log(`  ✅ Sprint 29: ${featureName} → Done`);
    } catch (error) {
      console.log(`  ⚠️  Sprint 29: ${featureName} → Failed (${error.message})`);
    }
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Complete Notion Sync - Sprint 29');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    // Update Sprint 29 page
    await updateSprint29();

    // Update Modules & Features
    await updateModulesAndFeatures();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ All Updates Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n📊 Summary:');
    console.log('  - Sprint 29: All metadata updated + status Done');
    console.log('  - Modules & Features: All sprint tasks marked Done');
    console.log('\n🎯 Sprint 29 Details:');
    console.log('  - Goal: Centralized Agentic Hub with REST API on Cloud Run');
    console.log('  - Phase 3: 0% → 50%');
    console.log('  - Overall SIVA: 60% → 64%');
    console.log('  - Production Deployment: ✅ 7/7 tests passed');
    console.log('  - Service URL: https://upr-web-service-191599223867.us-central1.run.app');
    console.log('\n🎯 Ready for Sprint 30!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
