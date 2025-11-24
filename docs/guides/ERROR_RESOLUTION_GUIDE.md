# UPR Error Resolution Guide

Complete troubleshooting guide for common production issues.

---

## Quick Diagnostic Commands

```bash
uhealth              # Check all services status
ucosts               # Check GCP costs
udb                  # Connect to database
ustatus              # Git status
ulog                 # Recent commits
```

---

## Error Categories

### 1. Service Availability Errors

#### Symptom: Service returns 502/503/504

**Diagnostic Steps:**
```bash
# Check service status
gcloud run services describe upr-web-service --region us-central1

# Check recent logs
gcloud run services logs read upr-web-service --limit=50

# Check resource limits
gcloud run services describe upr-web-service --region us-central1 \
  --format="value(spec.template.spec.containers[0].resources)"
```

**Common Causes:**
- Cold start timeout (first request after scale-to-zero)
- Memory limit exceeded
- CPU throttling
- Database connection issues

**Resolution:**
```bash
# Increase memory if OOM
gcloud run services update upr-web-service \
  --memory=2Gi \
  --region=us-central1

# Increase CPU if throttling
gcloud run services update upr-web-service \
  --cpu=2 \
  --region=us-central1

# Increase request timeout
gcloud run services update upr-web-service \
  --timeout=300 \
  --region=us-central1
```

---

#### Symptom: Service won't start / crashes immediately

**Diagnostic Steps:**
```bash
# Check deployment logs
gcloud run services logs read upr-web-service --limit=100

# Check environment variables
gcloud run services describe upr-web-service --region us-central1 \
  --format="value(spec.template.spec.containers[0].env)"

# Test locally (NOT recommended per CONTEXT.md, but for debugging)
# Use Cloud Shell instead
```

**Common Causes:**
- Missing environment variables
- Database connection failure
- Port binding issue (must use PORT env var)
- Syntax error in code

**Resolution:**
```bash
# Check if all required env vars are set
gcloud run services describe upr-web-service --region us-central1

# Verify VPC connector is attached
gcloud run services describe upr-web-service --region us-central1 \
  --format="value(spec.template.spec.vpcAccess)"

# Check database connectivity
udb
\conninfo
```

---

### 2. Database Errors

#### Symptom: "Connection timeout" or "Cannot connect to database"

**Diagnostic Steps:**
```bash
# Check database status
gcloud sql instances describe upr-postgres

# Check if database is running
gcloud sql instances list

# Test connection
udb
```

**Common Causes:**
- Database stopped (ACTIVATION_POLICY=NEVER)
- VPC connector misconfigured
- Wrong connection string
- Database is full

**Resolution:**
```bash
# Start database if stopped
gcloud sql instances patch upr-postgres --activation-policy=ALWAYS

# Check VPC connector
gcloud compute networks vpc-access connectors describe upr-vpc-connector \
  --region=us-central1

# Check database disk space
gcloud sql instances describe upr-postgres \
  --format="value(settings.dataDiskSizeGb)"

# Increase disk if needed
gcloud sql instances patch upr-postgres --storage-size=20GB
```

---

#### Symptom: "Too many connections"

**Diagnostic Steps:**
```bash
# Connect to database
udb

# Check active connections
SELECT count(*) FROM pg_stat_activity;

# See what's connected
SELECT usename, application_name, client_addr, state, count(*)
FROM pg_stat_activity
GROUP BY usename, application_name, client_addr, state;
```

**Resolution:**
```bash
# Kill idle connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
AND query_start < NOW() - INTERVAL '5 minutes';

# Increase max connections (requires restart)
gcloud sql instances patch upr-postgres \
  --database-flags=max_connections=100
```

---

### 3. Deployment Errors

#### Symptom: GitHub Actions workflow fails

**Diagnostic Steps:**
```bash
# Check workflow status
gh workflow list

# View recent runs
gh run list --limit 5

# View specific run logs
gh run view <run-id> --log
```

