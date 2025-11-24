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

async function getModules() {
  const response = await notion.databases.query({
    database_id: MODULES_DB
  });

  console.log('\n📦 Modules in Database:\n');
  response.results.forEach(page => {
    const name = page.properties.Name?.title[0]?.plain_text || 'Unnamed';
    console.log(`  • ${name}: ${page.id}`);
  });
}

getModules().catch(console.error);
