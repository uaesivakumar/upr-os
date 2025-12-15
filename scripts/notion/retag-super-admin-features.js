#!/usr/bin/env node
/**
 * retag-super-admin-features.js - Re-tag features that should be Super Admin
 *
 * These features are incorrectly tagged as OS or SaaS Frontend but should be Super Admin:
 * - Vertical config, vertical management
 * - Admin panel, admin dashboard
 * - Persona editor
 * - Territory management
 * - Multi-tenant, tenant management
 * - Sub-vertical management
 * - Config editor, config dashboard
 */

import { Client } from '@notionhq/client';

const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';
const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

// Keywords that indicate Super Admin features
const SUPER_ADMIN_KEYWORDS = [
  'super admin', 'superadmin', 'super-admin',
  'vertical config', 'verticalconfig', 'vertical-config',
  'admin panel', 'admin dashboard',
  'tenant', 'multi-tenant',
  'persona editor', 'persona management',
  'territory management', 'territory config',
  'vertical management', 'sub-vertical', 'subvertical',
  'config editor', 'config dashboard',
  'vertical selection', 'vertical dropdown',
  'region management', 'region config'
];

// Additional keywords in title that strongly suggest Super Admin
const STRONG_TITLE_KEYWORDS = [
  'vertical', 'persona', 'territory', 'tenant', 'config'
];

async function fetchAll(notion, dbId) {
  const all = [];
  let cursor = undefined;
  do {
    const response = await notion.databases.query({ database_id: dbId, start_cursor: cursor });
    all.push(...response.results);
    cursor = response.next_cursor || undefined;
  } while (cursor);
  return all;
}

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
  console.log(dryRun ? 'RETAG SUPER ADMIN FEATURES (DRY RUN)' : 'RETAG SUPER ADMIN FEATURES');
  console.log('='.repeat(70));

  // Fetch all data
  console.log('\n[1/5] Fetching sprints and features...');
  const [sprints, features] = await Promise.all([
    fetchAll(notion, SPRINTS_DB),
    fetchAll(notion, FEATURES_DB)
  ]);

  console.log(`  Sprints: ${sprints.length}`);
  console.log(`  Features: ${features.length}`);

  // Get Super Admin sprints
  console.log('\n[2/5] Identifying Super Admin sprints...');
  const superAdminSprints = sprints
    .filter(s => s.properties.Repo?.select?.name === 'Super Admin')
    .map(s => {
      const title = s.properties.Sprint?.title?.[0]?.plain_text || '';
      const match = title.match(/^S(\d+):/);
      return {
        id: s.id,
        num: match ? parseInt(match[1]) : 0,
        title
      };
    })
    .sort((a, b) => a.num - b.num);

  console.log(`  Found ${superAdminSprints.length} Super Admin sprints:`);
  superAdminSprints.forEach(s => console.log(`    S${s.num}: ${s.title.substring(0, 50)}`));

  // Find features that should be Super Admin
  console.log('\n[3/5] Identifying features to retag...');

  const featuresToRetag = features.filter(f => {
    const currentRepo = f.properties.Repo?.select?.name || '';
    // Skip if already Super Admin
    if (currentRepo === 'Super Admin') return false;

    const title = (f.properties.Features?.title?.[0]?.plain_text || '').toLowerCase();
    const notes = (f.properties.Notes?.rich_text?.[0]?.plain_text || '').toLowerCase();
    const combined = title + ' ' + notes;

    // Check for super admin keywords
    const hasKeyword = SUPER_ADMIN_KEYWORDS.some(kw => combined.includes(kw));

    // Check for strong title keywords
    const hasStrongKeyword = STRONG_TITLE_KEYWORDS.some(kw => title.includes(kw));

    return hasKeyword || hasStrongKeyword;
  }).map(f => ({
    id: f.id,
    title: f.properties.Features?.title?.[0]?.plain_text || '',
    currentRepo: f.properties.Repo?.select?.name || 'Not set',
    currentSprint: f.properties.Sprint?.number
  }));

  console.log(`  Found ${featuresToRetag.length} features to retag as Super Admin`);

  // Show all features to retag
  console.log('\nFeatures to retag:');
  featuresToRetag.forEach(f => {
    console.log(`  [${f.currentRepo}] S${f.currentSprint}: ${f.title.substring(0, 50)}`);
  });

  // Calculate distribution across Super Admin sprints
  console.log('\n[4/5] Calculating distribution...');

  if (superAdminSprints.length === 0) {
    console.log('  ERROR: No Super Admin sprints found!');
    return;
  }

  const featuresPerSprint = Math.ceil(featuresToRetag.length / superAdminSprints.length);
  console.log(`  ${featuresToRetag.length} features / ${superAdminSprints.length} sprints = ~${featuresPerSprint} per sprint`);

  // Assign features to sprints
  const assignments = featuresToRetag.map((feature, i) => {
    const sprintIndex = Math.floor(i / featuresPerSprint);
    const targetSprint = superAdminSprints[Math.min(sprintIndex, superAdminSprints.length - 1)];
    return {
      ...feature,
      newRepo: 'Super Admin',
      newSprint: targetSprint.num
    };
  });

  // Preview distribution
  console.log('\nDistribution preview:');
  superAdminSprints.forEach(s => {
    const count = assignments.filter(a => a.newSprint === s.num).length;
    console.log(`  S${s.num}: ${count} features`);
  });

  if (dryRun) {
    console.log('\nDRY RUN - No changes made. Run without --dry-run to apply.');
    return;
  }

  // Apply updates
  console.log('\n[5/5] Applying updates...');

  let updated = 0;
  for (const assignment of assignments) {
    try {
      await notion.pages.update({
        page_id: assignment.id,
        properties: {
          Repo: { select: { name: 'Super Admin' } },
          Sprint: { number: assignment.newSprint }
        }
      });
      updated++;
      if (updated % 10 === 0 || updated === assignments.length) {
        process.stdout.write(`\r  Updated ${updated}/${assignments.length}`);
      }
    } catch (err) {
      console.log(`\n  Error updating ${assignment.title}: ${err.message}`);
    }
    await sleep(100);
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('RETAG COMPLETE');
  console.log('='.repeat(70));
  console.log(`Retagged: ${updated} features as Super Admin`);
  console.log(`Distributed across: ${superAdminSprints.length} sprints`);
}

main().catch(console.error);
