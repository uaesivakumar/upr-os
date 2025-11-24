# UPR Operations Runbook

**Version**: 1.0.0
**Last Updated**: 2025-11-19
**Platform**: Google Cloud Platform
**Target Audience**: Operations Teams, DevOps Engineers, On-Call Personnel
**System**: UPR (UAE Premium Radar) - Lead Enrichment & Multi-Agent System

---

## Table of Contents

1. [Overview](#overview)
2. [Daily Operations](#daily-operations)
3. [Weekly Maintenance](#weekly-maintenance)
4. [Monthly Reviews](#monthly-reviews)
5. [Incident Response Playbooks](#incident-response-playbooks)
6. [Performance Tuning](#performance-tuning)
7. [Capacity Planning](#capacity-planning)
8. [API Management](#api-management)
9. [Database Operations](#database-operations)
10. [Backup & Recovery Operations](#backup-recovery-operations)
11. [Security Operations](#security-operations)
12. [Monitoring & Alerting](#monitoring-alerting)
13. [Escalation Procedures](#escalation-procedures)
14. [On-Call Guide](#on-call-guide)
15. [Common Operational Tasks](#common-operational-tasks)
16. [Quick Reference](#quick-reference)

---

## Overview

### System Architecture

The UPR system is a production-grade lead enrichment and multi-agent decision platform deployed on Google Cloud Platform.

**Key Components**:
- **Web Service**: Cloud Run (`upr-web-service`) - Node.js API server
- **Database**: Cloud SQL PostgreSQL (`upr-postgres`) @ 34.121.0.240:5432
- **Agent Hub**: Centralized multi-agent orchestration system
- **APIs**: Apollo, Hunter, OpenAI, Anthropic for enrichment
- **Caching**: Redis for pattern intelligence and performance

**GCP Project**: `applied-algebra-474804-e6`
**Region**: `us-central1`
**Production URL**: https://upr-web-service-191599223867.us-central1.run.app

### SLA Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **Uptime** | 99.5% | < 99% |
| **API Response Time (P95)** | < 500ms | > 2s |
| **Database Response Time** | < 100ms | > 500ms |
| **Error Rate** | < 0.5% | > 2% |
| **Health Check Success** | 100% | < 95% |

### Service Tiers

**P0 (Critical)**: Complete system outage, data loss, security breach
**P1 (High)**: Degraded performance, partial outage, high error rate
**P2 (Medium)**: Minor issues, no user impact, single feature down
**P3 (Low)**: Cosmetic issues, documentation, optimization

---

## Daily Operations

### Morning Checks (10 minutes)

Run this routine every morning at 9:00 AM UTC:

```bash
# 1. Check all services health
./scripts/health-check.sh

# Expected output:
# ✅ upr-web-service: HEALTHY
# ✅ upr-postgres: RUNNABLE
```

```bash
# 2. Review error logs from past 24 hours
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=100 \
  --log-filter='severity>=ERROR AND timestamp>="'$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ')'"' \
  --project=applied-algebra-474804-e6

# If errors > 10, investigate immediately
```

```bash
# 3. Check database connection pool
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Active connections
SELECT
  COUNT(*) as active_connections,
  MAX(now() - query_start) as longest_running_query
FROM pg_stat_activity
WHERE datname = 'upr_production' AND state = 'active';

-- Should be: active_connections < 80, longest_running_query < 30s
EOF
```

```bash
# 4. Validate critical endpoints
SERVICE_URL="https://upr-web-service-191599223867.us-central1.run.app"

# Health check
curl -s "$SERVICE_URL/health" | jq '.status' # Should be "ok"

# Database connectivity
curl -s "$SERVICE_URL/ready" | jq '.database' # Should be "connected"

# API endpoint (requires auth)
curl -s "$SERVICE_URL/api/companies?limit=1" | jq '.ok' # Should be true
```

```bash
# 5. Check recent agent decisions (data quality)
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
SELECT
  COUNT(*) as decisions_last_24h,
  AVG(confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE confidence < 0.6) as low_confidence_count
FROM agent_decisions
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Should be: decisions_last_24h > 0, avg_confidence > 0.7, low_confidence < 10%
EOF
```

### Daily Checklist

- [ ] All services healthy (health-check.sh passes)
- [ ] Error count in logs < 10 in past 24h
- [ ] Database connections < 80
- [ ] Critical endpoints responding < 500ms
- [ ] No stuck/long-running queries (> 30s)
- [ ] Agent decisions being recorded (> 0 in 24h)
- [ ] No security alerts in GCP Console
- [ ] Redis cache responding (if configured)

### Evening Checks (5 minutes)

```bash
# 1. Check today's API usage and costs
./scripts/cost-summary.sh

# 2. Verify automated backups completed
gcloud sql backups list \
  --instance=upr-postgres \
  --limit=1 \
  --project=applied-algebra-474804-e6 \
  --format="table(id,windowStartTime,status)"

# Status should be "SUCCESSFUL", windowStartTime should be today

# 3. Review Cloud Run metrics
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format="value(status.traffic[0].percent)"

# Should be 100 (all traffic to latest revision)
```

---

## Weekly Maintenance

### Monday: Performance Review (30 minutes)

```bash
# 1. Analyze slow queries from past week
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Enable pg_stat_statements if not already
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 slowest queries
SELECT
  substring(query, 1, 100) as query_preview,
  calls,
  total_exec_time / 1000 as total_time_sec,
  mean_exec_time as avg_time_ms,
  max_exec_time as max_time_ms,
  stddev_exec_time as stddev_ms
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- Queries > 100ms
ORDER BY mean_exec_time DESC
LIMIT 10;
EOF

# Document any queries > 500ms avg for optimization
```

```bash
# 2. Check database growth rate
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Table sizes and growth
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size,
  n_live_tup as row_count,
  n_dead_tup as dead_rows
FROM pg_tables
JOIN pg_stat_user_tables USING (schemaname, tablename)
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
EOF

# If dead_rows > 20% of live rows, schedule VACUUM
```

```bash
# 3. Review Cloud Run performance metrics
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies"
    AND resource.labels.service_name="upr-web-service"' \
  --project=applied-algebra-474804-e6 \
  --format="table(metric.type,points[0].value.distributionValue.mean)"

# Document P95 latency trends
```

### Tuesday: Backup Verification (20 minutes)

```bash
# 1. List all backups
gcloud sql backups list \
  --instance=upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="table(id,windowStartTime,status,type)"

# Verify: 7 automated backups present (daily retention)

# 2. Test backup restore (to temporary instance)
# WARNING: Only do this in non-production hours

# Create test instance from latest backup
LATEST_BACKUP=$(gcloud sql backups list \
  --instance=upr-postgres \
  --limit=1 \
  --format="value(id)" \
  --project=applied-algebra-474804-e6)

echo "Latest backup: $LATEST_BACKUP"

# Restore to new instance (monthly drill)
# gcloud sql instances create upr-postgres-test \
#   --backup=$LATEST_BACKUP \
#   --project=applied-algebra-474804-e6

# 3. Create manual backup for weekly archive
./scripts/backup-db.sh

# Backup file should be in ./backups/upr_db_backup_YYYYMMDD_HHMMSS.sql.gz
```

### Wednesday: Security Audit (30 minutes)

```bash
# 1. Check for exposed secrets in logs
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=upr-web-service \
  AND (textPayload=~\"password\" OR textPayload=~\"secret\" OR textPayload=~\"api_key\" OR textPayload=~\"token\")" \
  --limit=20 \
  --project=applied-algebra-474804-e6 \
  --format="table(timestamp,textPayload)"

# If any results: IMMEDIATE remediation required
```

```bash
# 2. Review database user permissions
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Check user privileges
SELECT
  usename,
  usesuper,
  usecreatedb,
  usecreateerole,
  valuntil as password_expires
FROM pg_user
ORDER BY usename;

-- Check table permissions
SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.table_privileges
WHERE grantee IN ('upr_app', 'postgres')
  AND table_schema = 'public'
ORDER BY grantee, table_name;
EOF
```

```bash
# 3. Review IAM permissions
gcloud projects get-iam-policy applied-algebra-474804-e6 \
  --flatten="bindings[].members" \
  --format="table(bindings.role,bindings.members)" \
  --filter="bindings.members:*@applied-algebra-474804-e6.iam.gserviceaccount.com"

# Verify only authorized service accounts have access
```

```bash
# 4. Check Cloud SQL authorized networks
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="table(settings.ipConfiguration.authorizedNetworks)"

# Should only show necessary IP ranges (or empty if using Cloud SQL Proxy)
```

### Thursday: API Key Management (15 minutes)

```bash
# 1. Check API key rotation dates
gcloud secrets list \
  --project=applied-algebra-474804-e6 \
  --format="table(name,createTime)" \
  --filter="name:(OPENAI_API_KEY OR APOLLO_API_KEY OR HUNTER_API_KEY OR SERPAPI_KEY)"

# Keys should be rotated every 90 days

# 2. Review API usage and rate limits (from logs)
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=upr-web-service \
  AND (textPayload=~\"rate limit\" OR textPayload=~\"quota exceeded\")" \
  --limit=50 \
  --project=applied-algebra-474804-e6

# If rate limit errors, consider increasing quotas or reducing usage
```

```bash
# 3. Check external API health
SERVICE_URL="https://upr-web-service-191599223867.us-central1.run.app"

# Test Apollo API (if integrated)
# curl -s "$SERVICE_URL/api/test-apollo" | jq '.status'

# Test OpenAI API
# curl -s "$SERVICE_URL/api/test-openai" | jq '.status'
```

### Friday: Data Quality Review (30 minutes)

```bash
# 1. Check lead quality metrics
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Lead score distribution
SELECT
  grade,
  COUNT(*) as count,
  ROUND(AVG(lead_score), 0) as avg_score,
  ROUND(AVG(q_score), 0) as avg_quality,
  ROUND(AVG(engagement_score), 0) as avg_engagement,
  ROUND(AVG(fit_score), 0) as avg_fit,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM lead_scores
WHERE calculated_at > NOW() - INTERVAL '7 days'
GROUP BY grade
ORDER BY grade;

-- Should have healthy distribution: A+/A (20%), B (40%), C (30%), D/F (10%)
EOF
```

```bash
# 2. Check agent decision quality
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Agent performance by tool
SELECT
  tool_name,
  COUNT(*) as total_decisions,
  AVG(confidence) as avg_confidence,
  AVG(execution_time_ms) as avg_latency_ms,
  COUNT(*) FILTER (WHERE confidence < 0.60) as low_confidence,
  COUNT(*) FILTER (WHERE confidence >= 0.90) as high_confidence
FROM agent_decisions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tool_name
ORDER BY total_decisions DESC;

-- avg_confidence should be > 0.70, avg_latency_ms < 500
EOF
```

```bash
# 3. Check email pattern discovery effectiveness
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Pattern success rate
SELECT
  COUNT(*) as total_patterns,
  AVG(confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE confidence >= 0.8) as high_confidence_patterns,
  COUNT(*) FILTER (WHERE last_verified > NOW() - INTERVAL '7 days') as recently_verified
FROM email_patterns;

-- avg_confidence should be > 0.6, high_confidence > 50%
EOF
```

### Weekly Checklist

- [ ] Performance review completed (slow queries documented)
- [ ] Database growth tracked (tables > 80% capacity flagged)
- [ ] Backup verification passed (7 backups present, restore tested monthly)
- [ ] Security audit clean (no exposed secrets, permissions correct)
- [ ] API keys reviewed (rotation scheduled if needed)
- [ ] Data quality metrics healthy (lead scores, agent decisions)
- [ ] Weekly cost report reviewed (`./scripts/weekly-cost-report.sh`)
- [ ] Incident log updated (any issues from past week)

---

## Monthly Reviews

### First Monday: Capacity Planning (1 hour)

```bash
# 1. Review database storage usage
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="table(settings.dataDiskSizeGb,settings.dataDiskType)"

# Check current usage
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
SELECT
  pg_database.datname,
  pg_size_pretty(pg_database_size(pg_database.datname)) AS size,
  pg_database_size(pg_database.datname) as size_bytes
FROM pg_database
WHERE datname = 'upr_production';
EOF

# If size > 70% of allocated disk, plan increase
```

```bash
# 2. Calculate monthly growth rate
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Monthly lead growth
SELECT
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as leads_added
FROM hr_leads
WHERE created_at > NOW() - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month;

-- Estimate: leads_per_month * avg_lead_size * 1.2 (indexes/overhead)
EOF
```

```bash
# 3. Review Cloud Run scaling patterns
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/instance_count"
    AND resource.labels.service_name="upr-web-service"' \
  --project=applied-algebra-474804-e6 \
  --format="table(metric.type,points[0].value.int64Value)"

# If frequently hitting max instances, plan increase
```

**Capacity Planning Worksheet**:

| Resource | Current | Peak Usage | Threshold | Action Needed |
|----------|---------|------------|-----------|---------------|
| Database Storage | __GB | __% | 70% | Increase if needed |
| Database Connections | __ | __ | 80 | Tune pool settings |
| Cloud Run Instances | __ | __ | Max-1 | Increase max if needed |
| Memory per Instance | 2Gi | __% | 80% | Increase if needed |
| CPU per Instance | 2 vCPU | __% | 70% | Increase if needed |

### Second Monday: Security Hardening (1 hour)

```bash
# 1. Rotate credentials (quarterly)
# Generate new admin password
NEW_ADMIN_PASS=$(openssl rand -base64 32)
echo "New admin password: $NEW_ADMIN_PASS"

# Update secret
echo -n "$NEW_ADMIN_PASS" | gcloud secrets versions add UPR_ADMIN_PASS \
  --data-file=- \
  --project=applied-algebra-474804-e6

# Verify
gcloud secrets versions list UPR_ADMIN_PASS \
  --project=applied-algebra-474804-e6 \
  --limit=3

# Test login with new password
SERVICE_URL="https://upr-web-service-191599223867.us-central1.run.app"
ADMIN_USER=$(gcloud secrets versions access latest --secret=UPR_ADMIN_USER --project=applied-algebra-474804-e6)

curl -X POST "$SERVICE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$NEW_ADMIN_PASS\"}" | jq
```

```bash
# 2. Review and disable old secret versions
for SECRET in UPR_ADMIN_PASS JWT_SECRET DATABASE_URL OPENAI_API_KEY; do
  echo "=== $SECRET ==="
  gcloud secrets versions list $SECRET \
    --project=applied-algebra-474804-e6 \
    --format="table(name,state,createTime)"

  # Disable versions older than 90 days (keep last 3)
  # gcloud secrets versions disable VERSION --secret=$SECRET --project=applied-algebra-474804-e6
done
```

```bash
# 3. Audit database access logs
gcloud logging read "resource.type=cloudsql_database \
  AND protoPayload.authenticationInfo.principalEmail!=\"\" \
  AND timestamp>=\"$(date -u -d '30 days ago' '+%Y-%m-%dT%H:%M:%SZ')\"" \
  --limit=100 \
  --project=applied-algebra-474804-e6 \
  --format="table(timestamp,protoPayload.authenticationInfo.principalEmail,protoPayload.methodName)"

# Flag any unexpected access
```

```bash
# 4. Review SSL/TLS certificates (Cloud Run handles automatically)
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format="value(status.url)"

# Test HTTPS connection
curl -v "https://upr-web-service-191599223867.us-central1.run.app/health" 2>&1 | grep -i "SSL"
```

### Third Monday: Cost Optimization (45 minutes)

```bash
# 1. Review monthly costs
./scripts/check-gcp-costs.sh

# Output shows:
# - Cloud Run costs
# - Cloud SQL costs
# - Storage costs
# - Network egress
```

```bash
# 2. Identify cost optimization opportunities
# Check Cloud Run instance utilization
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format="table(spec.template.spec.containers[0].resources.limits.cpu,
                   spec.template.spec.containers[0].resources.limits.memory,
                   spec.template.spec.containerConcurrency,
                   spec.template.spec.containers[0].env)"

# If avg CPU < 30%, consider reducing CPU allocation
# If avg memory < 40%, consider reducing memory
```

```bash
# 3. Review database machine type
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="table(settings.tier,settings.dataDiskSizeGb,settings.pricingPlan)"

# Check usage
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Peak connections
SELECT MAX(numbackends) as max_connections
FROM pg_stat_database
WHERE datname = 'upr_production';
EOF

# If max_connections < 50% of tier capacity, consider downgrade
```

```bash
# 4. Clean up old data (archive old records)
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Archive agent decisions older than 90 days
BEGIN;

CREATE TABLE IF NOT EXISTS agent_decisions_archive (LIKE agent_decisions INCLUDING ALL);

INSERT INTO agent_decisions_archive
SELECT * FROM agent_decisions
WHERE created_at < NOW() - INTERVAL '90 days';

-- Uncomment to delete after verification
-- DELETE FROM agent_decisions WHERE created_at < NOW() - INTERVAL '90 days';

COMMIT;

-- Check space reclaimed
VACUUM ANALYZE agent_decisions;
EOF
```

### Fourth Monday: Disaster Recovery Drill (1-2 hours)

**WARNING**: Schedule this during low-traffic period (weekends recommended).

```bash
# 1. Document current state
echo "=== Pre-DR Drill State ===" > dr-drill-$(date +%Y%m%d).txt
echo "Date: $(date)" >> dr-drill-$(date +%Y%m%d).txt

# Get current revision
gcloud run revisions list \
  --service=upr-web-service \
  --region=us-central1 \
  --limit=1 \
  --project=applied-algebra-474804-e6 >> dr-drill-$(date +%Y%m%d).txt

# Database stats
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" \
  -c "SELECT COUNT(*) FROM hr_leads;" >> dr-drill-$(date +%Y%m%d).txt
```

```bash
# 2. Create backup
./scripts/backup-db.sh

# Note backup file name
BACKUP_FILE=$(ls -t ./backups/upr_db_backup_*.sql.gz | head -1)
echo "Backup: $BACKUP_FILE" >> dr-drill-$(date +%Y%m%d).txt
```

```bash
# 3. Simulate service failure (traffic routing)
# Route traffic to canary (simulated old version)
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=LATEST=50 \
  --project=applied-algebra-474804-e6

# Wait 2 minutes and verify partial traffic
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --format="table(status.traffic)" \
  --project=applied-algebra-474804-e6
```

```bash
# 4. Restore to 100% traffic (recovery)
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=LATEST=100 \
  --project=applied-algebra-474804-e6

# Measure recovery time
echo "Recovery completed at: $(date)" >> dr-drill-$(date +%Y%m%d).txt
```

```bash
# 5. Test database restore (to temporary instance - OPTIONAL)
# This creates a test instance from backup
# gcloud sql instances create upr-postgres-dr-test \
#   --backup=$(LATEST_BACKUP_ID) \
#   --project=applied-algebra-474804-e6

# After verification, delete test instance
# gcloud sql instances delete upr-postgres-dr-test --project=applied-algebra-474804-e6
```

**Document results**:
- Time to detect failure: ____ seconds
- Time to start recovery: ____ seconds
- Total recovery time: ____ seconds (Target: < 5 minutes)
- Data loss: ____ records (Target: 0)
- Issues encountered: ____
- Lessons learned: ____

### Monthly Checklist

- [ ] Capacity planning completed (database, compute, network)
- [ ] Growth projections updated (6-month forecast)
- [ ] Credentials rotated (admin password, API keys if due)
- [ ] Old secret versions disabled (> 90 days)
- [ ] Cost optimization review completed
- [ ] Archival of old data completed (> 90 days)
- [ ] Disaster recovery drill executed successfully
- [ ] DR drill results documented (RTO/RPO met)
- [ ] Runbook updates applied (based on lessons learned)

---

## Incident Response Playbooks

### Decision Tree: Service Issues

```
┌─────────────────────────────────────┐
│ Service Not Responding / Down       │
└────────────────┬────────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │ Check Health  │
         │ Endpoint      │
         └───────┬───────┘
                 │
         ┌───────┴───────┐
         │               │
    ┌────▼────┐    ┌────▼────┐
    │ 503     │    │ Timeout │
    │ Error   │    │ / No    │
    │         │    │ Response│
    └────┬────┘    └────┬────┘
         │              │
         ▼              ▼
  ┌──────────────┐  ┌──────────────┐
  │ Check Cloud  │  │ Check DB     │
  │ Run Status   │  │ Connectivity │
  └──────┬───────┘  └──────┬───────┘
         │                 │
         ▼                 ▼
  ┌──────────────┐  ┌──────────────┐
  │ Service Down │  │ DB Down or   │
  │ → Restart    │  │ Unreachable  │
  │ or Rollback  │  │ → Check SQL  │
  └──────────────┘  └──────────────┘
```

### Playbook 1: Service Unavailable (P0)

**Symptoms**:
- Health check returns 503
- Users cannot access application
- GCP Console shows "Revision failed"

**Immediate Actions** (< 5 minutes):

```bash
# 1. Check service status
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format="yaml(status.conditions)"

# Look for: status: "False", reason: "RevisionFailed"
```

```bash
# 2. Check recent logs for errors
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=50 \
  --log-filter='severity>=ERROR' \
  --project=applied-algebra-474804-e6

# Common errors:
# - "Cannot connect to database" → Database issue
# - "Out of memory" → Resource issue
# - "Missing environment variable" → Configuration issue
```

```bash
# 3. Check database connectivity
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="value(state)"

# Should be: RUNNABLE

# If not RUNNABLE, escalate to P0 database incident
```

**Recovery Actions**:

**Option A**: Recent deployment caused issue (most common)

```bash
# List recent revisions
gcloud run revisions list \
  --service=upr-web-service \
  --region=us-central1 \
  --limit=5 \
  --project=applied-algebra-474804-e6

# Rollback to previous working revision
PREVIOUS_REVISION="upr-web-service-00404-xyz"  # Use actual revision ID

gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=$PREVIOUS_REVISION=100 \
  --project=applied-algebra-474804-e6

# Recovery time: 30-60 seconds
```

**Option B**: Configuration/secrets issue

```bash
# Check if secrets are accessible
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --format="yaml(spec.template.spec.containers[0].env)" \
  --project=applied-algebra-474804-e6

# Verify critical secrets
gcloud secrets versions access latest --secret=DATABASE_URL --project=applied-algebra-474804-e6

# If secrets missing, redeploy with secrets
./scripts/deploy-server.sh
```

**Option C**: Resource exhaustion

```bash
# Increase resources temporarily
gcloud run services update upr-web-service \
  --region=us-central1 \
  --memory=4Gi \
  --cpu=4 \
  --max-instances=10 \
  --project=applied-algebra-474804-e6

# Recovery time: 2-3 minutes
```

**Verification**:

```bash
# Test health endpoint
curl "https://upr-web-service-191599223867.us-central1.run.app/health"

# Should return: {"status":"ok",...}

# Test critical endpoint
curl "https://upr-web-service-191599223867.us-central1.run.app/ready"

# Should return: {"status":"ready","database":"connected"}
```

**Post-Incident**:
1. Document root cause
2. Update monitoring/alerts to detect earlier
3. Create preventive measures
4. Update this runbook

---

### Playbook 2: High Error Rate (P1)

**Symptoms**:
- Error rate > 2% in logs
- Users reporting intermittent failures
- GCP metrics show increased 5xx responses

**Detection**:

```bash
# Count errors in last hour
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=1000 \
  --log-filter='severity>=ERROR AND timestamp>="'$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ')'"' \
  --project=applied-algebra-474804-e6 | wc -l

# If count > 20, investigate
```

**Investigation**:

```bash
# 1. Identify error patterns
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=100 \
  --log-filter='severity>=ERROR' \
  --project=applied-algebra-474804-e6 | \
  grep -oE "Error: [^\"]*" | sort | uniq -c | sort -rn

# Common patterns:
# - Database connection errors → Check connections
# - API timeout errors → Check external APIs
# - Out of memory → Increase resources
```

```bash
# 2. Check database for issues
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Check for long-running queries
SELECT
  pid,
  now() - query_start as duration,
  state,
  substring(query, 1, 100) as query
FROM pg_stat_activity
WHERE state != 'idle'
  AND now() - query_start > interval '10 seconds'
ORDER BY duration DESC;

-- Check for locks
SELECT
  l.pid,
  l.mode,
  l.granted,
  a.query
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE NOT l.granted;
EOF
```

**Remediation**:

**If database connection exhaustion**:

```bash
# Check connection count
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" \
  -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='upr_production';"

# If > 80, kill idle connections
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'upr_production'
  AND state = 'idle'
  AND now() - state_change > interval '10 minutes';
EOF

# Tune connection pool in application (requires redeployment)
```

**If external API rate limiting**:

```bash
# Check for rate limit errors
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=100 \
  --log-filter='textPayload=~"rate limit"' \
  --project=applied-algebra-474804-e6

# Temporary fix: Reduce request rate
# Long-term: Implement backoff, queue, or upgrade API plan
```

**If memory/CPU issues**:

```bash
# Scale up temporarily
gcloud run services update upr-web-service \
  --region=us-central1 \
  --memory=4Gi \
  --cpu=4 \
  --max-instances=10 \
  --project=applied-algebra-474804-e6
```

---

### Playbook 3: Database Performance Degradation (P1)

**Symptoms**:
- Queries taking > 5 seconds
- Database CPU > 80%
- Users reporting slow page loads

**Investigation**:

```bash
# 1. Check database CPU and memory
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="table(settings.tier,databaseVersion)"

# 2. Identify slow queries
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
SELECT
  pid,
  now() - query_start as duration,
  state,
  wait_event,
  substring(query, 1, 200) as query
FROM pg_stat_activity
WHERE state = 'active'
  AND datname = 'upr_production'
ORDER BY duration DESC
LIMIT 10;
EOF
```

```bash
# 3. Check for table bloat
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
SELECT
  schemaname,
  tablename,
  n_dead_tup,
  n_live_tup,
  ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC
LIMIT 10;
EOF
```

**Immediate Actions**:

```bash
# 1. Kill long-running queries (if > 5 minutes)
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'upr_production'
  AND state = 'active'
  AND now() - query_start > interval '5 minutes';
EOF
```

```bash
# 2. Run VACUUM ANALYZE on bloated tables
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
VACUUM ANALYZE agent_decisions;
VACUUM ANALYZE hr_leads;
VACUUM ANALYZE kb_companies;
EOF
```

```bash
# 3. Scale up database (if CPU > 80%)
gcloud sql instances patch upr-postgres \
  --tier=db-custom-4-15360 \
  --project=applied-algebra-474804-e6

# This causes brief downtime (30-60 seconds)
```

**Long-term fixes**:
1. Add missing indexes
2. Optimize queries
3. Implement query caching
4. Schedule regular VACUUM

---

### Playbook 4: API Rate Limit Exceeded (P2)

**Symptoms**:
- External API returning 429 (Too Many Requests)
- Enrichment jobs failing
- Logs showing "rate limit exceeded"

**Investigation**:

```bash
# Check which API is rate-limited
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=100 \
  --log-filter='textPayload=~"429"' \
  --project=applied-algebra-474804-e6

# Look for: Apollo, Hunter, OpenAI, SerpAPI
```

```bash
# Check API usage in database
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Enrichment job rate
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  status,
  COUNT(*) as count
FROM enrichment_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), status
ORDER BY hour DESC;
EOF
```

**Remediation**:

**Short-term**:
```bash
# Pause enrichment jobs temporarily
# (Application-level feature flag if available)

# Or reduce RADAR budget
# Update MAX_RUN_BUDGET_USD secret to lower value
echo -n "1.00" | gcloud secrets versions add MAX_RUN_BUDGET_USD \
  --data-file=- \
  --project=applied-algebra-474804-e6
```

**Long-term**:
1. Implement request queuing with exponential backoff
2. Use API key rotation if multiple keys available
3. Upgrade API plan if usage consistently high
4. Cache API responses to reduce requests

---

### Playbook 5: Data Corruption Detected (P0)

**Symptoms**:
- Duplicate records appearing
- Foreign key violations
- Data integrity check failures

**CRITICAL**: Stop all writes immediately

```bash
# 1. Scale down to prevent further damage
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=0 \
  --project=applied-algebra-474804-e6
```

```bash
# 2. Create emergency backup NOW
./scripts/backup-db.sh

# Verify backup created
ls -lh ./backups/upr_db_backup_*.sql.gz | tail -1
```

```bash
# 3. Assess corruption extent
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Check for duplicate leads
SELECT contact_email, COUNT(*) as count
FROM hr_leads
GROUP BY contact_email
HAVING COUNT(*) > 1
LIMIT 20;

-- Check for orphaned records
SELECT COUNT(*) as orphaned_leads
FROM hr_leads hl
LEFT JOIN kb_companies c ON hl.company_id = c.id
WHERE c.id IS NULL;

-- Check for foreign key violations
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE contype = 'f';
EOF
```

**Recovery**:

**Option A**: Minor corruption (< 1% of data)
```bash
# Fix duplicates manually
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
BEGIN;

-- Delete duplicates, keeping oldest
DELETE FROM hr_leads
WHERE id NOT IN (
  SELECT MIN(id)
  FROM hr_leads
  GROUP BY contact_email
);

-- Fix orphaned records
DELETE FROM hr_leads
WHERE company_id NOT IN (SELECT id FROM kb_companies);

COMMIT;
EOF
```

**Option B**: Major corruption (> 5% of data)
```bash
# Restore from latest backup
LATEST_BACKUP=$(ls -t ./backups/upr_db_backup_*.sql.gz | head -1)

# Decompress
gunzip -c "$LATEST_BACKUP" > /tmp/restore.sql

# Restore (WARNING: This overwrites database)
pg_restore \
  -h 34.121.0.240 \
  -U upr_app \
  -d upr_production \
  --clean \
  --if-exists \
  /tmp/restore.sql

# Clean up
rm /tmp/restore.sql
```

**After recovery**:
```bash
# Resume service
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=5 \
  --project=applied-algebra-474804-e6

# Verify data integrity
./scripts/testing/dataQualityValidator.js
```

---

## Performance Tuning

### Database Query Optimization

**Identify slow queries**:

```bash
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 20 slowest queries
SELECT
  substring(query, 1, 150) as query_preview,
  calls,
  total_exec_time / 1000 as total_time_sec,
  mean_exec_time as avg_time_ms,
  max_exec_time as max_time_ms,
  rows
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;
EOF
```

**Analyze query execution plan**:

```sql
-- Example: Analyze slow lead query
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT
  hl.id,
  hl.contact_name,
  hl.contact_email,
  c.name as company_name,
  ls.lead_score,
  ls.grade
FROM hr_leads hl
JOIN kb_companies c ON hl.company_id = c.id
LEFT JOIN lead_scores ls ON hl.id = ls.opportunity_id
WHERE ls.lead_score > 5000
ORDER BY ls.lead_score DESC
LIMIT 100;

-- Look for:
-- - Seq Scan (should be Index Scan)
-- - High "cost" values
-- - "Buffers: read=" high numbers (disk I/O)
```

**Add missing indexes**:

```sql
-- Index for lead_score filtering
CREATE INDEX CONCURRENTLY idx_lead_scores_high_value
ON lead_scores(lead_score DESC)
WHERE lead_score > 5000;

-- Composite index for common queries
CREATE INDEX CONCURRENTLY idx_hr_leads_company_created
ON hr_leads(company_id, created_at DESC);

-- Index for agent decisions by tool
CREATE INDEX CONCURRENTLY idx_agent_decisions_tool_created
ON agent_decisions(tool_name, created_at DESC);
```

**Check index usage**:

```sql
-- Unused indexes (candidates for removal)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE idx_scan < 10  -- Less than 10 scans
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Drop unused index (carefully!)
-- DROP INDEX CONCURRENTLY idx_unused_index;
```

### Connection Pool Tuning

Current settings in `/Users/skc/DataScience/upr/utils/db.js`:

```javascript
// Recommended production settings
{
  max: 20,                         // Max connections (Cloud SQL limit: 100)
  min: 2,                          // Keep 2 connections warm
  idleTimeoutMillis: 30000,        // Close idle after 30s
  connectionTimeoutMillis: 10000,  // 10s timeout to acquire
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
}
```

**Monitor connection usage**:

```sql
SELECT
  COUNT(*) as total_connections,
  COUNT(*) FILTER (WHERE state = 'active') as active,
  COUNT(*) FILTER (WHERE state = 'idle') as idle,
  COUNT(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx
FROM pg_stat_activity
WHERE datname = 'upr_production';

-- Optimal: active < 20, idle < 10, idle_in_tx = 0
```

**If connections exhausted**:

```bash
# Option 1: Increase pool size (if < 80% of Cloud SQL limit)
# Edit db.js, increase max to 30

# Option 2: Increase Cloud SQL max_connections
gcloud sql instances patch upr-postgres \
  --database-flags max_connections=200 \
  --project=applied-algebra-474804-e6

# Option 3: Kill idle connections
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'upr_production'
  AND state = 'idle'
  AND now() - state_change > interval '15 minutes';
EOF
```

### Cloud Run Scaling Tuning

**Current configuration**:
- Min instances: 0 (cost optimization)
- Max instances: 5 (safety limit)
- Concurrency: 80 (requests per instance)
- Memory: 2Gi
- CPU: 2 vCPU

**Adjust for performance**:

```bash
# For better performance (reduced cold starts)
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=1 \
  --max-instances=10 \
  --concurrency=100 \
  --project=applied-algebra-474804-e6
```

**For cost optimization**:

```bash
# During low-traffic periods
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=3 \
  --concurrency=80 \
  --project=applied-algebra-474804-e6
```

**Monitor scaling patterns**:

```bash
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/instance_count"
    AND resource.labels.service_name="upr-web-service"' \
  --project=applied-algebra-474804-e6 \
  --format="table(metric.type,points[].value.int64Value)" | \
  sort | uniq -c

# If frequently hitting max, increase max-instances
```

### Caching Strategy

**Redis configuration** (if enabled):

```bash
# Check Redis connection
REDIS_URL=$(gcloud secrets versions access latest --secret=REDIS_URL --project=applied-algebra-474804-e6)

redis-cli -u "$REDIS_URL" PING
# Should return: PONG
```

**Monitor cache hit rate**:

```bash
redis-cli -u "$REDIS_URL" INFO stats | grep -E "keyspace_hits|keyspace_misses"

# Calculate hit rate: hits / (hits + misses)
# Target: > 80%
```

**Clear cache if needed**:

```bash
# Clear all cache
redis-cli -u "$REDIS_URL" FLUSHDB

# Clear specific pattern
redis-cli -u "$REDIS_URL" --scan --pattern "cache:email:*" | xargs redis-cli -u "$REDIS_URL" DEL
```

---

## Capacity Planning

### 6-Month Growth Projections

**Calculate current growth rate**:

```sql
-- Monthly lead growth
WITH monthly_stats AS (
  SELECT
    DATE_TRUNC('month', created_at) as month,
    COUNT(*) as leads_added,
    pg_size_pretty(pg_total_relation_size('hr_leads')) as table_size
  FROM hr_leads
  WHERE created_at > NOW() - INTERVAL '6 months'
  GROUP BY DATE_TRUNC('month', created_at)
)
SELECT
  month,
  leads_added,
  table_size,
  LAG(leads_added) OVER (ORDER BY month) as prev_month,
  ROUND((leads_added - LAG(leads_added) OVER (ORDER BY month)) * 100.0 /
        NULLIF(LAG(leads_added) OVER (ORDER BY month), 0), 2) as growth_pct
FROM monthly_stats
ORDER BY month DESC;

-- Estimate 6-month projection
SELECT
  AVG(leads_added) as avg_monthly_leads,
  AVG(leads_added) * 6 as projected_6mo_leads
FROM monthly_stats;
```

### Resource Requirements Worksheet

**Database Storage**:

| Component | Current | 6-Mo Projection | Action Threshold | Plan |
|-----------|---------|-----------------|------------------|------|
| Total DB Size | __GB | __GB | 70% of allocated | Schedule upgrade |
| hr_leads table | __GB | __GB | __GB | Add partitioning |
| agent_decisions | __GB | __GB | __GB | Archive old data |
| kb_companies | __GB | __GB | __GB | Normal growth |

```bash
# Check current database size
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
SELECT
  pg_size_pretty(pg_database_size('upr_production')) as total_size,
  pg_database_size('upr_production') / 1024 / 1024 / 1024 as size_gb;
EOF

# Check allocated storage
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="value(settings.dataDiskSizeGb)"
```

**Cloud Run Scaling**:

| Metric | Current | Peak | Target | Action |
|--------|---------|------|--------|--------|
| Avg instances | __ | __ | __ | Adjust min |
| Max instances hit | __% | 100% | < 80% | Increase max |
| Avg CPU usage | __% | __% | 50-70% | Optimal |
| Avg memory usage | __% | __% | 60-80% | Optimal |

```bash
# Get Cloud Run metrics
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format="table(metadata.name,spec.template.spec.containers[0].resources)"
```

**Cost Projections**:

```bash
# Current monthly costs
./scripts/check-gcp-costs.sh

# Calculate per-lead cost
# Total monthly cost / leads processed = $__/lead

# Project 6-month costs
# Current monthly * 6 * (1 + growth_rate)
```

---

## API Management

### External API Rate Limits

| API | Rate Limit | Quota | Cost per Call | Monitor |
|-----|------------|-------|---------------|---------|
| **OpenAI** | 60 req/min | 10,000/day | $0.002 | OPENAI_API_KEY |
| **Apollo.io** | 100 req/hour | 2,000/month | $0.10 | APOLLO_API_KEY |
| **Hunter.io** | 10 req/min | 500/month | $0.05 | HUNTER_API_KEY |
| **SerpAPI** | 100 req/hour | 5,000/month | $0.01 | SERPAPI_KEY |

### Checking API Usage

```bash
# Check API calls in logs (last 24 hours)
for API in openai apollo hunter serpapi; do
  echo "=== $API Usage ==="
  gcloud run services logs read upr-web-service \
    --region=us-central1 \
    --log-filter="textPayload=~\"$API\"" \
    --format="table(timestamp)" \
    --project=applied-algebra-474804-e6 | wc -l
done
```

```bash
# Check enrichment job volume
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
SELECT
  DATE(created_at) as date,
  COUNT(*) as jobs,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM enrichment_jobs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
EOF
```

### API Key Rotation

**Every 90 days, rotate API keys**:

```bash
# 1. Obtain new API key from provider
NEW_OPENAI_KEY="sk-..."

# 2. Update secret in GCP
echo -n "$NEW_OPENAI_KEY" | gcloud secrets versions add OPENAI_API_KEY \
  --data-file=- \
  --project=applied-algebra-474804-e6

# 3. Verify new version created
gcloud secrets versions list OPENAI_API_KEY \
  --project=applied-algebra-474804-e6 \
  --limit=3

# 4. Restart Cloud Run to pick up new secret
gcloud run services update upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6

# 5. Test API with new key
curl "https://upr-web-service-191599223867.us-central1.run.app/health"

# 6. Disable old secret version after 24h verification
OLD_VERSION="2"
gcloud secrets versions disable $OLD_VERSION \
  --secret=OPENAI_API_KEY \
  --project=applied-algebra-474804-e6
```

### Rate Limit Handling

**Application-level rate limits** (enforced by middleware):

| Endpoint Category | Rate Limit | Window |
|-------------------|------------|--------|
| General API | 100 requests | 15 minutes |
| Auth endpoints | 5 requests | 15 minutes |
| Enrichment | 20 requests | 15 minutes |
| RADAR | 5 requests | 1 hour |

**Check rate limit violations**:

```bash
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --log-filter='textPayload=~"Rate limit exceeded"' \
  --limit=50 \
  --project=applied-algebra-474804-e6

# If frequent violations, review client usage patterns
```

---

## Database Operations

### Regular Maintenance Tasks

**Daily**: Automatic via PostgreSQL autovacuum (enabled by default)

**Weekly**: Manual VACUUM ANALYZE for high-churn tables

```bash
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- VACUUM high-activity tables
VACUUM ANALYZE agent_decisions;
VACUUM ANALYZE enrichment_jobs;
VACUUM ANALYZE hr_leads;
EOF
```

**Monthly**: REINDEX to rebuild indexes

```bash
# Schedule during low-traffic window (2-4 AM UTC)
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Reindex specific tables
REINDEX TABLE CONCURRENTLY agent_decisions;
REINDEX TABLE CONCURRENTLY lead_scores;

-- Or reindex entire database (requires exclusive lock, use cautiously)
-- REINDEX DATABASE upr_production;
EOF
```

### Database Monitoring Queries

**Check database health**:

```sql
-- Connection stats
SELECT
  datname,
  numbackends as connections,
  xact_commit as commits,
  xact_rollback as rollbacks,
  blks_read as disk_reads,
  blks_hit as cache_hits,
  ROUND(blks_hit * 100.0 / NULLIF(blks_hit + blks_read, 0), 2) as cache_hit_ratio
FROM pg_stat_database
WHERE datname = 'upr_production';

-- Cache hit ratio should be > 95%
```

```sql
-- Table bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  n_dead_tup,
  n_live_tup,
  ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup, 0), 2) as bloat_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup > 0
ORDER BY n_dead_tup DESC
LIMIT 20;

-- If bloat_pct > 20%, schedule VACUUM
```

```sql
-- Lock monitoring
SELECT
  l.locktype,
  l.mode,
  l.granted,
  a.pid,
  a.usename,
  a.query,
  now() - a.query_start as duration
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE NOT l.granted
ORDER BY duration DESC;

-- No locks should be held for > 1 minute
```

### Data Archival Process

**Archive old agent decisions (> 90 days)**:

```bash
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
BEGIN;

-- Create archive table if not exists
CREATE TABLE IF NOT EXISTS agent_decisions_archive (
  LIKE agent_decisions INCLUDING ALL
);

-- Copy old records
INSERT INTO agent_decisions_archive
SELECT * FROM agent_decisions
WHERE created_at < NOW() - INTERVAL '90 days'
ON CONFLICT DO NOTHING;

-- Verify count
SELECT
  COUNT(*) as archived,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM agent_decisions_archive
WHERE created_at >= NOW() - INTERVAL '90 days';

-- If verification passes, delete from main table
-- DELETE FROM agent_decisions WHERE created_at < NOW() - INTERVAL '90 days';

COMMIT;

-- Reclaim space
VACUUM FULL agent_decisions;
EOF
```

**Export archived data to Cloud Storage**:

```bash
# Create GCS bucket if not exists
gsutil mb -p applied-algebra-474804-e6 -l us-central1 gs://upr-archives/ || true

# Export archive
gcloud sql export sql upr-postgres \
  gs://upr-archives/agent_decisions_archive_$(date +%Y%m%d).sql.gz \
  --database=upr_production \
  --table=agent_decisions_archive \
  --project=applied-algebra-474804-e6

# After verification, drop archive table
# psql "..." -c "DROP TABLE agent_decisions_archive;"
```

---

## Backup & Recovery Operations

### Automated Backups

**Cloud SQL automated backups**:
- **Schedule**: Daily at 3:00 AM UTC
- **Retention**: 7 days
- **Point-in-time recovery**: Enabled (7-day window)
- **Location**: us-central1

**Verify automated backup**:

```bash
gcloud sql backups list \
  --instance=upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="table(id,windowStartTime,status,type)"

# Check latest backup status
LATEST_STATUS=$(gcloud sql backups list \
  --instance=upr-postgres \
  --limit=1 \
  --format="value(status)" \
  --project=applied-algebra-474804-e6)

if [ "$LATEST_STATUS" != "SUCCESSFUL" ]; then
  echo "⚠️  Latest backup failed! Investigate immediately."
fi
```

### Manual Backup Procedures

**Before major changes** (deployments, migrations, updates):

```bash
# Run backup script
./scripts/backup-db.sh

# Expected output:
# ✅ Backup complete!
#    File: ./backups/upr_db_backup_YYYYMMDD_HHMMSS.sql.gz
#    Size: X.XG
```

**Create Cloud SQL backup**:

```bash
gcloud sql backups create \
  --instance=upr-postgres \
  --description="Pre-migration backup - $(date +%Y-%m-%d)" \
  --project=applied-algebra-474804-e6

# Verify backup created
gcloud sql backups list \
  --instance=upr-postgres \
  --limit=1 \
  --project=applied-algebra-474804-e6
```

### Restore Procedures

**Restore from local backup**:

```bash
# List available backups
ls -lh ./backups/upr_db_backup_*.sql.gz

# Select backup to restore
BACKUP_FILE="./backups/upr_db_backup_20251119_100000.sql.gz"

# Decompress
gunzip "$BACKUP_FILE"
RESTORE_FILE="${BACKUP_FILE%.gz}"

# Restore to database (WARNING: Overwrites data)
pg_restore \
  -h 34.121.0.240 \
  -U upr_app \
  -d upr_production \
  --clean \
  --if-exists \
  --verbose \
  "$RESTORE_FILE"

# Verify restore
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" \
  -c "SELECT COUNT(*) FROM hr_leads;"
```

**Restore from Cloud SQL backup**:

```bash
# List backups
gcloud sql backups list \
  --instance=upr-postgres \
  --project=applied-algebra-474804-e6

# Restore specific backup
BACKUP_ID="1234567890"

gcloud sql backups restore $BACKUP_ID \
  --backup-instance=upr-postgres \
  --instance=upr-postgres \
  --project=applied-algebra-474804-e6

# This will stop the instance briefly, then restore
# Estimated time: 5-15 minutes depending on size
```

**Point-in-time recovery**:

```bash
# Restore to specific timestamp (within 7-day window)
RESTORE_TIME="2025-11-19T14:30:00Z"

gcloud sql backups restore [BACKUP_ID] \
  --backup-instance=upr-postgres \
  --instance=upr-postgres \
  --backup-location=us-central1 \
  --point-in-time="$RESTORE_TIME" \
  --project=applied-algebra-474804-e6
```

### Backup Retention Policy

| Backup Type | Frequency | Retention | Location |
|-------------|-----------|-----------|----------|
| Cloud SQL Automated | Daily 3AM UTC | 7 days | us-central1 |
| Manual Script | Weekly (Tuesday) | 7 backups | Local: ./backups/ |
| Pre-deployment | Before each deployment | Until verified | Local |
| Monthly Archive | 1st of month | 12 months | GCS: gs://upr-backups/ |

**Clean up old local backups**:

```bash
# Automated in backup-db.sh (keeps last 7)
cd ./backups
ls -t upr_db_backup_*.sql.gz | tail -n +8 | xargs -r rm

echo "Backups retained: $(ls -1 upr_db_backup_*.sql.gz | wc -l)"
```

---

## Security Operations

### Security Audit Checklist (Monthly)

**1. Credential Review**:

```bash
# List all secrets and last update time
gcloud secrets list \
  --project=applied-algebra-474804-e6 \
  --format="table(name,createTime,labels)"

# Check secret versions (flag if > 3 active versions)
for SECRET in DATABASE_URL JWT_SECRET UPR_ADMIN_PASS OPENAI_API_KEY; do
  echo "=== $SECRET ==="
  gcloud secrets versions list $SECRET \
    --project=applied-algebra-474804-e6 \
    --format="table(name,state,createTime)" \
    --filter="state=ENABLED"
done
```

**2. Access Control Review**:

```bash
# Review Cloud Run IAM bindings
gcloud run services get-iam-policy upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6

# Review Cloud SQL IAM
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="yaml(settings.ipConfiguration.authorizedNetworks)"

# Review Secret Manager access
gcloud secrets get-iam-policy DATABASE_URL \
  --project=applied-algebra-474804-e6
```

**3. Log Audit**:

```bash
# Search for suspicious activity
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=upr-web-service \
  AND (textPayload=~\"unauthorized\" OR textPayload=~\"forbidden\" OR textPayload=~\"denied\")" \
  --limit=50 \
  --project=applied-algebra-474804-e6

# Check for brute force attempts
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=upr-web-service \
  AND textPayload=~\"login.*failed\"" \
  --limit=50 \
  --project=applied-algebra-474804-e6
```

**4. Database Security**:

```sql
-- Check for weak passwords (if using password auth)
SELECT usename, valuntil
FROM pg_user
WHERE valuntil < NOW() + INTERVAL '30 days';

-- Check for unused database users
SELECT usename, datname, COUNT(*)
FROM pg_stat_activity
WHERE usename != 'postgres'
GROUP BY usename, datname;

-- Review table permissions
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
ORDER BY grantee, table_name;
```

### Incident Response - Security Breach (P0)

**Immediate Actions** (within minutes):

```bash
# 1. Isolate the service
gcloud run services update upr-web-service \
  --region=us-central1 \
  --no-allow-unauthenticated \
  --project=applied-algebra-474804-e6

# 2. Rotate all credentials
for SECRET in UPR_ADMIN_PASS JWT_SECRET OPENAI_API_KEY APOLLO_API_KEY; do
  NEW_VALUE=$(openssl rand -base64 32)
  echo -n "$NEW_VALUE" | gcloud secrets versions add $SECRET \
    --data-file=- \
    --project=applied-algebra-474804-e6
done

# 3. Create database backup
./scripts/backup-db.sh

# 4. Review access logs
gcloud logging read "resource.type=cloud_run_revision \
  AND timestamp>=\"$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ')\"" \
  --limit=1000 \
  --project=applied-algebra-474804-e6 > security-incident-logs-$(date +%Y%m%d).txt
```

**Investigation**:

```bash
# Identify compromised records
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
-- Check for unusual activity
SELECT
  created_at,
  tool_name,
  confidence,
  metadata
FROM agent_decisions
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND (confidence < 0.1 OR metadata->>'source' NOT IN ('system', 'user'))
ORDER BY created_at DESC;
EOF
```

**Recovery**:

```bash
# After investigation and remediation
# 1. Redeploy with new secrets
./scripts/deploy-server.sh

# 2. Re-enable public access if safe
gcloud run services update upr-web-service \
  --region=us-central1 \
  --allow-unauthenticated \
  --project=applied-algebra-474804-e6

# 3. Notify stakeholders
# 4. Document incident
```

---

## Monitoring & Alerting

### Health Check Endpoints

```bash
SERVICE_URL="https://upr-web-service-191599223867.us-central1.run.app"

# 1. Basic health
curl "$SERVICE_URL/health"
# Expected: {"status":"ok","timestamp":"...","uptime":123,"port":8080}

# 2. Readiness (includes DB check)
curl "$SERVICE_URL/ready"
# Expected: {"status":"ready","database":"connected"}

# 3. Diagnostics
curl "$SERVICE_URL/api/diag" | jq
# Returns: db_ok, routes, env_ok, secrets_loaded
```

### Key Metrics to Monitor

| Metric | Source | Alert Threshold | Action |
|--------|--------|-----------------|--------|
| **Uptime** | GCP Monitoring | < 99% | Investigate outage |
| **Error Rate** | Logs | > 2% | Check logs |
| **P95 Latency** | GCP Monitoring | > 2s | Performance tuning |
| **Database Connections** | PostgreSQL | > 80 | Scale or tune pool |
| **Database CPU** | Cloud SQL | > 80% | Scale up tier |
| **Disk Usage** | Cloud SQL | > 80% | Increase storage |
| **Memory Usage** | Cloud Run | > 85% | Increase memory |
| **Cold Starts** | Logs | > 10/hour | Set min instances |

### Setting Up Alerts

**Create GCP alert policies**:

```bash
# High error rate alert
gcloud alpha monitoring policies create \
  --display-name="UPR High Error Rate" \
  --condition-display-name="Error rate > 2%" \
  --condition-threshold-value=0.02 \
  --condition-threshold-duration=300s \
  --condition-threshold-filter='resource.type="cloud_run_revision"
    AND resource.labels.service_name="upr-web-service"
    AND metric.type="run.googleapis.com/request_count"' \
  --project=applied-algebra-474804-e6
```

```bash
# Database CPU alert
gcloud alpha monitoring policies create \
  --display-name="UPR Database High CPU" \
  --condition-display-name="CPU > 80%" \
  --condition-threshold-value=0.8 \
  --condition-threshold-duration=300s \
  --condition-threshold-filter='resource.type="cloudsql_database"
    AND resource.labels.database_id="applied-algebra-474804-e6:upr-postgres"
    AND metric.type="cloudsql.googleapis.com/database/cpu/utilization"' \
  --project=applied-algebra-474804-e6
```

**Uptime checks**:

```bash
./scripts/setup-uptime-checks.sh

# Creates uptime checks for:
# - /health endpoint (every 1 min)
# - /ready endpoint (every 5 min)
# - Critical API endpoints (every 10 min)
```

### Log-Based Alerts

```bash
# Alert on critical errors
gcloud logging metrics create critical_errors \
  --description="Count of critical errors" \
  --log-filter='resource.type="cloud_run_revision"
    AND resource.labels.service_name="upr-web-service"
    AND severity>=ERROR' \
  --project=applied-algebra-474804-e6

# Create alert policy for this metric
# (via GCP Console or gcloud alpha monitoring)
```

### Monitoring Dashboards

**GCP Console URLs**:
- Cloud Run Metrics: https://console.cloud.google.com/run/detail/us-central1/upr-web-service/metrics
- Cloud SQL Metrics: https://console.cloud.google.com/sql/instances/upr-postgres/monitoring
- Logs Explorer: https://console.cloud.google.com/logs/query

**Key dashboard widgets**:
1. Request count (last 1h, 24h, 7d)
2. Request latency (P50, P95, P99)
3. Error rate (by status code)
4. Instance count (current, max)
5. Database connections (active, idle)
6. Database CPU/memory usage

---

## Escalation Procedures

### Escalation Matrix

| Severity | Response Time | Initial Contact | Escalate To | Escalate After |
|----------|--------------|-----------------|-------------|----------------|
| **P0** (Critical) | 15 minutes | On-call Engineer | Tech Lead | 30 minutes |
| **P1** (High) | 1 hour | On-call Engineer | Tech Lead | 2 hours |
| **P2** (Medium) | 4 hours | Operations Team | Engineering | Next day |
| **P3** (Low) | 24 hours | Operations Team | (None) | N/A |

### Contact Information

**Primary**:
- **Email**: uaesivakumar@gmail.com
- **Slack**: #upr-operations (if configured)

**GCP Support**:
- **Console**: https://console.cloud.google.com/support
- **Phone**: Available in GCP Console Support tab
- **Priority**: P0/P1 incidents qualify for expedited support

### Escalation Workflow

**P0 Incident**:

```
00:00 - Incident detected (monitoring alert or user report)
00:05 - On-call acknowledges, starts investigation
00:15 - Initial assessment complete, mitigation started
00:30 - If not resolved, escalate to Tech Lead
01:00 - Status update to stakeholders
Ongoing - Hourly updates until resolved
```

**P1 Incident**:

```
00:00 - Incident detected
00:30 - On-call acknowledges
01:00 - Initial assessment complete
02:00 - If not resolved, escalate to Tech Lead
04:00 - Status update to stakeholders
Ongoing - Updates every 4 hours until resolved
```

### Communication Templates

**P0 Incident Notification**:

```
Subject: [P0] UPR Service Outage

Summary: UPR service is currently unavailable
Impact: All users affected, cannot access system
Start Time: YYYY-MM-DD HH:MM UTC
Current Status: Investigating / Mitigating / Resolved
ETA for Resolution: [Time] or Unknown
Actions Taken:
- [Action 1]
- [Action 2]
Next Update: [Time]

Contact: [On-call engineer name/email]
```

**Resolution Notification**:

```
Subject: [RESOLVED] UPR Service Outage

Summary: UPR service has been restored
Root Cause: [Brief explanation]
Resolution: [What was done]
Duration: [Start time] - [End time] (XX minutes)
Impact: [Description of user impact]
Prevention: [Steps to prevent recurrence]

Post-Mortem: [Link to detailed analysis]
```

---

## On-Call Guide

### On-Call Responsibilities

**Primary**:
- Monitor alerts 24/7 during on-call rotation
- Respond to incidents within SLA (P0: 15min, P1: 1h)
- Perform triage and initial remediation
- Escalate if needed
- Document all incidents

**Secondary**:
- Daily health checks (morning/evening)
- Weekly maintenance tasks
- Proactive monitoring
- Knowledge base updates

### On-Call Preparation

**Before your shift**:

```bash
# 1. Verify access to all systems
gcloud auth list
gcloud config set project applied-algebra-474804-e6

# 2. Test database access
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" -c "SELECT 1;"

# 3. Verify you can deploy
gcloud run services list --project=applied-algebra-474804-e6

# 4. Review recent incidents
ls -lh ./incidents/

# 5. Check current system status
./scripts/health-check.sh
```

**Tools to have ready**:
- Terminal with `gcloud` configured
- Database client (`psql`)
- Access to GCP Console
- This runbook (bookmark this file)
- Incident log template

### On-Call Handoff

**At rotation start**:

```bash
# Run handoff script to generate status report
cat > /tmp/oncall-handoff.sh << 'EOF'
#!/bin/bash
echo "=== On-Call Handoff Report ==="
echo "Date: $(date)"
echo ""
echo "=== System Status ==="
./scripts/health-check.sh
echo ""
echo "=== Recent Incidents (last 7 days) ==="
ls -lht ./incidents/ | head -10
echo ""
echo "=== Recent Deployments ==="
gcloud run revisions list --service=upr-web-service --region=us-central1 --limit=5
echo ""
echo "=== Current Alerts ==="
# (If monitoring system configured, query active alerts)
echo ""
echo "=== Known Issues ==="
cat ./KNOWN_ISSUES.md 2>/dev/null || echo "None"
EOF

chmod +x /tmp/oncall-handoff.sh
/tmp/oncall-handoff.sh > oncall-handoff-$(date +%Y%m%d).txt
```

**Share with incoming on-call**:
- Handoff report
- Outstanding incidents
- Scheduled maintenance
- Known issues

### Common On-Call Scenarios

**1. Alert: High Error Rate**

```bash
# Quick investigation
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=50 \
  --log-filter='severity>=ERROR' \
  --project=applied-algebra-474804-e6

# Follow Playbook 2 (High Error Rate) in Incident Response section
```

**2. Alert: Service Down**

```bash
# Check if service is truly down
curl "https://upr-web-service-191599223867.us-central1.run.app/health"

# If no response, follow Playbook 1 (Service Unavailable)
```

**3. User Report: Slow Performance**

```bash
# Check latency metrics
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_latencies"' \
  --project=applied-algebra-474804-e6

# Check database slow queries
psql "..." -c "SELECT * FROM pg_stat_statements WHERE mean_exec_time > 1000 LIMIT 10;"

# Follow Performance Tuning section
```

**4. Alert: Database Connection Limit**

```bash
# Check connections
psql "..." -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='upr_production';"

# Follow Playbook 2 (Database connection exhaustion remediation)
```

### After Hours Emergency Procedures

**If you cannot resolve P0 within 30 minutes**:

1. **Escalate immediately** to Tech Lead
2. **Implement temporary mitigation** (rollback, scale up, etc.)
3. **Continue investigation** while waiting for escalation response
4. **Document everything** in incident log

**Emergency rollback** (if recent deployment caused issue):

```bash
# One-command emergency rollback
gcloud run revisions list --service=upr-web-service --region=us-central1 --limit=3

# Rollback to previous revision
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=[PREVIOUS_REVISION]=100 \
  --project=applied-algebra-474804-e6
```

---

## Common Operational Tasks

### Task 1: Deploy New Version

```bash
# See DEPLOYMENT_RUNBOOK.md for full procedure

# Quick deploy
./scripts/deploy-server.sh

# Verify
./tests/smoke-tests.sh
```

### Task 2: Check System Health

```bash
./scripts/health-check.sh
```

### Task 3: Review Logs

```bash
# Recent errors
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=50 \
  --log-filter='severity>=ERROR' \
  --project=applied-algebra-474804-e6

# Tail logs in real-time
gcloud run services logs tail upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6
```

### Task 4: Scale Service

```bash
# Increase capacity
gcloud run services update upr-web-service \
  --region=us-central1 \
  --max-instances=10 \
  --project=applied-algebra-474804-e6

# Decrease capacity (off-peak hours)
gcloud run services update upr-web-service \
  --region=us-central1 \
  --max-instances=3 \
  --project=applied-algebra-474804-e6
```

### Task 5: Clear Cache

```bash
# Clear Redis cache (if configured)
REDIS_URL=$(gcloud secrets versions access latest --secret=REDIS_URL --project=applied-algebra-474804-e6)
redis-cli -u "$REDIS_URL" FLUSHDB

# Clear specific cache patterns
redis-cli -u "$REDIS_URL" --scan --pattern "cache:email:*" | \
  xargs redis-cli -u "$REDIS_URL" DEL
```

### Task 6: Export Data

```bash
# Export high-value leads
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
\copy (
  SELECT
    hl.contact_name,
    hl.contact_email,
    hl.contact_title,
    c.name as company_name,
    ls.lead_score,
    ls.grade
  FROM hr_leads hl
  JOIN kb_companies c ON hl.company_id = c.id
  LEFT JOIN lead_scores ls ON hl.id = ls.opportunity_id
  WHERE ls.grade IN ('A+', 'A')
    AND hl.created_at > NOW() - INTERVAL '30 days'
  ORDER BY ls.lead_score DESC
) TO '/tmp/high_value_leads.csv' WITH CSV HEADER;
EOF

# File saved to /tmp/high_value_leads.csv
```

### Task 7: Update API Key

```bash
# Update secret
NEW_KEY="sk-..."
echo -n "$NEW_KEY" | gcloud secrets versions add OPENAI_API_KEY \
  --data-file=- \
  --project=applied-algebra-474804-e6

# Restart service
gcloud run services update upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6

# Verify
curl "https://upr-web-service-191599223867.us-central1.run.app/health"
```

### Task 8: Database Vacuum

```bash
# Vacuum specific table
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require" <<EOF
VACUUM ANALYZE agent_decisions;
EOF

# Full vacuum (requires maintenance window)
# psql "..." -c "VACUUM FULL ANALYZE;"
```

### Task 9: Check Costs

```bash
./scripts/check-gcp-costs.sh
# Or
./scripts/cost-summary.sh
```

### Task 10: Create Manual Backup

```bash
./scripts/backup-db.sh
```

---

## Quick Reference

### Essential Commands

```bash
# === SERVICE MANAGEMENT ===
# Check all services
./scripts/health-check.sh

# View logs
gcloud run services logs tail upr-web-service --region=us-central1 --project=applied-algebra-474804-e6

# Deploy
./scripts/deploy-server.sh

# Rollback
gcloud run services update-traffic upr-web-service --region=us-central1 --to-revisions=REVISION=100 --project=applied-algebra-474804-e6

# === DATABASE ===
# Connect
psql "postgresql://upr_app:UprApp2025!Pass31cd5b023e349c88@34.121.0.240:5432/upr_production?sslmode=require"

# Backup
./scripts/backup-db.sh

# Check connections
psql "..." -c "SELECT COUNT(*) FROM pg_stat_activity WHERE datname='upr_production';"

# === MONITORING ===
# Health check
curl https://upr-web-service-191599223867.us-central1.run.app/health

# Error count
gcloud run services logs read upr-web-service --region=us-central1 --log-filter='severity>=ERROR' --limit=100 --project=applied-algebra-474804-e6

# === SECRETS ===
# List
gcloud secrets list --project=applied-algebra-474804-e6

# View
gcloud secrets versions access latest --secret=SECRET_NAME --project=applied-algebra-474804-e6

# Update
echo -n "VALUE" | gcloud secrets versions add SECRET_NAME --data-file=- --project=applied-algebra-474804-e6
```

### Critical Files

| File | Purpose | Location |
|------|---------|----------|
| **This Runbook** | Operations procedures | `/Users/skc/DataScience/upr/docs/OPERATIONS_RUNBOOK.md` |
| **Admin Guide** | System administration | `/Users/skc/DataScience/upr/docs/ADMIN_GUIDE.md` |
| **Deployment Runbook** | Deployment procedures | `/Users/skc/DataScience/upr/docs/DEPLOYMENT_RUNBOOK.md` |
| **Health Check** | Service health script | `/Users/skc/DataScience/upr/scripts/health-check.sh` |
| **Backup Script** | Database backup | `/Users/skc/DataScience/upr/scripts/backup-db.sh` |
| **Deploy Script** | Server deployment | `/Users/skc/DataScience/upr/scripts/deploy-server.sh` |

### Important URLs

| Resource | URL |
|----------|-----|
| **Production Service** | https://upr-web-service-191599223867.us-central1.run.app |
| **Health Endpoint** | https://upr-web-service-191599223867.us-central1.run.app/health |
| **GCP Console** | https://console.cloud.google.com/run?project=applied-algebra-474804-e6 |
| **Cloud Run Dashboard** | https://console.cloud.google.com/run/detail/us-central1/upr-web-service/metrics |
| **Cloud SQL Dashboard** | https://console.cloud.google.com/sql/instances/upr-postgres |
| **Logs Explorer** | https://console.cloud.google.com/logs/query |
| **Secret Manager** | https://console.cloud.google.com/security/secret-manager |

### GCP Project Details

| Property | Value |
|----------|-------|
| **Project ID** | applied-algebra-474804-e6 |
| **Region** | us-central1 |
| **Database IP** | 34.121.0.240:5432 |
| **Database Name** | upr_production |
| **Service Account** | upr-runner@applied-algebra-474804-e6.iam.gserviceaccount.com |

### Emergency Contacts

- **Primary Support**: uaesivakumar@gmail.com
- **GCP Support**: https://console.cloud.google.com/support
- **Escalation**: See [Escalation Procedures](#escalation-procedures)

---

## Document History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-11-19 | 1.0.0 | Initial operations runbook | Sprint 40 |

---

## Related Documentation

- **[ADMIN_GUIDE.md](./ADMIN_GUIDE.md)** - System administration reference
- **[DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)** - Deployment procedures
- **[TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md)** - System architecture
- **[USER_GUIDE.md](./USER_GUIDE.md)** - End-user documentation

---

**End of Operations Runbook**

*For questions or updates to this runbook, contact: uaesivakumar@gmail.com*
