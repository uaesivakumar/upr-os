import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Query all Sprint 54 features
const query = await notion.databases.query({
  database_id: dbIds.module_features_db_id,
  filter: {
    property: 'Sprint',
    number: { equals: 54 }
  }
});

console.log('Sprint 54 Features in Notion:\n');
const needsUpdate = [];

for (const page of query.results) {
  const title = page.properties['Features']?.title?.[0]?.text?.content || 'Unknown';
  const status = page.properties['Status']?.select?.name || 'No Status';
  const done = page.properties['Done?']?.checkbox || false;
  console.log(`  ${status === 'Done' ? '✓' : '✗'} ${title}: ${status} (Done: ${done})`);

  if (status !== 'Done') {
    needsUpdate.push({ id: page.id, title, status });
  }
}

console.log(`\nTotal: ${query.results.length} features`);
console.log(`Need update: ${needsUpdate.length}`);

// Fix any that are not Done
if (needsUpdate.length > 0) {
  console.log('\nFixing features with incorrect status...\n');

  for (const item of needsUpdate) {
    await notion.pages.update({
      page_id: item.id,
      properties: {
        'Status': { select: { name: 'Done' } },
        'Done?': { checkbox: true },
        'Completed At': { date: { start: new Date().toISOString().split('T')[0] } },
      }
    });
    console.log(`  ✓ Fixed: ${item.title} (was: ${item.status})`);
  }

  console.log('\n✓ All features updated to Done!');
}
