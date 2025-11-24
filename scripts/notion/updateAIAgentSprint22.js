import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MODULES_DB = process.env.MODULES_DB_ID;

async function updateAIAgentCore() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Updating AI Agent Core for Sprint 22             ║');
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
  const currentSprint = aiAgentCore.properties['Current Sprint']?.number || 0;

  console.log('📌 AI Agent Core');
  console.log(`   Current Progress: ${(currentProgress * 100).toFixed(0)}%`);
  console.log(`   Current Sprint: ${currentSprint}`);
  console.log(`   ID: ${aiAgentCore.id}\n`);

  console.log('⚠️  Important Note:');
  console.log('   The current progress of 58% is based on 9 phases (INCORRECT)');
  console.log('   Corrected calculation: 5/12 phases complete = 42%\n');

  console.log('   ⏳ Updating to corrected values...');

  await notion.pages.update({
    page_id: aiAgentCore.id,
    properties: {
      'Progress %': {
        number: 0.42
      },
      'Current Sprint': {
        number: 22
      },
      'Status': {
        select: {
          name: 'Active'
        }
      }
    }
  });

  console.log('   ✅ Updated: 58% → 42% (corrected based on 12 total phases)');
  console.log('   ✅ Current Sprint: 21 → 22\n');

  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Update Complete                                  ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log('📊 AI Agent Core Status:');
  console.log('   • Progress: 42% (5/12 phases complete)');
  console.log('   • Current Sprint: 22');
  console.log('   • Sprint 22 Target: 50% (6/12 phases - halfway milestone!)');
  console.log('   • Status: Active\n');
}

updateAIAgentCore().catch(console.error);
