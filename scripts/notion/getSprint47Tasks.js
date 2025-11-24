#!/usr/bin/env node
/**
 * Get Sprint 47 tasks from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function getSprint47Tasks() {
  console.log('🔍 Fetching Sprint 47 requirements from Notion...\n');

  try {
    // Get Sprint 47 details
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 47' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 47 not found');
      process.exit(1);
    }

    const sprint = sprintsResponse.results[0];
    const sprintProps = sprint.properties;

    console.log('📋 SPRINT 47 DETAILS:');
    console.log('='.repeat(80));

    // Sprint title
    const title = sprintProps.Sprint?.title?.[0]?.text?.content || 'N/A';
    console.log(`Title: ${title}`);

    // Goal
    const goal = sprintProps.Goal?.rich_text?.[0]?.text?.content || 'N/A';
    console.log(`\n🎯 Goal:\n${goal}`);

    // Status
    const status = sprintProps.Status?.select?.name || 'N/A';
    console.log(`\nStatus: ${status}`);

    // Get Module Features for Sprint 47
    console.log('\n📦 MODULE FEATURES:');
    console.log('='.repeat(80));

    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 47 } }
    });

    if (featuresResponse.results.length === 0) {
      console.log('⚠️  No module features found for Sprint 47');
    } else {
      console.log(`Found ${featuresResponse.results.length} features:\n`);

      featuresResponse.results.forEach((feature, idx) => {
        const featureName = feature.properties.Features?.title?.[0]?.text?.content || 'Unnamed';
        const featureStatus = feature.properties.Status?.select?.name || 'N/A';
        const module = feature.properties.Module?.select?.name || 'N/A';
        const description = feature.properties.Description?.rich_text?.[0]?.text?.content || 'No description';

        console.log(`${idx + 1}. ${featureName}`);
        console.log(`   Module: ${module}`);
        console.log(`   Status: ${featureStatus}`);
        console.log(`   Description: ${description}`);
        console.log('');
      });
    }

    // Summary
    console.log('='.repeat(80));
    console.log('✅ Sprint 47 requirements fetched successfully!');
    console.log(`📊 Total Features: ${featuresResponse.results.length}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error fetching Sprint 47:', error.message);
    if (error.body) {
      console.error(JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

getSprint47Tasks();
