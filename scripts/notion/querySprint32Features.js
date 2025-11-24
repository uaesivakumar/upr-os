#!/usr/bin/env node
/**
 * Query all Sprint 32 features from Module Features database
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function query() {
  console.log('🔍 Querying Sprint 32 features...\n');

  const response = await notion.databases.query({
    database_id: dbIds.module_features_db_id,
    filter: {
      property: 'Sprint',
      number: {
        equals: 32
      }
    }
  });

  console.log(`Found ${response.results.length} Sprint 32 features:\n`);

  response.results.forEach((feature, index) => {
    const name = feature.properties.Features?.title?.[0]?.text?.content || 'No name';
    const status = feature.properties.Status?.select?.name || 'No status';
    const done = feature.properties['Done?']?.checkbox || false;
    const module = feature.properties.Module?.relation?.[0]?.id || 'No module';

    console.log(`${index + 1}. "${name}"`);
    console.log(`   Status: ${status}`);
    console.log(`   Done: ${done}`);
    console.log(`   Module: ${module}`);
    console.log('');
  });

  // Return structured data for further processing
  return response.results.map(feature => ({
    name: feature.properties.Features?.title?.[0]?.text?.content || 'No name',
    status: feature.properties.Status?.select?.name || 'No status',
    done: feature.properties['Done?']?.checkbox || false,
    id: feature.id
  }));
}

query().catch(console.error);
