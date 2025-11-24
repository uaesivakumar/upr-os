#!/usr/bin/env node
/**
 * Verify Sprint 30 Against Notion Module Features
 * Checks if implemented features match Notion plan
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));

const notion = new Client({ auth: process.env.NOTION_API_KEY });

async function verifySprint30() {
  try {
    console.log('Querying Notion Module Features for Sprint 30...\n');

    // Query Module Features for Sprint 30
    const response = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Sprint',
        relation: {
          contains: 'Sprint 30'
        }
      }
    });

    console.log(`Found ${response.results.length} features for Sprint 30:\n`);

    response.results.forEach((page, index) => {
      const properties = page.properties;
      const title = properties.Name?.title?.[0]?.plain_text || 'Untitled';
      const module = properties.Module?.select?.name || 'N/A';
      const status = properties.Status?.status?.name || 'N/A';
      const priority = properties.Priority?.select?.name || 'N/A';

      console.log(`${index + 1}. ${title}`);
      console.log(`   Module: ${module}`);
      console.log(`   Status: ${status}`);
      console.log(`   Priority: ${priority}`);
      console.log('');
    });

    // Also check Sprints DB for Sprint 30 details
    console.log('\nQuerying Sprints DB for Sprint 30 details...\n');

    const sprintsResponse = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: {
        property: 'Name',
        title: {
          contains: 'Sprint 30'
        }
      }
    });

    if (sprintsResponse.results.length > 0) {
      const sprint = sprintsResponse.results[0];
      const props = sprint.properties;

      console.log('Sprint 30 Details:');
      console.log(`Name: ${props.Name?.title?.[0]?.plain_text || 'N/A'}`);
      console.log(`Status: ${props.Status?.status?.name || 'N/A'}`);
      console.log(`Phase: ${props.Phase?.select?.name || 'N/A'}`);
      console.log(`Priority: ${props.Priority?.select?.name || 'N/A'}`);
      console.log('');

      // Get description/notes if available
      if (sprint.id) {
        const page = await notion.pages.retrieve({ page_id: sprint.id });
        console.log('Sprint 30 Page ID:', sprint.id);
      }
    }

  } catch (error) {
    console.error('Error querying Notion:', error.message);
    process.exit(1);
  }
}

verifySprint30();
