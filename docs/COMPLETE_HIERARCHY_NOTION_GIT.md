# Complete Hierarchy: Notion (Functional) ↔ Git (Technical)

**Universal Connector: Sprint #**

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SPRINT # (Universal Reference)                  │
│                                                                       │
│  ┌─────────────────────────────┐   ┌─────────────────────────────┐ │
│  │   NOTION (Functional)        │   │   GIT (Technical)           │ │
│  │   ─────────────────          │   │   ─────────────            │ │
│  │   WHAT & WHY                 │   │   HOW                      │ │
│  │   Business Value             │   │   Code Implementation      │ │
│  │   Planning                   │   │   Commits                  │ │
│  │   Tracking                   │   │   Branches                 │ │
│  │   Metrics                    │   │   Tags                     │ │
│  └─────────────────────────────┘   └─────────────────────────────┘ │
│                                                                       │
│               Connected by: Sprint # (e.g., 16, 17, 18)              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Complete Hierarchy

### NOTION (Functional Layer)

```
UPR ROADMAP (Parent Page)
│
├─ SPRINTS (Master Database)
│  │
│  ├─ Sprint 15
│  │  ├─ Sprint Number: 15
│  │  ├─ Status: Closed ✅
│  │  ├─ Goal: "SIVA Phase 1 Foundation - Tools 1-4"
│  │  ├─ Business Value: "Foundation cognitive layer complete..."
│  │  ├─ Total Hours: 6h (rollup from tools + work items)
│  │  ├─ Tools Count: 4 (rollup)
│  │  ├─ Git Tag: "sprint-15"
│  │  └─ Phases Updated: "Phase 1: 0% → 50% (+50%)"
│  │
│  ├─ Sprint 16
│  │  ├─ Sprint Number: 16
│  │  ├─ Status: Closed ✅
│  │  ├─ Goal: "SIVA Phase 2: 100% MCP Architecture"
│  │  ├─ Business Value: "100% MCP achieved, centralized intelligence..."
│  │  ├─ Total Hours: 10h (rollup)
│  │  ├─ Tools Count: 3 (rollup)
│  │  ├─ Git Tag: "sprint-16"
│  │  └─ Phases Updated: "Phase 2: 33% → 58% (+25%)"
│  │
│  └─ Sprint 17 (Planned)
│     ├─ Sprint Number: 17
│     ├─ Status: Active 🔵
│     ├─ Goal: "Phase 1 Complete - Tools 5-7 + UI Improvements"
│     ├─ Total Hours: 14h (estimated)
│     ├─ Tools Count: 3 (planned)
│     └─ Git Tag: "sprint-17" (will be created when closed)
│
├─ SIVA TOOLS & PRIMITIVES (Domain-Specific Database)
│  │
│  │  [Relation: Sprint → SPRINTS]
│  │
│  ├─ Tool 1: Company Quality Scoring
│  │  ├─ Tool Number: 1
│  │  ├─ Sprint: → Sprint 15
│  │  ├─ Phase: "Phase 1: Persona Extraction"
│  │  ├─ Primitive: EVALUATE_COMPANY_QUALITY
│  │  ├─ Type: STRICT
│  │  ├─ Purpose: "Score companies on quality indicators..."
│  │  ├─ Business Value: "Filters 58% of low-quality leads..."
│  │  ├─ Deliverables: "✅ Algorithm, ✅ Tests, ✅ Sentry..."
│  │  ├─ Status: Done ✅
│  │  ├─ Actual Time: 1.5h
│  │  ├─ Test Coverage: All Tests Pass
│  │  └─ Integration: "RADAR Discovery, Tool 8 Composite"
│  │
│  ├─ Tool 2: Contact Tier Classification
│  │  └─ [Similar structure, Sprint 15]
│  │
│  ├─ Tool 3: Timing Score Calculation
│  │  └─ [Similar structure, Sprint 15]
│  │
│  ├─ Tool 4: Edge Cases Detection
│  │  └─ [Similar structure, Sprint 15]
│  │
│  ├─ Tool 13: Hiring Signal Extraction
│  │  ├─ Sprint: → Sprint 16
│  │  ├─ Type: DELEGATED
│  │  └─ [Similar structure]
│  │
│  ├─ Tool 14: Source Reliability Scoring
│  │  └─ [Sprint 16]
│  │
│  ├─ Tool 15: Signal Deduplication
│  │  └─ [Sprint 16]
│  │
│  └─ Tool 5-7 (Planned for Sprint 17)
│
├─ WORK ITEMS (Universal Database)
│  │
│  │  [Relation: Sprint → SPRINTS]
│  │
│  ├─ Feature: Add Dark Mode Toggle
│  │  ├─ Type: Feature
│  │  ├─ Category: Frontend
│  │  ├─ Sprint: → Sprint 17
│  │  ├─ Priority: Medium
│  │  ├─ Status: In Progress
│  │  ├─ Description: "Add dark mode toggle to settings page..."
│  │  ├─ Acceptance Criteria: "User can toggle, preference saved..."
│  │  ├─ Estimated Hours: 8h
│  │  ├─ Tags: UI/UX, Settings
│  │  └─ Assignee: Developer A
│  │
│  ├─ Bug Fix: Login Redirect Broken
│  │  ├─ Type: Bug Fix
│  │  ├─ Category: Backend
│  │  ├─ Sprint: → Sprint 17
│  │  ├─ Priority: Critical
│  │  ├─ Status: Done ✅
│  │  ├─ Actual Hours: 2h
│  │  └─ [Similar structure]
│  │
│  ├─ Enhancement: Improve Error Messages
│  │  └─ [Sprint 17]
│  │
│  ├─ Data Connection: Connect to Salesforce API
│  │  └─ [Sprint 17]
│  │
│  ├─ Refactor: Extract Utility Functions
│  │  └─ [Sprint 16]
│  │
│  └─ UI/UX: Redesign Navigation Menu
│     └─ [Sprint 17]
│
└─ MODULE FEATURES (Legacy Database - being phased out)
   ├─ SIVA Phase 1
   ├─ SIVA Phase 2
   └─ [Synced from code, but granular tracking now in SIVA Tools]
```

