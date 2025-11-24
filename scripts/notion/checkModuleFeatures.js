import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MODULE_FEATURES_DB = process.env.WORK_ITEMS_DB_ID;

async function checkSchema() {
  console.log('📋 Checking Module Features database schema...\n');
  
  // Get database schema
  const db = await notion.databases.retrieve({
    database_id: MODULE_FEATURES_DB
  });
  
  console.log('Available properties:');
  for (const [key, value] of Object.entries(db.properties)) {
    console.log(`  - ${key}: ${value.type}`);
  }
  
  console.log('\n📄 Querying Sprint 21 tasks...\n');
  
  // Query for Sprint 21 tasks
  const response = await notion.databases.query({
    database_id: MODULE_FEATURES_DB,
    page_size: 100
  });
  
  // Find Sprint 21 tasks
  const sprint21Tasks = response.results.filter(page => {
    const taskName = page.properties['Task/Feature']?.title?.[0]?.plain_text || '';
    return taskName.includes('Phase 5') || taskName.includes('Sprint 21');
  });
  
  console.log(`Found ${sprint21Tasks.length} Sprint 21 related tasks:\n`);
  
  for (const task of sprint21Tasks) {
    const taskName = page.properties['Task/Feature']?.title?.[0]?.plain_text || 'Untitled';
    const status = task.properties['Status']?.status?.name || 'N/A';
    const sprint = task.properties['Sprint']?.relation?.[0]?.id || 'N/A';
    
    console.log(`📌 ${taskName}`);
    console.log(`   Status: ${status}`);
    console.log(`   ID: ${task.id}`);
    console.log('');
  }
}

checkSchema().catch(console.error);
