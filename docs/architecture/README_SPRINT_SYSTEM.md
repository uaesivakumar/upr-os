# Sprint System: Complete Automation Guide

**Notion (Functional) ↔ Git (Technical)**
**Universal Connector: Sprint #**

---

## Overview

This system provides complete automation for tracking ALL development work:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SPRINT # (Universal Reference)                  │
│                                                                       │
│  ┌─────────────────────────────┐   ┌─────────────────────────────┐ │
│  │   NOTION (Functional)        │   │   GIT (Technical)           │ │
│  │   ─────────────────          │   │   ─────────────            │ │
│  │   • SPRINTS (master)         │   │   • Commits                │ │
│  │   • SIVA Tools               │   │   • Branches               │ │
│  │   • Work Items               │   │   • Tags (sprint-X)        │ │
│  └─────────────────────────────┘   └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Initial Setup (One-Time)

```bash
# Create databases in Notion
npm run sprint:create-dbs

# Output:
# ✅ SPRINTS Database created
# ✅ SIVA Tools Database created
# ✅ WORK ITEMS Database created
# ✅ IDs saved to .env

# Backfill historical data (Sprint 15-16)
npm run sprint:populate

# Output:
# ✅ Sprint 15 created (4 tools)
# ✅ Sprint 16 created (3 tools)
```

### 2. Create New Sprint

**In Notion UI:**
1. Open SPRINTS database
2. Create new page: "Sprint 17"
3. Fill properties:
   - Sprint Number: 17
   - Status: Active
   - Goal: "Phase 1 Complete + UI Improvements"
   - Start Date: 2024-11-09

### 3. Add Work to Sprint

**SIVA Tools (Domain-Specific):**
```bash
npm run sprint:create-tool

# Interactive prompts:
# Tool Number: 5
# Tool Name: ContactQualityTool
# Sprint Number: 17
# Primitive: SCORE_CONTACT_QUALITY
# Type: STRICT
# ... etc.

# Result: Tool 5 created in Notion, linked to Sprint 17
```

**Work Items (Universal - Features, Bugs, etc.):**
```bash
npm run sprint:create-work

# Interactive prompts:
# Type: Feature
# Title: Add Dark Mode Toggle
# Sprint: 17
# Category: Frontend
# Priority: Medium
# ... etc.

# Result: Work item created in Notion, linked to Sprint 17
```

### 4. Close Sprint

```bash
# Update all work items to "Done" in Notion first

# Tag sprint in Git
bash scripts/tagSprint.sh 17 "Phase 1 Complete + UI Improvements"

# Output:
# ✅ Created tag: sprint-17
# 📍 Commit: abc123d

# Push tag to remote
git push origin sprint-17

# Update Sprint 17 in Notion:
# Status: Closed ✅
```

---

## Complete Workflow Example

### Scenario: Sprint 17 - Phase 1 Complete + UI Improvements

**Goal:** Complete SIVA Phase 1 (Tools 5-7) + Add dark mode feature

#### Step 1: Plan Sprint in Notion

```bash
# Create Sprint 17 in Notion UI
# Sprint Number: 17
# Goal: "Phase 1 Complete + UI Improvements"
# Status: Active
# Start Date: 2024-11-09
# Estimated Total: 14h
```

#### Step 2: Create SIVA Tools

```bash
# Tool 5: ContactQualityTool
npm run sprint:create-tool
> Tool Number: 5
> Tool Name: ContactQualityTool
> Sprint: 17
> Primitive: SCORE_CONTACT_QUALITY (option 5)
> Type: STRICT (option 1)
> Purpose: Score contact quality based on profile completeness...
> Business Value: - Filters low-quality contacts\n- Reduces wasted effort
> ... (continue with prompts)
> ✅ Tool 5 created

# Tool 6: QScoreTool
npm run sprint:create-tool
> Tool Number: 6
> ... (similar process)
> ✅ Tool 6 created

# Tool 7: DuplicateCheckTool
npm run sprint:create-tool
> Tool Number: 7
> ... (similar process)
> ✅ Tool 7 created
```

#### Step 3: Create Work Items

```bash
# Feature: Add Dark Mode Toggle
npm run sprint:create-work
> Type: Feature (option 1)
> Title: Add Dark Mode Toggle
> Sprint: 17
> Category: Frontend (option 1)
> Description: Add dark mode toggle to settings page with persistent storage
> Acceptance Criteria: User can toggle, preference saved, all pages respond
> Priority: Medium (option 3)
> Estimated Hours: 8
> Status: To-Do (option 1)
> Tags: UI/UX, Settings
> ✅ Work item created

# Bug Fix: Login Redirect Broken
npm run sprint:create-work
> Type: Bug Fix (option 2)
> Title: Login Redirect Broken
> Sprint: 17
> Category: Backend (option 2)
> Priority: Critical (option 1)
> Estimated Hours: 2
> ✅ Work item created

# Enhancement: Improve Error Messages
npm run sprint:create-work
> Type: Enhancement (option 3)
> Title: Improve Error Messages
> Sprint: 17
> Estimated Hours: 4
> ✅ Work item created
```

