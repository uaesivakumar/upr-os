#!/usr/bin/env node
/**
 * Update a Sprint 52 feature status in Notion
 * Usage: node updateSprint52Feature.js "Feature Name" "Status"
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function updateFeature(featureName, newStatus) {
  try {
    console.log(`🔍 Looking for feature: "${featureName}"...\n`);

    const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
    const featuresDbId = dbIds.module_features_db_id;

    // Query for the feature
    const response = await notion.databases.query({
      database_id: featuresDbId,
      filter: {
        and: [
          {
            property: 'Sprint',
            number: {
              equals: 52,
            },
          },
          {
            property: 'Features',
            title: {
              contains: featureName,
            },
          },
        ],
      },
    });

    if (response.results.length === 0) {
      console.log(`❌ Feature "${featureName}" not found in Sprint 52`);
      process.exit(1);
    }

    const feature = response.results[0];
    const currentStatus = feature.properties.Status?.select?.name || 'Not Started';

    console.log(`✅ Found: ${feature.properties.Features?.title?.[0]?.plain_text}`);
    console.log(`   Current Status: ${currentStatus}`);
    console.log(`   New Status: ${newStatus}\n`);

    // Update the status
    await notion.pages.update({
      page_id: feature.id,
      properties: {
        Status: {
          select: {
            name: newStatus,
          },
        },
      },
    });

    console.log(`✅ Updated status to "${newStatus}"`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const featureName = process.argv[2];
const newStatus = process.argv[3];

if (!featureName || !newStatus) {
  console.log('Usage: node updateSprint52Feature.js "Feature Name" "Status"');
  console.log('Example: node updateSprint52Feature.js "Performance optimization" "Done"');
  process.exit(1);
}

updateFeature(featureName, newStatus);
