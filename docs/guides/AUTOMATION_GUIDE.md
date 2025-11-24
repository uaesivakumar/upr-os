# UPR Automation & Productivity Guide

**Last Updated:** 2025-11-05
**Status:** Production Ready

---

## 🚀 Quick Start Commands

### Deploy Workflow (Most Used)
```bash
# One-command deploy: commit + push + deploy + sync
npm run deploy "feat: add new feature" upr-web-service

# Deploy to specific service
npm run deploy "fix: bug fix" upr-hiring-signals-worker
npm run deploy "refactor: update UI" upr-web-service

# After testing in cloud, merge to main
git checkout main
git merge feature/your-branch
git push origin main
```

### Daily Operations
```bash
npm run health           # Check all services status
npm run backup           # Backup production database
npm run costs            # Check GCP costs
npm run notion -- sync   # Sync sprint log to Notion
```

---

## 📋 Automation Scripts

### 1. **One-Command Deploy** (`npm run deploy`)

**What it does:**
- Commits all changes
- Pushes to current branch
- Deploys to Cloud Run
- Syncs to Notion
- Shows service URL for testing

**Usage:**
```bash
npm run deploy "commit message" [service-name]

# Examples
npm run deploy "feat: add Q-Score filter"
npm run deploy "fix: handle null signals" upr-worker
```

**Time saved:** ~5 minutes per deploy (was: manual git + gcloud + notion)

---

### 2. **Database Backup** (`npm run backup`)

**What it does:**
- Creates compressed PostgreSQL dump
- Stores in `./backups/` directory
- Keeps last 7 backups, deletes older ones
- Shows backup size and location

**Usage:**
```bash
npm run backup

# Run before major database changes
npm run backup && psql -h 34.121.0.240 -U upr_app -d upr_production -f migration.sql
```

**Time saved:** ~2 minutes per backup
**Risk reduction:** Can restore in seconds if migration fails

---

### 3. **Health Check** (`npm run health`)

**What it does:**
- Checks all 5 Cloud Run services
- Pings service URLs (200/302 = healthy)
- Checks database status
- Color-coded status: ✅ healthy, ⚠️ issues, ❌ down

**Usage:**
```bash
npm run health

# Run after deploy to verify
npm run deploy "feat: xyz" && npm run health

# Morning routine
npm run health && npm run costs
```

**Time saved:** ~3 minutes (was: manual gcloud commands + curl tests)

---

### 4. **Cost Check** (`npm run costs`)

**What it does:**
- Shows current month GCP spending
- Breaks down by service
- Compares to budget ($113/month target)
- Warns if over budget

**Usage:**
```bash
npm run costs

# Check weekly
npm run costs
```

**Time saved:** ~5 minutes (was: navigating GCP console)

---

## 🔄 Automated Workflows

### Complete Deployment Workflow
```bash
# 1. Make code changes
# (edit files in VS Code)

# 2. Deploy in one command
npm run deploy "feat: new feature"

# 3. System automatically:
#    - Commits changes
#    - Pushes to GitHub
#    - Deploys to Cloud Run
#    - Syncs to Notion
#    - Shows test URL

# 4. Test in cloud
# (click the URL shown)

# 5. If successful, merge to main
git checkout main && git merge feature/branch && git push
```

**Total time:** ~2 minutes (was: 8-10 minutes)

---

### Sprint Close Workflow
```bash
# 1. Close current sprint
npm run notion -- close 14

# 2. Calculate metrics
npm run notion -- metrics

# 3. Create backup before next sprint
npm run backup

# 4. Health check
npm run health
```

**Total time:** ~1 minute (was: 5-8 minutes)

---

### Morning Routine
```bash
# Check system status
npm run health

# Pull latest from Notion (if team updates)
npm run notion -- pull

# Check costs
npm run costs
```

**Total time:** ~30 seconds

---

## 🎯 Recommended Automations to Add

### Priority 1: GitHub Actions Enhancements

**Auto Health Check After Deploy:**
```yaml
# Add to .github/workflows/notion-sync.yml
- name: Health check after deploy
  run: bash scripts/health-check.sh
```

**Auto Backup Before Deploy:**
```yaml
- name: Backup database before deploy
  run: bash scripts/backup-db.sh
```

**Time saved:** ~5 minutes per deploy (automatic safety net)

---

### Priority 2: GCP Budget Alerts

**Setup GCP budget alerts:**
```bash
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT \
  --display-name="UPR Monthly Budget" \
  --budget-amount=120USD \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100
```

**What you get:**
- Email alert at $60 (50%)
- Email alert at $108 (90%)
- Email alert at $120 (100%)

