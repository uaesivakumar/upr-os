import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath = path.join(process.cwd(), 'scripts', 'notion', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const WORK_ITEMS_DB = process.env.WORK_ITEMS_DB_ID;

async function addTagsProperty() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏷️  Adding Tags Property");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  try {
    await notion.databases.update({
      database_id: WORK_ITEMS_DB,
      properties: {
        "Tags": {
          multi_select: {
            options: [
              { name: "backend", color: "blue" },
              { name: "frontend", color: "purple" },
              { name: "api", color: "green" },
              { name: "urgent", color: "red" },
              { name: "quick-win", color: "yellow" },
              { name: "production", color: "red" },
              { name: "ux", color: "pink" },
              { name: "database", color: "gray" },
              { name: "sprint16", color: "orange" },
              { name: "research", color: "brown" }
            ]
          }
        }
      }
    });

    console.log("✅ Successfully added 'Tags' property");
    console.log("");
    console.log("Pre-configured tags:");
    console.log("  • backend, frontend, api");
    console.log("  • urgent, quick-win, production");
    console.log("  • ux, database, research");
    console.log("  • sprint16");
    console.log("");
    console.log("You can add more tags as needed in Notion!");

  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log("✓ Tags property already exists");
    } else {
      console.error("❌ Error:", error.message);
    }
  }
}

addTagsProperty().catch(console.error);
