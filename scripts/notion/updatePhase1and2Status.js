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

async function updatePhase1and2Status() {
  console.log('📊 Updating Phase 1 & 2 status for clarity...\n');

  try {
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB_ID,
      page_size: 100
    });

    // Find Phase 1
    const phase1 = response.results.find(page => {
      const name = page.properties.Features?.title?.[0]?.text?.content || '';
      return name.includes('Phase 1:');
    });

    // Find Phase 2
    const phase2 = response.results.find(page => {
      const name = page.properties.Features?.title?.[0]?.text?.content || '';
      return name.includes('Phase 2:');
    });

    // Update Phase 1
    if (phase1) {
      console.log('✅ Updating Phase 1: Persona Extraction & Cognitive Foundation');
      await notion.pages.update({
        page_id: phase1.id,
        properties: {
          'Status': { select: { name: 'In Progress' } },
          'Notes': {
            rich_text: [{
              text: {
                content: `Sprint 16 Complete: Tools 1-4 (CompanyQuality, ContactTier, TimingScore, EdgeCases) - 100% built & tested. Phase overall: 70% (Tools done, REST API & full integration pending). | Completion: 70% | Last updated: ${new Date().toISOString()}`
              }
            }]
          }
        }
      });
      console.log('   Status: In Progress (70% - tools done, API layer pending)\n');
    }

    // Update Phase 2
    if (phase2) {
      console.log('✅ Updating Phase 2: Cognitive Framework Architecture');
      await notion.pages.update({
        page_id: phase2.id,
        properties: {
          'Status': { select: { name: 'In Progress' } },
          'Notes': {
            rich_text: [{
              text: {
                content: `Sprint 16 Complete: Tools 5-15 (Banking, Outreach, Opening, Composite, Message, FollowUp, Objection, Relationship, HiringSignal, SourceReliability, SignalDedup) - 100% built & tested. Phase 12 integration started. Phase overall: 75% (MCP tools done, REST API & database tables pending). | Completion: 75% | Last updated: ${new Date().toISOString()}`
              }
            }]
          }
        }
      });
      console.log('   Status: In Progress (75% - tools done, API layer pending)\n');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Clarity Update:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Phase 1-2 MCP Tools: 100% Complete ✅');
    console.log('  - All 15 tools built, tested, validated');
    console.log('  - Schemas complete');
    console.log('  - Error tracking (Sentry) operational');
    console.log('');
    console.log('Phase 1-2 Overall: 70-75% Complete ⏳');
    console.log('  - ✅ Tools (100%)');
    console.log('  - ⏳ REST API layer (0%)');
    console.log('  - ⏳ Database tables (0%)');
    console.log('  - ⏳ Full integration (20% - Phase 12 started)');
    console.log('');
    console.log('Status: "In Progress" is CORRECT\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

updatePhase1and2Status().catch(console.error);
