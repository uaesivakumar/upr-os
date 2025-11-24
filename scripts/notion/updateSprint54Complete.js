/**
 * Update Sprint 54 as Complete in Notion
 * Updates both Sprints and Module Features databases
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function updateSprint54() {
  console.log('Updating Sprint 54 in Notion...\n');

  const completedAt = new Date().toISOString().split('T')[0];
  const commitHash = 'c89d9db';

  // 1. Find and update Sprint 54 in Sprints database
  const sprintsQuery = await notion.databases.query({
    database_id: dbIds.sprints_db_id,
    filter: {
      property: 'Sprint',
      title: { contains: '54' }
    }
  });

  if (sprintsQuery.results.length > 0) {
    const sprintPage = sprintsQuery.results[0];
    console.log('Found Sprint 54:', sprintPage.id);

    await notion.pages.update({
      page_id: sprintPage.id,
      properties: {
        'Status': { select: { name: 'Done' } },
        'Completed At': { date: { start: completedAt } },
        'Commit': { rich_text: [{ text: { content: commitHash } }] },
        'Commits Count': { number: 1 },
        'Outcomes': { rich_text: [{ text: { content: '131 tests, 9 new files, 10 SIVA tools, 690 total tests passing' } }] },
        'Highlights': { rich_text: [{ text: { content: 'Command Palette, Copilot Suggestions, Alert System, Form Auto-Fill, SIVA Tool Registry' } }] },
      }
    });
    console.log('✓ Sprint 54 marked as Done\n');
  } else {
    console.log('Sprint 54 not found in Sprints database\n');
  }

  // 2. Update Module Features for Sprint 54 features
  const sprint54Features = [
    { name: 'Command Palette (Cmd+K)', type: 'Feature', complexity: 'Medium' },
    { name: 'Inline Copilot Suggestions', type: 'Feature', complexity: 'Medium' },
    { name: 'Proactive Alert System', type: 'Feature', complexity: 'Medium' },
    { name: 'Smart Form Auto-Fill', type: 'Feature', complexity: 'Medium' },
    { name: 'Unified Stream Manager', type: 'Infrastructure', complexity: 'High' },
    { name: 'Offline Message Queue', type: 'Infrastructure', complexity: 'High' },
    { name: 'SIVA Event Router', type: 'Infrastructure', complexity: 'Medium' },
    { name: 'SIVA Tool Registry (10 tools)', type: 'Feature', complexity: 'High' },
  ];

  console.log('Updating Module Features...');

  for (const feature of sprint54Features) {
    const query = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Features',
        title: { contains: feature.name.substring(0, 15) }
      }
    });

    if (query.results.length > 0) {
      await notion.pages.update({
        page_id: query.results[0].id,
        properties: {
          'Status': { select: { name: 'Done' } },
          'Done?': { checkbox: true },
          'Completed At': { date: { start: completedAt } },
          'Sprint': { number: 54 },
        }
      });
      console.log(`  ✓ Updated: ${feature.name}`);
    } else {
      // Create new feature entry
      await notion.pages.create({
        parent: { database_id: dbIds.module_features_db_id },
        properties: {
          'Features': { title: [{ text: { content: feature.name } }] },
          'Status': { select: { name: 'Done' } },
          'Done?': { checkbox: true },
          'Sprint': { number: 54 },
          'Completed At': { date: { start: completedAt } },
          'Type': { select: { name: feature.type } },
          'Complexity': { select: { name: feature.complexity } },
          'Tags': { multi_select: [{ name: 'Chat' }, { name: 'UPR2030' }] },
        }
      });
      console.log(`  + Created: ${feature.name}`);
    }
  }

  console.log('\n✓ All Sprint 54 updates complete!');
}

updateSprint54().catch(console.error);
