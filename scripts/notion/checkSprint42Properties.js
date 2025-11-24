#!/usr/bin/env node
/**
 * Check Sprint 42 properties in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function checkProperties() {
  console.log('Checking Sprint 42 properties...\n');

  try {
    // Get Sprint 42 page
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 42' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('Sprint 42 not found');
      return;
    }

    const sprint = sprintsResponse.results[0];
    console.log('Sprint 42 properties:');
    console.log(JSON.stringify(sprint.properties, null, 2));

    // Also get database schema
    const database = await notion.databases.retrieve({
      database_id: dbIds.sprints_db_id
    });

    console.log('\n\nSprints database schema:');
    console.log(JSON.stringify(database.properties, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkProperties();
