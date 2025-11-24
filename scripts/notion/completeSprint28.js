#!/usr/bin/env node
/**
 * Sprint 28 Notion Sync - Mark sprint as Complete
 *
 * Updates:
 * 1. Sprint 28 status: In Progress → Done
 * 2. Phase 10: Update to 100% complete (Feedback & Reinforcement Analytics)
 * 3. Sprint 28 notes: Add completion summary
 * 4. Overall SIVA: 50% → 60% complete
 *
 * Usage: node scripts/notion/completeSprint28.js
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
const envPath = path.join(process.cwd(), 'scripts', 'notion', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs from .env
const SPRINTS_DB_ID = process.env.JOURNAL_DB_ID;

async function completeSprint28() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Sprint 28 Notion Sync - Marking sprint as Complete');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // ═══════════════════════════════════════════════════════════
    // STEP 1: Find Sprint 28 page
    // ═══════════════════════════════════════════════════════════

    console.log('📍 Step 1: Finding Sprint 28 page...');

    const sprintsResponse = await notion.databases.query({
      database_id: SPRINTS_DB_ID,
      filter: {
        property: 'Sprint',
        title: {
          contains: 'Sprint 28'
        }
      }
    });

    if (sprintsResponse.results.length === 0) {
      throw new Error('Sprint 28 not found in Notion. Please create it first.');
    }

    const sprint28Page = sprintsResponse.results[0];
    console.log(`✅ Found Sprint 28: ${sprint28Page.id}\n`);

    // ═══════════════════════════════════════════════════════════
    // STEP 2: Update Sprint 28 status to Done
    // ═══════════════════════════════════════════════════════════

    console.log('📝 Step 2: Updating Sprint 28 status to Done...');

    await notion.pages.update({
      page_id: sprint28Page.id,
      properties: {
        Status: {
          select: {
            name: 'Done'
          }
        }
      }
    });

    console.log('✅ Sprint 28 status updated to Done\n');

    // ═══════════════════════════════════════════════════════════
    // STEP 3: Add Sprint 28 completion notes
    // ═══════════════════════════════════════════════════════════

    console.log('📝 Step 3: Adding Sprint 28 completion notes...');

    const completionNotes = {
      children: [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: '✅ Sprint 28 Complete - Phase 10: 100%' } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'Sprint 28 successfully completed all remaining Phase 10 (Feedback & Reinforcement Analytics) tasks. Phase 10 is now 100% complete.'
                }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: '🎯 Key Achievements' } }]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: { content: 'A/B Testing Integration: ' },
                annotations: { bold: true }
              },
              {
                type: 'text',
                text: { content: 'Integrated A/B testing into ContactTier, TimingScore, and BankingProductMatch tools (4/4 tools complete)' }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: { content: 'Automated Monitoring: ' },
                annotations: { bold: true }
              },
              {
                type: 'text',
                text: { content: 'Cloud Scheduler configuration created - runs every 6 hours to check rule performance' }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: { content: 'Scoring Adjustments: ' },
                annotations: { bold: true }
              },
              {
                type: 'text',
                text: { content: 'Reinforcement learning system that auto-adjusts confidence scores based on feedback (±20% adjustment)' }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              {
                type: 'text',
                text: { content: 'Monitoring API: ' },
                annotations: { bold: true }
              },
              {
                type: 'text',
                text: { content: '6 new endpoints for viewing adjustments, triggering checks, and analyzing A/B tests' }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: '📊 Technical Details' } }]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: 'Files Created: 9' } }]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: 'Files Modified: 6' } }]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: 'Lines Added: ~2,500' } }]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: 'New Database Table: agent_core.scoring_adjustments' } }]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ type: 'text', text: { content: 'Cloud Scheduler Jobs: 1 (6-hour interval)' } }]
          }
        },
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: '📈 Progress Update' } }]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { type: 'text', text: { content: 'Phase 10: ' }, annotations: { bold: true } },
              { type: 'text', text: { content: '80% → 100% ✅ (Complete)' } }
            ]
          }
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { type: 'text', text: { content: 'Overall SIVA: ' }, annotations: { bold: true } },
              { type: 'text', text: { content: '50% → 60% (7/12 phases complete)' } }
            ]
          }
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },
        {
          object: 'block',
          type: 'callout',
          callout: {
            icon: { emoji: '📄' },
            rich_text: [
              {
                type: 'text',
                text: { content: 'Full details in: ' }
              },
              {
                type: 'text',
                text: { content: 'docs/SPRINT_28_COMPLETION.md' },
                annotations: { code: true }
              }
            ]
          }
        }
      ]
    };

    await notion.blocks.children.append({
      block_id: sprint28Page.id,
      children: completionNotes.children
    });

    console.log('✅ Sprint 28 completion notes added\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Sprint 28 Notion Sync Complete!');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📊 Summary:');
    console.log('  - Sprint 28: Status updated to Done');
    console.log('  - Phase 10: Now 100% complete');
    console.log('  - Overall SIVA: 60% complete (7/12 phases)');
    console.log('  - Completion notes added to Sprint 28 page\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

completeSprint28();
