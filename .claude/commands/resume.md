# PremiumRadar-SAAS Session Resume

Resume from an interrupted session. Use this when the previous session was broken/cut off unexpectedly.

## EXECUTE THESE STEPS IN ORDER:

### Step 1: Quick Context Load
```bash
# Minimal context - just essential info
cat .notion-db-ids.json
```

### Step 2: Check Git State (CRITICAL)
Understand what was being worked on:
```bash
# Current branch and status
git status

# Recent commits (last 10)
git log --oneline -10

# What files were recently modified
git diff --stat HEAD~3

# Check for uncommitted changes
git diff --name-only

# Check for staged changes
git diff --cached --name-only
```

### Step 3: Check for Work-in-Progress
Look for incomplete work indicators:
```bash
# Check for any TODO markers in recent files
git diff HEAD~3 | grep -E "(TODO|FIXME|WIP)" || echo "No WIP markers"

# Check for any unfinished sprint scripts
ls -la scripts/notion/*.js | tail -5

# Check docs for recent sprint work
ls -la docs/sprints/ 2>/dev/null || echo "No sprint docs"
ls -la docs/qa/ 2>/dev/null || echo "No QA docs"
```

### Step 4: Check Deployment State
```bash
# Check if there's a running deployment
gcloud builds list --limit=3 --format="table(id,status,createTime)" 2>/dev/null || echo "Cannot check builds"

# Check staging service state
curl -s -o /dev/null -w "%{http_code}" https://upr.sivakumar.ai/api/health 2>/dev/null || echo "Health check failed"
```

### Step 5: Check Notion State (if relevant)
```bash
export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS 2>/dev/null)
if [ -n "$NOTION_TOKEN" ]; then
  node scripts/notion/getCurrentSprint.js 2>/dev/null || echo "Cannot fetch sprint"
fi
```

### Step 6: Analyze and Report

Based on the above checks, provide:

1. **Last known state:**
   - What branch are we on?
   - What was the last commit?
   - Are there uncommitted changes?

2. **Likely interrupted task:**
   - What files were being modified?
   - What sprint/feature was in progress?
   - Was there a deployment in progress?

3. **Recommended next action:**
   - If code was half-written → Continue the implementation
   - If tests were running → Re-run tests
   - If deployment was in progress → Check deployment status
   - If Notion update was pending → Run `/notion-update`

4. **Ask user to confirm:**
   - "Based on git history, it looks like you were working on [X]. Should I continue from there?"
   - "I found uncommitted changes in [files]. Should I review them first?"

## Recovery Strategies

### If Build Was Incomplete
```bash
npm run build
```

### If Deployment Was Incomplete
```bash
gcloud run services describe premiumradar-saas-staging --region=us-central1 --format="value(status.conditions)"
```

### If Notion Sync Was Incomplete
```bash
# Run the update command
/notion-update
```

### If Tests Were Running
```bash
npm test
```

## Usage

```
/resume
```

**TIP:** If you know what was being worked on, tell TC:
```
/resume - I was implementing S26 SIVA Surface
```

This helps TC focus the recovery on the specific task.

## Important Notes

- This command is for UNPLANNED interruptions (crashes, context overflow)
- For planned session starts, use `/context` or `/start` instead
- TC should NEVER assume - always verify state before continuing
- When in doubt, ask the user what they remember working on
