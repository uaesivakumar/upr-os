import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const JOURNAL_DB = process.env.JOURNAL_DB_ID || process.env.NOTION_JOURNAL_DB;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 Adding Missing Columns to SPRINTS Database');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

async function addSprintColumns() {
  try {
    console.log('Adding new properties to SPRINTS database...\n');

    await notion.databases.update({
      database_id: JOURNAL_DB,
      properties: {
        'Started At': {
          date: {}
        },
        'Completed At': {
          date: {}
        },
        'Git Tag': {
          rich_text: {}
        },
        'Goal': {
          rich_text: {}
        },
        'Business Value': {
          rich_text: {}
        },
        'Phases Updated': {
          multi_select: {
            options: [
              { name: 'Phase 1: Database Infrastructure', color: 'blue' },
              { name: 'Phase 2: API Security', color: 'green' },
              { name: 'Phase 3: RADAR Automation', color: 'purple' },
              { name: 'Phase 4: Webhook Reliability', color: 'pink' },
              { name: 'Phase 5: Signal Intelligence', color: 'orange' },
              { name: 'Phase 6: Production Monitoring', color: 'yellow' },
              { name: 'Phase 12: Lead Scoring Engine', color: 'red' }
            ]
          }
        }
      }
    });

    console.log('✅ Successfully added properties:');
    console.log('   • Started At (date)');
    console.log('   • Completed At (date)');
    console.log('   • Git Tag (text)');
    console.log('   • Goal (text)');
    console.log('   • Business Value (text)');
    console.log('   • Phases Updated (multi-select with 7 options)\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ SPRINTS Database Updated!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

addSprintColumns();
