#!/usr/bin/env node
/**
 * reorganize-sprints.js
 *
 * Reorganizes the Sprints database:
 * 1. Renumbers all 132 sprints sequentially S1-S132
 * 2. Re-classifies Repo based on better patterns
 *
 * Usage:
 *   export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)
 *   node scripts/notion/reorganize-sprints.js --dry-run  # Preview changes
 *   node scripts/notion/reorganize-sprints.js            # Apply changes
 */

import { Client } from '@notionhq/client';

const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';

// Better classification patterns
const SAAS_PATTERNS = [
  /saas/i,
  /dashboard/i,
  /frontend/i,
  /\bui\b/i,
  /shell/i,
  /page/i,
  /workspace/i,
  /pageless/i,
  /transition sequence/i,
  /layout/i,
  /component/i,
  /animation/i,
  /framer/i,
  /tailwind/i,
  /seo/i,
  /marketing pages/i,
  /pricing/i,
  /legal/i,
  /docs\b/i,
  /landing/i,
  /signup/i,
  /onboarding/i,
  /\[saas\]/i,
  /viewer/i,
  /explorer/i,
  /debugger/i,
  /graph\s*ui/i,
  /smart workspace/i,
  /launch kit/i,
  /growth layer/i,
  /mobile/i,
  /pwa/i,
];

const SUPER_ADMIN_PATTERNS = [
  /super[- ]?admin/i,
  /admin panel/i,
  /admin tools/i,
  /root controls/i,
  /tenant[- ]level controls/i,
];

function classifyRepo(title, notes = '') {
  const text = title + ' ' + notes;

  // Super Admin first (most specific)
  for (const pattern of SUPER_ADMIN_PATTERNS) {
    if (pattern.test(text)) return 'Super Admin';
  }

  // SaaS patterns
  for (const pattern of SAAS_PATTERNS) {
    if (pattern.test(text)) return 'SaaS Frontend';
  }

  // Default to OS
  return 'OS';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN not set');
    process.exit(1);
  }

  const notion = new Client({ auth: token });

  console.log('='.repeat(60));
  console.log(dryRun ? 'REORGANIZE SPRINTS (DRY RUN)' : 'REORGANIZE SPRINTS');
  console.log('='.repeat(60));

  // Fetch all sprints
  console.log('\n[1/3] Fetching all sprints...');
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

  // Extract current sprint numbers and prepare for renumbering
  console.log('\n[2/3] Analyzing and sorting sprints...');

  const sprints = all.map(s => {
    const title = s.properties.Sprint?.title?.[0]?.plain_text || '';
    const notes = s.properties['Sprint Notes']?.rich_text?.[0]?.plain_text || '';
    const goal = s.properties.Goal?.rich_text?.[0]?.plain_text || '';

    // Extract original number
    const match = title.match(/[Ss](?:print\s*)?(\d+)/);
    const originalNum = match ? parseInt(match[1]) : 999;

    // Extract the name part (after the number)
    let name = title
      .replace(/^[Ss](?:print\s*)?\d+[\s:—-]*/i, '')  // Remove S55:, Sprint 55:, S55 —, etc.
      .trim();

    // If no name, use original title
    if (!name) name = title;

    return {
      id: s.id,
      originalTitle: title,
      originalNum,
      name,
      notes,
      goal,
      createdTime: s.created_time,
      currentRepo: s.properties.Repo?.select?.name,
      newRepo: classifyRepo(title + ' ' + name + ' ' + notes + ' ' + goal),
      status: s.properties.Status?.select?.name || 'Backlog'
    };
  });

  // Sort by original number, then by creation time
  sprints.sort((a, b) => {
    if (a.originalNum !== b.originalNum) return a.originalNum - b.originalNum;
    return new Date(a.createdTime) - new Date(b.createdTime);
  });

  // Assign new sequential numbers
  sprints.forEach((s, i) => {
    s.newNum = i + 1;
    s.newTitle = s.name ? `S${s.newNum}: ${s.name}` : `S${s.newNum}`;
  });

  // Show changes
  console.log('\n[3/3] Changes to be made:');
  console.log('');

  const repoChanges = { 'OS': 0, 'SaaS Frontend': 0, 'Super Admin': 0 };
  const titleChanges = [];

  sprints.forEach(s => {
    repoChanges[s.newRepo]++;

    const repoChanged = s.currentRepo !== s.newRepo;
    const titleChanged = s.originalTitle !== s.newTitle;

    if (repoChanged || titleChanged) {
      titleChanges.push(s);
    }
  });

  console.log('New Repo Distribution:');
  Object.entries(repoChanges).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('');

  console.log('Sample changes (first 20):');
  titleChanges.slice(0, 20).forEach(s => {
    const repoMark = s.currentRepo !== s.newRepo ? ` [${s.currentRepo} → ${s.newRepo}]` : '';
    console.log(`  ${s.originalTitle.substring(0, 45).padEnd(45)} → ${s.newTitle.substring(0, 45)}${repoMark}`);
  });

  if (titleChanges.length > 20) {
    console.log(`  ... and ${titleChanges.length - 20} more`);
  }

  console.log('');
  console.log(`Total title changes: ${titleChanges.length}`);
  console.log('');

  if (dryRun) {
    console.log('DRY RUN - No changes made. Run without --dry-run to apply.');
    return;
  }

  // Apply changes
  console.log('Applying changes...');

  for (let i = 0; i < sprints.length; i++) {
    const s = sprints[i];

    const updates = {};

    // Update title
    if (s.originalTitle !== s.newTitle) {
      updates['Sprint'] = { title: [{ text: { content: s.newTitle } }] };
    }

    // Update Repo
    if (s.currentRepo !== s.newRepo) {
      updates['Repo'] = { select: { name: s.newRepo } };
    }

    if (Object.keys(updates).length > 0) {
      await notion.pages.update({
        page_id: s.id,
        properties: updates
      });

      process.stdout.write(`\r  Updated ${i + 1}/${sprints.length}: ${s.newTitle.substring(0, 50)}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 100));
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('REORGANIZATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nAll ${sprints.length} sprints renumbered S1-S${sprints.length}`);
  console.log('\nNew Repo distribution:');
  Object.entries(repoChanges).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

main().catch(console.error);
