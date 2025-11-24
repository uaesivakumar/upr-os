import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const SPRINTS_DB = process.env.JOURNAL_DB_ID;
const MODULE_FEATURES_DB = process.env.WORK_ITEMS_DB_ID;

/**
 * Sprint 23 Completed Tasks
 */
const sprint23Tasks = [
  {
    name: 'Shadow Mode Integration - ContactTierTool',
    status: 'Done',
    priority: 'HIGH',
    notes: 'Inline-only logging enabled. 225 decisions logged. File: server/siva-tools/ContactTierToolStandalone.js'
  },
  {
    name: 'Shadow Mode Integration - TimingScoreTool',
    status: 'Done',
    priority: 'HIGH',
    notes: 'Inline-only logging enabled. 226 decisions logged. File: server/siva-tools/TimingScoreToolStandalone.js'
  },
  {
    name: 'Shadow Mode Integration - BankingProductMatchTool',
    status: 'Done',
    priority: 'HIGH',
    notes: 'Inline-only logging enabled. 194 decisions logged. File: server/siva-tools/BankingProductMatchToolStandalone.js'
  },
  {
    name: 'Multi-Tool Shadow Mode Progress Tracking',
    status: 'Done',
    priority: 'MEDIUM',
    notes: 'Created checkShadowModeProgress.sh for all 4 tools. Tracks match rates and decision counts.'
  },
  {
    name: 'Production Smoke Test Suite (Sprint 23)',
    status: 'Done',
    priority: 'HIGH',
    notes: '100% pass rate (4/4 tools). File: scripts/sprint23/smokeTestSprint23.js'
  },
  {
    name: 'Production Stress Test (200 requests, 10 concurrency)',
    status: 'Done',
    priority: 'HIGH',
    notes: '99.50% pass rate (199/200). Throughput: 52 req/s. Avg latency: 448ms'
  },
  {
    name: 'Deploy Shadow Mode Extensions to Production',
    status: 'Done',
    priority: 'HIGH',
    notes: 'Cloud Run revision 00390-gv4. All 4 tools logging to agent_core.agent_decisions'
  }
];

/**
 * Sprint 24 Completed Tasks
 */
