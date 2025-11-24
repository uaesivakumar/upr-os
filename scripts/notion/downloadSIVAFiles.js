import { Client } from "@notionhq/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import https from "https";

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const WORK_ITEMS_DB_ID = process.env.WORK_ITEMS_DB_ID;

// Create directory for downloaded files
const downloadsDir = path.join(process.cwd(), '../../docs/siva-phases');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', err => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

async function downloadSIVAFiles() {
  console.log('📊 Downloading SIVA phase Word documents...\n');

  try {
    const response = await notion.databases.query({
      database_id: WORK_ITEMS_DB_ID,
      page_size: 100
    });

    // Filter for Phase 1-12
    const phaseItems = response.results.filter(page => {
      const name = page.properties.Features?.title?.[0]?.text?.content || '';
      return /Phase \d+/.test(name);
    }).sort((a, b) => {
      const numA = parseInt(a.properties.Features?.title?.[0]?.text?.content.match(/Phase (\d+)/)?.[1] || '0');
      const numB = parseInt(b.properties.Features?.title?.[0]?.text?.content.match(/Phase (\d+)/)?.[1] || '0');
      return numA - numB;
    });

    console.log(`Found ${phaseItems.length} SIVA phases\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let totalFilesDownloaded = 0;

    for (const page of phaseItems) {
      const props = page.properties;
      const pageId = page.id;

      const name = props.Features?.title?.[0]?.text?.content || 'Untitled';
      const status = props.Status?.select?.name || 'N/A';
      const priority = props.Priority?.select?.name || 'N/A';
      const notes = props.Notes?.rich_text?.[0]?.text?.content || '';
      const eta = props.ETA?.number || 0;

      // ACCESS THE FILES & MEDIA PROPERTY DIRECTLY
      const filesProperty = props['Files & media']?.files || [];

      console.log(`📋 ${name}`);
      console.log(`   Status: ${status} | Priority: ${priority} | ETA: ${eta}h`);
      console.log(`   Notes: ${notes.substring(0, 100)}${notes.length > 100 ? '...' : ''}`);

      if (filesProperty.length > 0) {
        console.log(`\n   📎 FILES FOUND (${filesProperty.length}):`);

        for (let i = 0; i < filesProperty.length; i++) {
          const file = filesProperty[i];
          const fileName = file.name || 'Unnamed file';
          const fileUrl = file.file?.url || file.external?.url;
          const fileType = file.type; // 'file' or 'external'

          console.log(`\n      ${i + 1}. ${fileName}`);
          console.log(`         Type: ${fileType}`);
          console.log(`         URL: ${fileUrl ? fileUrl.substring(0, 80) + '...' : 'N/A'}`);

          if (fileUrl) {
            // Download file
            const phaseNum = name.match(/Phase (\d+)/)?.[1] || 'unknown';
            const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
            const filepath = path.join(downloadsDir, sanitizedName);

            try {
              console.log(`         📥 Downloading to: ${filepath}`);
              await downloadFile(fileUrl, filepath);
              console.log(`         ✅ Downloaded successfully`);
              totalFilesDownloaded++;

              // Get file stats
              const stats = fs.statSync(filepath);
              console.log(`         📦 Size: ${(stats.size / 1024).toFixed(2)} KB`);
            } catch (err) {
              console.log(`         ❌ Download failed: ${err.message}`);
            }
          }
        }
      } else {
        console.log(`   📎 No files in "Files & media" property`);
      }

      // Also get page content blocks for additional context
      try {
        const blocks = await notion.blocks.children.list({
          block_id: pageId,
          page_size: 100
        });

        let fullDescription = '';

        for (const block of blocks.results) {
          if (block.type === 'paragraph') {
            const text = block.paragraph?.rich_text?.map(t => t.plain_text).join('') || '';
            fullDescription += text + '\n';
          } else if (block.type === 'heading_1') {
            const text = block.heading_1?.rich_text?.map(t => t.plain_text).join('') || '';
            fullDescription += '\n## ' + text + '\n';
          } else if (block.type === 'heading_2') {
            const text = block.heading_2?.rich_text?.map(t => t.plain_text).join('') || '';
            fullDescription += '\n### ' + text + '\n';
          } else if (block.type === 'bulleted_list_item') {
            const text = block.bulleted_list_item?.rich_text?.map(t => t.plain_text).join('') || '';
            fullDescription += '- ' + text + '\n';
          } else if (block.type === 'numbered_list_item') {
            const text = block.numbered_list_item?.rich_text?.map(t => t.plain_text).join('') || '';
            fullDescription += '1. ' + text + '\n';
          }
        }

        // Save phase info to markdown
        const phaseNum = name.match(/Phase (\d+)/)?.[1] || 'unknown';
        const mdFilepath = path.join(downloadsDir, `Phase_${phaseNum}_README.md`);

        const mdContent = `# ${name}

**Status:** ${status}
**Priority:** ${priority}
**ETA:** ${eta} hours

---

## Summary

${notes}

---

## Detailed Description

${fullDescription.trim() || '(See attached Word document for full details)'}

---

## Attachments

${filesProperty.map((f, i) => `${i + 1}. ${f.name}`).join('\n')}

---

**Page ID:** ${pageId}
**Retrieved:** ${new Date().toISOString()}
`;

        fs.writeFileSync(mdFilepath, mdContent, 'utf-8');
        console.log(`\n   💾 Saved README to: Phase_${phaseNum}_README.md`);

      } catch (blockError) {
        console.log(`\n   ⚠️ Could not read page blocks: ${blockError.message}`);
      }

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Summary
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total phases processed: ${phaseItems.length}`);
    console.log(`   Total files downloaded: ${totalFilesDownloaded}`);
    console.log(`\n   📁 All files saved to: ${downloadsDir}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

downloadSIVAFiles().catch(console.error);
