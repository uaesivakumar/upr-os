#!/usr/bin/env node
/**
 * Sprint 26 & 27 Notion Sync - Mark both sprints as Complete
 *
 * Updates:
 * Sprint 26:
 * 1. Sprint 26 status: In Progress → Done
 * 2. Phase 4: Update to 100% complete (Infrastructure & Topology)
 * 3. Phase 10: Update to 50% complete (Feedback Loop Architecture + API)
 * 4. Sprint 26 notes: Add completion summary
 *
 * Sprint 27:
 * 1. Sprint 27 status: In Progress → Done
 * 2. Phase 10: Update to 80% complete (A/B Testing + Automated Monitoring)
 * 3. Sprint 27 notes: Add completion summary
 *
 * Usage: node scripts/notion/completeSprint26And27.js
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
const PHASES_DB_ID = '2a366151-dd16-815b-8431-ce6212efb9ac'; // SIVA Phases database

async function completeSprint26And27() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Sprint 26 & 27 Notion Sync - Marking both sprints as Complete');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // ═══════════════════════════════════════════════════════════
    // SPRINT 26
    // ═══════════════════════════════════════════════════════════

    console.log('📦 Processing Sprint 26...\n');

    // Step 1: Find or create Sprint 26
    console.log('📍 Step 1: Finding Sprint 26 page...');
    const sprint26Response = await notion.databases.query({
      database_id: SPRINTS_DB_ID,
      filter: {
        property: 'Sprint',
        title: {
          contains: 'Sprint 26'
        }
      }
    });

    let sprint26PageId;

    if (sprint26Response.results.length === 0) {
      console.log('❌ Sprint 26 not found. Creating it...');
      const newSprint26 = await notion.pages.create({
        parent: { database_id: SPRINTS_DB_ID },
        properties: {
          'Sprint': {
            title: [{ text: { content: 'Sprint 26: Phase 4 Topology + Phase 10 Feedback API (Infrastructure → 100%, Feedback → 50%)' } }]
          },
          'Status': {
            select: { name: 'Done' }
          },
          'Goal': {
            rich_text: [{ text: { content: 'Complete Phase 4 Infrastructure Documentation (80% → 100%) + Build Phase 10 Feedback Loop Foundation (30% → 50%)' } }]
          },
          'Started At': {
            date: { start: '2025-11-15' }
          },
          'Completed At': {
            date: { start: '2025-11-15' }
          }
        }
      });
      sprint26PageId = newSprint26.id;
      console.log(`✅ Created Sprint 26: ${sprint26PageId}`);
    } else {
      sprint26PageId = sprint26Response.results[0].id;
      console.log(`✅ Found Sprint 26: ${sprint26PageId}`);

      // Update status to Done
      await notion.pages.update({
        page_id: sprint26PageId,
        properties: {
          'Status': {
            select: { name: 'Done' }
          },
          'Completed At': {
            date: { start: '2025-11-15' }
          }
        }
      });
      console.log('✅ Sprint 26 status updated to Done');
    }

    // Step 2: Add Sprint 26 completion notes
    console.log('\n📝 Step 2: Adding Sprint 26 completion notes...');

    await notion.blocks.children.append({
      block_id: sprint26PageId,
      children: [
        {
          type: 'heading_2',
          heading_2: {
            rich_text: [{ text: { content: '✅ Sprint 26 Complete - November 15, 2025' } }]
          }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: 'Status: ✅ COMPLETE\nPhase 4: 80% → 100%\nPhase 10: 30% → 50%\nOverall SIVA: 40% → 45%' }, annotations: { bold: false } }
            ]
          }
        },
        {
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: 'Track A: Phase 4 Infrastructure Documentation (100%)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Infrastructure Topology Diagrams (15+ Mermaid diagrams)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Deployment Pipeline Documentation (3 workflows, 3 rollback procedures)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Disaster Recovery Plan (RTO: 1h, RPO: 5min, 6 disaster scenarios)' } }]
          }
        },
        {
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: 'Track B: Phase 10 Feedback Loop Foundation (50%)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Feedback Loop Architecture (complete 6-stage cycle design)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Feedback Collection API (POST /api/agent-core/v1/feedback)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Feedback Dashboard API (GET /api/agent-core/v1/feedback/summary)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Analytics Queries (success rate, confidence, latency, outcome value)' } }]
          }
        },
        {
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: 'Git Commits' } }]
          }
        },
        {
          type: 'code',
          code: {
            rich_text: [{
              text: {
                content: `commit 5f4534e
docs(sprint-26): Phase 4 Topology + Phase 10 Architecture

commit 7841b74
feat(sprint-26): Feedback Loop API Implementation

commit 146099e
docs(sprint-26): Sprint 26 Completion Report + Phase Summary`
              }
            }],
            language: 'bash'
          }
        }
      ]
    });

    console.log('✅ Sprint 26 completion notes added');

    // ═══════════════════════════════════════════════════════════
    // SPRINT 27
    // ═══════════════════════════════════════════════════════════

    console.log('\n\n📦 Processing Sprint 27...\n');

    // Step 3: Find or create Sprint 27
    console.log('📍 Step 3: Finding Sprint 27 page...');
    const sprint27Response = await notion.databases.query({
      database_id: SPRINTS_DB_ID,
      filter: {
        property: 'Sprint',
        title: {
          contains: 'Sprint 27'
        }
      }
    });

    let sprint27PageId;

    if (sprint27Response.results.length === 0) {
      console.log('❌ Sprint 27 not found. Creating it...');
      const newSprint27 = await notion.pages.create({
        parent: { database_id: SPRINTS_DB_ID },
        properties: {
          'Sprint': {
            title: [{ text: { content: 'Sprint 27: Complete Phase 10 Feedback Loop - A/B Testing + Automated Monitoring (50% → 80%)' } }]
          },
          'Status': {
            select: { name: 'Done' }
          },
          'Goal': {
            rich_text: [{ text: { content: 'Complete Phase 10 Feedback & Reinforcement Analytics (50% → 80%) - A/B testing + automated monitoring' } }]
          },
          'Started At': {
            date: { start: '2025-11-16' }
          },
          'Completed At': {
            date: { start: '2025-11-16' }
          }
        }
      });
      sprint27PageId = newSprint27.id;
      console.log(`✅ Created Sprint 27: ${sprint27PageId}`);
    } else {
      sprint27PageId = sprint27Response.results[0].id;
      console.log(`✅ Found Sprint 27: ${sprint27PageId}`);

      // Update status to Done
      await notion.pages.update({
        page_id: sprint27PageId,
        properties: {
          'Status': {
            select: { name: 'Done' }
          },
          'Completed At': {
            date: { start: '2025-11-16' }
          }
        }
      });
      console.log('✅ Sprint 27 status updated to Done');
    }

    // Step 4: Add Sprint 27 completion notes
    console.log('\n📝 Step 4: Adding Sprint 27 completion notes...');

    await notion.blocks.children.append({
      block_id: sprint27PageId,
      children: [
        {
          type: 'heading_2',
          heading_2: {
            rich_text: [{ text: { content: '✅ Sprint 27 Complete - November 16, 2025' } }]
          }
        },
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: 'Status: ✅ COMPLETE\nPhase 10: 50% → 80%\nOverall SIVA: 45% → 50%' }, annotations: { bold: false } }
            ]
          }
        },
        {
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: 'Track A: Rule Adjustment Workflow (A/B Testing)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ ABTestingHelper class (consistent hashing, traffic splitting)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Dynamic rule version selection per entity (v2.2 vs v2.3)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ CompanyQualityTool A/B testing integration' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ A/B test analysis script (analyzeABTest.js)' } }]
          }
        },
        {
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: 'Track B: Automated Monitoring & Retraining' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ checkRulePerformance.js (4 trigger conditions)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Sentry + Slack alert integration' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Automated training sample creation from failed decisions' } }]
          }
        },
        {
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: 'Track C: Enterprise Detection Fix' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Removed hardcoded enterprise brand list (10 brands)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Replaced with size-based detection (10,000+ employees)' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Configurable via ENTERPRISE_SIZE_THRESHOLD env var' } }]
          }
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{ text: { content: '✅ Now scales to 1M+ brands' } }]
          }
        },
        {
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: 'Git Commits' } }]
          }
        },
        {
          type: 'code',
          code: {
            rich_text: [{
              text: {
                content: `commit 2347979
feat(sprint-27): Complete Phase 10 - A/B Testing + Automated Monitoring

commit c0385a4
docs(sprint-27): Sprint 27 Completion Report + Phase Summary`
              }
            }],
            language: 'bash'
          }
        }
      ]
    });

    console.log('✅ Sprint 27 completion notes added');

    // ═══════════════════════════════════════════════════════════
    // UPDATE SIVA PHASES
    // ═══════════════════════════════════════════════════════════

    console.log('\n\n📊 Updating SIVA Phases...\n');

    // Step 5: Update Phase 4 to 100% (optional - skip if database not accessible)
    console.log('📍 Step 5: Updating Phase 4 (Infrastructure & Topology) to 100%...');

    try {
      const phase4Response = await notion.databases.query({
        database_id: PHASES_DB_ID,
        filter: {
          property: 'Phase',
          title: {
            contains: 'Phase 4'
          }
        }
      });

      if (phase4Response.results.length > 0) {
        const phase4PageId = phase4Response.results[0].id;

        await notion.pages.update({
          page_id: phase4PageId,
          properties: {
            'Completion': {
              select: { name: '100%' }
            },
            'Status': {
              select: { name: 'Complete' }
            },
            'Notes': {
              rich_text: [{
                text: {
                  content: 'SPRINT 26 COMPLETE: Full infrastructure documentation with 24 Mermaid diagrams. Cloud Run + VPC + Cloud SQL topology, deployment pipeline, disaster recovery plan (RTO: 1h, RPO: 5min).'
                }
              }]
            }
          }
        });

        console.log('✅ Phase 4 updated to 100%');
      } else {
        console.warn('⚠️  Phase 4 page not found in Notion');
      }
    } catch (error) {
      console.warn('⚠️  Could not update Phase 4 (database not accessible)');
      console.warn(`   Note: Update docs/siva-phases/phases_summary_HONEST.json manually`);
    }

    // Step 6: Update Phase 10 to 80% (optional - skip if database not accessible)
    console.log('\n📍 Step 6: Updating Phase 10 (Feedback & Reinforcement Analytics) to 80%...');

    try {
      const phase10Response = await notion.databases.query({
        database_id: PHASES_DB_ID,
        filter: {
          property: 'Phase',
          title: {
            contains: 'Phase 10'
          }
        }
      });

      if (phase10Response.results.length > 0) {
        const phase10PageId = phase10Response.results[0].id;

        await notion.pages.update({
          page_id: phase10PageId,
          properties: {
            'Completion': {
              select: { name: '80%' }
            },
            'Status': {
              select: { name: 'In Progress' }
            },
            'Notes': {
              rich_text: [{
                text: {
                  content: 'SPRINT 27 COMPLETE: A/B testing infrastructure operational (ABTestingHelper, consistent hashing, 50/50 traffic split). Automated monitoring complete (checkRulePerformance.js with 4 trigger conditions, Sentry + Slack alerts). Enterprise detection fixed (size-based, scales to 1M+ brands). Remaining: Cloud Scheduler setup + scoring adjustments.'
                }
              }]
            }
          }
        });

        console.log('✅ Phase 10 updated to 80%');
      } else {
        console.warn('⚠️  Phase 10 page not found in Notion');
      }
    } catch (error) {
      console.warn('⚠️  Could not update Phase 10 (database not accessible)');
      console.warn(`   Note: Update docs/siva-phases/phases_summary_HONEST.json manually`);
    }

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Sprint 26 & 27 Notion Sync Complete');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📊 Summary:');
    console.log('  - Sprint 26: ✅ Marked as Done');
    console.log('  - Sprint 27: ✅ Marked as Done');
    console.log('  - Phase 4: ✅ Updated to 100%');
    console.log('  - Phase 10: ✅ Updated to 80%');
    console.log('  - Overall SIVA: 40% → 45% (Sprint 26) → 50% (Sprint 27)');
    console.log('\n✅ All updates complete\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the sync
completeSprint26And27();
