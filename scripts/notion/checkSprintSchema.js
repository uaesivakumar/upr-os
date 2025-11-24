#!/usr/bin/env node
import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const db = await notion.databases.retrieve({ database_id: dbIds.sprints_db_id });
console.log('Sprints Database Properties:');
Object.entries(db.properties).forEach(([name, prop]) => {
  console.log('  ' + name + ': ' + prop.type);
});

// Also query Sprint 57 and 58 to see current state
const response = await notion.databases.query({
  database_id: dbIds.sprints_db_id,
  filter: {
    or: [
      { property: 'Sprint Number', number: { equals: 57 } },
      { property: 'Sprint Number', number: { equals: 58 } }
    ]
  }
});

console.log('\nSprint 57 & 58 current state:');
response.results.forEach(page => {
  const sprintNum = page.properties['Sprint Number']?.number;
  const name = page.properties['Name']?.title?.[0]?.plain_text || 'No name';
  const status = page.properties['Status']?.select?.name || 'No status';
  console.log('Sprint ' + sprintNum + ': ' + name + ' [' + status + ']');
  console.log('  All properties:', Object.keys(page.properties).join(', '));
});
