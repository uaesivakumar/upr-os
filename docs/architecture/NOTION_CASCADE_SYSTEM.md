# Notion Cascade System: Automated Dependency Chain

**Purpose:** Automatic propagation of updates from SPRINTS → MODULE FEATURES → MODULES

**Status:** ✅ Active and Automated

---

## System Overview

The Notion workspace has 3 interconnected databases that form a dependency chain:

```
SPRINTS
   ↓ (Sprint completion triggers)
MODULE FEATURES
   ↓ (Feature completion triggers)
MODULES
   ↓ (Module progress visible in)
PROJECT STATUS
```

### Database Relationships

1. **SPRINTS Database**
   - Contains: Sprint entries with status, goals, business value
   - Triggers: When marked "Complete", cascades to MODULE FEATURES

2. **MODULE FEATURES Database**
   - Contains: Individual phases/tasks (e.g., "Phase 12: Lead Scoring Engine")
   - Related to: MODULES via "Modules" relation property
   - Triggered by: Sprint completion
   - Triggers: When multiple features complete, updates parent MODULE progress

3. **MODULES Database**
   - Contains: High-level modules (Enrichment Engine, Discovery Engine, etc.)
   - Progress calculated from: Related MODULE FEATURES completion percentage
   - Displays: Current sprint, status, progress bar

---

## How It Works

### 1. Sprint Completion Cascade

When a sprint is marked "Complete" in SPRINTS:

```javascript
// Automatic cascade triggered
1. Find all MODULE FEATURES with Sprint = [sprint number]
2. Mark each feature as "Complete"
3. Set "Completed At" date
4. Set "Done?" checkbox to true
```

**Example:**
```
Sprint 17 marked Complete (2025-11-09)
   ↓
Phase 12: Lead Scoring Engine → Complete
   ↓
Enrichment Engine → 100% Progress, Status: Complete
```

### 2. Module Progress Calculation

When MODULE FEATURES are updated:

```javascript
// For each parent MODULE
1. Count total related features
2. Count completed features
3. Calculate: (completed / total) × 100 = Progress %
4. Update MODULE with:
   - Progress %
   - Current Sprint
   - Status (Complete if 100%, Active if in progress)
   - Last Updated date
```

**Example:**
```
Discovery Engine has 3 Sprint 18 features:
   • Task 4: RADAR Scheduling (Not Started)
   • Task 5: LinkedIn Source (Not Started)
   • Task 7: Confidence Scoring (Not Started)

Progress = (0/3) × 100 = 0%
Status = Active
Current Sprint = 18
```

### 3. Real-Time Project Status

The cascade system generates a live project dashboard showing:

- Recent sprint statuses
- Module progress bars
- Overall project completion percentage
- Current sprint for each module

---

## Usage

### Running the Cascade

**After completing a sprint:**

```bash
# From project root
cd scripts/notion
npm run sprint:cascade 17

# Or with explicit sprint number
node cascadeUpdates.js 17
```

**Check project status anytime:**

```bash
cd scripts/notion
npm run sprint:status
```

### Typical Workflow

```bash
# 1. Update sprint log with outcomes
vim UPR_SPRINT_LOG.md

# 2. Sync to SPRINTS database
npm run sprint:sync

# 3. Mark sprint complete in Notion UI
# (Set Status = "Complete", fill Completed At)

# 4. Run cascade to propagate updates
cd scripts/notion
npm run sprint:cascade 17

# 5. View project status
npm run sprint:status
```

---

## Sprint-to-Module Mapping

This mapping defines which phases belong to which modules:

### Sprint 17 (Complete)

| Phase | Module |
|-------|--------|
| Database Infrastructure | Infra & DevOps |
| API Security | Infra & DevOps |
| Lead Scoring Engine | Enrichment Engine |

**Result:**
- ✅ Enrichment Engine: 100% (Phase 12 complete)
- Infra & DevOps: Updated with Sprint 17 work

### Sprint 18 (Active)

| Phase | Module |
|-------|--------|
| RADAR Automation (Tasks 4-5) | Discovery Engine |
| Webhook Reliability (Task 6) | Infra & DevOps |
| Signal Intelligence (Task 7) | Discovery Engine |
| Error Recovery (Task 8) | Admin Console |
| Production Monitoring (Task 9) | Infra & DevOps |

**Current State:**
- Discovery Engine: 0% (3 tasks not started)
- Infra & DevOps: ~1% (2 tasks not started)
- Admin Console: 0% (1 task not started)

---

## Module Progress Tracking

### Current Modules

