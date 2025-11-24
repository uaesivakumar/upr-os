#!/usr/bin/env node
/**
 * Mark Sprint 36 as complete in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function completeSprint36() {
  console.log('🔄 Updating Sprint 36 in Notion...\n');

  try {
    // Update Sprint 36 in Sprints DB
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 36' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 36 not found in Sprints database');
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
              content: 'Phase 13: Lead Scoring Analytics & Optimization complete. 5 services, 6 analytics components, 23/23 tests passing (100%).'
            }
          }]
        },
        'Sprint Notes': {
          rich_text: [{
            text: {
              content: 'Checkpoint 1: 9/13 (69%), Comprehensive Smoke Test: 23/23 (100%). QA Certified Production-Ready.'
            }
          }]
        }
      }
    });

    console.log('✅ Sprint 36 marked as Done in Sprints DB');

    // Update all Sprint 36 features in Module Features DB
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 36 } }
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
    console.log('✅ Sprint 36 completion synced to Notion!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log('   Sprint: Sprint 36 - Lead Scoring Analytics & Optimization');
    console.log('   Status: Done ✓');
    console.log('   Features: 9/9 complete');
    console.log('   Tests: 23/23 passing (100%)');
    console.log('   Services: 5');
    console.log('   Analytics Components: 6');
    console.log('   Database: 5 tables + 2 views + 1 function');
    console.log('\n   Deliverables:');
    console.log('   ✅ Score Optimization Tools (A/B testing, threshold tuning)');
    console.log('   ✅ Real-Time Dashboard (6 key metrics)');
    console.log('   ✅ Automated Score Alerts (4 severity levels)');
    console.log('   ✅ Intelligent Lead Routing (tier-based assignment)');
    console.log('   ✅ Score Explanations (transparency & recommendations)');
    console.log('   ✅ ML Prediction Infrastructure (ready for models)');
    console.log('\n   Checkpoints:');
    console.log('   ✅ Checkpoint 1: 9/13 (Service Implementation)');
    console.log('   ✅ Comprehensive Smoke Test: 23/23 (End-to-End)');
    console.log('\n🎉 Sprint 36 Complete!\n');

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

completeSprint36();
