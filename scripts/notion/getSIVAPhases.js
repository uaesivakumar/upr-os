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

async function getSIVAPhases() {
  console.log('📊 Querying MODULES database for SIVA phases...\n');

  try {
    // Query all pages in the database (no filter to see everything)
    const response = await notion.databases.query({
      database_id: MODULES_DB_ID,
      page_size: 100
    });

    console.log(`Found ${response.results.length} total items in MODULES database\n`);

    // Filter for SIVA-related items
    const sivaItems = response.results.filter(page => {
      const name = page.properties.Features?.title?.[0]?.text?.content || '';
      return name.toLowerCase().includes('siva') ||
             name.toLowerCase().includes('phase') ||
             name.toLowerCase().includes('agentic');
    });

    console.log(`Found ${sivaItems.length} SIVA/Phase-related items\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const page of sivaItems) {
      const props = page.properties;

      // Extract properties
      const name = props.Features?.title?.[0]?.text?.content || 'Untitled';
      const status = props.Status?.select?.name || 'N/A';
      const priority = props.Priority?.select?.name || 'N/A';
      const notes = props.Notes?.rich_text?.[0]?.text?.content || '';
      const tags = props.Tags?.multi_select?.map(t => t.name).join(', ') || '';
      const filesProperty = props['Files & media']?.files || [];

      console.log(`📋 ${name}`);
      console.log(`   Status: ${status} | Priority: ${priority}`);
      if (tags) console.log(`   Tags: ${tags}`);

      // Check for files in the "Files & media" property
      if (filesProperty.length > 0) {
        console.log(`\n   📎 FILES ATTACHED (${filesProperty.length}):`);
        filesProperty.forEach((file, i) => {
          const fileName = file.name || 'Unnamed file';
          const fileUrl = file.file?.url || file.external?.url || 'N/A';
          const fileType = file.type; // 'file' or 'external'

          console.log(`\n      ${i + 1}. ${fileName}`);
          console.log(`         Type: ${fileType}`);
          console.log(`         URL: ${fileUrl}`);
        });
      } else {
        console.log(`   📎 No files attached`);
      }

      if (notes) {
        console.log(`\n   📝 Notes:`);
        console.log(`   ${notes.substring(0, 300)}${notes.length > 300 ? '...' : ''}`);
      }

      // Also get page content blocks
      console.log(`\n   🔍 Checking page content for embedded files...`);

      try {
        const blocks = await notion.blocks.children.list({
          block_id: page.id,
          page_size: 50
        });

        const fileBlocks = blocks.results.filter(block =>
          block.type === 'file' ||
          block.type === 'pdf' ||
          block.type === 'embed'
        );

        if (fileBlocks.length > 0) {
          console.log(`   Found ${fileBlocks.length} embedded files in page content:`);
          fileBlocks.forEach((block, i) => {
            if (block.type === 'file') {
              const fileUrl = block.file?.file?.url || block.file?.external?.url;
              console.log(`      - File: ${fileUrl}`);
            } else if (block.type === 'pdf') {
              const pdfUrl = block.pdf?.file?.url || block.pdf?.external?.url;
              console.log(`      - PDF: ${pdfUrl}`);
            } else if (block.type === 'embed') {
              console.log(`      - Embed: ${block.embed?.url}`);
            }
          });
        } else {
          console.log(`   No embedded files in page content`);
        }
      } catch (blockError) {
        console.log(`   Could not read page blocks: ${blockError.message}`);
      }

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Summary
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total items in database: ${response.results.length}`);
    console.log(`   SIVA/Phase items found: ${sivaItems.length}`);

    const itemsWithFiles = sivaItems.filter(p =>
      p.properties['Files & media']?.files?.length > 0
    );
    console.log(`   Items with file attachments: ${itemsWithFiles.length}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Details:', JSON.stringify(error.body, null, 2));
    }
  }
}

getSIVAPhases().catch(console.error);
