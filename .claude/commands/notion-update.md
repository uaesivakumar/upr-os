# Notion Sprint Update

Fix all Notion update issues and ensure complete property population.

**Use after:** Completing a stream, sprint, or when Notion data is incomplete.

---

## CRITICAL: Database Selection Rules

There are TWO separate Notion databases for sprints:

```javascript
// UPR OS Sprints Database (Intelligence Engine)
const DB_OS_ID = "2a266151dd16806c8caae5726ae4bf3e";

// PremiumRadar SaaS Sprints Database (UI/Frontend)
const DB_SAAS_ID = "2b566151dd1680c59d9fcd7c56acc5bd";
```

### When to Use DB_OS_ID (UPR OS):
- upr-os repo work
- Autonomous engines (S66-S70)
- SIVA, agents, routing layer
- Object Intelligence (S64)
- Evidence System (S65)
- OS Intelligence API (S71)
- LLM routing, vertical packs
- Any backend intelligence work

### When to Use DB_SAAS_ID (PremiumRadar SaaS):
- premiumradar-saas repo work
- Journey Engine Runtime (S48)
- Promptable Journeys (S49)
- Journey Execution Viewer (S50)
- Timeline Viewer (S51)
- Replay Engine (S52)
- Journey Debugger (S53)
- Any UI, Next.js, Prisma, React, hooks, components

### RULES:
1. **Never update both databases for the same sprint**
2. **Never assume OS and SaaS sprint numbers refer to the same item**
3. **Always check context** - same number can mean different sprints
4. **Respect the repo scope** - if working in premiumradar-saas, use DB_SAAS_ID

---

## Common Issues This Command Fixes

1. ❌ Columns not fully populated
2. ❌ Notion auth token not fetched
3. ❌ Database schema not understood
4. ❌ Property types incorrect (checkbox vs multi_select)
5. ❌ Status not updated properly
6. ❌ Missing dates, notes, or business value
7. ❌ Wrong database updated (OS vs SaaS)

## EXECUTE THESE STEPS IN ORDER:

### Step 1: Fetch Notion Token (CRITICAL)
```bash
export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)
echo "Token fetched: ${NOTION_TOKEN:0:10}..."
```

**If token fetch fails:**
```bash
# Check if you're authenticated with gcloud
gcloud auth list

# Re-authenticate if needed
gcloud auth login
```

### Step 2: Select Correct Database

```javascript
// DETERMINE WHICH DATABASE TO USE BASED ON CONTEXT:

// For OS sprints (upr-os repo, intelligence engine):
const SPRINTS_DB_ID = "2a266151dd16806c8caae5726ae4bf3e";

// For SaaS sprints (premiumradar-saas repo, UI/frontend):
const SPRINTS_DB_ID = "2b566151dd1680c59d9fcd7c56acc5bd";

// Features database (shared)
const FEATURES_DB_ID = "26ae5afe-4b5f-4d97-b402-5c459f188944";
```

### Step 3: Validate Database Schema
**CRITICAL:** Always verify property types before updating!

```javascript
// Query database schema
const db = await notion.databases.retrieve({ database_id: DB_ID });
const schema = {};
for (const [name, prop] of Object.entries(db.properties)) {
  schema[name] = prop.type;
}
console.log('Schema:', JSON.stringify(schema, null, 2));
```

### SPRINTS Database Schema
```javascript
{
  "Sprint": "title",
  "Status": "select",           // Options: Done, In Progress, Backlog
  "Goal": "rich_text",
  "Sprint Notes": "rich_text",
  "Outcomes": "rich_text",
  "Highlights": "rich_text",
  "Business Value": "rich_text",
  "Learnings": "rich_text",
  "Commit": "rich_text",
  "Git Tag": "rich_text",
  "Branch": "rich_text",
  "Started At": "date",
  "Completed At": "date",
  "Synced At": "date",
  "Phases Updated": "multi_select",  // NOT checkbox!
  "Commits Count": "number"
}
```

### FEATURES Database Schema
```javascript
{
  "Features": "title",
  "Sprint": "number",
  "Status": "select",           // Options: Done, In Progress, Backlog
  "Priority": "select",         // Options: High, Medium, Low
  "Complexity": "select",       // Options: High, Medium, Low
  "Type": "select",             // Options: Feature, Bug, Infrastructure, Testing
  "Notes": "rich_text",
  "Tags": "multi_select",
  "Assignee": "rich_text",
  "Done?": "checkbox",
  "Started At": "date",
  "Completed At": "date"
}
```

### Step 4: Run Full Update Script