1. **Enrichment Engine** (100%)
   - Sprint 17: Phase 12 complete ✅
   - Status: Complete
   - Features: SIVA lead scoring, Q-Score generation

2. **Discovery Engine** (0%)
   - Sprint 18: Phase 3 (RADAR), Phase 5 (Signal Intelligence)
   - Status: Active
   - Features: RADAR automation, LinkedIn signals, confidence scoring

3. **Infra & DevOps** (1%)
   - Sprint 17: Database indexing, API security ✅
   - Sprint 18: Webhook retry, production monitoring
   - Status: Active
   - Features: Infrastructure, monitoring, reliability

4. **Admin Console** (1%)
   - Sprint 18: Error recovery dashboard
   - Status: Active
   - Features: Admin UI, error management

5. **Outreach Generator** (1%)
   - Status: Active
   - Features: Personalization engine

6. **AI Agent Core** (0%)
   - Status: Planned
   - Features: Agentic framework

---

## Viewing in Notion

### SPRINTS Database View

Filter: Status = "Complete"

Shows all completed sprints with:
- Goal
- Business Value
- Phases Updated
- Completed At date
- Git Tag

### MODULE FEATURES Database View

Filter: Sprint = 18 (for current sprint)

Shows all Sprint 18 tasks with:
- Phase name
- Module relation (linked to parent module)
- Status
- ETA
- Priority
- Notes

### MODULES Database View

Sort: Progress % (descending)

Shows all modules with:
- Progress bar visualization
- Current sprint number
- Status
- Last updated date

---

## Automation Benefits

### Before Cascade System
❌ Manual updates to 3 databases
❌ Inconsistent status across databases
❌ No clear project visibility
❌ Time-consuming reconciliation

### After Cascade System
✅ Single update (mark sprint complete) propagates everywhere
✅ Always synchronized across all 3 databases
✅ Real-time project status dashboard
✅ Automated progress calculation
✅ Clear dependency chain visible

---

## Example: Sprint 18 Lifecycle

### Week 1: Sprint Start

```bash
# Tasks created in MODULE FEATURES
# Linked to parent modules (Discovery Engine, etc.)
# Sprint 18 marked "Active" in SPRINTS
```

**Status:**
- Sprint 18: Active
- Discovery Engine: 0% (3 tasks)
- Infra & DevOps: 1% (2 tasks)
- Admin Console: 0% (1 task)

### Week 2: Task Completion

```bash
# As tasks complete in MODULE FEATURES:
# - Task 4 (RADAR Scheduling) → Complete
# - Task 6 (Webhook Retry) → Complete
```

**Status:**
- Sprint 18: Active
- Discovery Engine: 33% (1/3 complete)
- Infra & DevOps: 51% (1/2 Sprint 18 tasks complete)
- Admin Console: 0%

### End of Sprint: Sprint Completion

```bash
# Mark Sprint 18 complete in Notion
# Run cascade: npm run sprint:cascade 18
```

**Status:**
- Sprint 18: Complete ✅
- Discovery Engine: 100% (all 3 tasks complete)
- Infra & DevOps: 100% (all Sprint 18 tasks complete)
- Admin Console: 100% (Task 8 complete)

---

## Troubleshooting

### Issue: Cascade doesn't update features

**Cause:** Features not linked to sprint number

**Fix:**
```bash
# Manually set Sprint property in MODULE FEATURES
# Or update cascadeUpdates.js mapping
```

### Issue: Module progress not updating

**Cause:** Features not linked to parent module

**Fix:**
```bash
# Link features to modules via "Modules" relation
cd scripts/notion
node -e "/* run linking script */"
```

### Issue: Sprint not found

**Cause:** Sprint not synced to SPRINTS database

**Fix:**
```bash
# Sync sprint log
npm run sprint:sync
```

---

## Future Enhancements

- [ ] Automatic cascade on sprint status change (Notion API webhook)
- [ ] Email notifications on module completion
- [ ] Slack integration for project status updates
- [ ] GitHub Actions workflow to run cascade on commit
- [ ] Weekly automated status reports

---

## Commands Reference

```bash
# Sync sprint log to SPRINTS database
npm run sprint:sync

# Run cascade for specific sprint
npm run sprint:cascade [sprint-number]

# View current project status
npm run sprint:status

# Close current sprint and run cascade
npm run sprint:close [sprint-number]
npm run sprint:cascade [sprint-number]
```

---

**Last Updated:** 2025-11-10
**System Status:** ✅ Active and Working
**Automation Level:** Semi-automated (manual trigger after sprint complete)
