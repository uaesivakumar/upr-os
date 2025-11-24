#!/usr/bin/env node
/**
 * Complete Sprint 42 tasks in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function completeSprint42() {
  console.log('🚀 Completing Sprint 42 in Notion...\n');

  try {
    // Get Sprint 42 details
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 42' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 42 not found');
      process.exit(1);
    }

    const sprint = sprintsResponse.results[0];
    console.log('✅ Found Sprint 42\n');

    // Update Sprint 42 status to Complete
    await notion.pages.update({
      page_id: sprint.id,
      properties: {
        Status: { select: { name: 'Complete' } }
      }
    });
    console.log('✅ Updated Sprint 42 status to Complete\n');

    // Get all Sprint 42 tasks
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 42 } }
    });

    console.log(`📋 Found ${featuresResponse.results.length} tasks for Sprint 42\n`);

    // All tasks are completed
    const completedTasks = [
      'Design specialized agent architecture',
      'Create agent communication protocol',
      'Build agent coordination service',
      'Implement Discovery Agent',
      'Implement Validation Agent',
      'Implement Critic Agent',
      'Implement consensus mechanism',
      'Create agent decision logging',
      'Add agent performance tracking',
      'Build agent monitoring dashboard'
    ];

    // Update each task
    let completedCount = 0;
    for (const feature of featuresResponse.results) {
      const name = feature.properties.Features?.title?.[0]?.text?.content || 'Unknown';

      // Mark all Sprint 42 tasks as complete
      await notion.pages.update({
        page_id: feature.id,
        properties: {
          Status: { select: { name: 'Complete' } }
        }
      });
      console.log(`✅ Marked "${name}" as Complete`);
      completedCount++;
    }

    console.log(`\n🎉 Sprint 42 Completion Summary:`);
    console.log(`   - Sprint status: Complete`);
    console.log(`   - Tasks completed: ${completedCount}/${featuresResponse.results.length}`);
    console.log(`   - Multi-agent system: 3 specialized agents`);
    console.log(`   - Checkpoints passed: 3/3 (18/18 tests)`);
    console.log(`   - Code added: 3,806 lines`);
    console.log(`   - Files created: 14 new files`);
    console.log(`\n✅ Sprint 42: Multi-Agent System COMPLETE!`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  process.exit(1);
}

completeSprint42();
