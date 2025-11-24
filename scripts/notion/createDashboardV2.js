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
const SPRINTS_DB = process.env.JOURNAL_DB_ID || process.env.NOTION_JOURNAL_DB;
const MODULE_FEATURES_DB = process.env.WORK_ITEMS_DB_ID;
const MODULES_DB = process.env.MODULES_DB_ID;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Creating UPR Project Dashboard V2');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============================================================================
// Helper: Create text block
// ============================================================================

function text(content) {
  return {
    type: 'text',
    text: { content }
  };
}

// ============================================================================
// Helper: Create simple callout (no nested formatting)
// ============================================================================

function callout(content, emoji, color = 'gray_background') {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: [text(content)],
      icon: { type: 'emoji', emoji },
      color
    }
  };
}

// ============================================================================
// Helper: Create heading
// ============================================================================

function heading(level, content, color = 'default') {
  return {
    object: 'block',
    type: `heading_${level}`,
    [`heading_${level}`]: {
      rich_text: [text(content)],
      color
    }
  };
}

// ============================================================================
// Helper: Create paragraph
// ============================================================================

function paragraph(content) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [text(content)]
    }
  };
}

// ============================================================================
// Helper: Create bulleted list item
// ============================================================================

function bulletItem(content) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [text(content)]
    }
  };
}

// ============================================================================
// Helper: Create divider
// ============================================================================

function divider() {
  return {
    object: 'block',
    type: 'divider',
    divider: {}
  };
}

// ============================================================================
// Create Dashboard
// ============================================================================

