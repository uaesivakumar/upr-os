# Disaster Recovery Plan

**Status**: ✅ COMPLETE
**Completion Date**: November 16, 2025
**Sprint**: Sprint 26
**Phase**: Phase 4 Infrastructure
**Last Reviewed**: November 16, 2025

---

## Executive Summary

This Disaster Recovery (DR) Plan documents the strategies, procedures, and protocols for recovering the UPR SIVA AI platform in the event of service disruptions, data loss, or catastrophic failures.

### Recovery Objectives

- **RTO (Recovery Time Objective)**: 1 hour
- **RPO (Recovery Point Objective)**: 5 minutes
- **Availability Target**: 99.5% uptime (43.8 hours downtime/year)
- **Data Loss Tolerance**: Maximum 5 minutes of transaction data

### Coverage

- Cloud Run service outages
- Database failures and corruption
- Data center failures
- Security incidents
- Human errors (accidental deletions, bad deployments)

---

## 1. Disaster Scenarios & Response

### Severity Levels

| Level | Impact | Examples | Response Time | Escalation |
|-------|--------|----------|---------------|------------|
| **P0 - Critical** | Service completely down | Cloud Run crash, database offline | Immediate (<5 min) | CTO, Engineering Lead |
| **P1 - High** | Major degradation | 50%+ error rate, data corruption | <30 minutes | Engineering Lead, On-call |
| **P2 - Medium** | Partial degradation | Single region down, slow queries | <2 hours | On-call engineer |
| **P3 - Low** | Minor impact | Dashboard issues, non-critical features | <24 hours | Regular sprint work |

---

## 2. Backup Strategy

### Cloud SQL Automated Backups

```mermaid
graph TB
    subgraph "Daily Automated Backups"
        DAILY[Daily Backup<br/>03:00 UTC<br/>Retention: 7 days]
    end

    subgraph "Point-in-Time Recovery (PITR)"
        PITR[Transaction Logs<br/>Every 5 minutes<br/>Retention: 7 days]
    end

    subgraph "Manual Backups"
        MANUAL[On-Demand Backups<br/>Before major changes<br/>Retention: 30 days]
    end

    subgraph "Cross-Region Replication"
        REPLICA[Read Replica<br/>europe-west1<br/>Async Replication]
    end

    subgraph "Backup Storage"
        GCS[Google Cloud Storage<br/>Multi-region<br/>Encrypted at rest]
    end

    DAILY --> GCS
    PITR --> GCS
    MANUAL --> GCS
    REPLICA -.->|Future Enhancement| GCS

    style DAILY fill:#34A853,color:#fff
    style PITR fill:#4285F4,color:#fff
    style MANUAL fill:#FBBC04,color:#000
    style GCS fill:#EA4335,color:#fff
```

### Current Backup Configuration

**Cloud SQL Instance**: `upr-postgres`

| Setting | Value | Description |
|---------|-------|-------------|
| **Automated Backups** | Enabled | Daily backups at 03:00 UTC |
| **Backup Window** | 03:00 - 04:00 UTC | 1-hour maintenance window |
| **Backup Retention** | 7 days | Rolling 7-day retention |
| **PITR Enabled** | Yes | Point-in-time recovery to any second |
| **Transaction Log Retention** | 7 days | Enables PITR for last 7 days |
| **Backup Location** | us-central1 (multi-region) | Google-managed storage |
| **Encryption** | Google-managed keys | Encrypted at rest and in transit |

**Recent Backups** (Last 5):
```
✅ 2025-11-15 03:00:00 UTC - SUCCESSFUL (AUTOMATED)
✅ 2025-11-14 03:00:00 UTC - SUCCESSFUL (AUTOMATED)
✅ 2025-11-13 03:00:00 UTC - SUCCESSFUL (AUTOMATED)
✅ 2025-11-12 03:00:00 UTC - SUCCESSFUL (AUTOMATED)
✅ 2025-11-11 03:00:00 UTC - SUCCESSFUL (AUTOMATED)
```

---

### Artifact Registry (Container Images)

**Repository**: `us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo`

