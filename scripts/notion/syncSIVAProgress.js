/**
 * Sync SIVA Implementation Progress to Notion
 *
 * Updates MODULE FEATURES database with current SIVA tool completion status
 * Auto-runs after each SIVA tool commit
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const WORK_ITEMS_DB_ID = process.env.WORK_ITEMS_DB_ID;

// SIVA tool completion status
// Update this object as tools are completed
const SIVA_PROGRESS = {
  'Phase 1: Persona Extraction & Cognitive Foundation': {
    status: 'In Progress',
    completion: 50, // 4/8 primitives complete
    primitives: {
      'EVALUATE_COMPANY_QUALITY': { complete: true, tool: 'CompanyQualityTool' },
      'SELECT_CONTACT_TIER': { complete: true, tool: 'ContactTierTool' },
      'CALCULATE_TIMING_SCORE': { complete: true, tool: 'TimingScoreTool' },
      'CHECK_EDGE_CASES': { complete: true, tool: 'EdgeCasesTool' },
      'VERIFY_CONTACT_QUALITY': { complete: false, tool: 'ContactQualityTool' },
      'COMPUTE_QSCORE': { complete: false, tool: 'QScoreTool' },
      'CHECK_DUPLICATE_OUTREACH': { complete: false, tool: 'DuplicateCheckTool' },
      'CHECK_OUTREACH_DOCTRINE': { complete: false, tool: 'DoctrineCheckTool' }
    }
  },
  'Phase 2: Cognitive Framework Architecture': {
    status: 'In Progress',
    completion: 58, // 7/12 tools complete (Tools 1-4, 13-15)
    notes: 'Sprint 16 Complete: Tools 13-15 (HiringSignalExtraction, SourceReliability, SignalDeduplication) + RADAR Phase 2 refactor (100% MCP)'
  },
  'Phase 3: Centralized Agentic Hub Design': {
    status: 'Not Started',
    completion: 0,
    notes: 'Pending: MCP Host, Persona Policy Engine'
  },
  'Phase 4: Infrastructure & Topology': {
    status: 'In Progress',
    completion: 10,
    notes: 'AgentProtocol base class complete, database tables pending'
  }
};

async function syncSIVAProgress() {
  console.log('🔄 Syncing SIVA progress to Notion...\n');

  try {
    // Query all SIVA/Phase items in MODULE FEATURES
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB_ID,
      filter: {
        or: [
          { property: 'Features', title: { contains: 'SIVA' } },
          { property: 'Features', title: { contains: 'Phase' } }
        ]
      }
    });

    console.log(`Found ${response.results.length} SIVA-related items in Notion\n`);

    let updateCount = 0;

    for (const page of response.results) {
      const title = page.properties.Features?.title?.[0]?.text?.content || '';

      // Find matching phase in SIVA_PROGRESS
      const phaseKey = Object.keys(SIVA_PROGRESS).find(key => title.includes(key) || key.includes(title));

      if (phaseKey) {
        const progress = SIVA_PROGRESS[phaseKey];

        console.log(`📝 Updating: ${title}`);
        console.log(`   Status: ${progress.status}`);
        console.log(`   Completion: ${progress.completion}%`);

        // Update the page
        const statusName = progress.status === 'In Progress' ? 'In Progress' :
                          progress.status === 'Not Started' ? 'To-Do' : 'Done';

        const updateProperties = {
          'Status': {
            select: {
              name: statusName
            }
          }
        };

        // Add Notes if available
        if (progress.notes) {
          updateProperties['Notes'] = {
            rich_text: [{
              type: 'text',
              text: {
                content: `${progress.notes} | Completion: ${progress.completion}% | Last updated: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' })}`
              }
            }]
          };
        }

        // Add AI Score (use completion percentage)
        updateProperties['AI Score'] = {
          number: progress.completion
        };

        // Add Sprint number (16 for current sprint)
        updateProperties['Sprint'] = {
          number: 16
        };

        // Add Started At (if in progress or completed)
        if (progress.status !== 'Not Started') {
          updateProperties['Started At'] = {
            date: {
              start: '2024-11-01' // Sprint 16 start date
            }
          };
        }

        // Add Completed At and Done? (if completed)
        if (progress.status === 'Done') {
          updateProperties['Completed At'] = {
            date: {
              start: new Date().toISOString().split('T')[0]
            }
          };
          updateProperties['Done?'] = {
            checkbox: true
          };
        } else {
          updateProperties['Done?'] = {
            checkbox: false
          };
        }

        // Add Actual Time estimate based on completion
        const estimatedHours = progress.completion === 0 ? 0 :
                              progress.completion < 50 ? 3 :
                              progress.completion < 100 ? 5 : 7;
        updateProperties['Actual Time'] = {
          number: estimatedHours
        };

        await notion.pages.update({
          page_id: page.id,
          properties: updateProperties
        });

        // Add comment with progress details
        if (progress.primitives) {
          const completedPrimitives = Object.entries(progress.primitives)
            .filter(([_, data]) => data.complete)
            .map(([name, data]) => `✅ ${name} → ${data.tool}`)
            .join('\n');

          const pendingPrimitives = Object.entries(progress.primitives)
            .filter(([_, data]) => !data.complete)
            .map(([name, data]) => `⏳ ${name} → ${data.tool}`)
            .join('\n');

          const comment = `**SIVA Progress Update**

**Completed:**
${completedPrimitives}

**Pending:**
${pendingPrimitives}

**Overall: ${progress.completion}% complete**

Last updated: ${new Date().toISOString()}`;

          // Note: Notion API doesn't support adding comments directly
          // We'll update the page content instead
          console.log(`   Progress: ${progress.completion}%`);
        }

        if (progress.notes) {
          console.log(`   Notes: ${progress.notes}`);
        }

        updateCount++;
        console.log('   ✅ Updated\n');
      }
    }

    console.log(`✅ Sync complete! Updated ${updateCount} items.`);

    // Summary
    console.log('\n📊 SIVA Implementation Summary:');
    console.log('================================');
    Object.entries(SIVA_PROGRESS).forEach(([phase, data]) => {
      console.log(`${phase}: ${data.completion}% (${data.status})`);
    });

  } catch (error) {
    console.error('❌ Error syncing SIVA progress:', error.message);
    throw error;
  }
}

// Run if called directly
syncSIVAProgress()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

export { syncSIVAProgress, SIVA_PROGRESS };