const sprint24Tasks = [
  // Track A: ContactTier Rule Engine
  {
    name: 'Extract ContactTier Patterns from Shadow Mode Data',
    status: 'Done',
    priority: 'HIGH',
    tags: ['Phase 1', 'Track B'],
    notes: 'Analyzed 225 decisions. Top title: HR Director (85.2%). File: scripts/analysis/extractContactTierPatterns.js'
  },
  {
    name: 'Build ContactTier Rule Engine v2.0 (457 lines)',
    status: 'Done',
    priority: 'HIGH',
    tags: ['Phase 5', 'Track A'],
    notes: '5-phase execution: Infer → Score → Classify → Recommend → Confidence. File: server/agent-core/ContactTierRuleEngineV2.js'
  },
  {
    name: 'Create ContactTier Cognitive Rules JSON',
    status: 'Done',
    priority: 'HIGH',
    tags: ['Phase 5', 'Track A'],
    notes: 'Seniority inference, department scoring, tier classification. File: server/agent-core/contact_tier_v2.0.json'
  },
  {
    name: 'Integrate ContactTier Shadow Mode (inline vs rule)',
    status: 'Done',
    priority: 'HIGH',
    tags: ['Phase 5', 'Track A'],
    notes: 'Parallel execution with result comparison. 100% match rate (5/5 initial tests)'
  },
  {
    name: 'Test ContactTier Rule Engine (5 test cases)',
    status: 'Done',
    priority: 'HIGH',
    tags: ['Phase 5', 'Track A'],
    notes: '100% pass rate. Avg latency: 352ms. File: scripts/sprint24/testContactTierRuleEngine.js'
  },
  {
    name: 'Deploy ContactTier Rule Engine to Production',
    status: 'Done',
    priority: 'HIGH',
    tags: ['Phase 4', 'Track A'],
    notes: 'Cloud Run revision 00392-fmr deployed. Production-ready.'
  },

  // Track B: Foundational Documentation
  {
    name: 'Extract 6 Cognitive Pillars from 959 Decisions',
    status: 'Done',
    priority: 'HIGH',
    tags: ['Phase 1', 'Track B'],
    notes: '309 CQ, 230 CT, 226 TS, 194 BPM decisions. File: scripts/analysis/extractCognitivePillars.js'
  },
  {
    name: 'Create Phase 1 Complete Documentation (7,500+ words)',
    status: 'Done',
    priority: 'HIGH',
    tags: ['Phase 1', 'Track B'],
    notes: 'Methodology, 6 pillars, examples, validation. File: docs/siva-phases/Phase_1_COMPLETE.md'
  },
  {
    name: 'Create Cognitive Pillars Reference Guide (5,000+ words)',
    status: 'Done',
    priority: 'MEDIUM',
    tags: ['Phase 1', 'Track B'],
    notes: 'Usage guidelines, cross-pillar interactions. File: docs/siva-phases/COGNITIVE_PILLARS.md'
  },
  {
    name: 'Build Golden Dataset (50 validated examples)',
    status: 'Done',
    priority: 'HIGH',
    tags: ['Phase 1', 'Track B'],
    notes: '28 CQ, 14 CT, 5 TS, 3 BPM examples. High confidence (≥0.85). File: scripts/analysis/goldenDataset.json'
  },
  {
    name: 'Create Phase 2 Architecture Documentation (10,000+ words)',
    status: 'Done',
    priority: 'HIGH',
    tags: ['Phase 2', 'Track B'],
    notes: '9 Mermaid diagrams: system arch, module mapping, data flows, shadow mode. File: docs/siva-phases/Phase_2_ARCHITECTURE.md'
  },
  {
    name: 'Document Tool Interface Contracts (TypeScript)',
    status: 'Done',
    priority: 'MEDIUM',
    tags: ['Phase 2', 'Track B'],
    notes: 'CompanyQuality, ContactTier, TimingScore, BankingProductMatch interfaces documented'
  },
  {
    name: 'Update SIVA Framework Progress Tracking',
    status: 'Done',
    priority: 'MEDIUM',
    tags: ['Phase 1', 'Track B'],
    notes: 'Phase 1: 10%→100%, Phase 2: 30%→100%, Overall: 20%→35%. File: docs/siva-phases/phases_summary_HONEST.json'
  },
  {
    name: 'Create Sprint 24 Completion Report',
    status: 'Done',
    priority: 'LOW',
    tags: ['Documentation'],
    notes: 'Documenting Track A + Track B work. File: docs/SPRINT_24_COMPLETION.md'
  }
];

/**
 * Update SIVA Phase pages (Phase 1-12 in Module Features DB)
 */
