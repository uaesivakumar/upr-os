/**
 * Sync Markdown Documentation to Notion
 *
 * Automatically uploads all .md files from docs/ to Notion:
 * - Creates "Documentation" parent page (if not exists)
 * - Creates/updates child pages for each .md file
 * - Converts markdown to Notion blocks
 * - Organizes by directory structure
 * - Updates existing pages instead of duplicating
 *
 * Usage: npm run docs:sync
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;
const DOCS_DIR = path.join(process.cwd(), 'docs');

// Track created/updated pages to avoid duplicates
const pageRegistry = new Map(); // filename -> page_id
const categoryPages = new Map(); // category -> page_id

// Categorize docs for better organization
//
// HOW TO ADD NEW DOCS:
// 1. Create your .md file in docs/ directory
// 2. Add the filename (without .md) to the appropriate category below
// 3. Run: npm run docs:sync
//
// If you don't add it to a category, it will automatically go to "Other" category
//
const DOC_CATEGORIES = {
  'Sprint System': [
    'README_SPRINT_SYSTEM',
    'SPRINT_GIT_ROLLBACK_GUIDE',
    'SPRINT_16_HANDOFF',
    'SPRINT_HANDOFF'
    // Add new sprint-related docs here
  ],
  'Architecture & Design': [
    'COMPLETE_HIERARCHY_NOTION_GIT',
    'PHASE_4_AGENT_PROTOCOL',
    'PHASE_4_DEPLOYMENT',
    'COMPANY_PREVIEW_ARCHITECTURE'
    // Add new architecture docs here
  ],
  'SIVA System': [
    'SIVA_TOOL_CREATION_GUIDE',
    'SIVA_IMPLEMENTATION_STATUS',
    'SIVA_ALIGNMENT_ANALYSIS',
    'RADAR_SIVA_INTEGRATION_PHASE1'
    // Add new SIVA docs here
  ],
  'Tools & Automation': [
    'MARKDOWN_NOTION_SYNC_GUIDE',
    'NOTION_PRODUCTIVITY_SYSTEM_2030',
    'NOTION_QUICK_START'
    // Add new tools/automation docs here
  ],
  'Features & Integrations': [
    'EMAIL_DISCOVERY_LOGIC',
    'EMAIL_ENRICHMENT_ENHANCEMENTS',
    'ENRICHMENT_PAGE_INTEGRATION_GUIDE',
    'ENRICHMENT_VALIDATION_REPORT',
    'EMBEDDING_STANDARD'
    // Add new feature docs here
  ],
  'UI/UX': [
    'UX_TRANSFORMATION_COMPLETE',
    'UX_TRANSFORMATION_IMPLEMENTATION'
    // Add new UI/UX docs here
  ],
  'Troubleshooting': [
    'ERROR_RESOLUTION_GUIDE'
    // Add new troubleshooting docs here
  ],
  'Deployment & Operations': [
    // Add deployment/ops docs here
  ],
  'API Documentation': [
    // Add API docs here
  ]
};

/**
 * Convert markdown to Notion blocks
 * Simple conversion for common markdown patterns
 */
function markdownToNotionBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines at start
    if (!line.trim() && blocks.length === 0) {
      i++;
      continue;
    }

    // Heading 1 (#)
    if (line.startsWith('# ')) {
      blocks.push({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{
            type: 'text',
            text: { content: line.substring(2).trim() }
          }]
        }
      });
      i++;
      continue;
    }

    // Heading 2 (##)
    if (line.startsWith('## ')) {
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{
            type: 'text',
            text: { content: line.substring(3).trim() }
          }]
        }
      });
      i++;
      continue;
    }

    // Heading 3 (###)
    if (line.startsWith('### ')) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{
            type: 'text',
            text: { content: line.substring(4).trim() }
          }]
        }
      });
      i++;
      continue;
    }

    // Code block (```language)
    if (line.startsWith('```')) {
      // Extract language, removing any backticks or special chars
      const rawLanguage = line.substring(3).replace(/`/g, '').trim() || 'plain text';

      // Map to valid Notion languages
      const languageMap = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'py': 'python',
        'rb': 'ruby',
        'sh': 'shell',
        'http': 'plain text',
        'txt': 'plain text',
        'text': 'plain text',
        '': 'plain text'
      };

      // Use mapped language or original if it's likely valid
      const language = languageMap[rawLanguage.toLowerCase()] || rawLanguage.toLowerCase();

      const codeLines = [];
      i++;

      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }

      const codeContent = codeLines.join('\n');

      // Notion blocks can only hold 2000 chars
      if (codeContent.length > 2000) {
        // Split into multiple code blocks
        const chunks = codeContent.match(/.{1,1900}/g) || [];
        chunks.forEach((chunk, idx) => {
          blocks.push({
            object: 'block',
            type: 'code',
            code: {
              rich_text: [{
                type: 'text',
                text: { content: chunk }
              }],
              language: language
            }
          });
        });
      } else {
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: [{
              type: 'text',
              text: { content: codeContent }
            }],
            language: language
          }
        });
      }

      i++; // Skip closing ```
      continue;
    }

    // Bullet list (- or *)
    if (line.match(/^[\-\*]\s/)) {
      const content = line.substring(2).trim();

      // Limit bullet content to 2000 chars
      const truncated = content.length > 2000 ? content.substring(0, 2000) : content;

      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: truncated }
          }]
        }
      });
      i++;
      continue;
    }

    // Numbered list (1. 2. etc.)
    if (line.match(/^\d+\.\s/)) {
      const content = line.substring(line.indexOf('.') + 2).trim();

      // Limit content to 2000 chars
      const truncated = content.length > 2000 ? content.substring(0, 2000) : content;

      blocks.push({
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: truncated }
          }]
        }
      });
      i++;
      continue;
    }

    // Divider (---)
    if (line.trim() === '---') {
      blocks.push({
        object: 'block',
        type: 'divider',
        divider: {}
      });
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      // Only add divider if previous block exists (skip leading empty lines)
      if (blocks.length > 0) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{
              type: 'text',
              text: { content: '' }
            }]
          }
        });
      }
      i++;
      continue;
    }

    // Regular paragraph
    // Handle bold (**text**) and code (`text`) inline
    let content = line;

    // Limit paragraph to 2000 chars
    if (content.length > 2000) {
      content = content.substring(0, 2000);
    }

    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: content }
        }]
      }
    });
    i++;
  }

  return blocks;
}

