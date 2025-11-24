#!/usr/bin/env node
/**
 * Get Notion Database Schemas
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Get Module Features DB schema
const featuresDb = await notion.databases.retrieve({ database_id: dbIds.module_features_db_id });
console.log('=== MODULE FEATURES DATABASE ===');
console.log('Properties:');
Object.entries(featuresDb.properties).forEach(([name, prop]) => {
  let extra = '';
  if (prop.type === 'select') {
    extra = ' Options: [' + (prop.select.options?.map(o => o.name).join(', ') || 'none') + ']';
  }
  console.log('  ' + name + ': ' + prop.type + extra);
});

// Get Sprints DB schema
const sprintsDb = await notion.databases.retrieve({ database_id: dbIds.sprints_db_id });
console.log('\n=== SPRINTS DATABASE ===');
console.log('Properties:');
Object.entries(sprintsDb.properties).forEach(([name, prop]) => {
  let extra = '';
  if (prop.type === 'select') {
    extra = ' Options: [' + (prop.select.options?.map(o => o.name).join(', ') || 'none') + ']';
  }
  console.log('  ' + name + ': ' + prop.type + extra);
});