---

### GIT (Technical Layer)

```
main (branch)
│
├─ Commits (chronological)
│  │
│  ├─ 94b5535 - feat: implement Tool 1-4 (Sprint 15)
│  │  ├─ Files: server/siva-tools/CompanyQualityTool.js
│  │  │        server/siva-tools/ContactTierTool.js
│  │  │        server/siva-tools/TimingScoreTool.js
│  │  │        server/siva-tools/EdgeCasesTool.js
│  │  ├─ Tests: server/siva-tools/__tests__/*.test.js
│  │  ├─ Changes: +1200 lines, -50 lines
│  │  └─ Sprint: 15
│  │
│  ├─ e77566b - feat: implement Tools 13-15 (Sprint 16)
│  │  ├─ Files: server/siva-tools/HiringSignalExtraction.js
│  │  │        server/siva-tools/SourceReliabilityTool.js
│  │  │        server/siva-tools/SignalDeduplicationTool.js
│  │  ├─ Changes: +800 lines, -140 lines
│  │  └─ Sprint: 16
│  │
│  ├─ 5848ff9 - refactor: RADAR Phase 2 MCP (Sprint 16)
│  │  ├─ Files: server/agents/radarAgent.js
│  │  ├─ Sprint: 16
│  │  └─ Work Item: "Refactor RADAR to 100% MCP"
│  │
│  ├─ 077dd6f - docs: Sprint handoff docs (Sprint 16)
│  │  └─ Work Item: "Documentation: Sprint 16 Handoff"
│  │
│  └─ 84be15a - Complete Sprint 16 tracking (Sprint 16)
│     └─ Sprint 16 final commit
│
├─ Tags (Sprint References)
│  │
│  ├─ sprint-15 → 94b5535
│  │  ├─ Message: "Sprint 15: SIVA Phase 1 Foundation - Tools 1-4"
│  │  ├─ Commits: 4 commits in sprint
│  │  ├─ Files: 8 files changed (+1200 -50)
│  │  ├─ Tests: 12/12 passing
│  │  └─ Notion: Sprint 15 entry
│  │
│  ├─ sprint-16 → 84be15a
│  │  ├─ Message: "Sprint 16: SIVA Phase 2 - 100% MCP"
│  │  ├─ Commits: 6 commits in sprint
│  │  ├─ Files: 12 files changed (+800 -140)
│  │  ├─ Tests: 12/12 passing
│  │  └─ Notion: Sprint 16 entry
│  │
│  └─ sprint-17 → (will be created when sprint closes)
│
└─ Branches (feature development)
   │
   ├─ feature/dark-mode-toggle
   │  ├─ Created for: Work Item "Add Dark Mode Toggle"
   │  ├─ Sprint: 17
   │  └─ Merges to: main
   │
   ├─ fix/login-redirect
   │  ├─ Created for: Work Item "Login Redirect Broken"
   │  ├─ Sprint: 17
   │  └─ Merged to: main (completed)
   │
   └─ feature/tool-5-contact-quality
      ├─ Created for: SIVA Tool 5
      ├─ Sprint: 17
      └─ Status: In Progress
```

