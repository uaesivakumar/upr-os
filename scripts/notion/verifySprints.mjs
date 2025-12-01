import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const sprints = await notion.databases.query({
  database_id: dbIds.sprints_db_id,
  page_size: 100
});

// Extract and sort by sprint number
const sorted = sprints.results
  .map(s => {
    const name = s.properties.Sprint?.title?.[0]?.plain_text || '';
    const match = name.match(/S(\d+)/);
    return { name, num: match ? parseInt(match[1]) : 0 };
  })
  .sort((a, b) => a.num - b.num);

console.log('All sprints (sorted by number):');
sorted.forEach(s => console.log('  ' + s.name));
console.log('\nTotal: ' + sorted.length + ' sprints');
