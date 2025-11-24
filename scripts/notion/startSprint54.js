#!/usr/bin/env node
/**
 * Start Sprint 54 - Update Notion status
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));

async function startSprint54() {
  console.log('Starting Sprint 54 in Notion...\n');

  // Find Sprint 54
  const response = await notion.databases.query({
    database_id: dbIds.sprints_db_id,
    filter: {
      property: 'Sprint',
      title: { equals: 'Sprint 54' },
    },
  });

  if (response.results.length === 0) {
    console.log('Sprint 54 not found!');
    return;
  }

  const sprintId = response.results[0].id;

  // Update status to In Progress
  await notion.pages.update({
    page_id: sprintId,
    properties: {
      Status: {
        select: { name: 'In Progress' },
      },
    },
  });

  console.log('Sprint 54 status updated to "In Progress"');

  // Update first feature to In Progress
  const featuresResponse = await notion.databases.query({
    database_id: dbIds.module_features_db_id,
    filter: {
      and: [
        { property: 'Sprint', number: { equals: 54 } },
        { property: 'Priority', select: { equals: 'High' } },
      ],
    },
  });

  if (featuresResponse.results.length > 0) {
    // Update first high-priority feature
    const firstFeature = featuresResponse.results[0];
    await notion.pages.update({
      page_id: firstFeature.id,
      properties: {
        Status: {
          select: { name: 'In Progress' },
        },
      },
    });

    const featureName = firstFeature.properties.Features?.title?.[0]?.text?.content || 'Unknown';
    console.log(`First feature "${featureName}" set to In Progress`);
  }

  console.log('\nSprint 54 has begun!');
}

startSprint54().catch(console.error);
