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
const MODULE_FEATURES_DB = process.env.WORK_ITEMS_DB_ID;

async function getSchema() {
  const db = await notion.databases.retrieve({ database_id: MODULE_FEATURES_DB });

  console.log('MODULE FEATURES Database Properties:\n');
  Object.entries(db.properties).forEach(([name, prop]) => {
    console.log(`"${name}": ${prop.type}`);
  });
}

getSchema().catch(console.error);
