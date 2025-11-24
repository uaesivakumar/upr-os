# SIVA Tool Creation Guide

**Automated Notion Entry for SIVA Tools & Primitives**

---

## Quick Start

### Create a New Tool

```bash
npm run sprint:create-tool
```

**Interactive prompts will guide you through:**
1. Tool number (e.g., 5)
2. Tool name (e.g., ContactQualityTool)
3. Sprint number (e.g., 17)
4. Primitive selection (from 14 available)
5. Tool type (STRICT or DELEGATED)
6. Purpose, business value, deliverables
7. Time tracking (status, hours, dates)
8. Integration details

**Result:** Tool automatically created in Notion, linked to sprint, all properties populated.

---

## Tool Creation Workflow

### Example: Creating Tool 5 (ContactQualityTool)

```bash
$ npm run sprint:create-tool

🔧 SIVA Tool Creator

This script automates SIVA tool entry creation in Notion.

📝 Enter Tool Information:

Tool Number (e.g., 5): 5
Tool Name (e.g., ContactQualityTool): ContactQualityTool
Sprint Number (e.g., 17): 17

📋 Available Primitives:
   1. EVALUATE_COMPANY_QUALITY
   2. SELECT_CONTACT_TIER
   3. CALCULATE_TIMING_SCORE
   4. CHECK_EDGE_CASES
   5. SCORE_CONTACT_QUALITY          ← SELECT THIS
   6. CALCULATE_Q_SCORE
   7. CHECK_DUPLICATE_CONTACTS
   8. SELECT_BANKING_PRODUCT
   9. EXTRACT_HIRING_SIGNALS
   10. SCORE_SOURCE_RELIABILITY
   11. CHECK_SIGNAL_DUPLICATION
   12. SELECT_OUTREACH_CHANNEL
   13. GENERATE_OPENING_CONTEXT
   14. CALCULATE_COMPOSITE_SCORE

Select Primitive (1-14): 5

🔧 Tool Type:
   1. STRICT (deterministic, no LLM)
   2. DELEGATED (uses LLM/GPT-4)

Select Type (1-2): 1

Purpose (one sentence): Score contact quality based on profile completeness, engagement signals, and data freshness

Business Value (key benefits, one per line):
- Filters low-quality contacts before outreach
- Reduces wasted sales effort by 30%
- Prioritizes high-engagement contacts
- UAE-specific quality benchmarks

Deliverables (e.g., ✅ Algorithm, ✅ Tests):
✅ Quality scoring algorithm (0-100)
✅ Profile completeness factor
✅ Engagement signal detection
✅ Data freshness scoring
✅ 6/6 tests passing

⏱️  Time Tracking:
Status (To-Do/In Progress/Done): Done
Started At (YYYY-MM-DD): 2024-11-09
Actual Hours (default 1.5h): 2
Completed At (YYYY-MM-DD): 2024-11-09

Integration (where used): Contact scoring pipeline, Composite score (Tool 8)
Dependencies (comma-separated, or leave empty): Tool 1
Notes (optional): Critical for filtering before outreach

🔍 Finding Sprint in Notion...
✅ Found Sprint 17: Sprint 17

📤 Creating tool entry in Notion...
✅ Tool created successfully!

================================================================================
📦 SIVA Tool Created

   Tool: Tool 5: ContactQualityTool
   Sprint: 17
   Phase: Phase 1: Persona Extraction
   Primitive: SCORE_CONTACT_QUALITY
   Type: STRICT
   Status: Done (100%)
   Hours: 2h

🔗 View in Notion:
   https://notion.so/2a566151dd1681...

📊 Sprint Updated:
   Tools Count: +1
   Total Hours: +2h (via rollup)

✅ Done!
================================================================================
```

---

## Tool Types

### STRICT Tools
**Characteristics:**
- Deterministic logic (no LLM)
- Fast execution (<500ms)
- Test coverage: "All Tests Pass"
- Estimated hours: 1.5h
- Examples: Tool 1-4, 14, 15

**When to Use:**
- Simple scoring algorithms
- Data lookups/normalization
- Pattern matching
- Deduplication

### DELEGATED Tools
**Characteristics:**
- Uses LLM (GPT-4)
- Schema-locked outputs
- Test coverage: "Requires API Key"
- Estimated hours: 2.5h
- Examples: Tool 13

**When to Use:**
- Natural language understanding
- Complex extraction
- Classification requiring context
- Unstructured data processing

---

## Primitive Reference

### Phase 1: Persona Extraction (Tools 1-8)

