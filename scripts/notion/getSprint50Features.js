#!/usr/bin/env node
/**
 * Fetch Sprint 50 features from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync, writeFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function getSprint50Features() {
  try {
    console.log('🔍 Fetching Sprint 50 from Notion...\n');

    const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
    const featuresDbId = dbIds.module_features_db_id;
    const sprintsDbId = dbIds.sprints_db_id;

    // First, find Sprint 50 in sprints database
    console.log('🔍 Looking for Sprint 50...');
    const sprintsResponse = await notion.databases.query({
      database_id: sprintsDbId,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 50',
        },
      },
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 50 not found in Sprints database');
      console.log('   Please create Sprint 50 in Notion first.');
      process.exit(1);
    }

    const sprint50 = sprintsResponse.results[0];
    const sprint50Id = sprint50.id;
    console.log(`✅ Found Sprint 50 (ID: ${sprint50Id})\n`);

    // Get sprint details
    const sprintProps = sprint50.properties;
    const sprintGoal = sprintProps.Goal?.rich_text?.[0]?.plain_text || 'No goal set';
    console.log(`📋 Sprint 50 Goal: ${sprintGoal}\n`);

    // Query for Sprint 50 features - Sprint property is a number (50)
    console.log('🔍 Fetching features for Sprint 50...');
    const response = await notion.databases.query({
      database_id: featuresDbId,
      filter: {
        property: 'Sprint',
        number: {
          equals: 50,
        },
      },
      sorts: [
        {
          property: 'Priority',
          direction: 'ascending',
        },
      ],
    });

    if (response.results.length === 0) {
      console.log('❌ No features with Sprint = 50 found');
      console.log('   Please create features with Sprint number 50 in Notion.');
      process.exit(1);
    }

    console.log(`✅ Found ${response.results.length} features for Sprint 50\n`);

    const features = response.results.map((page) => {
      const props = page.properties;
      return {
        id: page.id,
        name: props.Features?.title?.[0]?.plain_text || 'Untitled',
        status: props.Status?.select?.name || 'Not Started',
        priority: props.Priority?.select?.name || 'Medium',
        type: props.Type?.select?.name || 'Feature',
        complexity: props.Complexity?.select?.name || 'Unknown',
        description: props.Notes?.rich_text?.[0]?.plain_text || '',
        tags: props.Tags?.multi_select?.map(t => t.name) || [],
        estimate: props.ETA?.number || 0,
        modules: props.Modules?.relation?.length || 0,
      };
    });

    // Display features
    console.log('📋 Sprint 50 Features:\n');
    features.forEach((feature, index) => {
      console.log(`${index + 1}. ${feature.name}`);
      console.log(`   Status: ${feature.status} | Priority: ${feature.priority} | Type: ${feature.type}`);
      if (feature.complexity !== 'Unknown') {
        console.log(`   Complexity: ${feature.complexity}`);
      }
      if (feature.tags.length > 0) {
        console.log(`   Tags: ${feature.tags.join(', ')}`);
      }
      if (feature.description) {
        console.log(`   Notes: ${feature.description.substring(0, 100)}${feature.description.length > 100 ? '...' : ''}`);
      }
      console.log('');
    });

    // Save to file
    const output = {
      sprint: 'Sprint 50',
      sprint_id: sprint50Id,
      sprint_goal: sprintGoal,
      fetched_at: new Date().toISOString(),
      total_features: features.length,
      features,
    };

    writeFileSync(
      './sprint-50-features.json',
      JSON.stringify(output, null, 2)
    );

    console.log('✅ Features saved to sprint-50-features.json\n');
    console.log('🎯 Ready to start Sprint 50 implementation!');

    return features;
  } catch (error) {
    console.error('❌ Error fetching Sprint 50 features:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

getSprint50Features();
