#!/usr/bin/env node
/**
 * Update Phase 1.5 (Sprints 71-75) as Complete in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const SPRINTS_TO_UPDATE = [71, 72, 73, 74, 75];

async function updateSprintStatus(sprintNum) {
  console.log(`\nUpdating Sprint ${sprintNum}...`);

  // Find sprint page
  const sprintPage = await notion.databases.query({
    database_id: dbIds.sprints_db_id,
    filter: { property: 'Sprint', title: { starts_with: `Sprint ${sprintNum}` } }
  });

  if (sprintPage.results.length === 0) {
    console.log(`  Sprint ${sprintNum} not found`);
    return { sprint: sprintNum, updated: false, reason: 'not_found' };
  }

  const pageId = sprintPage.results[0].id;

  // Update sprint status to Done
  await notion.pages.update({
    page_id: pageId,
    properties: {
      'Status': { select: { name: 'Done' } }
    }
  });
  console.log(`  Sprint ${sprintNum} marked as Done`);

  // Update all features for this sprint
  const features = await notion.databases.query({
    database_id: dbIds.module_features_db_id,
    filter: { property: 'Sprint', number: { equals: sprintNum } }
  });

  console.log(`  Found ${features.results.length} features`);

  let updated = 0;
  for (const feature of features.results) {
    try {
      await notion.pages.update({
        page_id: feature.id,
        properties: {
          'Status': { select: { name: 'Done' } },
          'Done?': { checkbox: true }
        }
      });
      updated++;
    } catch (err) {
      console.log(`    Error updating feature: ${err.message}`);
    }
  }

  console.log(`  Updated ${updated}/${features.results.length} features to Done`);

  return { sprint: sprintNum, updated: true, features: updated };
}

async function main() {
  console.log('='.repeat(60));
  console.log('PHASE 1.5 COMPLETION UPDATE (Sprints 71-75)');
  console.log('='.repeat(60));

  const results = [];

  for (const sprintNum of SPRINTS_TO_UPDATE) {
    const result = await updateSprintStatus(sprintNum);
    results.push(result);
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const successCount = results.filter(r => r.updated).length;
  const totalFeatures = results.reduce((sum, r) => sum + (r.features || 0), 0);

  console.log(`Sprints updated: ${successCount}/${SPRINTS_TO_UPDATE.length}`);
  console.log(`Features updated: ${totalFeatures}`);
  console.log('='.repeat(60));

  // Show individual results
  console.log('\nDetails:');
  results.forEach(r => {
    const status = r.updated ? 'Done' : `Skipped (${r.reason})`;
    console.log(`  Sprint ${r.sprint}: ${status}${r.features ? ` - ${r.features} features` : ''}`);
  });
}

main().catch(console.error);
