#!/usr/bin/env node
/**
 * Fetch Sprint 37 tasks from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function getSprint37Tasks() {
  console.log('📋 Fetching Sprint 37 tasks from Notion...\n');

  try {
    // Get Sprint 37 info from Sprints DB
    const sprintResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 37' } }
    });

    if (sprintResponse.results.length === 0) {
      console.log('❌ Sprint 37 not found in Sprints database');
      process.exit(1);
    }

    const sprint = sprintResponse.results[0];
    const sprintName = sprint.properties.Sprint?.title?.[0]?.text?.content || 'Sprint 37';
    const phase = sprint.properties.Phase?.rich_text?.[0]?.text?.content || 'Unknown Phase';
    const status = sprint.properties.Status?.select?.name || 'Not Started';

    console.log('🎯 Sprint Information:');
    console.log(`   Name: ${sprintName}`);
    console.log(`   Phase: ${phase}`);
    console.log(`   Status: ${status}`);
    console.log('');

    // Get all features for Sprint 37
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 37 } },
      sorts: [{ property: 'Priority', direction: 'ascending' }]
    });

    console.log(`📝 Found ${featuresResponse.results.length} tasks for Sprint 37:\n`);

    const tasks = [];
    featuresResponse.results.forEach((page, index) => {
      const taskName = page.properties.Features?.title?.[0]?.text?.content || 'Unnamed Task';
      const priority = page.properties.Priority?.number || 0;
      const status = page.properties.Status?.select?.name || 'Not Started';
      const module = page.properties.Module?.select?.name || 'Unknown';
      const description = page.properties.Description?.rich_text?.[0]?.text?.content || '';

      tasks.push({ taskName, priority, status, module, description });

      console.log(`${index + 1}. [${status}] ${taskName}`);
      console.log(`   Module: ${module} | Priority: ${priority}`);
      if (description) {
        console.log(`   Description: ${description}`);
      }
      console.log('');
    });

    console.log('='.repeat(60));
    console.log(`✅ Sprint 37: ${phase}`);
    console.log(`   Total Tasks: ${tasks.length}`);
    console.log(`   Status: ${status}`);
    console.log('='.repeat(60));

    return { sprintName, phase, status, tasks };

  } catch (error) {
    console.error('❌ Error fetching from Notion:', error.message);
    if (error.body) {
      console.error(JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  console.log('Run: source .env && export NOTION_API_KEY=$NOTION_TOKEN');
  process.exit(1);
}

getSprint37Tasks();
