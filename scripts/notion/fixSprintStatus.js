#!/usr/bin/env node
/**
 * Fix Sprint Status Script
 *
 * Marks Sprint 52 and 53 as "Done" (they were completed but incorrectly marked as Planned)
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const sprintsDbId = dbIds.sprints_db_id;

async function fixSprintStatus(sprintNum, status) {
  console.log(`Fixing Sprint ${sprintNum} status to "${status}"...`);

  const response = await notion.databases.query({
    database_id: sprintsDbId,
    filter: {
      property: 'Sprint',
      title: {
        equals: `Sprint ${sprintNum}`,
      },
    },
  });

  if (response.results.length === 0) {
    console.log(`  Sprint ${sprintNum} not found`);
    return false;
  }

  for (const page of response.results) {
    await notion.pages.update({
      page_id: page.id,
      properties: {
        Status: {
          select: { name: status },
        },
      },
    });
    console.log(`  Updated Sprint ${sprintNum} to ${status}`);
  }

  return true;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Fixing Sprint 52 and 53 Status');
  console.log('='.repeat(60));
  console.log('');

  // Fix Sprint 52 and 53 - they are completed
  await fixSprintStatus(52, 'Done');
  await fixSprintStatus(53, 'Done');

  console.log('');
  console.log('Done! Sprint 52 and 53 are now marked as Done.');
}

main().catch(console.error);
