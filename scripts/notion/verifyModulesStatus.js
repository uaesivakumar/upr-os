#!/usr/bin/env node
/**
 * Verify Current Modules Status - Check What's Actually in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function verifyModulesStatus() {
  console.log('\n' + '='.repeat(80));
  console.log('VERIFYING MODULES STATUS');
  console.log('='.repeat(80) + '\n');

  try {
    // Get ALL features (force fresh query)
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      page_size: 100
    });

    console.log(`Total features: ${featuresResponse.results.length}\n`);

    let emptyCount = 0;
    let filledCount = 0;

    console.log('Features with EMPTY modules:');
    console.log('='.repeat(80));

    for (const feature of featuresResponse.results) {
      const featureName = feature.properties.Features?.title?.[0]?.text?.content ||
                         feature.properties.Feature?.title?.[0]?.text?.content ||
                         'Unknown';

      const modules = feature.properties.Modules?.relation || [];
      const status = feature.properties.Status?.select?.name || 'No Status';
      const sprint = feature.properties.Sprint?.number || 'No Sprint';

      if (modules.length === 0) {
        console.log(`❌ ${featureName}`);
        console.log(`   Status: ${status} | Sprint: ${sprint}`);
        console.log(`   Page ID: ${feature.id}\n`);
        emptyCount++;
      } else {
        filledCount++;
      }
    }

    if (emptyCount === 0) {
      console.log('✅ No empty modules found!\n');
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total features: ${featuresResponse.results.length}`);
    console.log(`Empty modules: ${emptyCount}`);
    console.log(`Filled modules: ${filledCount}`);
    console.log(`Completion: ${((filledCount / featuresResponse.results.length) * 100).toFixed(1)}%\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Body:', JSON.stringify(error.body, null, 2));
    }
  }
}

if (!process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN not set');
  process.exit(1);
}

verifyModulesStatus();
