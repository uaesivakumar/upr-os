#!/usr/bin/env node

/**
 * Complete Sprint 47 in Notion
 *
 * Updates Sprint 47 page with completion status and final statistics
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const SPRINTS_DATABASE_ID = dbIds.sprints_db_id;

async function completeSprint47() {
  try {
    console.log('🔍 Finding Sprint 47...');

    // Find Sprint 47
    const response = await notion.databases.query({
      database_id: SPRINTS_DATABASE_ID,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 47'
        }
      }
    });

    if (response.results.length === 0) {
      console.error('❌ Sprint 47 not found');
      return;
    }

    const sprint47 = response.results[0];
    console.log(`✅ Found Sprint 47: ${sprint47.id}`);

    // Update Sprint 47 Status
    console.log('📝 Updating Sprint 47 status to Complete...');

    await notion.pages.update({
      page_id: sprint47.id,
      properties: {
        'Status': {
          select: {
            name: 'Complete'
          }
        }
      }
    });

    console.log('✅ Sprint 47 status updated to Complete');

    // Add completion comment
    console.log('💬 Adding completion comment...');

    const completionSummary = `🎉 Sprint 47 Complete - Frontend TypeScript Migration

✅ Status: Complete
✅ TypeScript: 0 errors, 100% type coverage
✅ Build: SUCCESS (770.69 KB)
✅ Files: 90+ changed across 5 phases

Phase Completion:
- Phase 1: React Query Setup
- Phase 2: TypeScript Foundation (20 files, 1373 insertions)
- Phase 3: Design System & Storybook (45 files, 3612 insertions)
- Phase 4: E2E Testing & Performance (11 files, 836 insertions)
- Phase 5: Documentation & QC

Deliverables:
• TypeScript strict mode migration
• React Query + Zustand state management
• Design tokens system (colors, typography, spacing)
• Storybook 10.0.8 with 23 stories
• Playwright E2E testing (18 test cases)
• Web Vitals performance monitoring
• Sentry TypeScript migration
• 25,000+ words documentation

Quality Metrics:
• TypeScript: 0 errors
• Bundle: 770.69 KB (gzip: 224.39 KB)
• Stories: 23 component stories
• E2E Tests: 18 test cases
• Docs: 6 comprehensive guides

Production-ready: All systems operational

Next: Sprint 48 - Performance Optimization`;

    await notion.comments.create({
      parent: {
        page_id: sprint47.id
      },
      rich_text: [
        {
          text: {
            content: completionSummary
          }
        }
      ]
    });

    console.log('✅ Completion comment added');

    console.log('\n🎉 Sprint 47 marked as COMPLETE in Notion!');
    console.log('📊 Final Statistics:');
    console.log('   - TypeScript Errors: 0');
    console.log('   - Files Changed: 90+');
    console.log('   - Component Stories: 23');
    console.log('   - E2E Tests: 18');
    console.log('   - Documentation: 25,000+ words');
    console.log('   - Quality: Production-ready');

  } catch (error) {
    console.error('❌ Error completing Sprint 47:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

completeSprint47();