async function createDashboard() {
  console.log('📝 Creating dashboard page...\n');

  try {
    const dashboardPage = await notion.pages.create({
      parent: {
        type: 'page_id',
        page_id: '2a266151dd16806c8caae5726ae4bf3e' // UPR workspace root
      },
      icon: {
        type: 'emoji',
        emoji: '📊'
      },
      properties: {
        title: {
          title: [text('UPR Project Dashboard')]
        }
      },
      children: [
        // Header
        heading(1, '🎯 UPR Project Tracking Dashboard', 'blue'),
        callout('Last updated: November 13, 2025 | Sprint 20 Complete', '📅', 'blue_background'),
        divider(),

        // Project Overview
        heading(2, '📈 Project Overview'),
        bulletItem('Current Sprint: Sprint 20 - Complete ✅'),
        bulletItem('Project Progress: 50% Complete (Phase 4 of 12 complete)'),
        bulletItem('Next Sprint: Sprint 21 - Planning'),
        bulletItem('SIVA Tools: 12 operational (Foundation: 4, STRICT: 4, DELEGATED: 4)'),
        bulletItem('Test Status: 21/21 smoke tests passing (100%)'),
        divider(),

        // Sprint 20 Summary
        heading(2, '🚀 Sprint 20 Summary'),
        callout('Sprint 20: SIVA Phase 4 - Infrastructure & Integration', '✅', 'green_background'),
        paragraph('Goal: Wire 12 SIVA tools into production with REST API, database persistence, and monitoring'),
        heading(3, '📦 Completed Tasks'),
        bulletItem('Phase 4.1: REST API Layer (14 endpoints)'),
        bulletItem('Phase 4.2: Database Persistence (3 tables: decisions, overrides, versions)'),
        bulletItem('Phase 4.3: Discovery Integration'),
        bulletItem('Phase 4.4: Enrichment Integration'),
        bulletItem('Phase 4.5: OpenTelemetry Monitoring'),
        bulletItem('Phase 4.6: Persona Policy Engine'),

        heading(3, '🎯 Test Results'),
        bulletItem('Smoke Tests: 21/21 passing (100%)'),
        bulletItem('Stress Tests: 0% error rate'),
        bulletItem('Foundation Tools p95: 510ms'),
        bulletItem('STRICT Tools p95: 308ms'),
        bulletItem('DELEGATED Tools p95: 340ms'),

        heading(3, '📈 Impact'),
        bulletItem('12 SIVA tools operational'),
        bulletItem('API endpoints: 14 (tools) + 5 (analytics)'),
        bulletItem('Database tables: 3 with full persistence'),
        bulletItem('Integration: Discovery + Enrichment pipelines'),
        bulletItem('Monitoring: Full observability with OpenTelemetry'),
        bulletItem('Project Progress: 40% → 50%'),
        divider(),

        // SIVA Phases Progress
        heading(2, '🧠 SIVA Phases Progress (12 Total)'),
        callout('4 of 12 phases complete. Phase 2 (Cognitive Framework) in progress.', '📊', 'gray_background'),
      ]
    });

    console.log('✅ Dashboard page created successfully\n');
    console.log(`📄 Page ID: ${dashboardPage.id}\n`);

    // Add SIVA phases table as a second batch of children
    console.log('📊 Adding SIVA phases table...\n');

    await notion.blocks.children.append({
      block_id: dashboardPage.id,
      children: [
        heading(3, 'Phase Status Overview'),
        bulletItem('Phase 1: Persona Extraction - To-Do (0%)'),
        bulletItem('Phase 2: Cognitive Framework - In Progress (30% - 12 tools built)'),
        bulletItem('Phase 3: Centralized Agentic Hub - To-Do (0%)'),
        bulletItem('Phase 4: Infrastructure & Integration - Complete ✅ (100% - Sprint 20)'),
        bulletItem('Phase 5: Cognitive Extraction & Encoding - To-Do (0%)'),
        bulletItem('Phase 6: Prompt Engineering (SIVA-Mode) - To-Do (0%)'),
        bulletItem('Phase 7: Quantitative Intelligence Layer - To-Do (0%)'),
        bulletItem('Phase 8: Opportunity Lifecycle Engine - To-Do (0%)'),
        bulletItem('Phase 9: Explainability & Transparency - To-Do (0%)'),
        bulletItem('Phase 10: Feedback & Reinforcement - To-Do (0%)'),
        bulletItem('Phase 11: Multi-Agent Collaboration - To-Do (0%)'),
        bulletItem('Phase 12: Lead Scoring Engine - Complete ✅ (100% - Sprint 18)'),
        divider(),

        // Quick Links
        heading(2, '🔗 Quick Links'),
        paragraph('Navigate to key databases and views:'),
      ]
    });

    // Add database links as a third batch
    console.log('🔗 Adding database links...\n');

    await notion.blocks.children.append({
      block_id: dashboardPage.id,
      children: [
        bulletItem('📅 Sprints Database - Track sprint progress and velocity'),
        bulletItem('📋 MODULE FEATURES - View tasks by status, sprint, and phase'),
        bulletItem('📦 Modules - See module completion and dependencies'),
        bulletItem('📚 Documentation - Access all project documentation'),
        divider(),

        // Next Actions
        heading(2, '⚡ Next Actions'),
        callout('Ready to plan Sprint 21', '🎯', 'yellow_background'),
        bulletItem('Review Sprint 20 completion and lessons learned'),
        bulletItem('Define Sprint 21 goals (likely Phase 5: Cognitive Extraction & Encoding)'),
        bulletItem('Break down Phase 5 into actionable tasks'),
        bulletItem('Update Notion with Sprint 21 plan'),
        divider(),

        // Database Embeds Section
        heading(2, '📊 Live Database Views'),
        paragraph('Embedded views for real-time tracking:'),
      ]
    });

    // Add linked database views as a fourth batch
    console.log('📊 Adding database views...\n');

    await notion.blocks.children.append({
      block_id: dashboardPage.id,
      children: [
        // Sprints database view
        heading(3, '📅 Recent Sprints'),
        {
          object: 'block',
          type: 'linked_database',
          linked_database: {
            database_id: SPRINTS_DB
          }
        },

        // MODULE FEATURES database view
        heading(3, '📋 Current Sprint Tasks'),
        {
          object: 'block',
          type: 'linked_database',
          linked_database: {
            database_id: MODULE_FEATURES_DB
          }
        },

        divider(),

        // Footer
        callout('Dashboard created automatically via Notion API', '🤖', 'gray_background'),
        paragraph('Last sync: November 13, 2025')
      ]
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Dashboard Created Successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📄 Dashboard URL: https://notion.so/${dashboardPage.id.replace(/-/g, '')}\n`);
    console.log('📊 Sections Added:');
    console.log('   ✅ Project Overview');
    console.log('   ✅ Sprint 20 Summary');
    console.log('   ✅ SIVA Phases Progress');
    console.log('   ✅ Quick Links');
    console.log('   ✅ Next Actions');
    console.log('   ✅ Live Database Views (Sprints, MODULE FEATURES)\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error creating dashboard:', error);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
    throw error;
  }
}

// ============================================================================
// Run
// ============================================================================

createDashboard().catch(console.error);
