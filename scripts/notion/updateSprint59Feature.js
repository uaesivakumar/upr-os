/**
 * Update Sprint 59 Feature Status in Notion
 * Usage: node scripts/notion/updateSprint59Feature.js "Feature Name" "Status"
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const [featureName, status] = process.argv.slice(2);

if (!featureName || !status) {
  console.error('Usage: node updateSprint59Feature.js "Feature Name" "Status"');
  process.exit(1);
}

async function updateFeature() {
  try {
    const response = await notion.databases.query({
      database_id: dbIds.module_features_db_id,
      filter: {
        and: [
          { property: 'Sprint', number: { equals: 59 } },
          { property: 'Features', title: { contains: featureName } }
        ]
      }
    });

    if (response.results.length === 0) {
      console.log(`Feature not found: ${featureName}`);
      return;
    }

    const pageId = response.results[0].id;
    await notion.pages.update({
      page_id: pageId,
      properties: {
        Status: { select: { name: status } }
      }
    });

    console.log(`✓ Updated "${featureName}" to "${status}"`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

updateFeature();
