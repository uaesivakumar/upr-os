import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const featureName = process.argv[2];
const newStatus = process.argv[3] || 'Done';

if (!featureName) {
  console.error('Usage: node updateSprint61Feature.js "Feature Name" [Status]');
  process.exit(1);
}

const response = await notion.databases.query({
  database_id: dbIds.module_features_db_id,
  filter: {
    and: [
      { property: 'Sprint', number: { equals: 61 } },
      { property: 'Features', title: { contains: featureName } }
    ]
  }
});

if (response.results.length === 0) {
  console.error(`Feature "${featureName}" not found in Sprint 61`);
  process.exit(1);
}

const feature = response.results[0];
await notion.pages.update({
  page_id: feature.id,
  properties: {
    Status: { select: { name: newStatus } },
    ...(newStatus === 'Done' ? { 'Completed At': { date: { start: new Date().toISOString().split('T')[0] } } } : {}),
    ...(newStatus === 'In Progress' ? { 'Started At': { date: { start: new Date().toISOString().split('T')[0] } } } : {})
  }
});

console.log(`✓ Updated "${featureName}" to "${newStatus}"`);
