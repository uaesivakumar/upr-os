# PremiumRadar-SAAS Notion Create

Create new sprints and features in Notion with proper schema and full property population.

**Use when:** Starting a new stream/stretch, planning new work, or creating sprint backlog.

## IMPORTANT RULES

1. **TC MUST understand Notion schema before creating**
2. **TC MUST populate ALL required fields** (not just name/status)
3. **TC MUST wait for founder approval before executing** created sprints
4. **Sprint count can be specified or auto-determined** based on complexity

## Database Schema Reference

### SPRINTS Database
**ID:** `5c32e26d-641a-4711-a9fb-619703943fb9`

```javascript
{
  "Sprint": "title",              // "Sprint SX" or "SX: Name"
  "Status": "select",             // Backlog → In Progress → Done
  "Repo": "select",               // OS | SaaS Frontend | Super Admin (REQUIRED)
  "Goal": "rich_text",            // Sprint objective
  "Sprint Notes": "rich_text",    // Stream/phase context
  "Outcomes": "rich_text",        // Expected deliverables
  "Highlights": "rich_text",      // Key features/components
  "Business Value": "rich_text",  // Why this matters
  "Learnings": "rich_text",       // Technical insights (fill after completion)
  "Branch": "rich_text",          // feat/branch-name
  "Commit": "rich_text",          // Commit reference
  "Git Tag": "rich_text",         // sprint-sX-complete
  "Started At": "date",           // When sprint started
  "Completed At": "date",         // When sprint completed
  "Synced At": "date",            // Last Notion sync
  "Phases Updated": "multi_select", // Phase tracking
  "Commits Count": "number"       // Number of commits
}
```

### FEATURES Database
**ID:** `26ae5afe-4b5f-4d97-b402-5c459f188944`

```javascript
{
  "Features": "title",            // Feature name
  "Sprint": "number",             // Sprint number (e.g., 26)
  "Status": "select",             // Backlog → In Progress → Done
  "Repo": "select",               // OS | SaaS Frontend | Super Admin (REQUIRED)
  "Priority": "select",           // High, Medium, Low
  "Complexity": "select",         // High, Medium, Low
  "Type": "select",               // Feature, Bug, Infrastructure, Testing
  "Notes": "rich_text",           // Feature description
  "Tags": "multi_select",         // UI, AI, Animation, State, Core
  "Assignee": "rich_text",        // Claude (TC) or human name
  "Done?": "checkbox",            // Completion flag
  "Started At": "date",           // When started
  "Completed At": "date"          // When completed
}
```

## EXECUTE THESE STEPS:

### Step 1: Fetch Notion Token
```bash
export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS)
```

### Step 2: Analyze Task Complexity
Determine number of sprints needed:
- **Simple task (1-2 features):** 1 sprint
- **Medium task (3-6 features):** 2 sprints
- **Complex feature (7-15 features):** 3-4 sprints
- **Major feature/stream (15+ features):** 5+ sprints

If user specifies sprint count, use that. Otherwise, TC decides based on complexity.

### Step 3: Design Sprint Structure
Before creating, plan the sprint breakdown:

```markdown
## Proposed Sprint Plan

**Stream:** [Stream Name]
**Total Sprints:** X

### Sprint SX: [Goal]
**Features:**
1. Feature A (Type: Feature, Priority: High)
2. Feature B (Type: Infrastructure, Priority: High)
...

### Sprint SX+1: [Goal]
**Features:**
1. Feature C (Type: Feature, Priority: High)
...
```

