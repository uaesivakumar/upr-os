# Sprint-Based Git Rollback Guide

**Universal Connector:** Sprint # links Notion (functional) and Git (technical)

---

## Quick Reference

| Sprint | Git Tag | Tools | Status | Rollback Command |
|--------|---------|-------|--------|------------------|
| Sprint 15 | `sprint-15` | Tools 1-4 | Closed | `git checkout sprint-15` |
| Sprint 16 | `sprint-16` | Tools 13-15 | Closed | `git checkout sprint-16` |
| Sprint 17 | `sprint-17` | TBD | Planned | - |

---

## Sprint Tagging Workflow

### Tag Current Sprint

```bash
# After sprint completion
bash scripts/tagSprint.sh 16 "SIVA Phase 2 - 100% MCP"

# Pushes tag to remote
git push origin sprint-16
```

### View Sprint Tags

```bash
# List all sprint tags
git tag -l "sprint-*"

# Output:
# sprint-15
# sprint-16
# sprint-17

# View sprint details
git show sprint-16
```

---

## Rollback Scenarios

### Scenario 1: "UI was perfect in Sprint 7, broken in Sprint 31"

**Goal:** Recover Sprint 7 UI design

```bash
# Step 1: Find Sprint 7 tag
git tag -l "sprint-7"
# Output: sprint-7 ✅

# Step 2: View what Sprint 7 delivered
git show sprint-7
# Shows: Sprint 7 notes, commits, tools delivered

# Step 3: Checkout Sprint 7 code
git checkout sprint-7

# Step 4: Test the UI (verify it works)
npm run dev

# Step 5: Create recovery branch
git checkout -b recover-sprint7-ui

# Step 6: Restore specific UI files to current main
git checkout main
git checkout sprint-7 -- src/components/UIComponent.jsx
git checkout sprint-7 -- src/styles/ui-theme.css

# Step 7: Commit recovery
git add src/components/UIComponent.jsx src/styles/ui-theme.css
git commit -m "fix: rollback UI to Sprint 7 design

Sprint 31 UI regression fixed by restoring Sprint 7 components.

Recovered from: sprint-7
Files restored:
  - src/components/UIComponent.jsx
  - src/styles/ui-theme.css

Reason: Sprint 31 broke responsive layout
Solution: Restore working Sprint 7 design
"

# Step 8: Push and deploy
git push origin recover-sprint7-ui
```

---

### Scenario 2: "RADAR extraction was better in Sprint 16"

**Goal:** Recover Sprint 16 extraction logic

```bash
# Checkout Sprint 16
git checkout sprint-16

# Find extraction files
git show sprint-16 --name-only | grep -i extraction
# Output: server/siva-tools/HiringSignalExtractionToolStandalone.js

# Create recovery branch
git checkout main
git checkout -b recover-sprint16-extraction

# Cherry-pick Sprint 16 extraction commit
git log sprint-16 --oneline | grep -i extraction
# Find commit: e77566b

git cherry-pick e77566b

# Or restore specific file
git checkout sprint-16 -- server/siva-tools/HiringSignalExtractionToolStandalone.js

# Commit and push
git commit -m "fix: rollback extraction to Sprint 16 logic"
git push
```

---

### Scenario 3: "Full Sprint Rollback"

**Goal:** Completely revert to Sprint 15 state (emergency)

```bash
# WARNING: This undoes all work after Sprint 15!

# Step 1: Backup current work
git checkout main
git branch backup-before-rollback

# Step 2: Reset to Sprint 15
git reset --hard sprint-15

# Step 3: Force push (DANGEROUS - team coordination required!)
git push origin main --force

# Better approach: Create rollback branch
git checkout -b rollback-to-sprint15 sprint-15
git push origin rollback-to-sprint15

# Deploy rollback branch instead of force-pushing main
```

---

## Sprint Tag Reference (Notion ↔ Git)

### Sprint 16 Example

**Notion (Functional):**
```
Sprint 16
├─ Goal: SIVA Phase 2 - 100% MCP
├─ Tools: 13, 14, 15
├─ Total Hours: 10h
├─ Business Value: Centralized intelligence
└─ Status: Closed ✅
```

**Git (Technical):**
```
Tag: sprint-16
├─ Commit: 84be15a
├─ Files: HiringSignalExtractionTool, SourceReliabilityTool,
│         SignalDeduplicationTool, radarAgent.js
├─ Changes: +800 lines, -140 lines
└─ Tests: 12/12 passing
```

**Rollback Command:**
```bash
git checkout sprint-16
```

---

## Finding Specific Sprint Work

### "Which sprint added Tool 13?"

```bash
# Search git tags for Tool 13
git tag -l "sprint-*" | while read tag; do
  echo "=== $tag ==="
  git show $tag | grep -i "Tool 13\|HiringSignal"
done

# Or check Notion SIVA Tools database
# Filter: Tool Name = "Tool 13"
# Result: Sprint 16
```

