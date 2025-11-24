#!/usr/bin/env node
/**
 * Fetch Sprint 34 tasks from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function getSprint34Tasks() {
  console.log('🔍 Fetching Sprint 34 tasks from Notion...\n');

  try {
    // Query for Sprint 34 features
    const response = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Sprint',
        number: {
          equals: 34
        }
      },
      sorts: [
        {
          property: 'Priority',
          direction: 'ascending'
        }
      ]
    });

    console.log(`✅ Found ${response.results.length} tasks for Sprint 34\n`);
    console.log('='.repeat(70));
    console.log('SPRINT 34 TASKS');
    console.log('='.repeat(70));
    console.log('');

    const tasks = [];

    for (const [index, page] of response.results.entries()) {
      const props = page.properties;

      const task = {
        number: index + 1,
        name: props.Features?.title?.[0]?.text?.content || 'Unnamed',
        status: props.Status?.select?.name || 'Not Started',
        priority: props.Priority?.select?.name || 'Medium',
        complexity: props.Complexity?.select?.name || 'Unknown',
        type: props.Type?.select?.name || 'Feature',
        notes: props.Notes?.rich_text?.[0]?.text?.content || '',
        done: props['Done?']?.checkbox || false,
        eta: props.ETA?.number || 0,
        tags: props.Tags?.multi_select?.map(t => t.name) || []
      };

      tasks.push(task);

      console.log(`${task.number}. ${task.name}`);
      console.log(`   Priority: ${task.priority} | Complexity: ${task.complexity} | Type: ${task.type}`);
      console.log(`   Status: ${task.status} | Done: ${task.done ? '✅' : '❌'}`);
      if (task.notes) {
        console.log(`   Notes: ${task.notes}`);
      }
      if (task.tags.length > 0) {
        console.log(`   Tags: ${task.tags.join(', ')}`);
      }
      console.log('');
    }

    console.log('='.repeat(70));
    console.log(`Total: ${tasks.length} tasks`);
    console.log('='.repeat(70));

    return tasks;
  } catch (error) {
    console.error('❌ Failed to fetch Sprint 34 tasks:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check environment
  if (!process.env.NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY not set');
    console.log('Run: source .env && export NOTION_API_KEY=$NOTION_TOKEN');
    process.exit(1);
  }

  getSprint34Tasks();
}

export { getSprint34Tasks };
