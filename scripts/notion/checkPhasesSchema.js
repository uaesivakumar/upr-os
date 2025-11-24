#!/usr/bin/env node
import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPath = path.join(process.cwd(), 'scripts', 'notion', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PHASES_DB_ID = '2a366151-dd16-815b-8431-ce6212efb9ac';

async function checkSchema() {
  console.log('Checking SIVA Phases database schema...\n');
  console.log(`Database ID: ${PHASES_DB_ID}\n`);

  try {
    const database = await notion.databases.retrieve({ database_id: PHASES_DB_ID });

    console.log('Properties:');
    console.log('─────────────────────────────────────────────────────────');
    Object.entries(database.properties).forEach(([name, prop]) => {
      console.log(`${name.padEnd(30)} | ${prop.type}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSchema();
