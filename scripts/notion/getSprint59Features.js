#!/usr/bin/env node
/**
 * Get Sprint 59 Features from Notion
 */
import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const response = await notion.databases.query({
  database_id: dbIds.module_features_db_id,
  filter: {
    property: 'Sprint',
    number: { equals: 59 }
  },
  sorts: [{ property: 'Priority', direction: 'descending' }]
});

console.log('Sprint 59 Features:');
console.log('==================');
response.results.forEach((f, i) => {
  const name = f.properties.Features?.title?.[0]?.plain_text || 'Unnamed';
  const status = f.properties.Status?.select?.name || 'No status';
  const priority = f.properties.Priority?.select?.name || 'No priority';
  console.log(`${i + 1}. ${name} [${status}] - ${priority}`);
});
console.log(`\nTotal features: ${response.results.length}`);
