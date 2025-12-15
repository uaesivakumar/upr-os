#!/usr/bin/env node
/**
 * analyze-sprints.js - Analyze sprint duplicates and classification issues
 */

import { Client } from '@notionhq/client';

const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN not set');
    process.exit(1);
  }

  const notion = new Client({ auth: token });

  // Fetch all sprints
  const all = [];
  let cursor;

  do {
    const response = await notion.databases.query({
      database_id: SPRINTS_DB,
      start_cursor: cursor
    });
    all.push(...response.results);
    cursor = response.next_cursor;
  } while (cursor);

  console.log('Total sprints:', all.length);
  console.log('');

  // Extract sprint numbers and find duplicates
  const sprintNumbers = {};
  const noNumber = [];

  all.forEach(s => {
    const title = s.properties.Sprint?.title?.[0]?.plain_text || '';
    // Extract number from title like 'S55:', 'Sprint S55', 'Sprint 55:', etc.
    const match = title.match(/[Ss](?:print\s*)?(\d+)/);
    if (match) {
      const num = parseInt(match[1]);
      if (!sprintNumbers[num]) sprintNumbers[num] = [];
      sprintNumbers[num].push({
        id: s.id,
        title,
        repo: s.properties.Repo?.select?.name || 'Not set',
        status: s.properties.Status?.select?.name || 'No status',
        createdTime: s.created_time
      });
    } else {
      noNumber.push({
        id: s.id,
        title,
        repo: s.properties.Repo?.select?.name || 'Not set'
      });
    }
  });

  // Find duplicates
  console.log('=== DUPLICATE SPRINT NUMBERS ===');
  let dupCount = 0;
  const duplicates = Object.entries(sprintNumbers)
    .filter(([num, items]) => items.length > 1)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  duplicates.forEach(([num, items]) => {
    console.log(`S${num} (${items.length} entries):`);
    items.forEach(i => console.log(`  - ${i.title} [${i.repo}] (${i.status})`));
    dupCount += items.length - 1;
  });

  console.log('');
  console.log('Total duplicate entries:', dupCount);
  console.log('');

  if (noNumber.length > 0) {
    console.log('=== SPRINTS WITHOUT NUMBERS ===');
    noNumber.forEach(s => console.log(`  - ${s.title} [${s.repo}]`));
    console.log('Total without numbers:', noNumber.length);
    console.log('');
  }

  // Show sprint number range
  const nums = Object.keys(sprintNumbers).map(n => parseInt(n)).sort((a,b) => a-b);
  console.log('Sprint number range:', nums[0], '-', nums[nums.length-1]);
  console.log('Unique sprint numbers:', nums.length);

  // Show current Repo distribution
  console.log('');
  console.log('=== CURRENT REPO DISTRIBUTION ===');
  const byRepo = {};
  all.forEach(s => {
    const repo = s.properties.Repo?.select?.name || 'Not set';
    byRepo[repo] = (byRepo[repo] || 0) + 1;
  });
  Object.entries(byRepo).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // Look at all sprint titles to understand classification
  console.log('');
  console.log('=== ALL SPRINT TITLES (sorted by number) ===');
  const sorted = [];
  Object.entries(sprintNumbers).forEach(([num, items]) => {
    items.forEach(item => {
      sorted.push({ num: parseInt(num), ...item });
    });
  });
  noNumber.forEach(item => {
    sorted.push({ num: 999, ...item });
  });

  sorted.sort((a, b) => a.num - b.num);
  sorted.forEach(s => {
    console.log(`${s.num.toString().padStart(3)}. ${s.title.substring(0, 60).padEnd(60)} [${s.repo}]`);
  });
}

main().catch(console.error);
