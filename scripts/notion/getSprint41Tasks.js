#!/usr/bin/env node
/**
 * Fetch Sprint 41 tasks from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function getSprint41Tasks() {
  console.log('📋 Fetching Sprint 41 tasks from Notion...\n');

  try {
    // Fetch tasks for Sprint 41
    const response = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Sprint',
        number: {
          equals: 41
        }
      },
      sorts: [
        {
          property: 'Priority',
          direction: 'ascending'
        }
      ]
    });

    console.log(`Found ${response.results.length} tasks for Sprint 41:\n`);
    console.log('='.repeat(80));

    response.results.forEach((page, index) => {
      const feature = page.properties.Features?.title[0]?.text?.content || 'Untitled';
      const priority = page.properties.Priority?.select?.name || 'Medium';
      const status = page.properties.Status?.select?.name || 'Not Started';
      const notes = page.properties.Notes?.rich_text[0]?.text?.content || '';

      const priorityEmoji = {
        'High': '🔴',
        'Medium': '🟡',
        'Low': '🟢'
      }[priority] || '⚪';

      console.log(`${index + 1}. ${priorityEmoji} ${feature}`);
      console.log(`   Priority: ${priority} | Status: ${status}`);
      if (notes) {
        console.log(`   ${notes}`);
      }
      console.log();
    });

    console.log('='.repeat(80));
    console.log(`\nTotal: ${response.results.length} tasks`);

    return response.results;

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  process.exit(1);
}

getSprint41Tasks();
