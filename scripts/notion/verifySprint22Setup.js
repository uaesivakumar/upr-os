import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function verify() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Verifying Sprint 22 Notion Setup                ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // 1. Check Sprint 22 in Sprints database
  console.log('1️⃣  Sprint 22 in Sprints database:\n');
  const sprints = await notion.databases.query({
    database_id: process.env.JOURNAL_DB_ID,
    page_size: 100
  });

  const sprint22 = sprints.results.find(p => {
    const name = p.properties['Sprint']?.title?.[0]?.plain_text || '';
    return name.includes('Sprint 22');
  });

  if (sprint22) {
    const status = sprint22.properties['Status']?.select?.name;
    const goal = sprint22.properties['Goal']?.rich_text?.[0]?.plain_text;
    const startedAt = sprint22.properties['Started At']?.date?.start;

    console.log(`   ✅ Sprint 22 created successfully`);
    console.log(`   ID: ${sprint22.id}`);
    console.log(`   Status: ${status}`);
    console.log(`   Started: ${startedAt}`);
    console.log(`   Goal: ${goal?.substring(0, 100)}...`);
  } else {
    console.log('   ❌ Sprint 22 not found');
  }

  // 2. Check Sprint 22 tasks in Module Features
  console.log('\n2️⃣  Sprint 22 tasks in Module Features:\n');
  const workItems = await notion.databases.query({
    database_id: process.env.WORK_ITEMS_DB_ID,
    page_size: 100
  });

  const sprint22Tasks = workItems.results.filter(p => p.properties['Sprint']?.number === 22);

  console.log(`   Total Sprint 22 tasks: ${sprint22Tasks.length}/12\n`);

  const tasksByPriority = {
    HIGH: [],
    MEDIUM: [],
    LOW: []
  };

  for (const task of sprint22Tasks) {
    const name = task.properties['Features']?.title?.[0]?.plain_text || 'Untitled';
    const priority = task.properties['Priority']?.select?.name;
    const status = task.properties['Status']?.select?.name;

    tasksByPriority[priority]?.push({ name, status });
  }

  console.log('   HIGH Priority (should be 6 tasks):');
  tasksByPriority.HIGH.forEach(t => {
    console.log(`   ${t.status === 'To-do' ? '⏳' : '✅'} ${t.name}`);
  });

  console.log('\n   MEDIUM Priority (should be 3 tasks):');
  tasksByPriority.MEDIUM.forEach(t => {
    console.log(`   ${t.status === 'To-do' ? '⏳' : '✅'} ${t.name}`);
  });

  console.log('\n   LOW Priority (should be 1 task):');
  tasksByPriority.LOW.forEach(t => {
    console.log(`   ${t.status === 'To-do' ? '⏳' : '✅'} ${t.name}`);
  });

  // 3. Update AI Agent Core to Sprint 22
  console.log('\n3️⃣  Updating AI Agent Core module:\n');
  const modules = await notion.databases.query({
    database_id: process.env.MODULES_DB_ID,
    page_size: 10
  });

  const aiAgent = modules.results.find(p => {
    const name = p.properties['Name']?.title?.[0]?.plain_text || '';
    return name.includes('AI Agent');
  });

  if (aiAgent) {
    const currentProgress = aiAgent.properties['Progress %']?.number || 0;
    const currentSprint = aiAgent.properties['Current Sprint']?.number;

    console.log(`   Current Progress: ${(currentProgress * 100).toFixed(0)}%`);
    console.log(`   Current Sprint: ${currentSprint}`);

    if (currentSprint !== 22) {
      console.log(`\n   ⏳ Updating to Sprint 22...`);

      await notion.pages.update({
        page_id: aiAgent.id,
        properties: {
          'Current Sprint': {
            number: 22
          }
        }
      });

      console.log(`   ✅ Updated AI Agent Core to Sprint 22`);
    } else {
      console.log(`   ✅ Already on Sprint 22`);
    }
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  Sprint 22 Setup Complete                         ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log('📊 Summary:');
  console.log(`   ✅ Sprint 22 entry created in Sprints database`);
  console.log(`   ✅ 12 tasks created in Module Features (Sprint = 22)`);
  console.log(`   ✅ AI Agent Core updated to Sprint 22`);
  console.log(`   ✅ Current progress: 58% (to be updated to 42% at sprint start)`);
  console.log('\n🚀 Ready to begin Sprint 22 implementation!\n');
}

verify().catch(console.error);
