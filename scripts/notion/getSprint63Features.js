#!/usr/bin/env node
/**
 * Get Sprint 63 Features from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const response = await notion.databases.query({
  database_id: dbIds.module_features_db_id,
  filter: {
    property: 'Sprint',
    number: { equals: 63 }
  },
  sorts: [
    { property: 'Priority', direction: 'ascending' }
  ]
});

console.log('Sprint 63 Features:');
console.log('==================');
response.results.forEach((f, i) => {
  const name = f.properties.Features?.title?.[0]?.plain_text;
  const status = f.properties.Status?.select?.name || 'Not Started';
  const priority = f.properties.Priority?.select?.name || 'Medium';
  console.log(`${i+1}. ${name} [${priority}] - ${status}`);
});
console.log(`\nTotal: ${response.results.length} features`);
