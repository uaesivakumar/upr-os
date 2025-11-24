#!/usr/bin/env node
/**
 * Update a Sprint 49 feature status
 * Usage: node updateSprint49Feature.js "Feature Name" "Status"
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const featureName = process.argv[2];
const newStatus = process.argv[3];

if (!featureName || !newStatus) {
  console.error('Usage: node updateSprint49Feature.js "Feature Name" "Status"');
  console.error('Example: node updateSprint49Feature.js "Redesign enrichment workflow UI" "Done"');
  process.exit(1);
}

async function updateFeature() {
  try {
    console.log(`🔍 Finding feature: "${featureName}"...`);

    const features = JSON.parse(readFileSync('./sprint-49-features.json', 'utf-8'));
    const feature = features.features.find(f => f.name === featureName);

    if (!feature) {
      console.error(`❌ Feature not found: "${featureName}"`);
      console.error('\nAvailable features:');
      features.features.forEach(f => console.error(`  - ${f.name}`));
      process.exit(1);
    }

    console.log(`✅ Found feature: ${feature.name}`);
    console.log(`📝 Updating status to: ${newStatus}...`);

    await notion.pages.update({
      page_id: feature.id,
      properties: {
        'Status': {
          select: {
            name: newStatus
          }
        },
        ...(newStatus === 'Done' ? {
          'Done?': {
            checkbox: true
          },
          'Completed At': {
            date: {
              start: new Date().toISOString().split('T')[0]
            }
          }
        } : {})
      }
    });

    console.log('✅ Feature updated successfully');
    console.log(`   Feature: ${feature.name}`);
    console.log(`   Status: ${newStatus}`);
    
  } catch (error) {
    console.error('❌ Error updating feature:', error.message);
    process.exit(1);
  }
}

updateFeature();