**Common Causes:**
- Missing GitHub secrets
- GCP authentication failure
- Docker build failure
- Notion API rate limit

**Resolution:**
```bash
# Check if secrets are set
gh secret list

# Add missing secrets
gh secret set NOTION_TOKEN --body "ntn_..."

# Re-run failed workflow
gh run rerun <run-id>
```

---

#### Symptom: Cloud Run deployment fails

**Diagnostic Steps:**
```bash
# Check deployment status
gcloud run services describe upr-web-service --region us-central1

# Check recent operations
gcloud run operations list --region=us-central1

# Check build logs
gcloud builds list --limit=5
```

**Common Causes:**
- Dockerfile error
- Missing files in COPY statement
- Invalid service YAML
- Insufficient permissions

**Resolution:**
```bash
# Check Dockerfile syntax
docker build -t test .

# Validate service YAML
gcloud run services replace cloud-run-web-service.yaml --region us-central1

# Check service account permissions
gcloud projects get-iam-policy applied-algebra-474804-e6
```

---

### 4. Performance Issues

#### Symptom: High latency / slow response times

**Diagnostic Steps:**
```bash
# Check performance dashboard
# https://console.cloud.google.com/monitoring/dashboards?project=applied-algebra-474804-e6

# Check recent metrics
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies"' \
  --format="table(metric.type, points)"

# Check database slow queries
udb
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Common Causes:**
- Slow database queries
- Missing database indexes
- Cold starts
- High CPU usage

**Resolution:**
```bash
# Add database index
udb
CREATE INDEX idx_hiring_signals_company ON hiring_signals(company);

# Increase Cloud Run CPU
gcloud run services update upr-web-service \
  --cpu=2 \
  --region=us-central1

# Set minimum instances (prevents cold starts, increases cost)
gcloud run services update upr-web-service \
  --min-instances=1 \
  --region=us-central1
```

---

#### Symptom: High memory usage / OOM kills

**Diagnostic Steps:**
```bash
# Check memory metrics
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/memory/utilizations"'

# Check logs for OOM
gcloud run services logs read upr-web-service \
  --limit=100 | grep -i "memory"
```

**Resolution:**
```bash
# Increase memory limit
gcloud run services update upr-web-service \
  --memory=2Gi \
  --region=us-central1

# Check for memory leaks in code
# Look for unclosed connections, large arrays, etc.
```

---

### 5. Integration Errors

#### Symptom: Sentry not capturing errors

**Diagnostic Steps:**
```bash
# Check if SENTRY_DSN is set
echo $SENTRY_DSN

# Check Sentry initialization in code
cat instrument.js
cat utils/sentry.js

# Test Sentry manually
curl https://upr-web-service-bjctxoj7tq-uc.a.run.app/api/test-error
```

**Resolution:**
```bash
# Verify DSN is correct
export SENTRY_DSN="https://279aa7db288416fb8e3d252ac314e1e3@..."

# Redeploy with correct env var
gcloud run services update upr-web-service \
  --set-env-vars SENTRY_DSN="$SENTRY_DSN" \
  --region=us-central1

# Check Sentry dashboard
# https://sentry.io
```

---

#### Symptom: Notion sync failing

**Diagnostic Steps:**
```bash
# Test Notion connection
npm run notion -- sync

# Check Notion token
echo $NOTION_TOKEN

# Check database IDs
echo $MODULES_DB_ID
echo $WORK_ITEMS_DB_ID
echo $JOURNAL_DB_ID
```

**Resolution:**
```bash
# Set environment variables
export NOTION_TOKEN="ntn_..."
export MODULES_DB_ID="..."
export WORK_ITEMS_DB_ID="..."
export JOURNAL_DB_ID="..."

# Test sync again
npm run notion -- sync

# If still failing, check Notion API status
# https://status.notion.so
```

---

#### Symptom: Slack notifications not sending

**Diagnostic Steps:**
```bash
# Check webhook URL
echo $SLACK_WEBHOOK_URL

