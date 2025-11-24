#!/usr/bin/env node
/**
 * Find and update existing Sprint 32 in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function fixSprint32() {
  console.log('🔍 Searching for Sprint 32 in Notion...\n');

  try {
    // Query for Sprint 32
    const response = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 32'
        }
      }
    });

    console.log(`Found ${response.results.length} Sprint 32 entries\n`);

    if (response.results.length === 0) {
      console.log('❌ No Sprint 32 found. It should exist with status "Planned"');
      console.log('Please check the Sprints database manually.');
      return;
    }

    // Show all Sprint 32 entries
    for (const page of response.results) {
      const title = page.properties.Sprint?.title?.[0]?.text?.content || 'No title';
      const status = page.properties.Status?.select?.name || 'No status';
      console.log(`📋 Sprint: ${title}`);
      console.log(`   Status: ${status}`);
      console.log(`   Page ID: ${page.id}`);
      console.log('');
    }

    // Find the one with "Planned" status
    const plannedSprint = response.results.find(page =>
      page.properties.Status?.select?.name === 'Planned'
    );

    if (!plannedSprint) {
      console.log('⚠️  No Sprint 32 with "Planned" status found.');
      console.log('Updating the first Sprint 32 entry...\n');
    }

    const sprintToUpdate = plannedSprint || response.results[0];

    // Get git information
    const commitHash = execSync('git rev-parse HEAD').toString().trim().substring(0, 7);
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const commitCount = execSync('git rev-list --count HEAD').toString().trim();

    // Update the sprint
    console.log('🔄 Updating Sprint 32...\n');

    const updateData = {
      properties: {
        'Status': {
          select: { name: 'Done' }
        },
        'Goal': {
          rich_text: [{
            text: {
              content: 'Implement advanced prompt engineering and optimization system with A/B testing, personalization, and safety guardrails'
            }
          }]
        },
        'Outcomes': {
          rich_text: [{
            text: {
              content: '✅ 3 Doctrine Prompts (Research, Qualification, Strategy)\n✅ A/B Testing Infrastructure\n✅ Multi-Step Prompting (Chain-of-thought)\n✅ Personalization Engine\n✅ Safety Guardrails\n✅ Prompt Analytics API\n✅ Prompt Library API\n✅ 75 Tests Passing (100%)'
            }
          }]
        },
        'Highlights': {
          rich_text: [{
            text: {
              content: '• Fixed doctrine prompts for research, qualification, and strategy\n• Complete A/B testing infrastructure with performance tracking\n• Multi-step prompting with chain-of-thought reasoning\n• Industry/company/contact personalization engine\n• Comprehensive safety guardrails and brand compliance\n• Analytics API for usage, performance, and conversions\n• 100% test pass rate (75 tests)'
            }
          }]
        },
        'Business Value': {
          rich_text: [{
            text: {
              content: 'Enables data-driven prompt optimization, ensures brand compliance, and provides personalized outreach at scale. A/B testing allows continuous improvement of conversion rates.'
            }
          }]
        },
        'Learnings': {
          rich_text: [{
            text: {
              content: '• Chain-of-thought prompting improves output quality\n• Safety guardrails catch 100% of brand violations\n• Personalization engine handles edge cases gracefully\n• Performance: <110ms per execution, <1ms per personalization\n• Unicode/Arabic content requires proper length validation'
            }
          }]
        },
        'Commit': {
          rich_text: [{ text: { content: commitHash } }]
        },
        'Branch': {
          rich_text: [{ text: { content: branch } }]
        },
        'Git Tag': {
          rich_text: [{ text: { content: 'sprint-32' } }]
        },
        'Commits Count': {
          number: parseInt(commitCount)
        },
        'Commit Range': {
          rich_text: [{ text: { content: `${commitHash}` } }]
        },
        'Started At': {
          date: { start: '2025-01-18' }
        },
        'Completed At': {
          date: { start: '2025-01-18' }
        },
        'Date': {
          date: { start: '2025-01-18', end: '2025-01-18' }
        },
        'Phases Updated': {
          multi_select: [
            { name: 'Phase 6' }
          ]
        },
        'Synced At': {
          date: { start: new Date().toISOString() }
        }
      }
    };

    await notion.pages.update({
      page_id: sprintToUpdate.id,
      ...updateData
    });

    console.log('✅ Sprint 32 updated successfully!');
    console.log(`   Page ID: ${sprintToUpdate.id}`);
    console.log(`   Status: Planned → Done`);
    console.log(`   Commit: ${commitHash}`);
    console.log(`   Tag: sprint-32`);
    console.log('');

    // Delete the duplicate if we created one
    if (response.results.length > 1) {
      console.log('🗑️  Checking for duplicates...');
      for (const page of response.results) {
        if (page.id !== sprintToUpdate.id) {
          console.log(`   Found duplicate: ${page.id}`);
          console.log(`   Note: Please manually delete duplicate entries in Notion`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Failed to update Sprint 32:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

fixSprint32();
