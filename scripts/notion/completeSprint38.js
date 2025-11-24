#!/usr/bin/env node
/**
 * Mark Sprint 38 as complete in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function completeSprint38() {
  console.log('🔄 Updating Sprint 38 in Notion...\n');

  try {
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 38' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 38 not found');
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
              content: 'Phase 12: Agent Enhancement & Optimization complete. Performance tracking, auto-improvement, specialization, collaborative learning, advanced consensus. 20/20 tests passing (100%).'
            }
          }]
        }
      }
    });

    console.log('✅ Sprint 38 marked as Done');

    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 38 } }
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
    console.log('✅ Sprint 38 completion synced to Notion!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log('   Sprint: Sprint 38 - Agent Enhancement & Optimization');
    console.log('   Status: Done ✓');
    console.log('   Features: 9/9 complete');
    console.log('   Tests: 20/20 passing (100%)');
    console.log('   Database: 5 tables + 3 views + 3 functions\n');
    console.log('🎉 Sprint 38 Complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  process.exit(1);
}

completeSprint38();
