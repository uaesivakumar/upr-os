#!/usr/bin/env node
import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function completeSprint34() {
  console.log('🔄 Updating Sprint 34 in Notion...\n');

  try {
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 34' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 34 not found');
      process.exit(1);
    }

    await notion.pages.update({
      page_id: sprintsResponse.results[0].id,
      properties: {
        'Status': { select: { name: 'Done' } },
        'Completed At': { date: { start: '2025-11-18' } },
        'Outcomes': { rich_text: [{ text: { content: 'Phase 9: Lifecycle Analytics & Automation complete. 7 services, 156/156 tests passing.' } }] },
        'Sprint Notes': { rich_text: [{ text: { content: 'Checkpoint 1: 93/93, Checkpoint 2: 40/40, Smoke: 23/23. QA certified.' } }] }
      }
    });

    console.log('✅ Sprint 34 marked as Done');

    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 34 } }
    });

    console.log(`\n📝 Updating ${featuresResponse.results.length} features...\n`);

    for (const feature of featuresResponse.results) {
      const name = feature.properties.Features?.title?.[0]?.text?.content || 'Unknown';
      await notion.pages.update({
        page_id: feature.id,
        properties: { 'Status': { select: { name: 'Done' } }, 'Done?': { checkbox: true } }
      });
      console.log(`✅ ${name}`);
    }

    console.log('\n✅ Sprint 34 completion synced to Notion!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) console.error(JSON.stringify(error.body, null, 2));
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  process.exit(1);
}

completeSprint34();
