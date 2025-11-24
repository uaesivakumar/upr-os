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
const WORK_ITEMS_DB = process.env.WORK_ITEMS_DB_ID;

async function checkProperties() {
  const db = await notion.databases.retrieve({ database_id: WORK_ITEMS_DB });
  console.log('\n📋 MODULE FEATURES (WORK_ITEMS) Properties:\n');
  Object.keys(db.properties).forEach(prop => {
    const type = db.properties[prop].type;
    console.log(`  • "${prop}" (${type})`);
  });
}

checkProperties().catch(console.error);
