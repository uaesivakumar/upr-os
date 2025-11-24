#!/usr/bin/env node
/**
 * Fetch Sprint 54+ features and dependencies from Notion
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function getSprintDependencyGraph() {
  try {
    console.log('🔍 Fetching Sprint 54+ from Notion...\n');

    const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
    const featuresDbId = dbIds.module_features_db_id;
    const sprintsDbId = dbIds.sprints_db_id;

    const results = {};

    // Get sprints 54-65
    for (let sprintNum = 54; sprintNum <= 65; sprintNum++) {
      try {
        // First check if sprint exists
        const sprintsResponse = await notion.databases.query({
          database_id: sprintsDbId,
          filter: {
            property: 'Sprint',
            title: {
              equals: `Sprint ${sprintNum}`,
            },
          },
        });

        if (sprintsResponse.results.length === 0) {
          continue; // Sprint doesn't exist yet
        }

        const sprint = sprintsResponse.results[0];
        const sprintGoal = sprint.properties.Goal?.rich_text?.[0]?.plain_text || '';
        const sprintStatus = sprint.properties.Status?.select?.name || 'Unknown';

        // Get features for this sprint
        const response = await notion.databases.query({
          database_id: featuresDbId,
          filter: {
            property: 'Sprint',
            number: {
              equals: sprintNum,
            },
          },
        });

        if (response.results.length > 0) {
          results[`Sprint ${sprintNum}`] = {
            goal: sprintGoal,
            status: sprintStatus,
            features: response.results.map(page => ({
              name: page.properties.Feature?.title?.[0]?.plain_text || 'Untitled',
              status: page.properties.Status?.select?.name || 'Unknown',
              priority: page.properties.Priority?.select?.name || 'Medium',
              module: page.properties.Module?.select?.name || '',
            })),
          };
        }
      } catch (e) {
        console.error(`Error fetching Sprint ${sprintNum}:`, e.message);
      }
    }

    console.log(JSON.stringify(results, null, 2));

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

getSprintDependencyGraph();