| Image | Retention | Versioning |
|-------|-----------|------------|
| `upr-web-service` | Unlimited | SHA256 digest + `:latest` tag |
| `upr-enrichment-worker` | Unlimited | SHA256 digest + `:latest` tag |

**Backup Strategy**:
- All images stored with SHA256 digest (immutable)
- `:latest` tag updated on each deployment
- Previous images never deleted (enables instant rollback)
- Cross-region replication available (future enhancement)

---

### Secret Manager (Configuration & Credentials)

**Secrets**: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, etc.

| Setting | Value | Description |
|---------|-------|-------------|
| **Versioning** | Enabled | All versions retained |
| **Encryption** | Google-managed keys | AES-256 encryption |
| **Access Control** | IAM-based | Service account permissions |
| **Replication** | Multi-region | Automatic Google Cloud replication |

**Backup Strategy**:
- All secret versions retained indefinitely
- Can rollback to any previous version
- Disabled versions remain accessible (for audit)

---

## 3. Recovery Procedures

### Scenario 1: Cloud Run Service Outage

**Symptoms**:
- 502/503 errors from load balancer
- Health checks failing
- No instances running

**Recovery Steps**:

```bash
# 1. Check service status
gcloud run services describe upr-web-service --region=us-central1

# 2. Check recent revisions
gcloud run revisions list --service=upr-web-service --region=us-central1 --limit=5

# 3. If current revision unhealthy, rollback to previous
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=upr-web-service-00391-q6q=100

# 4. If all revisions unhealthy, redeploy from known-good image
gcloud run deploy upr-web-service \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo/upr-web-service@sha256:LAST_KNOWN_GOOD_DIGEST \
  --platform=managed

# 5. Verify health
curl https://upr-web-service-191599223867.us-central1.run.app/health

# 6. Run smoke test
API_URL="https://upr-web-service-191599223867.us-central1.run.app" \
  node scripts/testing/smokeTestSprint25.js
```

**Expected Recovery Time**: 2-5 minutes
**Data Loss**: None (stateless service)

---

### Scenario 2: Database Corruption (Recent)

**Symptoms**:
- Query errors (`ERROR: invalid page header`)
- Data inconsistencies
- Transaction failures

**Recovery Steps** (Point-in-Time Recovery):

```bash
# 1. Identify corruption time (from error logs)
CORRUPTION_TIME="2025-11-16 10:30:00"

# 2. Stop application writes (set Cloud Run to 0 instances temporarily)
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=0

# 3. Create new Cloud SQL instance from PITR (to 5 minutes before corruption)
RECOVERY_TIME="2025-11-16 10:25:00"

gcloud sql instances clone upr-postgres upr-postgres-recovered \
  --point-in-time="$RECOVERY_TIME" \
  --region=us-central1

# 4. Wait for clone to complete (~15-30 minutes for 10GB database)
gcloud sql operations list --instance=upr-postgres-recovered --limit=1

# 5. Update DATABASE_URL secret to point to new instance
NEW_DB_URL="postgresql://upr_app:PASSWORD@NEW_IP:5432/upr_production"
echo -n "$NEW_DB_URL" | gcloud secrets versions add DATABASE_URL --data-file=-

# 6. Restart Cloud Run with new database
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=2 \
  --max-instances=10

# 7. Verify database connectivity
curl https://upr-web-service-191599223867.us-central1.run.app/ready

# 8. Run smoke test
API_URL="https://upr-web-service-191599223867.us-central1.run.app" \
  node scripts/testing/smokeTestSprint25.js

# 9. Once verified, promote recovered instance and delete old one
# (Rename upr-postgres-recovered → upr-postgres)
```

**Expected Recovery Time**: 30-45 minutes
**Data Loss**: Maximum 5 minutes (PITR granularity)

---

### Scenario 3: Database Corruption (Old, Need Daily Backup)

**Symptoms**:
- Corruption discovered >7 days later (PITR not available)
- Need to restore from daily backup

**Recovery Steps**:

