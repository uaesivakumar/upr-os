# UPR Notion Roadmap Setup

This directory contains scripts to set up and populate your UPR project roadmap in Notion.

## 🚀 Quick Start

### Step 1: Get Your Notion Integration Token

1. Go to https://www.notion.so/my-integrations
2. Click "+ New integration"
3. Name it "UPR Roadmap" (or whatever you prefer)
4. Select your workspace
5. Click "Submit"
6. Copy the "Internal Integration Token" (starts with `secret_`)

### Step 2: Get Your Parent Page ID

1. Open Notion and navigate to your UPR page
2. Copy the page ID from the URL:
   ```
   https://www.notion.so/YOUR_WORKSPACE/PAGE_TITLE-2a166151dd1680e1b2f4ca09e2258dff
                                                   ^^^ This part is the page ID
   ```

### Step 3: Share the Page with Your Integration

1. Open your UPR page in Notion
2. Click the "..." menu (top right)
3. Click "Add connections"
4. Select your "UPR Roadmap" integration
5. Click "Confirm"

### Step 4: Install Dependencies

```bash
cd scripts/notion
npm install
```

### Step 5: Set Up Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your values:

```bash
NOTION_TOKEN=secret_your_actual_token_here
NOTION_PARENT_PAGE_ID=your_actual_page_id_here
```

### Step 6: Create the Databases

```bash
npm run create-roadmap
```

This will create three linked databases:
- 📘 UPR Modules & Streams
- ⚙️ UPR Sprint Work Items
- 📓 UPR Sprint Journal

### Step 7: Populate with Sprint Data (Coming Next)

After the databases are created, you can run:

```bash
npm run populate-sprints
```

This will populate your roadmap with historical sprint data (Sprints 6-13).

---

## 📊 What Gets Created

### 1. UPR Modules & Streams

Tracks high-level feature areas:
- **Name**: Module name (e.g., "Hiring Signals", "Enrichment Pipeline")
- **Owner**: Who's responsible
- **Status**: Active, Planned, Paused, Completed
- **Progress %**: Overall completion percentage
- **Current Sprint**: Which sprint this module is in
- **Velocity**: Story points per sprint

### 2. UPR Sprint Work Items

Individual tasks and features:
- **Name**: Task description
- **Module**: Links to Modules database
- **Sprint**: Sprint number
- **Type**: Feature, Bug Fix, Enhancement, Infra
- **Priority**: Low, Medium, High, Critical
- **Complexity**: Low, Medium, High
- **ETA**: Estimated hours/days
- **Status**: Backlog, In Progress, Testing, Done
- **Notes**: Additional context

### 3. UPR Sprint Journal

Daily/weekly sprint logs:
- **Sprint**: Sprint number
- **Date**: When the entry was made
- **Branch**: Git branch worked on
- **Commit**: Relevant commit hash
- **Highlights**: Key accomplishments
- **Outcomes**: What was delivered
- **Learnings**: Insights and improvements

---

## 🔄 Auto-Sync: Keep Notion Updated from VS Code

The auto-sync system lets you update your Notion roadmap directly from your VS Code terminal. Every time you close a sprint or update your checkpoint file, it automatically syncs to Notion.

### How It Works

The sync script:
1. Reads your local sprint data from `UPR_CHECKPOINT.md` (or creates it)
2. Connects to Notion using your integration token
3. **Smart upsert**: Updates existing sprint records or creates new ones
4. Syncs all data to your UPR Sprint Journal database

### Quick Commands

```bash
# Sync your checkpoint file to Notion
npm run sprint:sync

# Close a sprint and sync automatically
npm run sprint:close 13

# Create a checkpoint template
npm run sprint:template
```

### Setup Auto-Sync

#### 1. Create Your Checkpoint File

Create `UPR_CHECKPOINT.md` in your project root:

```markdown
# UPR Sprint Checkpoint

### Sprint 11
- Branch: feature/phase-2a-enrichment-migration
- Commit: d2ba5b9
- Date: 2025-11-04
- Highlights: Production fixes + Testing coverage
- Outcomes: Stable deploy
- Learnings: Enhance error tracking

### Sprint 12
- Branch: main
- Commit: abc123
- Date: 2025-11-18
- Highlights: Template save + context parsing
- Outcomes: Planned
- Learnings: Implement URL context parsing
```