**Notion now shows:**
- Sprint 17
  - Tools Count: 3 (via rollup)
  - Work Items Count: 3 (via rollup)
  - Total Hours: 14h (6h tools + 8h work items)

#### Step 4: Do the Work (Git)

```bash
# Create feature branches
git checkout -b feature/tool-5-contact-quality
git checkout -b feature/dark-mode-toggle
git checkout -b fix/login-redirect
git checkout -b enhance/error-messages

# Work on each branch
# Commit frequently with descriptive messages

# Example commit for Tool 5:
git add server/siva-tools/ContactQualityToolStandalone.js
git commit -m "feat: implement Tool 5 ContactQualityTool (Sprint 17)

SIVA Phase 1 Primitive 5: SCORE_CONTACT_QUALITY

- Quality scoring algorithm (0-100)
- Profile completeness factor
- Engagement signal detection
- Data freshness scoring
- 6/6 tests passing

Business Value:
- Filters low-quality contacts before outreach
- Reduces wasted sales effort by 30%
- Prioritizes high-engagement contacts

Sprint: 17
Tool: 5
"

# Merge branches as work completes
git checkout main
git merge fix/login-redirect  # Bug fixed quickly
git merge feature/dark-mode-toggle  # Feature complete
git merge feature/tool-5-contact-quality  # Tool complete
# ... etc.
```

#### Step 5: Update Notion as You Progress

**Mark items as In Progress:**
- Go to Tool 5 in SIVA Tools database
- Change Status: To-Do → In Progress
- Set Started At: 2024-11-09

**Mark items as Done:**
- Change Status: In Progress → Done
- Set Completed At: 2024-11-09
- Set Actual Hours: 2.5h (if different from estimate)

**Repeat for all work items**

#### Step 6: Close Sprint

```bash
# Verify all work is Done in Notion
# All 3 tools: Done ✅
# All 3 work items: Done ✅

# Final commit (if needed)
git add .
git commit -m "chore: Sprint 17 complete"
git push origin main

# Tag sprint
bash scripts/tagSprint.sh 17 "Phase 1 Complete + UI Improvements"

# Output:
# ✅ Created tag: sprint-17
# 📍 Commit: abc123d
#
# 📤 Push tag to remote:
#    git push origin sprint-17

# Push tag
git push origin sprint-17
```

**Update Sprint 17 in Notion:**
- Status: Active → Closed ✅
- Git Tag: "sprint-17 (tagged: abc123d)"
- Notes: "Phase 1 100% complete. Dark mode shipped."

**Final Metrics (Auto-calculated via rollups):**
- Total Hours: 12h actual (14h estimated)
- Tools Count: 3
- Work Items Count: 3
- Completion: 100%

---

## Database Structure

### SPRINTS (Master Database)

**Purpose:** Master sprint tracking

**Key Properties:**
- **Sprint** (title): "Sprint 17"
- **Sprint Number** (number): 17 ← **UNIVERSAL REFERENCE**
- **Status** (select): Closed/Active/Planned
- **Goal** (text): "Phase 1 Complete + UI Improvements"
- **Business Value** (text): What was achieved
- **Total Hours** (number): Rollup from Tools + Work Items
- **Tools Count** (number): Rollup from SIVA Tools
- **Git Tag** (text): "sprint-17"

**Relations:**
- → SIVA Tools (one-to-many)
- → Work Items (one-to-many)

---

### SIVA TOOLS (Domain-Specific Database)

**Purpose:** Granular SIVA primitive tracking

**Key Properties:**
- **Tool Name** (title): "Tool 5: ContactQualityTool"
- **Tool Number** (number): 5
- **Sprint** (relation): → Sprint 17
- **Phase** (text): "Phase 1: Persona Extraction"
- **Primitive** (select): SCORE_CONTACT_QUALITY
- **Type** (select): STRICT/DELEGATED
- **Purpose** (text): What it does
- **Business Value** (text): Why it matters
- **Deliverables** (text): What was built
- **Status** (select): Done/In Progress/To-Do
- **Actual Time (Hours)** (number): 2.5
- **Test Coverage** (select): All Tests Pass

**When to Use:**
- SIVA tool development (Tools 1-18)
- Cognitive primitives
- Domain-specific functionality