```bash
# 1. List available backups
gcloud sql backups list --instance=upr-postgres --limit=7

# Output example:
# ID    WINDOW_START_TIME           TYPE       STATUS
# 123   2025-11-15T03:00:00.000Z   AUTOMATED  SUCCESSFUL
# 122   2025-11-14T03:00:00.000Z   AUTOMATED  SUCCESSFUL

# 2. Choose closest backup before corruption
BACKUP_ID="122"  # 2025-11-14 backup

# 3. Create new instance from backup
gcloud sql backups restore $BACKUP_ID \
  --backup-instance=upr-postgres \
  --restore-instance=upr-postgres-from-backup

# OR create new instance and restore into it:
gcloud sql instances create upr-postgres-recovered \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region=us-central1 \
  --backup=$BACKUP_ID

# 4. Follow steps 4-9 from Scenario 2 (update secret, restart service)
```

**Expected Recovery Time**: 45-60 minutes
**Data Loss**: Up to 24 hours (last daily backup)

---

### Scenario 4: Accidental Data Deletion

**Symptoms**:
- Critical table dropped (`DROP TABLE companies;`)
- Bulk DELETE without WHERE clause
- Schema migration gone wrong

**Recovery Steps** (Table-Level Recovery):

```bash
# 1. IMMEDIATELY stop application to prevent further writes
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=0

# 2. Create temporary instance from PITR (5 minutes before deletion)
DELETION_TIME="2025-11-16 11:00:00"
RECOVERY_TIME="2025-11-16 10:55:00"

gcloud sql instances clone upr-postgres upr-postgres-temp \
  --point-in-time="$RECOVERY_TIME" \
  --region=us-central1

# 3. Export deleted data from temp instance
gcloud sql export sql upr-postgres-temp \
  gs://upr-backups/recovery/companies_table_$(date +%Y%m%d_%H%M%S).sql \
  --database=upr_production \
  --table=companies

# 4. Import data back to production instance
gcloud sql import sql upr-postgres \
  gs://upr-backups/recovery/companies_table_20251116_110000.sql \
  --database=upr_production

# 5. Verify data restored
PGPASSWORD='...' psql -h 34.121.0.240 -U upr_app -d upr_production \
  -c "SELECT COUNT(*) FROM companies;"

# 6. Restart application
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=2 \
  --max-instances=10

# 7. Delete temporary instance
gcloud sql instances delete upr-postgres-temp
```

**Expected Recovery Time**: 20-30 minutes (table-level)
**Data Loss**: Maximum 5 minutes

---

### Scenario 5: Region Outage (us-central1 Down)

**Symptoms**:
- Google Cloud status dashboard shows us-central1 outage
- All services unreachable

**Current State**: Single-region deployment (us-central1)

**Recovery Steps** (Manual Failover):

```bash
# PREREQUISITE: Cross-region replica must be set up in advance
# (This is a future enhancement - not currently configured)

# 1. Promote read replica to primary (europe-west1)
gcloud sql instances promote-replica upr-postgres-replica-eu

# 2. Deploy Cloud Run service to europe-west1
gcloud run deploy upr-web-service \
  --region=europe-west1 \
  --image=us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo/upr-web-service:latest \
  --platform=managed

# 3. Update DNS (if using custom domain)
# Point upr.sivakumar.ai → new Cloud Run URL

# 4. Update DATABASE_URL secret with new replica IP
# 5. Verify service in new region
```

**Expected Recovery Time**: 2-4 hours (manual failover)
**Data Loss**: Depends on replication lag (typically <1 minute)

**CURRENT LIMITATION**: No cross-region replica configured. Region outage would require:
1. Wait for us-central1 recovery, OR
2. Restore from backup in new region (45-60 minutes)

**RECOMMENDATION**: Configure cross-region read replica (Sprint 27+)

---

### Scenario 6: Complete Infrastructure Loss

**Symptoms**:
- Google Cloud project deleted
- Catastrophic account compromise
- Complete data loss

**Recovery Steps** (Restore from Backups):