---

## Hierarchy Levels

### Level 1: SPRINT (Master)

**Notion:**
```
Sprint 16
├─ Sprint Number: 16 ← UNIVERSAL REFERENCE
├─ Status: Closed ✅
├─ Goal: "SIVA Phase 2: 100% MCP Architecture"
├─ Business Value: "100% centralized intelligence..."
├─ Total Hours: 10h
├─ Tools Count: 3
└─ Git Tag: "sprint-16"
```

**Git:**
```
Tag: sprint-16
├─ Commit: 84be15a
├─ Message: "Sprint 16: SIVA Phase 2 - 100% MCP"
├─ Files: 12 changed (+800 -140)
├─ Tests: 12/12 passing
└─ Notion: Sprint 16 entry
```

**Connection:** Sprint Number 16 = Tag sprint-16

---

### Level 2: SIVA TOOLS (Domain-Specific)

**Notion:**
```
Tool 13: Hiring Signal Extraction
├─ Tool Number: 13
├─ Sprint: → Sprint 16 ← LINKED
├─ Phase: "Phase 2: Cognitive Framework"
├─ Primitive: EXTRACT_HIRING_SIGNALS
├─ Type: DELEGATED
├─ Purpose: "Extract structured hiring signals using GPT-4"
├─ Business Value: "100% MCP achieved, schema-locked output..."
├─ Deliverables: "✅ Extraction tool, ✅ Schema-locked..."
├─ Actual Time: 2.5h
└─ Integration: "RADAR Phase 2 pipeline"
```

**Git:**
```
Commit: e77566b
├─ Message: "feat: implement Tools 13-15 (Sprint 16)"
├─ Files:
│  ├─ server/siva-tools/HiringSignalExtractionToolStandalone.js (+250 lines)
│  ├─ server/siva-tools/schemas/hiringSignalSchemas.js (+80 lines)
│  └─ server/siva-tools/__tests__/HiringSignalExtraction.test.js (+120 lines)
├─ Tests: 6/6 passing
└─ Sprint: 16
```

**Connection:** Tool 13 in Notion → e77566b commit in Git (both Sprint 16)

---

### Level 3: WORK ITEMS (Universal)

**Notion:**
```
Feature: Add Dark Mode Toggle
├─ Type: Feature
├─ Category: Frontend
├─ Sprint: → Sprint 17 ← LINKED
├─ Priority: Medium
├─ Status: In Progress
├─ Description: "Add dark mode toggle to settings page..."
├─ Acceptance Criteria: "User can toggle, preference saved..."
├─ Estimated Hours: 8h
├─ Actual Hours: 5h (so far)
└─ Tags: UI/UX, Settings
```

