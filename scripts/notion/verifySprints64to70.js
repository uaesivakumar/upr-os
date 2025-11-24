#!/usr/bin/env node
/**
 * Verify Sprints 64-70 created in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Verify sprints created
const sprints = await notion.databases.query({
  database_id: dbIds.sprints_db_id,
  filter: {
    or: [
      { property: 'Sprint', title: { contains: 'Sprint 64' } },
      { property: 'Sprint', title: { contains: 'Sprint 65' } },
      { property: 'Sprint', title: { contains: 'Sprint 66' } },
      { property: 'Sprint', title: { contains: 'Sprint 67' } },
      { property: 'Sprint', title: { contains: 'Sprint 68' } },
      { property: 'Sprint', title: { contains: 'Sprint 69' } },
      { property: 'Sprint', title: { contains: 'Sprint 70' } }
    ]
  }
});

console.log('=== SPRINTS VERIFICATION ===');
sprints.results.forEach(s => {
  const name = s.properties.Sprint?.title?.[0]?.plain_text;
  const status = s.properties.Status?.select?.name;
  console.log(`${name} [${status}]`);
});

// Count features per sprint
console.log('\n=== FEATURES PER SPRINT ===');
let totalFeatures = 0;
for (let sprint = 64; sprint <= 70; sprint++) {
  const features = await notion.databases.query({
    database_id: dbIds.module_features_db_id,
    filter: {
      property: 'Sprint',
      number: { equals: sprint }
    }
  });
  console.log(`Sprint ${sprint}: ${features.results.length} features`);
  totalFeatures += features.results.length;
}

console.log(`\nTotal Features: ${totalFeatures}`);
console.log('Verification complete!');
