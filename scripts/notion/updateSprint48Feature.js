#!/usr/bin/env node

/**
 * Update a Sprint 48 feature status
 * Usage: node updateSprint48Feature.js "Feature Name" "Status"
 * Example: node updateSprint48Feature.js "Design 2030 UI system (Figma/wireframes)" "Done"
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const dbIds = JSON.parse(readFileSync(join(projectRoot, '.notion-db-ids.json'), 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const FEATURES_DATABASE_ID = dbIds.module_features_db_id;

async function updateFeature(featureName, newStatus) {
  try {
    console.log(`🔍 Finding feature: "${featureName}"...`);

    // Find the feature in Sprint 48
    const response = await notion.databases.query({
      database_id: FEATURES_DATABASE_ID,
      filter: {
        and: [
          {
            property: 'Sprint',
            number: {
              equals: 48
            }
          },
          {
            property: 'Features',
            title: {
              contains: featureName
            }
          }
        ]
      }
    });

    if (response.results.length === 0) {
      console.error(`❌ Feature "${featureName}" not found in Sprint 48`);
      return;
    }

    const feature = response.results[0];
    const fullName = feature.properties.Features?.title?.[0]?.text?.content || 'Unnamed';
    console.log(`✅ Found feature: ${fullName}`);

    // Update the status
    console.log(`📝 Updating status to: ${newStatus}...`);

    await notion.pages.update({
      page_id: feature.id,
      properties: {
        'Status': {
          select: {
            name: newStatus
          }
        }
      }
    });

    console.log(`✅ Feature updated successfully`);
    console.log(`   Feature: ${fullName}`);
    console.log(`   Status: ${newStatus}`);

  } catch (error) {
    console.error('❌ Error updating feature:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

// Get feature name and status from command line arguments
const featureName = process.argv[2];
const newStatus = process.argv[3] || 'Done';

if (!featureName) {
  console.error('❌ Usage: node updateSprint48Feature.js "Feature Name" "Status"');
  console.error('   Valid statuses: Not Started, In Progress, Done');
  process.exit(1);
}

updateFeature(featureName, newStatus);