**Git:**
```
Branch: feature/dark-mode-toggle
├─ Created from: main
├─ Commits:
│  ├─ f3a2c1b - "feat: add dark mode context provider"
│  ├─ a8b9c2d - "feat: create toggle component"
│  └─ d4e5f6g - "style: dark mode color scheme"
├─ Files:
│  ├─ src/contexts/ThemeContext.jsx (+80 lines)
│  ├─ src/components/DarkModeToggle.jsx (+45 lines)
│  └─ src/styles/dark-theme.css (+120 lines)
├─ Sprint: 17
└─ Merges to: main (when done)
```

**Connection:** Work Item "Dark Mode" → feature/dark-mode-toggle branch (both Sprint 17)

---

## Complete Workflow Example: Sprint 17

### Sprint Planning (Notion)

```
1. Create Sprint 17 in SPRINTS database
   ├─ Sprint Number: 17
   ├─ Status: Active
   ├─ Goal: "Phase 1 Complete + UI Improvements"
   ├─ Start Date: 2024-11-09
   └─ Estimated Hours: 14h

2. Create SIVA Tools for Sprint 17
   ├─ Tool 5: ContactQualityTool (2h)
   ├─ Tool 6: QScoreTool (2h)
   └─ Tool 7: DuplicateCheckTool (2h)

3. Create Work Items for Sprint 17
   ├─ Feature: Add Dark Mode Toggle (8h)
   ├─ Bug Fix: Login Redirect Broken (2h)
   └─ Enhancement: Improve Error Messages (4h)

4. Total Estimated: 20h
5. Tools Count: 3
6. Work Items Count: 3
```

### Sprint Execution (Git)

```
1. Create feature branches
   ├─ feature/tool-5-contact-quality
   ├─ feature/dark-mode-toggle
   └─ fix/login-redirect

2. Commit work to branches
   ├─ feat: implement Tool 5 ContactQualityTool
   ├─ feat: add dark mode toggle
   ├─ fix: resolve login redirect issue
   └─ enhance: improve error messages

3. Merge to main as work completes
   ├─ fix/login-redirect → main (merged)
   ├─ feature/tool-5-contact-quality → main (in progress)
   └─ feature/dark-mode-toggle → main (in progress)

4. All merged when sprint completes
```

### Sprint Closure (Both Systems)

**Notion:**
```
1. Update all items to "Done"
2. Fill in Actual Hours
3. Set Completed At dates
4. Change Sprint 17 Status: Active → Closed ✅
5. Verify rollups:
   ├─ Total Hours: 18h (actual)
   ├─ Tools Count: 3
   └─ Work Items Count: 3
```

**Git:**
```
1. Ensure all branches merged to main
2. Latest commit: abc123d
3. Create sprint tag:
   bash scripts/tagSprint.sh 17 "Phase 1 Complete + UI Improvements"
4. Push tag:
   git push origin sprint-17
5. Tag points to: abc123d
```

**Result:** Sprint 17 closed in both systems, connected by #17

---

## Rollback Workflow

### Scenario: "Dark mode was perfect in Sprint 17, broken in Sprint 25"

**Step 1: Find Sprint 17 in Notion**
```
1. Open SPRINTS database
2. Filter: Sprint Number = 17
3. Find work item: "Add Dark Mode Toggle"
4. Note: Git Tag = "sprint-17"
```

**Step 2: Locate Code in Git**
```
1. Checkout sprint-17 tag:
   git checkout sprint-17

2. Find dark mode files:
   git show sprint-17 --name-only | grep -i "dark\|theme"

3. Output:
   src/contexts/ThemeContext.jsx
   src/components/DarkModeToggle.jsx
   src/styles/dark-theme.css
```

