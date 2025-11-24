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

async function updatePhase12Status() {
  console.log('📊 Updating Phase 12 - Lead Scoring Engine status...\n');

  try {
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB_ID,
      page_size: 100
    });

    const phase12 = response.results.find(page => {
      const name = page.properties.Features?.title?.[0]?.text?.content || '';
      return name.includes('Phase 12');
    });

    if (!phase12) {
      console.error('❌ Phase 12 not found in MODULE FEATURES database');
      return;
    }

    const pageId = phase12.id;
    const currentName = phase12.properties.Features?.title?.[0]?.text?.content;

    console.log(`✅ Found: "${currentName}"`);
    console.log(`   Updating status to "In Progress"...\n`);

    await notion.pages.update({
      page_id: pageId,
      properties: {
        'Status': { select: { name: 'In Progress' } },
        'Started At': { date: { start: new Date().toISOString() } },
        'Notes': {
          rich_text: [{
            text: {
              content: `Sprint 17 Task 3: SIVA Phase 12 implementation started. Wired CompanyQualityTool, ContactTierTool, and CompositeScoreTool into enrichment flow. Replaces old lead scoring with centralized SIVA framework. | Completion: 60% (tools wired, testing pending) | Last updated: ${new Date().toISOString()}`
            }
          }]
        }
      }
    });

    console.log('✅ Phase 12 status updated to "In Progress"');
    console.log('✅ Notes updated with implementation details\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

updatePhase12Status().catch(console.error);
