#!/usr/bin/env node
/**
 * Start Sprint 49 and mark it as In Progress
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const SPRINTS_DATABASE_ID = dbIds.sprints_db_id;

async function startSprint49() {
  try {
    console.log('🔍 Finding Sprint 49...');

    const response = await notion.databases.query({
      database_id: SPRINTS_DATABASE_ID,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 49'
        }
      }
    });

    if (response.results.length === 0) {
      console.error('❌ Sprint 49 not found');
      return;
    }

    const sprint49 = response.results[0];
    console.log(`✅ Found Sprint 49: ${sprint49.id}`);

    console.log('\n📋 Current Sprint 49 properties:');
    console.log('Status:', sprint49.properties.Status?.select?.name || 'Not set');
    console.log('Started At:', sprint49.properties['Started At']?.date?.start || 'Not set');

    console.log('\n📝 Starting Sprint 49...');

    const today = new Date().toISOString().split('T')[0];

    const updates = {
      'Status': {
        select: {
          name: 'In Progress'
        }
      },
      'Started At': {
        date: {
          start: today
        }
      },
      'Date': {
        date: {
          start: today
        }
      }
    };

    await notion.pages.update({
      page_id: sprint49.id,
      properties: updates
    });

    console.log('✅ Sprint 49 started successfully!');
    console.log(`   Status: In Progress`);
    console.log(`   Started At: ${today}\n`);
    console.log('🎯 Ready to begin implementation!');
    
  } catch (error) {
    console.error('❌ Error starting Sprint 49:', error.message);
    process.exit(1);
  }
}

startSprint49();
