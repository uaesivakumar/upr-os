#!/usr/bin/env node
/**
 * UPR 2030 Sprint Cleanup Script
 *
 * This script:
 * 1. Deletes (archives) all features for Sprints 64-70 (old/obsolete)
 * 2. Deletes (archives) Sprint 64-70 entries from Sprints database
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Load database IDs
const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const sprintsDbId = dbIds.sprints_db_id;
const featuresDbId = dbIds.module_features_db_id;

async function deleteOldFeatures() {
  console.log('='.repeat(60));
  console.log('Deleting old features for Sprints 64-70...');
  console.log('='.repeat(60));

  let totalDeleted = 0;

  for (let sprintNum = 64; sprintNum <= 70; sprintNum++) {
    console.log(`\nChecking Sprint ${sprintNum}...`);

    // Find all features for this sprint
    const response = await notion.databases.query({
      database_id: featuresDbId,
      filter: {
        property: 'Sprint',
        number: {
          equals: sprintNum,
        },
      },
    });

    if (response.results.length === 0) {
      console.log(`  No features found for Sprint ${sprintNum}`);
      continue;
    }

    console.log(`  Found ${response.results.length} features to delete...`);

    // Archive each feature
    for (const page of response.results) {
      const title = page.properties.Features?.title?.[0]?.text?.content || 'Unknown';
      await notion.pages.update({
        page_id: page.id,
        archived: true,
      });
      console.log(`    Archived: ${title}`);
      totalDeleted++;
    }
  }

  console.log(`\nTotal features deleted: ${totalDeleted}`);
  return totalDeleted;
}

async function deleteOldSprints() {
  console.log('\n');
  console.log('='.repeat(60));
  console.log('Deleting Sprint 64-70 entries from Sprints database...');
  console.log('='.repeat(60));

  let totalDeleted = 0;

  for (let sprintNum = 64; sprintNum <= 70; sprintNum++) {
    console.log(`\nChecking Sprint ${sprintNum}...`);

    // Find sprint entry
    const response = await notion.databases.query({
      database_id: sprintsDbId,
      filter: {
        property: 'Sprint',
        title: {
          equals: `Sprint ${sprintNum}`,
        },
      },
    });

    if (response.results.length === 0) {
      console.log(`  Sprint ${sprintNum} not found in database`);
      continue;
    }

    // Archive each sprint entry
    for (const page of response.results) {
      await notion.pages.update({
        page_id: page.id,
        archived: true,
      });
      console.log(`  Archived Sprint ${sprintNum}`);
      totalDeleted++;
    }
  }

  console.log(`\nTotal sprints deleted: ${totalDeleted}`);
  return totalDeleted;
}

async function main() {
  console.log('UPR 2030 Sprint Cleanup');
  console.log('Removing obsolete Sprints 64-70 and their features\n');

  const featuresDeleted = await deleteOldFeatures();
  const sprintsDeleted = await deleteOldSprints();

  console.log('\n');
  console.log('='.repeat(60));
  console.log('CLEANUP COMPLETE');
  console.log('='.repeat(60));
  console.log(`Features archived: ${featuresDeleted}`);
  console.log(`Sprints archived: ${sprintsDeleted}`);
  console.log('\nNew roadmap: Sprint 54-63 (10 sprints, 73 features)');
}

main().catch(console.error);
