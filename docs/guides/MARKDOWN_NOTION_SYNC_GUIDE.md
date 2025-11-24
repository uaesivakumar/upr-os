# Markdown → Notion Auto-Sync Guide

**Automatic synchronization of docs/ markdown files to Notion**

---

## Overview

All markdown files in `docs/` are automatically uploaded to Notion under a "Documentation" parent page. This ensures your technical documentation is accessible in both Git (version-controlled) and Notion (collaborative, searchable).

```
Git (docs/)          Notion (Documentation)
│                    │
├─ README.md    →   ├─ README
├─ GUIDE.md     →   ├─ GUIDE
└─ API.md       →   └─ API
```

---

## Quick Start

### Sync All Markdown Files

```bash
npm run docs:sync
```

**What happens:**
1. Creates "Documentation" parent page in Notion (if not exists)
2. Scans `docs/` directory for `.md` files
3. Converts each file to Notion blocks
4. Creates/updates pages under Documentation
5. Preserves Notion URLs for existing pages

**Output:**
```
📚 Markdown Documentation Sync

📁 Finding/Creating Documentation parent page...
✅ Found existing Documentation page: 2a566151...

📂 Scanning docs/ directory...

Found 22 markdown files:
   1. README_SPRINT_SYSTEM.md
   2. COMPLETE_HIERARCHY_NOTION_GIT.md
   ... (all .md files)

📄 Syncing: README_SPRINT_SYSTEM.md
   🔨 Converting markdown to Notion blocks...
   ✅ Converted to 245 blocks
   ♻️  Page exists, updating: 2a566151...
   ✅ Page content updated

... (for each file)

✅ Markdown Documentation Sync Complete!

📊 Summary:
   Files synced: 22
   Pages created/updated: 22

🔗 View in Notion:
   Documentation: https://notion.so/2a566151...
```

---

## Markdown Support

### Supported Syntax

✅ **Headings**
```markdown
# H1
## H2
### H3
```

✅ **Code Blocks**
````markdown
```javascript
function example() {
  return "Hello";
}
```
````

