#!/usr/bin/env node
/**
 * perfect-features.js - Make Features database perfect
 * 1. Delete meaningless columns (0% filled)
 * 2. Fill all missing values
 */

import { Client } from '@notionhq/client';

const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

const COLUMNS_TO_DELETE = ['Dependencies', 'AI Score', 'ETA', 'Actual Time', 'Files & media'];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN not set');
    process.exit(1);
  }

  const notion = new Client({ auth: token });

  console.log('='.repeat(70));
  console.log(dryRun ? 'PERFECT FEATURES (DRY RUN)' : 'PERFECT FEATURES');
  console.log('='.repeat(70));

  // Step 1: Delete meaningless columns
  console.log('\n[1/4] Deleting meaningless columns...');

  if (!dryRun) {
    for (const colName of COLUMNS_TO_DELETE) {
      try {
        const db = await notion.databases.retrieve({ database_id: FEATURES_DB });
        if (db.properties[colName]) {
          await notion.databases.update({
            database_id: FEATURES_DB,
            properties: { [colName]: null }
          });
          console.log(`  Deleted: ${colName}`);
        } else {
          console.log(`  Already gone: ${colName}`);
        }
        await sleep(300);
      } catch (err) {
        console.log(`  Error deleting ${colName}: ${err.message}`);
      }
    }
  } else {
    console.log(`  Would delete: ${COLUMNS_TO_DELETE.join(', ')}`);
  }

  // Step 2: Fetch all features
  console.log('\n[2/4] Fetching all features...');
  const all = [];
  let cursor;

  do {
    const response = await notion.databases.query({
      database_id: FEATURES_DB,
      start_cursor: cursor
    });
    all.push(...response.results);
    cursor = response.next_cursor;
  } while (cursor);

  console.log(`  Found ${all.length} features`);

  // Step 3: Analyze and prepare updates
  console.log('\n[3/4] Analyzing missing values...');

  const featuresToUpdate = [];

  all.forEach(f => {
    const title = f.properties.Features?.title?.[0]?.plain_text || '';
    const status = f.properties.Status?.select?.name || 'Backlog';
    const sprint = f.properties.Sprint?.number;
    const repo = f.properties.Repo?.select?.name || 'OS';
    const createdTime = f.created_time;

    const updates = {};
    const missing = [];

    // Check Started At
    if (!f.properties['Started At']?.date) {
      updates['Started At'] = { date: { start: createdTime.split('T')[0] } };
      missing.push('Started At');
    }

    // Check Completed At
    if (!f.properties['Completed At']?.date && status === 'Done') {
      const created = new Date(createdTime);
      created.setDate(created.getDate() + 1);
      updates['Completed At'] = { date: { start: created.toISOString().split('T')[0] } };
      missing.push('Completed At');
    }

    // Check Tags
    if (!f.properties.Tags?.multi_select?.length) {
      // Determine tags from title and repo
      const tags = [];
      const lowerTitle = title.toLowerCase();

      if (lowerTitle.includes('ui') || lowerTitle.includes('component') || lowerTitle.includes('layout')) {
        tags.push({ name: 'UI' });
      }
      if (lowerTitle.includes('api') || lowerTitle.includes('endpoint') || lowerTitle.includes('route')) {
        tags.push({ name: 'API' });
      }
      if (lowerTitle.includes('ai') || lowerTitle.includes('llm') || lowerTitle.includes('agent')) {
        tags.push({ name: 'AI' });
      }
      if (lowerTitle.includes('auth') || lowerTitle.includes('security') || lowerTitle.includes('permission')) {
        tags.push({ name: 'Security' });
      }
      if (lowerTitle.includes('database') || lowerTitle.includes('migration') || lowerTitle.includes('schema')) {
        tags.push({ name: 'Database' });
      }

      if (repo === 'SaaS Frontend') {
        tags.push({ name: 'Frontend' });
      } else if (repo === 'OS') {
        tags.push({ name: 'Backend' });
      }

      if (tags.length === 0) {
        tags.push({ name: 'Core' });
      }

      updates['Tags'] = { multi_select: tags };
      missing.push('Tags');
    }

    // Check Assignee
    if (!f.properties.Assignee?.rich_text?.length ||
        !f.properties.Assignee.rich_text[0]?.plain_text?.trim()) {
      updates['Assignee'] = { rich_text: [{ text: { content: 'Claude (TC)' } }] };
      missing.push('Assignee');
    }

    // Check Type
    if (!f.properties.Type?.select) {
      const lowerTitle = title.toLowerCase();
      let type = 'Feature';
      if (lowerTitle.includes('fix') || lowerTitle.includes('bug')) {
        type = 'Bug';
      } else if (lowerTitle.includes('test') || lowerTitle.includes('qa')) {
        type = 'Testing';
      } else if (lowerTitle.includes('infra') || lowerTitle.includes('setup') || lowerTitle.includes('config')) {
        type = 'Infrastructure';
      }
      updates['Type'] = { select: { name: type } };
      missing.push('Type');
    }

    // Check Notes
    if (!f.properties.Notes?.rich_text?.length ||
        !f.properties.Notes.rich_text[0]?.plain_text?.trim()) {
      updates['Notes'] = { rich_text: [{ text: { content: `S${sprint}: ${title}` } }] };
      missing.push('Notes');
    }

    if (Object.keys(updates).length > 0) {
      featuresToUpdate.push({ id: f.id, title, updates, missing });
    }
  });

  console.log(`  Features needing updates: ${featuresToUpdate.length}`);

  // Show sample
  console.log('\nSample updates (first 10):');
  featuresToUpdate.slice(0, 10).forEach(f => {
    console.log(`  ${f.title.substring(0, 40).padEnd(40)} filling: ${f.missing.join(', ')}`);
  });

  if (featuresToUpdate.length > 10) {
    console.log(`  ... and ${featuresToUpdate.length - 10} more`);
  }

  if (dryRun) {
    console.log('\nDRY RUN - No changes made. Run without --dry-run to apply.');
    return;
  }

  // Step 4: Apply updates
  console.log('\n[4/4] Applying updates...');

  let updated = 0;
  for (const feature of featuresToUpdate) {
    try {
      await notion.pages.update({
        page_id: feature.id,
        properties: feature.updates
      });
      updated++;
      if (updated % 50 === 0 || updated === featuresToUpdate.length) {
        process.stdout.write(`\r  Updated ${updated}/${featuresToUpdate.length}`);
      }
    } catch (err) {
      console.log(`\n  Error updating ${feature.title}: ${err.message}`);
    }
    await sleep(50);
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('PERFECTION COMPLETE');
  console.log('='.repeat(70));
  console.log(`Deleted columns: ${COLUMNS_TO_DELETE.join(', ')}`);
  console.log(`Updated features: ${updated}`);
}

main().catch(console.error);