# Test webhook manually
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test message"}'
```

**Resolution:**
```bash
# Set correct webhook URL
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."

# Test again
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test message from UPR"}'
```

---

### 6. Cost Overruns

#### Symptom: Unexpected high costs

**Diagnostic Steps:**
```bash
# Check cost report
ucosts

# Check budget alert status
gcloud billing budgets list --billing-account=01BF3F-B89AC7-72D444

# Check service scaling
gcloud run services list --format="table(
  metadata.name,
  spec.template.metadata.annotations['autoscaling.knative.dev/minScale'],
  spec.template.metadata.annotations['autoscaling.knative.dev/maxScale']
)"
```

**Common Causes:**
- minScale > 0 (services always running)
- Database always on
- High network egress
- Unused resources

**Resolution:**
```bash
# Set all services to minScale=0
bash scripts/emergency-cost-reduction.sh

# Stop database if not in use
gcloud sql instances patch upr-postgres --activation-policy=NEVER

# Check for unused resources
gcloud compute instances list
gcloud compute addresses list
gcloud redis instances list
```

---

## Emergency Procedures

### Complete Service Outage

```bash
# 1. Check all services
uhealth

# 2. Check Sentry for errors
# Visit: https://sentry.io

# 3. Check recent deployments
gh run list --limit=5

# 4. Rollback if needed
gcloud run services update-traffic upr-web-service \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=us-central1

# 5. Restore from backup if database issue
gcloud sql backups restore <backup-id> \
  --backup-instance=upr-postgres \
  --instance=upr-postgres
```

### Database Corruption

```bash
# 1. Create backup immediately
ubackup

# 2. Check database integrity
udb
VACUUM ANALYZE;

# 3. Restore from recent backup
gcloud sql backups list --instance=upr-postgres --limit=5
gcloud sql backups restore <backup-id> \
  --backup-instance=upr-postgres \
  --instance=upr-postgres
```

### Cost Emergency (Budget Exceeded)

```bash
# Immediately reduce costs
bash scripts/emergency-cost-reduction.sh

# Stop non-critical services
gcloud run services update coming-soon-service \
  --min-instances=0 \
  --max-instances=0 \
  --region=us-central1

# Stop database if possible
gcloud sql instances patch upr-postgres --activation-policy=NEVER
```

---

## Monitoring Resources

**Dashboards:**
- Performance: https://console.cloud.google.com/monitoring/dashboards?project=applied-algebra-474804-e6
- Uptime: https://console.cloud.google.com/monitoring/uptime?project=applied-algebra-474804-e6
- Sentry: https://sentry.io
- GCP Console: https://console.cloud.google.com/run?project=applied-algebra-474804-e6

**Logs:**
```bash
# Service logs
gcloud run services logs read upr-web-service --limit=100

# Build logs
gcloud builds list --limit=5

# Database logs
gcloud sql operations list --instance=upr-postgres
```

---

## Escalation Path

1. Check Sentry for stack traces
2. Check Cloud Run logs for errors
3. Check database connectivity
4. Check GitHub Actions for deployment issues
5. Review recent commits that might have caused issue
6. If critical: rollback to last known good revision

---

## Useful Commands Reference

```bash
# Service Management
gcloud run services list --region=us-central1
gcloud run services describe <service> --region=us-central1
gcloud run services update <service> --region=us-central1

# Database Management
gcloud sql instances list
gcloud sql instances describe upr-postgres
gcloud sql backups list --instance=upr-postgres

# Monitoring
gcloud monitoring dashboards list
gcloud monitoring uptime list

# Debugging
gcloud run services logs read <service> --limit=100
gcloud sql operations list --instance=upr-postgres

# Cost Management
gcloud billing budgets list --billing-account=01BF3F-B89AC7-72D444
```

---

**Last Updated:** 2025-11-06
**Maintained by:** AI Assistant + SKC
**Review Frequency:** After each production incident
