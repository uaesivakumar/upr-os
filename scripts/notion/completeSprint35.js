#!/usr/bin/env node
/**
 * Mark Sprint 35 as complete in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function completeSprint35() {
  console.log('🔄 Updating Sprint 35 in Notion...\n');

  try {
    // Update Sprint 35 in Sprints DB
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 35' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 35 not found in Sprints database');
      process.exit(1);
    }

    await notion.pages.update({
      page_id: sprintsResponse.results[0].id,
      properties: {
        'Status': { select: { name: 'Done' } },
        'Completed At': { date: { start: '2025-11-18' } },
        'Outcomes': {
          rich_text: [{
            text: {
              content: 'Phase 12: Lead Scoring Engine complete. 5 services, 10 API endpoints, 76/76 tests passing (100%).'
            }
          }]
        },
        'Sprint Notes': {
          rich_text: [{
            text: {
              content: 'Checkpoint 1: 38/38 (100%), Checkpoint 2: 19/19 (100%), Smoke: 19/19 (100%). Production-ready.'
            }
          }]
        }
      }
    });

    console.log('✅ Sprint 35 marked as Done in Sprints DB');

    // Update all Sprint 35 features in Module Features DB
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 35 } }
    });

    console.log(`\n📝 Updating ${featuresResponse.results.length} features...\n`);

    for (const feature of featuresResponse.results) {
      const name = feature.properties.Features?.title?.[0]?.text?.content || 'Unknown';
      await notion.pages.update({
        page_id: feature.id,
        properties: {
          'Status': { select: { name: 'Done' } },
          'Done?': { checkbox: true }
        }
      });
      console.log(`✅ ${name}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Sprint 35 completion synced to Notion!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log('   Sprint: Sprint 35 - Lead Scoring Engine');
    console.log('   Status: Done ✓');
    console.log('   Features: 12/12 complete');
    console.log('   Tests: 76/76 passing (100%)');
    console.log('   Services: 5');
    console.log('   API Endpoints: 10');
    console.log('   Database Tables: 2 + 2 views + 3 functions');
    console.log('\n   Checkpoints:');
    console.log('   ✅ Checkpoint 1: 38/38 (Scoring Components)');
    console.log('   ✅ Checkpoint 2: 19/19 (API & Integration)');
    console.log('   ✅ Smoke Test: 19/19 (End-to-End)');
    console.log('\n🎉 Sprint 35 Complete!\n');

  } catch (error) {
    console.error('❌ Error updating Notion:', error.message);
    if (error.body) {
      console.error(JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  console.log('Run: source .env && export NOTION_API_KEY=$NOTION_TOKEN');
  process.exit(1);
}

completeSprint35();
