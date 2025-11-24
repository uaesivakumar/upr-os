import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const JOURNAL_DB = process.env.JOURNAL_DB_ID || process.env.NOTION_JOURNAL_DB;

async function checkProperties() {
  const db = await notion.databases.retrieve({ database_id: JOURNAL_DB });
  console.log('\n📋 SPRINTS Database Properties:\n');
  Object.keys(db.properties).forEach(prop => {
    console.log(`  • ${prop} (${db.properties[prop].type})`);
  });
}

checkProperties().catch(console.error);
