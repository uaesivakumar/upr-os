#!/usr/bin/env node
/**
 * Update Git details for Phase 1.5 Sprints (71-75) in Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const COMMIT_HASH = '99f7a1d821e61274b5f81ca22913e6423769d8a8';
const COMMIT_SHORT = '99f7a1d';
const COMMIT_MESSAGE = 'feat(phase-1.5): Complete Sprints 71-75 - Region Engine & USP Hook Layer';
const BRANCH = 'main';
const GIT_TAG = 'phase-1.5-complete';

// Commit range from Sprint 70 to Phase 1.5
const COMMIT_RANGE = '2be0981..99f7a1d';

const SPRINT_GIT_DETAILS = {
  71: {
    commit: `${COMMIT_SHORT} - Region Engine Registry`,
    commitRange: COMMIT_RANGE,
    branch: BRANCH,
    gitTag: GIT_TAG,
    commitsCount: 8
  },
  72: {
    commit: `${COMMIT_SHORT} - Geo Granularity & Reachability`,
    commitRange: COMMIT_RANGE,
    branch: BRANCH,
    gitTag: GIT_TAG,
    commitsCount: 8
  },
  73: {
    commit: `${COMMIT_SHORT} - Region-Aware Scoring & Timing`,
    commitRange: COMMIT_RANGE,
    branch: BRANCH,
    gitTag: GIT_TAG,
    commitsCount: 9
  },
  74: {
    commit: `${COMMIT_SHORT} - Data Lake v0 + Graph Schema`,
    commitRange: COMMIT_RANGE,
    branch: BRANCH,
    gitTag: GIT_TAG,
    commitsCount: 10
  },
  75: {
    commit: `${COMMIT_SHORT} - USP Hook Layer`,
    commitRange: COMMIT_RANGE,
    branch: BRANCH,
    gitTag: GIT_TAG,
    commitsCount: 9
  }
};

async function updateSprintGitDetails(sprintNum) {
  const details = SPRINT_GIT_DETAILS[sprintNum];
  console.log(`\nUpdating Sprint ${sprintNum} git details...`);

  // Find sprint page
  const sprintPage = await notion.databases.query({
    database_id: dbIds.sprints_db_id,
    filter: { property: 'Sprint', title: { starts_with: `Sprint ${sprintNum}` } }
  });

  if (sprintPage.results.length === 0) {
    console.log(`  Sprint ${sprintNum} not found`);
    return { sprint: sprintNum, updated: false };
  }

  const pageId = sprintPage.results[0].id;

  // Build properties update for git-related fields
  const properties = {
    'Commit': { rich_text: [{ text: { content: details.commit } }] },
    'Commit Range': { rich_text: [{ text: { content: details.commitRange } }] },
    'Branch': { rich_text: [{ text: { content: details.branch } }] },
    'Git Tag': { rich_text: [{ text: { content: details.gitTag } }] },
    'Commits Count': { number: details.commitsCount }
  };

  await notion.pages.update({
    page_id: pageId,
    properties
  });

  console.log(`  Sprint ${sprintNum} git details updated:`);
  console.log(`    - Commit: ${details.commit}`);
  console.log(`    - Commit Range: ${details.commitRange}`);
  console.log(`    - Branch: ${details.branch}`);
  console.log(`    - Git Tag: ${details.gitTag}`);
  console.log(`    - Commits Count: ${details.commitsCount}`);

  return { sprint: sprintNum, updated: true };
}

async function main() {
  console.log('='.repeat(70));
  console.log('PHASE 1.5 GIT DETAILS UPDATE (Sprints 71-75)');
  console.log('='.repeat(70));
  console.log(`\nCommit: ${COMMIT_HASH}`);
  console.log(`Message: ${COMMIT_MESSAGE}`);
  console.log(`Branch: ${BRANCH}`);

  const results = [];

  for (const sprintNum of [71, 72, 73, 74, 75]) {
    const result = await updateSprintGitDetails(sprintNum);
    results.push(result);
    await new Promise(r => setTimeout(r, 300)); // Rate limit
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.updated).length;
  console.log(`Sprints updated with git details: ${successCount}/5`);
  console.log('='.repeat(70));
}

main().catch(console.error);
