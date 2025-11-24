import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const SPRINTS_DB = process.env.JOURNAL_DB_ID;
const MODULE_FEATURES_DB = process.env.WORK_ITEMS_DB_ID;

// Sprint 22 tasks based on SPRINT_22_KICKOFF.md
const sprint22Tasks = [
  // Phase 6.1: Tool Integration (4 tasks - HIGH priority)
  {
    name: 'Task 6.1.1: Integrate CompanyQualityTool with Rule Engine',
    priority: 'HIGH',
    estimatedHours: 2,
    phase: 'Phase 6.1: Tool Integration'
  },
  {
    name: 'Task 6.1.2: Integrate ContactTierTool with Rule Engine',
    priority: 'HIGH',
    estimatedHours: 2,
    phase: 'Phase 6.1: Tool Integration'
  },
  {
    name: 'Task 6.1.3: Integrate TimingScoreTool with Rule Engine',
    priority: 'HIGH',
    estimatedHours: 2,
    phase: 'Phase 6.1: Tool Integration'
  },
  {
    name: 'Task 6.1.4: Integrate EdgeCasesTool with Rule Engine',
    priority: 'HIGH',
    estimatedHours: 2,
    phase: 'Phase 6.1: Tool Integration'
  },

  // Phase 6.2: Feedback Collection System (3 tasks - HIGH priority)
  {
    name: 'Task 6.2.1: Create Feedback Database Schema',
    priority: 'HIGH',
    estimatedHours: 1,
    phase: 'Phase 6.2: Feedback System'
  },
  {
    name: 'Task 6.2.2: Build Feedback Collection API',
    priority: 'HIGH',
    estimatedHours: 2,
    phase: 'Phase 6.2: Feedback System'
  },
  {
    name: 'Task 6.2.3: Integrate Feedback Collection Points',
    priority: 'MEDIUM',
    estimatedHours: 2,
    phase: 'Phase 6.2: Feedback System'
  },

  // Phase 6.3: Rule Comparison Dashboard (2 tasks - MEDIUM/LOW priority)
  {
    name: 'Task 6.3.1: Create Rule Comparison API',
    priority: 'MEDIUM',
    estimatedHours: 2,
    phase: 'Phase 6.3: Comparison Dashboard'
  },
  {
    name: 'Task 6.3.2: Build Rule Comparison Dashboard UI',
    priority: 'LOW',
    estimatedHours: 3,
    phase: 'Phase 6.3: Comparison Dashboard'
  },

  // Phase 6.4: Test Coverage Expansion (2 tasks - HIGH priority)
  {
    name: 'Task 6.4.1: Create Golden Dataset (100+ test cases)',
    priority: 'HIGH',
    estimatedHours: 3,
    phase: 'Phase 6.4: Test Expansion'
  },
  {
    name: 'Task 6.4.2: Automate Test Execution',
    priority: 'HIGH',
    estimatedHours: 2,
    phase: 'Phase 6.4: Test Expansion'
  },

  // Phase 6.5: Database Schema for Learning (1 task - MEDIUM priority)
  {
    name: 'Task 6.5.1: Create Training Dataset Schema',
    priority: 'MEDIUM',
    estimatedHours: 1,
    phase: 'Phase 6.5: Learning Schema'
  }
];

async function createSprint22() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Creating Sprint 22 in Notion                     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Step 1: Create Sprint 22 page in Sprints database
  console.log('1️⃣  Creating Sprint 22 in Sprints database...\n');

  try {
    const sprint22Page = await notion.pages.create({
      parent: {
        database_id: SPRINTS_DB
      },
      properties: {
        'Sprint': {
          title: [
            {
              text: {
                content: 'Sprint 22: Rule Engine Integration & Learning System'
              }
            }
          ]
        },
        'Status': {
          select: {
            name: 'In Progress'
          }
        },
        'Goal': {
          rich_text: [
            {
              text: {
                content: 'Integrate rule engine into 4 Foundation tools, build feedback collection system, expand test coverage to 100+ cases, and establish learning system foundation. Target: 42% → 50% progress (5/12 → 6/12 phases complete).'
              }
            }
          ]
        },
        'Started At': {
          date: {
            start: '2025-11-15'
          }
        }
      }
    });

    console.log('   ✅ Sprint 22 created in Sprints database');
    console.log(`   ID: ${sprint22Page.id}\n`);

  } catch (error) {
    console.log(`   ⚠️  Error creating Sprint 22: ${error.message}`);
    console.log('   (This may be normal if Sprint 22 already exists)\n');
  }

  // Step 2: Create all 12 tasks in Module Features database
  console.log('2️⃣  Creating 12 Sprint 22 tasks in Module Features...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const task of sprint22Tasks) {
    try {
      await notion.pages.create({
        parent: {
          database_id: MODULE_FEATURES_DB
        },
        properties: {
          'Features': {
            title: [
              {
                text: {
                  content: task.name
                }
              }
            ]
          },
          'Sprint': {
            number: 22
          },
          'Status': {
            select: {
              name: 'To-do'
            }
          },
          'Done?': {
            checkbox: false
          },
          'Priority': {
            select: {
              name: task.priority
            }
          }
        }
      });

      console.log(`   ✅ Created: ${task.name}`);
      console.log(`      Priority: ${task.priority} | Estimated: ${task.estimatedHours}h | ${task.phase}\n`);
      successCount++;

    } catch (error) {
      console.log(`   ❌ Error creating task: ${task.name}`);
      console.log(`      Error: ${error.message}\n`);
      errorCount++;
    }
  }

  // Summary
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Sprint 22 Creation Complete                      ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log('📊 Summary:');
  console.log(`   ✅ Tasks created successfully: ${successCount}/12`);
  if (errorCount > 0) {
    console.log(`   ❌ Tasks failed: ${errorCount}/12`);
  }
  console.log('\n📝 Task breakdown:');
  console.log('   • Phase 6.1 (Tool Integration): 4 tasks - 8 hours');
  console.log('   • Phase 6.2 (Feedback System): 3 tasks - 5 hours');
  console.log('   • Phase 6.3 (Comparison Dashboard): 2 tasks - 5 hours');
  console.log('   • Phase 6.4 (Test Expansion): 2 tasks - 5 hours');
  console.log('   • Phase 6.5 (Learning Schema): 1 task - 1 hour');
  console.log('   • Total: 12 tasks - 24 hours estimated\n');

  console.log('🎯 Sprint 22 Objectives:');
  console.log('   • Target: 42% → 50% progress (5/12 → 6/12 phases)');
  console.log('   • Duration: 1 week (Nov 15-22, 2025)');
  console.log('   • Focus: Rule engine integration + learning foundation\n');
}

createSprint22().catch(console.error);