/**
 * Find or create Documentation parent page
 */
async function findOrCreateDocumentationPage() {
  console.log('📁 Finding/Creating Documentation parent page...');

  // Search for existing "Documentation" page
  const response = await notion.search({
    query: 'Documentation',
    filter: {
      property: 'object',
      value: 'page'
    }
  });

  // Check if any result is a direct child of parent page
  for (const page of response.results) {
    if (page.parent.type === 'page_id' && page.parent.page_id === PARENT_PAGE_ID) {
      if (page.properties?.title?.title?.[0]?.text?.content === 'Documentation') {
        console.log(`✅ Found existing Documentation page: ${page.id}\n`);
        return page.id;
      }
    }
  }

  // Create new Documentation page
  console.log('Creating new Documentation page...');
  const newPage = await notion.pages.create({
    parent: { page_id: PARENT_PAGE_ID },
    properties: {
      title: {
        title: [{
          text: { content: 'Documentation' }
        }]
      }
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: 'Auto-synced markdown documentation from docs/ directory. Organized by category.' }
          }]
        }
      },
      {
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [{
            type: 'text',
            text: { content: '🔄 This page is automatically updated when markdown files change. Last sync: ' + new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' }) + ' (Dubai time)' }
          }],
          icon: { emoji: '📚' }
        }
      }
    ]
  });

  console.log(`✅ Created Documentation page: ${newPage.id}\n`);
  return newPage.id;
}

/**
 * Find or create category page under Documentation
 */
async function findOrCreateCategoryPage(docParentId, categoryName) {
  // Check if already created in this session
  if (categoryPages.has(categoryName)) {
    return categoryPages.get(categoryName);
  }

  // Search for existing category page
  const existingId = await findExistingPage(docParentId, categoryName);

  if (existingId) {
    categoryPages.set(categoryName, existingId);
    return existingId;
  }

  // Create new category page
  console.log(`   📂 Creating category: ${categoryName}`);
  const categoryPage = await notion.pages.create({
    parent: { page_id: docParentId },
    properties: {
      title: {
        title: [{
          text: { content: categoryName }
        }]
      }
    },
    icon: { emoji: getCategoryEmoji(categoryName) },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: `Documentation for ${categoryName}` }
          }]
        }
      }
    ]
  });

  categoryPages.set(categoryName, categoryPage.id);
  console.log(`   ✅ Category created: ${categoryPage.id}`);
  return categoryPage.id;
}

/**
 * Get emoji for category
 */
function getCategoryEmoji(categoryName) {
  const emojiMap = {
    'Sprint System': '🏃',
    'Architecture & Design': '🏗️',
    'SIVA System': '🧠',
    'Tools & Automation': '🔧',
    'Features & Integrations': '🔌',
    'UI/UX': '🎨',
    'Troubleshooting': '🔍'
  };
  return emojiMap[categoryName] || '📄';
}

/**
 * Get category for a doc filename
 */
function getCategoryForDoc(fileName) {
  const fileNameWithoutExt = fileName.replace('.md', '');

  for (const [category, docs] of Object.entries(DOC_CATEGORIES)) {
    if (docs.includes(fileNameWithoutExt)) {
      return category;
    }
  }

  return 'Other'; // Default category for uncategorized docs
}

/**
 * Find existing page by title under Documentation parent
 */
async function findExistingPage(parentId, title) {
  // Query all child pages of Documentation
  const response = await notion.blocks.children.list({
    block_id: parentId,
    page_size: 100
  });

  for (const block of response.results) {
    if (block.type === 'child_page') {
      // Fetch the full page to get title
      const page = await notion.pages.retrieve({ page_id: block.id });
      const pageTitle = page.properties?.title?.title?.[0]?.text?.content || '';

      if (pageTitle === title) {
        return block.id;
      }
    }
  }

  return null;
}

