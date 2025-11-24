import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MODULES_DB_ID = process.env.MODULES_DB_ID;
const WORK_ITEMS_DB_ID = process.env.WORK_ITEMS_DB_ID;

async function listAllItems() {
  console.log('📊 Listing ALL items from both databases...\n');

  // Check MODULES database
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗂️  MODULES Database:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const modulesResponse = await notion.databases.query({
      database_id: MODULES_DB_ID,
      page_size: 100
    });

    console.log(`Found ${modulesResponse.results.length} items:\n`);

    modulesResponse.results.forEach((page, i) => {
      const name = page.properties.Features?.title?.[0]?.text?.content || 'Untitled';
      const files = page.properties['Files & media']?.files || [];
      console.log(`${i + 1}. ${name} ${files.length > 0 ? `(📎 ${files.length} files)` : ''}`);
    });

  } catch (error) {
    console.error('Error querying MODULES:', error.message);
  }

  // Check MODULE FEATURES (WORK_ITEMS) database
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗂️  MODULE FEATURES (Work Items) Database:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const workItemsResponse = await notion.databases.query({
      database_id: WORK_ITEMS_DB_ID,
      page_size: 100
    });

    console.log(`Found ${workItemsResponse.results.length} items:\n`);

    // Group by SIVA-related
    const sivaItems = workItemsResponse.results.filter(page => {
      const name = page.properties.Features?.title?.[0]?.text?.content || '';
      return name.toLowerCase().includes('siva') ||
             name.toLowerCase().includes('phase') ||
             name.toLowerCase().includes('agentic');
    });

    if (sivaItems.length > 0) {
      console.log(`📌 SIVA/Phase-related items (${sivaItems.length}):\n`);
      sivaItems.forEach((page, i) => {
        const name = page.properties.Features?.title?.[0]?.text?.content || 'Untitled';
        const priority = page.properties.Priority?.select?.name || '';
        const status = page.properties.Status?.select?.name || '';
        console.log(`${i + 1}. ${name}`);
        console.log(`   Priority: ${priority} | Status: ${status}`);
      });
    }

    console.log(`\n📌 All items:\n`);
    workItemsResponse.results.forEach((page, i) => {
      const name = page.properties.Features?.title?.[0]?.text?.content || 'Untitled';
      const status = page.properties.Status?.select?.name || '';
      console.log(`${i + 1}. [${status}] ${name}`);
    });

  } catch (error) {
    console.error('Error querying MODULE FEATURES:', error.message);
  }
}

listAllItems().catch(console.error);