| Tool | Primitive | Type | Purpose |
|------|-----------|------|---------|
| 1 | EVALUATE_COMPANY_QUALITY | STRICT | Company quality scoring |
| 2 | SELECT_CONTACT_TIER | STRICT | Contact tiering (TIER_1/2/3) |
| 3 | CALCULATE_TIMING_SCORE | STRICT | Timing optimization |
| 4 | CHECK_EDGE_CASES | STRICT | Edge case detection |
| 5 | SCORE_CONTACT_QUALITY | STRICT | Contact quality scoring |
| 6 | CALCULATE_Q_SCORE | STRICT | Q-score calculation |
| 7 | CHECK_DUPLICATE_CONTACTS | STRICT | Duplicate detection |
| 8 | SELECT_BANKING_PRODUCT | STRICT | Product mapping |

### Phase 2: Cognitive Framework (Tools 9-15)

| Tool | Primitive | Type | Purpose |
|------|-----------|------|---------|
| 13 | EXTRACT_HIRING_SIGNALS | DELEGATED | Signal extraction |
| 14 | SCORE_SOURCE_RELIABILITY | STRICT | Source scoring |
| 15 | CHECK_SIGNAL_DUPLICATION | STRICT | Signal deduplication |

### Phase 3: Orchestration (Tools 16-18)

| Tool | Primitive | Type | Purpose |
|------|-----------|------|---------|
| 16 | SELECT_OUTREACH_CHANNEL | STRICT | Channel selection |
| 17 | GENERATE_OPENING_CONTEXT | DELEGATED | Context generation |
| 18 | CALCULATE_COMPOSITE_SCORE | STRICT | Final scoring |

---

## Best Practices

### 1. Tool Naming Convention
```
Tool <number>: <PascalCaseName>

✅ Good:
- Tool 5: ContactQualityTool
- Tool 13: HiringSignalExtraction
- Tool 16: OutreachChannelSelector

❌ Bad:
- contactQuality (no "Tool" prefix)
- Tool 5 - Contact Quality (spaces, dashes)
```

### 2. Purpose Writing
**Format:** Single sentence, starts with verb, explains WHAT it does

```
✅ Good:
"Score contact quality based on profile completeness, engagement signals, and data freshness"

❌ Bad:
"This tool is for contacts" (vague)
"Quality scoring" (incomplete)
```

### 3. Business Value Format
**Format:** Bullet list, starts with "-", quantify when possible

```
✅ Good:
- Filters low-quality contacts before outreach
- Reduces wasted sales effort by 30%
- Prioritizes high-engagement contacts
- UAE-specific quality benchmarks

❌ Bad:
"It helps with contacts and makes things better"
```

### 4. Deliverables Format
**Format:** Checkmarks (✅), specific artifacts, test status

```
✅ Good:
✅ Quality scoring algorithm (0-100)
✅ Profile completeness factor
✅ Engagement signal detection
✅ 6/6 tests passing

❌ Bad:
- Code written
- Tests done
```

### 5. Dependencies
**Format:** Comma-separated, tool numbers or API keys

```
✅ Good:
Tool 1, Tool 14
OPENAI_API_KEY
Tool 13, Tool 14, OPENAI_API_KEY

❌ Bad:
Depends on company quality tool (use "Tool 1")
```

---

## Integration Patterns

### Pattern 1: Sequential Pipeline
Tool depends on previous tool's output

```
Example: Tool 15 → Tool 14
- Tool 14: SCORE_SOURCE_RELIABILITY (filters sources)
- Tool 15: CHECK_SIGNAL_DUPLICATION (checks filtered signals)

Integration field:
"RADAR Phase 2 (runs after Tool 14 source filtering)"
```

### Pattern 2: Parallel Execution
Tools run independently, combined later

```
Example: Tool 1, Tool 2, Tool 3 → Tool 8 (Composite)
- Tools 1-3 run in parallel
- Tool 8 combines outputs

Integration field:
"Composite score (Tool 8), Contact scoring pipeline"
```

### Pattern 3: Quality Gate
Tool blocks pipeline if conditions fail

```
Example: Tool 4 (Edge Cases)
- Runs early in pipeline
- Blocks bad leads from proceeding

Integration field:
"RADAR quality gate, Composite score blocker"
```

---

## Time Tracking

### Status Guidelines

**To-Do:**
- Not started yet
- No Started At date
- Completion: 0%
- Hours: 0

**In Progress:**
- Currently working on
- Has Started At date
- Completion: 1-99% (typically 50%)
- Hours: Estimated based on work done

**Done:**
- Fully complete
- Has Started At AND Completed At
- Completion: 100%
- Hours: Actual time spent

### Hour Estimation

**STRICT Tools:**
- Simple scoring: 1h
- Medium complexity: 1.5h
- Complex algorithms: 2h

**DELEGATED Tools:**
- Simple extraction: 2h
- Complex extraction: 2.5h
- Multi-step LLM: 3h

