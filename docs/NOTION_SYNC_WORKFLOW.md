# Notion Sync Workflow Guide

**Complete guide for keeping Notion synchronized with your codebase**

---

## Quick Reference

```bash
# Sync everything to Notion (recommended after major changes)
npm run notion:sync-all

# Sync only markdown docs (after creating/updating .md files)
npm run docs:sync

# Sync only SIVA progress (after SIVA tool development)
npm run notion:sync-siva-docs
```

---

## When to Sync

### Scenario 1: Created New Markdown Documentation

**What you did:**
```bash
# Created new deployment guide
echo "# Deployment Guide" > docs/DEPLOYMENT_GUIDE.md
vim docs/DEPLOYMENT_GUIDE.md
```

**What to do:**

**Option A - Categorized (Recommended):**
```bash
# 1. Add to category in syncMarkdownDocs.js
vim scripts/notion/syncMarkdownDocs.js

# Find DOC_CATEGORIES and add:
'Deployment & Operations': [
  'DEPLOYMENT_GUIDE'  // ← Add this
]

# 2. Sync to Notion
npm run docs:sync
```

**Option B - Quick (Uncategorized):**
```bash
# Just sync - goes to "Other" category
npm run docs:sync
```

**Result:**
- ✅ New doc appears in Notion Documentation
- ✅ Under correct category (or "Other")
- ✅ Searchable in Notion
- ✅ Source of truth still in Git

---

### Scenario 2: Updated Existing Documentation

**What you did:**
```bash
vim docs/README_SPRINT_SYSTEM.md
# Made changes...
git add docs/README_SPRINT_SYSTEM.md
git commit -m "docs: update sprint system guide"
```

**What to do:**
```bash
# Sync to Notion (overwrites existing page)
npm run docs:sync
```

**Result:**
- ✅ Existing Notion page updated
- ✅ Same URL (not duplicated)
- ✅ Latest content from Git

---

### Scenario 3: Completed SIVA Tool Development

**What you did:**
```bash
# Implemented Tool 5
vim server/siva-tools/ContactQualityTool.js
# Wrote tests, committed code
git commit -m "feat: implement Tool 5 ContactQualityTool"
```

**What to do:**
```bash
# Sync SIVA progress to Notion
npm run notion:sync-siva-docs
```

**Result:**
- ✅ MODULE FEATURES updated (Phase 1: 50% → 62.5%)
- ✅ AI Score updated
- ✅ Documentation uploaded
- ✅ Status reflects completion

---

### Scenario 4: Major Sprint Work (Multiple Changes)

**What you did:**
```bash
# Completed Sprint 17:
# - Built Tools 5-7
# - Added dark mode feature
# - Created sprint handoff doc
# - Updated multiple guides
```

**What to do:**
```bash
# Sync everything at once
npm run notion:sync-all
```

**What it does:**
1. Syncs SIVA progress (Tools 5-7 completion)
2. Syncs all markdown docs (sprint handoff, guides)

**Result:**
- ✅ All SIVA progress updated
- ✅ All documentation current
- ✅ One command, complete sync

---

## Available Sync Commands

### `npm run notion:sync-all` ⭐ (Recommended)

**Purpose:** Complete sync of everything
**When:** After major work, sprint completion, before demos
**What it syncs:**
- SIVA progress (MODULE FEATURES)
- Markdown documentation (Documentation section)

**Example:**
```bash
# After completing Sprint 17
git commit -m "feat: Sprint 17 complete"
npm run notion:sync-all
```

---

### `npm run docs:sync`

**Purpose:** Sync markdown documentation only
**When:** After creating/updating .md files
**What it syncs:**
- All .md files from `docs/` directory
- Organized by category
- Creates/updates Notion pages

**Example:**
```bash
# After creating new guide
echo "# API Guide" > docs/API_GUIDE.md
npm run docs:sync
```

---

### `npm run notion:sync-siva-docs`

**Purpose:** Sync SIVA tool progress only
**When:** After SIVA tool development
**What it syncs:**
- Tool completion status
- Phase progress percentages
- Documentation files
- AI scores

**Example:**
```bash
# After implementing Tool 5
git commit -m "feat: implement Tool 5"
npm run notion:sync-siva-docs
```

---

### `npm run notion:sync-siva`

**Purpose:** Basic SIVA progress sync (no docs)
**When:** Quick progress update
**What it syncs:**
- Tool completion status
- Phase percentages
- Status updates

**Example:**
```bash
# Quick progress check
npm run notion:sync-siva
```

---

## Adding New Documentation

### Step-by-Step Workflow

**1. Create the markdown file:**
```bash
cd docs/
vim MY_NEW_GUIDE.md
```

**2. Write your documentation:**
```markdown
# My New Guide

## Overview
This guide explains...

## Usage
...
```

**3. Choose category (optional):**

**Option A - Add to existing category:**
```bash
vim scripts/notion/syncMarkdownDocs.js

# Find DOC_CATEGORIES and add your file:
const DOC_CATEGORIES = {
  'Tools & Automation': [
    'MARKDOWN_NOTION_SYNC_GUIDE',
    'NOTION_PRODUCTIVITY_SYSTEM_2030',
    'NOTION_QUICK_START',
    'MY_NEW_GUIDE'  // ← Add here
  ],
  // ...
};
```

**Option B - Create new category:**
```bash
vim scripts/notion/syncMarkdownDocs.js

# Add new category:
const DOC_CATEGORIES = {
  // ... existing categories ...
  'My New Category': [
    'MY_NEW_GUIDE'
  ]
};

// Update emoji map (optional):
function getCategoryEmoji(categoryName) {
  const emojiMap = {
    // ... existing emojis ...
    'My New Category': '📖'
  };
  return emojiMap[categoryName] || '📄';
}
```

