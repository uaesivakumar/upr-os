#!/usr/bin/env node
/**
 * Inspect Module Features to see actual feature names
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function inspect() {
  console.log('🔍 Querying Module Features...\n');

  const response = await notion.databases.query({
    database_id: dbIds.module_features_db_id,
    page_size: 20
  });

  console.log(`Found ${response.results.length} features:\n`);

  response.results.forEach((feature, index) => {
    const name = feature.properties.Features?.title?.[0]?.text?.content || 'No name';
    const sprint = feature.properties.Sprint?.number || 'No sprint';
    const status = feature.properties.Status?.select?.name || 'No status';

    console.log(`${index + 1}. "${name}" - Sprint ${sprint} - ${status}`);
  });
}

inspect().catch(console.error);
