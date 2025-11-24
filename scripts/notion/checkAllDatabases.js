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

const databases = {
  'MODULES': process.env.MODULES_DB_ID,
  'WORK_ITEMS': process.env.WORK_ITEMS_DB_ID,
  'JOURNAL (SPRINTS)': process.env.JOURNAL_DB_ID,
  'SPRINTS': process.env.SPRINTS_DB_ID,
  'SIVA_TOOLS': process.env.SIVA_TOOLS_DB_ID
};

async function checkAllDatabases() {
  console.log('\n📋 All Notion Databases Structure:\n');
  console.log('='.repeat(80) + '\n');

  for (const [name, dbId] of Object.entries(databases)) {
    if (!dbId) {
      console.log(`❌ ${name}: No database ID found\n`);
      continue;
    }

    try {
      const db = await notion.databases.retrieve({ database_id: dbId });
      console.log(`✅ ${name} (${dbId.substring(0, 8)}...)`);
      console.log(`   Title: ${db.title[0]?.plain_text || 'Untitled'}`);
      console.log(`   Properties (${Object.keys(db.properties).length}):`);

      const props = Object.keys(db.properties).slice(0, 10);
      props.forEach(prop => {
        console.log(`      • ${prop} (${db.properties[prop].type})`);
      });

      if (Object.keys(db.properties).length > 10) {
        console.log(`      ... and ${Object.keys(db.properties).length - 10} more`);
      }

      console.log('');
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}\n`);
    }
  }
}

checkAllDatabases().catch(console.error);