**Option C - Skip categorization:**
```
Just sync - goes to "Other" category automatically
```

**4. Sync to Notion:**
```bash
npm run docs:sync
```

**5. Commit to Git:**
```bash
git add docs/MY_NEW_GUIDE.md
git add scripts/notion/syncMarkdownDocs.js  # If you categorized
git commit -m "docs: add new guide"
git push
```

---

## Categories Reference

### Current Categories

| Category | Emoji | Current Docs | Purpose |
|----------|-------|--------------|---------|
| Sprint System | 🏃 | 4 | Sprint planning, tracking, rollback |
| Architecture & Design | 🏗️ | 4 | System architecture, design docs |
| SIVA System | 🧠 | 4 | SIVA tools, implementation, integration |
| Tools & Automation | 🔧 | 3 | Automation scripts, tooling guides |
| Features & Integrations | 🔌 | 5 | Feature docs, integration guides |
| UI/UX | 🎨 | 2 | UI/UX transformation, design |
| Troubleshooting | 🔍 | 1 | Error resolution, debugging |
| Deployment & Operations | 🚀 | 0 | (Ready for deployment docs) |
| API Documentation | 📡 | 0 | (Ready for API docs) |

### Adding New Categories

Edit `scripts/notion/syncMarkdownDocs.js`:

```javascript
const DOC_CATEGORIES = {
  // ... existing ...
  'Your New Category': [
    'DOC_1',
    'DOC_2'
  ]
};

// Add emoji (optional):
function getCategoryEmoji(categoryName) {
  const emojiMap = {
    // ... existing ...
    'Your New Category': '🎯'  // Your emoji
  };
  return emojiMap[categoryName] || '📄';
}
```

---

## Best Practices

### ✅ Do

**1. Sync after documentation changes:**
```bash
vim docs/GUIDE.md
npm run docs:sync  # ← Always sync
git commit
```

**2. Categorize important docs:**
```javascript
// Add to appropriate category
'Architecture & Design': [
  'MY_IMPORTANT_DOC'
]
```

**3. Use sync-all for major updates:**
```bash
# After sprint completion
npm run notion:sync-all
```

**4. Keep Git as source of truth:**
```
Git (.md files) → Notion (synced)
Edit in Git, sync to Notion
```

### ❌ Don't

**1. Edit Notion pages manually:**
```
❌ Editing Notion docs directly
✅ Edit .md files in Git, then sync
```

**2. Skip syncing:**
```
❌ Commit .md files without syncing
✅ Always sync after doc changes
```

**3. Forget to categorize:**
```
❌ Leaving docs in "Other" forever
✅ Categorize important documentation
```

---

## Troubleshooting

### Doc not appearing in Notion

**Problem:** Created .md file but not in Notion

**Solution:**
```bash
# Did you sync?
npm run docs:sync

# Check for errors in output
```

### Doc in wrong category

**Problem:** Doc appears in "Other" instead of correct category

**Solution:**
```bash
# 1. Add to category in syncMarkdownDocs.js
vim scripts/notion/syncMarkdownDocs.js

# 2. Re-sync
npm run docs:sync
```

### Sync taking too long

**Problem:** `npm run docs:sync` is slow

**Why:** 23 files × conversion time = 2-3 minutes
**This is normal** - Notion API has rate limits

**Workaround:** Be patient, or split into multiple syncs (future enhancement)

---

## Integration with Sprint System

### End-of-Sprint Workflow

```bash
# 1. Complete sprint work
git commit -m "feat: Sprint 17 complete"

# 2. Create sprint handoff doc
echo "# Sprint 17 Handoff" > docs/SPRINT_17_HANDOFF.md
vim docs/SPRINT_17_HANDOFF.md

# 3. Add to Sprint System category
vim scripts/notion/syncMarkdownDocs.js
# Add 'SPRINT_17_HANDOFF' to 'Sprint System' category

# 4. Sync everything to Notion
npm run notion:sync-all

# 5. Tag sprint in Git
bash scripts/tagSprint.sh 17 "Phase 1 Complete"
git push origin sprint-17

# 6. Update sprint status in Notion
# (Manually: Sprint 17 → Status: Closed)
```

---

## Automation Ideas

### Git Hook (Future)

Auto-sync on commit:

```bash
# .git/hooks/post-commit
#!/bin/bash

if git diff --name-only HEAD HEAD~1 | grep -q "^docs/"; then
  echo "📚 Docs changed, syncing to Notion..."
  npm run docs:sync
fi
```

### CI/CD Integration (Future)

```yaml
# .github/workflows/sync-notion.yml
name: Sync to Notion

on:
  push:
    paths:
      - 'docs/**'

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install
      - run: npm run docs:sync
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
```

---

## Summary

### Quick Decision Tree

```
Created/updated .md files?
└─ YES → npm run docs:sync

Completed SIVA tool?
└─ YES → npm run notion:sync-siva-docs

Major sprint work (both)?
└─ YES → npm run notion:sync-all

Not sure?
└─ npm run notion:sync-all (syncs everything)
```

### Command Comparison

| Command | SIVA Progress | Documentation | Speed | Use When |
|---------|---------------|---------------|-------|----------|
| `notion:sync-all` | ✅ | ✅ | Slow | Major updates |
| `docs:sync` | ❌ | ✅ | Medium | Doc changes only |
| `notion:sync-siva-docs` | ✅ | ❌ | Fast | SIVA development |
| `notion:sync-siva` | ✅ | ❌ | Fast | Quick check |

---

**Remember:**
- ✅ Git is source of truth
- ✅ Notion is for collaboration
- ✅ Always sync after changes
- ✅ Categorize important docs
