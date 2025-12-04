#!/usr/bin/env node
/**
 * Update Sprint 67 Feature Status
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const featureName = process.argv[2];
const newStatus = process.argv[3] || 'Done';

if (!featureName) {
  console.error('Usage: node updateSprint67Feature.js "Feature Name" [Status]');
  process.exit(1);
}

const response = await notion.databases.query({
  database_id: dbIds.module_features_db_id,
  filter: {
    and: [
      { property: 'Sprint', number: { equals: 67 } },
      { property: 'Features', title: { contains: featureName } }
    ]
  }
});

if (response.results.length === 0) {
  console.error(`Feature not found: ${featureName}`);
  process.exit(1);
}

const feature = response.results[0];
await notion.pages.update({
  page_id: feature.id,
  properties: {
    'Status': { select: { name: newStatus } },
    'Done?': { checkbox: newStatus === 'Done' },
    'Completed At': newStatus === 'Done' ? { date: { start: new Date().toISOString().split('T')[0] } } : undefined
  }
});

console.log(`✅ Updated: ${featureName} -> ${newStatus}`);
