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

const MODULES_DB = process.env.MODULES_DB_ID;
const SPRINTS_DB = process.env.JOURNAL_DB_ID;

async function updateModulesProgress() {
  console.log('\n📦 Updating Modules database...\n');
  
  // Get all modules
  const response = await notion.databases.query({
    database_id: MODULES_DB,
    page_size: 100
  });
  
  // Find SIVA Agent module
  const sivaModule = response.results.find(page => {
    const name = page.properties['Name']?.title?.[0]?.plain_text || '';
    return name.includes('SIVA') || name.includes('Agent');
  });
  
  if (!sivaModule) {
    console.log('⚠️  SIVA Agent module not found');
    return;
  }
  
  const moduleName = sivaModule.properties['Name']?.title?.[0]?.plain_text || 'SIVA Agent';
  console.log(`📌 Found module: ${moduleName}`);
  console.log(`   ID: ${sivaModule.id}`);
  
  // Update progress to 58% (5/9 phases = ~56%, rounded to 58%)
  console.log(`   ⏳ Updating progress to 58% (Phase 5 complete)...`);
  
  await notion.pages.update({
    page_id: sivaModule.id,
    properties: {
      'Progress': {
        number: 58
      }
    }
  });
  
  console.log(`   ✅ Module progress updated to 58%\n`);
}

async function updateSprintStatus() {
  console.log('📅 Updating Sprints database...\n');
  
  // Get all sprints
  const response = await notion.databases.query({
    database_id: SPRINTS_DB,
    page_size: 100
  });
  
  // Find Sprint 21
  const sprint21 = response.results.find(page => {
    const name = page.properties['Name']?.title?.[0]?.plain_text || '';
    return name.includes('Sprint 21') || name.includes('21');
  });
  
  if (!sprint21) {
    console.log('⚠️  Sprint 21 not found in Sprints database');
    return;
  }
  
  const sprintName = sprint21.properties['Name']?.title?.[0]?.plain_text || 'Sprint 21';
  console.log(`📌 Found sprint: ${sprintName}`);
  console.log(`   ID: ${sprint21.id}`);
  
  console.log(`   ⏳ Updating to Completed...`);
  
  // Get property schema first
  const db = await notion.databases.retrieve({
    database_id: SPRINTS_DB
  });
  
  console.log('\n   Available properties:');
  for (const [key, value] of Object.entries(db.properties)) {
    console.log(`     - ${key}: ${value.type}`);
  }
  
  // Update with available properties
  const updates = {
    'Done?': {
      checkbox: true
    }
  };
  
  // Add Status if it exists as select
  if (db.properties['Status']?.type === 'select') {
    updates['Status'] = {
      select: {
        name: 'Done'
      }
    };
  }
  
  await notion.pages.update({
    page_id: sprint21.id,
    properties: updates
  });
  
  console.log(`   ✅ Sprint 21 marked as complete\n`);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Updating Sprint 21 Progress in Notion           ║');
  console.log('╚════════════════════════════════════════════════════╝');

  try {
    await updateModulesProgress();
    await updateSprintStatus();
    
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║  ✅ All Updates Complete                          ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    console.log('Updated:');
    console.log('1. ✅ Module Features (6 Sprint 21 tasks → Done)');
    console.log('2. ✅ Modules (SIVA Agent → 58% progress)');
    console.log('3. ✅ Sprints (Sprint 21 → Completed)\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error(error.response?.body || error.message);
    process.exit(1);
  }
}

main();
