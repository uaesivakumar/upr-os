#!/usr/bin/env node
/**
 * add-repo-column.js
 *
 * Adds "Repo" column to Sprints and Features databases and migrates existing entries.
 * This creates a single source of truth across OS, SaaS Frontend, and Super Admin.
 *
 * Usage:
 *   export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)
 *   node scripts/notion/add-repo-column.js
 */

import { Client } from '@notionhq/client';

const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';
const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

const REPO_OPTIONS = ['OS', 'SaaS Frontend', 'Super Admin'];

// Known OS sprints/features patterns (branches, tags, etc.)
const OS_PATTERNS = [
  /feat\/s\d+-/i,           // feat/s50-xxx
  /^s\d+:/i,                // S50: xxx
  /api/i,                   // API-related
  /siva/i,                  // SIVA features
  /llm/i,                   // LLM features
  /scoring/i,               // Scoring
  /provider/i,              // Provider features
  /mcp/i,                   // MCP features
  /vertical/i,              // Vertical config
];

// Known SaaS patterns
const SAAS_PATTERNS = [
  /dashboard/i,
  /ui\s*component/i,
  /frontend/i,
  /page/i,
  /layout/i,
  /animation/i,
  /framer/i,
  /tailwind/i,
  /react/i,
];

// Super Admin patterns
const SUPER_ADMIN_PATTERNS = [
  /super\s*admin/i,
  /admin\s*panel/i,
  /command\s*center/i,
  /ai\s*admin/i,
];

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('Error: NOTION_TOKEN not set');
    console.error('Run: export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)');
    process.exit(1);
  }

  const notion = new Client({ auth: token });

  console.log('='.repeat(60));
  console.log('NOTION REPO COLUMN MIGRATION');
  console.log('='.repeat(60));

  // Step 1: Check if Repo property already exists
  console.log('\n[1/4] Checking database schemas...');

  const sprintsDb = await notion.databases.retrieve({ database_id: SPRINTS_DB });
  const featuresDb = await notion.databases.retrieve({ database_id: FEATURES_DB });

  const sprintsHasRepo = 'Repo' in sprintsDb.properties;
  const featuresHasRepo = 'Repo' in featuresDb.properties;

  console.log(`  Sprints DB has Repo column: ${sprintsHasRepo}`);
  console.log(`  Features DB has Repo column: ${featuresHasRepo}`);

  // Step 2: Add Repo property if missing
  console.log('\n[2/4] Adding Repo column to databases...');

  if (!sprintsHasRepo) {
    await notion.databases.update({
      database_id: SPRINTS_DB,
      properties: {
        'Repo': {
          select: {
            options: REPO_OPTIONS.map(name => ({ name, color: getColorForRepo(name) }))
          }
        }
      }
    });
    console.log('  ✓ Added Repo column to Sprints DB');
  } else {
    console.log('  - Sprints DB already has Repo column');
  }

  if (!featuresHasRepo) {
    await notion.databases.update({
      database_id: FEATURES_DB,
      properties: {
        'Repo': {
          select: {
            options: REPO_OPTIONS.map(name => ({ name, color: getColorForRepo(name) }))
          }
        }
      }
    });
    console.log('  ✓ Added Repo column to Features DB');
  } else {
    console.log('  - Features DB already has Repo column');
  }

  // Step 3: Fetch all entries and classify them
  console.log('\n[3/4] Fetching and classifying entries...');

  const sprints = await fetchAllPages(notion, SPRINTS_DB);
  const features = await fetchAllPages(notion, FEATURES_DB);

  console.log(`  Found ${sprints.length} sprints`);
  console.log(`  Found ${features.length} features`);

  // Step 4: Update entries with Repo classification
  console.log('\n[4/4] Updating entries with Repo classification...');

  let sprintStats = { os: 0, saas: 0, superadmin: 0, unknown: 0 };
  let featureStats = { os: 0, saas: 0, superadmin: 0, unknown: 0 };

  // Update sprints
  for (const sprint of sprints) {
    const currentRepo = sprint.properties.Repo?.select?.name;
    if (currentRepo) {
      // Already classified
      continue;
    }

    const title = getTitle(sprint);
    const branch = sprint.properties.Branch?.rich_text?.[0]?.plain_text || '';
    const notes = sprint.properties['Sprint Notes']?.rich_text?.[0]?.plain_text || '';

    const repo = classifyEntry(title + ' ' + branch + ' ' + notes);

    await notion.pages.update({
      page_id: sprint.id,
      properties: {
        'Repo': { select: { name: repo } }
      }
    });

    if (repo === 'OS') sprintStats.os++;
    else if (repo === 'SaaS Frontend') sprintStats.saas++;
    else if (repo === 'Super Admin') sprintStats.superadmin++;
    else sprintStats.unknown++;

    console.log(`  Sprint: ${title.substring(0, 40)}... → ${repo}`);
  }

  // Update features
  for (const feature of features) {
    const currentRepo = feature.properties.Repo?.select?.name;
    if (currentRepo) {
      // Already classified
      continue;
    }

    const title = getTitle(feature);
    const notes = feature.properties.Notes?.rich_text?.[0]?.plain_text || '';
    const tags = feature.properties.Tags?.multi_select?.map(t => t.name).join(' ') || '';

    const repo = classifyEntry(title + ' ' + notes + ' ' + tags);

    await notion.pages.update({
      page_id: feature.id,
      properties: {
        'Repo': { select: { name: repo } }
      }
    });

    if (repo === 'OS') featureStats.os++;
    else if (repo === 'SaaS Frontend') featureStats.saas++;
    else if (repo === 'Super Admin') featureStats.superadmin++;
    else featureStats.unknown++;

    // Rate limit
    await sleep(100);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log('\nSprints classified:');
  console.log(`  OS: ${sprintStats.os}`);
  console.log(`  SaaS Frontend: ${sprintStats.saas}`);
  console.log(`  Super Admin: ${sprintStats.superadmin}`);
  console.log(`  Unknown (defaulted to OS): ${sprintStats.unknown}`);

  console.log('\nFeatures classified:');
  console.log(`  OS: ${featureStats.os}`);
  console.log(`  SaaS Frontend: ${featureStats.saas}`);
  console.log(`  Super Admin: ${featureStats.superadmin}`);
  console.log(`  Unknown (defaulted to OS): ${featureStats.unknown}`);

  console.log('\n✅ All entries now have Repo classification');
  console.log('   View in Notion: Group by "Repo" column to see breakdown');
}

function classifyEntry(text) {
  // Check Super Admin first (most specific)
  for (const pattern of SUPER_ADMIN_PATTERNS) {
    if (pattern.test(text)) return 'Super Admin';
  }

  // Check SaaS patterns
  for (const pattern of SAAS_PATTERNS) {
    if (pattern.test(text)) return 'SaaS Frontend';
  }

  // Check OS patterns
  for (const pattern of OS_PATTERNS) {
    if (pattern.test(text)) return 'OS';
  }

  // Default to OS (backend) for unclassified items
  return 'OS';
}

function getColorForRepo(repo) {
  switch (repo) {
    case 'OS': return 'blue';
    case 'SaaS Frontend': return 'green';
    case 'Super Admin': return 'purple';
    default: return 'gray';
  }
}

function getTitle(page) {
  const titleProp = Object.values(page.properties).find(p => p.type === 'title');
  return titleProp?.title?.[0]?.plain_text || 'Untitled';
}

async function fetchAllPages(notion, databaseId) {
  const pages = [];
  let cursor;

  do {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
    });
    pages.push(...response.results);
    cursor = response.next_cursor;
  } while (cursor);

  return pages;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
