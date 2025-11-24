import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Get all sprints
const response = await notion.databases.query({
  database_id: dbIds.sprints_db_id,
  sorts: [{ property: 'Sprint', direction: 'ascending' }]
});

console.log('Available Sprints:');
response.results.forEach(s => {
  const title = s.properties.Sprint?.title?.[0]?.plain_text;
  const status = s.properties.Status?.select?.name || 'Unknown';
  const phases = s.properties['Phases Updated']?.multi_select?.map(p => p.name).join(', ') || 'None';
  console.log(`  ${title} [${status}] - Phases: ${phases}`);
});
