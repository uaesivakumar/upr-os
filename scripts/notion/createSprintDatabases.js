/**
 * Create Sprint-Centric Notion Databases
 *
 * Creates:
 * 1. SPRINTS (master database)
 * 2. SIVA Tools & Primitives (domain-specific, sprint-linked)
 * 3. WORK ITEMS (universal work tracking, sprint-linked)
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;

async function createDatabases() {
  console.log('🏗️  Creating Sprint-Centric Databases...\n');

  try {
    // ================================================================
    // DATABASE 1: SPRINTS (Master Database)
    // ================================================================
    console.log('📊 Creating SPRINTS database...');

    const sprintsDb = await notion.databases.create({
      parent: { page_id: PARENT_PAGE_ID },
      title: [{ text: { content: 'SPRINTS' } }],
      properties: {
        'Sprint': {
          title: {}
        },
        'Sprint Number': {
          number: {}
        },
        'Status': {
          select: {
            options: [
              { name: 'Closed', color: 'green' },
              { name: 'Active', color: 'blue' },
              { name: 'Planned', color: 'gray' }
            ]
          }
        },
        'Start Date': {
          date: {}
        },
        'End Date': {
          date: {}
        },
        'Duration (Days)': {
          number: {}
        },
        'Goal': {
          rich_text: {}
        },
        'Business Value': {
          rich_text: {}
        },
        'Total Hours': {
          number: {}
        },
        'Tools Count': {
          number: {}
        },
        'Phases Updated': {
          rich_text: {}
        },
        'Git Tag': {
          rich_text: {}
        },
        'Git Commits': {
          rich_text: {}
        },
        'Notes': {
          rich_text: {}
        }
      }
    });

    console.log(`✅ Created SPRINTS database: ${sprintsDb.id}\n`);

    // Store the database ID
    const SPRINTS_DB_ID = sprintsDb.id;

    // ================================================================
    // DATABASE 2: SIVA Tools & Primitives (Sprint-Linked)
    // ================================================================
    console.log('📊 Creating SIVA Tools & Primitives database...');

    const toolsDb = await notion.databases.create({
      parent: { page_id: PARENT_PAGE_ID },
      title: [{ text: { content: 'SIVA Tools & Primitives' } }],
      properties: {
        'Tool Name': {
          title: {}
        },
        'Tool Number': {
          number: {}
        },
        'Sprint': {
          relation: {
            database_id: SPRINTS_DB_ID,
            single_property: {}
          }
        },
        'Phase': {
          rich_text: {}
        },
        'Primitive': {
          select: {
            options: [
              { name: 'EVALUATE_COMPANY_QUALITY', color: 'blue' },
              { name: 'SELECT_CONTACT_TIER', color: 'blue' },
              { name: 'CALCULATE_TIMING_SCORE', color: 'blue' },
              { name: 'CHECK_EDGE_CASES', color: 'blue' },
              { name: 'EXTRACT_HIRING_SIGNALS', color: 'purple' },
              { name: 'SCORE_SOURCE_RELIABILITY', color: 'purple' },
              { name: 'CHECK_SIGNAL_DUPLICATION', color: 'purple' }
            ]
          }
        },
        'Type': {
          select: {
            options: [
              { name: 'STRICT', color: 'green' },
              { name: 'DELEGATED', color: 'orange' }
            ]
          }
        },
        'Purpose': {
          rich_text: {}
        },
        'Business Value': {
          rich_text: {}
        },
        'Status': {
          select: {
            options: [
              { name: 'Done', color: 'green' },
              { name: 'In Progress', color: 'blue' },
              { name: 'To-Do', color: 'gray' }
            ]
          }
        },
        'Completion %': {
          number: {}
        },
        'Actual Time (Hours)': {
          number: {}
        },
        'Started At': {
          date: {}
        },
        'Completed At': {
          date: {}
        },
        'Deliverables': {
          rich_text: {}
        },
        'Test Coverage': {
          select: {
            options: [
              { name: 'All Tests Pass', color: 'green' },
              { name: 'Partial', color: 'yellow' },
              { name: 'No Tests', color: 'red' },
              { name: 'Requires API Key', color: 'gray' }
            ]
          }
        },
        'Integration': {
          rich_text: {}
        },
        'Dependencies': {
          multi_select: {
            options: [
              { name: 'Tool 14', color: 'blue' },
              { name: 'OPENAI_API_KEY', color: 'orange' }
            ]
          }
        },
        'Notes': {
          rich_text: {}
        }
      }
    });

    console.log(`✅ Created SIVA Tools database: ${toolsDb.id}\n`);

    // ================================================================
    // DATABASE 3: WORK ITEMS (Universal Work Tracking)
    // ================================================================
    console.log('📊 Creating WORK ITEMS database...');

    const workItemsDb = await notion.databases.create({
      parent: { page_id: PARENT_PAGE_ID },
      title: [{ text: { content: 'WORK ITEMS' } }],
      properties: {
        'Title': {
          title: {}
        },
        'Type': {
          select: {
            options: [
              { name: 'Feature', color: 'blue' },
              { name: 'Bug Fix', color: 'red' },
              { name: 'Enhancement', color: 'green' },
              { name: 'Data Connection', color: 'purple' },
              { name: 'Refactor', color: 'yellow' },
              { name: 'Documentation', color: 'gray' },
              { name: 'UI/UX', color: 'pink' },
              { name: 'Infrastructure', color: 'brown' }
            ]
          }
        },
        'Sprint': {
          relation: {
            database_id: SPRINTS_DB_ID,
            single_property: {}
          }
        },
        'Category': {
          select: {
            options: [
              { name: 'Frontend', color: 'blue' },
              { name: 'Backend', color: 'green' },
              { name: 'Database', color: 'purple' },
              { name: 'API', color: 'orange' },
              { name: 'Integration', color: 'pink' },
              { name: 'DevOps', color: 'brown' },
              { name: 'Testing', color: 'yellow' },
              { name: 'Security', color: 'red' },
              { name: 'Performance', color: 'default' },
              { name: 'Analytics', color: 'gray' }
            ]
          }
        },
        'Status': {
          select: {
            options: [
              { name: 'To-Do', color: 'gray' },
              { name: 'In Progress', color: 'blue' },
              { name: 'Done', color: 'green' }
            ]
          }
        },
        'Priority': {
          select: {
            options: [
              { name: 'Critical', color: 'red' },
              { name: 'High', color: 'orange' },
              { name: 'Medium', color: 'yellow' },
              { name: 'Low', color: 'gray' }
            ]
          }
        },
        'Description': {
          rich_text: {}
        },
        'Acceptance Criteria': {
          rich_text: {}
        },
        'Estimated Hours': {
          number: {}
        },
        'Actual Hours': {
          number: {}
        },
        'Started At': {
          date: {}
        },
        'Completed At': {
          date: {}
        },
        'Assignee': {
          rich_text: {}
        },
        'Tags': {
          multi_select: {
            options: [
              { name: 'SIVA', color: 'blue' },
              { name: 'RADAR', color: 'purple' },
              { name: 'Critical', color: 'red' },
              { name: 'UI/UX', color: 'pink' },
              { name: 'Settings', color: 'gray' }
            ]
          }
        },
        'Notes': {
          rich_text: {}
        }
      }
    });

    console.log(`✅ Created WORK ITEMS database: ${workItemsDb.id}\n`);

    // ================================================================
    // Save Database IDs to .env
    // ================================================================
    console.log('💾 Saving database IDs to .env...\n');

    const envContent = `# Notion Integration Configuration
NOTION_TOKEN=${process.env.NOTION_TOKEN}
NOTION_PARENT_PAGE_ID=${process.env.NOTION_PARENT_PAGE_ID}

# Database IDs (automatically generated)
MODULES_DB_ID=${process.env.MODULES_DB_ID}
WORK_ITEMS_DB_ID=${workItemsDb.id}
JOURNAL_DB_ID=${process.env.JOURNAL_DB_ID}
SPRINTS_DB_ID=${SPRINTS_DB_ID}
SIVA_TOOLS_DB_ID=${toolsDb.id}
`;

    // Write to both .env locations
    const fs = await import('fs');
    fs.writeFileSync('.env', envContent);
    fs.writeFileSync('scripts/notion/.env', envContent);

    console.log('✅ Database IDs saved to .env\n');

    // ================================================================
    // Summary
    // ================================================================
    console.log('🎉 Sprint-Centric Databases Created!\n');
    console.log('=' .repeat(80));
    console.log('\n📊 SPRINTS Database (Master)');
    console.log(`   ID: ${SPRINTS_DB_ID}`);
    console.log(`   URL: https://notion.so/${SPRINTS_DB_ID.replace(/-/g, '')}`);
    console.log('\n📦 SIVA Tools & Primitives Database (Domain-Specific)');
    console.log(`   ID: ${toolsDb.id}`);
    console.log(`   URL: https://notion.so/${toolsDb.id.replace(/-/g, '')}`);
    console.log('\n📋 WORK ITEMS Database (Universal)');
    console.log(`   ID: ${workItemsDb.id}`);
    console.log(`   URL: https://notion.so/${workItemsDb.id.replace(/-/g, '')}`);
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Next Steps:');
    console.log('   1. Run: npm run sprint:populate (to add Sprint 15-16 data)');
    console.log('   2. Run: npm run sprint:create-tool (to add SIVA tools)');
    console.log('   3. Run: npm run sprint:create-work (to add work items)');
    console.log('   4. View in Notion: UPR Roadmap page');
    console.log('');

  } catch (error) {
    console.error('❌ Error creating databases:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
  }
}

createDatabases();
