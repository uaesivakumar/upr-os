#!/usr/bin/env node
/**
 * Fetch Sprint 51 features from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync, writeFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function getSprint51Features() {
  try {
    console.log('🔍 Fetching Sprint 51 from Notion...\n');

    const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
    const featuresDbId = dbIds.module_features_db_id;
    const sprintsDbId = dbIds.sprints_db_id;

    // First, find Sprint 51 in sprints database
    console.log('🔍 Looking for Sprint 51...');
    const sprintsResponse = await notion.databases.query({
      database_id: sprintsDbId,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 51',
        },
      },
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 51 not found in Sprints database');
      console.log('   Please create Sprint 51 in Notion first.');
      process.exit(1);
    }

    const sprint51 = sprintsResponse.results[0];
    const sprint51Id = sprint51.id;
    console.log(`✅ Found Sprint 51 (ID: ${sprint51Id})\n`);

    // Get sprint details
    const sprintProps = sprint51.properties;
    const sprintGoal = sprintProps.Goal?.rich_text?.[0]?.plain_text || 'No goal set';
    console.log(`📋 Sprint 51 Goal: ${sprintGoal}\n`);

    // Query for Sprint 51 features - Sprint property is a number (51)
    console.log('🔍 Fetching features for Sprint 51...');
    const response = await notion.databases.query({
      database_id: featuresDbId,
      filter: {
        property: 'Sprint',
        number: {
          equals: 51,
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
      console.log('❌ No features with Sprint = 51 found');
      console.log('   Please create features with Sprint number 51 in Notion.');
      process.exit(1);
    }

    console.log(`✅ Found ${response.results.length} features for Sprint 51\n`);

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
    console.log('📋 Sprint 51 Features:\n');
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
      sprint: 'Sprint 51',
      sprint_id: sprint51Id,
      sprint_goal: sprintGoal,
      fetched_at: new Date().toISOString(),
      total_features: features.length,
      features,
    };

    writeFileSync(
      './sprint-51-features.json',
      JSON.stringify(output, null, 2)
    );

    console.log('✅ Features saved to sprint-51-features.json\n');
    console.log('🎯 Ready to start Sprint 51 implementation!');

    return features;
  } catch (error) {
    console.error('❌ Error fetching Sprint 51 features:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

getSprint51Features();
