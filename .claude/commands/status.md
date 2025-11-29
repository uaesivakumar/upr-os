# PremiumRadar-SAAS Status Check

Get a comprehensive status overview of the project.

**Usage:**
- `/status` - Full status report
- `/status git` - Git status only
- `/status notion` - Notion status only
- `/status services` - Cloud services status only

## EXECUTE THESE CHECKS:

### 1. Git Status
```bash
echo "=== GIT STATUS ==="
git branch --show-current
git status --short
git log --oneline -5
echo ""
```

### 2. Build Status
```bash
echo "=== BUILD STATUS ==="
npm run build 2>&1 | tail -5
echo ""
```

### 3. Cloud Services Status
```bash
echo "=== CLOUD SERVICES ==="

# Staging SaaS
echo -n "Staging (upr.sivakumar.ai): "
curl -s -o /dev/null -w "%{http_code}" https://upr.sivakumar.ai/api/health 2>/dev/null || echo "FAIL"

# Production SaaS
echo -n "Production (premiumradar.com): "
curl -s -o /dev/null -w "%{http_code}" https://premiumradar.com/api/health 2>/dev/null || echo "FAIL"

# OS Service
echo -n "OS Service: "
gcloud run services describe upr-os-service --region=us-central1 --format="value(status.conditions[0].status)" 2>/dev/null || echo "UNKNOWN"

# Worker Service
echo -n "Worker Service: "
gcloud run services describe upr-os-worker --region=us-central1 --format="value(status.conditions[0].status)" 2>/dev/null || echo "UNKNOWN"
echo ""
```

### 4. Recent Deployments
```bash
echo "=== RECENT DEPLOYMENTS ==="
gcloud run services describe premiumradar-saas-staging --region=us-central1 --format="table(status.conditions[0].lastTransitionTime,status.latestReadyRevisionName)" 2>/dev/null || echo "Cannot fetch"
echo ""
```

### 5. Notion Sprint Status
```bash
echo "=== NOTION SPRINT STATUS ==="
export NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS 2>/dev/null)
if [ -n "$NOTION_TOKEN" ]; then
  node scripts/notion/getCurrentSprint.js 2>/dev/null || echo "Cannot fetch sprint"
else
  echo "Token not available"
fi
echo ""
```

### 6. Dependencies Status
```bash
echo "=== DEPENDENCIES ==="
npm outdated 2>/dev/null | head -10 || echo "All up to date"
echo ""
```

## Output Format

```
============================================================
PROJECT STATUS - PremiumRadar-SAAS
Time: YYYY-MM-DD HH:MM
============================================================

GIT
  Branch: main
  Status: Clean / X uncommitted changes
  Last Commit: [hash] [message]

BUILD
  TypeScript: PASS/FAIL
  Build: PASS/FAIL

SERVICES
  Staging:    200 OK / FAIL
  Production: 200 OK / FAIL
  OS Service: True / False
  Worker:     True / False

NOTION
  Current Sprint: SX
  Features: X/Y complete
  Status: In Progress / Done

DEPLOYMENTS
  Last Staging: [timestamp]
  Last Production: [timestamp]

============================================================
```

## Quick Checks

### Is staging healthy?
```bash
curl -s https://upr.sivakumar.ai/api/health | jq -r '.status'
```

### What's the current sprint?
```bash
NOTION_TOKEN=$(gcloud secrets versions access latest --secret=NOTION_TOKEN_SAAS) node scripts/notion/getCurrentSprint.js
```

### Any uncommitted changes?
```bash
git status --porcelain | wc -l
```

### Last deployment time?
```bash
gcloud run services describe premiumradar-saas-staging --region=us-central1 --format="value(status.conditions[0].lastTransitionTime)"
```
