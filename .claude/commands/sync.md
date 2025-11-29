# PremiumRadar-SAAS Notion Sync

Synchronize local progress with Notion - mark features as Done, update sprint progress.

**Usage:**
- `/sync` - Sync current sprint progress
- `/sync S26` - Sync specific sprint
- `/sync feature "Feature Name"` - Mark specific feature as Done

**NOTE:** This is for ROUTINE synchronization. Use `/notion-update` for fixing issues.

---

## SYNC WORKFLOW

### Step 1: Fetch Token
```bash
export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)
```

### Step 2: Identify Completed Work
TC analyzes recent activity:
```bash
# Check recent commits
git log --oneline -10

# Check modified files
git diff --stat HEAD~5

# Identify features completed
```

### Step 3: Update Feature Status
For each completed feature:
```javascript
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

async function markFeatureDone(featureName, sprintNumber) {
  // Find feature
  const response = await notion.databases.query({
    database_id: FEATURES_DB,
    filter: {
      and: [
        { property: 'Features', title: { contains: featureName } },
        { property: 'Sprint', number: { equals: sprintNumber } },
      ]
    }
  });

  if (response.results.length === 0) {
    console.log(`Feature not found: ${featureName}`);
    return;
  }

  const feature = response.results[0];

  // Update to Done
  await notion.pages.update({
    page_id: feature.id,
    properties: {
      'Status': { select: { name: 'Done' } },
      'Done?': { checkbox: true },
      'Completed At': { date: { start: new Date().toISOString().split('T')[0] } },
    },
  });

  console.log(`✓ Marked Done: ${featureName}`);
}
```

### Step 4: Update Sprint Progress
```javascript
async function updateSprintProgress(sprintNumber) {
  const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';
  const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

  // Get features for sprint
  const features = await notion.databases.query({
    database_id: FEATURES_DB,
    filter: { property: 'Sprint', number: { equals: sprintNumber } }
  });

  const total = features.results.length;
  const done = features.results.filter(f =>
    f.properties.Status?.select?.name === 'Done'
  ).length;

  // Find sprint
  const sprints = await notion.databases.query({
    database_id: SPRINTS_DB,
    filter: { property: 'Sprint', title: { contains: `S${sprintNumber}` } }
  });

  if (sprints.results.length > 0) {
    const sprint = sprints.results[0];
    const status = done === total ? 'Done' : 'In Progress';

    await notion.pages.update({
      page_id: sprint.id,
      properties: {
        'Status': { select: { name: status } },
        'Synced At': { date: { start: new Date().toISOString().split('T')[0] } },
      },
    });

    console.log(`Sprint S${sprintNumber}: ${done}/${total} features (${status})`);
  }
}
```

### Step 5: Report Sync Status
```
╔══════════════════════════════════════════════════════════════╗
║                    NOTION SYNC COMPLETE                      ║
╠══════════════════════════════════════════════════════════════╣
║ Sprint: S26                                                  ║
║ Features Updated: 3                                          ║
║   ✓ SIVASurface.tsx component                               ║
║   ✓ Neural mesh background animation                        ║
║   ✓ SIVAInputBar with Cmd+K                                 ║
║                                                              ║
║ Sprint Progress: 3/8 (37%)                                   ║
║ Sprint Status: In Progress                                   ║
║ Synced At: 2025-11-26                                        ║
╚══════════════════════════════════════════════════════════════╝
```

---

## SYNC TRIGGERS

### When to Sync
- After completing a feature
- After a commit
- Before ending a session
- After QA certification

### Auto-Sync Patterns
TC should sync automatically when:
1. Feature implementation is complete (files created/modified)
2. Tests pass for a feature
3. User says "done with X"
4. Moving to next feature

---

## QUICK SYNC COMMANDS

### Mark single feature Done
```javascript
// Quick one-liner
await markFeatureDone("SIVASurface", 26);
```

### Bulk sync all completed
```javascript
const completedFeatures = [
  "SIVASurface.tsx component",
  "Neural mesh background",
  "SIVAInputBar with Cmd+K",
];

for (const name of completedFeatures) {
  await markFeatureDone(name, 26);
}
```

### Check sync status
```javascript
// Get current sprint status
const status = await getSprintStatus(26);
console.log(`S26: ${status.done}/${status.total} (${status.percentage}%)`);
```

---

## SYNC vs NOTION-UPDATE

| `/sync` | `/notion-update` |
|---------|------------------|
| Routine progress updates | Fix problems |
| Mark features Done | Populate missing fields |
| Update sprint progress | Fix schema issues |
| Quick & frequent | Comprehensive & occasional |
| Assumes schema is correct | Verifies/fixes schema |

**Use `/sync` during normal work**
**Use `/notion-update` when things are broken**

---

## ERROR HANDLING

### Feature Not Found
```
⚠ Feature not found: "XYZ Component"
  - Check spelling
  - Verify sprint number
  - Run /notion-update to check schema
```

### Token Error
```
✗ Notion token invalid
  - Run: export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)
  - Verify: echo $NOTION_TOKEN | head -c 20
```

### Already Done
```
ℹ Feature already marked Done: "ABC Feature"
  - No update needed
  - Skipping...
```

---

## INTEGRATION WITH OTHER COMMANDS

### After `/start`
- TC begins work
- `/sync` after each feature completion

### Before `/qa`
- Run `/sync` to ensure Notion reflects actual progress
- Then run `/qa` for certification

### After `/deploy`
- Run `/sync` to update deployment-related notes

---

**TIP:** TC should proactively sync after completing features without being asked.
