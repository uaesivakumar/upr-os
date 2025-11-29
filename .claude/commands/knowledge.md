# PremiumRadar-SAAS Knowledge Page Updater

Update the Knowledge Page in Notion after completing a stretch (one or more sprints).

**IMPORTANT:** The Knowledge Page is for SKC's learning, NOT documentation. Minimal updates are FORBIDDEN.

## Knowledge Page Structure

**Parent Page ID:** `f1552250-cafc-4f5f-90b0-edc8419e578b`

### MANDATORY MULTI-PAGE STRUCTURE

Each stream MUST create MULTIPLE sub-pages (one page per major concept):
- **Rule:** For every 3-5 features, create 1 learning page
- **A stream with 29 features → 5-7 learning pages**

```
📚 Knowledge (parent page)
├── 🎯 Topic 1 (Updated: YYYY-MM-DD)
├── 🔮 Topic 2 (Updated: YYYY-MM-DD)
├── 🎨 Topic 3 (Updated: YYYY-MM-DD)
└── ... (more as needed)
```

## Each Sub-Page MUST Follow This Structure

### 1. ELI5 Section (MANDATORY)
```
🎯 Simple Explanation (ELI5)    ← heading_2 with color: "orange"
💡 [Simple explanation...]      ← callout with color: "yellow_background"
```

### 2. Real-World Analogy (MANDATORY)
```
🌍 Real-World Analogy           ← heading_2 with color: "green"
[Relatable analogy...]          ← quote with color: "green_background"
```

### 3. Technical Explanation
```
⚙️ Technical Explanation        ← heading_2 with color: "purple"
[How it works technically...]   ← paragraph
```

### 4. Implementation Details
```
🛠️ Implementation Details      ← heading_2 with color: "blue"
• Component: [...]              ← bullet list with files created
```

## Notion API Block Templates

```javascript
// 1. COLORED HEADING
const coloredHeading = (text, color) => ({
  object: 'block',
  type: 'heading_2',
  heading_2: {
    rich_text: [{ type: 'text', text: { content: text } }],
    color: color  // "orange", "green", "purple", "blue"
  }
});

// 2. YELLOW CALLOUT (for ELI5)
const yellowCallout = (text, emoji = '💡') => ({
  object: 'block',
  type: 'callout',
  callout: {
    rich_text: [{ type: 'text', text: { content: text } }],
    icon: { type: 'emoji', emoji: emoji },
    color: 'yellow_background'
  }
});

// 3. GREEN QUOTE (for Analogy)
const greenQuote = (text) => ({
  object: 'block',
  type: 'quote',
  quote: {
    rich_text: [{ type: 'text', text: { content: text } }],
    color: 'green_background'
  }
});
```

## MANDATORY COLOR SCHEME

| Section | Block Type | Color |
|---------|------------|-------|
| ELI5 Heading | heading_2 | `orange` |
| ELI5 Content | callout | `yellow_background` |
| Analogy Heading | heading_2 | `green` |
| Analogy Content | quote | `green_background` |
| Technical Heading | heading_2 | `purple` |
| Implementation Heading | heading_2 | `blue` |

## EXECUTE THESE STEPS:

### Step 1: Fetch Notion Token
```bash
export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)
```

### Step 2: Identify Topics to Create
Based on the completed stream/stretch, identify major concepts:
- Group related features by concept
- Ask: "What is the ONE thing SKC should learn from these features?"
- That becomes the page title

### Step 3: Create Sub-Pages
For each topic, create a child page under Knowledge:
```javascript
const page = await notion.pages.create({
  parent: { page_id: 'f1552250-cafc-4f5f-90b0-edc8419e578b' },
  icon: { emoji: '🎯' },
  properties: {
    title: { title: [{ text: { content: 'Topic Name (Updated: 2025-11-26)' } }] },
  },
  children: [
    // ELI5 section
    coloredHeading('🎯 Simple Explanation (ELI5)', 'orange'),
    yellowCallout('Simple explanation here...', '💡'),

    // Analogy section
    coloredHeading('🌍 Real-World Analogy', 'green'),
    greenQuote('Relatable analogy here...'),

    // Technical section
    coloredHeading('⚙️ Technical Explanation', 'purple'),
    { type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Technical details...' } }] } },

    // Implementation section
    coloredHeading('🛠️ Implementation Details', 'blue'),
    { type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'File: component.tsx' } }] } },
  ],
});
```

### Step 4: Verify Pages Created
```bash
# Check Knowledge page children
node -e "
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

notion.blocks.children.list({ block_id: 'f1552250-cafc-4f5f-90b0-edc8419e578b' })
  .then(res => res.results.forEach(b => console.log(b.child_page?.title || b.type)));
"
```

## FORBIDDEN PRACTICES

- ❌ ONE page for entire stream (must be multiple pages)
- ❌ Creating 100+ flat blocks in one page
- ❌ Long paragraphs without structure
- ❌ Making ELI5/Analogy collapsible (they should always be visible)
- ❌ Skipping the visual hierarchy (colors, callouts, toggles)
- ❌ Using plain text where callouts/quotes should be used
- ❌ Minimal updates
- ❌ Skipping Knowledge Page update after a stretch

## Usage

```
/knowledge
```

Or with stream context:
```
/knowledge stream-11
```

## Reference Scripts

- `scripts/notion/createKnowledgePages.js` - Base template
- `scripts/notion/createColorfulKnowledgePages.js` - Colorful version
- `.claude/notion/sync.ts` - Schema reference (if exists)

## Example Output

After running this command, TC should report:
```
Knowledge Page Update Complete!
Created 5 sub-pages for Stream 11:
1. 🧠 SIVA Surface Architecture (Updated: 2025-11-26)
2. 📦 Output Object System (Updated: 2025-11-26)
3. 🤖 Multi-Agent Orchestration (Updated: 2025-11-26)
4. 🔍 Reasoning Overlay System (Updated: 2025-11-26)
5. 🎨 Neural Mesh Background (Updated: 2025-11-26)

All pages follow ELI5 + Analogy + Technical structure.
```
