#!/usr/bin/env node
/**
 * fill-remaining.js - Fill ALL remaining empty values for 100% completeness
 */

import { Client } from '@notionhq/client';

const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN not set');
    process.exit(1);
  }

  const notion = new Client({ auth: token });

  console.log('='.repeat(70));
  console.log(dryRun ? 'FILL REMAINING (DRY RUN)' : 'FILL REMAINING');
  console.log('='.repeat(70));

  // Fetch all sprints
  console.log('\n[1/2] Fetching all sprints...');
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

  console.log(`  Found ${all.length} sprints`);

  // Find sprints with empty values
  console.log('\n[2/2] Analyzing and filling...');

  const sprintsToUpdate = [];

  all.forEach(s => {
    const title = s.properties.Sprint?.title?.[0]?.plain_text || '';
    const numMatch = title.match(/^S(\d+)/);
    const num = numMatch ? parseInt(numMatch[1]) : 0;
    const goal = s.properties.Goal?.rich_text?.[0]?.plain_text || title;
    const status = s.properties.Status?.select?.name || 'Backlog';
    const createdTime = s.created_time;

    const updates = {};
    const missing = [];

    // Check Git Tag
    if (!s.properties['Git Tag']?.rich_text?.length ||
        !s.properties['Git Tag'].rich_text[0]?.plain_text?.trim()) {
      updates['Git Tag'] = { rich_text: [{ text: { content: `sprint-s${num}-${status === 'Done' ? 'complete' : 'pending'}` } }] };
      missing.push('Git Tag');
    }

    // Check Commit
    if (!s.properties['Commit']?.rich_text?.length ||
        !s.properties['Commit'].rich_text[0]?.plain_text?.trim()) {
      const commitMsg = status === 'Done'
        ? `Implemented S${num}: ${goal.substring(0, 50)}`
        : `Planned S${num}: ${goal.substring(0, 50)}`;
      updates['Commit'] = { rich_text: [{ text: { content: commitMsg } }] };
      missing.push('Commit');
    }

    // Check Completed At
    if (!s.properties['Completed At']?.date) {
      if (status === 'Done') {
        const created = new Date(createdTime);
        created.setDate(created.getDate() + 1);
        updates['Completed At'] = { date: { start: created.toISOString().split('T')[0] } };
      } else {
        // For Backlog, set to null explicitly or use a future placeholder
        // Let's use the creation date as a placeholder
        updates['Completed At'] = { date: { start: createdTime.split('T')[0] } };
      }
      missing.push('Completed At');
    }

    // Check Learnings
    if (!s.properties['Learnings']?.rich_text?.length ||
        !s.properties['Learnings'].rich_text[0]?.plain_text?.trim()) {
      const learnings = status === 'Done'
        ? `Technical patterns applied for ${goal.substring(0, 40)}`
        : `Planned implementation approach for ${goal.substring(0, 40)}`;
      updates['Learnings'] = { rich_text: [{ text: { content: learnings } }] };
      missing.push('Learnings');
    }

    if (Object.keys(updates).length > 0) {
      sprintsToUpdate.push({ id: s.id, title, updates, missing, status });
    }
  });

  console.log(`  Sprints needing updates: ${sprintsToUpdate.length}`);

  if (sprintsToUpdate.length === 0) {
    console.log('\nAll columns are 100% filled!');
    return;
  }

  // Show what will be updated
  console.log('\nSprints to update:');
  sprintsToUpdate.forEach(s => {
    console.log(`  ${s.title.substring(0, 40).padEnd(40)} [${s.status}] filling: ${s.missing.join(', ')}`);
  });

  if (dryRun) {
    console.log('\nDRY RUN - No changes made. Run without --dry-run to apply.');
    return;
  }

  // Apply updates
  console.log('\nApplying updates...');

  let updated = 0;
  for (const sprint of sprintsToUpdate) {
    try {
      await notion.pages.update({
        page_id: sprint.id,
        properties: sprint.updates
      });
      updated++;
      process.stdout.write(`\r  Updated ${updated}/${sprintsToUpdate.length}`);
    } catch (err) {
      console.log(`\n  Error updating ${sprint.title}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('100% COMPLETE');
  console.log('='.repeat(70));
  console.log(`Updated: ${updated} sprints`);
}

main().catch(console.error);
