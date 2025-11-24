/**
 * Create Work Item (Universal)
 *
 * Usage: node scripts/notion/createWorkItem.js
 *
 * Creates ANY type of work item in Notion:
 * - Features (UI/UX, API, Integration)
 * - Bug Fixes
 * - Enhancements
 * - Data Connections
 * - Deletions/Refactoring
 * - Documentation
 * - etc.
 *
 * Automatically links to sprint, tracks time, manages status.
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const SPRINTS_DB_ID = process.env.SPRINTS_DB_ID;
const WORK_ITEMS_DB_ID = process.env.WORK_ITEMS_DB_ID;

// Work item type templates
const WORK_ITEM_TYPES = {
  'Feature': {
    color: 'blue',
    estimatedHours: 8,
    defaultPriority: 'Medium',
    examples: ['Add dark mode toggle', 'Build user authentication', 'Create dashboard charts']
  },
  'Bug Fix': {
    color: 'red',
    estimatedHours: 2,
    defaultPriority: 'High',
    examples: ['Fix login redirect', 'Resolve memory leak', 'Fix broken chart rendering']
  },
  'Enhancement': {
    color: 'green',
    estimatedHours: 4,
    defaultPriority: 'Medium',
    examples: ['Improve error messages', 'Add loading spinners', 'Optimize query performance']
  },
  'Data Connection': {
    color: 'purple',
    estimatedHours: 6,
    defaultPriority: 'High',
    examples: ['Connect to Salesforce API', 'Add PostgreSQL integration', 'Set up Redis cache']
  },
  'Refactor': {
    color: 'yellow',
    estimatedHours: 5,
    defaultPriority: 'Low',
    examples: ['Extract utility functions', 'Rename variables for clarity', 'Remove deprecated code']
  },
  'Documentation': {
    color: 'gray',
    estimatedHours: 2,
    defaultPriority: 'Low',
    examples: ['Write API docs', 'Update README', 'Document deployment process']
  },
  'UI/UX': {
    color: 'pink',
    estimatedHours: 6,
    defaultPriority: 'Medium',
    examples: ['Redesign navigation menu', 'Add responsive layout', 'Improve accessibility']
  },
  'Infrastructure': {
    color: 'brown',
    estimatedHours: 8,
    defaultPriority: 'High',
    examples: ['Set up CI/CD pipeline', 'Configure monitoring', 'Add error tracking']
  }
};

// Categories
const CATEGORIES = [
  'Frontend',
  'Backend',
  'Database',
  'API',
  'Integration',
  'DevOps',
  'Testing',
  'Security',
  'Performance',
  'Analytics'
];

// Helper: Prompt user for input
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// Helper: Get sprint by number
async function getSprintByNumber(sprintNumber) {
  const response = await notion.databases.query({
    database_id: SPRINTS_DB_ID,
    filter: {
      property: 'Sprint Number',
      number: {
        equals: sprintNumber
      }
    }
  });

  return response.results[0];
}

async function createWorkItem() {
  console.log('📋 Work Item Creator (Universal)\n');
  console.log('Create any type of work: Features, Bugs, Enhancements, Data Connections, etc.\n');

  try {
    // ================================================================
    // STEP 1: Select Work Type
    // ================================================================
    console.log('📝 Work Item Types:\n');
    const typeNames = Object.keys(WORK_ITEM_TYPES);
    typeNames.forEach((type, i) => {
      const template = WORK_ITEM_TYPES[type];
      console.log(`   ${i + 1}. ${type.padEnd(20)} (${template.estimatedHours}h) - e.g., "${template.examples[0]}"`);
    });

    const typeIndex = parseInt(await prompt('\nSelect Type (1-8): ')) - 1;
    const workType = typeNames[typeIndex];
    const template = WORK_ITEM_TYPES[workType];

    // ================================================================
    // STEP 2: Work Item Details
    // ================================================================
    console.log(`\n📋 Creating ${workType}...\n`);

    const title = await prompt('Title (short description): ');
    const sprintNumber = parseInt(await prompt('Sprint Number (e.g., 17): '));

    console.log('\n📂 Categories:');
    CATEGORIES.forEach((cat, i) => {
      console.log(`   ${i + 1}. ${cat}`);
    });
    const categoryIndex = parseInt(await prompt('\nSelect Category (1-10): ')) - 1;
    const category = CATEGORIES[categoryIndex];

    const description = await prompt('\nDescription (what needs to be done): ');
    const acceptance = await prompt('Acceptance Criteria (how to verify it\'s done): ');

    // ================================================================
    // STEP 3: Priority & Time
    // ================================================================
    console.log('\n⚡ Priority:');
    console.log('   1. Critical');
    console.log('   2. High');
    console.log('   3. Medium');
    console.log('   4. Low');
    const priorityIndex = parseInt(await prompt(`\nSelect Priority (1-4, default: ${template.defaultPriority}): `));
    const priorities = ['Critical', 'High', 'Medium', 'Low'];
    const priority = priorityIndex ? priorities[priorityIndex - 1] : template.defaultPriority;

    const estimatedHours = parseFloat(
      await prompt(`\nEstimated Hours (default ${template.estimatedHours}h): `) || template.estimatedHours
    );

    // ================================================================
    // STEP 4: Status Tracking
    // ================================================================
    console.log('\n📊 Status:');
    console.log('   1. To-Do');
    console.log('   2. In Progress');
    console.log('   3. Done');
    const statusIndex = parseInt(await prompt('\nSelect Status (1-3): '));
    const statuses = ['To-Do', 'In Progress', 'Done'];
    const status = statuses[statusIndex - 1];

    let startedAt = null;
    let completedAt = null;
    let actualHours = 0;

    if (status !== 'To-Do') {
      startedAt = await prompt('Started At (YYYY-MM-DD): ');
    }

    if (status === 'Done') {
      completedAt = await prompt('Completed At (YYYY-MM-DD): ');
      actualHours = parseFloat(await prompt('Actual Hours (time spent): '));
    }

    const assignee = await prompt('\nAssignee (optional, leave empty if none): ');
    const tags = await prompt('Tags (comma-separated, e.g., "SIVA, RADAR, Critical"): ');
    const notes = await prompt('Notes (optional): ');

    // ================================================================
    // STEP 5: Find Sprint
    // ================================================================
    console.log('\n🔍 Finding Sprint in Notion...');
    const sprint = await getSprintByNumber(sprintNumber);

    if (!sprint) {
      console.error(`❌ Sprint ${sprintNumber} not found in Notion!`);
      console.error('Create it first or enter a valid sprint number.');
      process.exit(1);
    }

    console.log(`✅ Found Sprint ${sprintNumber}: ${sprint.properties.Sprint.title[0].text.content}`);

    // ================================================================
    // STEP 6: Create Work Item
    // ================================================================
    console.log('\n📤 Creating work item in Notion...');

    const tagList = tags
      ? tags.split(',').map(t => ({ name: t.trim() }))
      : [];

    const workItemData = {
      parent: { database_id: WORK_ITEMS_DB_ID },
      properties: {
        'Title': {
          title: [{ text: { content: title } }]
        },
        'Type': { select: { name: workType } },
        'Sprint': { relation: [{ id: sprint.id }] },
        'Category': { select: { name: category } },
        'Status': { select: { name: status } },
        'Priority': { select: { name: priority } },
        'Description': { rich_text: [{ text: { content: description } }] },
        'Acceptance Criteria': { rich_text: [{ text: { content: acceptance } }] },
        'Estimated Hours': { number: estimatedHours }
      }
    };

    // Add optional properties
    if (startedAt) {
      workItemData.properties['Started At'] = { date: { start: startedAt } };
    }

    if (completedAt) {
      workItemData.properties['Completed At'] = { date: { start: completedAt } };
    }

    if (actualHours > 0) {
      workItemData.properties['Actual Hours'] = { number: actualHours };
    }

    if (assignee) {
      workItemData.properties['Assignee'] = { rich_text: [{ text: { content: assignee } }] };
    }

    if (tagList.length > 0) {
      workItemData.properties['Tags'] = { multi_select: tagList };
    }

    if (notes) {
      workItemData.properties['Notes'] = { rich_text: [{ text: { content: notes } }] };
    }

    const createdItem = await notion.pages.create(workItemData);

    console.log('✅ Work item created successfully!\n');

    // ================================================================
    // STEP 7: Summary
    // ================================================================
    console.log('='.repeat(80));
    console.log('📦 Work Item Created\n');
    console.log(`   Title: ${title}`);
    console.log(`   Type: ${workType}`);
    console.log(`   Category: ${category}`);
    console.log(`   Sprint: ${sprintNumber}`);
    console.log(`   Priority: ${priority}`);
    console.log(`   Status: ${status}`);
    console.log(`   Estimated: ${estimatedHours}h`);
    if (actualHours > 0) {
      console.log(`   Actual: ${actualHours}h`);
    }
    console.log('');
    console.log('🔗 View in Notion:');
    console.log(`   ${createdItem.url}`);
    console.log('');
    console.log('📊 Sprint Updated:');
    console.log(`   Work Items: +1`);
    console.log(`   Total Hours: +${estimatedHours}h (estimated)`);
    console.log('');
    console.log('✅ Done!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error creating work item:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
  }
}

createWorkItem();