Or generate a template:

```bash
npm run sprint:template
```

#### 2. Sync to Notion

From your project root or scripts/notion:

```bash
npm run sprint:sync
```

You'll see:

```
🔁 Syncing UPR Sprint Data to Notion...
📖 Reading: UPR_CHECKPOINT.md
📝 Found 2 sprint(s) to sync

  ✓ Updated Sprint 11
  ✓ Created Sprint 12

✅ Sync complete!
```

#### 3. Close a Sprint

When you finish a sprint:

```bash
npm run sprint:close 13
```

This automatically:
- Gets your current Git branch
- Gets your latest commit hash
- Creates/updates Sprint 13 in Notion
- Timestamps the entry

### Auto-Sync on Git Commit (Optional)

To sync automatically after every commit, add a Git hook:

```bash
# Install husky
npm install --save-dev husky
npx husky install

# Add post-commit hook
npx husky add .husky/post-commit "npm run sprint:sync"
```

Now every `git commit` will sync your checkpoint to Notion!

### Advanced: Custom Checkpoint Location

The sync script searches for checkpoint files in:
1. `UPR_CHECKPOINT.md` (root)
2. `progress/UPR_CHECKPOINT.md`
3. `CHECKPOINT.md` (root)

Place your file in any of these locations.

### Sync from CI/CD (Optional)

Add to your `.github/workflows/deploy.yml`:

```yaml
- name: Sync Sprint to Notion
  run: |
    export NOTION_TOKEN=${{ secrets.NOTION_TOKEN }}
    npm run sprint:sync
```

This syncs to Notion on every deployment!

---

## 🔒 Security

- Your Notion token is stored **locally only** in `.env`
- Never commit `.env` to git (it's in `.gitignore`)
- The token is only used to authenticate API requests from your machine

---

## 🛠️ Troubleshooting

### "unauthorized" error

Make sure:
1. Your `NOTION_TOKEN` is correct
2. You shared the parent page with your integration (Step 3 above)
3. Your `NOTION_PARENT_PAGE_ID` is correct

### "object_not_found" error

Double-check your parent page ID. Extract it carefully from the Notion URL.

### Module not found errors

Make sure you're running the script from the `scripts/notion` directory:
```bash
cd scripts/notion
npm run create-roadmap
```

---

## 📝 Next Steps

After creating the databases:
1. Open Notion and verify the three new databases
2. Customize views as needed
3. Run the populate script to add historical sprint data
4. Start using the system for sprint planning!

---

## ⚡ UPDATE NOTION - Single Command Updates

The UPDATE NOTION system provides bulletproof, automated updates for both Sprints and Module Features databases.

### Quick Start

```bash
./updateNotion.sh 31 30
```

This single command:
- ✅ Updates Sprints database with ALL columns (including Git data)
- ✅ Updates Module Features database
- ✅ Validates schemas before updating
- ✅ Handles errors gracefully
- ✅ Eliminates all 10 recurring Notion issues

### What Gets Updated

**Sprints Database** - All columns filled automatically:
- Core Data: Status, Completed At, Outcomes, Sprint Notes
- Details: Highlights, Goal, Business Value, Learnings
- Git Columns: Branch, Commit, Commits Count, Git Tag, Commit Range, Synced At

**Module Features Database** - Phase-level updates:
- Status, Sprint, Completed At, Notes, Done? checkbox

### Adding a New Sprint

1. Edit `updateNotionComplete.js` and add sprint data
2. Run: `./updateNotion.sh [sprint_number] [previous_sprint_number]`
3. Verify in Notion that all columns are filled

### Complete Documentation

See [UPDATE_NOTION_SYSTEM.md](../../docs/UPDATE_NOTION_SYSTEM.md) for:
- Complete architecture details
- How it solves all 10 recurring issues
- Debugging guides
- Advanced configuration

---

**Need help?** Check the main UPR project README or reach out to the team.
