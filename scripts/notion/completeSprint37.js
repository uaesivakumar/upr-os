#!/usr/bin/env node
/**
 * Mark Sprint 37 as complete in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function completeSprint37() {
  console.log('🔄 Updating Sprint 37 in Notion...\n');

  try {
    // Update Sprint 37 in Sprints DB
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 37' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 37 not found in Sprints database');
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
              content: 'Phase 11: Multi-Agent Collaboration & Reflection complete. 8 services, 4 agents, 50/50 tests passing (100%).'
            }
          }]
        },
        'Sprint Notes': {
          rich_text: [{
            text: {
              content: 'Checkpoint 1: 23/23 (100%), Comprehensive Smoke: 27/27 (100%). QA Certified Production-Ready.'
            }
          }]
        }
      }
    });

    console.log('✅ Sprint 37 marked as Done in Sprints DB');

    // Update all Sprint 37 features in Module Features DB
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 37 } }
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
    console.log('✅ Sprint 37 completion synced to Notion!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log('   Sprint: Sprint 37 - Multi-Agent Collaboration & Reflection');
    console.log('   Status: Done ✓');
    console.log('   Features: 11/11 complete');
    console.log('   Tests: 50/50 passing (100%)');
    console.log('   Agents: 4 (BaseAgent + 3 specialized)');
    console.log('   Services: 8');
    console.log('   Database: 6 tables + 3 views + 3 functions');
    console.log('\n   Deliverables:');
    console.log('   ✅ Multi-Agent System Foundation');
    console.log('   ✅ Discovery, Validation, Critic Agents');
    console.log('   ✅ Agent Coordination (4 workflow types)');
    console.log('   ✅ Reflection & Learning Pipeline');
    console.log('   ✅ Agent Monitoring & Health Tracking');
    console.log('   ✅ Consensus Building');
    console.log('\n   Checkpoints:');
    console.log('   ✅ Checkpoint 1: 23/23 (Foundation & Agents)');
    console.log('   ✅ Comprehensive Smoke Test: 27/27 (End-to-End)');
    console.log('\n🎉 Sprint 37 Complete!\n');

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

completeSprint37();
