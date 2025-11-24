#!/usr/bin/env node
/**
 * Correct Sprint 32 with proper commit count and date
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function correctSprint32() {
  console.log('🔧 Correcting Sprint 32 data...\n');

  try {
    // Find Sprint 32 with "Done" status (the correct one)
    const response = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: {
        and: [
          {
            property: 'Sprint',
            title: {
              equals: 'Sprint 32'
            }
          },
          {
            property: 'Status',
            select: {
              equals: 'Done'
            }
          }
        ]
      }
    });

    if (response.results.length === 0) {
      console.log('❌ No Sprint 32 with "Done" status found');
      return;
    }

    const sprint32 = response.results[0];
    console.log(`📋 Found Sprint 32: ${sprint32.id}\n`);

    // Get correct git information
    const commitHash = execSync('git rev-parse HEAD').toString().trim().substring(0, 7);
    const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

    // Count commits for Sprint 32 ONLY (since sprint-31 tag)
    let sprint32CommitCount = 1; // At minimum, the Sprint 32 commit itself
    try {
      const commitsSinceSprint31 = execSync('git rev-list sprint-31..HEAD --count').toString().trim();
      sprint32CommitCount = parseInt(commitsSinceSprint31);
      console.log(`📊 Sprint 32 commits: ${sprint32CommitCount} (since sprint-31 tag)`);
    } catch (error) {
      console.log('⚠️  sprint-31 tag not found, counting from last sprint commit');
      // Fallback: just count the Sprint 32 commit
      sprint32CommitCount = 1;
    }

    // Correct date: November 18, 2025
    const correctDate = '2025-11-18';

    console.log(`📅 Correct date: ${correctDate}`);
    console.log(`🔢 Correct commits count: ${sprint32CommitCount}`);
    console.log('');

    // Update with correct information
    const updateData = {
      properties: {
        'Commits Count': {
          number: sprint32CommitCount
        },
        'Started At': {
          date: { start: correctDate }
        },
        'Completed At': {
          date: { start: correctDate }
        },
        'Date': {
          date: { start: correctDate, end: correctDate }
        },
        'Synced At': {
          date: { start: new Date().toISOString() }
        }
      }
    };

    await notion.pages.update({
      page_id: sprint32.id,
      ...updateData
    });

    console.log('✅ Sprint 32 corrected successfully!');
    console.log(`   Date: Jan 18 → Nov 18, 2025 ✓`);
    console.log(`   Commits Count: 945 → ${sprint32CommitCount} ✓`);
    console.log('');

  } catch (error) {
    console.error('❌ Failed to correct Sprint 32:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

correctSprint32();
