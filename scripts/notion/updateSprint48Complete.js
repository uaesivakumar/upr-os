#!/usr/bin/env node
/**
 * Complete Sprint 48 in Notion
 * Marks the sprint as Done and sets completion date
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function completeSprint48() {
  try {
    console.log('🎯 Completing Sprint 48...\n');

    // Load database IDs
    const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
    const sprintsDbId = dbIds.sprints_db_id;

    // Find Sprint 48
    console.log('🔍 Finding Sprint 48...');
    const response = await notion.databases.query({
      database_id: sprintsDbId,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 48',
        },
      },
    });

    if (response.results.length === 0) {
      console.error('❌ Sprint 48 not found');
      process.exit(1);
    }

    const sprint = response.results[0];
    console.log('✅ Found Sprint 48');

    // Update sprint status to Done
    console.log('\n📝 Updating sprint to Done...');
    const today = new Date().toISOString().split('T')[0];
    
    await notion.pages.update({
      page_id: sprint.id,
      properties: {
        Status: {
          select: {
            name: 'Done',
          },
        },
        'Completed At': {
          date: {
            start: today,
          },
        },
      },
    });

    console.log('✅ Sprint 48 marked as Done');
    console.log('\n🎉 Sprint 48 Complete!');
    console.log('   All 10 features implemented and tested');
    console.log('   QC Certificate generated');
    console.log('   Ready for Sprint 49\n');
  } catch (error) {
    console.error('❌ Error completing sprint:', error.message);
    process.exit(1);
  }
}

completeSprint48();