---

### WORK ITEMS (Universal Database)

**Purpose:** Track ALL other work (features, bugs, enhancements, etc.)

**Key Properties:**
- **Title** (title): "Add Dark Mode Toggle"
- **Type** (select): Feature/Bug Fix/Enhancement/Data Connection/Refactor/Documentation/UI/UX/Infrastructure
- **Sprint** (relation): → Sprint 17
- **Category** (select): Frontend/Backend/Database/API/Integration/DevOps/Testing/Security/Performance/Analytics
- **Priority** (select): Critical/High/Medium/Low
- **Status** (select): Done/In Progress/To-Do
- **Description** (text): What needs to be done
- **Acceptance Criteria** (text): How to verify it's done
- **Estimated Hours** (number): 8
- **Actual Hours** (number): 6.5
- **Tags** (multi-select): SIVA, RADAR, Critical, UI/UX

**When to Use:**
- Features (UI/UX, new functionality)
- Bug fixes
- Enhancements
- Data connections
- Refactoring
- Documentation
- Infrastructure work
- Anything NOT a SIVA tool

---

## Work Type Decision Tree

```
Is this work a SIVA cognitive primitive (Tools 1-18)?
│
├─ YES → Use `npm run sprint:create-tool`
│         (SIVA TOOLS database)
│         Examples:
│         - Tool 5: ContactQualityTool
│         - Tool 13: HiringSignalExtraction
│
└─ NO → Use `npm run sprint:create-work`
        (WORK ITEMS database)
        │
        ├─ New functionality? → Type: Feature
        │   Examples: Add dark mode, Build dashboard
        │
        ├─ Fixing broken code? → Type: Bug Fix
        │   Examples: Fix login redirect, Resolve memory leak
        │
        ├─ Improving existing feature? → Type: Enhancement
        │   Examples: Improve error messages, Add loading spinners
        │
        ├─ Connecting to external system? → Type: Data Connection
        │   Examples: Connect to Salesforce, Add Redis cache
        │
        ├─ Code cleanup? → Type: Refactor
        │   Examples: Extract utilities, Rename variables
        │
        ├─ Writing docs? → Type: Documentation
        │   Examples: API docs, README updates
        │
        ├─ UI/UX work? → Type: UI/UX
        │   Examples: Redesign navigation, Improve accessibility
        │
        └─ DevOps/infrastructure? → Type: Infrastructure
            Examples: CI/CD setup, Monitoring, Error tracking
```

---

## Rollback Workflow

### Scenario: "Dark mode was perfect in Sprint 17, broken in Sprint 25"

#### Step 1: Find Sprint in Notion

```
1. Open SPRINTS database
2. Filter: Sprint Number = 17
3. Find work item: "Add Dark Mode Toggle"
4. Note Git Tag: "sprint-17"
```

#### Step 2: Locate Code in Git

```bash
# Checkout sprint-17 tag
git checkout sprint-17

# Find dark mode files
git show sprint-17 --name-only | grep -i "dark\|theme"

# Output:
# src/contexts/ThemeContext.jsx
# src/components/DarkModeToggle.jsx
# src/styles/dark-theme.css
```

#### Step 3: Recover Code

```bash
# Create recovery branch
git checkout main
git checkout -b recover-sprint17-dark-mode

# Restore files from Sprint 17
git checkout sprint-17 -- src/contexts/ThemeContext.jsx
git checkout sprint-17 -- src/components/DarkModeToggle.jsx
git checkout sprint-17 -- src/styles/dark-theme.css

# Commit recovery
git add .
git commit -m "fix: rollback to Sprint 17 dark mode implementation

Sprint 25 introduced regression in dark mode.
Restored working Sprint 17 implementation.

Recovered from: sprint-17
Work Item: Add Dark Mode Toggle (Sprint 17)
"

# Push
git push origin recover-sprint17-dark-mode
```

#### Step 4: Update Notion

```
Create new work item in Sprint 25:
- Type: Bug Fix
- Title: "Fix Dark Mode Regression"
- Description: "Rolled back to Sprint 17 implementation"
- Tags: Rollback, Dark Mode
- Notes: "Recovered from sprint-17 tag"
```

---

## NPM Scripts Reference

### Database Management

```bash
# Create all sprint databases (one-time setup)
npm run sprint:create-dbs

# Populate Sprint 15-16 historical data
npm run sprint:populate
```

### Work Item Creation

```bash
# Create SIVA tool entry
npm run sprint:create-tool

# Create general work item (feature, bug, etc.)
npm run sprint:create-work
```

### Sprint Operations

