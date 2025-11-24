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
const MODULES_DB = process.env.MODULES_DB_ID;

async function checkProperties() {
  const db = await notion.databases.retrieve({ database_id: MODULES_DB });
  console.log('\n📋 MODULE FEATURES Database Properties:\n');
  Object.keys(db.properties).forEach(prop => {
    console.log(`  • ${prop} (${db.properties[prop].type})`);
  });
}

checkProperties().catch(console.error);
