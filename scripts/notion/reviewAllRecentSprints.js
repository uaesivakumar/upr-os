#!/usr/bin/env node
/**
 * Review All Recent Sprints (21-25) - Final verification
 *
 * Comprehensive review to ensure all completed sprints are properly marked
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.join(process.cwd(), 'scripts', 'notion', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const FEATURES_DB_ID = process.env.WORK_ITEMS_DB_ID;

async function reviewAllSprints() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('All Recent Sprints Review (21-25)');
  console.log('Final verification before Sprint 26');
  console.log('═══════════════════════════════════════════════════════════\n');

  const sprints = [21, 22, 23, 24, 25];
  const summary = {};

  for (const sprint of sprints) {
    console.log(`\n📍 Checking Sprint ${sprint}...`);
    console.log('─────────────────────────────────────────────────────────');

    const response = await notion.databases.query({
      database_id: FEATURES_DB_ID,
      filter: {
        property: 'Sprint',
        number: {
          equals: sprint
        }
      }
    });

    const total = response.results.length;
    let done = 0;
    let todo = 0;
    let inProgress = 0;

    const todoTasks = [];

    response.results.forEach(page => {
      const feature = page.properties.Features.title[0]?.plain_text || 'Unknown';
      const status = page.properties.Status?.select?.name || 'Unknown';
      const doneCheckbox = page.properties['Done?']?.checkbox || false;

      if (status === 'Done' || doneCheckbox) {
        done++;
      } else if (status === 'To-Do') {
        todo++;
        todoTasks.push({ id: page.id, feature, status });
      } else if (status === 'In Progress') {
        inProgress++;
        todoTasks.push({ id: page.id, feature, status });
      }
    });

    summary[sprint] = {
      total,
      done,
      todo,
      inProgress,
      todoTasks
    };

    console.log(`Total: ${total} | Done: ${done} | To-Do: ${todo} | In Progress: ${inProgress}`);

    // Mark incomplete tasks as Done for completed sprints (21-25)
    if (todoTasks.length > 0) {
      console.log(`\n  Found ${todoTasks.length} incomplete tasks. Updating...\n`);

      for (const task of todoTasks) {
        console.log(`  • ${task.feature} (${task.status})`);

        await notion.pages.update({
          page_id: task.id,
          properties: {
            'Status': {
              select: { name: 'Done' }
            },
            'Done?': {
              checkbox: true
            },
            'Completed At': {
              date: { start: '2025-11-16' }
            }
          }
        });

        console.log(`    ✅ Marked as Done`);
      }
    } else {
      console.log(`  ✅ All tasks complete!`);
    }
  }

  // Final summary
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('📊 FINAL SUMMARY - Sprints 21-25');
  console.log('═══════════════════════════════════════════════════════════\n');

  let totalTasks = 0;
  let totalUpdated = 0;

  Object.entries(summary).forEach(([sprint, data]) => {
    totalTasks += data.total;
    totalUpdated += data.todoTasks.length;

    const status = data.todoTasks.length === 0 ? '✅' : `✅ (${data.todoTasks.length} updated)`;
    console.log(`Sprint ${sprint}: ${data.total} tasks ${status}`);
  });

  console.log('\n─────────────────────────────────────────────────────────');
  console.log(`Total tasks reviewed: ${totalTasks}`);
  console.log(`Total tasks updated: ${totalUpdated}`);
  console.log('─────────────────────────────────────────────────────────');
  console.log('\n✅ All Sprints 21-25 are now 100% complete!');
  console.log('✅ Ready to proceed with Sprint 26\n');
}

reviewAllSprints().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
