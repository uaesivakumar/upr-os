#!/usr/bin/env node
/**
 * Inspect Sprints database schema and compare filled vs unfilled sprints
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function main() {
  // Get Sprints DB schema
  const sprintsDb = await notion.databases.retrieve({ database_id: dbIds.sprints_db_id });
  console.log('=== SPRINTS DATABASE SCHEMA ===');
  Object.entries(sprintsDb.properties).forEach(([name, prop]) => {
    let extra = '';
    if (prop.type === 'select') {
      extra = ' Options: [' + (prop.select.options?.map(o => o.name).join(', ') || 'none') + ']';
    } else if (prop.type === 'multi_select') {
      extra = ' Options: [' + (prop.multi_select.options?.map(o => o.name).join(', ') || 'none') + ']';
    }
    console.log('  ' + name + ': ' + prop.type + extra);
  });

  // Get a completed sprint to see what fields are filled
  console.log('\n=== SAMPLE COMPLETED SPRINT (Sprint 53) ===');
  const sprint53 = await notion.databases.query({
    database_id: dbIds.sprints_db_id,
    filter: { property: 'Sprint', title: { equals: 'Sprint 53' } }
  });

  if (sprint53.results.length > 0) {
    const props = sprint53.results[0].properties;
    Object.entries(props).forEach(([name, prop]) => {
      let value = '';
      if (prop.type === 'title') value = prop.title?.[0]?.plain_text || '';
      else if (prop.type === 'select') value = prop.select?.name || '';
      else if (prop.type === 'multi_select') value = prop.multi_select?.map(o => o.name).join(', ') || '';
      else if (prop.type === 'number') value = prop.number ?? '';
      else if (prop.type === 'date') value = prop.date?.start || '';
      else if (prop.type === 'checkbox') value = prop.checkbox ? 'true' : 'false';
      else if (prop.type === 'rich_text') value = prop.rich_text?.[0]?.plain_text || '';
      console.log('  ' + name + ': ' + value);
    });
  }

  // Get Sprint 71 to see what's missing
  console.log('\n=== SPRINT 71 (needs fixing) ===');
  const sprint71 = await notion.databases.query({
    database_id: dbIds.sprints_db_id,
    filter: { property: 'Sprint', title: { starts_with: 'Sprint 71' } }
  });

  if (sprint71.results.length > 0) {
    const props = sprint71.results[0].properties;
    Object.entries(props).forEach(([name, prop]) => {
      let value = '';
      if (prop.type === 'title') value = prop.title?.[0]?.plain_text || '';
      else if (prop.type === 'select') value = prop.select?.name || '';
      else if (prop.type === 'multi_select') value = prop.multi_select?.map(o => o.name).join(', ') || '';
      else if (prop.type === 'number') value = prop.number ?? '';
      else if (prop.type === 'date') value = prop.date?.start || '';
      else if (prop.type === 'checkbox') value = prop.checkbox ? 'true' : 'false';
      else if (prop.type === 'rich_text') value = prop.rich_text?.[0]?.plain_text || '';
      console.log('  ' + name + ': ' + value);
    });
  }
}

main().catch(console.error);
