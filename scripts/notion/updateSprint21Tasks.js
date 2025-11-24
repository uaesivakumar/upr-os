import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MODULE_FEATURES_DB = process.env.WORK_ITEMS_DB_ID;

async function updateSprint21Tasks() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Updating Sprint 21 Tasks in Module Features     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Query all tasks
  const response = await notion.databases.query({
    database_id: MODULE_FEATURES_DB,
    page_size: 100
  });

  console.log(`📊 Total tasks in database: ${response.results.length}\n`);

  // Find Sprint 21 tasks (Sprint number = 21)
  const sprint21Tasks = response.results.filter(page => {
    const sprintNum = page.properties['Sprint']?.number;
    return sprintNum === 21;
  });

  console.log(`📌 Found ${sprint21Tasks.length} Sprint 21 tasks\n`);

  if (sprint21Tasks.length === 0) {
    console.log('⚠️  No Sprint 21 tasks found. Checking all tasks with "Phase 5" in name...\n');
    
    const phase5Tasks = response.results.filter(page => {
      const taskName = page.properties['Features']?.title?.[0]?.plain_text || '';
      return taskName.includes('Phase 5') || taskName.includes('Cognitive');
    });
    
    console.log(`📌 Found ${phase5Tasks.length} Phase 5 related tasks:\n`);
    
    for (const task of phase5Tasks) {
      const taskName = task.properties['Features']?.title?.[0]?.plain_text || 'Untitled';
      const status = task.properties['Status']?.select?.name || 'N/A';
      const done = task.properties['Done?']?.checkbox || false;
      const sprint = task.properties['Sprint']?.number || 'N/A';
      
      console.log(`📄 ${taskName}`);
      console.log(`   Sprint: ${sprint}`);
      console.log(`   Status: ${status}`);
      console.log(`   Done: ${done}`);
      console.log(`   ID: ${task.id}\n`);
      
      // Update this task
      console.log(`   ⏳ Updating...`);
      
      await notion.pages.update({
        page_id: task.id,
        properties: {
          'Sprint': {
            number: 21
          },
          'Status': {
            select: {
              name: 'Done'
            }
          },
          'Done?': {
            checkbox: true
          },
          'Completed At': {
            date: {
              start: '2025-11-14'
            }
          }
        }
      });
      
      console.log(`   ✅ Updated successfully\n`);
    }
    
    return;
  }

  // Update each Sprint 21 task
  for (const task of sprint21Tasks) {
    const taskName = task.properties['Features']?.title?.[0]?.plain_text || 'Untitled';
    const status = task.properties['Status']?.select?.name || 'N/A';
    const done = task.properties['Done?']?.checkbox || false;
    
    console.log(`📄 ${taskName}`);
    console.log(`   Current Status: ${status}`);
    console.log(`   Current Done: ${done}`);
    console.log(`   ID: ${task.id}`);
    
    if (status !== 'Done' || !done) {
      console.log(`   ⏳ Updating to Done...`);
      
      await notion.pages.update({
        page_id: task.id,
        properties: {
          'Status': {
            select: {
              name: 'Done'
            }
          },
          'Done?': {
            checkbox: true
          },
          'Completed At': {
            date: {
              start: '2025-11-14'
            }
          }
        }
      });
      
      console.log(`   ✅ Updated successfully`);
    } else {
      console.log(`   ✓ Already marked as Done`);
    }
    console.log('');
  }

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  ✅ Sprint 21 Tasks Update Complete               ║');
  console.log('╚════════════════════════════════════════════════════╝');
}

updateSprint21Tasks().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
