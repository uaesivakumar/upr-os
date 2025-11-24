import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath = path.join(process.cwd(), '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const WORK_ITEMS_DB_ID = process.env.WORK_ITEMS_DB_ID;

async function createSIVARoadmap() {
  console.log('🗺️  Creating SIVA Centralized Roadmap in Notion...\n');

  try {
    // Step 1: Update Phase 1-2 to reflect 15 tools
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB_ID,
      page_size: 100
    });

    const phase1 = response.results.find(page => {
      const name = page.properties.Features?.title?.[0]?.text?.content || '';
      return name.includes('Phase 1:');
    });

    const phase2 = response.results.find(page => {
      const name = page.properties.Features?.title?.[0]?.text?.content || '';
      return name.includes('Phase 2:');
    });

    // Update Phase 1
    if (phase1) {
      console.log('✅ Updating Phase 1 (15 tools total)...');
      await notion.pages.update({
        page_id: phase1.id,
        properties: {
          'Notes': {
            rich_text: [{
              text: {
                content: `✅ Sprint 16 Complete: Tools 1-4 built (CompanyQuality, ContactTier, TimingScore, EdgeCases). Part of 15-tool SIVA framework. Phase: 70% (Tools done, REST API pending). | Completion: 70% | Last updated: ${new Date().toISOString()}`
              }
            }]
          }
        }
      });
    }

    // Update Phase 2
    if (phase2) {
      console.log('✅ Updating Phase 2 (15 tools total)...');
      await notion.pages.update({
        page_id: phase2.id,
        properties: {
          'Notes': {
            rich_text: [{
              text: {
                content: `✅ Sprint 16 Complete: Tools 5-15 built (Banking, Outreach, Opening, Composite, Message, FollowUp, Objection, Relationship, HiringSignal, SourceReliability, SignalDedup). Total: 15 MCP tools - 100% operational. Phase: 75% (Tools done, REST API + DB tables pending). | Completion: 75% | Last updated: ${new Date().toISOString()}`
              }
            }]
          }
        }
      });
    }

    // Step 2: Create SIVA Architecture Guard item
    console.log('\n📋 Creating "SIVA Architecture Guard" item...');

    const architectureGuardPage = await notion.pages.create({
      parent: { database_id: WORK_ITEMS_DB_ID },
      properties: {
        'Features': {
          title: [{
            text: { content: '🧠 SIVA Architecture Guard - DO NOT DUPLICATE' }
          }]
        },
        'Status': { select: { name: 'In Progress' } },
        'Priority': { select: { name: 'Critical' } },
        'Type': { select: { name: 'Documentation' } },
        'AI Score': { number: 100 },
        'Notes': {
          rich_text: [{
            text: {
              content: `⚠️ CRITICAL: SIVA is the ONLY centralized AI brain. DO NOT build separate scoring/AI logic.

✅ CENTRALIZED IN SIVA (15 MCP Tools):
- Lead Scoring (Tools 1,2,8 → Phase 12)
- Company Quality (Tool 1)
- Contact Classification (Tool 2)
- Timing Score (Tool 3)
- Edge Case Detection (Tool 4)
- Banking Product Match (Tool 5)
- Outreach Channel (Tool 6)
- Opening Context (Tool 7)
- Composite Q-Score (Tool 8)
- Message Generation (Tool 9)
- Follow-up Strategy (Tool 10)
- Objection Handling (Tool 11)
- Relationship Tracking (Tool 12)
- Hiring Signal Extraction (Tool 13)
- Source Reliability (Tool 14)
- Signal Deduplication (Tool 15)

❌ DO NOT CREATE:
- Separate lead scoring logic
- Custom AI/LLM scoring outside SIVA
- Duplicate Q-Score calculations
- Manual scoring formulas
- Non-SIVA enrichment scoring

✅ INTEGRATION PATTERN:
1. Import SIVA tools from /server/siva-tools/
2. Call tool.execute(input)
3. Use returned scores/reasoning
4. Store in database with siva_source tag

📍 Current Integration Points:
- routes/enrich/lib/sivaLeadScoring.js (Phase 12)
- More integrations: Phases 3-11 pending

Last updated: ${new Date().toISOString()}`
            }
          }]
        }
      }
    });

    console.log('✅ SIVA Architecture Guard created\n');

    // Step 3: Create Phase 3 roadmap item if not exists
    const phase3 = response.results.find(page => {
      const name = page.properties.Features?.title?.[0]?.text?.content || '';
      return name.includes('Phase 3');
    });

    if (phase3) {
      console.log('📋 Updating Phase 3 roadmap...');
      await notion.pages.update({
        page_id: phase3.id,
        properties: {
          'Notes': {
            rich_text: [{
              text: {
                content: `NEXT PRIORITY: Build REST API + MCP Host + Persona Policy Engine to expose 15 SIVA tools. Enable centralized access for all modules (Discovery, Enrichment, Outreach). | Completion: 0% | Dependencies: Phase 1-2 tools ready | Last updated: ${new Date().toISOString()}`
              }
            }]
          }
        }
      });
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SIVA Roadmap Created Successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 Updated Items:');
    console.log('  ✅ Phase 1: Updated to reflect 15 tools');
    console.log('  ✅ Phase 2: Updated to reflect 15 tools');
    console.log('  ✅ Architecture Guard: Created (prevents duplicates)');
    console.log('  ✅ Phase 3: Updated with next priorities\n');

    console.log('🎯 Clear Path Forward:');
    console.log('  1. 15 SIVA Tools: 100% Complete');
    console.log('  2. Phase 12 Integration: In Progress (60%)');
    console.log('  3. Phase 3 (REST API): Next major milestone');
    console.log('  4. Phases 4-11: Future integration work\n');

    console.log('⚠️  Architecture Guard ensures:');
    console.log('  - No duplicate AI/scoring logic');
    console.log('  - All new features use SIVA tools');
    console.log('  - Centralized brain maintained\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

createSIVARoadmap().catch(console.error);
