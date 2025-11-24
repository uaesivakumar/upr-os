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

// Items to archive (mark as Done, move to archive view)
const TO_ARCHIVE = [
  "Separate signal query from upsert logic",
  "Fix signal type case-sensitivity bug"
];

// Items to DELETE (duplicates/obsolete)
const TO_DELETE = [
  "Opening Context Generation", // Duplicate: SIVA OpeningContextTool exists
  "Central LLM Agent (MCP)", // Duplicate: SIVA Phase 2 complete
  "Enhance Q-Score calculation system", // Duplicate: SIVA CompositeScoreTool exists
  "Imporve Leads Capturing Technique", // Duplicate: SIVA integration does this (typo in name too)
  "Template Creator – Save Flow", // Unclear scope
  "URL Context Parsing Backend", // Unclear/obsolete
  "Customised Welcome Home screen once user logged-in", // Low priority UI
  "Drawer - Hiring Signal Page", // Low priority UI
  "Better UX Exp for the Left Sidebar Menus", // Low priority UI
  "Email Campaign Builder" // Not in Sprint 17, unclear scope
];

// Items to mark as DONE (Sprint 17 completed)
const SPRINT_17_DONE = [
  "Database Indexing for Performance",
  "API Rate Limiting"
];

async function cleanupModuleFeatures() {
  console.log('🧹 Cleaning up MODULE FEATURES database...\n');

  try {
    // Get all items
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB_ID,
      page_size: 100
    });

    console.log(`📊 Total items: ${response.results.length}\n`);

    let archivedCount = 0;
    let deletedCount = 0;
    let updatedCount = 0;

    // Process each item
    for (const page of response.results) {
      const name = page.properties.Features?.title?.[0]?.text?.content || 'Untitled';
      const pageId = page.id;

      // Archive completed items
      if (TO_ARCHIVE.includes(name)) {
        console.log(`📦 Archiving: "${name}"`);
        await notion.pages.update({
          page_id: pageId,
          archived: true,
          properties: {
            'Status': { select: { name: 'Done' } },
            'Done?': { checkbox: true },
            'Completed At': { date: { start: new Date().toISOString() } }
          }
        });
        archivedCount++;
      }

      // Delete duplicates/obsolete
      else if (TO_DELETE.includes(name)) {
        console.log(`🗑️  Deleting (duplicate/obsolete): "${name}"`);
        await notion.pages.update({
          page_id: pageId,
          archived: true
        });
        deletedCount++;
      }

      // Update Sprint 17 completed tasks
      else if (SPRINT_17_DONE.includes(name)) {
        console.log(`✅ Marking as Done: "${name}"`);
        await notion.pages.update({
          page_id: pageId,
          properties: {
            'Status': { select: { name: 'Done' } },
            'Done?': { checkbox: true },
            'Completed At': { date: { start: new Date().toISOString() } }
          }
        });
        updatedCount++;
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Cleanup Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📦 Archived (completed): ${archivedCount}`);
    console.log(`🗑️  Deleted (duplicate/obsolete): ${deletedCount}`);
    console.log(`✅ Updated (Sprint 17 done): ${updatedCount}`);
    console.log(`\n📊 Remaining active items: ${response.results.length - archivedCount - deletedCount}`);

    console.log('\n🎯 Clean MODULE FEATURES now contains:');
    console.log('   - 12 SIVA Phases (roadmap)');
    console.log('   - 6 Sprint 17 tasks (remaining work)');
    console.log('   - Total: ~20 valid tracking items\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

cleanupModuleFeatures().catch(console.error);