Supported languages: bash, javascript, typescript, python, json, yaml, html, css, sql, shell, and [60+ more](https://developers.notion.com/reference/block#code)

✅ **Bullet Lists**
```markdown
- Item 1
- Item 2
  - Sub-item (nested not supported, becomes separate list)
```

✅ **Numbered Lists**
```markdown
1. First
2. Second
3. Third
```

✅ **Dividers**
```markdown
---
```

✅ **Paragraphs**
```markdown
Regular text paragraphs.

With empty lines between.
```

### Limitations

⚠️ **Not Supported:**
- Inline formatting (bold, italic, code) - rendered as plain text
- Tables - converted to paragraphs
- Images - markdown image syntax not converted
- Links - rendered as plain text URLs
- Nested lists - flattened to single level
- Block quotes (>) - converted to paragraphs

**Why:** Notion's block API requires specific formatting. Complex inline formatting would require AST parsing. Current implementation prioritizes speed and reliability for documentation.

---

## Update Workflow

### When You Create New .md Files

```bash
# 1. Create your markdown file
echo "# My New Guide" > docs/MY_NEW_GUIDE.md

# 2. Edit the file
vim docs/MY_NEW_GUIDE.md

# 3. Sync to Notion
npm run docs:sync

# Output:
# ✅ Page created: MY_NEW_GUIDE
```

### When You Update Existing .md Files

```bash
# 1. Edit the file
vim docs/README_SPRINT_SYSTEM.md

# 2. Sync to Notion
npm run docs:sync

# Output:
# ♻️  Page exists, updating: 2a566151...
# ✅ Page content updated
```

**Note:** Updates REPLACE all content in the Notion page. Any manual edits in Notion will be lost.

---

## Advanced Usage

### Automatic Sync After Creating Docs

Add to your workflow:

```bash
# After creating markdown docs
git add docs/
git commit -m "docs: add new guide"

# Sync to Notion before pushing
npm run docs:sync

# Then push
git push origin main
```

### Integration with Sprint System

When creating sprint documentation:

```bash
# Create sprint handoff doc
echo "# Sprint 17 Handoff" > docs/SPRINT_17_HANDOFF.md

# Add content
cat >> docs/SPRINT_17_HANDOFF.md <<EOF
## Goals
- Complete Phase 1
- Add dark mode

## Achievements
...
EOF

# Sync to Notion
npm run docs:sync

# Commit everything
git add docs/
git commit -m "docs: Sprint 17 handoff"
git push
```

---

## Notion Page Structure

### Documentation Parent Page

**Location:** Under UPR Roadmap parent page

**Properties:**
- Title: "Documentation"
- Content: Auto-sync information, last sync timestamp

**Children:**
All .md files from docs/ as child pages

### Individual Doc Pages

**Title:** Filename without .md extension
- `README_SPRINT_SYSTEM.md` → "README_SPRINT_SYSTEM"

**Content:** Converted markdown blocks

**URL:** Stable across syncs
- First sync: Creates new page with unique ID
- Subsequent syncs: Updates same page

---

## Language Mapping

The sync script automatically maps common language aliases to Notion-supported languages:

```javascript
'js' → 'javascript'
'ts' → 'typescript'
'py' → 'python'
'rb' → 'ruby'
'sh' → 'shell'
'http' → 'plain text'
'txt' → 'plain text'
```

**Unsupported languages:** Default to `plain text`

---

## Error Handling

### Error: "Documentation page not found"

**Cause:** Parent page wasn't created successfully

**Fix:**
```bash
# The script auto-creates it, just run again
npm run docs:sync
```

### Error: "body failed validation: language should be..."

**Cause:** Markdown file uses unsupported code language

**Fix:** The script now auto-maps to valid languages. If you still see this:
1. Check the markdown file for unusual ``` language tags
2. The script maps unknown languages to `plain text`
3. Update `languageMap` in `syncMarkdownDocs.js` if needed

### Error: "Content too long"

**Cause:** Single block exceeds 2000 character limit

**Fix:** The script auto-splits content:
- Code blocks split into 1900-char chunks
- Paragraphs/lists truncated at 2000 chars

If you see this error, it means a single paragraph is >2000 chars. Break it into multiple paragraphs in the markdown.

---

## Technical Details

### Block Conversion Logic

**Markdown → Notion Block Types:**
- `# Heading` → `heading_1`
- `## Heading` → `heading_2`
- `### Heading` → `heading_3`
- ` ```code``` ` → `code`
- `- List` → `bulleted_list_item`
- `1. List` → `numbered_list_item`
- `---` → `divider`
- Text → `paragraph`

### Chunk Handling

**Notion API Limits:**
- 100 blocks per request
- 2000 chars per rich_text content

**Solution:**
- Initial page creation: First 100 blocks
- Remaining blocks: Appended in batches of 100
- Code blocks >2000 chars: Split into multiple blocks

### Page Registry

**Purpose:** Track created pages to avoid duplicates

**How it works:**
- Script scans Documentation page for existing child pages
- Compares titles with .md filenames
- Updates existing page if found, creates new if not

---

## Best Practices

### 1. Keep Docs in docs/ Directory

✅ **Good:**
```
docs/
├─ README_SPRINT_SYSTEM.md
├─ COMPLETE_HIERARCHY.md
└─ API_GUIDE.md
```

❌ **Bad:**
```
root/
├─ guide.md (won't sync, not in docs/)
└─ notes.md (won't sync)
```

### 2. Use Clear Filenames

✅ **Good:**
- `README_SPRINT_SYSTEM.md` → Clear, descriptive
- `API_AUTHENTICATION_GUIDE.md` → Self-explanatory

❌ **Bad:**
- `doc1.md` → Vague
- `temp.md` → Not permanent documentation

### 3. Sync After Significant Changes

```bash
# Good workflow
git add docs/NEW_GUIDE.md
git commit -m "docs: add deployment guide"
npm run docs:sync  # ← Sync before push
git push
```

### 4. Don't Edit Notion Pages Manually

⚠️ **Warning:** Manual edits in Notion will be overwritten on next sync!

**Workflow:**
1. Edit `.md` file in Git (source of truth)
2. Commit changes
3. Sync to Notion (`npm run docs:sync`)

**Notion is read-only for auto-synced docs.**

### 5. Use Markdown Best Practices

- Clear headings hierarchy (H1 → H2 → H3)
- Short code blocks (<2000 chars)
- Short paragraphs (<2000 chars)
- Descriptive bullet points

---

## Integration with Git

### Git Hook (Optional)

Auto-sync docs on commit:

```bash
# .git/hooks/post-commit
#!/bin/bash

# Check if docs/ changed
if git diff --name-only HEAD HEAD~1 | grep -q "^docs/"; then
  echo "📚 Docs changed, syncing to Notion..."
  npm run docs:sync
fi
```

Make executable:
```bash
chmod +x .git/hooks/post-commit
```

---

## Troubleshooting

### Problem: Sync takes too long

**Cause:** Many files or large files

**Solution:**
- The script processes files sequentially
- 22 files = ~2-3 minutes
- Large files with many blocks = longer

**Workaround:** Sync individual files by modifying script (future enhancement)

### Problem: Page not updating in Notion

**Cause:** Browser cache

**Solution:**
1. Refresh Notion page (Cmd+R / Ctrl+R)
2. Check last sync timestamp in Documentation parent page

### Problem: Formatting looks wrong

**Cause:** Markdown syntax not supported

**Solution:**
- Check "Markdown Support" section above
- Simplify markdown (remove complex formatting)
- Remember: Notion is for reading, Git is source of truth

---

## Future Enhancements

### Planned Features

🔄 **Incremental Sync**
- Only sync changed files (track file hashes)
- Faster sync for large doc sets

🔄 **Selective Sync**
- Sync specific files: `npm run docs:sync -- README.md`
- Exclude files: `.docsyncignore`

🔄 **Better Markdown Support**
- Tables → Notion table blocks
- Images → Upload to Notion
- Inline formatting (bold, italic, code)

🔄 **Bi-directional Sync**
- Edit in Notion → Update .md file
- Conflict resolution

🔄 **Folder Structure**
- `docs/guides/` → "Guides" sub-page in Notion
- Preserve directory hierarchy

---

## Summary

✅ **What It Does**
- Auto-uploads all `.md` files from `docs/` to Notion
- Creates "Documentation" parent page
- Converts markdown to Notion blocks
- Updates existing pages instead of duplicating

✅ **When to Use**
```bash
npm run docs:sync
```

- After creating new .md files
- After updating existing .md files
- Before pushing to Git (optional)
- As part of CI/CD pipeline (future)

✅ **Best Practices**
- Keep all docs in `docs/` directory
- Use clear filenames
- Sync after significant changes
- Don't edit Notion pages manually (Git is source of truth)

✅ **Limitations**
- No inline formatting (bold, italic)
- No tables or images
- Single-level lists only
- Notion pages are read-only (overwritten on sync)

---

**Quick Reference:**
```bash
# Sync all docs to Notion
npm run docs:sync

# View in Notion
# Navigate to: UPR Roadmap → Documentation
```

**Files:**
- Script: `scripts/notion/syncMarkdownDocs.js`
- Docs location: `docs/`
- Notion parent: "Documentation" page under UPR Roadmap