### "When did we implement fuzzy matching?"

```bash
# Search commit messages
git log --all --oneline | grep -i "fuzzy\|deduplication"

# Find which sprint tag contains it
git tag --contains e77566b

# Or check Notion SIVA Tools database
# Search: "fuzzy matching"
# Result: Tool 15, Sprint 16
```

---

## Tagging Best Practices

### 1. Tag at Sprint Closure

```bash
# When closing Sprint 16
bash scripts/tagSprint.sh 16 "SIVA Phase 2 - 100% MCP"
git push origin sprint-16
```

### 2. Tag Message Template

```
Sprint 16: SIVA Phase 2 - 100% MCP Architecture

Tools Delivered:
- Tool 13: HiringSignalExtraction
- Tool 14: SourceReliability
- Tool 15: SignalDeduplication

Business Value: 100% centralized intelligence (MCP)
Total Hours: 10h
Status: Closed ✅

Final Commit: 84be15a

---
Rollback: git checkout sprint-16
Details: git show sprint-16
```

### 3. Never Delete Sprint Tags

```bash
# ❌ DON'T DO THIS
git tag -d sprint-16
git push origin :refs/tags/sprint-16

# Sprint tags are permanent references!
```

---

## Emergency Rollback Checklist

**Before rolling back:**

- [ ] Identify which sprint had working code
- [ ] Check sprint tag exists: `git tag -l "sprint-X"`
- [ ] Verify sprint deliverables in Notion
- [ ] Create backup branch: `git branch backup-$(date +%Y%m%d)`
- [ ] Coordinate with team (if shared repo)
- [ ] Test rollback in local environment first

**Rollback:**

- [ ] Checkout sprint tag: `git checkout sprint-X`
- [ ] Verify code works: `npm test && npm run dev`
- [ ] Create recovery branch: `git checkout -b recover-sprintX-feature`
- [ ] Cherry-pick or restore specific files
- [ ] Commit with clear message
- [ ] Push and create PR

**After rollback:**

- [ ] Update Notion with rollback notes
- [ ] Document what broke and why
- [ ] Add tests to prevent regression
- [ ] Tag new sprint with fix

---

## Sprint Timeline

| Sprint | Date | Tools | Git Tag | Notion |
|--------|------|-------|---------|--------|
| 15 | Oct 28-31 | 1-4 | sprint-15 | [View](https://notion.so/2a566151dd168115a6c2f71c27fbdc6a) |
| 16 | Nov 1-8 | 13-15 | sprint-16 | [View](https://notion.so/2a566151dd168115a6c2f71c27fbdc6a) |
| 17 | TBD | 5-7 | - | Planned |

---

## Notion + Git Integration

**Sprint as Universal Connector:**

```
NOTION (Functional)          GIT (Technical)
================             ================
Sprint 16                    Tag: sprint-16
├─ Tools 13-15          ↔   ├─ Commit: 84be15a
├─ 10 hours             ↔   ├─ +800 -140 lines
├─ 100% MCP value       ↔   ├─ 6 commits
└─ Closed ✅            ↔   └─ Tests: 12/12 ✅

REFERENCE POINT: Sprint # = 16
```

**Query by Sprint:**
- **Notion:** Filter SIVA Tools by Sprint 16 → See business value
- **Git:** `git checkout sprint-16` → See technical implementation

---

## Future Sprint Planning

### Sprint 17 (Planned)

**Notion:**
- Tools 5-7 (ContactQuality, QScore, DuplicateCheck)
- Goal: Complete Phase 1 (50% → 100%)
- Estimated: 8 hours

**Git:**
- Create `sprint-17` tag when closed
- Link to Notion Sprint 17 entry

**Rollback Ready:**
```bash
git tag -a sprint-17 -m "Sprint 17: Phase 1 Complete"
git push origin sprint-17
```

---

## Summary

✅ **Sprint # = Universal Reference**
- Notion: Functional tracking (what, why, value)
- Git: Technical implementation (how, code, commits)
- Sprint tag: Bridge between both

✅ **Rollback Enabled**
- Any sprint: `git checkout sprint-X`
- Specific features: Cherry-pick from sprint tag
- Emergency: Full sprint revert possible

✅ **Time Travel**
- "What worked in Sprint 7?" → `git checkout sprint-7`
- "What changed in Sprint 31?" → `git diff sprint-7..sprint-31`
- System can always locate code by sprint #

---

**Tagging Command:**
```bash
bash scripts/tagSprint.sh <number> <summary>
```

**Rollback Command:**
```bash
git checkout sprint-<number>
```

**Sprint Reference:**
- Notion SPRINTS: https://notion.so/2a566151dd168115a6c2f71c27fbdc6a
- Git Tags: `git tag -l "sprint-*"`
