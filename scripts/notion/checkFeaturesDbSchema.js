#!/usr/bin/env node
import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const db = await notion.databases.retrieve({ database_id: dbIds.module_features_db_id });
console.log('Module Features Database Properties:');
Object.entries(db.properties).forEach(([name, prop]) => {
  console.log('  "' + name + '": ' + prop.type);
});
