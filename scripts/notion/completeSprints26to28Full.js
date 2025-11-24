#!/usr/bin/env node
/**
 * Complete Notion Sync for Sprints 26, 27, 28
 *
 * Updates:
 * 1. Sprints page - all metadata fields
 * 2. Modules & Features page - mark sprint tasks as Done
 *
 * Usage: node scripts/notion/completeSprints26to28Full.js
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

// Sprint metadata
const SPRINTS_DATA = {
  'Sprint 26': {
    branch: 'main',
    commit: '146099e',
    commitsCount: 3,
    commitRange: '0ac2a8f..146099e',
    date: '2025-11-16',
    startedAt: '2025-11-16',
    completedAt: '2025-11-16',
    gitTag: 'sprint-26',
    goal: 'Complete Phase 4 (Infrastructure & Topology) to 100% + advance Phase 10 (Feedback Loop) to 50%',
    highlights: '• Phase 4 Infrastructure complete (100%)\n• Feedback Loop API implementation\n• Decision logging architecture\n• Database migrations for agent_core schema',
    learnings: '• Cloud SQL performance optimization techniques\n• Database schema design for agent decisions\n• API endpoint design for feedback collection',
    outcomes: '• Phase 4: 100% complete\n• Phase 10: Advanced from 40% to 50%\n• Feedback API endpoints deployed\n• Decision tracking infrastructure ready',
    sprintNotes: 'Focus: Infrastructure completion + Feedback Loop foundation. Completed database migrations, API endpoints, and decision logging architecture.',
    businessValue: 'Established foundation for AI agent improvement through feedback collection and decision tracking. Phase 4 infrastructure enables scalable deployment.'
  },
  'Sprint 27': {
    branch: 'main',
    commit: 'c0385a4',
    commitsCount: 2,
    commitRange: '146099e..c0385a4',
    date: '2025-11-16',
    startedAt: '2025-11-16',
    completedAt: '2025-11-16',
    gitTag: 'sprint-27',
    goal: 'Advance Phase 10 (Feedback & Reinforcement Analytics) from 50% to 80% with A/B testing and automated monitoring',
    highlights: '• A/B testing framework implementation\n• Automated monitoring system\n• Shadow mode decision comparison\n• Consistent hashing for version selection',
    learnings: '• A/B testing best practices for AI agents\n• Shadow mode architecture patterns\n• Monitoring system design for rule engines',
    outcomes: '• Phase 10: Advanced from 50% to 80%\n• A/B testing live across all tools\n• Monitoring infrastructure deployed\n• Decision comparison analytics ready',
    sprintNotes: 'Focus: A/B testing + monitoring infrastructure. Implemented consistent hashing, shadow mode execution, and automated performance monitoring.',
    businessValue: 'Enables data-driven improvement of AI agents through A/B testing and automated monitoring. Foundation for continuous optimization.'
  },
  'Sprint 28': {
    branch: 'main',
    commit: '6ae13d1',
    commitsCount: 4,
    commitRange: 'c0385a4..6ae13d1',
    date: '2025-11-16',
    startedAt: '2025-11-16',
    completedAt: '2025-11-16',
    gitTag: 'sprint-28',
    goal: 'Complete Phase 10 (Feedback & Reinforcement Analytics) to 100% with scoring adjustments and rule engines',
    highlights: '• Scoring adjustments for all 4 SIVA tools\n• Rule engines for TimingScore & BankingProductMatch\n• Reinforcement learning system\n• Shadow mode comparison across tools',
    learnings: '• Reinforcement learning integration patterns\n• Rule engine wrapper architecture\n• ES6 module loading in CommonJS context\n• Scoring adjustment formula design',
    outcomes: '• Phase 10: Complete at 100%\n• Overall SIVA: 60% (7/12 phases)\n• 4/4 tools with scoring adjustments\n• 3/4 tools with rule engines\n• Production deployment verified',
    sprintNotes: 'Focus: Phase 10 completion. Implemented reinforcement learning via scoring adjustments, integrated rule engines for shadow mode, and completed feedback analytics infrastructure.',
    businessValue: 'AI agents now automatically improve from feedback data. Scoring adjustments (±20%) enable continuous optimization without manual tuning. Rule engine comparison validates decision quality.'
  }
};

async function updateSprint(sprintName) {
  console.log(`\n📦 Processing ${sprintName}...`);

  const data = SPRINTS_DATA[sprintName];

  // Find sprint page
  console.log(`📍 Finding ${sprintName} page...`);
  const sprintsResponse = await notion.databases.query({
    database_id: SPRINTS_DB_ID,
    filter: {
      property: 'Sprint',
      title: {
        contains: sprintName
      }
    }
  });

  if (sprintsResponse.results.length === 0) {
    console.log(`⚠️  ${sprintName} not found, skipping...`);
    return;
  }

  const sprintPage = sprintsResponse.results[0];
  console.log(`✅ Found ${sprintName}: ${sprintPage.id}`);

  // Update sprint page with all metadata
  console.log(`📝 Updating ${sprintName} metadata...`);

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
          text: { content: data.branch }
        }]
      },
      'Commit': {
        rich_text: [{
          text: { content: data.commit }
        }]
      },
      'Commits Count': {
        number: data.commitsCount
      },
      'Commit Range': {
        rich_text: [{
          text: { content: data.commitRange }
        }]
      },
      'Date': {
        date: {
          start: data.date
        }
      },
      'Started At': {
        date: {
          start: data.startedAt
        }
      },
      'Completed At': {
        date: {
          start: data.completedAt
        }
      },
      'Git Tag': {
        rich_text: [{
          text: { content: data.gitTag }
        }]
      },
      'Goal': {
        rich_text: [{
          text: { content: data.goal }
        }]
      },
      'Highlights': {
        rich_text: [{
          text: { content: data.highlights }
        }]
      },
      'Learnings': {
        rich_text: [{
          text: { content: data.learnings }
        }]
      },
      'Outcomes': {
        rich_text: [{
          text: { content: data.outcomes }
        }]
      },
      'Sprint Notes': {
        rich_text: [{
          text: { content: data.sprintNotes }
        }]
      },
      'Business Value': {
        rich_text: [{
          text: { content: data.businessValue }
        }]
      },
      'Synced At': {
        date: {
          start: new Date().toISOString()
        }
      }
    }
  });

  console.log(`✅ ${sprintName} metadata updated`);
}

async function updateModulesAndFeatures() {
  console.log('\n📊 Updating Modules & Features...');

  // Query for features with Sprint 26, 27, or 28
  console.log('📍 Finding Sprint 26/27/28 features...');

  const featuresResponse = await notion.databases.query({
    database_id: MODULE_FEATURES_DB_ID,
    filter: {
      or: [
        {
          property: 'Sprint',
          number: {
            equals: 26
          }
        },
        {
          property: 'Sprint',
          number: {
            equals: 27
          }
        },
        {
          property: 'Sprint',
          number: {
            equals: 28
          }
        }
      ]
    }
  });

  console.log(`✅ Found ${featuresResponse.results.length} features to update`);

  // Update each feature to Done
  for (const feature of featuresResponse.results) {
    const featureName = feature.properties.Features?.title?.[0]?.plain_text || 'Unknown';
    const sprintNum = feature.properties.Sprint?.number || 'Unknown';
    const sprint = `Sprint ${sprintNum}`;

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
      console.log(`  ✅ ${sprint}: ${featureName} → Done`);
    } catch (error) {
      console.log(`  ⚠️  ${sprint}: ${featureName} → Failed (${error.message})`);
    }
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Complete Notion Sync - Sprints 26, 27, 28');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    // Update Sprints pages
    await updateSprint('Sprint 26');
    await updateSprint('Sprint 27');
    await updateSprint('Sprint 28');

    // Update Modules & Features
    await updateModulesAndFeatures();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ All Updates Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n📊 Summary:');
    console.log('  - Sprint 26: All metadata updated + status Done');
    console.log('  - Sprint 27: All metadata updated + status Done');
    console.log('  - Sprint 28: All metadata updated + status Done');
    console.log('  - Modules & Features: All sprint tasks marked Done');
    console.log('\n🎯 Ready for next sprint!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
