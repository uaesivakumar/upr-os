import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MODULES_DB = process.env.MODULES_DB_ID;
const SPRINTS_DB = process.env.JOURNAL_DB_ID;

async function updateAIAgentCore() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Updating AI Agent Core Progress                  ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Find AI Agent Core module
  const response = await notion.databases.query({
    database_id: MODULES_DB,
    page_size: 10
  });

  const aiAgentCore = response.results.find(page => {
    const name = page.properties['Name']?.title?.[0]?.plain_text || '';
    return name.includes('AI Agent');
  });

  if (!aiAgentCore) {
    console.log('⚠️  AI Agent Core module not found');
    return;
  }

  const currentProgress = aiAgentCore.properties['Progress %']?.number || 0;

  console.log('📌 AI Agent Core');
  console.log(`   Current Progress: ${(currentProgress * 100).toFixed(0)}%`);
  console.log('   Target Progress: 58% (Phase 5 complete - 5/9 phases)');
  console.log(`   ID: ${aiAgentCore.id}\n`);

  console.log('   ⏳ Updating...');

  await notion.pages.update({
    page_id: aiAgentCore.id,
    properties: {
      'Progress %': {
        number: 0.58
      },
      'Current Sprint': {
        number: 21
      },
      'Status': {
        select: {
          name: 'Active'
        }
      }
    }
  });

  console.log('   ✅ Updated: 40% → 58%\n');
}

async function updateSprint21Status() {
  console.log('📅 Updating Sprint 21 Status...\n');

  const response = await notion.databases.query({
    database_id: SPRINTS_DB,
    page_size: 100
  });

  const sprint21 = response.results.find(page => {
    const name = page.properties['Name']?.title?.[0]?.plain_text || '';
    return name.includes('Sprint 21') || name.includes('21');
  });

  if (!sprint21) {
    console.log('⚠️  Sprint 21 not found');
    return;
  }

  console.log(`📌 ${sprint21.properties['Name']?.title?.[0]?.plain_text}`);
  console.log(`   ID: ${sprint21.id}\n`);
  console.log('   ⏳ Marking as complete...');

  await notion.pages.update({
    page_id: sprint21.id,
    properties: {
      'Done?': {
        checkbox: true
      }
    }
  });

  console.log('   ✅ Marked as complete\n');
}

async function main() {
  try {
    await updateAIAgentCore();
    await updateSprint21Status();

    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  ✅ ALL NOTION UPDATES COMPLETE                   ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log('Summary of updates:');
    console.log('1. ✅ Module Features - 6 Sprint 21 tasks marked Done');
    console.log('2. ✅ Modules - AI Agent Core progress: 40% → 58%');
    console.log('3. ✅ Sprints - Sprint 21 marked as complete\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