```bash
# PREREQUISITE: Off-site backups must be configured
# (Export critical data to external storage periodically)

# 1. Create new Google Cloud project
gcloud projects create upr-recovery-project

# 2. Recreate Cloud SQL instance
gcloud sql instances create upr-postgres \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region=us-central1

# 3. Restore from off-site backup (e.g., AWS S3, Azure Blob)
# Download backup: aws s3 cp s3://upr-offsite-backups/latest.sql .
# Import: gcloud sql import sql upr-postgres gs://bucket/latest.sql

# 4. Recreate VPC network and connector
# (Manual configuration or Terraform)

# 5. Rebuild container images from source code
git clone https://github.com/org/upr
cd upr
gcloud builds submit --tag us-central1-docker.pkg.dev/.../upr-web-service:latest

# 6. Deploy Cloud Run service
gcloud run deploy upr-web-service \
  --image=us-central1-docker.pkg.dev/.../upr-web-service:latest \
  --region=us-central1

# 7. Recreate secrets in Secret Manager
# 8. Verify service operational
```

**Expected Recovery Time**: 4-8 hours (full rebuild)
**Data Loss**: Depends on off-site backup frequency (24 hours if daily)

**CURRENT LIMITATION**: No off-site backups configured
**RECOMMENDATION**: Weekly exports to AWS S3 or Azure Blob (Sprint 28+)

---

## 4. RTO & RPO Breakdown

### Recovery Time Objectives (RTO)

| Scenario | RTO | Procedure | Automation |
|----------|-----|-----------|------------|
| **Cloud Run Service Outage** | 5 minutes | Rollback to previous revision | Automated (traffic routing) |
| **Bad Deployment** | 2 minutes | Instant traffic rollback | Automated (gcloud command) |
| **Database Connection Failure** | 10 minutes | Restart Cloud SQL proxy | Manual |
| **Recent Database Corruption** | 30 minutes | PITR to 5 min before corruption | Manual |
| **Old Database Corruption** | 60 minutes | Restore from daily backup | Manual |
| **Accidental Data Deletion** | 20 minutes | Table-level PITR restore | Manual |
| **Secret Compromise** | 15 minutes | Rotate secret, redeploy | Manual |
| **Region Outage** | 4 hours | Manual failover to new region | Manual (no replica) |
| **Complete Infrastructure Loss** | 8 hours | Full rebuild from backups | Manual |

**Overall RTO**: 1 hour (for 95% of scenarios)

---

### Recovery Point Objectives (RPO)

| Data Type | RPO | Backup Frequency | Retention |
|-----------|-----|------------------|-----------|
| **Database (PITR)** | 5 minutes | Continuous transaction logs | 7 days |
| **Database (Daily Backup)** | 24 hours | Daily at 03:00 UTC | 7 days |
| **Container Images** | 0 (no data loss) | Every deployment | Unlimited |
| **Application Code** | 0 (no data loss) | Git commits | Unlimited |
| **Secrets** | 0 (versioned) | Every secret update | Unlimited |
| **Configuration** | 0 (IaC) | Git-tracked YAML files | Unlimited |

**Overall RPO**: 5 minutes (for database transactions)

---

## 5. Backup Validation & Testing

### Monthly Backup Tests

**Schedule**: First Saturday of each month, 10:00 UTC

**Test Procedure**:

```bash
# 1. Create test instance from latest backup
gcloud sql backups list --instance=upr-postgres --limit=1
LATEST_BACKUP_ID=$(gcloud sql backups list --instance=upr-postgres --limit=1 --format="value(id)")

gcloud sql instances create upr-postgres-test \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --backup=$LATEST_BACKUP_ID

# 2. Verify data integrity
PGPASSWORD='...' psql -h TEST_INSTANCE_IP -U upr_app -d upr_production -c "
SELECT
  COUNT(*) as total_companies,
  COUNT(DISTINCT id) as unique_companies,
  MAX(updated_at) as last_update
FROM companies;
"

# Expected output:
# total_companies | unique_companies | last_update
# 5000           | 5000             | 2025-11-15 23:45:00

# 3. Test critical queries
PGPASSWORD='...' psql -h TEST_INSTANCE_IP -U upr_app -d upr_production -f scripts/testing/backup_validation_queries.sql

# 4. Delete test instance
gcloud sql instances delete upr-postgres-test --quiet
```