**Include time for:**
- Algorithm/prompt development
- Testing (6/6 tests passing)
- Documentation
- Integration work

---

## Sprint Planning Workflow

### Starting Sprint 17 (Tools 5-7)

```bash
# Step 1: Create Sprint 17 in Notion
# (Use Notion UI or create a sprint script)

# Step 2: Create Tool 5
npm run sprint:create-tool
# Enter: Tool 5, ContactQualityTool, Sprint 17, etc.

# Step 3: Create Tool 6
npm run sprint:create-tool
# Enter: Tool 6, QScoreTool, Sprint 17, etc.

# Step 4: Create Tool 7
npm run sprint:create-tool
# Enter: Tool 7, DuplicateCheckTool, Sprint 17, etc.

# Step 5: Work on tools, update status as you progress

# Step 6: Close Sprint 17
bash scripts/tagSprint.sh 17 "Phase 1 Complete - Tools 5-7"
git push origin sprint-17
```

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
   - Goal: "Your goal here"
3. Re-run `npm run sprint:create-tool`

### Error: "Invalid primitive selection"

**Cause:** Selected number outside 1-14 range

**Fix:** Enter valid number from primitive list

### Error: "Cannot create page: invalid properties"

**Cause:** SIVA Tools database missing required properties

**Fix:**
1. Check database schema matches `createSprintDatabases.js`
2. Ensure all properties exist:
   - Tool Name (title)
   - Tool Number (number)
   - Sprint (relation to SPRINTS)
   - Primitive (select)
   - Type (select)
   - etc.

---

## Automation Roadmap

### Current (v1.0)
✅ Interactive CLI tool creation
✅ Sprint linking
✅ Template-based defaults
✅ Validation

### Future (v2.0)
🔄 Batch tool creation (from JSON/CSV)
🔄 Git integration (auto-detect commit info)
🔄 Auto-populate from code analysis
🔄 Slack notifications on tool completion
🔄 Jira integration for sprint sync

---

## Example: Full Sprint 17 Creation

```bash
# Sprint 17 Plan: Complete Phase 1 (Tools 5-7)
# Goal: 100% Phase 1 completion
# Estimated: 6 hours (3 × 2h each)

# Tool 5: ContactQualityTool (2h)
npm run sprint:create-tool
# SCORE_CONTACT_QUALITY, STRICT, Done, 2h

# Tool 6: QScoreTool (2h)
npm run sprint:create-tool
# CALCULATE_Q_SCORE, STRICT, Done, 2h

# Tool 7: DuplicateCheckTool (2h)
npm run sprint:create-tool
# CHECK_DUPLICATE_CONTACTS, STRICT, Done, 2h

# Result in Notion:
# Sprint 17
#   Tools Count: 3 (via rollup)
#   Total Hours: 6h (via rollup)
#   Phases Updated: Phase 1: 50% → 100% (+50%)
#   Status: Closed ✅
```

---

## Notion Database Structure

### SPRINTS Database
**Purpose:** Master sprint tracking

**Key Properties:**
- Sprint (title): "Sprint 17"
- Sprint Number (number): 17
- Status (select): Closed/Active/Planned
- Total Hours (number): Rollup from tools
- Tools Count (number): Rollup from tools
- Git Tag (text): "sprint-17"

### SIVA Tools Database
**Purpose:** Granular tool tracking

**Key Properties:**
- Tool Name (title): "Tool 5: ContactQualityTool"
- Tool Number (number): 5
- Sprint (relation): → SPRINTS
- Primitive (select): SCORE_CONTACT_QUALITY
- Type (select): STRICT/DELEGATED
- Actual Time (Hours) (number): 2
- Status (select): Done/In Progress/To-Do

**Relations:**
- Sprint → SPRINTS (many-to-one)
- SPRINTS ← Tools (one-to-many, rollup)

---

## Summary

✅ **Automation Enabled**
- `npm run sprint:create-tool` creates tools in seconds
- All properties auto-populated with smart defaults
- Sprint linking automatic

✅ **Template-Based**
- STRICT tools: 1.5h default, "All Tests Pass"
- DELEGATED tools: 2.5h default, "Requires API Key"
- Primitive → Phase mapping automatic

✅ **Sprint Integration**
- Tools link to sprints via relation
- Sprint totals update via rollup
- Git tags connect Notion ↔ Git

✅ **Future-Proof**
- Easy to add new primitives
- Extensible for batch creation
- Ready for CI/CD integration

---

**Next Steps:**
1. Create Sprint 17 in Notion
2. Run `npm run sprint:create-tool` for Tool 5
3. Test workflow, gather feedback
4. Iterate on automation improvements