**For Sprints (all properties):**
```javascript
await notion.pages.update({
  page_id: sprint.id,
  properties: {
    'Status': { select: { name: 'Done' } },
    'Goal': { rich_text: [{ text: { content: 'Goal description' } }] },
    'Sprint Notes': { rich_text: [{ text: { content: 'Notes here' } }] },
    'Outcomes': { rich_text: [{ text: { content: 'What was delivered' } }] },
    'Highlights': { rich_text: [{ text: { content: 'Key features' } }] },
    'Business Value': { rich_text: [{ text: { content: 'Impact' } }] },
    'Learnings': { rich_text: [{ text: { content: 'Technical insights' } }] },
    'Branch': { rich_text: [{ text: { content: 'feat/branch-name' } }] },
    'Commit': { rich_text: [{ text: { content: 'Implemented in feat/...' } }] },
    'Git Tag': { rich_text: [{ text: { content: 'sprint-sX-complete' } }] },
    'Started At': { date: { start: '2025-11-20' } },
    'Completed At': { date: { start: '2025-11-26' } },
    'Synced At': { date: { start: new Date().toISOString().split('T')[0] } },
    'Phases Updated': { multi_select: [{ name: 'Done' }] },
    'Commits Count': { number: 10 },
  },
});
```

**For Features (all properties):**
```javascript
await notion.pages.update({
  page_id: feature.id,
  properties: {
    'Status': { select: { name: 'Done' } },
    'Priority': { select: { name: 'High' } },
    'Complexity': { select: { name: 'Medium' } },
    'Type': { select: { name: 'Feature' } },
    'Notes': { rich_text: [{ text: { content: 'Feature description' } }] },
    'Tags': { multi_select: [{ name: 'UI' }, { name: 'AI' }] },
    'Assignee': { rich_text: [{ text: { content: 'Claude (TC)' } }] },
    'Done?': { checkbox: true },
    'Started At': { date: { start: '2025-11-20' } },
    'Completed At': { date: { start: '2025-11-26' } },
  },
});
```

### Step 5: Verify Update Success
```bash
# Run verification script
# USE THE CORRECT DB_ID FOR YOUR CONTEXT:
# - OS: 2a266151dd16806c8caae5726ae4bf3e
# - SaaS: 2b566151dd1680c59d9fcd7c56acc5bd

node -e "
const { Client } = require('@notionhq/client');
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// SELECT THE CORRECT DATABASE:
const DB_OS_ID = '2a266151dd16806c8caae5726ae4bf3e';    // UPR OS
const DB_SAAS_ID = '2b566151dd1680c59d9fcd7c56acc5bd';  // SaaS

// Change this based on context:
const SPRINTS_DB_ID = DB_SAAS_ID;  // or DB_OS_ID

notion.databases.query({
  database_id: SPRINTS_DB_ID,
  page_size: 1,
  sorts: [{ property: 'Sprint', direction: 'descending' }]
}).then(res => {
  const p = res.results[0].properties;
  console.log('Sample Sprint Properties:');
  console.log('- Status:', p.Status?.select?.name || 'MISSING');
  console.log('- Goal:', p.Goal?.rich_text?.[0]?.plain_text?.substring(0,30) || 'MISSING');
  console.log('- Business Value:', p['Business Value']?.rich_text?.[0]?.plain_text?.substring(0,30) || 'MISSING');
});
"
```

## Quick Fix Scripts

**Fix all sprints in range:**
```bash
NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS) node scripts/notion/fixAllSprintsV2.js
```

**Fix all features in range:**
```bash
NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS) node scripts/notion/fixStream11Complete.js
```

## Usage

```
/notion-update
```

Or with specific range:
```
/notion-update S1-S10
```

## Troubleshooting

### "Property X is expected to be Y"
- **Cause:** Using wrong property type (e.g., checkbox instead of multi_select)
- **Fix:** Check schema above and use correct type

### "Token not found"
- **Cause:** NOTION_TOKEN not set
- **Fix:** Run `export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)`

### "Page not found"
- **Cause:** Wrong database ID or page ID
- **Fix:** Verify IDs in `.notion-db-ids.json`

### "Validation error"
- **Cause:** Property name mismatch
- **Fix:** Property names are case-sensitive - verify exact names

## FORBIDDEN PRACTICES

- ❌ NEVER update only the Status field
- ❌ NEVER skip filling required fields
- ❌ NEVER assume a field is optional
- ❌ NEVER leave Notes, Learnings, or Business Value empty
- ❌ NEVER assume property types - always verify schema first
