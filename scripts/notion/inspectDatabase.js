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

async function inspect() {
  const db = await notion.databases.retrieve({ database_id: WORK_ITEMS_DB });

  console.log("DATABASE SCHEMA:");
  console.log("");
  console.log("Properties:");
  Object.entries(db.properties).forEach(([name, prop]) => {
    console.log(`  "${name}": ${prop.type}`);
  });
}

inspect().catch(console.error);
