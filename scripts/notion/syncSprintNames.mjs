import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Get all sprints
const sprints = await notion.databases.query({
  database_id: dbIds.sprints_db_id,
  page_size: 100
});

console.log('Current sprint names:');
const toRename = [];

for (const s of sprints.results) {
  const currentName = s.properties.Sprint?.title?.[0]?.plain_text || '';
  console.log('  ' + currentName);

  // Extract sprint number and normalize
  let newName = null;

  // Match patterns like 'Sprint S30', 'Sprint 58', 'Sprint S7: AI Outreach', etc.
  const match = currentName.match(/Sprint\s*S?(\d+)(?::\s*(.+))?/i);
  if (match) {
    const num = match[1];
    const suffix = match[2] ? ': ' + match[2] : '';
    newName = 'S' + num + suffix;

    if (currentName !== newName) {
      toRename.push({ id: s.id, current: currentName, new: newName });
    }
  }
}

console.log('\n--- Renaming ' + toRename.length + ' sprints ---');

for (const item of toRename) {
  await notion.pages.update({
    page_id: item.id,
    properties: {
      Sprint: { title: [{ text: { content: item.new } }] }
    }
  });
  console.log('  ' + item.current + ' -> ' + item.new);
}

console.log('\nDone!');
