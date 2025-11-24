/**
 * Create SIVA Tool Entry (Automated)
 *
 * Usage: node scripts/notion/createSIVATool.js
 *
 * Automates SIVA tool creation in Notion:
 * - Prompts for tool details
 * - Links to sprint automatically
 * - Uses templates for common properties
 * - Updates sprint totals
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const SPRINTS_DB_ID = process.env.SPRINTS_DB_ID;
const SIVA_TOOLS_DB_ID = process.env.SIVA_TOOLS_DB_ID;

// Tool type templates
const TOOL_TEMPLATES = {
  STRICT: {
    type: 'STRICT',
    testCoverage: 'All Tests Pass',
    estimatedHours: 1.5
  },
  DELEGATED: {
    type: 'DELEGATED',
    testCoverage: 'Requires API Key',
    estimatedHours: 2.5
  }
};

// Primitive to Phase mapping
const PRIMITIVE_PHASE_MAP = {
  'EVALUATE_COMPANY_QUALITY': 'Phase 1: Persona Extraction',
  'SELECT_CONTACT_TIER': 'Phase 1: Persona Extraction',
  'CALCULATE_TIMING_SCORE': 'Phase 1: Persona Extraction',
  'CHECK_EDGE_CASES': 'Phase 1: Persona Extraction',
  'SCORE_CONTACT_QUALITY': 'Phase 1: Persona Extraction',
  'CALCULATE_Q_SCORE': 'Phase 1: Persona Extraction',
  'CHECK_DUPLICATE_CONTACTS': 'Phase 1: Persona Extraction',
  'SELECT_BANKING_PRODUCT': 'Phase 1: Persona Extraction',
  'EXTRACT_HIRING_SIGNALS': 'Phase 2: Cognitive Framework',
  'SCORE_SOURCE_RELIABILITY': 'Phase 2: Cognitive Framework',
  'CHECK_SIGNAL_DUPLICATION': 'Phase 2: Cognitive Framework',
  'SELECT_OUTREACH_CHANNEL': 'Phase 3: Orchestration',
  'GENERATE_OPENING_CONTEXT': 'Phase 3: Orchestration',
  'CALCULATE_COMPOSITE_SCORE': 'Phase 3: Orchestration'
};

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

// Helper: Validate primitive name
function getPrimitiveOptions() {
  return Object.keys(PRIMITIVE_PHASE_MAP);
}

async function createSIVATool() {
  console.log('🔧 SIVA Tool Creator\n');
  console.log('This script automates SIVA tool entry creation in Notion.\n');

  try {
    // ================================================================
    // STEP 1: Gather Tool Information
    // ================================================================
    console.log('📝 Enter Tool Information:\n');

    const toolNumber = parseInt(await prompt('Tool Number (e.g., 5): '));
    const toolName = await prompt('Tool Name (e.g., ContactQualityTool): ');
    const sprintNumber = parseInt(await prompt('Sprint Number (e.g., 17): '));

    console.log('\n📋 Available Primitives:');
    const primitiveOptions = getPrimitiveOptions();
    primitiveOptions.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p}`);
    });

    const primitiveIndex = parseInt(await prompt('\nSelect Primitive (1-14): ')) - 1;
    const primitive = primitiveOptions[primitiveIndex];
    const phase = PRIMITIVE_PHASE_MAP[primitive];

    console.log('\n🔧 Tool Type:');
    console.log('   1. STRICT (deterministic, no LLM)');
    console.log('   2. DELEGATED (uses LLM/GPT-4)');
    const toolTypeIndex = parseInt(await prompt('\nSelect Type (1-2): '));
    const toolType = toolTypeIndex === 1 ? 'STRICT' : 'DELEGATED';
    const template = TOOL_TEMPLATES[toolType];

    const purpose = await prompt('\nPurpose (one sentence): ');
    const businessValue = await prompt('Business Value (key benefits, one per line): ');
    const deliverables = await prompt('Deliverables (e.g., ✅ Algorithm, ✅ Tests): ');

    console.log('\n⏱️  Time Tracking:');
    const status = await prompt('Status (To-Do/In Progress/Done): ');
    const completion = status === 'Done' ? 100 : status === 'In Progress' ? 50 : 0;

    let startedAt = null;
    let completedAt = null;
    let actualHours = template.estimatedHours;

    if (status !== 'To-Do') {
      startedAt = await prompt('Started At (YYYY-MM-DD): ');
      actualHours = parseFloat(await prompt(`Actual Hours (default ${template.estimatedHours}h): `) || template.estimatedHours);
    }

    if (status === 'Done') {
      completedAt = await prompt('Completed At (YYYY-MM-DD): ');
    }

    const integration = await prompt('\nIntegration (where used): ');
    const dependencies = await prompt('Dependencies (comma-separated, or leave empty): ');
    const notes = await prompt('Notes (optional): ');

    // ================================================================
    // STEP 2: Find Sprint in Notion
    // ================================================================
    console.log('\n🔍 Finding Sprint in Notion...');
    const sprint = await getSprintByNumber(sprintNumber);

    if (!sprint) {
      console.error(`❌ Sprint ${sprintNumber} not found in Notion!`);
      console.error('Create it first using scripts/notion/populateSprints.js');
      process.exit(1);
    }

    console.log(`✅ Found Sprint ${sprintNumber}: ${sprint.properties.Sprint.title[0].text.content}`);

    // ================================================================
    // STEP 3: Create Tool Entry
    // ================================================================
    console.log('\n📤 Creating tool entry in Notion...');

    const deps = dependencies
      ? dependencies.split(',').map(d => ({ name: d.trim() }))
      : [];

    const toolData = {
      parent: { database_id: SIVA_TOOLS_DB_ID },
      properties: {
        'Tool Name': {
          title: [{ text: { content: `Tool ${toolNumber}: ${toolName}` } }]
        },
        'Tool Number': { number: toolNumber },
        'Sprint': { relation: [{ id: sprint.id }] },
        'Phase': { rich_text: [{ text: { content: phase } }] },
        'Primitive': { select: { name: primitive } },
        'Type': { select: { name: toolType } },
        'Purpose': { rich_text: [{ text: { content: purpose } }] },
        'Business Value': { rich_text: [{ text: { content: businessValue } }] },
        'Status': { select: { name: status } },
        'Completion %': { number: completion },
        'Deliverables': { rich_text: [{ text: { content: deliverables } }] },
        'Test Coverage': { select: { name: template.testCoverage } },
        'Integration': { rich_text: [{ text: { content: integration } }] }
      }
    };

    // Add optional properties
    if (startedAt) {
      toolData.properties['Started At'] = { date: { start: startedAt } };
    }

    if (completedAt) {
      toolData.properties['Completed At'] = { date: { start: completedAt } };
    }

    if (actualHours) {
      toolData.properties['Actual Time (Hours)'] = { number: actualHours };
    }

    if (deps.length > 0) {
      toolData.properties['Dependencies'] = { multi_select: deps };
    }

    if (notes) {
      toolData.properties['Notes'] = { rich_text: [{ text: { content: notes } }] };
    }

    const createdTool = await notion.pages.create(toolData);

    console.log('✅ Tool created successfully!\n');

    // ================================================================
    // STEP 4: Summary
    // ================================================================
    console.log('='.repeat(80));
    console.log('📦 SIVA Tool Created\n');
    console.log(`   Tool: Tool ${toolNumber}: ${toolName}`);
    console.log(`   Sprint: ${sprintNumber}`);
    console.log(`   Phase: ${phase}`);
    console.log(`   Primitive: ${primitive}`);
    console.log(`   Type: ${toolType}`);
    console.log(`   Status: ${status} (${completion}%)`);
    console.log(`   Hours: ${actualHours}h`);
    console.log('');
    console.log('🔗 View in Notion:');
    console.log(`   ${createdTool.url}`);
    console.log('');
    console.log('📊 Sprint Updated:');
    console.log(`   Tools Count: +1`);
    console.log(`   Total Hours: +${actualHours}h (via rollup)`);
    console.log('');
    console.log('✅ Done!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error creating tool:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
  }
}

createSIVATool();
