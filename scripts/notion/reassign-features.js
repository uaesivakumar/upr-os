#!/usr/bin/env node
/**
 * reassign-features.js - Reassign features to sprints by matching Repo
 *
 * Strategy:
 * 1. Get all features grouped by Repo
 * 2. Get all sprints grouped by Repo
 * 3. For each repo, distribute features across sprints of that repo
 * 4. Ensure every sprint has features
 */

import { Client } from '@notionhq/client';

const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';
const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

async function fetchAll(notion, dbId) {
  const all = [];
  let cursor = undefined;
  do {
    const response = await notion.databases.query({
      database_id: dbId,
      start_cursor: cursor
    });
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
  console.log(dryRun ? 'REASSIGN FEATURES (DRY RUN)' : 'REASSIGN FEATURES');
  console.log('='.repeat(70));

  // Fetch all data
  console.log('\n[1/4] Fetching sprints and features...');
  const [sprints, features] = await Promise.all([
    fetchAll(notion, SPRINTS_DB),
    fetchAll(notion, FEATURES_DB)
  ]);

  console.log(`  Sprints: ${sprints.length}`);
  console.log(`  Features: ${features.length}`);

  // Group sprints by Repo
  console.log('\n[2/4] Grouping by Repo...');

  const sprintsByRepo = {};
  sprints.forEach(s => {
    const title = s.properties.Sprint?.title?.[0]?.plain_text || '';
    const match = title.match(/^S(\d+):/);
    const num = match ? parseInt(match[1]) : 0;
    const repo = s.properties.Repo?.select?.name || 'OS';

    if (!sprintsByRepo[repo]) sprintsByRepo[repo] = [];
    sprintsByRepo[repo].push({ id: s.id, num, title });
  });

  // Sort sprints by number within each repo
  Object.keys(sprintsByRepo).forEach(repo => {
    sprintsByRepo[repo].sort((a, b) => a.num - b.num);
  });

  console.log('  Sprints by repo:');
  Object.entries(sprintsByRepo).forEach(([repo, list]) => {
    console.log(`    ${repo}: ${list.length} sprints (S${list[0]?.num}-S${list[list.length-1]?.num})`);
  });

  // Group features by Repo
  const featuresByRepo = {};
  features.forEach(f => {
    const repo = f.properties.Repo?.select?.name || 'OS';
    const title = f.properties.Features?.title?.[0]?.plain_text || '';
    const currentSprint = f.properties.Sprint?.number;

    if (!featuresByRepo[repo]) featuresByRepo[repo] = [];
    featuresByRepo[repo].push({ id: f.id, title, currentSprint });
  });

  console.log('  Features by repo:');
  Object.entries(featuresByRepo).forEach(([repo, list]) => {
    console.log(`    ${repo}: ${list.length} features`);
  });

  // Calculate distribution
  console.log('\n[3/4] Calculating distribution...');

  const assignments = [];

  Object.entries(featuresByRepo).forEach(([repo, repoFeatures]) => {
    const repoSprints = sprintsByRepo[repo] || [];

    if (repoSprints.length === 0) {
      console.log(`  WARNING: No sprints for repo ${repo}, skipping ${repoFeatures.length} features`);
      return;
    }

    // Distribute features evenly across sprints
    const featuresPerSprint = Math.ceil(repoFeatures.length / repoSprints.length);

    console.log(`  ${repo}: ${repoFeatures.length} features / ${repoSprints.length} sprints = ~${featuresPerSprint} per sprint`);

    repoFeatures.forEach((feature, i) => {
      const sprintIndex = Math.floor(i / featuresPerSprint);
      const targetSprint = repoSprints[Math.min(sprintIndex, repoSprints.length - 1)];

      if (feature.currentSprint !== targetSprint.num) {
        assignments.push({
          featureId: feature.id,
          featureTitle: feature.title,
          oldSprint: feature.currentSprint,
          newSprint: targetSprint.num,
          repo
        });
      }
    });
  });

  console.log(`\n  Features to reassign: ${assignments.length}`);

  // Show sample
  console.log('\nSample reassignments (first 10):');
  assignments.slice(0, 10).forEach(a => {
    console.log(`  S${a.oldSprint} → S${a.newSprint} [${a.repo}]: ${a.featureTitle.substring(0, 40)}`);
  });

  if (assignments.length > 10) {
    console.log(`  ... and ${assignments.length - 10} more`);
  }

  // Verify distribution
  console.log('\nNew distribution preview:');
  const newCounts = {};

  // Count unchanged features
  features.forEach(f => {
    const repo = f.properties.Repo?.select?.name || 'OS';
    const currentSprint = f.properties.Sprint?.number;
    const assignment = assignments.find(a => a.featureId === f.id);
    const finalSprint = assignment ? assignment.newSprint : currentSprint;

    const key = `${repo}-S${finalSprint}`;
    newCounts[key] = (newCounts[key] || 0) + 1;
  });

  // Show distribution per repo
  ['OS', 'SaaS Frontend', 'Super Admin'].forEach(repo => {
    const repoSprints = sprintsByRepo[repo] || [];
    if (repoSprints.length === 0) return;

    console.log(`\n  ${repo}:`);
    let totalForRepo = 0;
    repoSprints.forEach(s => {
      const count = newCounts[`${repo}-S${s.num}`] || 0;
      totalForRepo += count;
    });
    console.log(`    Total features: ${totalForRepo}`);
    console.log(`    Sprints: ${repoSprints.length}`);
    console.log(`    Avg per sprint: ${(totalForRepo / repoSprints.length).toFixed(1)}`);
  });

  if (dryRun) {
    console.log('\nDRY RUN - No changes made. Run without --dry-run to apply.');
    return;
  }

  // Apply updates
  console.log('\n[4/4] Applying reassignments...');

  let updated = 0;
  for (const assignment of assignments) {
    try {
      await notion.pages.update({
        page_id: assignment.featureId,
        properties: {
          Sprint: { number: assignment.newSprint }
        }
      });
      updated++;
      if (updated % 50 === 0 || updated === assignments.length) {
        process.stdout.write(`\r  Updated ${updated}/${assignments.length}`);
      }
    } catch (err) {
      console.log(`\n  Error updating ${assignment.featureTitle}: ${err.message}`);
    }
    await sleep(50);
  }

  console.log('\n\n' + '='.repeat(70));
  console.log('REASSIGNMENT COMPLETE');
  console.log('='.repeat(70));
  console.log(`Reassigned: ${updated} features`);
}

main().catch(console.error);
