#!/usr/bin/env node

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Try reading one of the known phase pages to see its properties
const PHASE_1_PAGE_ID = '2a366151-dd16-80a0-a55a-f9c96282e69a';

async function checkSchema() {
  try {
    console.log('🔍 Checking SIVA Phases Schema...\n');

    const page = await notion.pages.retrieve({ page_id: PHASE_1_PAGE_ID });

    console.log('Available Properties:');
    Object.keys(page.properties).forEach(propName => {
      const prop = page.properties[propName];
      console.log(`  - "${propName}" (type: ${prop.type})`);

      // Show current value
      if (prop.type === 'title' && prop.title[0]) {
        console.log(`    Value: ${prop.title[0].plain_text}`);
      } else if (prop.type === 'select' && prop.select) {
        console.log(`    Value: ${prop.select.name}`);
      } else if (prop.type === 'number' && prop.number !== null) {
        console.log(`    Value: ${prop.number}`);
      } else if (prop.type === 'rich_text' && prop.rich_text[0]) {
        console.log(`    Value: ${prop.rich_text[0].plain_text.substring(0, 100)}...`);
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkSchema();