**Step 3: Recover Code**
```
1. Create recovery branch:
   git checkout main
   git checkout -b recover-sprint17-dark-mode

2. Restore files:
   git checkout sprint-17 -- src/contexts/ThemeContext.jsx
   git checkout sprint-17 -- src/components/DarkModeToggle.jsx
   git checkout sprint-17 -- src/styles/dark-theme.css

3. Commit recovery:
   git add .
   git commit -m "fix: rollback to Sprint 17 dark mode implementation

   Sprint 25 introduced regression in dark mode.
   Restored working Sprint 17 implementation.

   Recovered from: sprint-17
   Work Item: Add Dark Mode Toggle (Sprint 17)
   "

4. Push and deploy:
   git push origin recover-sprint17-dark-mode
```

**Step 4: Update Notion**
```
1. Create new work item:
   Type: Bug Fix
   Title: "Fix Dark Mode Regression"
   Sprint: 25
   Description: "Rolled back to Sprint 17 implementation"
   Tags: Rollback, Dark Mode
   Notes: "Recovered from sprint-17 tag"
```

---

## Database Relations & Rollups

### SPRINTS Database

**Relations:**
```
Sprint 16
├─ SIVA Tools (relation, many)
│  ├─ Tool 13
│  ├─ Tool 14
│  └─ Tool 15
│
└─ Work Items (relation, many)
   ├─ Refactor: RADAR Phase 2
   ├─ Docs: Sprint Handoff
   └─ [Others]
```

**Rollups:**
```
Total Hours = SUM(SIVA Tools.Actual Time + Work Items.Actual Hours)
            = 2.5h + 1h + 1.5h + 3h + 2h
            = 10h

Tools Count = COUNT(SIVA Tools)
            = 3

Work Items Count = COUNT(Work Items)
                 = 5

Phases Updated = "Phase 2: 33% → 58% (+25%)"
               (calculated from tools completed in Phase 2)
```

---

## Automation Scripts

### Notion → Git Sync

```bash
# Tag sprint when closed
bash scripts/tagSprint.sh 17 "Phase 1 Complete"
git push origin sprint-17
```

### Git → Notion Sync

```bash
# Create SIVA tool entry
npm run sprint:create-tool

# Create general work item
npm run sprint:create-work

# Sync SIVA progress from code
npm run notion:sync-siva-docs
```

---

## Summary Hierarchy

```
SPRINT # (Universal Reference)
│
├─ NOTION (Functional)
│  │
│  ├─ SPRINTS (Master)
│  │  ├─ Sprint 15, 16, 17...
│  │  ├─ Goal, Business Value
│  │  ├─ Total Hours (rollup)
│  │  └─ Git Tag reference
│  │
│  ├─ SIVA TOOLS (Domain-Specific)
│  │  ├─ Tools 1-18
│  │  ├─ Purpose, Business Value
│  │  ├─ Sprint relation
│  │  └─ Time tracking
│  │
│  └─ WORK ITEMS (Universal)
│     ├─ Features, Bugs, Enhancements
│     ├─ Description, Acceptance
│     ├─ Sprint relation
│     └─ Time tracking
│
└─ GIT (Technical)
   │
   ├─ Commits (code changes)
   │  ├─ File changes
   │  ├─ Tests
   │  └─ Sprint reference in message
   │
   ├─ Tags (sprint references)
   │  ├─ sprint-15, sprint-16, sprint-17
   │  ├─ Points to final commit
   │  └─ Links to Notion sprint
   │
   └─ Branches (feature development)
      ├─ feature/* (features)
      ├─ fix/* (bugs)
      └─ Merges to main
```

---

## Key Principles

✅ **Sprint # = Universal Connector**
- Same number in Notion and Git
- Easy reference across systems
- Enables rollback/time-travel

✅ **Notion = Functional (WHAT & WHY)**
- Business value
- Planning/tracking
- Metrics/reporting
- Human-readable

✅ **Git = Technical (HOW)**
- Code implementation
- File changes
- Tests
- Developer-focused

✅ **Proper Hierarchy**
- SPRINTS at top (master)
- SIVA Tools + Work Items linked to sprints
- Git commits reference sprints
- Git tags mark sprint boundaries

✅ **Complete Capture**
- All technical work → Git commits
- All functional work → Notion entries
- Nothing lost, everything traceable
- Full audit trail
