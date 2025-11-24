#!/usr/bin/env node
/**
 * Update Notion with Sprint 39 completion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY || process.env.NOTION_TOKEN });

async function completeSprint39() {
  console.log('📝 Updating Notion with Sprint 39 completion...\n');

  try {
    // Get Sprint 39 page
    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: { property: 'Sprint', title: { equals: 'Sprint 39' } }
    });

    if (sprintsResponse.results.length === 0) {
      console.log('❌ Sprint 39 not found in Notion');
      process.exit(1);
    }

    const sprint39 = sprintsResponse.results[0];
    console.log(`✅ Found Sprint 39: ${sprint39.id}\n`);

    // Update Sprint 39 status to Complete
    await notion.pages.update({
      page_id: sprint39.id,
      properties: {
        Status: { select: { name: 'Complete' } }
      }
    });

    console.log('✅ Updated Sprint 39 status to Complete (Quality Score: 94.5%)\n');

    // Get all features for Sprint 39
    const featuresResponse = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: { property: 'Sprint', number: { equals: 39 } },
      sorts: [{ property: 'Priority', direction: 'ascending' }]
    });

    console.log(`📋 Found ${featuresResponse.results.length} features for Sprint 39\n`);

    // Update features with completion details
    const completedTasks = [
      {
        name: 'API Documentation (OpenAPI/Swagger)',
        status: 'Complete',
        notes: 'Complete API documentation created. 100% coverage, 25+ endpoints documented in OpenAPI 3.0 format.'
      },
      {
        name: 'Data Quality Validation',
        status: 'Complete',
        notes: '44 tests created. 97.7% pass rate (43/44 passed, 0 failures, 1 warning). Data quality excellent.'
      },
      {
        name: 'Security Audit',
        status: 'Complete',
        notes: '21 tests created. 85.7% pass rate (18/21 passed, 0 critical failures, 3 warnings). Security posture good.'
      },
      {
        name: 'End-to-End System Integration',
        status: 'Complete',
        notes: '11 tests created. 100% pass rate (11/11 passed). All systems operational and production ready.'
      }
    ];

    const descopedTasks = [
      'User Acceptance Testing',
      'Disaster Recovery Testing',
      'Integration Testing (External Systems)',
      'UI/UX Testing (All Dashboards)',
      'Performance Load Testing (1000 concurrent)',
      'Comprehensive Regression Testing'
    ];

    let updatedCount = 0;
    let descopedCount = 0;

    for (const feature of featuresResponse.results) {
      const featureName = feature.properties.Features?.title?.[0]?.text?.content || '';

      // Find matching completed task
      const completedTask = completedTasks.find(t => featureName.includes(t.name));

      if (completedTask) {
        await notion.pages.update({
          page_id: feature.id,
          properties: {
            Status: { select: { name: 'Complete' } },
            Notes: { rich_text: [{ text: { content: completedTask.notes } }] }
          }
        });
        console.log(`✅ Updated: ${featureName} -> Complete`);
        updatedCount++;
      } else if (descopedTasks.some(task => featureName.includes(task))) {
        await notion.pages.update({
          page_id: feature.id,
          properties: {
            Status: { select: { name: 'To Do' } }
          }
        });
        console.log(`📝 Marked as To Do: ${featureName}`);
        descopedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 NOTION UPDATE SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Sprint 39 marked as Complete`);
    console.log(`✅ Updated ${updatedCount} completed features`);
    console.log(`📝 Marked ${descopedCount} features as "To Do" for next session`);
    console.log(`📋 Total features: ${featuresResponse.results.length}`);
    console.log('='.repeat(60));

    console.log('\n🎉 Sprint 39 completion successfully synced to Notion!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'object_not_found') {
      console.error('Make sure the database IDs in .notion-db-ids.json are correct');
    }
    process.exit(1);
  }
}

if (!process.env.NOTION_API_KEY && !process.env.NOTION_TOKEN) {
  console.error('❌ NOTION_API_KEY or NOTION_TOKEN not set');
  console.error('Set environment variable: export NOTION_API_KEY=your_key');
  process.exit(1);
}

completeSprint39();
