import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function verify() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Verifying Sprint 21 Notion Updates              ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // 1. Check Module Features
  console.log('1️⃣  Module Features (Sprint 21 tasks):\n');
  const workItems = await notion.databases.query({
    database_id: process.env.WORK_ITEMS_DB_ID,
    page_size: 100
  });

  const sprint21Tasks = workItems.results.filter(p => p.properties['Sprint']?.number === 21);
  const doneTasks = sprint21Tasks.filter(p => p.properties['Done?']?.checkbox === true);
  const doneCount = doneTasks.length;
  const totalCount = sprint21Tasks.length;

  console.log(`   Total Sprint 21 tasks: ${totalCount}`);
  console.log(`   Tasks marked Done: ${doneCount}`);
  console.log(`   Status: ${doneCount === totalCount ? '✅ All Done' : '⚠️  Incomplete'}\n`);

  for (const task of sprint21Tasks) {
    const name = task.properties['Features']?.title?.[0]?.plain_text || 'Untitled';
    const done = task.properties['Done?']?.checkbox;
    const status = task.properties['Status']?.select?.name;
    console.log(`   ${done ? '✅' : '❌'} ${name} - ${status}`);
  }

  // 2. Check Modules
  console.log('\n2️⃣  Modules (AI Agent Core):\n');
  const modules = await notion.databases.query({
    database_id: process.env.MODULES_DB_ID,
    page_size: 10
  });

  const aiAgent = modules.results.find(p => {
    const name = p.properties['Name']?.title?.[0]?.plain_text || '';
    return name.includes('AI Agent');
  });

  if (aiAgent) {
    const progress = aiAgent.properties['Progress %']?.number;
    const sprint = aiAgent.properties['Current Sprint']?.number;
    const progressPercent = (progress * 100).toFixed(0);
    console.log(`   Progress: ${progressPercent}% ${progress >= 0.58 ? '✅' : '❌'}`);
    console.log(`   Current Sprint: ${sprint}`);
    console.log(`   Status: ${aiAgent.properties['Status']?.select?.name}\n`);
  }

  // 3. Check Sprints
  console.log('3️⃣  Sprints (Sprint 21 status):\n');
  const sprints = await notion.databases.query({
    database_id: process.env.JOURNAL_DB_ID,
    page_size: 100
  });

  const sprint21 = sprints.results.find(p => {
    const name = p.properties['Name']?.title?.[0]?.plain_text || '';
    return name.includes('Sprint 21') || name.includes('21');
  });

  if (sprint21) {
    const done = sprint21.properties['Done?']?.checkbox;
    console.log(`   Sprint 21: ${done ? '✅ Complete' : '⚠️  Not marked complete'}\n`);
  } else {
    console.log('   Sprint 21: ⚠️  Not found in database\n');
  }

  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Verification Complete                             ║');
  console.log('╚════════════════════════════════════════════════════╝');
}

verify().catch(console.error);
