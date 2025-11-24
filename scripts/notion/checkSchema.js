#!/usr/bin/env node
import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function checkSchema() {
  console.log('Checking Sprints DB schema...');
  const db = await notion.databases.retrieve({ database_id: dbIds.sprints_db_id });
  console.log('\nProperties:');
  for (const [name, prop] of Object.entries(db.properties)) {
    console.log(`  - ${name} (${prop.type})`);
  }
}

checkSchema().catch(console.error);
