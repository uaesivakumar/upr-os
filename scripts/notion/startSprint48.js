#!/usr/bin/env node

/**
 * Start Sprint 48 and mark it as In Progress
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const SPRINTS_DATABASE_ID = dbIds.sprints_db_id;

async function startSprint48() {
  try {
    console.log('🔍 Finding Sprint 48...');

    // Find Sprint 48
    const response = await notion.databases.query({
      database_id: SPRINTS_DATABASE_ID,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 48'
        }
      }
    });

    if (response.results.length === 0) {
      console.error('❌ Sprint 48 not found');
      return;
    }

    const sprint48 = response.results[0];
    console.log(`✅ Found Sprint 48: ${sprint48.id}`);

    // Log current properties
    console.log('\n📋 Current Sprint 48 properties:');
    console.log('Status:', sprint48.properties.Status?.select?.name || 'Not set');
    console.log('Started At:', sprint48.properties['Started At']?.date?.start || 'Not set');

    // Update Sprint 48 to In Progress with start date
    console.log('\n📝 Starting Sprint 48...');

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
      page_id: sprint48.id,
      properties: updates
    });

    console.log('✅ Sprint 48 started successfully');

    console.log('\n📊 Sprint 48 Started:');
    console.log(`   Status: In Progress`);
    console.log(`   Start Date: ${today}`);
    console.log('   Goal: Modern UI/UX with Futuristic Sidebar');
    console.log('   Features: 10');

    console.log('\n🚀 Sprint 48 is now active!');

  } catch (error) {
    console.error('❌ Error starting Sprint 48:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

startSprint48();
