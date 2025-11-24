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
const WORK_ITEMS_DB = process.env.WORK_ITEMS_DB_ID || process.env.NOTION_WORKITEMS_DB;

async function addAIScoreProperty() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🤖 Adding AI Score Property");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  if (!WORK_ITEMS_DB) {
    console.error("❌ Error: WORK_ITEMS_DB_ID not found");
    process.exit(1);
  }

  try {
    // Add AI Score property to Work Items database
    await notion.databases.update({
      database_id: WORK_ITEMS_DB,
      properties: {
        "AI Score": {
          number: {
            format: "number"
          }
        }
      }
    });

    console.log("✅ Successfully added 'AI Score' property to Work Items database");
    console.log("");
    console.log("Property details:");
    console.log("  • Name: AI Score");
    console.log("  • Type: Number (0-100)");
    console.log("  • Purpose: AI-calculated task priority score");
    console.log("");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Ready for AI prioritization!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
    console.log("Next steps:");
    console.log("  1. Refresh your Notion database");
    console.log("  2. Run 'npm run ai:prioritize' to calculate scores");
    console.log("  3. AI Score will populate automatically");

  } catch (error) {
    if (error.code === 'validation_error' && error.message.includes('already exists')) {
      console.log("✓ AI Score property already exists");
      console.log("  No changes needed");
    } else {
      console.error("❌ Error:", error.message);
      throw error;
    }
  }
}

addAIScoreProperty().catch(console.error);
