#!/usr/bin/env node
import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function listSprints() {
  console.log('Fetching all sprints from Notion...\n');

  const response = await notion.databases.query({
    database_id: dbIds.sprints_db_id,
    sorts: [
      {
        property: 'Sprint',
        direction: 'ascending',
      },
    ],
  });

  console.log(`Found ${response.results.length} sprints:\n`);

  for (const page of response.results) {
    const title = page.properties.Sprint?.title?.[0]?.text?.content || 'Unknown';
    const status = page.properties.Status?.select?.name || 'No status';
    const goal = page.properties.Goal?.rich_text?.[0]?.text?.content || '';
    console.log(`${title}: ${status} - ${goal.substring(0, 50)}${goal.length > 50 ? '...' : ''}`);
  }
}

listSprints().catch(console.error);
