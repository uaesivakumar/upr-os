#!/usr/bin/env node
/**
 * reorder-columns-v2.js - Reorder columns by renaming → recreating → migrating
 *
 * Strategy:
 * 1. For each column (in desired order, excluding title):
 *    a. Read all current data for that column
 *    b. Rename column to _temp_<name>
 *    c. Create new column with original name (appears at end = new position)
 *    d. Copy data from temp to new
 *    e. Delete temp column
 *
 * This effectively moves columns to the end in the order we process them.
 */

import { Client } from '@notionhq/client';

const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';

// Desired column order (Sprint/title is first and can't be moved via API)
const COLUMNS_TO_REORDER = [
  'Repo',            // 2. Classification
  'Status',          // 3. State
  'Goal',            // 4. Objective
  'Sprint Notes',    // 5. Context
  'Highlights',      // 6. Key features
  'Outcomes',        // 7. Deliverables
  'Business Value',  // 8. Impact
  'Learnings',       // 9. Insights
  'Branch',          // 10. Git branch
  'Commit',          // 11. Commit ref
  'Git Tag',         // 12. Tag
  'Started At',      // 13. Start
  'Completed At',    // 14. End
  'Synced At',       // 15. Sync
  'Phases Updated',  // 16. Phases
  'Commits Count',   // 17. Count
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getAllPages(notion, dbId) {
  const all = [];
  let cursor;
  do {
    const response = await notion.databases.query({
      database_id: dbId,
      start_cursor: cursor,
      page_size: 100
    });
    all.push(...response.results);
    cursor = response.next_cursor;
  } while (cursor);
  return all;
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
  console.log(dryRun ? 'REORDER COLUMNS V2 (DRY RUN)' : 'REORDER COLUMNS V2');
  console.log('='.repeat(70));

  // Get current schema
  console.log('\n[1/4] Fetching current schema...');
  const db = await notion.databases.retrieve({ database_id: SPRINTS_DB });

  const currentProps = {};
  for (const [name, prop] of Object.entries(db.properties)) {
    currentProps[name] = prop;
  }
  console.log('Current order:', Object.keys(currentProps).join(', '));

  // Fetch all pages with data
  console.log('\n[2/4] Fetching all sprint data...');
  const pages = await getAllPages(notion, SPRINTS_DB);
  console.log(`  Found ${pages.length} sprints`);

  if (dryRun) {
    console.log('\n[DRY RUN] Would reorder columns in this order:');
    console.log('  1. Sprint (title - stays first)');
    COLUMNS_TO_REORDER.forEach((col, i) => {
      console.log(`  ${i + 2}. ${col}`);
    });
    console.log('\nRun without --dry-run to apply.');
    return;
  }

  // Process each column
  console.log('\n[3/4] Reordering columns...');

  for (const colName of COLUMNS_TO_REORDER) {
    const prop = currentProps[colName];
    if (!prop) {
      console.log(`  Skipping ${colName} (not found)`);
      continue;
    }

    process.stdout.write(`  Processing ${colName}...`);

    try {
      // Step 1: Create temp column name
      const tempName = `_temp_${colName}`;

      // Step 2: Rename original to temp
      await notion.databases.update({
        database_id: SPRINTS_DB,
        properties: {
          [colName]: { name: tempName }
        }
      });
      await sleep(300);

      // Step 3: Create new column with original name (using same type)
      let newPropDef = {};
      switch (prop.type) {
        case 'select':
          newPropDef = { select: { options: prop.select.options } };
          break;
        case 'multi_select':
          newPropDef = { multi_select: { options: prop.multi_select.options } };
          break;
        case 'rich_text':
          newPropDef = { rich_text: {} };
          break;
        case 'number':
          newPropDef = { number: { format: prop.number?.format || 'number' } };
          break;
        case 'date':
          newPropDef = { date: {} };
          break;
        case 'checkbox':
          newPropDef = { checkbox: {} };
          break;
        default:
          console.log(` skipped (unknown type: ${prop.type})`);
          // Rename back
          await notion.databases.update({
            database_id: SPRINTS_DB,
            properties: { [tempName]: { name: colName } }
          });
          continue;
      }

      await notion.databases.update({
        database_id: SPRINTS_DB,
        properties: { [colName]: newPropDef }
      });
      await sleep(300);

      // Step 4: Copy data from temp to new for all pages
      for (const page of pages) {
        const tempProp = page.properties[tempName] || page.properties[colName];
        if (!tempProp) continue;

        let newValue = null;

        switch (prop.type) {
          case 'select':
            if (tempProp.select) {
              newValue = { select: { name: tempProp.select.name } };
            }
            break;
          case 'multi_select':
            if (tempProp.multi_select?.length) {
              newValue = { multi_select: tempProp.multi_select.map(s => ({ name: s.name })) };
            }
            break;
          case 'rich_text':
            if (tempProp.rich_text?.length) {
              newValue = { rich_text: tempProp.rich_text.map(rt => ({ text: { content: rt.plain_text } })) };
            }
            break;
          case 'number':
            if (tempProp.number !== null) {
              newValue = { number: tempProp.number };
            }
            break;
          case 'date':
            if (tempProp.date) {
              newValue = { date: { start: tempProp.date.start, end: tempProp.date.end } };
            }
            break;
          case 'checkbox':
            newValue = { checkbox: tempProp.checkbox };
            break;
        }

        if (newValue) {
          await notion.pages.update({
            page_id: page.id,
            properties: { [colName]: newValue }
          });
        }
        await sleep(50); // Rate limit
      }

      // Step 5: Delete temp column
      await notion.databases.update({
        database_id: SPRINTS_DB,
        properties: { [tempName]: null }
      });
      await sleep(300);

      console.log(' done');
    } catch (err) {
      console.log(` error: ${err.message}`);
    }
  }

  // Verify new order
  console.log('\n[4/4] Verifying new order...');
  const dbAfter = await notion.databases.retrieve({ database_id: SPRINTS_DB });
  console.log('New order:', Object.keys(dbAfter.properties).join(', '));

  console.log('\n' + '='.repeat(70));
  console.log('REORDER COMPLETE');
  console.log('='.repeat(70));
}

main().catch(console.error);
