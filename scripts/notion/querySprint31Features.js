#!/usr/bin/env node
/**
 * Query all Sprint 31 features from Module Features database
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function query() {
  console.log('🔍 Querying Sprint 31 features...\n');

  const response = await notion.databases.query({
    database_id: dbIds.module_features_db_id,
    filter: {
      property: 'Sprint',
      number: {
        equals: 31
      }
    }
  });

  console.log(`Found ${response.results.length} Sprint 31 features:\n`);

  response.results.forEach((feature, index) => {
    const name = feature.properties.Features?.title?.[0]?.text?.content || 'No name';
    const status = feature.properties.Status?.select?.name || 'No status';
    const done = feature.properties['Done?']?.checkbox || false;

    console.log(`${index + 1}. "${name}"`);
    console.log(`   Status: ${status}, Done: ${done}`);
    console.log('');
  });
}

query().catch(console.error);
