/**
 * Create KNOWLEDGE Base in Notion
 *
 * Creates comprehensive knowledge base for learning and explaining UPR:
 * - Product Essentials
 * - Core Frameworks (SIVA, RADAR, MCP)
 * - Technical Architecture
 * - Technologies Used
 * - Key Capabilities
 * - Innovation & Differentiation
 * - Business Metrics
 * - Learning Paths
 * - Sprint Evolution
 *
 * Designed for multiple audiences: Investors, Clients, Tech Conferences, Job Interviews
 */

import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const PARENT_PAGE_ID = process.env.NOTION_PARENT_PAGE_ID;

// Track created pages
const knowledgePages = new Map();

/**
 * Create main KNOWLEDGE page
 */
async function createKnowledgePage() {
  console.log('📚 Creating KNOWLEDGE base...\n');

  const knowledgePage = await notion.pages.create({
    parent: { page_id: PARENT_PAGE_ID },
    icon: { emoji: '📚' },
    properties: {
      title: {
        title: [{ text: { content: 'KNOWLEDGE' } }]
      }
    },
    children: [
      {
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{
            type: 'text',
            text: { content: 'UPR Knowledge Base' }
          }],
          color: 'blue'
        }
      },
      {
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [{
            type: 'text',
            text: { content: 'Complete technical and business knowledge for explaining UPR to investors, clients, tech audiences, and hiring managers. Auto-updated with each sprint.' }
          }],
          icon: { emoji: '💡' },
          color: 'blue_background'
        }
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{
            type: 'text',
            text: { content: '🎯 Purpose' }
          }]
        }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: 'This knowledge base helps you understand and explain every technical aspect of UPR, whether you\'re:' }
          }]
        }
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: '💰 Pitching to investors (raising funds)' }
          }]
        }
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: '🏦 Selling to clients as BDM (banks, enterprises)' }
          }]
        }
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: '🎤 Presenting at tech conferences (founder role)' }
          }]
        }
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: '💼 Interviewing for tech roles (showcasing skills)' }
          }]
        }
      },
      {
        object: 'block',
        type: 'divider',
        divider: {}
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{
            type: 'text',
            text: { content: '📖 How to Use This Knowledge Base' }
          }]
        }
      },
      {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: 'Navigate to the topic you need to understand (e.g., "SIVA Framework")' }
          }]
        }
      },
      {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: 'Read the "Simple Explanation" first (ELI5 - Explain Like I\'m 5)' }
          }]
        }
      },
      {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: 'Review the "Real-World Analogy" to understand the concept' }
          }]
        }
      },
      {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: 'Study "Explain to Different Audiences" section for your target audience' }
          }]
        }
      },
      {
        object: 'block',
        type: 'numbered_list_item',
        numbered_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: 'Practice explaining it in your own words' }
          }]
        }
      },
      {
        object: 'block',
        type: 'divider',
        divider: {}
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: 'Navigate the sections below to explore each knowledge area.' }
          }]
        }
      }
    ]
  });

  console.log(`✅ Created KNOWLEDGE page: ${knowledgePage.id}\n`);
  return knowledgePage.id;
}

/**
 * Create category page under KNOWLEDGE
 */
async function createCategoryPage(parentId, emoji, title, description) {
  const page = await notion.pages.create({
    parent: { page_id: parentId },
    icon: { emoji: emoji },
    properties: {
      title: {
        title: [{ text: { content: title } }]
      }
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: description }
          }]
        }
      }
    ]
  });

  knowledgePages.set(title, page.id);
  console.log(`   ✅ ${emoji} ${title}`);
  return page.id;
}

/**
 * Create topic page with comprehensive content
 */
