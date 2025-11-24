#!/usr/bin/env node

/**
 * Inspect Sprint 46 properties to see what fields are available
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function inspectSprint46() {
  try {
    // Find Sprint 46
    const response = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 46'
        }
      }
    });

    if (response.results.length === 0) {
      console.error('❌ Sprint 46 not found');
      return;
    }

    const sprint46 = response.results[0];

    console.log('\n=== SPRINT 46 PROPERTIES ===\n');
    console.log('Page ID:', sprint46.id);
    console.log('\nAvailable Properties:');
    console.log(JSON.stringify(sprint46.properties, null, 2));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
  }
}

inspectSprint46();
