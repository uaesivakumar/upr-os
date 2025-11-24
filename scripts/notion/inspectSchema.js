import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Check Modules database to see available modules
console.log('=== MODULES DATABASE ===');
const modules = await notion.databases.query({
  database_id: dbIds.modules_db_id
});

console.log('Available Modules:');
modules.results.forEach((m, i) => {
  const name = m.properties.Module?.title?.[0]?.plain_text || m.properties.Name?.title?.[0]?.plain_text;
  console.log('  ' + (i+1) + '. ' + name + ' (ID: ' + m.id + ')');
});

// Check Phases Updated field options in Sprints database
const sprintsDb = await notion.databases.retrieve({ database_id: dbIds.sprints_db_id });
const phasesUpdated = sprintsDb.properties['Phases Updated'];
console.log('\n=== PHASES UPDATED FIELD ===');
console.log('Type:', phasesUpdated.type);
if (phasesUpdated.multi_select) {
  console.log('Options:');
  phasesUpdated.multi_select.options.forEach((opt, i) => {
    console.log('  ' + (i+1) + '. ' + opt.name);
  });
}

// Check a working sprint to see how Phases Updated looks
const sprint53 = await notion.databases.query({
  database_id: dbIds.sprints_db_id,
  filter: { property: 'Sprint', title: { equals: 'Sprint 53' } }
});

if (sprint53.results.length > 0) {
  const phases = sprint53.results[0].properties['Phases Updated'];
  console.log('\nSprint 53 Phases Updated values:', phases.multi_select?.map(p => p.name).join(', ') || 'None');
}

// Check Module Features for Sprint 53 to see Modules relation
console.log('\n=== MODULE FEATURES - MODULES RELATION ===');
const features53 = await notion.databases.query({
  database_id: dbIds.module_features_db_id,
  filter: { property: 'Sprint', number: { equals: 53 } },
  page_size: 3
});

if (features53.results.length > 0) {
  console.log('Sample Sprint 53 features with Modules:');
  for (const f of features53.results) {
    const name = f.properties.Features?.title?.[0]?.plain_text;
    const modulesRel = f.properties.Modules?.relation || [];
    console.log('  ' + name + ' -> Modules: ' + (modulesRel.length > 0 ? modulesRel.map(r => r.id).join(', ') : 'None'));
  }
}
