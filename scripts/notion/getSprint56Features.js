#!/usr/bin/env node
/**
 * Get Sprint 56 features from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const response = await notion.databases.query({
  database_id: dbIds.module_features_db_id,
  filter: {
    property: 'Sprint',
    number: { equals: 56 }
  },
  sorts: [{ property: 'Priority', direction: 'descending' }]
});

console.log('Sprint 56 Features:\n');
response.results.forEach((page, i) => {
  const name = page.properties.Features?.title?.[0]?.plain_text || 'Unnamed';
  const status = page.properties.Status?.select?.name || 'Not Started';
  const priority = page.properties.Priority?.select?.name || 'Medium';
  const complexity = page.properties.Complexity?.select?.name || 'Medium';
  console.log(`${i+1}. ${name}`);
  console.log(`   Status: ${status} | Priority: ${priority} | Complexity: ${complexity}`);
});
console.log(`\nTotal: ${response.results.length} features`);
