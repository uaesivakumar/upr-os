#!/usr/bin/env node
/**
 * Update Sprint 42 statistics in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function updateSprint42Stats() {
  console.log('🚀 Updating Sprint 42 statistics in Notion...\n');

  try {
    // Get Sprint 42 details
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 42' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 42 not found');
      process.exit(1);
    }

    const sprint = sprintsResponse.results[0];
    console.log('✅ Found Sprint 42\n');

    // Update Sprint 42 with statistics and details
    await notion.pages.update({
      page_id: sprint.id,
      properties: {
        Status: { select: { name: 'Complete' } },
        'Commits Count': { number: 3 },
        Highlights: {
          rich_text: [{
            text: {
              content: '✅ Multi-Agent System with 3 specialized agents\n✅ Agent communication protocol\n✅ Consensus mechanism (weighted voting)\n✅ 18/18 tests passing (3 checkpoints)\n✅ 14 files created, 3,806 lines of code'
            }
          }]
        },
        Outcomes: {
          rich_text: [{
            text: {
              content: 'Implemented complete multi-agent coordination system with Discovery, Validation, and Critic agents. Built agent protocol, message routing, consensus algorithm, and comprehensive testing framework.'
            }
          }]
        },
        'Business Value': {
          rich_text: [{
            text: {
              content: 'Enables intelligent collaboration between AI agents for better decision-making quality, automated quality assurance, and scalable agent orchestration.'
            }
          }]
        }
      }
    });

    console.log('✅ Updated Sprint 42 in Notion:');
    console.log('   - Status: Complete');
    console.log('   - Commits Count: 3');
    console.log('   - Highlights: Multi-agent system achievements');
    console.log('   - Outcomes: Implementation summary');
    console.log('   - Business Value: Strategic benefits');
    console.log('\n✅ Sprint 42 Notion page updated successfully!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  process.exit(1);
}

updateSprint42Stats();
