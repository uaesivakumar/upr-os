/**
 * Enhanced SIVA Progress Sync - With Documentation Upload
 *
 * Updates MODULE FEATURES database with:
 * - Tool completion status
 * - Documentation files uploaded to "Files & media" property
 * - Consolidated progress reports
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const WORK_ITEMS_DB_ID = process.env.WORK_ITEMS_DB_ID;

// SIVA tool completion status (UPDATED with all 4 completed tools)
const SIVA_PROGRESS = {
  'Phase 1: Persona Extraction & Cognitive Foundation': {
    status: 'In Progress',
    completion: 50, // 4/8 primitives complete
    primitives: {
      'EVALUATE_COMPANY_QUALITY': { complete: true, tool: 'CompanyQualityTool', toolNum: 1 },
      'SELECT_CONTACT_TIER': { complete: true, tool: 'ContactTierTool', toolNum: 2 },
      'CALCULATE_TIMING_SCORE': { complete: true, tool: 'TimingScoreTool', toolNum: 3 },
      'CHECK_EDGE_CASES': { complete: true, tool: 'EdgeCasesTool', toolNum: 4 },
      'VERIFY_CONTACT_QUALITY': { complete: false, tool: 'ContactQualityTool', toolNum: 5 },
      'COMPUTE_QSCORE': { complete: false, tool: 'QScoreTool', toolNum: 6 },
      'CHECK_DUPLICATE_OUTREACH': { complete: false, tool: 'DuplicateCheckTool', toolNum: 7 },
      'CHECK_OUTREACH_DOCTRINE': { complete: false, tool: 'DoctrineCheckTool', toolNum: 8 }
    },
    docsDir: 'server/siva-tools/docs',
    docs: [
      'Tool_1_CompanyQuality_Summary.md',
      'Tool_2_ContactTier_Summary.md',
      'Tool_3_TimingScore_Summary.md',
      'Tool_4_EdgeCases_Summary.md',
      'Phase_1_Consolidated_Progress.md'
    ]
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

/**
 * Upload file to Notion page's "Files & media" property
 * Note: Notion API doesn't support direct file uploads to properties.
 * Instead, we'll add files as blocks to the page content.
 */
async function uploadDocumentationToPage(pageId, docs) {
  console.log('   📎 Uploading documentation files...');

  const blocks = [];

  // Add header
  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: {
      rich_text: [{
        type: 'text',
        text: { content: '📚 Implementation Documentation' }
      }]
    }
  });

  blocks.push({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{
        type: 'text',
        text: { content: `Auto-generated documentation for completed SIVA tools. Last updated: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' })} (Dubai time)` }
      }]
    }
  });

  // Add each doc as a callout block with content preview
  for (const docFile of docs) {
    const docPath = path.join(process.cwd(), SIVA_PROGRESS['Phase 1: Persona Extraction & Cognitive Foundation'].docsDir, docFile);

    if (fs.existsSync(docPath)) {
      const content = fs.readFileSync(docPath, 'utf-8');
      const firstLines = content.split('\n').slice(0, 5).join('\n');

      blocks.push({
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [{
            type: 'text',
            text: { content: `📄 ${docFile}\n\n${firstLines}...` },
            annotations: { code: false }
          }],
          icon: { emoji: '📄' },
          color: 'blue_background'
        }
      });

      // Add link to full content (we'll create a toggle block with full content)
      blocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{
            type: 'text',
            text: { content: `View full content: ${docFile}` },
            annotations: { bold: true }
          }],
          children: [{
            object: 'block',
            type: 'code',
            code: {
              rich_text: [{
                type: 'text',
                text: { content: content.substring(0, 2000) } // Notion has 2000 char limit per block
              }],
              language: 'markdown'
            }
          }]
        }
      });
    }
  }

  // Append blocks to page
  try {
    // First, get existing blocks to avoid duplication
    const existingBlocks = await notion.blocks.children.list({
      block_id: pageId,
      page_size: 100
    });

    // Check if documentation section already exists
    const hasDocSection = existingBlocks.results.some(block =>
      block.type === 'heading_2' &&
      block.heading_2?.rich_text?.[0]?.text?.content?.includes('Implementation Documentation')
    );

    if (hasDocSection) {
      console.log('   ⚠️  Documentation section already exists, skipping upload');
      console.log('   💡 To update docs, manually delete the existing section in Notion first');
      return;
    }

    // Append new blocks
    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks
    });

    console.log(`   ✅ Uploaded ${docs.length} documentation files`);
  } catch (error) {
    console.error(`   ❌ Error uploading docs: ${error.message}`);
  }
}

async function syncSIVAProgress() {
  console.log('🔄 Enhanced SIVA Progress Sync (with documentation upload)...\n');

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
    let docsUploadedCount = 0;

    for (const page of response.results) {
      const title = page.properties.Features?.title?.[0]?.text?.content || '';

      // Find matching phase in SIVA_PROGRESS
      const phaseKey = Object.keys(SIVA_PROGRESS).find(key => title.includes(key) || key.includes(title));

      if (phaseKey) {
        const progress = SIVA_PROGRESS[phaseKey];

        console.log(`📝 Updating: ${title}`);
        console.log(`   Status: ${progress.status}`);
        console.log(`   Completion: ${progress.completion}%`);

        // Update the page properties
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
        // (This is an estimate - can be adjusted)
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

        // Upload documentation if available
        if (progress.docs && progress.docs.length > 0) {
          await uploadDocumentationToPage(page.id, progress.docs);
          docsUploadedCount += progress.docs.length;
        }

        // Log progress details
        if (progress.primitives) {
          const completedCount = Object.values(progress.primitives).filter(p => p.complete).length;
          const totalCount = Object.keys(progress.primitives).length;
          console.log(`   Progress: ${completedCount}/${totalCount} primitives (${progress.completion}%)`);
        }

        if (progress.notes) {
          console.log(`   Notes: ${progress.notes}`);
        }

        updateCount++;
        console.log('   ✅ Updated\n');
      }
    }

    console.log(`✅ Sync complete!`);
    console.log(`   Updated ${updateCount} phase items`);
    console.log(`   Uploaded ${docsUploadedCount} documentation files`);

    // Summary
    console.log('\n📊 SIVA Implementation Summary:');
    console.log('================================');
    Object.entries(SIVA_PROGRESS).forEach(([phase, data]) => {
      const completedPrimitives = data.primitives ?
        Object.values(data.primitives).filter(p => p.complete).length : 0;
      const totalPrimitives = data.primitives ? Object.keys(data.primitives).length : 0;

      console.log(`${phase}:`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Completion: ${data.completion}%`);
      if (completedPrimitives > 0) {
        console.log(`  Primitives: ${completedPrimitives}/${totalPrimitives} complete`);
      }
      console.log();
    });

  } catch (error) {
    console.error('❌ Error syncing SIVA progress:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
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
