#!/usr/bin/env node
/**
 * Get Sprint 42 Tasks from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function getSprint42Tasks() {
  console.log('\n' + '='.repeat(80));
  console.log('SPRINT 42 TASKS');
  console.log('='.repeat(80) + '\n');

  try {
    // Get Sprint 42 info
    const sprintResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 42'
        }
      }
    });

    if (sprintResponse.results.length > 0) {
      const sprint = sprintResponse.results[0];
      const goal = sprint.properties.Goal?.rich_text?.[0]?.text?.content || 'No goal defined';

      console.log('Sprint 42 Goal:');
      console.log('='.repeat(80));
      console.log(goal);
      console.log('\n');
    }

    // Get Sprint 42 features
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Sprint',
        number: {
          equals: 42
        }
      }
    });

    console.log(`Found ${featuresResponse.results.length} tasks for Sprint 42\n`);

    if (featuresResponse.results.length === 0) {
      console.log('No tasks found for Sprint 42');
      process.exit(0);
    }

    console.log('Tasks:');
    console.log('='.repeat(80));

    const tasks = [];
    for (const feature of featuresResponse.results) {
      const name = feature.properties.Features?.title?.[0]?.text?.content ||
                  feature.properties.Feature?.title?.[0]?.text?.content ||
                  'Unknown';
      const status = feature.properties.Status?.select?.name || 'No Status';
      const priority = feature.properties.Priority?.select?.name || 'Medium';
      const complexity = feature.properties.Complexity?.select?.name || 'Medium';
      const notes = feature.properties.Notes?.rich_text?.[0]?.text?.content || '';

      tasks.push({ name, status, priority, complexity, notes });

      console.log(`${tasks.length}. ${name}`);
      console.log(`   Status: ${status} | Priority: ${priority} | Complexity: ${complexity}`);
      if (notes) {
        console.log(`   Notes: ${notes.substring(0, 100)}...`);
      }
      console.log();
    }

    console.log('='.repeat(80));
    console.log(`Total: ${tasks.length} tasks\n`);

    // Group by complexity
    const high = tasks.filter(t => t.complexity === 'High').length;
    const medium = tasks.filter(t => t.complexity === 'Medium').length;
    const low = tasks.filter(t => t.complexity === 'Low').length;

    console.log('Complexity Breakdown:');
    console.log(`  High: ${high}`);
    console.log(`  Medium: ${medium}`);
    console.log(`  Low: ${low}\n`);

    return tasks;

  } catch (error) {
    console.error('Error:', error.message);
    if (error.body) {
      console.error('Body:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

if (!process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN not set');
  process.exit(1);
}

getSprint42Tasks();
