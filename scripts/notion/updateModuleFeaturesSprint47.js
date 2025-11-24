#!/usr/bin/env node

/**
 * Update Module Features for Sprint 47
 *
 * Marks all Sprint 47 features as Done in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function updateModuleFeatures() {
  console.log('\n=== UPDATING SPRINT 47 MODULE FEATURES IN NOTION ===\n');

  try {
    // Get all Sprint 47 features
    console.log('1. Finding Sprint 47 module features...');
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 47 } }
    });

    console.log(`✓ Found ${featuresResponse.results.length} features\n`);

    // Update each feature
    console.log('2. Updating features...\n');

    let updated = 0;
    for (const feature of featuresResponse.results) {
      const name = feature.properties.Features?.title?.[0]?.text?.content || 'Unnamed';
      const currentStatus = feature.properties.Status?.select?.name || 'Not Started';

      try {
        await notion.pages.update({
          page_id: feature.id,
          properties: {
            'Status': {
              select: {
                name: 'Done'
              }
            }
          }
        });

        console.log(`  ✓ ${name}`);
        console.log(`    ${currentStatus} → Done`);
        updated++;
      } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${err.message}`);
      }
    }

    // Summary
    console.log('\n=== UPDATE SUMMARY ===\n');
    console.log(`Total Features: ${featuresResponse.results.length}`);
    console.log(`Updated: ${updated} ✅`);
    console.log(`Status: ${updated === featuresResponse.results.length ? '✅ ALL COMPLETE' : '⚠️  PARTIAL'}`);
    console.log('\n🎉 Sprint 47 Module Features synced to Notion!\n');

  } catch (error) {
    console.error('❌ Error updating module features:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

updateModuleFeatures();
