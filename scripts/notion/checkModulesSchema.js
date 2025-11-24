import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MODULES_DB = process.env.MODULES_DB_ID;

async function checkSchema() {
  console.log('📦 Modules Database Schema:\n');
  
  const db = await notion.databases.retrieve({
    database_id: MODULES_DB
  });
  
  console.log('Available properties:');
  for (const [key, value] of Object.entries(db.properties)) {
    console.log(`  - ${key}: ${value.type}`);
  }
  
  // Get all modules
  const response = await notion.databases.query({
    database_id: MODULES_DB,
    page_size: 10
  });
  
  console.log(`\n📊 Found ${response.results.length} modules:\n`);
  
  for (const page of response.results) {
    const name = page.properties['Name']?.title?.[0]?.plain_text || 'Untitled';
    console.log(`📌 ${name}`);
    console.log(`   ID: ${page.id}`);
    
    // Show all properties
    for (const [key, value] of Object.entries(page.properties)) {
      if (key === 'Name') continue;
      
      let displayValue = 'N/A';
      if (value.type === 'number') displayValue = value.number;
      else if (value.type === 'select') displayValue = value.select?.name;
      else if (value.type === 'checkbox') displayValue = value.checkbox;
      else if (value.type === 'rich_text') displayValue = value.rich_text?.[0]?.plain_text;
      
      if (displayValue !== 'N/A' && displayValue != null) {
        console.log(`   ${key}: ${displayValue}`);
      }
    }
    console.log('');
  }
}

checkSchema().catch(console.error);