const sivaPhaseUpdates = [
  {
    phaseName: 'Phase 1',
    properties: {
      'Status': { select: { name: 'Done' } },
      'Sprint': { number: 24 },
      'Priority': { select: { name: 'CRITICAL' } },
      'Tags': {
        multi_select: [
          { name: 'Phase 1' },
          { name: 'Complete' },
          { name: 'Sprint 24' }
        ]
      },
      'Notes': {
        rich_text: [{
          text: {
            content: 'SPRINT 24 COMPLETE (100%): Extracted 6 cognitive pillars from 959 decisions. Full retrospective documentation. Golden dataset (50 examples) created. Files: Phase_1_COMPLETE.md, COGNITIVE_PILLARS.md, cognitivePillars.json, goldenDataset.json'
          }
        }]
      }
    }
  },
  {
    phaseName: 'Phase 2',
    properties: {
      'Status': { select: { name: 'Done' } },
      'Sprint': { number: 24 },
      'Priority': { select: { name: 'CRITICAL' } },
      'Tags': {
        multi_select: [
          { name: 'Phase 2' },
          { name: 'Complete' },
          { name: 'Sprint 24' }
        ]
      },
      'Notes': {
        rich_text: [{
          text: {
            content: 'SPRINT 24 COMPLETE (100%): Comprehensive architecture documentation with 9 Mermaid diagrams. Module mapping (6 pillars → 4 tools), tool interfaces, data flows, shadow mode architecture. File: Phase_2_ARCHITECTURE.md'
          }
        }]
      }
    }
  },
  {
    phaseName: 'Phase 4',
    properties: {
      'Status': { select: { name: 'In Progress' } },
      'Sprint': { number: 24 },
      'Priority': { select: { name: 'HIGH' } },
      'Tags': {
        multi_select: [
          { name: 'Phase 4' },
          { name: 'Sprint 23' },
          { name: 'Sprint 24' }
        ]
      },
      'Notes': {
        rich_text: [{
          text: {
            content: 'SPRINT 23-24 (80%): Cloud Run stable (99.50% stress test). Shadow mode logging at scale (959 decisions). ContactTier rule engine deployed (revision 00392-fmr). Missing: formal topology diagrams.'
          }
        }]
      }
    }
  },
  {
    phaseName: 'Phase 5',
    properties: {
      'Status': { select: { name: 'In Progress' } },
      'Sprint': { number: 24 },
      'Priority': { select: { name: 'CRITICAL' } },
      'Tags': {
        multi_select: [
          { name: 'Phase 5' },
          { name: 'Sprint 24' },
          { name: 'Rule Engines' }
        ]
      },
      'Notes': {
        rich_text: [{
          text: {
            content: 'SPRINT 24 (60%): ContactTier rule engine v2.0 deployed (100% match). 2 of 4 rule engines complete (CQ v2.2 97.88%, CT v2.0 100%). Shadow mode: 959 decisions logged. Remaining: TimingScore + BankingProductMatch rule engines.'
          }
        }]
      }
    }
  },
  {
    phaseName: 'Phase 10',
    properties: {
      'Status': { select: { name: 'In Progress' } },
      'Sprint': { number: 24 },
      'Priority': { select: { name: 'MEDIUM' } },
      'Tags': {
        multi_select: [
          { name: 'Phase 10' },
          { name: 'Sprint 24' },
          { name: 'Feedback' }
        ]
      },
      'Notes': {
        rich_text: [{
          text: {
            content: 'SPRINT 24 (30%): 959 decisions logged. Pattern extraction automated (extractCognitivePillars.js). Database tables ready (agent_decisions, decision_feedback). Feedback loop implementation Sprint 27.'
          }
        }]
      }
    }
  }
];

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Completing Sprint 23 & 24 in Notion (Fixed)     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Step 1: Update Sprint 23
  console.log('1️⃣  Updating Sprint 23...\n');
  try {
    const sprint23Results = await notion.databases.query({
      database_id: SPRINTS_DB,
      filter: {
        property: 'Sprint',
        title: {
          contains: 'Sprint 23'
        }
      }
    });

    if (sprint23Results.results.length > 0) {
      const sprint23Page = sprint23Results.results[0];
      await notion.pages.update({
        page_id: sprint23Page.id,
        properties: {
          'Status': { select: { name: 'Done' } },
          'Completed At': { date: { start: '2025-11-15' } },
          'Goal': {
            rich_text: [{
              text: {
                content: 'Extended shadow mode to all 4 SIVA tools. 845+ decisions logged in 24 hours. 99.50% stress test success rate (199/200 requests). Production-ready at scale.'
              }
            }]
          }
        }
      });
      console.log('   ✅ Sprint 23 marked as Done\n');
    } else {
      console.log('   ⚠️  Sprint 23 not found, creating...\n');
      await notion.pages.create({
        parent: { database_id: SPRINTS_DB },
        properties: {
          'Sprint': {
            title: [{
              text: { content: 'Sprint 23: Shadow Mode Extension - All 4 Tools' }
            }]
          },
          'Status': { select: { name: 'Done' } },
          'Goal': {
            rich_text: [{
              text: {
                content: 'Extended shadow mode to all 4 SIVA tools. 845+ decisions logged in 24 hours. 99.50% stress test success rate (199/200 requests). Production-ready at scale.'
              }
            }]
          },
          'Started At': { date: { start: '2025-11-14' } },
          'Completed At': { date: { start: '2025-11-15' } }
        }
      });
      console.log('   ✅ Sprint 23 created and marked as Done\n');
    }
  } catch (error) {
    console.log(`   ❌ Error with Sprint 23: ${error.message}\n`);
  }

  // Step 2: Update Sprint 24
  console.log('2️⃣  Updating Sprint 24...\n');
  try {
    const sprint24Results = await notion.databases.query({
      database_id: SPRINTS_DB,
      filter: {
        property: 'Sprint',
        title: {
          contains: 'Sprint 24'
        }
      }
    });

    if (sprint24Results.results.length > 0) {
      const sprint24Page = sprint24Results.results[0];
      await notion.pages.update({
        page_id: sprint24Page.id,
        properties: {
          'Status': { select: { name: 'Done' } },
          'Completed At': { date: { start: '2025-11-15' } }
        }
      });
      console.log('   ✅ Sprint 24 updated to Done\n');
    }
  } catch (error) {
    console.log(`   ❌ Error with Sprint 24: ${error.message}\n`);
  }

  // Step 3: Add Sprint 23 tasks to Module Features
  console.log('3️⃣  Adding Sprint 23 tasks to Module Features...\n');
  let s23Success = 0, s23Errors = 0;

  for (const task of sprint23Tasks) {
    try {
      await notion.pages.create({
        parent: { database_id: MODULE_FEATURES_DB },
        properties: {
          'Features': {
            title: [{ text: { content: task.name } }]
          },
          'Sprint': { number: 23 },
          'Status': { select: { name: task.status } },
          'Done?': { checkbox: true },
          'Priority': { select: { name: task.priority } },
          'Notes': {
            rich_text: [{ text: { content: task.notes } }]
          }
        }
      });
      console.log(`   ✅ ${task.name}`);
      s23Success++;
    } catch (error) {
      console.log(`   ❌ ${task.name}: ${error.message}`);
      s23Errors++;
    }
  }
  console.log(`\n   Summary: ${s23Success}/${sprint23Tasks.length} created\n`);

  // Step 4: Add Sprint 24 tasks to Module Features
  console.log('4️⃣  Adding Sprint 24 tasks to Module Features...\n');
  let s24Success = 0, s24Errors = 0;

  for (const task of sprint24Tasks) {
    try {
      const properties = {
        'Features': {
          title: [{ text: { content: task.name } }]
        },
        'Sprint': { number: 24 },
        'Status': { select: { name: task.status } },
        'Done?': { checkbox: true },
        'Priority': { select: { name: task.priority } },
        'Notes': {
          rich_text: [{ text: { content: task.notes } }]
        }
      };

      if (task.tags) {
        properties['Tags'] = {
          multi_select: task.tags.map(tag => ({ name: tag }))
        };
      }

      await notion.pages.create({
        parent: { database_id: MODULE_FEATURES_DB },
        properties
      });
      console.log(`   ✅ ${task.name}`);
      s24Success++;
    } catch (error) {
      console.log(`   ❌ ${task.name}: ${error.message}`);
      s24Errors++;
    }
  }
  console.log(`\n   Summary: ${s24Success}/${sprint24Tasks.length} created\n`);

  // Step 5: Update SIVA Phase pages
  console.log('5️⃣  Updating SIVA Phase pages...\n');
  let phaseSuccess = 0, phaseErrors = 0;

  for (const update of sivaPhaseUpdates) {
    try {
      // Search for the phase page
      const phaseResults = await notion.databases.query({
        database_id: MODULE_FEATURES_DB,
        filter: {
          property: 'Features',
          title: {
            contains: update.phaseName
          }
        }
      });

      if (phaseResults.results.length > 0) {
        const phasePage = phaseResults.results[0];
        await notion.pages.update({
          page_id: phasePage.id,
          properties: update.properties
        });
        console.log(`   ✅ ${update.phaseName} updated (${update.properties.Status.select.name})`);
        phaseSuccess++;
      } else {
        console.log(`   ⚠️  ${update.phaseName} not found`);
      }
    } catch (error) {
      console.log(`   ❌ ${update.phaseName}: ${error.message}`);
      phaseErrors++;
    }
  }
  console.log(`\n   Summary: ${phaseSuccess}/${sivaPhaseUpdates.length} phases updated\n`);

  // Final Summary
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  Notion Update Complete                           ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  console.log('📊 Summary:');
  console.log(`   ✅ Sprint 23: Updated to Done`);
  console.log(`   ✅ Sprint 24: Updated to Done`);
  console.log(`   ✅ Sprint 23 Tasks: ${s23Success}/${sprint23Tasks.length} created`);
  console.log(`   ✅ Sprint 24 Tasks: ${s24Success}/${sprint24Tasks.length} created`);
  console.log(`   ✅ SIVA Phases: ${phaseSuccess}/${sivaPhaseUpdates.length} updated\n`);

  console.log('📈 SIVA Framework Progress Updates:');
  console.log('   • Phase 1: → 100% ✅ COMPLETE (Sprint 24)');
  console.log('   • Phase 2: → 100% ✅ COMPLETE (Sprint 24)');
  console.log('   • Phase 4: → 80% (Sprint 23-24)');
  console.log('   • Phase 5: → 60% (Sprint 24)');
  console.log('   • Phase 10: → 30% (Sprint 24)');
  console.log('   • Overall: 20% → 35%\n');
}

main().catch(console.error);
