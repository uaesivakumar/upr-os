#!/usr/bin/env node

/**
 * Comprehensively update Sprint 46 with all details
 */

import { Client } from '@notionhq/client';
import { readFileSync } from 'fs';

const dbIds = JSON.parse(readFileSync('./.notion-db-ids.json', 'utf-8'));
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function updateSprint46Complete() {
  try {
    console.log('🔍 Finding Sprint 46...');

    // Find Sprint 46
    const response = await notion.databases.query({
      database_id: dbIds.sprints_db_id,
      filter: {
        property: 'Sprint',
        title: {
          equals: 'Sprint 46'
        }
      }
    });

    if (response.results.length === 0) {
      console.error('❌ Sprint 46 not found');
      return;
    }

    const sprint46 = response.results[0];
    console.log(`✅ Found Sprint 46: ${sprint46.id}`);

    // Update all properties
    console.log('📝 Updating all Sprint 46 properties...');

    const today = new Date().toISOString().split('T')[0];

    await notion.pages.update({
      page_id: sprint46.id,
      properties: {
        'Status': {
          select: {
            name: 'Complete'
          }
        },
        'Started At': {
          date: {
            start: '2025-11-20'
          }
        },
        'Completed At': {
          date: {
            start: today
          }
        },
        'Synced At': {
          date: {
            start: today
          }
        },
        'Commits Count': {
          number: 1
        },
        'Branch': {
          rich_text: [
            {
              text: {
                content: 'main'
              }
            }
          ]
        },
        'Commit': {
          rich_text: [
            {
              text: {
                content: 'ad0920d - feat(sprint-46): Meta-Cognitive Reflection System'
              }
            }
          ]
        },
        'Git Tag': {
          rich_text: [
            {
              text: {
                content: 'sprint-46'
              }
            }
          ]
        },
        'Highlights': {
          rich_text: [
            {
              text: {
                content: '8 services (6,500+ lines) • 144/146 tests passed (98.6%) • 5 maturity levels • 12+ metrics • 7 fallacy types • 8 bias types • 6 consensus methods'
              }
            }
          ]
        },
        'Outcomes': {
          rich_text: [
            {
              text: {
                content: 'Complete meta-cognitive reflection system enabling agents to analyze their own thinking, learn from mistakes, collaborate effectively, and continuously improve through data-driven insights. Checkpoint 1: 95.7%, Checkpoint 2: 100%, Checkpoint 3: 100%.'
              }
            }
          ]
        },
        'Business Value': {
          rich_text: [
            {
              text: {
                content: 'Enables autonomous agent self-improvement through systematic reflection, mistake learning, and performance analytics. Agents can now self-assess, detect cognitive biases, collaborate on decisions, and receive personalized improvement recommendations with validated impact tracking.'
              }
            }
          ]
        },
        'Sprint Notes': {
          rich_text: [
            {
              text: {
                content: 'Phase 1: Reasoning Quality + Meta-Cognitive Engine. Phase 2: Self-Assessment + Mistake Learning + Collaborative Decisions. Phase 3: Reflection Feedback + Analytics + Recommendations. Database: 8 tables, 3 views, 3 functions. Algorithm-focused testing strategy successful.'
              }
            }
          ]
        },
        'Learnings': {
          rich_text: [
            {
              text: {
                content: 'Systematic checkpoint approach caught issues early. Algorithm-focused testing avoided database complexity. Weighted scoring systems provided nuanced evaluation. Mock data strategy effectively demonstrated algorithms. Singleton pattern maintained consistency across services.'
              }
            }
          ]
        }
      }
    });

    console.log('✅ All Sprint 46 properties updated');

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Sprint 46 Fully Updated in Notion!');
    console.log('='.repeat(60));
    console.log('Updated Properties:');
    console.log('  ✅ Status → Complete');
    console.log('  ✅ Started At → 2025-11-20');
    console.log(`  ✅ Completed At → ${today}`);
    console.log(`  ✅ Synced At → ${today}`);
    console.log('  ✅ Commits Count → 1');
    console.log('  ✅ Branch → main');
    console.log('  ✅ Commit → ad0920d');
    console.log('  ✅ Git Tag → sprint-46');
    console.log('  ✅ Highlights → Added');
    console.log('  ✅ Outcomes → Added');
    console.log('  ✅ Business Value → Added');
    console.log('  ✅ Sprint Notes → Added');
    console.log('  ✅ Learnings → Added');
    console.log('\n📊 Sprint 46 page is now complete!\n');

  } catch (error) {
    console.error('❌ Error updating Sprint 46:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

updateSprint46Complete();
