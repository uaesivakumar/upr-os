#!/usr/bin/env node
/**
 * Get Sprint 62 Features from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const response = await notion.databases.query({
  database_id: dbIds.module_features_db_id,
  filter: {
    property: 'Sprint',
    number: { equals: 62 }
  }
});

console.log('Sprint 62 Features:');
console.log('='.repeat(60));
response.results.forEach((f, i) => {
  const name = f.properties.Features?.title?.[0]?.plain_text || 'Unknown';
  const status = f.properties.Status?.select?.name || 'Not Started';
  const priority = f.properties.Priority?.select?.name || 'Medium';
  const complexity = f.properties.Complexity?.select?.name || 'Medium';
  console.log((i+1) + '. ' + name);
  console.log('   Status: ' + status + ' | Priority: ' + priority + ' | Complexity: ' + complexity);
});
console.log('='.repeat(60));
console.log('Total Features: ' + response.results.length);
