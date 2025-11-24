# Cron Job Setup for UPR Automation

This document explains how to set up automated cron jobs for monitoring and reporting.

## Available Automated Scripts

### 1. Weekly Cost Report
**Script:** `weekly-cost-report.sh`
**Purpose:** Generate and send weekly infrastructure cost report
**Frequency:** Every Monday at 9 AM
**Cron:** `0 9 * * 1 /Users/skc/DataScience/upr/scripts/weekly-cost-report.sh`

### 2. Health Check Alerts
**Script:** `health-check-alert.sh`
**Purpose:** Check service health and alert on failures
**Frequency:** Every 5 minutes
**Cron:** `*/5 * * * * /Users/skc/DataScience/upr/scripts/health-check-alert.sh`

### 3. Daily Database Backup (Optional)
**Script:** `backup-db.sh`
**Purpose:** Manual backup trigger (Cloud SQL has automated backups)
**Frequency:** Optional - Cloud SQL handles this automatically
**Cron:** `0 2 * * * /Users/skc/DataScience/upr/scripts/backup-db.sh`

## Setup Instructions

### Option 1: Using crontab (macOS/Linux)

1. Edit crontab:
```bash
crontab -e
```

2. Add these lines:
```bash
# Weekly cost report - Every Monday at 9 AM
0 9 * * 1 /Users/skc/DataScience/upr/scripts/weekly-cost-report.sh >> /tmp/upr-cost-report.log 2>&1

# Health check alerts - Every 5 minutes
*/5 * * * * /Users/skc/DataScience/upr/scripts/health-check-alert.sh >> /tmp/upr-health-check.log 2>&1
```

3. Save and exit (`:wq` in vim)

4. Verify crontab:
```bash
crontab -l
```

### Option 2: Using Cloud Scheduler (Recommended for Production)

For production, use GCP Cloud Scheduler to trigger these via Cloud Functions or Cloud Run jobs.

**Benefits:**
- Centralized management
- Better logging and monitoring
- Automatic retries
- No local machine dependency

**Setup:**
```bash
# Example: Schedule weekly cost report
gcloud scheduler jobs create http weekly-cost-report \
  --schedule="0 9 * * 1" \
  --uri="https://upr-web-service-bjctxoj7tq-uc.a.run.app/api/admin/cost-report" \
  --http-method=POST \
  --oidc-service-account-email=YOUR_SERVICE_ACCOUNT \
  --location=us-central1
```

## Environment Variables Required

Make sure these are set in your environment (already in ~/.zshrc):

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
export NOTION_TOKEN="ntn_..."
```

## Testing Scripts Manually

```bash
# Test weekly cost report
bash scripts/weekly-cost-report.sh

# Test health check
bash scripts/health-check-alert.sh

# Test backup
bash scripts/backup-db.sh
```

## Logs Location

- Cost reports: `/tmp/upr-cost-report.log`
- Health checks: `/tmp/upr-health-check.log`
- Database backups: `/tmp/upr-backup.log`

## Disabling Cron Jobs

```bash
# Edit crontab
crontab -e

# Comment out lines with #
# 0 9 * * 1 /path/to/script.sh

# Or remove all cron jobs
crontab -r
```

## Monitoring Cron Jobs

```bash
# View cron logs (macOS)
log show --predicate 'process == "cron"' --last 1h

# Check if cron is running
ps aux | grep cron
```

## GCP Monitoring (Alternative to Local Cron)

Current setup uses GCP built-in features:
- ✅ **Uptime Checks:** Automatically monitor service availability
- ✅ **Budget Alerts:** Email notifications at 50%, 90%, 100%
- ✅ **Cloud SQL Backups:** Automated daily backups at 3 AM
- ✅ **Performance Dashboard:** Real-time metrics visualization

**Manual reports can be triggered via:**
```bash
ucosts          # Cost check
uhealth         # Health check
ubackup         # Database backup
```

## Recommended Approach

**Development/Staging:**
- Use local cron jobs for testing
- Quick iteration and debugging

**Production:**
- Use GCP Cloud Scheduler + Cloud Functions
- Better reliability and monitoring
- No dependency on local machine being online

---

Last updated: 2025-11-06