```bash
# Tag current sprint in Git
bash scripts/tagSprint.sh <number> <summary>
# Example: bash scripts/tagSprint.sh 17 "Phase 1 Complete"

# Push sprint tag to remote
git push origin sprint-<number>
```

### Notion Sync

```bash
# Sync SIVA progress from code
npm run notion:sync-siva

# Sync SIVA with documentation
npm run notion:sync-siva-docs
```

---

## Best Practices

### 1. Sprint Planning

✅ **Do:**
- Create sprint in Notion FIRST (before work items)
- Define clear Goal and Business Value
- Estimate Total Hours upfront
- Set Start Date when sprint begins

❌ **Don't:**
- Create work items without a sprint
- Skip Business Value (explain WHY)
- Forget to link items to sprint

### 2. Work Item Creation

✅ **Do:**
- Use descriptive titles (verb + object)
  - Good: "Add Dark Mode Toggle"
  - Bad: "Dark Mode"
- Fill in Acceptance Criteria
  - How do we know it's done?
- Provide realistic estimates
- Update Status as work progresses

❌ **Don't:**
- Create vague work items
- Skip Acceptance Criteria
- Leave Status as To-Do when working on it

### 3. Git Commits

✅ **Do:**
- Reference sprint number in commit message
  - "feat: implement Tool 5 (Sprint 17)"
- Include business value context
- Link to work item/tool
- Use conventional commit format

❌ **Don't:**
- Make commits without sprint context
- Skip descriptive messages
- Forget to mention tool/work item

### 4. Sprint Closure

✅ **Do:**
- Update all items to Done in Notion
- Fill in Actual Hours for all items
- Set Completed At dates
- Tag sprint in Git AFTER all work merged
- Push tag to remote
- Change sprint Status to Closed in Notion

❌ **Don't:**
- Tag sprint before work is complete
- Skip actual time tracking
- Forget to push tags to remote

---

## Troubleshooting

### Error: "Sprint X not found in Notion!"

**Cause:** Sprint doesn't exist in SPRINTS database

**Fix:**
1. Open Notion SPRINTS database
2. Create new sprint entry:
   - Sprint: "Sprint 17"
   - Sprint Number: 17
   - Status: Active
3. Re-run creation command

### Error: "Database ID not found"

**Cause:** .env missing database IDs

**Fix:**
```bash
# Re-run database creation
npm run sprint:create-dbs

# This will update .env with correct IDs
```

### Rollup not updating in SPRINTS

**Cause:** Relation property not set correctly

**Fix:**
1. Check work item has Sprint relation set
2. Verify relation points to correct sprint
3. Refresh Notion page (Cmd+R)

---

## Migration from Old System

### If you have existing WORK_ITEMS database:

```bash
# No action needed! The new system will use existing database.
# Just run the update script to add missing properties:

# (Update script would go here if needed)
```

### If you're starting fresh:

```bash
# Run full setup
npm run sprint:create-dbs
npm run sprint:populate

# Start using sprint:create-tool and sprint:create-work
```

---

## Summary

✅ **Complete Hierarchy**
- SPRINTS (master) → SIVA Tools + Work Items
- Sprint # connects Notion ↔ Git
- All work captured in Notion (functional)
- All code captured in Git (technical)

✅ **Automated Creation**
- `npm run sprint:create-tool` for SIVA tools
- `npm run sprint:create-work` for everything else
- Interactive prompts guide you
- Smart defaults based on work type

✅ **Rollback Enabled**
- Sprint tags in Git (sprint-17, sprint-18...)
- Easy code recovery: `git checkout sprint-17`
- Full audit trail in both systems

✅ **Universal Tracking**
- Features, Bugs, Enhancements
- Data Connections, Refactoring
- Documentation, Infrastructure
- SIVA Tools (domain-specific)

---

## Quick Command Reference

```bash
# Setup (one-time)
npm run sprint:create-dbs        # Create databases
npm run sprint:populate          # Backfill Sprint 15-16

# Create work
npm run sprint:create-tool       # SIVA tools
npm run sprint:create-work       # Features, bugs, etc.

# Close sprint
bash scripts/tagSprint.sh 17 "Summary"  # Tag in Git
git push origin sprint-17               # Push tag

# Sync
npm run notion:sync-siva-docs    # Sync progress to Notion
```

---

**Documentation:**
- [Complete Hierarchy](./COMPLETE_HIERARCHY_NOTION_GIT.md)
- [SIVA Tool Creation Guide](./SIVA_TOOL_CREATION_GUIDE.md)
- [Sprint Git Rollback Guide](./SPRINT_GIT_ROLLBACK_GUIDE.md)

**Support:**
- All scripts in `scripts/notion/`
- All documentation in `docs/`
- Database IDs in `.env`
