#!/usr/bin/env node
/**
 * Update Sprint 57 and 58 in Notion Sprints database
 */
import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Query Sprint 57 and 58
const response = await notion.databases.query({
  database_id: dbIds.sprints_db_id,
  filter: {
    or: [
      { property: 'Sprint', title: { contains: '57' } },
      { property: 'Sprint', title: { contains: '58' } }
    ]
  }
});

console.log('Found sprints:', response.results.length);
response.results.forEach(page => {
  const sprint = page.properties['Sprint']?.title?.[0]?.plain_text || 'No sprint';
  const status = page.properties['Status']?.select?.name || 'No status';
  console.log('  ' + sprint + ' [' + status + ']');
});

// Sprint data to update
const sprintData = {
  '57': {
    goal: 'Advanced Filter System - Intelligent search and filter capabilities for lead management',
    highlights: 'Visual Filter Builder, Smart Filter Suggestions, Boolean Query Support, Filter Chat Integration',
    outcomes: 'Complete filter system with 7 features, NLU integration, saved searches, export functionality',
    status: 'Completed'
  },
  '58': {
    goal: 'Workflow Automation Engine - Visual workflow builder with triggers, conditions, and actions',
    highlights: 'Drag-drop Workflow Builder, Cron Scheduling, NLU Chat Commands, Execution History & Audit Trail',
    outcomes: 'Full workflow automation system with 7 features, 385 tests (100% pass rate)',
    status: 'Completed'
  }
};

for (const page of response.results) {
  const sprintTitle = page.properties['Sprint']?.title?.[0]?.plain_text || '';
  const sprintNum = sprintTitle.match(/Sprint\s*(\d+)/)?.[1];
  
  if (sprintNum && sprintData[sprintNum]) {
    const data = sprintData[sprintNum];
    console.log('\nUpdating Sprint ' + sprintNum + '...');
    
    await notion.pages.update({
      page_id: page.id,
      properties: {
        'Status': { select: { name: data.status } },
        'Goal': { rich_text: [{ text: { content: data.goal } }] },
        'Highlights': { rich_text: [{ text: { content: data.highlights } }] },
        'Outcomes': { rich_text: [{ text: { content: data.outcomes } }] },
        'Completed At': { date: { start: new Date().toISOString().split('T')[0] } }
      }
    });
    
    console.log('  Updated Sprint ' + sprintNum + ' successfully!');
  }
}