**Success Criteria**:
- [ ] Backup restore completes without errors
- [ ] Row counts match expected values (±1% tolerance)
- [ ] No data corruption detected
- [ ] Critical queries execute successfully
- [ ] Restore time < 30 minutes (for 10GB database)

**Documentation**: Log results in `docs/backup-tests/YYYY-MM-DD_backup_test_report.md`

---

### Quarterly Disaster Recovery Drills

**Schedule**: Last Friday of Q1, Q2, Q3, Q4

**Drill Scenarios**:

1. **Q1**: Simulate bad deployment → Rollback to previous revision
2. **Q2**: Simulate database corruption → PITR recovery
3. **Q3**: Simulate accidental table drop → Table-level restore
4. **Q4**: Simulate region outage → Manual failover (when replica available)

**Drill Checklist**:
- [ ] Announce drill to team (no surprises)
- [ ] Execute recovery procedure (follow DR plan)
- [ ] Time each step (measure actual RTO)
- [ ] Document issues encountered
- [ ] Update DR plan based on learnings
- [ ] Post-drill retrospective meeting

---

## 6. Monitoring & Alerting

### Backup Monitoring

**Automated Checks** (Daily):

```bash
# Check if daily backup completed successfully
gcloud sql backups list --instance=upr-postgres --limit=1 --format=json | \
  jq -r '.[0] | "Status: \(.status), Time: \(.windowStartTime)"'

# Alert if backup failed or missing
```

**Alert Conditions**:
- Daily backup failed (status != SUCCESSFUL)
- No backup in last 36 hours
- Backup size decreased >50% (data loss indicator)
- PITR disabled or transaction logs not retained

**Alert Destinations**:
- Email: engineering@upr.ai
- Slack: #infrastructure-alerts
- PagerDuty: On-call engineer (P1 severity)

---

### Service Health Monitoring

**Metrics to Monitor**:

| Metric | Threshold | Alert Severity |
|--------|-----------|----------------|
| Error Rate | >5% | P1 (Critical) |
| Latency P95 | >500ms | P2 (High) |
| Uptime | <99.5% | P2 (High) |
| Database Connections | >90% of pool | P2 (High) |
| Database CPU | >80% | P3 (Medium) |
| Container Memory | >80% | P3 (Medium) |

**Monitoring Tools**:
- **Sentry**: Error tracking, performance monitoring
- **Cloud Monitoring**: Infrastructure metrics
- **Cloud Logging**: Request logs, error logs
- **Uptime Checks**: External health check probes

---

## 7. Security Incident Response

### Compromised Credentials

**Scenario**: Database password leaked, API key exposed

**Response Steps**:

```bash
# 1. IMMEDIATELY rotate compromised secret
NEW_PASSWORD=$(openssl rand -base64 32)

# 2. Update secret in Secret Manager
echo -n "postgresql://upr_app:$NEW_PASSWORD@34.121.0.240:5432/upr_production" | \
  gcloud secrets versions add DATABASE_URL --data-file=-

# 3. Update database password
gcloud sql users set-password upr_app \
  --instance=upr-postgres \
  --password="$NEW_PASSWORD"

# 4. Redeploy Cloud Run (picks up new secret)
gcloud run deploy upr-web-service \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo/upr-web-service:latest

# 5. Verify service operational
curl https://upr-web-service-191599223867.us-central1.run.app/ready

# 6. Review audit logs for unauthorized access
gcloud logging read \
  "protoPayload.authenticationInfo.principalEmail!=\"authorized@email.com\"" \
  --limit=100 \
  --format=json

# 7. Document incident and impact
```

**RTO**: 15 minutes (credential rotation)
**Impact**: Temporary service disruption during credential rotation

---

### Data Breach

**Scenario**: Unauthorized access to production database

**Response Steps**:

1. **Isolate** (Immediate):
   - Disable public IP on Cloud SQL
   - Revoke compromised service account permissions
   - Enable VPC-only access

2. **Investigate** (0-2 hours):
   - Review Cloud SQL audit logs
   - Identify compromised records
   - Determine attack vector

3. **Contain** (2-4 hours):
   - Rotate all database credentials
   - Patch vulnerability
   - Deploy security update

4. **Notify** (4-24 hours):
   - Inform affected customers (if PII exposed)
   - File security incident report
   - Notify legal/compliance team

5. **Recover** (1-7 days):
   - Restore from pre-breach backup (if data modified)
   - Implement additional security controls
   - Post-incident review

---

## 8. Contact Information

### Escalation Chain

| Role | Contact | Primary Responsibility |
|------|---------|------------------------|
| **On-Call Engineer** | oncall@upr.ai | First responder (P2-P3) |
| **Engineering Lead** | engineering-lead@upr.ai | P1 incidents, DR coordination |
| **CTO** | cto@upr.ai | P0 incidents, executive decisions |
| **Database Admin** | dba@upr.ai | Database recovery, backups |
| **Security Lead** | security@upr.ai | Security incidents, breaches |

### External Vendors

| Vendor | Contact | Support Level |
|--------|---------|---------------|
| **Google Cloud Support** | https://cloud.google.com/support | Premium (24/7) |
| **Sentry Support** | https://sentry.io/support | Business (email) |

---

## 9. Post-Incident Review

### Incident Report Template

```markdown
# Incident Report: [INCIDENT_ID]

**Date**: YYYY-MM-DD
**Severity**: P0/P1/P2/P3
**Duration**: X hours Y minutes
**RTO Achieved**: X minutes (Target: Y minutes)
**RPO**: X minutes data loss (Target: Y minutes)

## Summary
[Brief description of incident]

## Timeline
- HH:MM - Incident detected
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Recovery initiated
- HH:MM - Service restored
- HH:MM - Incident closed

## Root Cause
[Technical explanation]

## Impact
- Affected users: X
- Data loss: Y records / Z minutes
- Revenue impact: $X

## Recovery Actions
1. [Action taken]
2. [Action taken]

## Lessons Learned
- [What went well]
- [What could be improved]

## Action Items
- [ ] Update DR plan (assignee, deadline)
- [ ] Implement additional monitoring (assignee, deadline)
- [ ] Conduct training session (assignee, deadline)
```

---

## 10. Future Enhancements

### Planned Improvements (Sprint 27-30)

1. **Cross-Region Read Replica** (Sprint 27)
   - Deploy Cloud SQL read replica to europe-west1
   - Enable automatic failover
   - Reduce RTO for region outages to <1 hour

2. **Off-Site Backups** (Sprint 28)
   - Weekly exports to AWS S3
   - Monthly exports to Azure Blob Storage
   - 90-day retention for compliance

3. **Automated Disaster Recovery** (Sprint 29)
   - Automated failover scripts
   - Terraform infrastructure-as-code
   - One-command recovery procedures

4. **Chaos Engineering** (Sprint 30)
   - Automated fault injection (Chaos Monkey)
   - Continuous DR testing
   - Resilience validation

5. **Multi-Region Active-Active** (Phase 11)
   - Deploy to 3 regions (US, EU, Asia)
   - Global load balancing
   - <100ms latency worldwide

---

## Completion Notes

**Sprint 26 Disaster Recovery Plan**:
- ✅ RTO/RPO objectives defined (1 hour / 5 minutes)
- ✅ Backup strategy documented (Cloud SQL automated backups, PITR)
- ✅ 6 disaster scenarios with recovery procedures
- ✅ Backup validation and testing schedule (monthly, quarterly)
- ✅ Monitoring & alerting configuration
- ✅ Security incident response procedures
- ✅ Escalation chain and contact information
- ✅ Post-incident review process

**Next Steps**:
- Design Phase 10 feedback loop architecture
- Build feedback collection API
- Create feedback analysis queries

---

*Generated: 2025-11-16 | Sprint 26 | Phase 4 Infrastructure Complete*
