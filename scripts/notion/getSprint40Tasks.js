#!/usr/bin/env node
/**
 * Fetch Sprint 40 tasks from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function getSprint40Tasks() {
  console.log('🔍 Fetching Sprint 40 tasks from Notion...\n');

  try {
    // Get Sprint 40 details
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 40' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 40 not found');
      process.exit(1);
    }

    const sprint = sprintsResponse.results[0];
    const sprintName = sprint.properties.Sprint?.title?.[0]?.text?.content || 'Unknown';
    const description = sprint.properties.Description?.rich_text?.[0]?.text?.content || 'No description';
    const phase = sprint.properties.Phase?.select?.name || 'Unknown';
    const status = sprint.properties.Status?.select?.name || 'Not Started';

    console.log(`📋 Sprint: ${sprintName}`);
    console.log(`📦 Phase: ${phase}`);
    console.log(`📊 Status: ${status}`);
    console.log(`📝 Description: ${description}\n`);

    // Get all features for Sprint 40
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 40 } },
      sorts: [{ property: 'Priority', direction: 'ascending' }]
    });

    console.log(`✅ Found ${featuresResponse.results.length} tasks for Sprint 40:\n`);

    const tasks = featuresResponse.results.map((feature, index) => {
      const name = feature.properties.Features?.title?.[0]?.text?.content || 'Unknown';
      const priority = feature.properties.Priority?.select?.name || 'Medium';
      const module = feature.properties.Module?.select?.name || 'Unknown';
      const status = feature.properties.Status?.select?.name || 'Not Started';
      const description = feature.properties.Description?.rich_text?.[0]?.text?.content || '';

      console.log(`\n${index + 1}. [${priority}] ${name}`);
      console.log(`   Module: ${module} | Status: ${status}`);
      if (description) {
        console.log(`   Description: ${description}`);
      }

      return {
        id: feature.id,
        name,
        priority,
        module,
        status,
        description
      };
    });

    console.log('\n' + '='.repeat(60));
    console.log(`Sprint 40: ${sprintName}`);
    console.log(`Phase: ${phase}`);
    console.log(`Status: ${status}`);
    console.log(`Total Tasks: ${featuresResponse.results.length}`);
    console.log('='.repeat(60));

    return {
      sprint: sprintName,
      phase,
      status,
      description,
      taskCount: featuresResponse.results.length,
      tasks
    };

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'object_not_found') {
      console.error('💡 Make sure Sprint 40 exists in Notion');
    }
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  process.exit(1);
}

getSprint40Tasks();
