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

// Database IDs from .env
const JOURNAL_DB = process.env.JOURNAL_DB_ID;
const MODULES_DB = process.env.MODULES_DB_ID;
const WORK_ITEMS_DB = process.env.WORK_ITEMS_DB_ID;
const PARENT_PAGE = process.env.NOTION_PARENT_PAGE_ID;

async function checkWorkspace() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 Checking Your Notion Workspace");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  // Check parent page
  if (PARENT_PAGE) {
    console.log("📄 Parent Page:");
    try {
      const page = await notion.pages.retrieve({ page_id: PARENT_PAGE });
      const title = page.properties?.title?.title?.[0]?.text?.content || "Untitled";
      console.log(`   Name: ${title}`);
      console.log(`   ID: ${PARENT_PAGE}`);
      console.log(`   URL: https://notion.so/${PARENT_PAGE.replace(/-/g, '')}`);
    } catch (error) {
      console.log(`   ⚠️ Cannot access: ${error.message}`);
    }
    console.log("");
  }

  // Check each database
  console.log("📊 Your Databases:");
  console.log("");

  // Sprint Journal
  if (JOURNAL_DB) {
    console.log("1. Sprint Journal Database");
    try {
      const db = await notion.databases.retrieve({ database_id: JOURNAL_DB });
      console.log(`   ✓ Name: ${db.title?.[0]?.text?.content || "Sprint Journal"}`);
      console.log(`   ID: ${JOURNAL_DB}`);
      console.log(`   URL: https://notion.so/${JOURNAL_DB.replace(/-/g, '')}`);

      // Check entries
      const entries = await notion.databases.query({
        database_id: JOURNAL_DB,
        page_size: 5
      });
      console.log(`   Entries: ${entries.results.length} sprint(s)`);

      if (entries.results.length > 0) {
        console.log(`   Latest: ${entries.results[0].properties?.Sprint?.title?.[0]?.text?.content || "Sprint"}`);
      }
    } catch (error) {
      console.log(`   ⚠️ Error: ${error.message}`);
    }
    console.log("");
  }

  // Modules
  if (MODULES_DB) {
    console.log("2. Modules Database");
    try {
      const db = await notion.databases.retrieve({ database_id: MODULES_DB });
      console.log(`   ✓ Name: ${db.title?.[0]?.text?.content || "Modules"}`);
      console.log(`   ID: ${MODULES_DB}`);
      console.log(`   URL: https://notion.so/${MODULES_DB.replace(/-/g, '')}`);

      // Check entries
      const entries = await notion.databases.query({
        database_id: MODULES_DB,
        page_size: 5
      });
      console.log(`   Entries: ${entries.results.length} module(s)`);
    } catch (error) {
      console.log(`   ⚠️ Error: ${error.message}`);
    }
    console.log("");
  }

  // Work Items
  if (WORK_ITEMS_DB) {
    console.log("3. Work Items Database (TO-DO SYSTEM)");
    try {
      const db = await notion.databases.retrieve({ database_id: WORK_ITEMS_DB });
      const dbName = db.title?.[0]?.text?.content || "Work Items";
      console.log(`   ✓ Name: ${dbName}`);
      console.log(`   ID: ${WORK_ITEMS_DB}`);
      console.log(`   URL: https://notion.so/${WORK_ITEMS_DB.replace(/-/g, '')}`);

      // Check entries
      const entries = await notion.databases.query({
        database_id: WORK_ITEMS_DB,
        page_size: 10
      });
      console.log(`   Entries: ${entries.results.length} task(s)`);

      if (entries.results.length > 0) {
        console.log("");
        console.log("   📋 Current Tasks:");
        entries.results.forEach((task, i) => {
          const name = task.properties?.Name?.title?.[0]?.text?.content || "Untitled";
          const status = task.properties?.Status?.select?.name || "No Status";
          const priority = task.properties?.Priority?.select?.name || "No Priority";
          console.log(`      ${i + 1}. [${priority}] ${name} (${status})`);
        });
      } else {
        console.log("   ⚠️ Database is EMPTY - no tasks found");
      }

      // Check properties
      console.log("");
      console.log("   🔧 Properties:");
      const props = Object.keys(db.properties);
      const requiredProps = ['Name', 'Status', 'Priority', 'Type', 'ETA', 'Tags', 'AI Score'];
      requiredProps.forEach(prop => {
        if (props.includes(prop)) {
          console.log(`      ✓ ${prop}`);
        } else {
          console.log(`      ✗ ${prop} (MISSING)`);
        }
      });

    } catch (error) {
      console.log(`   ⚠️ Error: ${error.message}`);
    }
    console.log("");
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📍 How to Find Your Work Items Database");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("Option 1: Direct URL");
  console.log(`   ${WORK_ITEMS_DB ? `https://notion.so/${WORK_ITEMS_DB.replace(/-/g, '')}` : 'No Work Items DB ID configured'}`);
  console.log("");
  console.log("Option 2: Search in Notion");
  console.log("   1. Open Notion");
  console.log("   2. Press Cmd+P (Mac) or Ctrl+P (Windows)");
  console.log("   3. Search for: 'Work Items' or 'Modules' or 'UPR'");
  console.log("");
  console.log("Option 3: Navigate from Parent Page");
  if (PARENT_PAGE) {
    console.log(`   Go to: https://notion.so/${PARENT_PAGE.replace(/-/g, '')}`);
    console.log("   Look for databases on that page");
  } else {
    console.log("   (No parent page configured)");
  }
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

checkWorkspace().catch(console.error);
