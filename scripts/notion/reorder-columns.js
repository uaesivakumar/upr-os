#!/usr/bin/env node
/**
 * reorder-columns.js - Attempt to reorder columns by updating schema in specific order
 *
 * The Notion API doesn't officially support column reordering, but we can try
 * updating all properties in a specific order to see if it affects UI order.
 *
 * If that doesn't work, we'll use the backup approach: rename → recreate → migrate → delete
 */

import { Client } from '@notionhq/client';

const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';

// Desired column order (Sprint title is always first and can't be moved)
const DESIRED_ORDER = [
  'Sprint',          // 1. Title (immovable)
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

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN not set');
    process.exit(1);
  }

  const notion = new Client({ auth: token });

  console.log('='.repeat(70));
  console.log('REORDER COLUMNS');
  console.log('='.repeat(70));

  // Get current schema
  console.log('\n[1/3] Fetching current schema...');
  const db = await notion.databases.retrieve({ database_id: SPRINTS_DB });

  const currentProps = {};
  for (const [name, prop] of Object.entries(db.properties)) {
    currentProps[name] = prop;
  }

  console.log('Current columns:', Object.keys(currentProps).join(', '));

  // Approach 1: Try updating with properties in desired order
  console.log('\n[2/3] Attempting to update schema in desired order...');

  // Build properties object in desired order
  // Note: Object property order in JS is preserved for string keys in modern JS
  const orderedProps = {};

  for (const colName of DESIRED_ORDER) {
    const prop = currentProps[colName];
    if (!prop) {
      console.log(`  Warning: ${colName} not found`);
      continue;
    }

    // We need to specify the property definition, not just copy it
    // The API expects a specific format for updates
    switch (prop.type) {
      case 'title':
        orderedProps[colName] = { title: {} };
        break;
      case 'select':
        orderedProps[colName] = {
          select: { options: prop.select.options }
        };
        break;
      case 'multi_select':
        orderedProps[colName] = {
          multi_select: { options: prop.multi_select.options }
        };
        break;
      case 'rich_text':
        orderedProps[colName] = { rich_text: {} };
        break;
      case 'number':
        orderedProps[colName] = { number: { format: prop.number?.format || 'number' } };
        break;
      case 'date':
        orderedProps[colName] = { date: {} };
        break;
      case 'checkbox':
        orderedProps[colName] = { checkbox: {} };
        break;
      default:
        console.log(`  Unknown type for ${colName}: ${prop.type}`);
    }
  }

  try {
    await notion.databases.update({
      database_id: SPRINTS_DB,
      properties: orderedProps
    });
    console.log('  Schema update attempted.');
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // Verify
  console.log('\n[3/3] Verifying new order...');
  const dbAfter = await notion.databases.retrieve({ database_id: SPRINTS_DB });
  console.log('Columns after update:', Object.keys(dbAfter.properties).join(', '));

  console.log('\n' + '='.repeat(70));
  console.log('NOTE: If columns are still not in desired order in Notion UI,');
  console.log('the API does not support programmatic reordering.');
  console.log('In that case, please manually reorder in Notion.');
  console.log('='.repeat(70));
}

main().catch(console.error);
