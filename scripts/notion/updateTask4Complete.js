import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const WORK_ITEMS_DB = process.env.WORK_ITEMS_DB_ID || process.env.NOTION_WORKITEMS_DB;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 Updating Task 4 in Notion MODULE FEATURES');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function updateTask4() {
  try {
    console.log('🔍 Searching for Task 4 in MODULE FEATURES...\n');

    // Find Task 4
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB,
      filter: {
        and: [
          {
            property: 'Sprint',
            number: { equals: 18 }
          },
          {
            property: 'Features',
            title: { contains: 'Task 4' }
          }
        ]
      }
    });

    if (response.results.length === 0) {
      console.log('⚠️  Task 4 not found - creating new entry...\n');

      // Create Task 4 entry
      const newTask = await notion.pages.create({
        parent: { database_id: WORK_ITEMS_DB },
        properties: {
          'Features': {
            title: [{ text: { content: 'Task 4: Automated RADAR Scheduling' } }]
          },
          'Sprint': { number: 18 },
          'Status': { select: { name: 'Complete' } },
          'Done?': { checkbox: true },
          'Started At': { date: { start: '2025-11-10' } },
          'Completed At': { date: { start: '2025-11-10' } },
          'Priority': { select: { name: 'P1' } },
          'ETA': { number: 4 },
          'Type': { select: { name: 'Feature' } },
          'Notes': {
            rich_text: [{
              text: {
                content: 'Sprint 18 Task 4: Automated RADAR Scheduling. Cloud Scheduler job created for daily runs at 9 AM Dubai time. Budget cap: $5/run. Email notifications enabled. Sentry error tracking active. Rate limiting disabled for testing. Deployment: upr-web-service-00351-dms'
              }
            }]
          }
        }
      });

      console.log('✅ Task 4 created and marked Complete');
      console.log(`   Page ID: ${newTask.id}`);
      console.log(`   Sprint: 18`);
      console.log(`   Status: Complete`);
      console.log(`   ETA: 4 hours\n`);
    } else {
      const task = response.results[0];
      const currentStatus = task.properties.Status?.select?.name;
      const taskName = task.properties.Features?.title?.[0]?.text?.content || 'Task 4';

      console.log(`✅ Found: ${taskName}`);
      console.log(`   Current status: ${currentStatus}`);
      console.log(`   Page ID: ${task.id}\n`);

      if (currentStatus !== 'Complete') {
        // Update to Complete
        await notion.pages.update({
          page_id: task.id,
          properties: {
            'Status': { select: { name: 'Complete' } },
            'Done?': { checkbox: true },
            'Completed At': { date: { start: '2025-11-10' } },
            'Notes': {
              rich_text: [{
                text: {
                  content: 'Sprint 18 Task 4: Automated RADAR Scheduling. Cloud Scheduler job created for daily runs at 9 AM Dubai time. Budget cap: $5/run. Email notifications enabled. Sentry error tracking active. Rate limiting disabled for testing. Deployment: upr-web-service-00351-dms'
                }
              }]
            }
          }
        });
        console.log('✅ Task 4 updated to Complete\n');
      } else {
        console.log('ℹ️  Task 4 already marked Complete\n');

        // Update notes anyway
        await notion.pages.update({
          page_id: task.id,
          properties: {
            'Notes': {
              rich_text: [{
                text: {
                  content: 'Sprint 18 Task 4: Automated RADAR Scheduling. Cloud Scheduler job created for daily runs at 9 AM Dubai time. Budget cap: $5/run. Email notifications enabled. Sentry error tracking active. Rate limiting disabled for testing. Deployment: upr-web-service-00351-dms'
                }
              }]
            }
          }
        });
        console.log('✅ Task 4 notes updated\n');
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Task 4 Notion update complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error updating Task 4:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

updateTask4();
