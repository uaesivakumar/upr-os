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
const SIVA_TOOLS_DB = process.env.SIVA_TOOLS_DB_ID;

async function viewPhases() {
  const response = await notion.databases.query({
    database_id: SIVA_TOOLS_DB,
    sorts: [{ property: 'Phase', direction: 'ascending' }]
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SIVA 12 Phases Progress in Notion');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`Total SIVA entries: ${response.results.length}\n`);

  const phases = {};
  response.results.forEach(page => {
    const name = page.properties.Name?.title[0]?.plain_text || 'Unnamed';
    const phase = page.properties.Phase?.rich_text[0]?.plain_text || 'No Phase';
    const status = page.properties.Status?.select?.name || 'No Status';
    const sprint = page.properties.Sprint?.relation[0]?.id || null;

    if (!phases[phase]) {
      phases[phase] = {
        items: [],
        complete: 0,
        inProgress: 0,
        notStarted: 0
      };
    }

    phases[phase].items.push({ name, status, sprint });

    if (status === 'Complete') phases[phase].complete++;
    else if (status === 'In Progress') phases[phase].inProgress++;
    else phases[phase].notStarted++;
  });

  const phaseKeys = Object.keys(phases).filter(p => p.startsWith('Phase')).sort();

  phaseKeys.forEach(phase => {
    const data = phases[phase];
    const total = data.items.length;
    const progress = total > 0 ? Math.round((data.complete / total) * 100) : 0;

    console.log(`${phase}:`);
    console.log(`  Progress: ${progress}% (${data.complete}/${total} complete)`);
    console.log(`  Status: ${data.complete} ✅ | ${data.inProgress} 🔄 | ${data.notStarted} 📋`);

    data.items.forEach(item => {
      const icon = item.status === 'Complete' ? '✅' :
                   item.status === 'In Progress' ? '🔄' : '📋';
      console.log(`    ${icon} ${item.name}`);
    });
    console.log('');
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

viewPhases().catch(console.error);
