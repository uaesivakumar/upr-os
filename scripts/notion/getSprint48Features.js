#!/usr/bin/env node

/**
 * Get Sprint 48 planned features from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function getSprint48Features() {
  try {
    console.log('🔍 Finding Sprint 48 features in Module Features...\n');

    const response = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Sprint',
        number: {
          equals: 48
        }
      },
      sorts: [
        {
          property: 'Features',
          direction: 'ascending'
        }
      ]
    });

    if (response.results.length === 0) {
      console.log('❌ No Sprint 48 features found');
      return;
    }

    console.log(`✅ Found ${response.results.length} Sprint 48 features:\n`);

    response.results.forEach((feature, index) => {
      const name = feature.properties.Features?.title?.[0]?.text?.content || 'Unnamed';
      const status = feature.properties.Status?.select?.name || 'Not Started';
      const module = feature.properties.Module?.select?.name || 'N/A';
      const description = feature.properties.Description?.rich_text?.[0]?.text?.content || 'No description';

      console.log(`${index + 1}. ${name}`);
      console.log(`   Module: ${module}`);
      console.log(`   Status: ${status}`);
      console.log(`   Description: ${description}`);
      console.log();
    });

    // Also check Sprint 48 in Sprints database
    console.log('\n🔍 Checking Sprint 48 in Sprints database...\n');

    const sprintResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 48'
        }
      }
    });

    if (sprintResponse.results.length > 0) {
      const sprint48 = sprintResponse.results[0];
      const goal = sprint48.properties.Goal?.rich_text?.[0]?.text?.content || 'Not set';
      const status = sprint48.properties.Status?.select?.name || 'Not set';
      console.log('✅ Sprint 48 exists in Sprints database');
      console.log(`   Goal: ${goal}`);
      console.log(`   Status: ${status}`);
    } else {
      console.log('⚠️  Sprint 48 not found in Sprints database');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
  }
}

getSprint48Features();
