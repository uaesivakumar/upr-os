#!/usr/bin/env node

/**
 * Check Sprint 47 actual properties
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const SPRINTS_DATABASE_ID = dbIds.sprints_db_id;

async function checkProperties() {
  try {
    // Get database schema
    const database = await notion.databases.retrieve({
      database_id: SPRINTS_DATABASE_ID
    });

    console.log('📋 Available properties in Sprints database:\n');

    for (const [propName, propDef] of Object.entries(database.properties)) {
      console.log(`  - ${propName} (${propDef.type})`);
    }

    console.log('\n🔍 Finding Sprint 47...');

    // Find Sprint 47
    const response = await notion.databases.query({
      database_id: SPRINTS_DATABASE_ID,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 47'
        }
      }
    });

    if (response.results.length > 0) {
      const sprint47 = response.results[0];
      console.log(`✅ Found Sprint 47: ${sprint47.id}\n`);

      console.log('📊 Current values:');
      for (const [propName, propValue] of Object.entries(sprint47.properties)) {
        let value = 'Not set';

        if (propValue.type === 'title' && propValue.title.length > 0) {
          value = propValue.title[0].plain_text;
        } else if (propValue.type === 'select' && propValue.select) {
          value = propValue.select.name;
        } else if (propValue.type === 'number' && propValue.number !== null) {
          value = propValue.number;
        } else if (propValue.type === 'date' && propValue.date) {
          value = propValue.date.start;
        } else if (propValue.type === 'rich_text' && propValue.rich_text.length > 0) {
          value = propValue.rich_text[0].plain_text;
        }

        console.log(`  ${propName}: ${value}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
  }
}

checkProperties();
