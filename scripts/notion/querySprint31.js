#!/usr/bin/env node
/**
 * Query Sprint 31 Tasks from Notion Module Features
 * Fetches the plan for Sprint 31 implementation
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function querySprint31() {
  try {
    console.log('Querying Notion Module Features for Sprint 31...\\n');

    // Query Module Features for Sprint 31 (Sprint is a number property)
    const response = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        property: 'Sprint',
        number: {
          equals: 31
        }
      },
      sorts: [
        {
          property: 'Priority',
          direction: 'ascending'
        }
      ]
    });

    if (response.results.length === 0) {
      console.log('No features found for Sprint 31 in Notion Module Features DB.');
      console.log('This might mean Sprint 31 is not yet planned in Notion.\\n');
      return;
    }

    console.log(`Found ${response.results.length} features for Sprint 31:\\n`);
    console.log('━'.repeat(80));

    response.results.forEach((page, index) => {
      const properties = page.properties;
      const title = properties.Features?.title?.[0]?.plain_text || 'Untitled';
      const modules = properties.Modules?.relation || [];
      const status = properties.Status?.select?.name || 'N/A';
      const priority = properties.Priority?.select?.name || 'N/A';
      const notes = properties.Notes?.rich_text?.[0]?.plain_text || 'No description';
      const complexity = properties.Complexity?.select?.name || 'N/A';
      const eta = properties.ETA?.number || 'N/A';

      console.log(`\\n${index + 1}. ${title}`);
      console.log(`   Priority: ${priority}`);
      console.log(`   Status: ${status}`);
      console.log(`   Complexity: ${complexity}`);
      console.log(`   ETA: ${eta} hours`);
      console.log(`   Modules: ${modules.length} module(s)`);
      console.log(`   Notes: ${notes}`);
    });

    console.log('\\n' + '━'.repeat(80));
    console.log('\\nSprint 31 Features Summary:\\n');

    // Group by priority
    const byPriority = {};
    response.results.forEach(page => {
      const priority = page.properties.Priority?.select?.name || 'Unspecified';
      if (!byPriority[priority]) {
        byPriority[priority] = [];
      }
      byPriority[priority].push(page.properties.Features?.title?.[0]?.plain_text || 'Untitled');
    });

    Object.entries(byPriority).forEach(([priority, features]) => {
      console.log(`${priority} Priority:`);
      features.forEach(feature => {
        console.log(`  - ${feature}`);
      });
      console.log('');
    });

    // Calculate total ETA
    const totalETA = response.results.reduce((sum, page) => {
      const eta = page.properties.ETA?.number || 0;
      return sum + eta;
    }, 0);

    console.log(`Total Estimated Time: ${totalETA} hours`);

  } catch (error) {
    console.error('Error querying Notion:', error.message);

    if (error.message.includes('API token')) {
      console.error('\\nPlease set NOTION_TOKEN environment variable.');
      console.error('You can get an integration token from: https://www.notion.so/my-integrations');
    }

    process.exit(1);
  }
}

querySprint31();
