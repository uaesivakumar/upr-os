#!/usr/bin/env node
/**
 * Get Sprint 43 tasks from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function getSprint43Tasks() {
  console.log('🔍 Fetching Sprint 43 requirements from Notion...\n');

  try {
    // Get Sprint 43 details
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 43' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 43 not found');
      process.exit(1);
    }

    const sprint = sprintsResponse.results[0];
    const sprintProps = sprint.properties;

    console.log('📋 SPRINT 43 DETAILS:');
    console.log('='.repeat(80));

    // Sprint name
    const sprintName = sprintProps.Sprint?.title?.[0]?.text?.content || 'Sprint 43';
    console.log(`\nSprint: ${sprintName}`);

    // Goal
    const goal = sprintProps.Goal?.rich_text?.[0]?.text?.content || 'Not specified';
    console.log(`\nGoal:\n${goal}`);

    // Status
    const status = sprintProps.Status?.select?.name || 'Not Started';
    console.log(`\nStatus: ${status}`);

    // Get all tasks for Sprint 43
    console.log('\n' + '='.repeat(80));
    console.log('📝 SPRINT 43 TASKS:\n');

    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 43 } }
    });

    console.log(`Total tasks: ${featuresResponse.results.length}\n`);

    featuresResponse.results.forEach((feature, index) => {
      const name = feature.properties.Features?.title?.[0]?.text?.content || 'Unnamed';
      const status = feature.properties.Status?.select?.name || 'Not Started';
      const module = feature.properties.Module?.select?.name || 'N/A';

      console.log(`${index + 1}. ${name}`);
      console.log(`   Module: ${module}`);
      console.log(`   Status: ${status}`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('\n✅ Sprint 43 requirements retrieved successfully\n');

    // Return structured data
    return {
      sprint: sprintName,
      goal,
      status,
      tasks: featuresResponse.results.map(f => ({
        name: f.properties.Features?.title?.[0]?.text?.content || 'Unnamed',
        status: f.properties.Status?.select?.name || 'Not Started',
        module: f.properties.Module?.select?.name || 'N/A',
        id: f.id
      }))
    };

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  process.exit(1);
}

getSprint43Tasks();
