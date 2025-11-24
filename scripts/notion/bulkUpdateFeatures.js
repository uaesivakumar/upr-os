#!/usr/bin/env node
/**
 * Bulk update all features for Sprints 30 & 31 to Done
 * Efficient parallel updates
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function updateAllFeaturesForSprint(sprintNumber) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`BULK UPDATE: Sprint ${sprintNumber} Features`);
  console.log('='.repeat(70));

  // Query all features for this sprint
  const response = await notion.databases.query({
    database_id: dbIds.module_features_db_id,
    filter: {
      property: 'Sprint',
      number: {
        equals: sprintNumber
      }
    }
  });

  console.log(`\n✅ Found ${response.results.length} features for Sprint ${sprintNumber}`);

  if (response.results.length === 0) {
    console.log(`⚠️  No features found for Sprint ${sprintNumber}`);
    return { updated: 0, failed: 0 };
  }

  // Update all features in parallel for efficiency
  const updatePromises = response.results.map(async (feature) => {
    const name = feature.properties.Features?.title?.[0]?.text?.content || 'Unknown';
    const currentStatus = feature.properties.Status?.select?.name || 'Unknown';
    const currentDone = feature.properties['Done?']?.checkbox || false;

    // Skip if already done
    if (currentStatus === 'Done' && currentDone) {
      console.log(`⏭️  Skipped (already done): ${name}`);
      return { success: true, skipped: true };
    }

    try {
      await notion.pages.update({
        page_id: feature.id,
        properties: {
          'Status': {
            select: { name: 'Done' }
          },
          'Completed At': {
            date: { start: '2025-01-18' }
          },
          'Done?': {
            checkbox: true
          }
        }
      });

      console.log(`✅ Updated: ${name}`);
      return { success: true, skipped: false };
    } catch (error) {
      console.error(`❌ Failed: ${name} - ${error.message}`);
      return { success: false, skipped: false };
    }
  });

  // Wait for all updates to complete
  const results = await Promise.all(updatePromises);

  // Count results
  const updated = results.filter(r => r.success && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n📊 Sprint ${sprintNumber} Summary:`);
  console.log(`   • Updated: ${updated}`);
  console.log(`   • Skipped: ${skipped}`);
  console.log(`   • Failed: ${failed}`);

  return { updated, skipped, failed };
}

async function main() {
  try {
    console.log('='.repeat(70));
    console.log('BULK UPDATE MODULE FEATURES - Sprints 30 & 31');
    console.log('='.repeat(70));

    // Update Sprint 30 features
    const sprint30Results = await updateAllFeaturesForSprint(30);

    // Update Sprint 31 features
    const sprint31Results = await updateAllFeaturesForSprint(31);

    // Overall summary
    console.log(`\n${'='.repeat(70)}`);
    console.log('OVERALL SUMMARY');
    console.log('='.repeat(70));
    console.log(`Sprint 30: ${sprint30Results.updated} updated, ${sprint30Results.skipped} skipped, ${sprint30Results.failed} failed`);
    console.log(`Sprint 31: ${sprint31Results.updated} updated, ${sprint31Results.skipped} skipped, ${sprint31Results.failed} failed`);
    console.log(`Total Updated: ${sprint30Results.updated + sprint31Results.updated}`);
    console.log('='.repeat(70));

    if (sprint30Results.failed > 0 || sprint31Results.failed > 0) {
      console.log('\n⚠️  Some updates failed - review errors above');
      process.exit(1);
    } else {
      console.log('\n✅ All features updated successfully!');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