async function createTopicPage(parentId, emoji, title, content) {
  // Convert content object to Notion blocks
  const blocks = [];

  // Add icon and title already set in properties

  // Simple Explanation (ELI5)
  if (content.simple) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{
          type: 'text',
          text: { content: '🎈 Simple Explanation (ELI5)' }
        }],
        color: 'green'
      }
    });
    blocks.push({
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [{
          type: 'text',
          text: { content: content.simple }
        }],
        icon: { emoji: '💡' },
        color: 'green_background'
      }
    });
  }

  // Real-World Analogy
  if (content.analogy) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{
          type: 'text',
          text: { content: '🌍 Real-World Analogy' }
        }],
        color: 'orange'
      }
    });
    blocks.push({
      object: 'block',
      type: 'quote',
      quote: {
        rich_text: [{
          type: 'text',
          text: { content: content.analogy }
        }],
        color: 'orange_background'
      }
    });
  }

  // Technical Explanation
  if (content.technical) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{
          type: 'text',
          text: { content: '⚙️ Technical Explanation' }
        }],
        color: 'blue'
      }
    });
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          type: 'text',
          text: { content: content.technical }
        }]
      }
    });
  }

  // Why It Was Created
  if (content.why) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{
          type: 'text',
          text: { content: '❓ Why It Was Created' }
        }]
      }
    });

    if (content.why.problem) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: `Problem: ${content.why.problem}` }
          }]
        }
      });
    }

    if (content.why.solution) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: `Solution: ${content.why.solution}` }
          }]
        }
      });
    }

    if (content.why.impact) {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: `Impact: ${content.why.impact}` }
          }]
        }
      });
    }
  }

  // What If It Didn't Exist
  if (content.withoutIt && Array.isArray(content.withoutIt)) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{
          type: 'text',
          text: { content: '🚫 What If It Didn\'t Exist' }
        }],
        color: 'red'
      }
    });

    content.withoutIt.forEach(item => {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: item }
          }]
        }
      });
    });
  }

  // Technologies Behind It
  if (content.technologies && Array.isArray(content.technologies)) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{
          type: 'text',
          text: { content: '💻 Technologies Behind It' }
        }],
        color: 'purple'
      }
    });

    content.technologies.forEach(tech => {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: tech }
          }]
        }
      });
    });
  }

  // 2030 Ready
  if (content.future2030 && Array.isArray(content.future2030)) {
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{
          type: 'text',
          text: { content: '🚀 What Makes It 2030-Ready' }
        }],
        color: 'yellow'
      }
    });

    content.future2030.forEach(item => {
      blocks.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{
            type: 'text',
            text: { content: item }
          }]
        }
      });
    });
  }

  // Explain to Different Audiences
  if (content.audiences) {
    blocks.push({
      object: 'block',
      type: 'divider',
      divider: {}
    });
    blocks.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{
          type: 'text',
          text: { content: '🎭 Explain to Different Audiences' }
        }],
        color: 'pink'
      }
    });

    if (content.audiences.investor) {
      blocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{
            type: 'text',
            text: { content: '💰 To Investor (Raising Funds)' }
          }],
          color: 'green_background',
          children: [{
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: { content: content.audiences.investor }
              }]
            }
          }]
        }
      });
    }

    if (content.audiences.client) {
      blocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{
            type: 'text',
            text: { content: '🏦 To Client (BDM to Banks)' }
          }],
          color: 'blue_background',
          children: [{
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: { content: content.audiences.client }
              }]
            }
          }]
        }
      });
    }

    if (content.audiences.tech) {
      blocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{
            type: 'text',
            text: { content: '🎤 At Tech Conference (Founder)' }
          }],
          color: 'purple_background',
          children: [{
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: { content: content.audiences.tech }
              }]
            }
          }]
        }
      });
    }

    if (content.audiences.hiring) {
      blocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{
            type: 'text',
            text: { content: '💼 To Hiring Manager (Job Interview)' }
          }],
          color: 'orange_background',
          children: [{
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                type: 'text',
                text: { content: content.audiences.hiring }
              }]
            }
          }]
        }
      });
    }
  }

  // Create page with first 100 blocks
  const initialBlocks = blocks.slice(0, 100);

  const page = await notion.pages.create({
    parent: { page_id: parentId },
    icon: { emoji: emoji },
    properties: {
      title: {
        title: [{ text: { content: title } }]
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
        block_id: page.id,
        children: batch
      });
    }
  }

  console.log(`      ✅ ${title}`);
  return page.id;
}

/**
 * Main function
 */
async function buildKnowledgeBase() {
  console.log('📚 Building UPR Knowledge Base\n');
  console.log('='.repeat(80));
  console.log('This will take 10-15 minutes to create comprehensive content...\n');

  try {
    // Create main KNOWLEDGE page
    const knowledgeId = await createKnowledgePage();

    console.log('📂 Creating category pages...\n');

    // Import content data
    const { default: knowledgeContent } = await import('./knowledgeContent.js');

    // Create all categories and topics
    for (const category of knowledgeContent) {
      const categoryId = await createCategoryPage(
        knowledgeId,
        category.emoji,
        category.title,
        category.description
      );

      // Create topic pages under this category
      if (category.topics && category.topics.length > 0) {
        for (const topic of category.topics) {
          await createTopicPage(
            categoryId,
            topic.emoji,
            topic.title,
            topic.content
          );
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Knowledge Base Created Successfully!\n');
    console.log('📊 Summary:');
    console.log(`   Categories: ${knowledgeContent.length}`);
    console.log(`   Topics: ${knowledgeContent.reduce((sum, cat) => sum + (cat.topics?.length || 0), 0)}`);
    console.log('');
    console.log('🔗 View in Notion:');
    console.log(`   https://notion.so/${knowledgeId.replace(/-/g, '')}`);
    console.log('');

  } catch (error) {
    console.error('❌ Error creating knowledge base:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
    throw error;
  }
}

// Run
buildKnowledgeBase();