**Time saved:** Prevents cost overruns before they happen

---

### Priority 3: Error Monitoring (Sentry)

**Add Sentry for production error tracking:**

```bash
npm install @sentry/node @sentry/react
```

**Backend setup (server.js):**
```javascript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: "production",
  tracesSampleRate: 0.1
});
```

**Frontend setup (main.jsx):**
```javascript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: "production"
});
```

**Benefits:**
- Automatic error tracking
- Stack traces with context
- User impact analysis
- Email/Slack alerts on errors

**Cost:** Free tier: 5K errors/month

---

### Priority 4: Database Migration Automation

**Create migration runner:**
```bash
# scripts/migrate.sh
#!/bin/bash
MIGRATION_FILE=$1

echo "Creating backup..."
npm run backup

echo "Running migration: $MIGRATION_FILE"
PGPASSWORD='...' psql -h 34.121.0.240 -U upr_app -d upr_production -f "$MIGRATION_FILE"

echo "Migration complete"
```

**Usage:**
```bash
bash scripts/migrate.sh migrations/add_column.sql
```

**Safety:** Auto-backup before every migration

---

### Priority 5: Cron Jobs for Maintenance

**Add to Cloud Scheduler:**

**Daily Database Backup (2 AM UTC):**
```bash
gcloud scheduler jobs create http backup-db \
  --schedule="0 2 * * *" \
  --uri="https://your-worker-url/backup" \
  --http-method=POST
```

**Weekly Cost Report (Monday 9 AM):**
```bash
gcloud scheduler jobs create http weekly-costs \
  --schedule="0 9 * * 1" \
  --uri="https://your-worker-url/cost-report" \
  --http-method=POST
```

**Benefits:**
- Automated backups (never forget)
- Weekly cost visibility
- Peace of mind

---

## 🔔 Notification Setup (Optional)

### Slack Notifications

**Add webhook to deployment script:**
```bash
# In deploy.sh, add at end:
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"🚀 Deployed '$SERVICE' - '$COMMIT_MSG'"}' \
  YOUR_SLACK_WEBHOOK_URL
```

**Get notified for:**
- Deployments
- Errors (via Sentry)
- Cost alerts (via GCP)
- Health check failures

---

## 📊 Productivity Metrics

### Before Automation
- Deploy: 8-10 minutes
- Health check: 3-5 minutes
- Database backup: 2-3 minutes
- Cost check: 5-7 minutes
- Sprint close: 5-8 minutes
- **Total per week:** ~2-3 hours

### After Automation
- Deploy: 2 minutes (one command)
- Health check: 10 seconds
- Database backup: 15 seconds
- Cost check: 5 seconds
- Sprint close: 1 minute
- **Total per week:** ~20-30 minutes

### Time Saved
**~2 hours per week** = **~8 hours per month** = **~100 hours per year**

---

## 🎯 Next-Level Automations (Future)

### 1. **AI Code Review**
- GitHub Action that runs Claude Code review on PRs
- Auto-checks for security issues, patterns, best practices

### 2. **Auto-Rollback**
- If health check fails after deploy, auto-revert to previous version

### 3. **Performance Monitoring**
- Track response times, CPU, memory
- Alert if performance degrades

### 4. **Auto-Scaling Optimizer**
- ML model that predicts traffic and adjusts maxScale
- Further cost optimization

### 5. **Customer Usage Analytics**
- Track which companies are most active
- Auto-generate insights for outreach

---

## 📞 Quick Reference

```bash
# Deploy
npm run deploy "message" [service]

# Monitor
npm run health
npm run costs

# Maintain
npm run backup
npm run notion -- metrics

# Sprint
npm run notion -- close 14
npm run notion -- sync
```

---

## 💡 Pro Tips

1. **Alias common commands** (add to ~/.zshrc or ~/.bashrc):
   ```bash
   alias udeploy="cd ~/DataScience/upr && npm run deploy"
   alias uhealth="cd ~/DataScience/upr && npm run health"
   alias ubackup="cd ~/DataScience/upr && npm run backup"
   ```

2. **Morning routine script:**
   ```bash
   # scripts/morning.sh
   npm run health && npm run costs && npm run notion -- pull
   ```

3. **Pre-sprint checklist:**
   ```bash
   # scripts/start-sprint.sh
   npm run backup && npm run health && npm run costs
   ```

4. **End-of-day sync:**
   ```bash
   # scripts/eod.sh
   npm run notion -- sync && git push origin $(git branch --show-current)
   ```

---

**Automation Status:** 🚀 Production Ready

Keep this file updated as you add more automations!