### Step 4: Create Sprints
```javascript
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const SPRINTS_DB = '5c32e26d-641a-4711-a9fb-619703943fb9';

// IMPORTANT: Repo must be one of: 'OS', 'SaaS Frontend', 'Super Admin'
// - 'OS' for UPR OS backend work
// - 'SaaS Frontend' for premiumradar-saas frontend work
// - 'Super Admin' for admin panel work

async function createSprint(sprintNumber, name, goal, stream, repo = 'OS') {
  return await notion.pages.create({
    parent: { database_id: SPRINTS_DB },
    properties: {
      'Sprint': { title: [{ text: { content: `S${sprintNumber}: ${name}` } }] },
      'Status': { select: { name: 'Backlog' } },
      'Repo': { select: { name: repo } },  // REQUIRED: OS | SaaS Frontend | Super Admin
      'Goal': { rich_text: [{ text: { content: goal } }] },
      'Sprint Notes': { rich_text: [{ text: { content: `${stream}. ${goal}` } }] },
      'Outcomes': { rich_text: [{ text: { content: 'To be filled upon completion' } }] },
      'Highlights': { rich_text: [{ text: { content: 'To be filled upon completion' } }] },
      'Business Value': { rich_text: [{ text: { content: 'Business impact description' } }] },
      'Branch': { rich_text: [{ text: { content: `feat/sprint-s${sprintNumber}` } }] },
      'Phases Updated': { multi_select: [{ name: 'Backlog' }] },
    },
  });
}
```

### Step 5: Create Features
```javascript
const FEATURES_DB = '26ae5afe-4b5f-4d97-b402-5c459f188944';

async function createFeature(name, sprintNumber, type, priority, complexity, notes, tags, repo = 'OS') {
  return await notion.pages.create({
    parent: { database_id: FEATURES_DB },
    properties: {
      'Features': { title: [{ text: { content: name } }] },
      'Sprint': { number: sprintNumber },
      'Status': { select: { name: 'Backlog' } },
      'Repo': { select: { name: repo } },  // REQUIRED: OS | SaaS Frontend | Super Admin
      'Priority': { select: { name: priority } },
      'Complexity': { select: { name: complexity } },
      'Type': { select: { name: type } },
      'Notes': { rich_text: [{ text: { content: notes } }] },
      'Tags': { multi_select: tags.map(t => ({ name: t })) },
      'Assignee': { rich_text: [{ text: { content: 'Claude (TC)' } }] },
      'Done?': { checkbox: false },
    },
  });
}
```

### Step 6: Report Creation Summary
After creating, provide:
```
## Notion Creation Complete

**Stream:** [Stream Name]
**Sprints Created:** X (S31-S35)
**Features Created:** Y

### Sprint Breakdown:
| Sprint | Goal | Features |
|--------|------|----------|
| S31 | [Goal] | 5 features |
| S32 | [Goal] | 6 features |
...

**Total Features:** Y

**AWAITING APPROVAL**
Please review the created sprints in Notion:
[Link to Sprints DB]

Reply "approved" to begin execution, or provide modifications.
```

### Step 7: Wait for Approval
**TC MUST NOT execute sprints until founder approves in Notion.**

## Usage Examples

### Create with specific sprint count:
```
/notion-create 5 sprints for user authentication system
```

### Let TC decide sprint count:
```
/notion-create implement real-time notifications
```

### Create for specific stream:
```
/notion-create stream-12 performance optimization
```

## Implementation Guidelines for TC

When creating features, follow these patterns:

### Feature Naming
- Use descriptive names: "SIVAInputBar with Cmd+K shortcut"
- Include the component name if UI: "ReasoningOverlay panel"
- Prefix infrastructure: "Zustand store setup"

### Priority Assignment
- **High:** Core functionality, blockers
- **Medium:** Important but not blocking
- **Low:** Nice-to-have, polish

### Complexity Assignment
- **High:** New architecture, complex state, multiple integrations
- **Medium:** Standard feature, some complexity
- **Low:** Simple UI, bug fix, minor enhancement

### Type Assignment
- **Feature:** New user-facing functionality
- **Infrastructure:** Backend, state management, API
- **Testing:** Tests, QA, verification
- **Bug:** Bug fixes

### Tags
- `UI` - User interface components
- `AI` - AI/ML related
- `Animation` - Motion/animation work
- `State` - State management
- `Core` - Core business logic
- `API` - API integrations

## FORBIDDEN PRACTICES

- ❌ Creating sprints/features without full property population
- ❌ Starting execution before founder approval
- ❌ Using incorrect property types
- ❌ Skipping complexity/priority assessment
- ❌ Creating vague feature names
- ❌ Auto-executing immediately after creation
