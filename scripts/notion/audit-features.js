#!/usr/bin/env node
/**
 * audit-features.js - Analyze Features database for missing values and column usage
 */

import { Client } from '@notionhq/client';

const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN not set');
    process.exit(1);
  }

  const notion = new Client({ auth: token });

  console.log('='.repeat(70));
  console.log('FEATURES DATABASE AUDIT');
  console.log('='.repeat(70));

  // Get database schema
  console.log('\n[1/3] Fetching database schema...');
  const db = await notion.databases.retrieve({ database_id: FEATURES_DB });

  const schema = {};
  for (const [name, prop] of Object.entries(db.properties)) {
    schema[name] = { type: prop.type, id: prop.id };
  }

  console.log('\nAll columns:');
  Object.entries(schema).forEach(([name, info]) => {
    console.log(`  ${name.padEnd(20)} (${info.type})`);
  });

  // Fetch all features
  console.log('\n[2/3] Fetching all features...');
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

  // Analyze column usage
  console.log('\n[3/3] Analyzing column usage...');

  const columnStats = {};
  for (const col of Object.keys(schema)) {
    columnStats[col] = { filled: 0, empty: 0, examples: [] };
  }

  all.forEach(feature => {
    for (const [colName, colInfo] of Object.entries(schema)) {
      const prop = feature.properties[colName];
      let hasValue = false;
      let value = null;

      switch (colInfo.type) {
        case 'title':
          hasValue = prop?.title?.length > 0;
          value = prop?.title?.[0]?.plain_text;
          break;
        case 'rich_text':
          hasValue = prop?.rich_text?.length > 0 && prop.rich_text[0]?.plain_text?.trim().length > 0;
          value = prop?.rich_text?.[0]?.plain_text?.substring(0, 50);
          break;
        case 'select':
          hasValue = prop?.select !== null;
          value = prop?.select?.name;
          break;
        case 'multi_select':
          hasValue = prop?.multi_select?.length > 0;
          value = prop?.multi_select?.map(s => s.name).join(', ');
          break;
        case 'number':
          hasValue = prop?.number !== null;
          value = prop?.number;
          break;
        case 'date':
          hasValue = prop?.date !== null;
          value = prop?.date?.start;
          break;
        case 'checkbox':
          hasValue = true;
          value = prop?.checkbox;
          break;
        case 'relation':
          hasValue = prop?.relation?.length > 0;
          value = `${prop?.relation?.length || 0} relations`;
          break;
        default:
          hasValue = false;
      }

      if (hasValue) {
        columnStats[colName].filled++;
        if (columnStats[colName].examples.length < 3 && value) {
          columnStats[colName].examples.push(value);
        }
      } else {
        columnStats[colName].empty++;
      }
    }
  });

  // Report
  console.log('\n' + '='.repeat(70));
  console.log('COLUMN USAGE REPORT');
  console.log('='.repeat(70));

  const total = all.length;

  const sorted = Object.entries(columnStats).sort((a, b) => {
    const rateA = a[1].filled / total;
    const rateB = b[1].filled / total;
    return rateA - rateB;
  });

  console.log('\n' + 'Column'.padEnd(22) + 'Filled'.padStart(8) + 'Empty'.padStart(8) + '  Fill%  Examples');
  console.log('-'.repeat(70));

  const emptyColumns = [];
  const lowFillColumns = [];

  sorted.forEach(([name, stats]) => {
    const fillRate = ((stats.filled / total) * 100).toFixed(0);
    const examples = stats.examples.slice(0, 2).map(e => String(e).substring(0, 15)).join(' | ');
    console.log(
      name.padEnd(22) +
      String(stats.filled).padStart(8) +
      String(stats.empty).padStart(8) +
      `  ${fillRate.padStart(3)}%  ` +
      examples
    );

    if (stats.filled === 0) {
      emptyColumns.push(name);
    } else if (stats.filled < total * 0.1) {
      lowFillColumns.push({ name, filled: stats.filled, empty: stats.empty });
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(70));

  if (emptyColumns.length > 0) {
    console.log('\n🗑️  COLUMNS TO DELETE (0% filled):');
    emptyColumns.forEach(c => console.log(`  - ${c}`));
  }

  if (lowFillColumns.length > 0) {
    console.log('\n⚠️  LOW FILL COLUMNS (<10% filled):');
    lowFillColumns.forEach(c => console.log(`  - ${c.name} (${c.filled}/${total} filled)`));
  }

  // Repo distribution
  console.log('\n' + '='.repeat(70));
  console.log('REPO DISTRIBUTION');
  console.log('='.repeat(70));

  const repoCount = {};
  all.forEach(f => {
    const repo = f.properties.Repo?.select?.name || 'Not set';
    repoCount[repo] = (repoCount[repo] || 0) + 1;
  });
  Object.entries(repoCount).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

main().catch(console.error);
