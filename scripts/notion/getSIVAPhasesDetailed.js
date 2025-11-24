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

async function getSIVAPhasesDetailed() {
  console.log('📊 Retrieving detailed SIVA phase information...\n');

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
      // Sort by phase number
      const numA = parseInt(a.properties.Features?.title?.[0]?.text?.content.match(/Phase (\d+)/)?.[1] || '0');
      const numB = parseInt(b.properties.Features?.title?.[0]?.text?.content.match(/Phase (\d+)/)?.[1] || '0');
      return numA - numB;
    });

    console.log(`Found ${phaseItems.length} SIVA phases\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const phaseDetails = [];

    for (const page of phaseItems) {
      const props = page.properties;
      const pageId = page.id;

      const name = props.Features?.title?.[0]?.text?.content || 'Untitled';
      const status = props.Status?.select?.name || 'N/A';
      const priority = props.Priority?.select?.name || 'N/A';
      const notes = props.Notes?.rich_text?.[0]?.text?.content || '';
      const eta = props.ETA?.number || 0;
      const tags = props.Tags?.multi_select?.map(t => t.name).join(', ') || '';

      console.log(`📋 ${name}`);
      console.log(`   Status: ${status} | Priority: ${priority} | ETA: ${eta}h`);
      if (tags) console.log(`   Tags: ${tags}`);

      // Get page content to extract detailed description
      console.log(`\n   📄 Retrieving page content...`);

      const blocks = await notion.blocks.children.list({
        block_id: pageId,
        page_size: 100
      });

      let fullDescription = '';
      const files = [];

      for (const block of blocks.results) {
        // Extract text content
        if (block.type === 'paragraph') {
          const text = block.paragraph?.rich_text?.map(t => t.plain_text).join('') || '';
          fullDescription += text + '\n';
        } else if (block.type === 'heading_1') {
          const text = block.heading_1?.rich_text?.map(t => t.plain_text).join('') || '';
          fullDescription += '\n## ' + text + '\n';
        } else if (block.type === 'heading_2') {
          const text = block.heading_2?.rich_text?.map(t => t.plain_text).join('') || '';
          fullDescription += '\n### ' + text + '\n';
        } else if (block.type === 'heading_3') {
          const text = block.heading_3?.rich_text?.map(t => t.plain_text).join('') || '';
          fullDescription += '\n#### ' + text + '\n';
        } else if (block.type === 'bulleted_list_item') {
          const text = block.bulleted_list_item?.rich_text?.map(t => t.plain_text).join('') || '';
          fullDescription += '- ' + text + '\n';
        } else if (block.type === 'numbered_list_item') {
          const text = block.numbered_list_item?.rich_text?.map(t => t.plain_text).join('') || '';
          fullDescription += '1. ' + text + '\n';
        } else if (block.type === 'file') {
          const fileData = block.file?.file || block.file?.external;
          if (fileData) {
            files.push({
              type: 'file',
              name: fileData.name || 'Unnamed file',
              url: fileData.url
            });
          }
        } else if (block.type === 'pdf') {
          const pdfData = block.pdf?.file || block.pdf?.external;
          if (pdfData) {
            files.push({
              type: 'pdf',
              name: 'PDF Document',
              url: pdfData.url
            });
          }
        }
      }

      console.log(`   📝 Content length: ${fullDescription.length} characters`);

      if (files.length > 0) {
        console.log(`\n   📎 FILES FOUND (${files.length}):`);

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          console.log(`\n      ${i + 1}. ${file.name}`);
          console.log(`         Type: ${file.type}`);
          console.log(`         URL: ${file.url.substring(0, 80)}...`);

          // Download file
          const phaseNum = name.match(/Phase (\d+)/)?.[1] || 'unknown';
          const filename = `Phase_${phaseNum}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
          const filepath = path.join(downloadsDir, filename);

          try {
            console.log(`         Downloading to: ${filepath}`);
            await downloadFile(file.url, filepath);
            console.log(`         ✅ Downloaded successfully`);
          } catch (err) {
            console.log(`         ❌ Download failed: ${err.message}`);
          }
        }
      } else {
        console.log(`   📎 No files attached`);
      }

      // Save phase details
      phaseDetails.push({
        phase: name,
        status,
        priority,
        eta,
        notes,
        fullDescription: fullDescription.trim(),
        files,
        pageId
      });

      // Save description to markdown file
      const phaseNum = name.match(/Phase (\d+)/)?.[1] || 'unknown';
      const mdFilepath = path.join(downloadsDir, `Phase_${phaseNum}_Description.md`);

      const mdContent = `# ${name}

**Status:** ${status}
**Priority:** ${priority}
**ETA:** ${eta} hours
**Tags:** ${tags}

---

## Description

${fullDescription}

---

**Page ID:** ${pageId}
**Retrieved:** ${new Date().toISOString()}
`;

      fs.writeFileSync(mdFilepath, mdContent, 'utf-8');
      console.log(`   💾 Saved description to: ${mdFilepath}\n`);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Summary
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total phases retrieved: ${phaseDetails.length}`);
    console.log(`   Phases with files: ${phaseDetails.filter(p => p.files.length > 0).length}`);
    console.log(`   Total files downloaded: ${phaseDetails.reduce((sum, p) => sum + p.files.length, 0)}`);
    console.log(`\n   📁 All files saved to: ${downloadsDir}\n`);

    // Save summary JSON
    const summaryPath = path.join(downloadsDir, 'phases_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(phaseDetails, null, 2), 'utf-8');
    console.log(`   💾 Phase summary saved to: ${summaryPath}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  }
}

getSIVAPhasesDetailed().catch(console.error);
