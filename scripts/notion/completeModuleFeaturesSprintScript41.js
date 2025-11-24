#!/usr/bin/env node
/**
 * Mark Sprint 41 Module Features as Complete in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function completeModuleFeaturesSprint41() {
  console.log('\n' + '='.repeat(80));
  console.log('Marking Sprint 41 Module Features as COMPLETE in Notion');
  console.log('='.repeat(80) + '\n');

  try {
    // Get all Sprint 41 module features/tasks
    console.log('Finding Sprint 41 module features...');
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Sprint',
        number: {
          equals: 41
        }
      }
    });

    console.log(`✅ Found ${featuresResponse.results.length} module features for Sprint 41\n`);

    if (featuresResponse.results.length === 0) {
      console.log('ℹ️  No module features found for Sprint 41 - they may not have been created yet');
      process.exit(0);
    }

    // Update each feature to Complete
    let completedCount = 0;
    for (const feature of featuresResponse.results) {
      const featureName = feature.properties.Features?.title?.[0]?.text?.content ||
                         feature.properties.Feature?.title?.[0]?.text?.content ||
                         'Unknown';

      try {
        await notion.pages.update({
          page_id: feature.id,
          properties: {
            'Status': {
              select: {
                name: 'Complete'
              }
            }
          }
        });

        console.log(`✅ Marked "${featureName}" as Complete`);
        completedCount++;
      } catch (err) {
        console.log(`⚠️  Could not update "${featureName}": ${err.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('Module Features Completion Summary');
    console.log('='.repeat(80) + '\n');
    console.log(`Total features found: ${featuresResponse.results.length}`);
    console.log(`Features marked complete: ${completedCount}`);
    console.log(`Success rate: ${((completedCount / featuresResponse.results.length) * 100).toFixed(1)}%\n`);

    if (completedCount === featuresResponse.results.length) {
      console.log('✅ All Sprint 41 module features marked as COMPLETE\n');
    } else {
      console.log(`⚠️  ${featuresResponse.results.length - completedCount} features could not be updated\n`);
    }

  } catch (error) {
    console.error('\n❌ Error updating Notion:', error.message);
    if (error.code === 'validation_error') {
      console.error('Note: Check that the Sprint property exists and is a number type');
    }
    process.exit(1);
  }
}

if (!process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_TOKEN not set');
  process.exit(1);
}

completeModuleFeaturesSprint41();
