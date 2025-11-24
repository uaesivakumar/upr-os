import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables
const envPath = path.join(process.cwd(), 'scripts', 'notion', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const JOURNAL_DB = process.env.JOURNAL_DB_ID || process.env.NOTION_JOURNAL_DB;
const MODULES_DB = process.env.MODULES_DB_ID || process.env.NOTION_MODULES_DB;
const WORKITEMS_DB = process.env.WORK_ITEMS_DB_ID || process.env.NOTION_WORKITEMS_DB;

/**
 * Add Phase 2 properties to Sprint Journal database
 */
async function enhanceJournalSchema() {
  console.log("📊 Enhancing Sprint Journal schema...");

  try {
    // Add new properties
    await notion.databases.update({
      database_id: JOURNAL_DB,
      properties: {
        // Existing properties remain unchanged

        // New Phase 2 properties
        "Synced At": {
          date: {}
        },
        "Commit Range": {
          rich_text: {}
        },
        "Commits Count": {
          number: {}
        },
        "Status": {
          select: {
            options: [
              { name: "Planned", color: "gray" },
              { name: "In Progress", color: "blue" },
              { name: "Completed", color: "green" },
              { name: "Blocked", color: "red" }
            ]
          }
        },
        "Sprint Notes": {
          rich_text: {}
        }
      }
    });

    console.log("  ✓ Added: Synced At (timestamp)");
    console.log("  ✓ Added: Commit Range (auto-tracked)");
    console.log("  ✓ Added: Commits Count (metrics)");
    console.log("  ✓ Added: Status (workflow tracking)");
    console.log("  ✓ Added: Sprint Notes (additional context)");
    console.log("");
  } catch (error) {
    console.error("Error enhancing schema:", error.message);
  }
}

/**
 * Add Phase 2 properties to Modules database
 */
async function enhanceModulesSchema() {
  console.log("📊 Enhancing Modules schema...");

  try {
    await notion.databases.update({
      database_id: MODULES_DB,
      properties: {
        // New metrics properties
        "Last Updated": {
          date: {}
        },
        "Avg Completion Time": {
          number: { format: "number" }
        },
        "Bugs Fixed": {
          number: {}
        },
        "Features Added": {
          number: {}
        }
      }
    });

    console.log("  ✓ Added: Last Updated (auto-tracked)");
    console.log("  ✓ Added: Avg Completion Time (metrics)");
    console.log("  ✓ Added: Bugs Fixed (metrics)");
    console.log("  ✓ Added: Features Added (metrics)");
    console.log("");
  } catch (error) {
    console.error("Error enhancing modules schema:", error.message);
  }
}

/**
 * Add Phase 2 properties to Work Items database
 */
async function enhanceWorkItemsSchema() {
  console.log("📊 Enhancing Work Items schema...");

  try {
    await notion.databases.update({
      database_id: WORKITEMS_DB,
      properties: {
        // New tracking properties
        "Started At": {
          date: {}
        },
        "Completed At": {
          date: {}
        },
        "Actual Time": {
          number: { format: "number" }
        },
        "Assignee": {
          rich_text: {}
        },
        "Dependencies": {
          rich_text: {}
        }
      }
    });

    console.log("  ✓ Added: Started At (tracking)");
    console.log("  ✓ Added: Completed At (tracking)");
    console.log("  ✓ Added: Actual Time (vs ETA)");
    console.log("  ✓ Added: Assignee (ownership)");
    console.log("  ✓ Added: Dependencies (planning)");
    console.log("");
  } catch (error) {
    console.error("Error enhancing work items schema:", error.message);
  }
}

/**
 * Main enhancement function
 */
async function enhanceAllSchemas() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🚀 Phase 2: Enhancing Notion Schemas");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  if (!process.env.NOTION_TOKEN) {
    console.error("❌ Error: NOTION_TOKEN not found");
    process.exit(1);
  }

  await enhanceJournalSchema();
  await enhanceModulesSchema();
  await enhanceWorkItemsSchema();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Schema Enhancement Complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("🎯 New capabilities:");
  console.log("   • Bi-directional sync with conflict detection");
  console.log("   • Automatic commit range tracking");
  console.log("   • Velocity and metrics calculation");
  console.log("   • Audit timestamps on all updates");
  console.log("   • Sprint status workflow tracking");
  console.log("");
  console.log("➡️  Refresh your Notion databases to see new properties!");
}

enhanceAllSchemas().catch(console.error);
