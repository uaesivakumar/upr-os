#!/usr/bin/env node
/**
 * Mark all Sprint 50 features as Done
 * Updates status, Done checkbox, and Completed At date
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function updateAllFeatures() {
  try {
    console.log('🚀 Updating Sprint 50 features to Done...\n');

    const features = JSON.parse(readFileSync('./sprint-50-features.json', 'utf-8'));
    const totalFeatures = features.features.length;

    console.log(`📋 Found ${totalFeatures} features to update\n`);

    let updated = 0;
    let failed = 0;

    for (const feature of features.features) {
      try {
        console.log(`📝 Updating: ${feature.name}...`);

        await notion.pages.update({
          page_id: feature.id,
          properties: {
            'Status': {
              select: {
                name: 'Done'
              }
            },
            'Done?': {
              checkbox: true
            },
            'Completed At': {
              date: {
                start: new Date().toISOString().split('T')[0]
              }
            }
          }
        });

        console.log(`✅ Updated: ${feature.name}`);
        updated++;
      } catch (error) {
        console.error(`❌ Failed to update: ${feature.name}`);
        console.error(`   Error: ${error.message}`);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   Total Features: ${totalFeatures}`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   Success Rate: ${Math.round((updated / totalFeatures) * 100)}%`);
    console.log('='.repeat(60));

    if (updated === totalFeatures) {
      console.log('\n🎉 Sprint 50 - All features marked as Done!');
      console.log('   SIVA Visualization System - 100% Complete');
    } else {
      console.log('\n⚠️  Some features failed to update. Please check manually.');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error updating features:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

updateAllFeatures();
