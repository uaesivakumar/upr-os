# UPR System Administration Guide

**Version**: 1.0.0
**Last Updated**: 2025-11-19
**Platform**: Google Cloud Platform
**Target Audience**: System Administrators, DevOps Engineers, Platform Engineers

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Access Management](#access-management)
3. [Database Administration](#database-administration)
4. [Application Configuration](#application-configuration)
5. [Monitoring and Logging](#monitoring-and-logging)
6. [Security Hardening](#security-hardening)
7. [Backup and Recovery](#backup-and-recovery)
8. [Incident Response](#incident-response)
9. [Performance Tuning](#performance-tuning)
10. [Maintenance Procedures](#maintenance-procedures)
11. [Scaling Operations](#scaling-operations)
12. [Common Administrative Tasks](#common-administrative-tasks)

---

## System Overview

### Production Infrastructure

**GCP Project**: `applied-algebra-474804-e6`
**Region**: `us-central1`
**Environment**: Production

#### Core Components

| Component | Resource Name | Details |
|-----------|--------------|---------|
| **Application** | `upr-web-service` | Cloud Run service |
| **Database** | `upr-postgres` | Cloud SQL PostgreSQL 15.x |
| **Database IP** | `34.121.0.240:5432` | Public IP address |
| **Database Name** | `upr_production` | Primary database |
| **App User** | `upr_app` | Application database user |
| **Container Registry** | `us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo` | Docker images |

#### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│              GCP Project: applied-algebra-474804-e6     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Cloud Run: upr-web-service                      │  │
│  │  - Port: 8080                                     │  │
│  │  - Min Instances: 0, Max: 5                       │  │
│  │  - Memory: 1GB, CPU: 1 vCPU                       │  │
│  │  - Concurrency: 80                                │  │
│  └──────────────────────────────────────────────────┘  │
│                         │                               │
│                         │ VPC Connector                 │
│                         ▼                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Cloud SQL: upr-postgres                         │  │
│  │  - PostgreSQL 15.x                                │  │
│  │  - IP: 34.121.0.240:5432                          │  │
│  │  - Database: upr_production                       │  │
│  │  - Automated backups: Daily 3:00 AM UTC           │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Secret Manager                                   │  │
│  │  - DATABASE_URL, JWT_SECRET                       │  │
│  │  - UPR_ADMIN_USER, UPR_ADMIN_PASS                 │  │
│  │  - API Keys (Apollo, OpenAI, etc.)                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Service Accounts

**Cloud Run Service Account**: `upr-runner@applied-algebra-474804-e6.iam.gserviceaccount.com`

**Required Permissions**:
- `cloudsql.client` (Cloud SQL access)
- `secretmanager.secretAccessor` (Secret Manager access)
- `logging.logWriter` (Cloud Logging)
- `monitoring.metricWriter` (Cloud Monitoring)

---

## Access Management

### Administrator Authentication

The UPR system uses JWT-based authentication with admin credentials stored in Secret Manager.

#### Admin Credentials

**Username**: Retrieved from `UPR_ADMIN_USER` secret
**Password**: Retrieved from `UPR_ADMIN_PASS` secret

#### Viewing Current Admin Credentials

```bash
# View admin username
gcloud secrets versions access latest \
  --secret="UPR_ADMIN_USER" \
  --project=applied-algebra-474804-e6

# View admin password (use with caution)
gcloud secrets versions access latest \
  --secret="UPR_ADMIN_PASS" \
  --project=applied-algebra-474804-e6
```

#### Rotating Admin Credentials

**Step 1**: Generate new secure password

```bash
# Generate a strong password
NEW_PASSWORD=$(openssl rand -base64 32)
echo "New password: $NEW_PASSWORD"
```

**Step 2**: Update Secret Manager

```bash
# Update admin password secret
echo -n "$NEW_PASSWORD" | gcloud secrets versions add UPR_ADMIN_PASS \
  --data-file=- \
  --project=applied-algebra-474804-e6

# Verify new version is active
gcloud secrets versions list UPR_ADMIN_PASS \
  --project=applied-algebra-474804-e6
```

**Step 3**: Restart Cloud Run service to pick up new secret

```bash
gcloud run services update upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6
```

**Step 4**: Test authentication

```bash
# Get Cloud Run URL
URL=$(gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format='value(status.url)')

# Test login
curl -X POST "$URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$NEW_PASSWORD\"}"
```

#### Adding New Users (Future RBAC)

Currently, the system supports a single admin user. For multi-user support:

1. **Database Schema**: Add users table
2. **Authentication**: Implement user registration endpoint
3. **Authorization**: Implement role-based access control (RBAC)
4. **Audit**: Log all user actions

---

## Database Administration

### Connection Details

**Instance**: `upr-postgres`
**Connection Name**: `applied-algebra-474804-e6:us-central1:upr-postgres`
**Public IP**: `34.121.0.240:5432`
**Database**: `upr_production`
**Application User**: `upr_app`

### Connecting to the Database

#### Option 1: Cloud SQL Proxy (Recommended)

```bash
# Download Cloud SQL Proxy
curl -o cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy

# Start proxy
./cloud-sql-proxy applied-algebra-474804-e6:us-central1:upr-postgres \
  --port 5432

# Connect via psql (in another terminal)
psql "postgresql://upr_app@localhost:5432/upr_production"
```

#### Option 2: Direct Connection (Public IP)

```bash
# Connect directly (requires authorized network)
psql "postgresql://upr_app@34.121.0.240:5432/upr_production?sslmode=require"
```

#### Option 3: gcloud sql connect

```bash
gcloud sql connect upr-postgres \
  --user=upr_app \
  --database=upr_production \
  --project=applied-algebra-474804-e6
```

### Database Backups

#### Automated Backups

**Schedule**: Daily at 3:00 AM UTC
**Retention**: 7 days
**Point-in-time Recovery**: Enabled (7-day retention)

#### Viewing Backup Status

```bash
# List all backups
gcloud sql backups list \
  --instance=upr-postgres \
  --project=applied-algebra-474804-e6

# Describe specific backup
gcloud sql backups describe [BACKUP_ID] \
  --instance=upr-postgres \
  --project=applied-algebra-474804-e6
```

#### Creating Manual Backup

```bash
# Create on-demand backup
gcloud sql backups create \
  --instance=upr-postgres \
  --description="Pre-migration backup $(date +%Y-%m-%d)" \
  --project=applied-algebra-474804-e6
```

#### Using Backup Script

```bash
# Run local backup script
./scripts/backup-db.sh

# This creates a compressed backup in ./backups/
# Format: upr_db_backup_YYYYMMDD_HHMMSS.sql.gz
```

### Database Migrations

#### Current Migration Status

```bash
# Connect to database
psql "postgresql://upr_app@34.121.0.240:5432/upr_production?sslmode=require"

# Check applied migrations
\dt migrations

# View migration history (if migration tracking table exists)
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 10;
```

#### Applying New Migrations

```bash
# 1. Test migration on development database first
psql "postgresql://upr_app@localhost:5432/upr_dev" < db/migrations/new_migration.sql

# 2. Create backup before production migration
gcloud sql backups create \
  --instance=upr-postgres \
  --description="Pre-migration backup" \
  --project=applied-algebra-474804-e6

# 3. Apply to production
psql "postgresql://upr_app@34.121.0.240:5432/upr_production?sslmode=require" \
  < db/migrations/new_migration.sql

# 4. Verify migration
psql "postgresql://upr_app@34.121.0.240:5432/upr_production?sslmode=require" \
  -c "SELECT COUNT(*) FROM [new_table];"
```

#### Rolling Back Migration

```bash
# If migration includes rollback SQL
psql "postgresql://upr_app@34.121.0.240:5432/upr_production?sslmode=require" \
  < db/migrations/rollback_migration.sql

# Alternative: Restore from backup
gcloud sql backups restore [BACKUP_ID] \
  --backup-instance=upr-postgres \
  --backup-project=applied-algebra-474804-e6 \
  --instance=upr-postgres \
  --project=applied-algebra-474804-e6
```

### Database Monitoring

#### Active Connections

```sql
-- View current connections
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  query,
  backend_start,
  state_change
FROM pg_stat_activity
WHERE datname = 'upr_production'
ORDER BY backend_start DESC;
```

#### Database Size

```sql
-- Check database size
SELECT
  pg_database.datname,
  pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database
WHERE datname = 'upr_production';

-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
```

#### Slow Queries

```sql
-- Enable pg_stat_statements extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View slow queries
SELECT
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time,
  rows
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- queries averaging > 100ms
ORDER BY mean_exec_time DESC
LIMIT 20;
```

#### Index Usage

```sql
-- Check unused indexes
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Database Maintenance

#### Vacuum and Analyze

```sql
-- Vacuum analyze all tables
VACUUM ANALYZE;

-- Vacuum specific table
VACUUM ANALYZE hr_leads;

-- Full vacuum (requires exclusive lock - use during maintenance window)
VACUUM FULL ANALYZE companies;
```

#### Reindexing

```sql
-- Reindex specific index
REINDEX INDEX idx_hr_leads_company_id;

-- Reindex table
REINDEX TABLE hr_leads;

-- Reindex database (during maintenance window)
REINDEX DATABASE upr_production;
```

---

## Application Configuration

### Environment Variables

All sensitive configuration is stored in Google Cloud Secret Manager.

#### Listing All Secrets

```bash
gcloud secrets list \
  --project=applied-algebra-474804-e6 \
  --format="table(name,createTime,labels)"
```

#### Viewing Secret Values

```bash
# Database connection string
gcloud secrets versions access latest \
  --secret="DATABASE_URL" \
  --project=applied-algebra-474804-e6

# JWT secret
gcloud secrets versions access latest \
  --secret="JWT_SECRET" \
  --project=applied-algebra-474804-e6

# API keys
gcloud secrets versions access latest --secret="APOLLO_API_KEY" --project=applied-algebra-474804-e6
gcloud secrets versions access latest --secret="OPENAI_API_KEY" --project=applied-algebra-474804-e6
gcloud secrets versions access latest --secret="SERPAPI_KEY" --project=applied-algebra-474804-e6
```

#### Updating Secrets

```bash
# Update database URL
echo -n "postgresql://upr_app:PASSWORD@/upr_production?host=/cloudsql/applied-algebra-474804-e6:us-central1:upr-postgres" | \
  gcloud secrets versions add DATABASE_URL \
  --data-file=- \
  --project=applied-algebra-474804-e6

# Update API key
echo -n "sk-..." | \
  gcloud secrets versions add OPENAI_API_KEY \
  --data-file=- \
  --project=applied-algebra-474804-e6

# Restart service to pick up new secrets
gcloud run services update upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6
```

#### Creating New Secrets

```bash
# Create new secret
gcloud secrets create NEW_SECRET_NAME \
  --replication-policy="automatic" \
  --project=applied-algebra-474804-e6

# Add initial value
echo -n "secret_value" | \
  gcloud secrets versions add NEW_SECRET_NAME \
  --data-file=- \
  --project=applied-algebra-474804-e6

# Grant service account access
gcloud secrets add-iam-policy-binding NEW_SECRET_NAME \
  --member="serviceAccount:upr-runner@applied-algebra-474804-e6.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=applied-algebra-474804-e6
```

### Cloud Run Configuration

#### Viewing Current Configuration

```bash
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format=yaml
```

#### Updating Resource Limits

```bash
# Update CPU and memory
gcloud run services update upr-web-service \
  --region=us-central1 \
  --cpu=2 \
  --memory=2Gi \
  --project=applied-algebra-474804-e6

# Update scaling settings
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=1 \
  --max-instances=10 \
  --project=applied-algebra-474804-e6

# Update concurrency
gcloud run services update upr-web-service \
  --region=us-central1 \
  --concurrency=100 \
  --project=applied-algebra-474804-e6
```

#### Updating Environment Variables

```bash
# Update single environment variable
gcloud run services update upr-web-service \
  --region=us-central1 \
  --set-env-vars="NODE_ENV=production,MAX_POOL_SIZE=20" \
  --project=applied-algebra-474804-e6

# Add new secret reference
gcloud run services update upr-web-service \
  --region=us-central1 \
  --update-secrets="NEW_VAR=NEW_SECRET_NAME:latest" \
  --project=applied-algebra-474804-e6
```

### Deploying New Versions

#### Using Deployment Script

```bash
# Review deployment script
cat scripts/deploy-safe.sh

# Run deployment
./scripts/deploy-safe.sh

# Or use npm script
npm run deploy
```

#### Manual Deployment

```bash
# 1. Build container
gcloud builds submit --tag us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo/upr-web-service:latest \
  --project=applied-algebra-474804-e6

# 2. Deploy to Cloud Run
gcloud run deploy upr-web-service \
  --image=us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo/upr-web-service:latest \
  --region=us-central1 \
  --platform=managed \
  --project=applied-algebra-474804-e6

# 3. Verify deployment
curl https://$(gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format='value(status.url)')/health
```

#### Rolling Back Deployment

```bash
# List revisions
gcloud run revisions list \
  --service=upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6

# Roll back to specific revision
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=[REVISION_NAME]=100 \
  --project=applied-algebra-474804-e6
```

---

## Monitoring and Logging

### Cloud Logging

#### Viewing Application Logs

```bash
# View recent logs
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=100 \
  --project=applied-algebra-474804-e6

# Tail logs in real-time
gcloud run services logs tail upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6

# Filter by severity
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=50 \
  --log-filter="severity>=ERROR" \
  --project=applied-algebra-474804-e6
```

#### Advanced Log Queries

```bash
# Search for specific errors
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=upr-web-service \
  AND textPayload=~\"database connection failed\"" \
  --limit=50 \
  --project=applied-algebra-474804-e6

# View logs from specific time range
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=upr-web-service \
  AND timestamp>=\"2025-11-19T00:00:00Z\" \
  AND timestamp<=\"2025-11-19T23:59:59Z\"" \
  --project=applied-algebra-474804-e6

# Export logs to BigQuery
gcloud logging sinks create upr-logs-bigquery \
  bigquery.googleapis.com/projects/applied-algebra-474804-e6/datasets/upr_logs \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="upr-web-service"' \
  --project=applied-algebra-474804-e6
```

### Health Checks

#### Application Health Endpoints

```bash
# Get Cloud Run URL
URL=$(gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format='value(status.url)')

# Basic health check
curl "$URL/health"
# Expected: {"status":"ok","timestamp":"...","uptime":123,"port":8080}

# Readiness check (includes DB connection test)
curl "$URL/ready"
# Expected: {"status":"ready","database":"connected"}

# Embedding system health
curl "$URL/health/embeddings"
```

#### Database Health

```bash
# Check Cloud SQL instance status
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="table(state,databaseVersion,settings.tier,ipAddresses)"

# Check database connectivity
gcloud sql connect upr-postgres \
  --user=upr_app \
  --database=upr_production \
  --project=applied-algebra-474804-e6 \
  -c "SELECT 1;"
```

### Cloud Monitoring

#### Viewing Metrics

```bash
# CPU utilization
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/cpu/utilizations" AND resource.labels.service_name="upr-web-service"' \
  --project=applied-algebra-474804-e6

# Memory utilization
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/memory/utilizations" AND resource.labels.service_name="upr-web-service"' \
  --project=applied-algebra-474804-e6

# Request count
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count" AND resource.labels.service_name="upr-web-service"' \
  --project=applied-algebra-474804-e6
```

#### Setting Up Alerts

```bash
# Create CPU alert policy
gcloud alpha monitoring policies create \
  --notification-channels=[CHANNEL_ID] \
  --display-name="UPR High CPU Alert" \
  --condition-display-name="CPU > 80%" \
  --condition-threshold-value=0.8 \
  --condition-threshold-duration=300s \
  --condition-threshold-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="upr-web-service" AND metric.type="run.googleapis.com/container/cpu/utilizations"' \
  --project=applied-algebra-474804-e6

# Create error rate alert
gcloud alpha monitoring policies create \
  --notification-channels=[CHANNEL_ID] \
  --display-name="UPR High Error Rate" \
  --condition-display-name="Error rate > 1%" \
  --condition-threshold-value=0.01 \
  --condition-threshold-duration=60s \
  --project=applied-algebra-474804-e6
```

### Application Performance Monitoring

#### Key Performance Metrics

Monitor these metrics in the database:

```sql
-- Agent decision performance
SELECT
  tool_name,
  COUNT(*) as executions,
  AVG(execution_time_ms) as avg_latency_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY execution_time_ms) as p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_ms,
  AVG(confidence) as avg_confidence
FROM agent_decisions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY tool_name
ORDER BY executions DESC;

-- Lifecycle state distribution
SELECT
  state,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM opportunity_current_state
GROUP BY state
ORDER BY count DESC;

-- Lead score distribution
SELECT
  grade,
  COUNT(*) as count,
  MIN(lead_score) as min_score,
  MAX(lead_score) as max_score,
  ROUND(AVG(lead_score), 0) as avg_score
FROM lead_scores
GROUP BY grade
ORDER BY grade;
```

---

## Security Hardening

### Security Best Practices

#### 1. Rotate Credentials Regularly

```bash
# Rotate admin password (quarterly)
NEW_PASS=$(openssl rand -base64 32)
echo -n "$NEW_PASS" | gcloud secrets versions add UPR_ADMIN_PASS --data-file=- \
  --project=applied-algebra-474804-e6

# Rotate JWT secret (annually)
NEW_JWT=$(openssl rand -base64 64)
echo -n "$NEW_JWT" | gcloud secrets versions add JWT_SECRET --data-file=- \
  --project=applied-algebra-474804-e6

# Restart service
gcloud run services update upr-web-service --region=us-central1 \
  --project=applied-algebra-474804-e6
```

#### 2. Review IAM Permissions

```bash
# List service account permissions
gcloud projects get-iam-policy applied-algebra-474804-e6 \
  --flatten="bindings[].members" \
  --format="table(bindings.role)" \
  --filter="bindings.members:upr-runner@applied-algebra-474804-e6.iam.gserviceaccount.com"

# Audit secret access
gcloud secrets get-iam-policy DATABASE_URL \
  --project=applied-algebra-474804-e6
```

#### 3. Enable Audit Logging

```bash
# View audit logs
gcloud logging read "protoPayload.serviceName=secretmanager.googleapis.com" \
  --limit=50 \
  --project=applied-algebra-474804-e6

# Track database access
gcloud logging read "resource.type=cloudsql_database \
  AND protoPayload.authenticationInfo.principalEmail!=\"\"" \
  --limit=50 \
  --project=applied-algebra-474804-e6
```

#### 4. Database Security

```sql
-- Review database users
SELECT
  usename as username,
  usesuper as is_superuser,
  usecreatedb as can_create_db,
  valuntil as password_expires
FROM pg_user;

-- Review database permissions
SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'upr_app'
ORDER BY table_schema, table_name;

-- Check for suspicious connections
SELECT
  usename,
  client_addr,
  COUNT(*) as connection_count,
  MAX(backend_start) as last_connection
FROM pg_stat_activity
WHERE datname = 'upr_production'
GROUP BY usename, client_addr
ORDER BY connection_count DESC;
```

#### 5. API Rate Limiting

Rate limits are enforced at the application level:

- General API: 100 requests/15 minutes
- Auth endpoints: 5 requests/15 minutes
- Enrichment: 20 requests/15 minutes
- RADAR: 5 requests/hour

Monitor rate limit violations:

```bash
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=upr-web-service \
  AND textPayload=~\"Rate limit exceeded\"" \
  --limit=50 \
  --project=applied-algebra-474804-e6
```

### Security Audit Checklist

Run this monthly:

```bash
# 1. Check for exposed secrets in logs
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=upr-web-service \
  AND (textPayload=~\"password\" OR textPayload=~\"secret\" OR textPayload=~\"api_key\")" \
  --limit=10 \
  --project=applied-algebra-474804-e6

# 2. Review secret versions (old versions should be disabled)
for secret in DATABASE_URL JWT_SECRET UPR_ADMIN_PASS OPENAI_API_KEY; do
  echo "=== $secret ==="
  gcloud secrets versions list $secret --project=applied-algebra-474804-e6
done

# 3. Check for unauthorized IP access to Cloud SQL
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="value(settings.ipConfiguration.authorizedNetworks)"

# 4. Review Cloud Run IAM bindings
gcloud run services get-iam-policy upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6
```

---

## Backup and Recovery

### Backup Strategy

**Automated Backups**:
- Cloud SQL automated backups: Daily at 3:00 AM UTC
- Retention: 7 days
- Point-in-time recovery: Enabled (7-day window)

**Manual Backups**:
- Before major migrations
- Before schema changes
- Weekly full exports (via script)

### Creating Backups

#### Cloud SQL Backup

```bash
# Create backup with description
gcloud sql backups create \
  --instance=upr-postgres \
  --description="Manual backup before migration - $(date +%Y-%m-%d)" \
  --project=applied-algebra-474804-e6

# Verify backup created
gcloud sql backups list \
  --instance=upr-postgres \
  --limit=5 \
  --project=applied-algebra-474804-e6
```

#### Local Backup Script

```bash
# Run backup script
./scripts/backup-db.sh

# Output: ./backups/upr_db_backup_YYYYMMDD_HHMMSS.sql.gz

# Upload to Cloud Storage (optional)
gsutil cp backups/upr_db_backup_*.sql.gz gs://upr-backups/
```

#### Export to Cloud Storage

```bash
# Create bucket (if not exists)
gsutil mb -p applied-algebra-474804-e6 -l us-central1 gs://upr-backups/

# Export database
gcloud sql export sql upr-postgres \
  gs://upr-backups/export-$(date +%Y%m%d-%H%M%S).sql \
  --database=upr_production \
  --project=applied-algebra-474804-e6

# Export specific tables
gcloud sql export sql upr-postgres \
  gs://upr-backups/export-critical-$(date +%Y%m%d-%H%M%S).sql \
  --database=upr_production \
  --table=hr_leads,companies,agent_decisions \
  --project=applied-algebra-474804-e6
```

### Restore Procedures

#### Restore from Cloud SQL Backup

```bash
# List available backups
gcloud sql backups list \
  --instance=upr-postgres \
  --project=applied-algebra-474804-e6

# Restore from backup (THIS WILL OVERWRITE DATABASE)
gcloud sql backups restore [BACKUP_ID] \
  --backup-instance=upr-postgres \
  --instance=upr-postgres \
  --project=applied-algebra-474804-e6

# Alternative: Restore to new instance
gcloud sql instances create upr-postgres-restored \
  --backup=[BACKUP_ID] \
  --backup-instance=upr-postgres \
  --project=applied-algebra-474804-e6
```

#### Restore from Local Backup

```bash
# Decompress backup
gunzip backups/upr_db_backup_YYYYMMDD_HHMMSS.sql.gz

# Restore to database
pg_restore -h 34.121.0.240 \
  -U upr_app \
  -d upr_production \
  -c \
  -v \
  backups/upr_db_backup_YYYYMMDD_HHMMSS.sql
```

#### Point-in-Time Recovery

```bash
# Restore to specific timestamp
gcloud sql backups restore [BACKUP_ID] \
  --backup-instance=upr-postgres \
  --instance=upr-postgres \
  --backup-location=us-central1 \
  --point-in-time="2025-11-19T14:30:00Z" \
  --project=applied-algebra-474804-e6
```

### Disaster Recovery Plan

#### RTO/RPO Targets

- **RTO (Recovery Time Objective)**: < 15 minutes
- **RPO (Recovery Point Objective)**: < 5 minutes

#### Recovery Procedures

**Scenario 1: Application Failure**

```bash
# 1. Check service status
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6

# 2. View recent logs
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=100 \
  --project=applied-algebra-474804-e6

# 3. Restart service
gcloud run services update upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6

# 4. Roll back if needed
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=[PREVIOUS_REVISION]=100 \
  --project=applied-algebra-474804-e6
```

**Scenario 2: Database Corruption**

```bash
# 1. Stop application (prevent further writes)
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=0 \
  --project=applied-algebra-474804-e6

# 2. Restore from latest backup
gcloud sql backups list --instance=upr-postgres \
  --limit=1 \
  --project=applied-algebra-474804-e6

LATEST_BACKUP=$(gcloud sql backups list \
  --instance=upr-postgres \
  --limit=1 \
  --format="value(id)" \
  --project=applied-algebra-474804-e6)

gcloud sql backups restore $LATEST_BACKUP \
  --backup-instance=upr-postgres \
  --instance=upr-postgres \
  --project=applied-algebra-474804-e6

# 3. Verify database integrity
gcloud sql connect upr-postgres \
  --user=upr_app \
  --database=upr_production \
  --project=applied-algebra-474804-e6

# 4. Resume application
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=5 \
  --project=applied-algebra-474804-e6
```

**Scenario 3: Complete Region Failure**

```bash
# 1. Create database replica in different region
gcloud sql instances create upr-postgres-replica \
  --master-instance-name=upr-postgres \
  --region=us-east1 \
  --project=applied-algebra-474804-e6

# 2. Promote replica to standalone
gcloud sql instances promote-replica upr-postgres-replica \
  --project=applied-algebra-474804-e6

# 3. Deploy application to new region
gcloud run deploy upr-web-service \
  --image=us-central1-docker.pkg.dev/applied-algebra-474804-e6/upr-app-repo/upr-web-service:latest \
  --region=us-east1 \
  --platform=managed \
  --project=applied-algebra-474804-e6

# 4. Update DNS/load balancer to point to new region
```

---

## Incident Response

### Common Issues and Solutions

#### Issue 1: High Error Rate

**Symptoms**: Increased 5xx errors, user complaints

**Diagnosis**:

```bash
# Check error logs
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=100 \
  --log-filter="severity>=ERROR" \
  --project=applied-algebra-474804-e6

# Check database connections
psql "postgresql://upr_app@34.121.0.240:5432/upr_production?sslmode=require" \
  -c "SELECT COUNT(*) as active_connections FROM pg_stat_activity WHERE datname='upr_production';"
```

**Solutions**:

```bash
# 1. Increase instance count if CPU/memory high
gcloud run services update upr-web-service \
  --region=us-central1 \
  --max-instances=10 \
  --project=applied-algebra-474804-e6

# 2. Increase database connection pool
# (Update MAX_POOL_SIZE in application code and redeploy)

# 3. Roll back to previous revision if recent deployment
gcloud run revisions list \
  --service=upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6

gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=[STABLE_REVISION]=100 \
  --project=applied-algebra-474804-e6
```

#### Issue 2: Database Connection Timeouts

**Symptoms**: "Connection timeout" errors, slow queries

**Diagnosis**:

```sql
-- Check for long-running queries
SELECT
  pid,
  now() - query_start as duration,
  state,
  query
FROM pg_stat_activity
WHERE state != 'idle'
  AND now() - query_start > interval '1 minute'
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
```

**Solutions**:

```sql
-- Kill long-running query
SELECT pg_terminate_backend([PID]);

-- Vacuum to reduce bloat
VACUUM ANALYZE;
```

#### Issue 3: Out of Memory

**Symptoms**: Service crashes, OOM errors in logs

**Diagnosis**:

```bash
# Check memory usage metrics
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/memory/utilizations" AND resource.labels.service_name="upr-web-service"' \
  --project=applied-algebra-474804-e6
```

**Solutions**:

```bash
# Increase memory allocation
gcloud run services update upr-web-service \
  --region=us-central1 \
  --memory=2Gi \
  --project=applied-algebra-474804-e6

# Review application code for memory leaks
# Check for large result sets, unbounded arrays, etc.
```

#### Issue 4: API Key Exhaustion

**Symptoms**: "Rate limit exceeded" from external APIs

**Diagnosis**:

```bash
# Check API usage logs
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=upr-web-service \
  AND (textPayload=~\"apollo\" OR textPayload=~\"openai\")" \
  --limit=50 \
  --project=applied-algebra-474804-e6
```

**Solutions**:

```sql
-- Check API usage in database
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as enrichment_count
FROM enrichment_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Implement stricter rate limiting
-- Review and optimize API call patterns
```

### Incident Response Playbook

**Step 1: Assess Severity**

- P0 (Critical): Complete service outage
- P1 (High): Degraded performance, partial outage
- P2 (Medium): Minor issues, no user impact
- P3 (Low): Cosmetic issues

**Step 2: Immediate Actions**

```bash
# For P0/P1 incidents:

# 1. Check service health
curl https://$(gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format='value(status.url)')/health

# 2. Review recent deployments
gcloud run revisions list \
  --service=upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --limit=5

# 3. Check error logs
gcloud run services logs read upr-web-service \
  --region=us-central1 \
  --limit=50 \
  --log-filter="severity>=ERROR" \
  --project=applied-algebra-474804-e6

# 4. Roll back if recent deployment caused issue
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=[STABLE_REVISION]=100 \
  --project=applied-algebra-474804-e6
```

**Step 3: Root Cause Analysis**

Document:
- Timeline of events
- Initial detection method
- Impact scope (users affected, duration)
- Root cause
- Resolution steps
- Preventive measures

**Step 4: Post-Incident Review**

- Update runbooks
- Improve monitoring/alerts
- Implement preventive measures
- Share learnings with team

---

## Performance Tuning

### Application Performance

#### Database Query Optimization

```sql
-- Enable query timing
\timing on

-- Analyze query plan
EXPLAIN ANALYZE
SELECT
  hl.id,
  hl.contact_name,
  c.name as company_name,
  ls.lead_score
FROM hr_leads hl
JOIN companies c ON hl.company_id = c.id
LEFT JOIN lead_scores ls ON hl.id = ls.opportunity_id
WHERE ls.lead_score > 5000
ORDER BY ls.lead_score DESC
LIMIT 100;

-- Create indexes for slow queries
CREATE INDEX CONCURRENTLY idx_lead_scores_score
ON lead_scores(lead_score DESC)
WHERE lead_score > 5000;
```

#### Connection Pool Tuning

Edit `/Users/skc/DataScience/upr/utils/db.js`:

```javascript
// Recommended settings for production
{
  max: 20,                         // Max connections per instance
  min: 2,                          // Min idle connections
  idleTimeoutMillis: 30000,        // 30s idle timeout
  connectionTimeoutMillis: 10000,  // 10s connection timeout
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
}
```

#### Caching Strategy

```bash
# Check Redis connection
redis-cli -u $REDIS_URL ping

# Monitor cache hit rate
redis-cli -u $REDIS_URL INFO stats | grep keyspace_hits
redis-cli -u $REDIS_URL INFO stats | grep keyspace_misses

# Clear cache if needed
redis-cli -u $REDIS_URL FLUSHDB
```

### Database Performance

#### Index Optimization

```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;

-- Create missing indexes
CREATE INDEX CONCURRENTLY idx_agent_decisions_company_id
ON agent_decisions(company_id)
WHERE company_id IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_agent_decisions_created_at
ON agent_decisions(created_at DESC);

-- Drop unused indexes (carefully!)
DROP INDEX CONCURRENTLY idx_unused_index;
```

#### Table Maintenance

```sql
-- Check table bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  n_dead_tup,
  n_live_tup,
  ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;

-- Schedule regular maintenance
-- Run during low-traffic periods
VACUUM ANALYZE VERBOSE;
```

#### Autovacuum Tuning

```sql
-- Check autovacuum settings
SHOW autovacuum;
SHOW autovacuum_naptime;
SHOW autovacuum_vacuum_threshold;

-- Adjust for specific high-volume tables
ALTER TABLE agent_decisions SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
```

---

## Maintenance Procedures

### Routine Maintenance Schedule

**Daily**:
- Review error logs
- Check service health
- Monitor key metrics

**Weekly**:
- Review performance metrics
- Check database size and growth
- Test backup restore procedure
- Review slow queries

**Monthly**:
- Security audit
- Rotate credentials
- Review and optimize indexes
- Cleanup old data
- Cost analysis

**Quarterly**:
- Disaster recovery drill
- Capacity planning review
- Update dependencies
- Security patches

### Database Cleanup

#### Archive Old Data

```sql
-- Archive old agent decisions (> 90 days)
CREATE TABLE agent_decisions_archive (LIKE agent_decisions INCLUDING ALL);

INSERT INTO agent_decisions_archive
SELECT * FROM agent_decisions
WHERE created_at < NOW() - INTERVAL '90 days';

DELETE FROM agent_decisions
WHERE created_at < NOW() - INTERVAL '90 days';

-- Vacuum to reclaim space
VACUUM FULL ANALYZE agent_decisions;
```

#### Remove Stale Sessions

```sql
-- Clean up old lifecycle records (completed > 1 year)
DELETE FROM opportunity_lifecycle
WHERE exited_at IS NOT NULL
  AND exited_at < NOW() - INTERVAL '1 year';

-- Clean up old score history (> 6 months)
DELETE FROM score_history
WHERE created_at < NOW() - INTERVAL '6 months';
```

### Application Updates

#### Updating Dependencies

```bash
# 1. Update package.json
npm outdated
npm update

# 2. Test locally
npm test
npm run build

# 3. Deploy to staging (if available)
# Deploy to production
./scripts/deploy-safe.sh
```

#### Database Schema Updates

```bash
# 1. Create migration file
cat > db/migrations/2025_11_20_new_feature.sql << 'EOF'
-- Migration: Add new feature
-- Date: 2025-11-20

BEGIN;

-- Your schema changes here
ALTER TABLE hr_leads ADD COLUMN new_field TEXT;
CREATE INDEX idx_hr_leads_new_field ON hr_leads(new_field);

-- Rollback script (commented)
-- ALTER TABLE hr_leads DROP COLUMN new_field;

COMMIT;
EOF

# 2. Test on development database
psql "postgresql://upr_app@localhost:5432/upr_dev" < db/migrations/2025_11_20_new_feature.sql

# 3. Backup production database
gcloud sql backups create \
  --instance=upr-postgres \
  --description="Pre-migration backup" \
  --project=applied-algebra-474804-e6

# 4. Apply to production
psql "postgresql://upr_app@34.121.0.240:5432/upr_production?sslmode=require" \
  < db/migrations/2025_11_20_new_feature.sql
```

---

## Scaling Operations

### Horizontal Scaling (Cloud Run)

#### Auto-Scaling Configuration

```bash
# Configure auto-scaling
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=1 \
  --max-instances=20 \
  --concurrency=80 \
  --cpu-throttling \
  --project=applied-algebra-474804-e6

# For consistent traffic, increase min instances
gcloud run services update upr-web-service \
  --region=us-central1 \
  --min-instances=3 \
  --project=applied-algebra-474804-e6
```

#### Scaling Metrics

```bash
# Monitor instance count
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format="value(status.traffic[0].revisionName,status.traffic[0].percent)"

# View scaling events
gcloud logging read "resource.type=cloud_run_revision \
  AND resource.labels.service_name=upr-web-service \
  AND textPayload=~\"Scaled\"" \
  --limit=20 \
  --project=applied-algebra-474804-e6
```

### Vertical Scaling

#### CPU and Memory

```bash
# Scale up resources
gcloud run services update upr-web-service \
  --region=us-central1 \
  --cpu=2 \
  --memory=2Gi \
  --project=applied-algebra-474804-e6

# Scale down (during low-traffic periods)
gcloud run services update upr-web-service \
  --region=us-central1 \
  --cpu=1 \
  --memory=1Gi \
  --project=applied-algebra-474804-e6
```

### Database Scaling

#### Vertical Scaling (Cloud SQL)

```bash
# Upgrade machine type
gcloud sql instances patch upr-postgres \
  --tier=db-custom-4-15360 \
  --project=applied-algebra-474804-e6

# Increase storage
gcloud sql instances patch upr-postgres \
  --storage-size=200GB \
  --project=applied-algebra-474804-e6
```

#### Read Replicas (Future)

```bash
# Create read replica
gcloud sql instances create upr-postgres-read-replica \
  --master-instance-name=upr-postgres \
  --region=us-central1 \
  --tier=db-custom-2-7680 \
  --project=applied-algebra-474804-e6

# Configure application to use read replica for queries
# Update DATABASE_READ_URL secret
```

### Capacity Planning

#### Estimating Resource Needs

```sql
-- Estimate database growth
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Calculate daily growth rate
WITH daily_counts AS (
  SELECT DATE(created_at) as day, COUNT(*) as count
  FROM hr_leads
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY DATE(created_at)
)
SELECT
  AVG(count) as avg_daily_leads,
  MAX(count) as peak_daily_leads
FROM daily_counts;
```

---

## Common Administrative Tasks

### Task 1: Adding a New Admin User (Future)

*Note: Currently single-user. This will be implemented in future RBAC system.*

### Task 2: Reviewing Agent Performance

```sql
-- Get agent decision statistics
SELECT
  tool_name,
  COUNT(*) as total_decisions,
  AVG(execution_time_ms) as avg_time_ms,
  AVG(confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE confidence < 0.60) as low_confidence_count,
  COUNT(*) FILTER (WHERE confidence >= 0.90) as high_confidence_count
FROM agent_decisions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tool_name
ORDER BY total_decisions DESC;

-- Get agent overrides (human corrections)
SELECT
  d.tool_name,
  COUNT(o.id) as override_count,
  AVG(o.score_delta) as avg_score_change
FROM agent_overrides o
JOIN agent_decisions d ON o.decision_id = d.id
WHERE o.created_at > NOW() - INTERVAL '30 days'
GROUP BY d.tool_name
ORDER BY override_count DESC;
```

### Task 3: Monitoring Lead Quality

```sql
-- Lead score distribution
SELECT
  grade,
  COUNT(*) as count,
  ROUND(AVG(lead_score), 0) as avg_score,
  ROUND(AVG(q_score), 0) as avg_quality,
  ROUND(AVG(engagement_score), 0) as avg_engagement,
  ROUND(AVG(fit_score), 0) as avg_fit
FROM lead_scores
WHERE calculated_at > NOW() - INTERVAL '7 days'
GROUP BY grade
ORDER BY grade;

-- Top performing companies
SELECT
  c.name,
  c.domain,
  COUNT(hl.id) as lead_count,
  ROUND(AVG(ls.lead_score), 0) as avg_lead_score
FROM companies c
JOIN hr_leads hl ON c.id = hl.company_id
LEFT JOIN lead_scores ls ON hl.id = ls.opportunity_id
WHERE hl.created_at > NOW() - INTERVAL '30 days'
GROUP BY c.id, c.name, c.domain
ORDER BY avg_lead_score DESC NULLS LAST
LIMIT 20;
```

### Task 4: Clearing Cache

```bash
# Clear Redis cache
redis-cli -u $REDIS_URL FLUSHDB

# Clear specific keys
redis-cli -u $REDIS_URL DEL "cache:company:*"
redis-cli -u $REDIS_URL DEL "cache:email_pattern:*"

# View cache statistics
redis-cli -u $REDIS_URL INFO memory
redis-cli -u $REDIS_URL DBSIZE
```

### Task 5: Exporting Lead Data

```sql
-- Export high-value leads to CSV
\copy (
  SELECT
    hl.contact_name,
    hl.contact_email,
    hl.contact_title,
    hl.contact_tier,
    c.name as company_name,
    c.domain,
    ls.lead_score,
    ls.grade,
    ocs.state as lifecycle_state
  FROM hr_leads hl
  JOIN companies c ON hl.company_id = c.id
  LEFT JOIN lead_scores ls ON hl.id = ls.opportunity_id
  LEFT JOIN opportunity_current_state ocs ON hl.id = ocs.opportunity_id
  WHERE ls.grade IN ('A+', 'A')
    AND hl.created_at > NOW() - INTERVAL '30 days'
  ORDER BY ls.lead_score DESC
) TO '/tmp/high_value_leads.csv' WITH CSV HEADER;
```

### Task 6: Checking System Costs

```bash
# Check GCP costs
gcloud billing accounts list

# Estimate Cloud Run costs
gcloud run services describe upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6 \
  --format="table(metadata.name,spec.template.spec.containers[0].resources.limits)"

# View Cloud SQL pricing
gcloud sql instances describe upr-postgres \
  --project=applied-algebra-474804-e6 \
  --format="table(name,settings.tier,settings.dataDiskSizeGb)"

# Check secret manager usage
gcloud secrets list --project=applied-algebra-474804-e6 --format="table(name)"
```

### Task 7: Testing Email Patterns

```sql
-- View recent email pattern performance
SELECT
  domain,
  pattern,
  confidence,
  sample_size,
  last_verified
FROM email_patterns
WHERE last_verified > NOW() - INTERVAL '7 days'
ORDER BY confidence DESC
LIMIT 20;

-- Check pattern failures
SELECT
  domain,
  attempted_pattern,
  COUNT(*) as failure_count,
  MAX(created_at) as last_failure
FROM pattern_failures
WHERE learned_from = false
GROUP BY domain, attempted_pattern
ORDER BY failure_count DESC
LIMIT 20;
```

### Task 8: Updating API Keys

```bash
# Update OpenAI API key
echo -n "sk-new-api-key" | gcloud secrets versions add OPENAI_API_KEY \
  --data-file=- \
  --project=applied-algebra-474804-e6

# Update Apollo API key
echo -n "new-apollo-key" | gcloud secrets versions add APOLLO_API_KEY \
  --data-file=- \
  --project=applied-algebra-474804-e6

# Restart service to use new keys
gcloud run services update upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6

# Test new keys
curl "$URL/health"
```

---

## Quick Reference

### Essential Commands

```bash
# Service health
curl https://[SERVICE_URL]/health

# View logs
gcloud run services logs tail upr-web-service \
  --region=us-central1 \
  --project=applied-algebra-474804-e6

# Connect to database
psql "postgresql://upr_app@34.121.0.240:5432/upr_production?sslmode=require"

# Create backup
gcloud sql backups create --instance=upr-postgres \
  --project=applied-algebra-474804-e6

# Deploy new version
./scripts/deploy-safe.sh

# Roll back deployment
gcloud run services update-traffic upr-web-service \
  --region=us-central1 \
  --to-revisions=[REVISION]=100 \
  --project=applied-algebra-474804-e6
```

### Important URLs

- **Application**: https://upr-web-service-191599223867.us-central1.run.app
- **GCP Console**: https://console.cloud.google.com/run?project=applied-algebra-474804-e6
- **Cloud SQL**: https://console.cloud.google.com/sql/instances?project=applied-algebra-474804-e6
- **Secret Manager**: https://console.cloud.google.com/security/secret-manager?project=applied-algebra-474804-e6

### Support Contacts

- **Development Team**: [Contact information]
- **GCP Support**: https://cloud.google.com/support
- **On-call**: [On-call rotation]

---

## Appendix

### Database Schema Overview

Key tables:
- `companies` - Company master data
- `hr_leads` - Lead tracking
- `agent_decisions` - SIVA tool executions
- `opportunity_lifecycle` - State machine tracking
- `lead_scores` - Composite scoring
- `agents` - Multi-agent registry
- `email_patterns` - Email pattern intelligence
- `voice_templates` - Outreach templates

### Environment Variables Reference

| Variable | Secret Name | Purpose |
|----------|-------------|---------|
| `DATABASE_URL` | `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | `JWT_SECRET` | Token signing secret |
| `UPR_ADMIN_USER` | `UPR_ADMIN_USER` | Admin username |
| `UPR_ADMIN_PASS` | `UPR_ADMIN_PASS` | Admin password |
| `OPENAI_API_KEY` | `OPENAI_API_KEY` | OpenAI API access |
| `APOLLO_API_KEY` | `APOLLO_API_KEY` | Apollo.io API access |
| `SERPAPI_KEY` | `SERPAPI_KEY` | SerpAPI access |
| `REDIS_URL` | `REDIS_URL` | Redis connection string |
| `TENANT_ID` | `TENANT_ID` | Tenant identifier |

### Troubleshooting Decision Tree

```
Service Not Responding
├── Check Health Endpoint
│   ├── 503 Error → Check Cloud Run status
│   ├── Timeout → Check database connectivity
│   └── 500 Error → Check application logs
├── Check Database
│   ├── Connection refused → Verify IP whitelist
│   ├── Too many connections → Check connection pool
│   └── Slow queries → Review query performance
└── Check Resources
    ├── High CPU → Scale up or optimize code
    ├── High Memory → Check for memory leaks
    └── High Latency → Review external API calls
```

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-19
**Next Review**: 2025-12-19
**Maintained By**: DevOps Team