/**
 * Update existing page content
 */
async function updatePageContent(pageId, blocks) {
  console.log('   🔄 Updating existing page content...');

  // Delete all existing blocks
  const existingBlocks = await notion.blocks.children.list({
    block_id: pageId,
    page_size: 100
  });

  for (const block of existingBlocks.results) {
    await notion.blocks.delete({ block_id: block.id });
  }

  // Add new blocks in batches of 100 (Notion API limit)
  const batches = [];
  for (let i = 0; i < blocks.length; i += 100) {
    batches.push(blocks.slice(i, i + 100));
  }

  for (const batch of batches) {
    await notion.blocks.children.append({
      block_id: pageId,
      children: batch
    });
  }

  console.log('   ✅ Page content updated');
}

/**
 * Create or update a documentation page from markdown file
 */
async function syncMarkdownFile(categoryParentId, filePath, fileName) {
  console.log(`      📄 ${fileName}`);

  // Read markdown file
  const markdown = fs.readFileSync(filePath, 'utf-8');

  // Extract title from filename (remove .md extension)
  const title = fileName.replace('.md', '');

  // Convert markdown to Notion blocks
  const blocks = markdownToNotionBlocks(markdown);

  // Check if page already exists
  const existingPageId = await findExistingPage(categoryParentId, title);

  if (existingPageId) {
    await updatePageContent(existingPageId, blocks);
    pageRegistry.set(fileName, existingPageId);
  } else {
    // Create new page (Notion API limits to 100 blocks per create call)
    const initialBlocks = blocks.slice(0, 100);

    const newPage = await notion.pages.create({
      parent: { page_id: categoryParentId },
      properties: {
        title: {
          title: [{
            text: { content: title }
          }]
        }
      },
      children: initialBlocks
    });

    // Append remaining blocks if any
    if (blocks.length > 100) {
      const remainingBatches = [];
      for (let i = 100; i < blocks.length; i += 100) {
        remainingBatches.push(blocks.slice(i, i + 100));
      }

      for (const batch of remainingBatches) {
        await notion.blocks.children.append({
          block_id: newPage.id,
          children: batch
        });
      }
    }

    pageRegistry.set(fileName, newPage.id);
  }
}

/**
 * Main sync function
 */
async function syncAllMarkdownDocs() {
  console.log('📚 Markdown Documentation Sync\n');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Step 1: Find or create Documentation parent page
    const docParentId = await findOrCreateDocumentationPage();

    // Step 2: Get all .md files from docs/
    console.log('📂 Scanning docs/ directory...\n');

    const files = fs.readdirSync(DOCS_DIR);
    const markdownFiles = files.filter(f => f.endsWith('.md'));

    console.log(`Found ${markdownFiles.length} markdown files\n`);

    // Step 3: Organize files by category
    const filesByCategory = {};
    for (const file of markdownFiles) {
      const category = getCategoryForDoc(file);
      if (!filesByCategory[category]) {
        filesByCategory[category] = [];
      }
      filesByCategory[category].push(file);
    }

    console.log('📋 Organization:\n');
    for (const [category, files] of Object.entries(filesByCategory)) {
      console.log(`   ${getCategoryEmoji(category)} ${category} (${files.length} docs)`);
    }
    console.log('');

    // Step 4: Sync each category
    for (const [category, files] of Object.entries(filesByCategory)) {
      console.log(`\n${getCategoryEmoji(category)} ${category}:`);

      // Create category page
      const categoryPageId = await findOrCreateCategoryPage(docParentId, category);

      // Sync all files in this category
      for (const file of files) {
        const filePath = path.join(DOCS_DIR, file);
        await syncMarkdownFile(categoryPageId, filePath, file);
      }

      console.log(`   ✅ ${files.length} docs synced`);
    }

    // Step 5: Summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ Markdown Documentation Sync Complete!\n');
    console.log(`📊 Summary:`);
    console.log(`   Categories: ${Object.keys(filesByCategory).length}`);
    console.log(`   Files synced: ${markdownFiles.length}`);
    console.log(`   Pages created/updated: ${pageRegistry.size}`);
    console.log('');
    console.log('🔗 View in Notion:');
    console.log(`   Documentation: https://notion.so/${docParentId.replace(/-/g, '')}`);
    console.log('');
    console.log('📂 Categories:');
    for (const [category, files] of Object.entries(filesByCategory)) {
      const categoryId = categoryPages.get(category);
      console.log(`   ${getCategoryEmoji(category)} ${category} (${files.length} docs)`);
      if (categoryId) {
        console.log(`      https://notion.so/${categoryId.replace(/-/g, '')}`);
      }
    }
    console.log('');

  } catch (error) {
    console.error('❌ Error syncing documentation:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
    throw error;
  }
}

// Run sync
syncAllMarkdownDocs();
