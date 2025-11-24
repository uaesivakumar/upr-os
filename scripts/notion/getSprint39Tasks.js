#!/usr/bin/env node
/**
 * Fetch Sprint 39 tasks from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function getSprint39Tasks() {
  console.log('🔍 Fetching Sprint 39 tasks from Notion...\n');

  try {
    // Get Sprint 39 details
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 39' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 39 not found');
      process.exit(1);
    }

    const sprint = sprintsResponse.results[0];
    const sprintName = sprint.properties.Sprint?.title?.[0]?.text?.content || 'Unknown';
    const description = sprint.properties.Description?.rich_text?.[0]?.text?.content || 'No description';
    const phase = sprint.properties.Phase?.select?.name || 'Unknown';

    console.log(`📋 Sprint: ${sprintName}`);
    console.log(`📦 Phase: ${phase}`);
    console.log(`📝 Description: ${description}\n`);

    // Get all features for Sprint 39
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 39 } },
      sorts: [{ property: 'Priority', direction: 'ascending' }]
    });

    console.log(`✅ Found ${featuresResponse.results.length} tasks for Sprint 39:\n`);

    featuresResponse.results.forEach((feature, index) => {
      const name = feature.properties.Features?.title?.[0]?.text?.content || 'Unknown';
      const priority = feature.properties.Priority?.select?.name || 'Medium';
      const module = feature.properties.Module?.select?.name || 'Unknown';
      const status = feature.properties.Status?.select?.name || 'Not Started';

      console.log(`${index + 1}. [${priority}] ${name}`);
      console.log(`   Module: ${module} | Status: ${status}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`Sprint 39: ${sprintName}`);
    console.log(`Phase: ${phase}`);
    console.log(`Total Tasks: ${featuresResponse.results.length}`);
    console.log('='.repeat(60));

    return {
      sprint: sprintName,
      phase,
      description,
      taskCount: featuresResponse.results.length,
      tasks: featuresResponse.results
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

getSprint39Tasks();
